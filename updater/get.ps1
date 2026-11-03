# One-line install for Windows, from PowerShell:
#
#   irm https://raw.githubusercontent.com/nickesc-wb/slate-helper-browser-ext/main/updater/get.ps1 | iex
#
# Downloads the latest release into "%USERPROFILE%\Slate Helper" (or
# $env:SLATE_HELPER_DIR), updating it in place if it's already there, runs
# updater\install.ps1 so "Update now" works, and copies the folder path for
# the browser's Load unpacked dialog. Loading the extension is left to the
# user: browsers don't let anything else turn on Developer mode, load an
# unpacked extension or even open the extensions page.
#
# Run through iex, so no param block or $PSScriptRoot; everything stays inside
# the script block to keep the caller's session clean.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest's progress bar is slow
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $repo = 'nickesc-wb/slate-helper-browser-ext'
  $dir = if ($env:SLATE_HELPER_DIR) { $env:SLATE_HELPER_DIR } else { Join-Path $HOME 'Slate Helper' }
  if (Test-Path (Join-Path $dir '.git')) { throw "$dir is a git checkout. Update it with git pull." }

  $headers = @{ 'User-Agent' = 'slate-helper-installer'; Accept = 'application/vnd.github+json' }
  $release = Invoke-RestMethod -Headers $headers "https://api.github.com/repos/$repo/releases/latest"
  $asset = $release.assets | Where-Object { $_.name -like 'slate-helper-*.zip' } | Select-Object -First 1
  if (-not $asset) { throw "Release $($release.tag_name) has no slate-helper zip" }
  Write-Host "Downloading Slate Helper $($release.tag_name)..."

  $work = Join-Path ([IO.Path]::GetTempPath()) "slate-helper-install-$([guid]::NewGuid())"
  New-Item -ItemType Directory $work | Out-Null
  try {
    $zip = Join-Path $work $asset.name
    Invoke-WebRequest -UseBasicParsing -Headers $headers $asset.browser_download_url -OutFile $zip
    $unpacked = Join-Path $work 'unpacked'
    Expand-Archive $zip $unpacked
    if (-not (Test-Path (Join-Path $unpacked 'manifest.json'))) { throw 'The release zip has no manifest.json' }

    # Same as the updater: mirror the folders (robocopy exit codes below 8
    # are success), manifest.json last.
    New-Item -ItemType Directory $dir -Force | Out-Null
    foreach ($folder in 'icons', 'src', 'updater') {
      $from = Join-Path $unpacked $folder
      if (-not (Test-Path $from)) { continue }
      & robocopy $from (Join-Path $dir $folder) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "Copying $folder failed (robocopy $LASTEXITCODE)" }
    }
    Copy-Item (Join-Path $unpacked 'manifest.json') $dir -Force
  } finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
  }

  $dir = (Resolve-Path $dir).Path
  $installer = Join-Path $dir 'updater\install.ps1'
  if (Test-Path $installer) {
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $installer
  }

  Set-Clipboard $dir

  # The extensions page can't be opened for the user: browsers ignore their
  # internal pages (chrome://, brave://) when another program passes them in,
  # and open a blank tab instead.
  Write-Host ''
  Write-Host "Slate Helper is in $dir (path copied to the clipboard)."
  Write-Host 'To finish, type chrome://extensions (brave://extensions in Brave) in the address bar, then:'
  Write-Host '  - turn on Developer mode (top right)'
  Write-Host '  - click Load unpacked and paste the path into the folder box'
  Write-Host 'If Slate Helper is already loaded from this folder, click its reload button instead.'
}
