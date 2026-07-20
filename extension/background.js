const PORT = 19283;
const WS_URL = `ws://127.0.0.1:${PORT}`;

let socket = null;
let reconnectTimer = null;
let latestPayload = null;
let connected = false;

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

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(WS_URL);
  } catch {
    connected = false;
    updateBadge();
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => {
    connected = true;
    updateBadge();
    if (latestPayload) {
      socket.send(JSON.stringify({ type: 'NOW_PLAYING', payload: latestPayload }));
    }
  });

  socket.addEventListener('close', () => {
    connected = false;
    updateBadge();
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    connected = false;
    updateBadge();
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 2000);
}

function forwardNowPlaying(payload) {
  latestPayload = payload;
  updateBadge();

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connect();
    return;
  }

  socket.send(JSON.stringify({ type: 'NOW_PLAYING', payload }));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'NOW_PLAYING') {
    forwardNowPlaying(msg.payload);
    sendResponse({ ok: true, connected });
    return true;
  }

  if (msg?.type === 'GET_STATUS') {
    sendResponse({
      connected,
      latestPayload,
    });
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  connect();
});

updateBadge();
connect();
