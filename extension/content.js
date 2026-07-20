(() => {
  if (window.__lyricsOverlayLoaded) return;
  window.__lyricsOverlayLoaded = true;

  let lastSent = '';
  let tickTimer = null;

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

  function readTiming() {
    if (!location.pathname.startsWith('/watch')) return null;
    const videoId = getVideoId();
    const player = getPlayer();
    if (!videoId || !player) return null;

    return {
      source: 'youtube-extension',
      videoId,
      currentTime: Number(player.currentTime) || 0,
      duration: Number(player.duration) || 0,
      isPlaying: Boolean(!player.paused && !player.ended),
      title: document.title || '',
      updatedAt: Date.now(),
    };
  }

  function publish() {
    const payload = readTiming();
    if (!payload) return;

    const key = [
      payload.videoId,
      payload.isPlaying ? '1' : '0',
      Math.floor(payload.currentTime * 2) / 2, // 0.5s granularity
    ].join('|');

    if (key === lastSent) return;
    lastSent = key;

    try {
      chrome.runtime.sendMessage({ type: 'PLAYBACK_TIME', payload }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      /* ignore */
    }
  }

  function start() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(publish, 400);
    document.addEventListener('yt-navigate-finish', () => {
      lastSent = '';
      setTimeout(publish, 300);
    });
    publish();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
