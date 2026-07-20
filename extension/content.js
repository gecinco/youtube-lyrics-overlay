(() => {
  // Avoid double-inject when background re-injects into an open tab.
  if (window.__lyricsOverlayLoaded) return;
  window.__lyricsOverlayLoaded = true;

  const BRIDGE = 'lyrics-overlay';
  let lastFingerprint = '';
  let tickTimer = null;
  let boundVideo = null;

  function textOf(selector) {
    const el = document.querySelector(selector);
    return el?.textContent?.trim() || '';
  }

  function cleanTitle(raw) {
    return raw
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

  function parseArtistAndTrack(title, channel) {
    const cleaned = cleanTitle(title);
    const separators = [' - ', ' – ', ' — ', ' | '];

    for (const sep of separators) {
      if (!cleaned.includes(sep)) continue;
      const [left, ...rest] = cleaned.split(sep);
      const right = rest.join(sep).trim();
      if (left && right) {
        if (channel && right.toLowerCase().includes(channel.toLowerCase().slice(0, 12))) {
          return { artist: right, track: left };
        }
        if (channel && left.toLowerCase().includes(channel.toLowerCase().slice(0, 12))) {
          return { artist: left, track: right };
        }
        // "Fear of the Dark (2015 Remaster)" with channel Iron Maiden → artist = channel
        return { artist: left, track: right };
      }
    }

    return {
      artist: channel || 'Unknown Artist',
      track: cleaned || 'Unknown Track',
    };
  }

  function getVideoId() {
    try {
      return new URL(location.href).searchParams.get('v') || '';
    } catch {
      return '';
    }
  }

  function getPlayer() {
    return document.querySelector('video.html5-main-video') || document.querySelector('video');
  }

  function readNowPlaying() {
    if (!location.pathname.startsWith('/watch')) return null;

    const videoId = getVideoId();
    if (!videoId) return null;

    const player = getPlayer();
    const pageTitle = cleanTitle(document.title || '');
    const heading =
      textOf('h1.ytd-watch-metadata yt-formatted-string') ||
      textOf('h1 yt-formatted-string') ||
      textOf('ytd-watch-metadata h1') ||
      pageTitle;
    const channel =
      textOf('#channel-name a') ||
      textOf('ytd-channel-name a') ||
      textOf('#owner #channel-name a') ||
      textOf('ytd-video-owner-renderer a') ||
      '';

    let { artist, track } = parseArtistAndTrack(heading || pageTitle, channel);

    // Titles without "Artist - Track" (common on official channels).
    if ((!heading.includes(' - ') && !heading.includes(' – ')) && channel) {
      artist = channel.replace(/VEVO$/i, '').trim() || artist;
      track = cleanTitle(heading || pageTitle);
    }

    return {
      source: 'youtube',
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: heading || pageTitle,
      artist,
      track,
      channel,
      isPlaying: Boolean(player && !player.paused && !player.ended),
      currentTime: player ? Number(player.currentTime) || 0 : 0,
      duration: player ? Number(player.duration) || 0 : 0,
      updatedAt: Date.now(),
    };
  }

  function fingerprint(payload) {
    if (!payload) return '';
    return [
      payload.videoId,
      payload.artist,
      payload.track,
      payload.isPlaying ? '1' : '0',
      Math.floor(payload.currentTime),
    ].join('|');
  }

  function publish(force = false) {
    const payload = readNowPlaying();
    const fp = fingerprint(payload);

    if (!force && fp === lastFingerprint) return;
    lastFingerprint = fp;

    try {
      chrome.runtime.sendMessage({ type: 'NOW_PLAYING', payload }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      /* extension context invalidated — reload the tab */
    }
  }

  function bindPlayer() {
    const player = getPlayer();
    if (!player || player === boundVideo) return;
    boundVideo = player;

    ['play', 'pause', 'seeked', 'loadedmetadata'].forEach((evt) => {
      player.addEventListener(evt, () => publish(true));
    });
  }

  function startWatching() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      bindPlayer();
      publish(false);
    }, 1000);

    document.addEventListener('yt-navigate-finish', () => {
      lastFingerprint = '';
      boundVideo = null;
      setTimeout(() => {
        bindPlayer();
        publish(true);
      }, 500);
    });

    const obs = new MutationObserver(() => bindPlayer());
    obs.observe(document.documentElement, { childList: true, subtree: true });

    bindPlayer();
    publish(true);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'GET_NOW_PLAYING') {
      sendResponse({ payload: readNowPlaying() });
      return true;
    }
    return false;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWatching, { once: true });
  } else {
    startWatching();
  }

  console.log(`[${BRIDGE}] watching YouTube`);
})();
