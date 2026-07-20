const statusEl = document.getElementById('status');
const trackEl = document.getElementById('track');
const songEl = document.getElementById('song');
const artistEl = document.getElementById('artist');
const hintEl = document.getElementById('hint');

function render(status) {
  const { connected, latestPayload } = status || {};

  statusEl.classList.remove('ok', 'bad');

  if (connected) {
    statusEl.textContent = 'Connected to the desktop overlay.';
    statusEl.classList.add('ok');
    hintEl.textContent = 'Play a YouTube video and the lyrics window should follow along.';
  } else {
    statusEl.textContent = 'Desktop app is offline.';
    statusEl.classList.add('bad');
    hintEl.textContent = 'Run npm start inside the desktop folder, then refresh this popup.';
  }

  if (latestPayload?.track) {
    trackEl.hidden = false;
    songEl.textContent = latestPayload.track;
    artistEl.textContent = latestPayload.artist || latestPayload.channel || '';
  } else {
    trackEl.hidden = true;
  }
}

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  if (chrome.runtime.lastError) {
    statusEl.textContent = 'Extension background is waking up…';
    return;
  }
  render(response);
});
