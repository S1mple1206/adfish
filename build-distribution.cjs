const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = __dirname;
const architectures = ['x64', 'arm64'];

async function build() {
  const { packager } = await import('@electron/packager');
  const staging = fs.mkdtempSync(path.join(root, 'release-distribution-'));
  try {
    const packages = await packager({
      dir: root, name: 'adfish', icon: path.join(root, 'assets', 'adfish.ico'),
      win32metadata: { ProductName: 'adfish', FileDescription: '摸鱼助手（adfish）' },
      platform: 'win32', arch: architectures, out: path.join(staging, 'build'),
      ignore: [/^\/release/, /^\/dist/, /^\/data/, /^\/webview2/, /^\/scripts/, /^\/\.git/, /^\/\.env/, /build-distribution\.cjs$/, /\.test\.js$/],
      ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: process.env.ELECTRON_ZIP_DIR } : {})
    });
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    for (const arch of architectures) {
      const source = packages.find(p => p.endsWith(`-${arch}`));
      if (!source || !fs.existsSync(path.join(source, 'adfish.exe'))) throw new Error(`Missing ${arch} executable`);
      const bundleName = `adfish-Windows-${arch}`;
      const bundle = path.join(staging, bundleName);
      fs.cpSync(source, bundle, { recursive: true, filter: source => path.basename(source) !== 'data' });
      fs.cpSync(path.join(root, '创建快捷方式.cmd'), path.join(bundle, '创建快捷方式.cmd'));
      fs.mkdirSync(path.join(bundle, 'scripts'));
      fs.cpSync(path.join(root, 'scripts', 'create-shortcut.ps1'), path.join(bundle, 'scripts', 'create-shortcut.ps1'));
      fs.writeFileSync(path.join(bundle, '使用说明.txt'), '\ufeff' + [
        `摸鱼助手（adfish）— Windows 10/11 ${arch} 便携版`, '',
        '1. 完整解压压缩包，双击 adfish.exe。',
        '2. x64 适用于 Intel/AMD 电脑；ARM64 适用于 Windows ARM 电脑。',
        '3. 不需要安装 Node.js、Python、Java 或 WebView2，不需要管理员权限。',
        '4. 请保留整个文件夹，不能仅复制 adfish.exe。',
        '5. 双击“创建快捷方式.cmd”可创建名为 adfish 的桌面快捷方式。', '',
        '启动后直接打开主页；顶部小房子图标返回主页；Ctrl+L 输入网址；顶部可后退、前进和刷新。',
        '首次运行默认开启隐身：移出隐藏，回原位置显示；启动后将鼠标移至主屏右下角、任务栏上方可唤回窗口。',
        '拖动顶部栏空白处移动窗口；拖动边缘缩放；通过右上角 ⋯ 菜单打开设置、调整音量和置顶。', '',
        '设置和浏览数据保存在 adfish.exe 旁的 data 目录。',
        '目录不可写时，自动使用当前用户的 %APPDATA%\\AdWindow。',
        '升级时如需保留登录和设置，请将旧版本使用的 data 目录复制到新版 adfish.exe 旁。',
        '不支持 Windows 7/8/XP 或 32 位 Windows。',
        '此版本未进行应用代码签名，Windows 可能显示发布者未知的提示。'
      ].join('\r\n'), 'utf8');
      const temporaryZip = path.join(dist, `${bundleName}-${Date.now()}.zip`);
      await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/zip-directory.ps1'), '-Source', bundle, '-Destination', temporaryZip], { windowsHide: true, maxBuffer: 1024 * 1024 });
      const target = path.join(dist, `${bundleName}.zip`);
      if (fs.existsSync(target)) fs.renameSync(target, path.join(dist, `${bundleName}-previous-${Date.now()}.zip`));
      fs.renameSync(temporaryZip, target);
      const digest = createHash('sha256');
      for await (const chunk of fs.createReadStream(target)) digest.update(chunk);
      fs.writeFileSync(`${target}.sha256`, `${digest.digest('hex')}  ${path.basename(target)}\n`);
      console.log(`Ready: ${target} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MiB)`);
    }
  } finally {
    const resolved = path.resolve(staging);
    if (path.dirname(resolved) !== path.resolve(root) || !path.basename(resolved).startsWith('release-distribution-')) throw new Error('Unexpected staging cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

build().catch(error => { console.error(error); process.exitCode = 1; });
