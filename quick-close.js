const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const keys = { Alt: 18, Control: 17, Shift: 16, Meta: 91, Escape: 27, Space: 32, Enter: 13, Tab: 9, Backspace: 8, Delete: 46, Insert: 45, Home: 36, End: 35, PageUp: 33, PageDown: 34, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
for (const key of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') keys[key] = key.charCodeAt(0);
for (let i = 1; i <= 24; i++) keys[`F${i}`] = 111 + i;

function createQuickClose(app, onClose, onToggleHide, onError) {
  let stopped = false, enabled = false, capturing = false, key = 'Control', ready = false;
  let script = path.join(__dirname, 'quick-close.ps1');
  if (app.isPackaged) {
    const extracted = path.join(app.getPath('userData'), 'quick-close-helper.ps1');
    fs.writeFileSync(extracted, fs.readFileSync(script));
    script = extracted;
  }
  const worker = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const fail = () => { if (!stopped) onError('快速关闭暂不可用，请使用窗口关闭按钮。'); };
  worker.on('error', fail);
  worker.on('exit', fail);
  worker.stderr.on('data', fail);
  worker.stdin.on('error', fail);
  function update() {
    if (!stopped && worker.stdin.writable && !worker.stdin.destroyed && worker.exitCode === null) { ready = false; worker.stdin.write(`${enabled && !capturing ? keys[key] : 0},${capturing ? 0 : 18}\n`); }
  }
  readline.createInterface({ input: worker.stdout }).on('line', line => {
    if (line === 'ready') update();
    if (line === 'configured') { ready = true; onError(''); }
    if (line === 'hide' && !capturing && !stopped) onToggleHide();
    if (line === 'close' && enabled && !capturing && !stopped) onClose();
  });
  return {
    get ready() { return ready; },
    apply(nextEnabled, nextKey) { enabled = nextEnabled; key = nextKey; update(); },
    capture(value) { capturing = value; update(); },
    close() { stopped = true; worker.stdin.end(); worker.kill(); }
  };
}
module.exports = { keys, createQuickClose };
