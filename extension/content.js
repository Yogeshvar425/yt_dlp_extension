function injectButton() {
    if (document.getElementById('yt-dlp-wrapper')) return;
    if (!location.href.includes('/watch')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'yt-dlp-wrapper';

    const btn = document.createElement('button');
    btn.id = 'yt-dlp-btn';
    btn.title = 'Open Pokédex (yt-dlp)';
    btn.innerHTML = `<div class="pokeball-icon" id="floating-pokeball"></div>`;
    btn.onclick = openModal;

    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);

    checkIfCaught();
}

function getVideoId() {
    return new URLSearchParams(window.location.search).get('v');
}

function getCleanUrl() {
    const url = new URL(window.location.href);
    return url.origin + url.pathname + '?v=' + getVideoId();
}

// ── Caught cache (localStorage) ──────────────────────────────────
// Stores { filename, savedir } keyed by video ID so the green glow
// works even when the server is offline.
function getCaughtCache() {
    try { return JSON.parse(localStorage.getItem('ytDlpCaughtCache') || '{}'); }
    catch { return {}; }
}
function setCaughtCache(videoId, filename, savedir) {
    const cache = getCaughtCache();
    cache[videoId] = { filename, savedir };
    localStorage.setItem('ytDlpCaughtCache', JSON.stringify(cache));
}
function removeCaughtCache(videoId) {
    const cache = getCaughtCache();
    delete cache[videoId];
    localStorage.setItem('ytDlpCaughtCache', JSON.stringify(cache));
}

function applyCaughtUI(ball, filename, savedir) {
    if (!ball) return;
    ball.classList.add('caught');
    ball.dataset.filename = filename || '';
    ball.dataset.savedir = savedir || '';
    ball.parentElement.title = "Target already in Box!";
}
function clearCaughtUI(ball) {
    if (!ball) return;
    ball.classList.remove('caught');
    ball.dataset.filename = '';
    ball.dataset.savedir = '';
    ball.parentElement.title = "Capture";
}

async function checkIfCaught() {
    const v = getVideoId();
    if (!v) return;
    const dir = localStorage.getItem('ytDlpSaveDir') || '';
    if (!dir) return;
    const ball = document.getElementById('floating-pokeball');

    try {
        const res = await fetch(`http://127.0.0.1:8000/check?v=${v}&save_dir=${encodeURIComponent(dir)}`);
        const data = await res.json();
        if (data.downloaded) {
            setCaughtCache(v, data.filename, dir);
            applyCaughtUI(ball, data.filename, dir);
        } else {
            removeCaughtCache(v);
            clearCaughtUI(ball);
        }
    } catch(e) {
        // Server offline — fall back to cache
        const cached = getCaughtCache()[v];
        if (cached) {
            applyCaughtUI(ball, cached.filename, cached.savedir);
        } else {
            clearCaughtUI(ball);
        }
    }
}

// ── Native messaging helper: runs locally, no server needed ──
function nativeAction(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else {
                resolve(response || { ok: false, error: 'No response' });
            }
        });
    });
}

async function openModal() {
    const btn = document.getElementById('yt-dlp-btn');
    const video = document.querySelector('video');

    if (btn && !document.getElementById('yt-dlp-btn-clone')) {
        const bRect = btn.getBoundingClientRect();

        const vCenterX = window.innerWidth / 2;
        const vCenterY = window.innerHeight / 2;
        
        const bCenterX = bRect.left + bRect.width / 2;
        const bCenterY = bRect.top + bRect.height / 2;

        const moveX = vCenterX - bCenterX;
        const moveY = vCenterY - bCenterY;

        const clone = btn.cloneNode(true);
        clone.id = 'yt-dlp-btn-clone';
        clone.style.position = 'fixed';
        clone.style.left = bRect.left + 'px';
        clone.style.top = bRect.top + 'px';
        clone.style.bottom = 'auto';
        clone.style.right = 'auto';
        clone.style.margin = '0';
        clone.style.zIndex = '9999999';
        clone.style.transition = 'all 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
        
        document.body.appendChild(clone);
        btn.style.opacity = '0'; // hide original
        btn.style.pointerEvents = 'none';

        // Reflow
        clone.getBoundingClientRect();

        // Animate (roll to the center, no opacity fade during travel)
        clone.style.transform = `translate(${moveX}px, ${moveY}px) scale(3) rotate(-720deg)`;

        setTimeout(() => {
            // Flash open / vanish as the Pokedex UI takes over
            clone.style.transition = 'opacity 0.1s';
            clone.style.opacity = '0';
            showActualModal(vCenterX, vCenterY);
            setTimeout(() => clone.remove(), 100);
        }, 500);
    } else {
        showActualModal();
    }
}

async function showActualModal(cx, cy) {
    let modal = document.getElementById('yt-dlp-modal');
    if (modal) modal.remove();

    if (!cx) cx = window.innerWidth / 2;
    if (!cy) cy = window.innerHeight / 2;

    const cleanUrl = getCleanUrl();
    const vId = getVideoId();

    modal = document.createElement('div');
    modal.id = 'yt-dlp-modal';
    
    modal.innerHTML = `
        <div class="modal-positioner" style="position: absolute; left: ${cx}px; top: ${cy}px; transform: translate(-50%, -50%);">
            <div class="modal-content">
                <span class="close-btn" id="yt-dlp-close">&times;</span>
                <div class="modal-header">
                <h3>PokéDex Downloader</h3>
            </div>
            
            <div id="yt-dlp-scene" class="capture-scene">
                <div class="giant-pokeball"></div>
                <div id="yt-dlp-status">Capturing target...</div>
            </div>

            <div id="yt-dlp-caught-panel" style="display:none;">
                <div class="dex-screen" style="text-align:center;">
                    <div class="caught-badge">✦ ALREADY IN BOX ✦</div>
                    <p id="yt-dlp-caught-filename" style="color:#aaa; font-size:12px; font-family:monospace; word-break:break-all; margin:10px 0;"></p>
                    <div style="display:flex; gap:10px; justify-content:center; margin-top:15px;">
                        <button id="yt-dlp-open-btn" class="caught-action-btn play-btn">▶ Play File</button>
                        <button id="yt-dlp-reveal-btn" class="caught-action-btn folder-btn">📂 Show in Folder</button>
                    </div>
                </div>
                <div class="caught-divider"><span>or download again</span></div>
            </div>

            <div id="yt-dlp-main-ui">
                <div class="dex-screen">
                    <div style="display: flex; gap: 15px; margin-bottom: 10px; align-items: center;">
                        <img id="yt-dlp-sprite" src="https://i.ytimg.com/vi/${vId}/hqdefault.jpg" style="width: 120px; height: 90px; border: 2px solid #333; border-radius: 5px; object-fit: cover;" />
                        <div style="flex: 1;">
                            <p style="margin: 0; color: #555; font-size: 11px;">TARGET ID: ${vId}</p>
                            <div id="yt-dlp-loading" style="padding: 10px 0; color: #fff; font-size: 12px;">Scanning target data...</div>
                        </div>
                    </div>
                    <div id="yt-dlp-formats" style="display:none;">
                        <label>Video Stream:</label>
                        <select id="yt-dlp-video-select">
                            <option value="none">-- No Video --</option>
                        </select>
                        
                        <label>Audio Stream:</label>
                        <select id="yt-dlp-audio-select">
                            <option value="none">-- No Audio --</option>
                        </select>
                    </div>
                </div>

                <label>Storage PC (Box Path):</label>
                <div class="action-row">
                    <input type="text" id="yt-dlp-save-dir" placeholder="e.g., D:\\PokemonBox" style="margin:0; margin-top:8px; flex:1;" />
                    <button id="yt-dlp-browse-btn">Browse</button>
                </div>
                
                <button id="yt-dlp-start-btn" style="display:none;">THROW POKÉBALL (DL)</button>
                
                <div style="text-align: center; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                    <a href="https://ko-fi.com/Yogeshvar425" target="_blank" style="color: #ffd700; font-size: 11px; text-decoration: none; font-weight: bold; font-family: 'Inter', sans-serif; display: inline-flex; align-items: center; gap: 4px; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">
                        ☕ Support Developer (Buy me a coffee)
                    </a>
                </div>
            </div>
        </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('yt-dlp-close').onclick = () => {
        modal.style.animation = 'fadeOut 0.3s ease-in forwards';
        modal.querySelector('.modal-content').style.animation = 'scaleDown 0.3s ease-in forwards';
        setTimeout(() => {
            modal.remove();
            const btn = document.getElementById('yt-dlp-btn');
            if (btn) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
        }, 250);
    };

    const ball = document.getElementById('floating-pokeball');
    const caughtFilename = ball ? ball.dataset.filename : '';
    const caughtDir = ball ? ball.dataset.savedir : '';
    const isCaught = !!(caughtFilename && caughtDir);
    if (isCaught) {
        const caughtPanel = document.getElementById('yt-dlp-caught-panel');
        caughtPanel.style.display = 'block';
        document.getElementById('yt-dlp-caught-filename').textContent = caughtFilename;

        document.getElementById('yt-dlp-open-btn').onclick = async () => {
            const res = await nativeAction({ action: 'openFile', saveDir: caughtDir, filename: caughtFilename });
            if (!res.ok) alert('Error: ' + (res.error || 'Could not open file'));
        };

        document.getElementById('yt-dlp-reveal-btn').onclick = async () => {
            const res = await nativeAction({ action: 'revealFile', saveDir: caughtDir, filename: caughtFilename });
            if (!res.ok) alert('Error: ' + (res.error || 'Could not reveal file'));
        };
    }

    // Load saved dir
    const savedDir = localStorage.getItem('ytDlpSaveDir') || '';
    const dirInput = document.getElementById('yt-dlp-save-dir');
    dirInput.value = savedDir;
    
    dirInput.addEventListener('change', () => {
        localStorage.setItem('ytDlpSaveDir', dirInput.value);
        checkIfCaught(); // recheck
    });

    // Browse Button
    document.getElementById('yt-dlp-browse-btn').onclick = async () => {
        const btn = document.getElementById('yt-dlp-browse-btn');
        btn.innerText = '...';
        try {
            const bRes = await fetch('http://127.0.0.1:8000/browse');
            const bData = await bRes.json();
            if (bData.path) {
                document.getElementById('yt-dlp-save-dir').value = bData.path;
                localStorage.setItem('ytDlpSaveDir', bData.path);
                checkIfCaught();
            }
        } catch (e) {
            alert('Dex error: ' + e.message);
        }
        btn.innerText = 'Browse';
    };

    if (isCaught) {
        // Already downloaded - show "Scan Formats" button instead of scanning automatically
        const loadingEl = document.getElementById('yt-dlp-loading');
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="text-align: center;">
                    <button id="yt-dlp-scan-btn" class="caught-action-btn scan-btn" style="width: 100%;">
                        🔍 Scan Formats (Starts Server)
                    </button>
                </div>
            `;
            document.getElementById('yt-dlp-scan-btn').onclick = () => {
                fetchAndPopulateFormats(cleanUrl, cx, cy);
            };
        }
    } else {
        // Fetch formats immediately
        fetchAndPopulateFormats(cleanUrl, cx, cy);
    }
}

async function fetchAndPopulateFormats(cleanUrl, cx, cy) {
    const loadingEl = document.getElementById('yt-dlp-loading');
    if (loadingEl) {
        loadingEl.style.display = 'block';
        loadingEl.innerHTML = 'Scanning target data...';
    }
    
    try {
        const res = await fetch(`http://127.0.0.1:8000/formats?url=${encodeURIComponent(cleanUrl)}`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        const loadingDiv = document.getElementById('yt-dlp-loading');
        if (loadingDiv) loadingDiv.style.display = 'none';
        
        const formatsDiv = document.getElementById('yt-dlp-formats');
        if (formatsDiv) formatsDiv.style.display = 'block';
        
        const startBtn = document.getElementById('yt-dlp-start-btn');
        if (startBtn) startBtn.style.display = 'block';

        const videoSelect = document.getElementById('yt-dlp-video-select');
        const audioSelect = document.getElementById('yt-dlp-audio-select');

        if (!videoSelect || !audioSelect || !startBtn) return;

        // Reset options to avoid duplicates if scanned multiple times
        videoSelect.innerHTML = '<option value="none">-- No Video --</option>';
        audioSelect.innerHTML = '<option value="none">-- No Audio --</option>';

        let hasCombined = false;
        if (data.combined && data.combined.length > 0) {
            const group = document.createElement('optgroup');
            group.label = "Combined (Video + Audio)";
            data.combined.forEach(f => {
                group.innerHTML += `<option value="${f.format_id}">[${f.ext}] ${f.resolution} ${f.fps}fps - ${formatBytes(f.filesize)}</option>`;
            });
            videoSelect.appendChild(group);
            hasCombined = true;
        }

        if (data.video_only && data.video_only.length > 0) {
            const group = document.createElement('optgroup');
            group.label = "Video Only";
            data.video_only.forEach(f => {
                group.innerHTML += `<option value="${f.format_id}">[${f.ext}] ${f.resolution} ${f.fps}fps - ${formatBytes(f.filesize)}</option>`;
            });
            videoSelect.appendChild(group);
        }

        if (!hasCombined && data.video_only && data.video_only.length > 0) {
            videoSelect.selectedIndex = 1;
        }

        if (data.audio_only && data.audio_only.length > 0) {
            data.audio_only.forEach(f => {
                audioSelect.innerHTML += `<option value="${f.format_id}">[${f.ext}] ${f.note} - ${formatBytes(f.filesize)}</option>`;
            });
            audioSelect.selectedIndex = 1;
        }

        startBtn.onclick = () => {
            const v = videoSelect.value;
            const a = audioSelect.value;
            const dirInput = document.getElementById('yt-dlp-save-dir');
            const dir = dirInput ? dirInput.value.trim() : '';
            
            if (dir) localStorage.setItem('ytDlpSaveDir', dir);
            
            let formatStr = '';
            if (v !== 'none' && a !== 'none') formatStr = `${v}+${a}`;
            else if (v !== 'none') formatStr = v;
            else if (a !== 'none') formatStr = a;
            else {
                alert("Please select at least one stream!");
                return;
            }

            // Animate
            document.getElementById('yt-dlp-main-ui').style.display = 'none';
            const scene = document.getElementById('yt-dlp-scene');
            scene.style.display = 'block';
            setTimeout(() => scene.classList.add('active'), 50);

            startDownload(cleanUrl, formatStr, dir);
        };

    } catch (e) {
        if (e.name === 'TypeError') {
            // Server is likely offline — silently launch via native messaging
            const loadingEl = document.getElementById('yt-dlp-loading');
            
            // Ask the background service worker to launch the server
            chrome.runtime.sendMessage({ action: "launchServer" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("Native launch failed:", chrome.runtime.lastError.message);
                }
            });

            // Retry with countdown
            const maxRetries = 6;
            const retryInterval = 3000; // 3 seconds between retries
            let attempt = 0;

            const tryConnect = async () => {
                attempt++;
                const remaining = (maxRetries - attempt) * (retryInterval / 1000);
                if (loadingEl) {
                    loadingEl.innerHTML = `
                        <span style="color: #ffd700;">Starting server...</span><br>
                        <span style="font-size: 10px; color: #aaa;">Connecting ${attempt}/${maxRetries}... (~${remaining}s remaining)</span>
                    `;
                }
                try {
                    const testRes = await fetch('http://127.0.0.1:8000/check?v=test&save_dir=.', { signal: AbortSignal.timeout(2500) });
                    if (testRes.ok) {
                        // Server is up! Fetch formats again
                        fetchAndPopulateFormats(cleanUrl, cx, cy);
                        return;
                    }
                } catch (_) { /* still offline */ }

                if (attempt < maxRetries) {
                    setTimeout(tryConnect, retryInterval);
                } else {
                    if (loadingEl) {
                        loadingEl.innerHTML = `
                            <span style="color: #ff4757;">Could not connect to YT-DLP server.</span><br>
                            <span style="font-size: 10px;">Run <b>start_background.bat</b> manually from the<br>
                            <code style="color: #ffd700; font-size: 10px;">server/</code> folder in your extension directory.</span>
                        `;
                    }
                }
            };

            // First retry after 3s to give server time to boot
            setTimeout(tryConnect, retryInterval);
        } else {
            const loadingEl = document.getElementById('yt-dlp-loading');
            if (loadingEl) {
                loadingEl.innerText = 'Connection to PC failed! ' + e.message;
            }
        }
    }
}

function formatBytes(bytes) {
    if (!bytes) return 'Unknown';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function startDownload(url, format, save_dir) {
    const statusDiv = document.getElementById('yt-dlp-status');
    const ball = document.querySelector('.giant-pokeball');
    
    statusDiv.style.color = '#fff';
    statusDiv.innerText = 'Throwing Pokéball...';
    
    try {
        const ws = new WebSocket('ws://127.0.0.1:8000/ws/download');
        
        ws.onopen = () => {
            const payload = { url, format };
            if (save_dir) payload.save_dir = save_dir;
            ws.send(JSON.stringify(payload));
            statusDiv.innerText = 'Connected! Capturing target...';
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.status === 'downloading') {
                statusDiv.innerText = `Capturing... ${data.percent}%`;
                if (ball) {
                    const speed = Math.max(0.2, 2.5 - (data.percent / 45));
                    ball.style.animation = `wiggle ${speed}s ease-in-out infinite`;
                }
            } else if (data.status === 'finished') {
                ws.close();
                statusDiv.style.color = '#4cd137';
                statusDiv.innerText = 'Gotcha! Target was caught!';
                if (ball) {
                    ball.style.animation = 'none';
                    ball.style.boxShadow = '0 0 30px #4cd137, inset -6px -6px 15px rgba(0,0,0,0.3)';
                }
                // Cache immediately so the glow persists even if server shuts down
                const vId = getVideoId();
                if (vId) setCaughtCache(vId, '', save_dir);
                setTimeout(() => {
                    const modal = document.getElementById('yt-dlp-modal');
                    if (modal) {
                        modal.style.animation = 'fadeOut 0.3s ease-in forwards';
                        modal.querySelector('.modal-content').style.animation = 'scaleDown 0.3s ease-in forwards';
                        setTimeout(() => {
                            modal.remove();
                            const btn = document.getElementById('yt-dlp-btn');
                            if (btn) {
                                btn.style.opacity = '1';
                                btn.style.pointerEvents = 'auto';
                            }
                        }, 250);
                    }
                    checkIfCaught();
                }, 3000);
            } else if (data.status === 'error') {
                ws.close();
                statusDiv.style.color = '#ff4757';
                statusDiv.innerText = 'It broke free! ' + (data.message || 'Error');
                if (ball) ball.style.animation = 'none';
            }
        };
        
        ws.onerror = () => {
            statusDiv.style.color = '#ff4757';
            statusDiv.innerText = 'Connection lost!';
            if (ball) ball.style.animation = 'none';
        };

        const closeBtn = document.getElementById('yt-dlp-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (ws.readyState === WebSocket.OPEN) ws.close();
            });
        }

    } catch(e) {
        statusDiv.style.color = '#ff4757';
        statusDiv.innerText = 'It broke free! ' + e.message;
    }
}

let lastUrl = location.href;
let _navTimer = null;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;

        // Debounce — only react once per navigation, not on every DOM mutation
        if (_navTimer) clearTimeout(_navTimer);

        _navTimer = setTimeout(() => {
            _navTimer = null;

            if (url.includes('/watch')) {
                // Clean up any stale modal / clone from the previous video
                const staleModal = document.getElementById('yt-dlp-modal');
                if (staleModal) staleModal.remove();
                const staleClone = document.getElementById('yt-dlp-btn-clone');
                if (staleClone) staleClone.remove();

                const btn = document.getElementById('yt-dlp-btn');
                if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }

                // Ensure the button exists, then refresh caught status for the NEW video
                injectButton();
                checkIfCaught();
            } else {
                const wrap = document.getElementById('yt-dlp-wrapper');
                if (wrap) wrap.remove();
            }
        }, 1500);
    }
}).observe(document, {subtree: true, childList: true});

setTimeout(injectButton, 1500);

