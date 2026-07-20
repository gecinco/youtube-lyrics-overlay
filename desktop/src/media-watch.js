const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function resolveScript() {
  const candidates = [
    path.join(__dirname, 'media-watch.ps1'),
    path.join(process.resourcesPath || '', 'media-watch.ps1'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'src', 'media-watch.ps1'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\s*[-–—]\s*YouTube\s*$/i, '')
    .replace(/\s*\(\s*Official\s*(Music\s*)?Video\s*\)/gi, '')
    .replace(/\s*\[\s*Official\s*(Music\s*)?Video\s*\]/gi, '')
    .replace(/\s*\(\s*Lyric\s*Video\s*\)/gi, '')
    .replace(/\s*\[\s*Lyric\s*Video\s*\]/gi, '')
    .replace(/\s*\(\s*Official\s*Audio\s*\)/gi, '')
    .replace(/\s*\[\s*Official\s*Audio\s*\]/gi, '')
    .replace(/\s*\(\s*\d{4}\s*Remaster(?:ed)?\s*\)/gi, '')
    .replace(/\s*\[\s*\d{4}\s*Remaster(?:ed)?\s*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseArtistAndTrack(title, fallbackArtist = '') {
  const cleaned = cleanTitle(title);
  const separators = [' - ', ' – ', ' — ', ' | '];

  for (const sep of separators) {
    if (!cleaned.includes(sep)) continue;
    const [left, ...rest] = cleaned.split(sep);
    const right = rest.join(sep).trim();
    if (left && right) {
      // Prefer "Artist - Track" (YouTube official uploads).
      return { artist: left.trim(), track: right.trim() };
    }
  }

  return {
    artist: fallbackArtist || 'Unknown Artist',
    track: cleaned || 'Unknown Track',
  };
}

function runPowershell(scriptPath) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
      ],
      {
        windowsHide: true,
        timeout: 4000,
        maxBuffer: 1024 * 1024,
      },
      (err, stdout) => {
        if (err || !stdout?.trim()) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

async function readNowPlaying() {
  const script = resolveScript();
  if (!fs.existsSync(script)) {
    console.error('[media-watch] script missing:', script);
    return null;
  }

  const data = await runPowershell(script);
  if (!data) return null;

  const windowTitle = data.windowTitle || '';
  const smtcTitle = data.smtcTitle || '';
  const smtcArtist = data.smtcArtist || '';
  const appId = String(data.appId || '').toLowerCase();

  const fromYoutubeWindow = /youtube/i.test(windowTitle);
  const fromYoutubeSmtc =
    appId.includes('chrome') ||
    appId.includes('msedge') ||
    appId.includes('brave') ||
    /youtube/i.test(smtcTitle);

  if (!fromYoutubeWindow && !fromYoutubeSmtc && !windowTitle && !smtcTitle) {
    return null;
  }

  // Prefer SMTC when it looks like a real track; fall back to Chrome window title.
  let title = '';
  let artist = '';

  if (smtcTitle && (fromYoutubeSmtc || fromYoutubeWindow)) {
    title = smtcTitle;
    artist = smtcArtist;
  } else if (fromYoutubeWindow) {
    title = cleanTitle(windowTitle);
  } else {
    return null;
  }

  const parsed = parseArtistAndTrack(title, artist);
  if (artist && (!title.includes(' - ') && !title.includes(' – '))) {
    parsed.artist = artist;
    parsed.track = cleanTitle(title);
  }

  const isPlaying =
    String(data.status || '').toLowerCase() === 'playing' ||
    Boolean(fromYoutubeWindow);

  return {
    source: 'windows',
    videoId: '',
    url: '',
    title: title || `${parsed.artist} - ${parsed.track}`,
    artist: parsed.artist,
    track: parsed.track,
    channel: artist || parsed.artist,
    isPlaying,
    currentTime: Number(data.position) || 0,
    duration: Number(data.duration) || 0,
    updatedAt: Date.now(),
  };
}

function startMediaWatch({ onNowPlaying, intervalMs = 1200 }) {
  let stopped = false;
  let timer = null;
  let lastKey = '';

  const tick = async () => {
    if (stopped) return;
    try {
      const payload = await readNowPlaying();
      const key = payload
        ? [
            payload.artist,
            payload.track,
            payload.isPlaying ? '1' : '0',
            Math.floor(payload.currentTime || 0),
          ].join('|')
        : '';

      if (key !== lastKey) {
        lastKey = key;
        onNowPlaying?.(payload);
      } else if (payload) {
        // Still push time updates for synced lyrics.
        onNowPlaying?.(payload);
      }
    } catch (err) {
      console.error('[media-watch]', err.message);
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  };

  tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

module.exports = { startMediaWatch, readNowPlaying };
