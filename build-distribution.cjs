const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = __dirname;
const bundleName = 'adfish-Windows10-11-64bit';
const launcher = `@echo off
chcp 65001 >nul
setlocal
set "ELECTRON_RUN_AS_NODE="
set "AD_ARCH=%PROCESSOR_ARCHITECTURE%"
if defined PROCESSOR_ARCHITEW6432 set "AD_ARCH=%PROCESSOR_ARCHITEW6432%"
if /i "%AD_ARCH%"=="ARM64" goto arm64
if /i "%AD_ARCH%"=="AMD64" goto x64
echo 本程序支持 Windows 10/11 的 64 位系统（x64 或 ARM64）。
pause
exit /b 1
:arm64
set "AD_EXE=%~dp0arm64\\adfish.exe"
goto run
:x64
set "AD_EXE=%~dp0x64\\adfish.exe"
:run
if not exist "%AD_EXE%" goto missing
start "" "%AD_EXE%"
exit /b 0
:missing
echo 请先完整解压压缩包，并保留 x64 和 arm64 文件夹。
pause
exit /b 1
`.replace(/\n/g, '\r\n');

async function build() {
  const { packager } = await import('@electron/packager');
  // Fresh staging prevents a previous user's browsing profile entering a release.
  const staging = fs.mkdtempSync(path.join(root, 'release-distribution-'));
  try {
    const packages = await packager({
      dir: root, name: 'adfish', icon: path.join(root, 'assets', 'adfish.ico'), win32metadata: { ProductName: 'adfish', FileDescription: '摸鱼助手（adfish）' }, platform: 'win32', arch: ['x64', 'arm64'],
      out: path.join(staging, 'build'),
      ignore: [/^\/release/, /^\/dist/, /^\/data/, /^\/webview2/, /^\/scripts/, /build-distribution\.cjs$/, /\.test\.js$/],
      ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: process.env.ELECTRON_ZIP_DIR } : {})
    });
    const bundle = path.join(staging, bundleName);
    fs.mkdirSync(bundle);
    for (const arch of ['x64', 'arm64']) {
      const source = packages.find(p => p.endsWith(`-${arch}`));
      if (!source || !fs.existsSync(path.join(source, 'adfish.exe'))) throw new Error(`Missing ${arch} executable`);
      fs.cpSync(source, path.join(bundle, arch), { recursive: true, filter: source => path.basename(source) !== 'data' });
    }
    fs.writeFileSync(path.join(bundle, '启动.cmd'), launcher, 'utf8');
    fs.cpSync(path.join(root, '创建快捷方式.cmd'), path.join(bundle, '创建快捷方式.cmd'));
    fs.mkdirSync(path.join(bundle, 'scripts'));
    fs.cpSync(path.join(root, 'scripts', 'create-shortcut.ps1'), path.join(bundle, 'scripts', 'create-shortcut.ps1'));
    fs.writeFileSync(path.join(bundle, '使用说明.txt'), '\ufeff' + [
      '摸鱼助手（adfish）— Windows 10/11 64 位便携版', '',
      '1. 先完整解压压缩包。',
      '2. 进入文件夹，双击“启动.cmd”。程序自动选择 x64 或 ARM64 版本。',
      '3. 不需要安装 Node.js、Python、Java 或 WebView2，不需要管理员权限。',
      '4. 请保留整个文件夹；不能仅复制 adfish.exe。',
      '5. 双击“创建快捷方式.cmd”可创建名为 adfish 的桌面快捷方式。', '',
      '点击“探索精选”浏览网页；Ctrl+L 输入网址；Ctrl+Shift+A 切换网页与广告。',
      '首次运行默认开启隐身：移出隐藏，回原位置显示；启动后将鼠标移至主屏右下角、任务栏上方可唤回窗口。',
      '拖动顶部栏空白处移动窗口；拖动边缘缩放；通过右上角 ⋯ 菜单打开设置、调整音量和置顶。',
      '网页默认随窗口等比例缩放，文字也会缩小，长页面仍需上下滚动。', '',
      '设置和浏览数据保存在所用架构文件夹下的 data 目录。',
      '目录不可写时，自动使用当前用户的 %APPDATA%\\AdWindow。',
      '分发包不含开发者或其他用户的浏览记录、Cookie、个人设置。',
      '支持 Windows 10/11 x64、ARM64；不支持 Windows 7/8/XP 或 32 位 Windows。',
      '此版本尚未进行应用代码签名，Windows 可能显示发布者未知的提示。'
    ].join('\r\n'), 'utf8');
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    const temporaryZip = path.join(dist, `${bundleName}-${Date.now()}.zip`);
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/zip-directory.ps1'), '-Source', bundle, '-Destination', temporaryZip], { windowsHide: true, maxBuffer: 1024 * 1024 });
    const target = path.join(dist, `${bundleName}.zip`);
    if (fs.existsSync(target)) fs.renameSync(target, path.join(dist, `${bundleName}-previous-${Date.now()}.zip`));
    fs.renameSync(temporaryZip, target);
    const digest = createHash('sha256');
    for await (const chunk of fs.createReadStream(target)) digest.update(chunk);
    fs.writeFileSync(`${target}.sha256`, `${digest.digest('hex')}  ${path.basename(target)}\n`);
    console.log(`Ready: ${target} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MiB)`);
  } finally {
    const resolved = path.resolve(staging);
    if (path.dirname(resolved) !== path.resolve(root) || !path.basename(resolved).startsWith('release-distribution-')) throw new Error('Unexpected staging cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

build().catch(error => { console.error(error); process.exitCode = 1; });
