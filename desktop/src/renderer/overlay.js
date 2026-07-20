const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const emptyEl = document.getElementById('empty');
const linesEl = document.getElementById('lines');
const modeLabel = document.getElementById('modeLabel');
const connDot = document.getElementById('connDot');
const hideBtn = document.getElementById('hideBtn');
const modeButtons = [...document.querySelectorAll('button.mode')];

let state = {
  track: null,
  lyrics: null,
  mode: 'original',
  bridgeClients: 0,
};

function lineText(line, mode) {
  if (mode === 'translation') {
    return line.translation || line.text;
  }
  if (mode === 'romaji') {
    return line.romaji || line.text;
  }
  return line.text;
}

function lineSub(line, mode) {
  if (mode === 'translation' && line.translation && line.translation !== line.text) {
    return line.text;
  }
  if (mode === 'romaji' && line.romaji && line.romaji !== line.text) {
    return line.text;
  }
  return '';
}

function activeIndex(lines, currentTime) {
  if (!lines?.length) return -1;
  if (lines.every((l) => l.timeMs == null)) return -1;
  const ms = Math.max(0, (currentTime || 0) * 1000);
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs == null) continue;
    if (lines[i].timeMs <= ms) idx = i;
    else break;
  }
  return idx;
}

function renderLines() {
  const lyrics = state.lyrics;
  const mode = state.mode;

  modeLabel.textContent = mode;
  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  if (!lyrics) {
    emptyEl.hidden = false;
    linesEl.hidden = true;
    emptyEl.innerHTML = 'Softly waiting for a song.<br />The words will settle here.';
    return;
  }

  if (lyrics.status === 'loading' && !lyrics.lines?.length) {
    emptyEl.hidden = false;
    linesEl.hidden = true;
    emptyEl.textContent = 'Looking up the words…';
    return;
  }

  if (lyrics.status === 'missing' || lyrics.instrumental) {
    emptyEl.hidden = false;
    linesEl.hidden = true;
    emptyEl.textContent = lyrics.instrumental
      ? 'This one seems instrumental — no lyrics to show.'
      : 'Couldn’t find lyrics for this one. Try another upload of the same song.';
    return;
  }

  if (lyrics.status === 'error') {
    emptyEl.hidden = false;
    linesEl.hidden = true;
    emptyEl.textContent = lyrics.message || 'Something went wrong fetching lyrics.';
    return;
  }

  const lines = lyrics.lines || [];
  if (!lines.length) {
    emptyEl.hidden = false;
    linesEl.hidden = true;
    emptyEl.textContent = 'Lyrics came back empty.';
    return;
  }

  emptyEl.hidden = true;
  linesEl.hidden = false;

  const current = activeIndex(lines, lyrics.currentTime);
  linesEl.innerHTML = lines
    .map((line, i) => {
      const cls = ['line'];
      if (i === current) cls.push('active');
      else if (Math.abs(i - current) === 1) cls.push('near');
      const main = escapeHtml(lineText(line, mode));
      const sub = lineSub(line, mode);
      const subHtml = sub ? `<span class="sub">${escapeHtml(sub)}</span>` : '';
      return `<p class="${cls.join(' ')}" data-idx="${i}">${main}${subHtml}</p>`;
    })
    .join('');

  const active = linesEl.querySelector('.line.active');
  if (active) {
    const box = linesEl.getBoundingClientRect();
    const top = active.offsetTop - linesEl.scrollTop;
    if (top < 40 || top > box.height - 80) {
      active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderMeta() {
  const track = state.track;
  connDot.classList.toggle('on', (state.bridgeClients || 0) > 0);

  if (!track) {
    trackTitle.textContent = 'Waiting for YouTube…';
    trackArtist.textContent = 'Open a video and press play';
    return;
  }

  trackTitle.textContent = track.track || track.title || 'Unknown track';
  trackArtist.textContent = track.artist || track.channel || 'Unknown artist';
}

function render(next) {
  state = { ...state, ...next };
  renderMeta();
  renderLines();
}

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    window.lyricsOverlay.setMode(btn.dataset.mode);
  });
});

hideBtn.addEventListener('click', () => {
  window.lyricsOverlay.close();
});

window.lyricsOverlay.onState(render);
window.lyricsOverlay.requestState();
