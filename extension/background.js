// background.js — Service worker for YT-DLP extension
// Uses Chrome Native Messaging to handle:
//   - launchServer: silently start the FastAPI backend
//   - openFile:     open a local file (no server needed)
//   - revealFile:   show file in Explorer (no server needed)

const NATIVE_HOST = "com.ytdlp.server";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const action = message.action;
    if (!action) return;

    if (action === "launchServer" || action === "openFile" || action === "revealFile") {
        try {
            const port = chrome.runtime.connectNative(NATIVE_HOST);
            let responded = false;

            port.onMessage.addListener((response) => {
                if (!responded) {
                    responded = true;
                    sendResponse(response);
                }
                port.disconnect();
            });

            port.onDisconnect.addListener(() => {
                if (!responded) {
                    responded = true;
                    const err = chrome.runtime.lastError;
                    sendResponse({ ok: false, error: err ? err.message : "Native host disconnected" });
                }
            });

            if (action === "launchServer") {
                const token = self.crypto.randomUUID ? self.crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
                chrome.storage.local.set({ apiToken: token }, () => {
                    message.token = token;
                    port.postMessage(message);
                });
            } else {
                // Send the message directly for other actions (openFile, revealFile)
                port.postMessage(message);
            }

        } catch (e) {
            console.error("Failed to launch native host:", e);
            sendResponse({ ok: false, error: e.message });
        }
        return true; // keep sendResponse channel open for async
    }
});
