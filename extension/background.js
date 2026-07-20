const PORT = 19283;
const HTTP_BASE = `http://127.0.0.1:${PORT}`;

let connected = false;

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

async function post(path, body) {
  try {
    const res = await fetch(`${HTTP_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    connected = res.ok;
  } catch {
    connected = false;
  }
  setBadge(connected ? '♪' : 'off', connected ? '#c48a3a' : '#6b5b4b');
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
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PLAYBACK_TIME') {
    post('/playback', { type: 'PLAYBACK_TIME', payload: msg.payload }).then((ok) => {
      sendResponse({ ok });
    });
    return true;
  }

  if (msg?.type === 'GET_STATUS') {
    sendResponse({ connected });
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  setBadge('off', '#6b5b4b');
  injectIntoYouTubeTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !/https?:\/\/(www\.)?youtube\.com\//.test(tab.url)) return;
  chrome.scripting
    .executeScript({ target: { tabId }, files: ['content.js'] })
    .catch(() => {});
});

injectIntoYouTubeTabs();
