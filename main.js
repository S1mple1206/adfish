const { app, BrowserWindow, WebContentsView, ipcMain, Menu, screen, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolveAddress } = require('./url');
const themes = require('./themes.json');
const createAudioControl = require('./audio-control');
app.setName('adfish');
if (process.platform === 'win32') app.setAppUserModelId('adfish');

// Prefer portable storage; read-only locations use a writable per-user directory.
let dataDir = process.env.AD_BROWSER_TEST_DATA || path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname, 'data');
try {
  fs.mkdirSync(dataDir, { recursive: true });
  const probe = path.join(dataDir, `.write-check-${process.pid}-${Date.now()}`);
  fs.writeFileSync(probe, '', { flag: 'wx' });
  fs.unlinkSync(probe);
} catch (error) {
  if (process.env.AD_BROWSER_TEST_DATA) throw error;
  dataDir = path.join(app.getPath('appData'), 'AdWindow');
  fs.mkdirSync(dataDir, { recursive: true });
}
app.setPath('userData', dataDir);
const configFile = path.join(app.getPath('userData'), 'settings.json');
let config = { width: 360, height: 260, title: '今日精选', headline: themes.blue.headline, caption: themes.blue.caption, home: 'https://www.bing.com', top: false, autoScale: true, hoverBrowse: true, stealthMode: true, theme: 'blue', volume: 100, muted: false };
try { config = { ...config, ...JSON.parse(fs.readFileSync(configFile, 'utf8')) }; } catch { /* First launch uses defaults. */ }
if (!Object.hasOwn(themes, config.theme)) config.theme = 'blue';
config.volume = Number.isFinite(config.volume) ? Math.max(0, Math.min(100, Math.round(config.volume))) : 100;
config.muted = !!config.muted;
config.stealthMode = !!config.stealthMode;
if (config.headline === '好物，让生活更轻松。') config.headline = '好声音，随时相伴。';
if (config.caption === '发现实用灵感，开启今日精选。') config.caption = '把喜欢的旋律，带进日常。';
let win, view, menuWindow, ad = true, settings = false, failure = '', status = '就绪', saveTimer, hoverTimer, navigationStarted = false, manualAd = false, menuOpen = false, menuHovered = false, addressOpen = false, edgeResizeBounds, audioControl, audioError = '', stealthHidden = false, stealthBounds;
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
const shellURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const menuURL = pathToFileURL(path.join(__dirname, 'menu.html')).href;
function closeWindowMenu() { if (menuWindow && !menuWindow.isDestroyed()) menuWindow.close(); }
function save() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(`${configFile}.tmp`, JSON.stringify(config, null, 2));
    fs.renameSync(`${configFile}.tmp`, configFile);
    return true;
  } catch { status = '设置保存失败，请检查目录权限'; return false; }
}
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  view.setBounds({ x: 2, y: 30, width: Math.max(1, width - 4), height: Math.max(1, height - 31) });
  // Keep a desktop-width layout; Chromium scales text, images and input coordinates together.
  const zoom = config.autoScale ? Math.min(5, Math.max(0.25, (width - 4) / 1280)) : 1;
  if (Math.abs(view.webContents.getZoomFactor() - zoom) > 0.0001) view.webContents.setZoomFactor(zoom);
  const visible = !ad && !settings && !addressOpen && !failure;
  if (view.getVisible() !== visible) view.setVisible(visible);
  if (!visible && !menuOpen && win.isVisible()) win.webContents.focus();
}
function syncStealthMode() {
  if (!win || win.isDestroyed() || win.isMinimized()) return false;
  if (!config.stealthMode) {
    if (!stealthHidden) return false;
    stealthHidden = false;
    win.showInactive(); win.moveTop();
    return true;
  }
  const point = screen.getCursorScreenPoint();
  const bounds = stealthHidden ? stealthBounds : win.getBounds();
  // Include the native resize edge so ordinary border dragging stays usable.
  const inside = point.x >= bounds.x - 8 && point.x < bounds.x + bounds.width + 8 && point.y >= bounds.y - 8 && point.y < bounds.y + bounds.height + 8;
  const menuBounds = menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible() ? menuWindow.getBounds() : undefined;
  const insideMenu = menuBounds && point.x >= menuBounds.x && point.x < menuBounds.x + menuBounds.width && point.y >= menuBounds.y && point.y < menuBounds.y + menuBounds.height;
  if (inside || insideMenu) {
    if (!stealthHidden) return false;
    stealthHidden = false;
    win.showInactive(); win.moveTop();
    return true;
  }
  if (win.isVisible()) {
    stealthBounds = win.getBounds(); stealthHidden = true;
    closeWindowMenu(); win.hide();
    return true;
  }
  return false;
}
function syncHoverMode() {
  if (!config.hoverBrowse || settings || menuOpen || addressOpen || !win || win.isDestroyed()) return false;
  const { x, y } = screen.getCursorScreenPoint();
  const bounds = win.getContentBounds();
  const insideWindow = win.isVisible() && !win.isMinimized() && x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
  // The 29px header plus its 1px outer border is excluded, including the close button.
  const insideContent = insideWindow && y >= bounds.y + 30;
  if (!insideWindow) manualAd = false;
  const nextAd = !insideContent || manualAd;
  const changed = ad !== nextAd;
  ad = nextAd;
  return changed;
}
function publish() {
  if (!win || win.isDestroyed()) return;
  syncHoverMode();
  const wc = view.webContents;
  layout();
  const state = { config, theme: themes[config.theme], ad, settings, menuOpen, addressOpen, audioError, failure, status, zoom: wc.getZoomFactor(), url: wc.getURL(), back: wc.navigationHistory.canGoBack(), forward: wc.navigationHistory.canGoForward(), loading: wc.isLoading(), size: win.getContentSize() };
  win.webContents.send('state', state);
  if (menuWindow && !menuWindow.isDestroyed()) menuWindow.webContents.send('state', state);
}
async function navigate(input) {
  const target = resolveAddress(input);
  addressOpen = false;
  navigationStarted = true;
  manualAd = false;
  ad = false; failure = ''; status = '正在加载…'; publish();
  try { await view.webContents.loadURL(target); }
  catch (error) { if (error.code !== 'ERR_ABORTED') { failure = `网页未能打开：${error.code || '网络连接失败'}`; status = failure; publish(); } }
}
function returnToAd() { manualAd = true; ad = true; publish(); }
function openBrowser() {
  manualAd = false; ad = false;
  if (!view.webContents.getURL() || failure) navigate(config.home);
  else publish();
}
function toggleAd() { if (ad) openBrowser(); else returnToAd(); }
function focusAddress() {
  addressOpen = true;
  closeWindowMenu();
  publish();
  win.webContents.focus();
  win.webContents.send('focus-address');
}

app.whenReady().then(() => {
  const area = screen.getPrimaryDisplay().workArea;
  config.width = Math.min(area.width, Math.max(300, Number(config.width) || 360));
  config.height = Math.min(area.height, Math.max(220, Number(config.height) || 260));
  win = new BrowserWindow({ x: area.x + area.width - config.width - 16, y: area.y + area.height - config.height - 16, width: config.width, height: config.height, minWidth: 300, minHeight: 220, frame: false, resizable: true, maximizable: false, fullscreenable: false, backgroundColor: '#f5f9ff', title: config.title, icon: path.join(__dirname, 'assets', 'adfish.ico'), alwaysOnTop: !!config.top, show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  if (process.platform === 'win32') {
    // Windows border stretching uses SC_SIZE even with maximizable disabled.
    win.hookWindowMessage(0x0112, wParam => {
      if ((wParam.readUInt32LE(0) & 0xfff0) === 0xf000) edgeResizeBounds = win.getBounds();
    });
  }
  view = new WebContentsView({ webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'persist:browsing' } });
  win.contentView.addChildView(view);
  function showWindowMenu() {
    if (menuOpen) { closeWindowMenu(); return; }
    const bounds = win.getBounds();
    const work = screen.getDisplayMatching(bounds).workArea;
    const width = Math.min(220, work.width), height = Math.min(205, work.height);
    menuWindow = new BrowserWindow({ parent: win, width, height,
      x: Math.max(work.x, Math.min(bounds.x + bounds.width - width, work.x + work.width - width)),
      y: Math.max(work.y, Math.min(bounds.y + 30, work.y + work.height - height)),
      frame: false, resizable: false, maximizable: false, fullscreenable: false, minimizable: false,
      skipTaskbar: true, show: false, alwaysOnTop: !!config.top, backgroundColor: '#f5f9ff',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    menuHovered = false;
    menuOpen = true; publish();
    menuWindow.webContents.on('will-navigate', event => event.preventDefault());
    menuWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    menuWindow.on('blur', () => {
      const point = screen.getCursorScreenPoint(), b = win.getContentBounds();
      const buttonWidth = b.width >= 481 ? 32 : 28;
      // Let clicking the parent menu button toggle it instead of closing then reopening.
      if (point.x >= b.x + b.width - 2 * buttonWidth - 1 && point.x < b.x + b.width - buttonWidth - 1 && point.y >= b.y && point.y < b.y + 30) return;
      closeWindowMenu();
    });
    menuWindow.on('closed', () => { menuWindow = undefined; menuOpen = false; menuHovered = false; publish(); });
    menuWindow.loadFile('menu.html');
    menuWindow.once('ready-to-show', () => { if (menuWindow && !menuWindow.isDestroyed()) { publish(); menuWindow.show(); } });
  }
  win.on('system-context-menu', event => { event.preventDefault(); showWindowMenu(); });
  win.webContents.on('context-menu', showWindowMenu);
  const wc = view.webContents;
  wc.setAudioMuted(config.muted || config.volume === 0);
  audioControl = createAudioControl(app, error => {
    if (audioError !== error) { audioError = error; publish(); }
  });
  audioControl.apply(config.volume, config.muted);
  wc.setZoomMode('isolated');
  wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  wc.session.setPermissionCheckHandler(() => false);
  wc.session.on('will-download', (_event, item) => {
    const target = dialog.showSaveDialogSync(win, { title: '保存下载文件', defaultPath: item.getFilename() });
    if (!target) return item.cancel();
    item.setSavePath(target);
    item.once('done', (_e, state) => { status = state === 'completed' ? '下载完成' : '下载未完成'; publish(); });
  });
  const guardNavigation = (event, url) => { try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) event.preventDefault(); } catch { event.preventDefault(); } };
  wc.on('will-navigate', guardNavigation);
  wc.on('will-redirect', guardNavigation);
  wc.setWindowOpenHandler(({ url }) => { try { const target = resolveAddress(url); navigate(target); } catch { status = '此链接类型暂不支持'; publish(); } return { action: 'deny' }; });
  wc.on('did-start-loading', () => { failure = ''; status = '正在加载…'; publish(); });
  wc.on('did-stop-loading', () => { if (!failure) status = '就绪'; publish(); });
  wc.on('did-fail-load', (_e, code, description, _url, mainFrame) => { if (mainFrame && code !== -3) { failure = `网页未能打开：${description}`; status = failure; publish(); } });
  wc.on('render-process-gone', () => { failure = '网页进程已停止，请刷新重试'; status = failure; publish(); });
  for (const event of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-finish-load']) wc.on(event, publish);
  function shortcut(event, input) {
    if (input.type !== 'keyDown') return;
    if (input.control && input.shift && input.key.toLowerCase() === 'a') { event.preventDefault(); toggleAd(); }
    if (input.control && input.key.toLowerCase() === 'l') { event.preventDefault(); focusAddress(); }
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { event.preventDefault(); if (wc.getURL()) wc.reload(); }
    if (input.alt && input.key === 'ArrowLeft' && wc.navigationHistory.canGoBack()) { event.preventDefault(); wc.navigationHistory.goBack(); }
    if (input.alt && input.key === 'ArrowRight' && wc.navigationHistory.canGoForward()) { event.preventDefault(); wc.navigationHistory.goForward(); }
  }
  wc.on('before-input-event', shortcut); win.webContents.on('before-input-event', shortcut);
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ipcMain.handle('command', async (event, action, value) => {
    const fromMain = event.sender === win.webContents && event.senderFrame?.url === shellURL;
    const fromMenu = menuWindow && !menuWindow.isDestroyed() && event.sender === menuWindow.webContents && event.senderFrame?.url === menuURL;
    if (!fromMain && !fromMenu) return { error: '无效调用' };
    try {
      switch (action) {
        case 'ready': publish(); break;
        case 'focus-address': focusAddress(); break;
        case 'address': addressOpen = !!value; break;
        case 'close-menu': closeWindowMenu(); break;
        case 'menu-settings': settings = true; closeWindowMenu(); publish(); win.webContents.focus(); win.webContents.send('open-settings'); break;
        case 'audio': {
          const volume = value.volume === undefined ? config.volume : Number(value.volume);
          if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new Error('音量范围为 0–100');
          config.volume = volume;
          if (value.muted !== undefined) config.muted = !!value.muted;
          wc.setAudioMuted(config.muted || config.volume === 0);
          audioControl.apply(config.volume, config.muted);
          if (!save()) throw new Error(status);
          break;
        }
        case 'menu': showWindowMenu(); break;
        case 'navigate': await navigate(value); break;
        case 'back': if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); ad = false; break;
        case 'forward': if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); ad = false; break;
        case 'reload': if (wc.getURL()) { failure = ''; wc.reload(); } break;
        case 'toggle-ad': toggleAd(); break;
        case 'return-ad': returnToAd(); break;
        case 'open-browser': openBrowser(); break;
        case 'settings': settings = !!value; break;
        case 'minimize': win.minimize(); break;
        case 'close': win.close(); return {};
        case 'save': {
          if (value.theme !== undefined) {
            if (!Object.hasOwn(themes, value.theme)) throw new Error('请选择有效的界面风格');
            if (value.theme !== config.theme) {
              for (const field of ['headline', 'caption']) {
                if (value[field] === undefined && config[field] === themes[config.theme][field]) value[field] = themes[value.theme][field];
              }
            }
          }
          value = { ...config, ...value };
          const width = Number(value.width), height = Number(value.height);
          if (!Number.isInteger(width) || !Number.isInteger(height) || width < 300 || height < 220 || width > 3840 || height > 2160) throw new Error('窗口尺寸范围：宽 300–3840，高 220–2160');
          const home = resolveAddress(value.home);
          config = { ...config, theme: value.theme, width: Math.min(width, area.width), height: Math.min(height, area.height), title: String(value.title).trim().slice(0, 30) || '今日精选', headline: String(value.headline).trim().slice(0, 60) || themes[value.theme].headline, caption: String(value.caption).trim().slice(0, 120), home, top: !!value.top, autoScale: value.autoScale === undefined ? config.autoScale : !!value.autoScale, hoverBrowse: value.hoverBrowse === undefined ? config.hoverBrowse : !!value.hoverBrowse, stealthMode: !!value.stealthMode };
          const bounds = win.getBounds();
          const workArea = screen.getDisplayMatching(bounds).workArea;
          edgeResizeBounds = undefined;
          win.setBounds({ width: config.width, height: config.height, x: Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - config.width)), y: Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - config.height)) });
          win.setTitle(config.title); win.setAlwaysOnTop(config.top);
          if (menuWindow && !menuWindow.isDestroyed()) menuWindow.setAlwaysOnTop(config.top);
          status = '设置已保存';
          if (!save()) throw new Error(status);
          break;
        }
        default: throw new Error('未知操作');
      }
      publish(); return {};
    } catch (error) { return { error: error.message }; }
  });
  win.on('resize', () => {
    if (edgeResizeBounds) {
      const bounds = win.getBounds();
      const work = screen.getDisplayMatching(bounds).workArea;
      const verticalStretch = Math.abs(bounds.y - work.y) <= 2 && bounds.height >= work.height - 2 && bounds.width === edgeResizeBounds.width;
      const horizontalStretch = Math.abs(bounds.x - work.x) <= 2 && bounds.width >= work.width - 2 && bounds.height === edgeResizeBounds.height;
      if (verticalStretch || horizontalStretch) {
        const previous = edgeResizeBounds;
        edgeResizeBounds = undefined;
        win.setBounds(previous);
        return;
      }
    }
    [config.width, config.height] = win.getSize(); publish(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 300);
  });
  win.on('close', () => { save(); closeWindowMenu(); });
  win.on('closed', () => { clearInterval(hoverTimer); clearTimeout(saveTimer); audioControl.close(); if (!wc.isDestroyed()) wc.close(); });
  hoverTimer = setInterval(() => {
    if (menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible()) {
      const point = screen.getCursorScreenPoint(), bounds = menuWindow.getContentBounds();
      const inside = point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height;
      if (inside) menuHovered = true;
      else if (menuHovered) closeWindowMenu();
    }
    if (syncStealthMode()) publish();
    if (stealthHidden || !config.hoverBrowse || settings || menuOpen || addressOpen || win.isDestroyed()) return;
    if (syncHoverMode()) publish();
    if (!ad && !navigationStarted) navigate(config.home);
  }, 100);
  Menu.setApplicationMenu(null);
  win.loadFile('index.html');
  win.once('ready-to-show', () => { win.show(); syncStealthMode(); publish(); });
});
app.on('window-all-closed', () => app.quit());
