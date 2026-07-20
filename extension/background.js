const PORT = 19283;
const HTTP_BASE = `http://127.0.0.1:${PORT}`;

let latestPayload = null;
let connected = false;
let pollTimer = null;

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

function updateBadge() {
  if (!connected) {
    setBadge('off', '#6b5b4b');
    return;
  }
  if (latestPayload?.isPlaying) {
    setBadge('♪', '#c48a3a');
    return;
  }
  setBadge('on', '#3d7a5a');
}

async function pingDesktop() {
  try {
    const res = await fetch(`${HTTP_BASE}/health`, { method: 'GET' });
    connected = res.ok;
  } catch {
    connected = false;
  }
  updateBadge();
  return connected;
}

async function forwardNowPlaying(payload) {
  latestPayload = payload;

  try {
    const res = await fetch(`${HTTP_BASE}/now-playing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'NOW_PLAYING', payload }),
    });
    connected = res.ok;
  } catch {
    connected = false;
  }

  updateBadge();
  return connected;
}

async function injectIntoYouTubeTabs() {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://www.youtube.com/*', '*://youtube.com/*'],
    });

    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
      } catch {
        // Tab may be a restricted URL or already injecting.
      }
    }
  } catch {
    /* ignore */
  }
}

function startHealthPoll() {
  if (pollTimer) return;
  pingDesktop();
  pollTimer = setInterval(pingDesktop, 3000);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'NOW_PLAYING') {
    forwardNowPlaying(msg.payload).then((ok) => {
      sendResponse({ ok, connected: ok });
    });
    return true;
  }

  if (msg?.type === 'GET_STATUS') {
    pingDesktop().then(() => {
      sendResponse({ connected, latestPayload });
    });
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  updateBadge();
  startHealthPoll();
  await injectIntoYouTubeTabs();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  startHealthPoll();
  injectIntoYouTubeTabs();
});

// Keep the worker a bit more alive while YouTube tabs exist.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !/https?:\/\/(www\.)?youtube\.com\//.test(tab.url)) return;
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  }).catch(() => {});
});

updateBadge();
startHealthPoll();
injectIntoYouTubeTabs();
