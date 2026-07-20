const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CACHE_DIR = path.join(app.getPath('userData'), 'lyrics-cache');

function ensureCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cacheKey(artist, track) {
  return Buffer.from(`${artist}::${track}`.toLowerCase()).toString('base64url');
}

function cachePath(artist, track) {
  return path.join(CACHE_DIR, `${cacheKey(artist, track)}.json`);
}

function readCache(artist, track) {
  try {
    ensureCache();
    const file = cachePath(artist, track);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(artist, track, data) {
  try {
    ensureCache();
    fs.writeFileSync(cachePath(artist, track), JSON.stringify(data, null, 2), 'utf8');
  } catch {
    /* ignore cache write errors */
  }
}

function parseLrc(lrc) {
  if (!lrc) return [];
  const lines = [];

  for (const rawLine of lrc.split(/\r?\n/)) {
    const localRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/g;
    let match;
    let timeMs = null;
    let text = '';

    while ((match = localRe.exec(rawLine)) !== null) {
      const min = Number(match[1]);
      const sec = Number(match[2]);
      const frac = match[3] || '0';
      const ms = Number(frac.padEnd(3, '0').slice(0, 3));
      timeMs = (min * 60 + sec) * 1000 + ms;
      text = match[4].trim();
    }

    if (timeMs != null && text) {
      lines.push({ timeMs, text });
    }
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function plainToLines(plain) {
  if (!plain) return [];
  return plain
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ timeMs: null, text }));
}

function hasCjk(text) {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text);
}

function toRomajiHint(text) {
  const map = {
    あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
    か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
    さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
    た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
    な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
    は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
    ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
    や: 'ya', ゆ: 'yu', よ: 'yo',
    ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
    わ: 'wa', を: 'wo', ん: 'n',
    が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
    ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
    だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
    ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
    ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
    きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
    しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
    ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
    にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
    ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
    みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
    りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
    ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
    じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
    びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
    ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
    っ: '', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
    ア: 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o',
    カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko',
    サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
    タ: 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to',
    ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no',
    ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he', ホ: 'ho',
    マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo',
    ヤ: 'ya', ユ: 'yu', ヨ: 'yo',
    ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro',
    ワ: 'wa', ヲ: 'wo', ン: 'n',
    ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go',
    ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo',
    ダ: 'da', ヂ: 'ji', ヅ: 'zu', デ: 'de', ド: 'do',
    バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo',
    パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po',
    キャ: 'kya', キュ: 'kyu', キョ: 'kyo',
    シャ: 'sha', シュ: 'shu', ショ: 'sho',
    チャ: 'cha', チュ: 'chu', チョ: 'cho',
    ニャ: 'nya', ニュ: 'nyu', ニョ: 'nyo',
    ヒャ: 'hya', ヒュ: 'hyu', ヒョ: 'hyo',
    ミャ: 'mya', ミュ: 'myu', ミョ: 'myo',
    リャ: 'rya', リュ: 'ryu', リョ: 'ryo',
    ギャ: 'gya', ギュ: 'gyu', ギョ: 'gyo',
    ジャ: 'ja', ジュ: 'ju', ジョ: 'jo',
    ビャ: 'bya', ビュ: 'byu', ビョ: 'byo',
    ピャ: 'pya', ピュ: 'pyu', ピョ: 'pyo',
    ッ: '', ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o',
    ー: '-', '　': ' ',
  };

  let out = '';
  for (let i = 0; i < text.length; i++) {
    const digraph = text.slice(i, i + 2);
    if (map[digraph] != null) {
      out += map[digraph];
      i += 1;
      continue;
    }
    const ch = text[i];
    out += map[ch] != null ? map[ch] : ch;
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

async function translateLines(lines, target = 'pt') {
  const translated = [];

  for (const line of lines) {
    if (!line.text) {
      translated.push({ ...line, translation: '' });
      continue;
    }

    try {
      const url =
        'https://api.mymemory.translated.net/get?q=' +
        encodeURIComponent(line.text.slice(0, 450)) +
        `&langpair=autodetect|${target}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('translate failed');
      const data = await res.json();
      translated.push({
        ...line,
        translation: data?.responseData?.translatedText || line.text,
      });
      await new Promise((r) => setTimeout(r, 80));
    } catch {
      translated.push({ ...line, translation: line.text });
    }
  }

  return translated;
}

function normalizeTrackName(track) {
  return String(track || '')
    .replace(/\s*\(\s*(?:\d{4}\s*)?Remaster(?:ed)?\s*\)/gi, '')
    .replace(/\s*\[\s*(?:\d{4}\s*)?Remaster(?:ed)?\s*\]/gi, '')
    .replace(/\s*\(\s*Official\s*(Music\s*)?Video\s*\)/gi, '')
    .replace(/\s*\(\s*Lyric\s*Video\s*\)/gi, '')
    .replace(/\s*\(\s*Official\s*Audio\s*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function usableArtist(artist) {
  if (!artist) return '';
  if (/^unknown(\s+artist)?$/i.test(artist.trim())) return '';
  return artist.trim();
}

function scoreHit(hit, artist, track) {
  const a = (hit.artistName || '').toLowerCase();
  const t = (hit.trackName || '').toLowerCase();
  const wantA = (artist || '').toLowerCase();
  const wantT = (track || '').toLowerCase();
  let score = 0;

  if (wantT && t === wantT) score += 8;
  else if (wantT && t.includes(wantT)) score += 5;
  else if (wantT && wantT.includes(t) && t.length > 4) score += 3;

  if (wantA && a === wantA) score += 6;
  else if (wantA && a.includes(wantA)) score += 3;

  if (hit.syncedLyrics) score += 2;
  else if (hit.plainLyrics) score += 1;

  return score;
}

async function searchLrclib({ artist, track, duration }) {
  const cleanArtist = usableArtist(artist);
  const cleanTrack = normalizeTrackName(track) || track;

  if (cleanArtist && cleanTrack) {
    const params = new URLSearchParams({
      artist_name: cleanArtist,
      track_name: cleanTrack,
    });
    if (duration && Number.isFinite(duration) && duration > 0) {
      params.set('duration', String(Math.round(duration)));
    }

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (res.ok) return res.json();
  }

  const queries = [
    [cleanArtist, cleanTrack].filter(Boolean).join(' '),
    cleanTrack,
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);

  let best = null;
  let bestScore = -1;

  for (const q of queries) {
    const res = await fetch(
      `https://lrclib.net/api/search?${new URLSearchParams({ q })}`
    );
    if (!res.ok) continue;
    const results = await res.json();
    if (!Array.isArray(results)) continue;

    for (const hit of results) {
      const score = scoreHit(hit, cleanArtist, cleanTrack);
      if (score > bestScore) {
        bestScore = score;
        best = hit;
      }
    }

    if (best && bestScore >= 5) break;
  }

  return best;
}

async function fetchLyrics({ artist, track, duration }) {
  const cleanArtist = usableArtist(artist);
  const cleanTrack = normalizeTrackName(track) || track;
  const cached = readCache(cleanArtist || artist, cleanTrack);
  if (cached) return cached;

  const hit = await searchLrclib({ artist: cleanArtist, track: cleanTrack, duration });
  if (!hit) return null;

  const synced = parseLrc(hit.syncedLyrics);
  const unsynced = plainToLines(hit.plainLyrics);
  const baseLines = synced.length ? synced : unsynced;

  const lines = baseLines.map((line) => ({
    ...line,
    romaji: hasCjk(line.text) ? toRomajiHint(line.text) : null,
  }));

  const payload = {
    provider: 'lrclib',
    synced: synced.length > 0,
    instrumental: Boolean(hit.instrumental),
    lines,
    hasCjk: lines.some((l) => l.romaji),
    translated: false,
    resolvedArtist: hit.artistName || cleanArtist || artist,
    resolvedTrack: hit.trackName || cleanTrack,
  };

  writeCache(cleanArtist || artist, cleanTrack, payload);
  return payload;
}

async function ensureTranslation(artist, track, lyrics) {
  if (!lyrics?.lines?.length) return lyrics;
  if (lyrics.translated) return lyrics;

  const lines = await translateLines(lyrics.lines, 'pt');
  const enriched = {
    ...lyrics,
    lines,
    translated: true,
  };

  writeCache(artist, track, enriched);
  return enriched;
}

module.exports = { fetchLyrics, ensureTranslation };
