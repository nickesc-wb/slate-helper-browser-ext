# Installs the Slate Helper updater for the current Windows user, so the
# extension's "Update now" button can update this folder in place. Run it once
# from the extension folder (double-click install.cmd); run it again if the
# folder moves. -Uninstall removes it.
#
# What it does:
#   - copies host.ps1/host.cmd to %LOCALAPPDATA%\SlateHelper\updater, with a
#     config.json naming this extension folder
#   - writes the native messaging host manifest there, allowing only this
#     folder's extension ID
#   - registers it for Chrome, Brave and Edge under HKCU (no admin needed)

param(
  [switch]$Uninstall,
  # Extra extension IDs to allow, if the folder was loaded under another path.
  [string[]]$ExtensionId = @()
)

$ErrorActionPreference = 'Stop'

$HostName = 'com.waybetter.slate_helper'
$Repo = 'nickesc-wb/slate-helper-browser-ext'
$InstallDir = Join-Path $env:LOCALAPPDATA 'SlateHelper\updater'
# Chromium-based browsers read Chrome's key or Chromium's (Brave's binary names both).
$RegistryKeys = @(
  'HKCU:\Software\Google\Chrome\NativeMessagingHosts',
  'HKCU:\Software\Chromium\NativeMessagingHosts',
  'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts',
  'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'
) | ForEach-Object { Join-Path $_ $HostName }

if ($Uninstall) {
  foreach ($key in $RegistryKeys) { Remove-Item $key -ErrorAction SilentlyContinue }
  Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
  $parent = Split-Path $InstallDir
  if ((Test-Path $parent) -and -not (Get-ChildItem $parent)) { Remove-Item $parent }
  Write-Host 'Slate Helper updater removed.'
  return
}

$ExtensionDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path (Join-Path $ExtensionDir 'manifest.json'))) {
  throw "No manifest.json in $ExtensionDir. Run this from the updater folder inside the extension."
}

# Chrome names an unpacked extension after its folder: SHA-256 of the path
# (UTF-16, drive letter upper-cased), first 32 hex digits mapped 0-f -> a-p.
function Get-UnpackedExtensionId([string]$path) {
  if ($path -match '^[a-z]:') { $path = $path.Substring(0, 1).ToUpper() + $path.Substring(1) }
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::Unicode.GetBytes($path))
  $hex = -join ($hash[0..15] | ForEach-Object { $_.ToString('x2') })
  -join ($hex.ToCharArray() | ForEach-Object { [char]([Convert]::ToInt32([string]$_, 16) + [int][char]'a') })
}

$ids = @(Get-UnpackedExtensionId $ExtensionDir) + $ExtensionId | Select-Object -Unique

# Windows PowerShell's -Encoding UTF8 adds a BOM, which Chrome's JSON reader rejects.
function Write-Json($value, [string]$path) {
  [IO.File]::WriteAllText($path, ($value | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
}

New-Item -ItemType Directory $InstallDir -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'host.ps1'), (Join-Path $PSScriptRoot 'host.cmd') $InstallDir -Force

Write-Json @{ extensionDir = $ExtensionDir; repo = $Repo } (Join-Path $InstallDir 'config.json')

$manifestPath = Join-Path $InstallDir "$HostName.json"
Write-Json @{
  name = $HostName
  description = 'Slate Helper updater'
  path = (Join-Path $InstallDir 'host.cmd')
  type = 'stdio'
  allowed_origins = @($ids | ForEach-Object { "chrome-extension://$_/" })
} $manifestPath

foreach ($key in $RegistryKeys) {
  New-Item $key -Force | Out-Null
  Set-Item $key $manifestPath
}

Write-Host "Slate Helper updater installed for $ExtensionDir"
Write-Host "Extension ID: $($ids -join ', ')"
if (Test-Path (Join-Path $ExtensionDir '.git')) {
  Write-Host 'This folder is a git checkout, so the updater leaves it alone: update it with git pull.'
} else {
  Write-Host 'The update notice on Slate pages now has an "Update now" button.'
}
