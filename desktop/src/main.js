const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const { startBridge } = require('./bridge');
const { fetchLyrics, ensureTranslation } = require('./lyrics');

let overlayWindow = null;
let bridge = null;
let latestTrack = null;
let latestLyrics = null;
let displayMode = 'original'; // original | translation | romaji
let fetchToken = 0;

const SETTINGS = {
  width: 340,
  height: 420,
  opacity: 0.94,
};

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { width: sw } = display.workAreaSize;
  const margin = 18;

  overlayWindow = new BrowserWindow({
    width: SETTINGS.width,
    height: SETTINGS.height,
    x: sw - SETTINGS.width - margin,
    y: margin + 12,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    thickFrame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive();
    pushState();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function pushState() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('state', {
    track: latestTrack,
    lyrics: latestLyrics,
    mode: displayMode,
    bridgeClients: bridge?.clientCount() || 0,
  });
}

async function handleNowPlaying(payload) {
  latestTrack = payload;
  pushState();

  if (!payload?.track) {
    latestLyrics = null;
    pushState();
    return;
  }

  const token = ++fetchToken;
  const key = `${payload.artist}::${payload.track}`;

  if (latestLyrics?.key === key) {
    // Same song — only refresh playback position for synced lines.
    latestLyrics = {
      ...latestLyrics,
      currentTime: payload.currentTime || 0,
      isPlaying: Boolean(payload.isPlaying),
    };
    pushState();
    return;
  }

  latestLyrics = {
    key,
    status: 'loading',
    artist: payload.artist,
    track: payload.track,
    currentTime: payload.currentTime || 0,
    isPlaying: Boolean(payload.isPlaying),
  };
  pushState();

  try {
    const result = await fetchLyrics({
      artist: payload.artist,
      track: payload.track,
      duration: payload.duration,
    });

    if (token !== fetchToken) return;

    latestLyrics = {
      key,
      status: result ? 'ready' : 'missing',
      artist: payload.artist,
      track: payload.track,
      currentTime: payload.currentTime || 0,
      isPlaying: Boolean(payload.isPlaying),
      ...result,
    };
  } catch (err) {
    if (token !== fetchToken) return;
    latestLyrics = {
      key,
      status: 'error',
      artist: payload.artist,
      track: payload.track,
      message: err?.message || 'Could not fetch lyrics',
      currentTime: payload.currentTime || 0,
      isPlaying: Boolean(payload.isPlaying),
    };
  }

  pushState();
}

async function applyMode(mode) {
  displayMode = mode;
  pushState();

  if (
    mode !== 'translation' ||
    !latestTrack ||
    latestLyrics?.status !== 'ready' ||
    latestLyrics.translated ||
    !latestLyrics.lines?.length
  ) {
    return;
  }

  const key = latestLyrics.key;
  const snapshot = { ...latestLyrics };
  latestLyrics = { ...snapshot, status: 'loading' };
  pushState();

  try {
    const enriched = await ensureTranslation(
      latestTrack.artist,
      latestTrack.track,
      snapshot
    );
    if (latestLyrics?.key !== key) return;
    latestLyrics = {
      ...snapshot,
      ...enriched,
      status: 'ready',
      key,
      currentTime: latestLyrics.currentTime,
      isPlaying: latestLyrics.isPlaying,
    };
  } catch {
    if (latestLyrics?.key === key) {
      latestLyrics = { ...snapshot, status: 'ready' };
    }
  }

  pushState();
}

function cycleMode() {
  const modes = ['original', 'translation', 'romaji'];
  const idx = modes.indexOf(displayMode);
  applyMode(modes[(idx + 1) % modes.length]);
}

function toggleOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlay();
    return;
  }
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    overlayWindow.showInactive();
  }
}

app.whenReady().then(() => {
  createOverlay();

  bridge = startBridge({
    onNowPlaying: handleNowPlaying,
    onConnectionChange: pushState,
  });

  globalShortcut.register('CommandOrControl+Shift+L', toggleOverlay);
  globalShortcut.register('CommandOrControl+Shift+.', cycleMode);

  ipcMain.on('set-mode', (_event, mode) => {
    if (['original', 'translation', 'romaji'].includes(mode)) {
      applyMode(mode);
    }
  });

  ipcMain.on('close-overlay', () => {
    overlayWindow?.hide();
  });

  ipcMain.on('request-state', () => pushState());
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  bridge?.close();
});

app.on('window-all-closed', () => {
  // Keep the process alive so the Chrome bridge stays up.
});
