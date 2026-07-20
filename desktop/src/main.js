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
const { createPlaybackClock } = require('./playback-clock');

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
let syncTimer = null;
const clock = createPlaybackClock();

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

  const currentTime = clock.now();
  if (latestLyrics) {
    latestLyrics = {
      ...latestLyrics,
      currentTime,
      isPlaying: latestTrack?.isPlaying,
      duration: clock.getDuration() || latestLyrics.duration || latestTrack?.duration || 0,
    };
  }

  overlayWindow.webContents.send('state', {
    track: latestTrack,
    lyrics: latestLyrics,
    mode: displayMode,
    bridgeClients: clock.hasFreshExtension() || bridge?.isLinked?.() ? 1 : 0,
    translating,
  });
}

function applyTiming(partial) {
  clock.sync(partial);
  if (latestTrack) {
    latestTrack = {
      ...latestTrack,
      currentTime: clock.now(),
      isPlaying:
        typeof partial.isPlaying === 'boolean' &&
        (partial.source === 'extension' || !clock.hasFreshExtension())
          ? partial.isPlaying
          : latestTrack.isPlaying,
      duration: clock.getDuration() || latestTrack.duration || 0,
    };
  }
  pushState();
}

function handlePlayback(payload) {
  if (!payload) return;
  mediaLinked = true;
  applyTiming({
    currentTime: payload.currentTime,
    isPlaying: payload.isPlaying,
    duration: payload.duration,
    source: 'extension',
  });
}

async function handleNowPlaying(payload) {
  mediaLinked = Boolean(payload?.track);

  if (!payload?.track) {
    latestTrack = null;
    latestLyrics = null;
    clock.reset();
    pushState();
    return;
  }

  const token = ++fetchToken;
  const key = `${payload.artist}::${payload.track}`;
  const sameSong = latestLyrics?.key === key;
  const source =
    payload.source === 'youtube-extension' ? 'extension' : 'windows';

  latestTrack = {
    ...(latestTrack || {}),
    ...payload,
    currentTime: sameSong ? clock.now() : payload.currentTime || 0,
  };

  if (sameSong) {
    applyTiming({
      currentTime: payload.currentTime,
      isPlaying: payload.isPlaying,
      duration: payload.duration,
      source,
    });
    return;
  }

  clock.reset();
  clock.sync({
    currentTime: payload.currentTime || 0,
    isPlaying: Boolean(payload.isPlaying),
    duration: payload.duration || 0,
    source,
  });

  latestLyrics = {
    key,
    status: 'loading',
    artist: payload.artist,
    track: payload.track,
    currentTime: clock.now(),
    isPlaying: Boolean(payload.isPlaying),
  };
  pushState();

  try {
    const result = await fetchLyrics({
      artist: payload.artist,
      track: payload.track,
      duration: payload.duration || clock.getDuration(),
    });

    if (token !== fetchToken) return;

    latestLyrics = {
      key,
      status: result ? 'ready' : 'missing',
      artist: payload.artist,
      track: payload.track,
      currentTime: clock.now(),
      isPlaying: Boolean(payload.isPlaying),
      duration: result?.duration || payload.duration || 0,
      ...result,
    };

    if (result?.duration) {
      clock.sync({ duration: result.duration });
    }

    if (result?.resolvedArtist || result?.resolvedTrack) {
      latestTrack = {
        ...latestTrack,
        artist: result.resolvedArtist || latestTrack.artist,
        track: shortTrackName(result.resolvedTrack || latestTrack.track),
        title: `${result.resolvedArtist || latestTrack.artist} - ${shortTrackName(
          result.resolvedTrack || latestTrack.track
        )}`,
      };
    }

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
      currentTime: clock.now(),
      isPlaying: Boolean(payload.isPlaying),
    };
  }

  pushState();
}

function shortTrackName(track) {
  const cleaned = String(track || '').replace(/\s{2,}/g, ' ').trim();
  // LRCLIB sometimes returns "Album - Album - 02 - Song"
  const parts = cleaned.split(/\s*-\s*/);
  if (parts.length >= 3) return parts[parts.length - 1].trim() || cleaned;
  return cleaned;
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

  // Song identity from Windows; precise playhead from the Chrome extension.
  mediaWatch = startMediaWatch({
    onNowPlaying: handleNowPlaying,
    intervalMs: 1500,
  });

  bridge = startBridge({
    onNowPlaying: handleNowPlaying,
    onPlayback: handlePlayback,
    onConnectionChange: pushState,
  });

  // Smooth lyric scrolling between timing updates.
  syncTimer = setInterval(() => {
    if (latestTrack?.isPlaying || clock.now() > 0) pushState();
  }, 250);

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
  if (syncTimer) clearInterval(syncTimer);
});

app.on('window-all-closed', () => {
  // Stay alive for tray + media watch.
});
