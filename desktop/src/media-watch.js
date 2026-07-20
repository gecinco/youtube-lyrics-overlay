const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Inline so the packaged .exe never depends on reading a .ps1 out of app.asar.
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$result = [ordered]@{
  windowTitle = ''
  smtcTitle   = ''
  smtcArtist  = ''
  status      = ''
  position    = 0
  duration    = 0
  appId       = ''
}

try {
  Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class LyricsWinEnum {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  public static List<string> FindYoutubeTitles() {
    var hits = new List<string>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      var sb = new StringBuilder(1024);
      if (GetWindowText(hWnd, sb, sb.Capacity) <= 0) return true;
      var title = sb.ToString();
      if (title.IndexOf("YouTube", StringComparison.OrdinalIgnoreCase) < 0) return true;

      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      try {
        var p = System.Diagnostics.Process.GetProcessById((int)pid);
        var name = (p.ProcessName ?? "").ToLowerInvariant();
        if (name == "chrome" || name == "msedge" || name == "brave" || name == "opera" || name == "vivaldi") {
          hits.Add(title);
        }
      } catch {}
      return true;
    }, IntPtr.Zero);
    return hits;
  }
}
"@

  $titles = [LyricsWinEnum]::FindYoutubeTitles()
  if ($titles -and $titles.Count -gt 0) {
    $preferred = $titles | Where-Object { $_ -match 'YouTube' } | Select-Object -First 1
    $result.windowTitle = $(if ($preferred) { $preferred } else { $titles[0] })
  }
} catch {}

# Always try SMTC — Chrome often puts the channel/artist here even when the
# window title is only the song name (e.g. "Master of Puppets (Remastered)").
try {
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
    })[0]

  function Await-WinRT($op) {
    if (-not $op -or -not $asTaskGeneric) { return $null }
    $task = $asTaskGeneric.MakeGenericMethod($op.GetType().GenericTypeArguments).Invoke($null, @($op))
    $task.Wait(1200) | Out-Null
    if ($task.IsCompleted -and -not $task.IsFaulted) { return $task.Result }
    return $null
  }

  $manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync())
  if ($manager) {
    $sessions = @($manager.GetSessions())
    $session = $null
    foreach ($s in $sessions) {
      $app = [string]$s.SourceAppUserModelId
      if ($app -match 'chrome|msedge|brave|opera|vivaldi') { $session = $s; break }
    }
    if (-not $session) { $session = $manager.GetCurrentSession() }
    if ($session) {
      $result.appId = [string]$session.SourceAppUserModelId
      $props = Await-WinRT ($session.TryGetMediaPropertiesAsync())
      if ($props) {
        $result.smtcTitle = [string]$props.Title
        $result.smtcArtist = [string]$props.Artist
      }
      $playback = $session.GetPlaybackInfo()
      if ($playback) { $result.status = [string]$playback.PlaybackStatus }
      $timeline = $session.GetTimelineProperties()
      if ($timeline) {
        $result.position = [math]::Round($timeline.Position.TotalSeconds, 2)
        $end = $timeline.EndTime.TotalSeconds
        $start = $timeline.StartTime.TotalSeconds
        if ($end -gt $start) { $result.duration = [math]::Round(($end - $start), 2) }
      }
    }
  }
} catch {}

$result | ConvertTo-Json -Compress
`;

function scriptFile() {
  const file = path.join(os.tmpdir(), 'youtube-lyrics-overlay-media-watch.ps1');
  fs.writeFileSync(file, PS_SCRIPT, 'utf8');
  return file;
}

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\s*[-–—]\s*Google Chrome\s*$/i, '')
    .replace(/\s*[-–—]\s*Microsoft Edge\s*$/i, '')
    .replace(/\s*[-–—]\s*Brave\s*$/i, '')
    .replace(/\s*[-–—]\s*YouTube\s*$/i, '')
    .replace(/\s*\(\s*Official\s*(Music\s*|HD\s*|4K\s*)?Video\s*\)/gi, '')
    .replace(/\s*\[\s*Official\s*(Music\s*|HD\s*|4K\s*)?Video\s*\]/gi, '')
    .replace(/\s*\(\s*Official\s*HD\s*Video\s*\)/gi, '')
    .replace(/\s*\(\s*Lyric\s*Video\s*\)/gi, '')
    .replace(/\s*\[\s*Lyric\s*Video\s*\]/gi, '')
    .replace(/\s*\(\s*Official\s*Audio\s*\)/gi, '')
    .replace(/\s*\[\s*Official\s*Audio\s*\]/gi, '')
    .replace(/\s*\(\s*HD\s*\)/gi, '')
    .replace(/\s*\(\s*(?:\d{4}\s*)?Remaster(?:ed)?\s*\)/gi, '')
    .replace(/\s*\[\s*(?:\d{4}\s*)?Remaster(?:ed)?\s*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isUnknownArtist(artist) {
  return !artist || /^unknown(\s+artist)?$/i.test(artist.trim());
}

function parseArtistAndTrack(title, fallbackArtist = '') {
  const cleaned = cleanTitle(title);
  const separators = [' - ', ' – ', ' — ', ' | '];

  for (const sep of separators) {
    if (!cleaned.includes(sep)) continue;
    const [left, ...rest] = cleaned.split(sep);
    const right = rest.join(sep).trim();
    if (left && right) {
      return { artist: left.trim(), track: right.trim() };
    }
  }

  return {
    artist: fallbackArtist || 'Unknown Artist',
    track: cleaned || 'Unknown Track',
  };
}

function runPowershell() {
  return new Promise((resolve) => {
    let file;
    try {
      file = scriptFile();
    } catch (err) {
      console.error('[media-watch] cannot write script', err.message);
      resolve(null);
      return;
    }

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file],
      {
        windowsHide: true,
        timeout: 12000,
        maxBuffer: 1024 * 1024,
      },
      (err, stdout) => {
        if (err) {
          console.error('[media-watch] powershell error', err.message);
          resolve(null);
          return;
        }
        const text = String(stdout || '').replace(/^\uFEFF/, '').trim();
        if (!text) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (parseErr) {
          console.error('[media-watch] bad json', text.slice(0, 200));
          resolve(null);
        }
      }
    );
  });
}

async function readNowPlaying() {
  const data = await runPowershell();
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

  if (!fromYoutubeWindow && !fromYoutubeSmtc) {
    return null;
  }

  let title = '';
  let artist = '';

  if (fromYoutubeWindow) {
    title = cleanTitle(windowTitle);
  } else if (smtcTitle) {
    title = cleanTitle(smtcTitle);
  } else {
    return null;
  }

  if (smtcArtist) {
    artist = smtcArtist.replace(/\s*[-–—]\s*Topic$/i, '').trim();
  }

  const parsed = parseArtistAndTrack(title, artist);
  if (!isUnknownArtist(artist) && isUnknownArtist(parsed.artist)) {
    parsed.artist = artist;
    parsed.track = cleanTitle(title);
  }

  return {
    source: 'windows',
    videoId: '',
    url: '',
    title: `${parsed.artist} - ${parsed.track}`,
    artist: parsed.artist,
    track: parsed.track,
    channel: artist || parsed.artist,
    isPlaying:
      String(data.status || '').toLowerCase() === 'playing' ||
      Boolean(fromYoutubeWindow),
    currentTime: Number(data.position) || 0,
    duration: Number(data.duration) || 0,
    updatedAt: Date.now(),
  };
}

function startMediaWatch({ onNowPlaying, intervalMs = 1500 }) {
  let stopped = false;
  let timer = null;
  let lastKey = '';
  let busy = false;

  const tick = async () => {
    if (stopped || busy) {
      if (!stopped) timer = setTimeout(tick, intervalMs);
      return;
    }
    busy = true;
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
        onNowPlaying?.(payload);
      }
    } catch (err) {
      console.error('[media-watch]', err.message);
    } finally {
      busy = false;
      if (!stopped) timer = setTimeout(tick, intervalMs);
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
