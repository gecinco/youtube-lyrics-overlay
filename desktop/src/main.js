const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
} = require('electron');
const path = require('path');
const { startBridge } = require('./bridge');
const { startMediaWatch } = require('./media-watch');
const { fetchLyrics, ensureTranslation } = require('./lyrics');
const { loadPrefs, savePrefs } = require('./store');

let overlayWindow = null;
let tray = null;
let bridge = null;
let mediaWatch = null;
let latestTrack = null;
let latestLyrics = null;
let displayMode = 'original';
let fetchToken = 0;
let translating = false;
let mediaLinked = false;

const SETTINGS = {
  width: 340,
  height: 420,
};

function iconPath(name) {
  // Works in dev and inside the packaged exe.
  const candidates = [
    path.join(__dirname, '..', 'assets', name),
    path.join(__dirname, '..', '..', 'extension', 'icons', name),
    path.join(process.resourcesPath || '', 'assets', name),
  ];
  return candidates.find((p) => {
    try {
      return require('fs').existsSync(p);
    } catch {
      return false;
    }
  });
}

function defaultBounds() {
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: SETTINGS.width,
    height: SETTINGS.height,
    x: sw - SETTINGS.width - 18,
    y: 30,
  };
}

function createOverlay() {
  const prefs = loadPrefs();
  const bounds = prefs.bounds || defaultBounds();
  displayMode = prefs.mode || 'original';

  overlayWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
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

  const persistBounds = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    savePrefs({ bounds: overlayWindow.getBounds() });
  };

  overlayWindow.on('moved', persistBounds);
  overlayWindow.on('resized', persistBounds);

  overlayWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      overlayWindow.hide();
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function createTray() {
  const file = iconPath('icon16.png');
  let image = file ? nativeImage.createFromPath(file) : nativeImage.createEmpty();

  tray = new Tray(image);
  tray.setToolTip('YouTube Lyrics Overlay');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show overlay',
      click: () => {
        if (!overlayWindow) createOverlay();
        overlayWindow?.showInactive();
      },
    },
    {
      label: 'Hide overlay',
      click: () => overlayWindow?.hide(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => toggleOverlay());
}

function pushState() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('state', {
    track: latestTrack,
    lyrics: latestLyrics,
    mode: displayMode,
    bridgeClients: mediaLinked || bridge?.isLinked?.() ? 1 : 0,
    translating,
  });
}

async function handleNowPlaying(payload) {
  mediaLinked = Boolean(payload?.track);
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

    if (displayMode === 'translation' && latestLyrics.status === 'ready') {
      await applyMode('translation');
      return;
    }
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
  savePrefs({ mode });
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
  translating = true;
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
  } finally {
    translating = false;
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
  createTray();

  // Primary path on Windows: read Chrome/YouTube from the OS. No extension needed.
  mediaWatch = startMediaWatch({
    onNowPlaying: handleNowPlaying,
    intervalMs: 1200,
  });

  // Optional legacy bridge if someone still uses the extension.
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
  mediaWatch?.stop();
  bridge?.close();
});

app.on('window-all-closed', () => {
  // Stay alive for tray + media watch.
});
