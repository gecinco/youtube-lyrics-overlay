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

# 1) Enumerate top-level windows — more reliable than Get-Process for Chrome
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
    $preferred = $titles | Where-Object { $_ -match ' - YouTube$' } | Select-Object -First 1
    $result.windowTitle = $(if ($preferred) { $preferred } else { $titles[0] })
  }
} catch {}

# 2) Windows System Media Transport Controls
try {
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]

  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

  function Await-WinRT($op) {
    if (-not $op -or -not $asTaskGeneric) { return $null }
    $task = $asTaskGeneric.MakeGenericMethod($op.GetType().GenericTypeArguments).Invoke($null, @($op))
    $task.Wait(1500) | Out-Null
    if ($task.IsCompleted -and -not $task.IsFaulted) { return $task.Result }
    return $null
  }

  $manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync())
  if ($manager) {
    $sessions = @($manager.GetSessions())
    $session = $null

    foreach ($s in $sessions) {
      $app = [string]$s.SourceAppUserModelId
      if ($app -match 'chrome|msedge|brave|opera|vivaldi') {
        $session = $s
        break
      }
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
        if ($end -gt $start) {
          $result.duration = [math]::Round(($end - $start), 2)
        }
      }
    }
  }
} catch {}

$result | ConvertTo-Json -Compress
