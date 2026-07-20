const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  if (chrome.runtime.lastError) {
    statusEl.textContent = 'Extension waking up…';
    return;
  }

  if (response?.connected) {
    statusEl.textContent = 'Syncing playhead with the overlay.';
    statusEl.classList.add('ok');
    hintEl.textContent = 'Reload the YouTube tab once if the scroll still feels stuck.';
  } else {
    statusEl.textContent = 'Desktop app offline.';
    statusEl.classList.add('bad');
    hintEl.textContent = 'Open YouTubeLyricsOverlay.exe, then refresh this popup.';
  }
});
