param([string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
$target = Join-Path $root 'adfish.exe'
if (!(Test-Path -LiteralPath $target)) { $target = Join-Path $root "$arch/adfish.exe" }
$icon = "$target,0"
if (Test-Path -LiteralPath (Join-Path $root 'package.json')) {
    if (!(Test-Path -LiteralPath (Join-Path $root 'node_modules/electron/dist/electron.exe'))) { throw 'Run npm ci before creating the source shortcut.' }
    $target = Join-Path $root '启动.cmd'
    $icon = (Join-Path $root 'assets/adfish.ico') + ',0'
} elseif (!(Test-Path -LiteralPath $target)) {
    throw "Application not found: $target. Extract the entire release first."
}
if (!(Test-Path -LiteralPath $DesktopDirectory -PathType Container)) { throw 'Desktop directory does not exist.' }
$shortcutPath = Join-Path $DesktopDirectory 'adfish.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = Split-Path -Parent $target
$shortcut.IconLocation = $icon
$shortcut.Description = 'adfish'
$shortcut.Save()
Write-Output "Created: $shortcutPath"
