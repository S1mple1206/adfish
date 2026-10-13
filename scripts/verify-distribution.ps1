param([string]$Directory = 'dist')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$appHashes = @()
foreach ($arch in @('x64','arm64')) {
  $archive = Join-Path $Directory "adfish-Windows-$arch.zip"
  $checksum = (Get-Content -LiteralPath "$archive.sha256" -Raw).Trim().Split(' ')[0]
  $archiveStream = [IO.File]::OpenRead((Resolve-Path -LiteralPath $archive).Path)
  $archiveHasher = [Security.Cryptography.SHA256]::Create()
  try { $actualChecksum = [BitConverter]::ToString($archiveHasher.ComputeHash($archiveStream)).Replace('-','').ToLower() } finally { $archiveStream.Dispose(); $archiveHasher.Dispose() }
  if ($actualChecksum -ne $checksum) { throw "ZIP checksum mismatch: $arch" }
  $zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $archive).Path)
  try {
    $prefix = "adfish-Windows-$arch/"
    $index = @{}
    foreach ($entry in $zip.Entries) { $index[$entry.FullName.Replace('\','/')] = $entry }
    $entries = @($index.Keys)
    foreach ($name in @('adfish.exe','resources/app.asar','创建快捷方式.cmd','scripts/create-shortcut.ps1','使用说明.txt')) {
      if ($entries -notcontains ($prefix + $name)) { throw "Missing release entry: $arch/$name" }
    }
    if ($entries | Where-Object { $_ -notlike "$prefix*" }) { throw "Unexpected bundle root: $arch" }
    if ($entries | Where-Object { $_ -match '(^|/)(data|data-backups|\.git|Default|Cache|GPUCache|Local Storage|Session Storage)(/|$)|/(Cookies|History|settings\.json)$' }) { throw 'Browsing data found in distribution.' }
    $reader = [IO.BinaryReader]::new($index[$prefix + 'adfish.exe'].Open())
    try {
      $header = $reader.ReadBytes(4096)
      if ($header.Length -lt 64 -or [BitConverter]::ToUInt16($header,0) -ne 0x5a4d) { throw "Invalid executable: $arch" }
      $pe = [BitConverter]::ToInt32($header,0x3c)
      if ($pe -lt 0 -or $pe + 6 -gt $header.Length -or [BitConverter]::ToUInt32($header,$pe) -ne 0x4550) { throw "Invalid PE header: $arch" }
      $expected = if ($arch -eq 'x64') { 0x8664 } else { 0xaa64 }
      if ([BitConverter]::ToUInt16($header,$pe+4) -ne $expected) { throw "Wrong CPU architecture: $arch" }
    } finally { $reader.Dispose() }
    $stream = $index[$prefix + 'resources/app.asar'].Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $appHashes += [BitConverter]::ToString($sha.ComputeHash($stream)) } finally { $stream.Dispose(); $sha.Dispose() }
    Write-Output "PASS ${arch}: checksum, package layout, CPU architecture and no browsing data ($($entries.Count) ZIP entries)."
  } finally { $zip.Dispose() }
}
if ($appHashes[0] -ne $appHashes[1]) { throw 'Application code differs between architectures.' }
Write-Output 'PASS: identical app code in x64 and ARM64 packages.'
