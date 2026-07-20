$ErrorActionPreference = 'SilentlyContinue'
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await-WinRT($op) {
  if (-not $op -or -not $asTaskGeneric) { return $null }
  $task = $asTaskGeneric.MakeGenericMethod($op.GetType().GenericTypeArguments).Invoke($null, @($op))
  $task.Wait(2000) | Out-Null
  if ($task.IsCompleted -and -not $task.IsFaulted) { return $task.Result }
  return $null
}

$m = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync())
$rows = @()
foreach ($s in @($m.GetSessions())) {
  $p = Await-WinRT ($s.TryGetMediaPropertiesAsync())
  $t = $s.GetTimelineProperties()
  $pb = $s.GetPlaybackInfo()
  $rows += [ordered]@{
    app    = [string]$s.SourceAppUserModelId
    title  = [string]$p.Title
    artist = [string]$p.Artist
    status = [string]$pb.PlaybackStatus
    pos    = [math]::Round($t.Position.TotalSeconds, 1)
    dur    = [math]::Round(($t.EndTime - $t.StartTime).TotalSeconds, 1)
  }
}
$rows | ConvertTo-Json -Compress
