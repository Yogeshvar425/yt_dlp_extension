import subprocess
import json
import tkinter as tk
from tkinter import filedialog
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
import os
import asyncio
import re
import time
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from typing import Optional
from pydantic import BaseModel

import argparse
from fastapi.responses import JSONResponse

# Parse token argument if present
parser = argparse.ArgumentParser()
parser.add_argument("--token", type=str, default="")
args, unknown = parser.parse_known_args()
SECURE_TOKEN = args.token

# ── Auto-shutdown config ──────────────────────────────────────────
IDLE_TIMEOUT_SECONDS = 120  # 2 minutes of no activity → shutdown
_last_activity = time.time()

# ── Lifespan: start background tasks on boot ─────────────────────
@asynccontextmanager
async def lifespan(app):
    asyncio.create_task(_idle_watchdog())
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Token verification middleware ─────────────────────────────────
@app.middleware("http")
async def verify_token_middleware(request: Request, call_next):
    # OPTIONS (CORS preflight) and /ping do not require authentication.
    # If SECURE_TOKEN is empty (e.g. manual CLI start), authentication is disabled.
    if request.method == "OPTIONS" or request.url.path == "/ping" or not SECURE_TOKEN:
        return await call_next(request)
        
    token = request.headers.get("X-API-Token")
    if token != SECURE_TOKEN:
        return JSONResponse({"error": "Unauthorized: Invalid API Token"}, status_code=403)
        
    return await call_next(request)

# ── Middleware: track last activity on every request ──────────────
@app.middleware("http")
async def track_activity(request: Request, call_next):
    global _last_activity
    _last_activity = time.time()
    response = await call_next(request)
    return response

class DownloadRequest(BaseModel):
    url: str
    format: str
    save_dir: Optional[str] = None

@app.get("/browse")
def browse_directory():
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        folder_path = filedialog.askdirectory(parent=root, title="Select Save Directory")
        root.destroy()
        return {"path": folder_path}
    except Exception as e:
        return {"error": str(e)}

@app.get("/check")
def check_downloaded(v: str, save_dir: str):
    try:
        if not save_dir or not os.path.isdir(save_dir):
            return {"downloaded": False}
        
        # Check files in save_dir
        for f in os.listdir(save_dir):
            if f"[{v}]" in f: # default yt-dlp appends [ID] to filename
                return {"downloaded": True, "filename": f}
        return {"downloaded": False}
    except Exception as e:
        return {"error": str(e)}

@app.get("/formats")
def get_formats(url: str):
    try:
        result = subprocess.run(
            ["yt-dlp", "-J", url],
            capture_output=True,
            text=True,
            check=True
        )
        info = json.loads(result.stdout)
        formats = info.get("formats", [])
        
        video_only = []
        audio_only = []
        combined = []
        
        for f in formats:
            has_video = f.get("vcodec") != "none"
            has_audio = f.get("acodec") != "none"
            
            item = {
                "format_id": f.get("format_id"),
                "ext": f.get("ext"),
                "resolution": f.get("resolution") or f.get("format_note", ""),
                "note": f.get("format_note", ""),
                "fps": f.get("fps", ""),
                "vcodec": f.get("vcodec", "none"),
                "acodec": f.get("acodec", "none"),
                "filesize": f.get("filesize") or f.get("filesize_approx") or 0
            }
            
            if has_video and has_audio:
                combined.append(item)
            elif has_video:
                video_only.append(item)
            elif has_audio:
                audio_only.append(item)
                
        combined.sort(key=lambda x: x["filesize"], reverse=True)
        video_only.sort(key=lambda x: x["filesize"], reverse=True)
        audio_only.sort(key=lambda x: x["filesize"], reverse=True)

        return {
            "title": info.get("title"),
            "combined": combined,
            "video_only": video_only,
            "audio_only": audio_only
        }
    except subprocess.CalledProcessError as e:
        return {"error": f"yt-dlp error: {e.stderr}"}
    except Exception as e:
        return {"error": str(e)}

@app.websocket("/ws/download")
async def websocket_download(websocket: WebSocket):
    global _last_activity
    
    # Verify secure token in query params
    token = websocket.query_params.get("token")
    if SECURE_TOKEN and token != SECURE_TOKEN:
        await websocket.accept()
        await websocket.close(code=4003)
        return
        
    await websocket.accept()
    process = None
    try:
        data = await websocket.receive_text()
        _last_activity = time.time()  # WebSocket activity
        req_data = json.loads(data)
        
        cmd_parts = ['yt-dlp', '-f', req_data.get('format', 'best'), '--embed-metadata', '--embed-thumbnail', '--newline']
        
        if 'save_dir' in req_data and req_data['save_dir']:
            safe_dir = req_data['save_dir'].replace('\\', '/')
            cmd_parts.extend(['-P', safe_dir])
            
        cmd_parts.append(req_data['url'])
        
        process = await asyncio.create_subprocess_exec(
            *cmd_parts,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            _last_activity = time.time()  # Keep alive during download
            line_str = line.decode('utf-8', errors='replace').strip()
            
            match = re.search(r'\[download\]\s+(\d+\.\d+)%', line_str)
            if match:
                pct = match.group(1)
                await websocket.send_json({"status": "downloading", "percent": float(pct)})
            elif "ERROR" in line_str:
                await websocket.send_json({"status": "error", "message": line_str})
                
        await process.wait()
        
        if process.returncode == 0:
            await websocket.send_json({"status": "finished"})
        else:
            await websocket.send_json({"status": "error", "message": f"Exited with code {process.returncode}"})
            
    except WebSocketDisconnect:
        print("Client disconnected, cleaning up process.")
    except Exception as e:
        try:
            await websocket.send_json({"status": "error", "message": str(e)})
        except:
            pass
    finally:
        if process and process.returncode is None:
            try:
                process.kill()
            except Exception:
                pass

@app.get("/open")
def open_file(save_dir: str, filename: str):
    """Open the downloaded file with the OS default application."""
    try:
        filepath = os.path.join(save_dir, filename)
        if not os.path.isfile(filepath):
            return {"error": "File not found", "path": filepath}
        os.startfile(filepath)
        return {"success": True, "path": filepath}
    except Exception as e:
        return {"error": str(e)}

@app.get("/reveal")
def reveal_in_explorer(save_dir: str, filename: str):
    """Open Explorer with the file selected."""
    try:
        filepath = os.path.normpath(os.path.join(save_dir, filename))
        if not os.path.isfile(filepath):
            return {"error": "File not found", "path": filepath}
        subprocess.Popen(f'explorer /select,"{filepath}"', creationflags=subprocess.CREATE_NO_WINDOW)
        return {"success": True, "path": filepath}
    except Exception as e:
        return {"error": str(e)}

@app.get("/ping")
def ping():
    """Lightweight keep-alive endpoint for the extension to poke."""
    return {"status": "alive"}

@app.post("/shutdown")
def shutdown():
    """Gracefully shut down the server."""
    os._exit(0)

# ── Auto-shutdown watchdog ────────────────────────────────────────
async def _idle_watchdog():
    """Background task that shuts the server down after IDLE_TIMEOUT_SECONDS of inactivity."""
    while True:
        await asyncio.sleep(30)  # check every 30 seconds
        idle = time.time() - _last_activity
        if idle >= IDLE_TIMEOUT_SECONDS:
            print(f"Server idle for {int(idle)}s — auto-shutting down.")
            os._exit(0)



if __name__ == "__main__":
    print("YT-DLP Background Server Running on http://127.0.0.1:8000")
    print(f"Auto-shutdown after {IDLE_TIMEOUT_SECONDS}s of inactivity.")
    uvicorn.run(app, host="127.0.0.1", port=8000)
