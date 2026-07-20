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
  translating: false,
};

let builtKey = '';
let lastActive = -1;

function lineText(line, mode) {
  if (mode === 'translation') return line.translation || line.text;
  if (mode === 'romaji') return line.romaji || line.text;
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

function activeIndex(lines, currentTime, duration) {
  if (!lines?.length) return -1;

  const synced = lines.some((l) => l.timeMs != null);
  if (synced) {
    const ms = Math.max(0, (currentTime || 0) * 1000);
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timeMs == null) continue;
      if (lines[i].timeMs <= ms) idx = i;
      else break;
    }
    return idx;
  }

  const dur = Number(duration) || 0;
  const t = Number(currentTime) || 0;
  if (dur <= 0 || t <= 0) return 0;
  const progress = Math.min(0.999, Math.max(0, t / dur));
  return Math.min(lines.length - 1, Math.floor(progress * lines.length));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function buildLines(lines, mode) {
  linesEl.innerHTML = lines
    .map((line, i) => {
      const main = escapeHtml(lineText(line, mode));
      const sub = lineSub(line, mode);
      const subHtml = sub ? `<span class="sub">${escapeHtml(sub)}</span>` : '';
      return `<p class="line" data-idx="${i}">${main}${subHtml}</p>`;
    })
    .join('');
  lastActive = -1;
}

function ensureCenterPadding() {
  // Pad inside the scrollable list so first/last lines can sit in the center.
  const viewH = linesEl.clientHeight || 0;
  if (viewH < 40) return;
  const pad = Math.max(40, Math.floor(viewH * 0.4));
  if (linesEl.style.paddingTop === `${pad}px`) return;
  linesEl.style.paddingTop = `${pad}px`;
  linesEl.style.paddingBottom = `${pad}px`;
}

function scrollLineIntoView(active) {
  if (!active || !linesEl) return;

  ensureCenterPadding();

  // offsetTop is relative to offsetParent; with padding on linesEl it stays correct.
  const viewH = linesEl.clientHeight;
  if (viewH < 40) return;

  const lineTop = active.offsetTop;
  const lineH = active.offsetHeight || 24;
  const target = lineTop - viewH / 2 + lineH / 2;
  const maxScroll = Math.max(0, linesEl.scrollHeight - viewH);
  const next = Math.min(maxScroll, Math.max(0, target));

  linesEl.scrollTop = next;
}

function updateActive(current) {
  if (current === lastActive) return;
  const prev = linesEl.querySelector('.line.active');
  const near = linesEl.querySelectorAll('.line.near');
  if (prev) prev.classList.remove('active');
  near.forEach((el) => el.classList.remove('near'));

  if (current >= 0) {
    const active = linesEl.querySelector(`.line[data-idx="${current}"]`);
    if (active) {
      active.classList.add('active');
      const before = linesEl.querySelector(`.line[data-idx="${current - 1}"]`);
      const after = linesEl.querySelector(`.line[data-idx="${current + 1}"]`);
      before?.classList.add('near');
      after?.classList.add('near');
      scrollLineIntoView(active);
    }
  }
  lastActive = current;
}

function renderLines() {
  const lyrics = state.lyrics;
  const mode = state.mode;
  const timeLabel = lyrics ? formatTime(lyrics.currentTime) : '0:00';

  modeLabel.textContent = state.translating
    ? 'translating…'
    : `${mode} · ${timeLabel}`;

  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  if (!lyrics) {
    emptyEl.hidden = false;
    linesEl.hidden = true;
    linesEl.innerHTML = '';
    builtKey = '';
    emptyEl.innerHTML =
      'Leave YouTube playing in Chrome.<br />Load the extension so lyrics can scroll in sync.';
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

  const nextKey = `${lyrics.key || ''}::${mode}::${lines.length}::${
    lyrics.translated ? 1 : 0
  }`;
  if (nextKey !== builtKey) {
    buildLines(lines, mode);
    builtKey = nextKey;
    ensureCenterPadding();
  }

  const current = activeIndex(lines, lyrics.currentTime, lyrics.duration);
  updateActive(current);
}

function renderMeta() {
  const track = state.track;
  connDot.classList.toggle('on', (state.bridgeClients || 0) > 0);

  if (!track) {
    trackTitle.textContent = 'Waiting for YouTube…';
    trackArtist.textContent = 'Play a video · extension syncs the scroll';
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
