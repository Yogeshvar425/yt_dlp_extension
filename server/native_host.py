"""
Native Messaging Host for YT-DLP Extension.
Handles file operations (open, reveal) and server launching
directly — no FastAPI server needed for these actions.
"""
import sys
import json
import struct
import subprocess
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def read_message():
    """Read a native messaging message from stdin."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    length = struct.unpack('=I', raw_length)[0]
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode('utf-8'))

def send_message(msg):
    """Write a native messaging response to stdout."""
    encoded = json.dumps(msg).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def launch_server():
    """Start the FastAPI server if not already running."""
    vbs_path = os.path.join(SCRIPT_DIR, 'start_server.vbs')
    try:
        subprocess.Popen(
            ['wscript', '//nologo', vbs_path],
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def open_file(save_dir, filename):
    """Open a file with the default OS application."""
    filepath = os.path.join(save_dir, filename)
    if not os.path.isfile(filepath):
        return {"ok": False, "error": f"File not found: {filepath}"}
    try:
        os.startfile(filepath)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def reveal_file(save_dir, filename):
    """Open Explorer with the file selected."""
    filepath = os.path.normpath(os.path.join(save_dir, filename))
    if not os.path.isfile(filepath):
        return {"ok": False, "error": f"File not found: {filepath}"}
    try:
        subprocess.Popen(f'explorer /select,"{filepath}"')
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def main():
    msg = read_message()
    if not msg:
        sys.exit(0)

    action = msg.get("action", "")

    if action == "launchServer":
        send_message(launch_server())
    elif action == "openFile":
        send_message(open_file(msg.get("saveDir", ""), msg.get("filename", "")))
    elif action == "revealFile":
        send_message(reveal_file(msg.get("saveDir", ""), msg.get("filename", "")))
    else:
        send_message({"ok": False, "error": f"Unknown action: {action}"})

if __name__ == "__main__":
    main()
