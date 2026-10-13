param([string]$Archive = 'dist/adfish-Windows10-11-64bit.zip')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Archive).Path)
try {
  $prefix = 'adfish-Windows10-11-64bit/'
  $index = @{}
  foreach ($entry in $zip.Entries) { $index[$entry.FullName.Replace('\','/')] = $entry }
  $entries = @($index.Keys)
  foreach ($name in @('启动.cmd','创建快捷方式.cmd','scripts/create-shortcut.ps1','使用说明.txt','x64/adfish.exe','arm64/adfish.exe','x64/resources/app.asar','arm64/resources/app.asar')) {
    if ($entries -notcontains ($prefix + $name)) { throw "Missing release entry: $name" }
  }
  if ($entries | Where-Object { $_ -match '(^|/)(data|Default|Cache|GPUCache|Local Storage|Session Storage)(/|$)|/(Cookies|History|settings\.json)$' }) { throw 'Browsing data found in distribution.' }
  $appHashes = @()
  foreach ($arch in @('x64','arm64')) {
    $exe = $index[$prefix + "$arch/adfish.exe"]
    $reader = [IO.BinaryReader]::new($exe.Open())
    try {
      $header = $reader.ReadBytes(4096)
      if ($header.Length -lt 64 -or [BitConverter]::ToUInt16($header,0) -ne 0x5a4d) { throw "Invalid executable: $arch" }
      $pe = [BitConverter]::ToInt32($header,0x3c)
      if ($pe -lt 0 -or $pe + 6 -gt $header.Length -or [BitConverter]::ToUInt32($header,$pe) -ne 0x4550) { throw "Invalid PE header: $arch" }
      $expected = if ($arch -eq 'x64') { 0x8664 } else { 0xaa64 }
      if ([BitConverter]::ToUInt16($header,$pe+4) -ne $expected) { throw "Wrong CPU architecture: $arch" }
    } finally { $reader.Dispose() }
    $stream = $index[$prefix + "$arch/resources/app.asar"].Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $appHashes += [BitConverter]::ToString($sha.ComputeHash($stream)) } finally { $stream.Dispose(); $sha.Dispose() }
  }
  if ($appHashes[0] -ne $appHashes[1]) { throw 'Application code differs between architectures.' }
  Write-Output "PASS: required files, x64/ARM64 executable headers, identical app code, and no browsing data ($($entries.Count) ZIP entries)."
} finally { $zip.Dispose() }
