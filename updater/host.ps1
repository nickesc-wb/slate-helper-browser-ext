# Slate Helper updater: the native messaging host the extension talks to
# (chrome.runtime.sendNativeMessage). install.ps1 copies it out of the extension
# folder, next to a config.json naming that folder, so updating the folder
# never touches the running script.
#
# Chrome starts it for each message: one length-prefixed JSON message on stdin,
# one reply on stdout, then it exits. Nothing else may be written to stdout.
#
#   { "type": "ping" }    -> { ok, version, extensionDir, git }
#   { "type": "update" }  -> { ok, version } or { ok: false, error }
#
# "update" downloads the latest GitHub release's zip and mirrors
# manifest.json, icons/, src/ and updater/ into the folder; the extension then
# reloads itself. A git checkout is left alone: update those with git.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest's progress bar is slow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$HostVersion = 1
$Config = Get-Content -Raw (Join-Path $PSScriptRoot 'config.json') | ConvertFrom-Json

function Read-Message {
  $stdin = [Console]::OpenStandardInput()
  $header = New-Object byte[] 4
  $read = 0
  while ($read -lt 4) {
    $n = $stdin.Read($header, $read, 4 - $read)
    if ($n -le 0) { return $null }
    $read += $n
  }
  $length = [BitConverter]::ToInt32($header, 0)
  $body = New-Object byte[] $length
  $read = 0
  while ($read -lt $length) {
    $n = $stdin.Read($body, $read, $length - $read)
    if ($n -le 0) { break }
    $read += $n
  }
  [Text.Encoding]::UTF8.GetString($body, 0, $read) | ConvertFrom-Json
}

function Write-Message($value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($value | ConvertTo-Json -Compress))
  $stdout = [Console]::OpenStandardOutput()
  $stdout.Write([BitConverter]::GetBytes($bytes.Length), 0, 4)
  $stdout.Write($bytes, 0, $bytes.Length)
  $stdout.Flush()
}

function Get-InstalledVersion {
  (Get-Content -Raw (Join-Path $Config.extensionDir 'manifest.json') | ConvertFrom-Json).version
}

function Update-FromRelease {
  $headers = @{ 'User-Agent' = 'slate-helper-updater'; Accept = 'application/vnd.github+json' }
  $release = Invoke-RestMethod -Headers $headers "https://api.github.com/repos/$($Config.repo)/releases/latest"
  $asset = $release.assets | Where-Object { $_.name -like 'slate-helper-*.zip' } | Select-Object -First 1
  if (-not $asset) { throw "Release $($release.tag_name) has no slate-helper zip" }

  $work = Join-Path ([IO.Path]::GetTempPath()) "slate-helper-update-$([guid]::NewGuid())"
  New-Item -ItemType Directory $work | Out-Null
  try {
    $zip = Join-Path $work $asset.name
    Invoke-WebRequest -UseBasicParsing -Headers $headers $asset.browser_download_url -OutFile $zip
    $unpacked = Join-Path $work 'unpacked'
    Expand-Archive $zip $unpacked
    if (-not (Test-Path (Join-Path $unpacked 'manifest.json'))) { throw 'The release zip has no manifest.json' }

    # Mirror so files a release removed go away too. robocopy's exit codes
    # below 8 all mean success.
    foreach ($folder in 'icons', 'src', 'updater') {
      $from = Join-Path $unpacked $folder
      if (-not (Test-Path $from)) { continue }
      & robocopy $from (Join-Path $Config.extensionDir $folder) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "Copying $folder failed (robocopy $LASTEXITCODE)" }
    }
    # manifest.json last: until it changes, the extension still loads as the old version.
    Copy-Item (Join-Path $unpacked 'manifest.json') $Config.extensionDir -Force

    # Keep this host current too. PowerShell has already read this script, so
    # replacing the file now is safe.
    $newHost = Join-Path $unpacked 'updater'
    if (Test-Path $newHost) {
      Copy-Item (Join-Path $newHost 'host.ps1'), (Join-Path $newHost 'host.cmd') $PSScriptRoot -Force
    }
  } finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}

try {
  $message = Read-Message
  $git = Test-Path (Join-Path $Config.extensionDir '.git')
  switch ($message.type) {
    'ping' {
      Write-Message @{ ok = $true; version = $HostVersion; extensionDir = $Config.extensionDir; git = $git }
    }
    'update' {
      if ($git) { throw 'This copy is a git checkout. Update it with git pull.' }
      Update-FromRelease
      Write-Message @{ ok = $true; version = (Get-InstalledVersion) }
    }
    default {
      Write-Message @{ ok = $false; error = "Unknown message type '$($message.type)'" }
    }
  }
} catch {
  Write-Message @{ ok = $false; error = $_.Exception.Message }
}
