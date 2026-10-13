const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const fs = require('node:fs');

module.exports = function createAudioControl(app, onError) {
  let volume = 100, muted = false, stopped = false;
  let script = path.join(__dirname, 'audio-volume.ps1');
  if (app.isPackaged) {
    // PowerShell cannot open files inside app.asar; extract the bundled helper locally.
    const extracted = path.join(app.getPath('userData'), 'audio-volume-helper.ps1');
    fs.writeFileSync(extracted, fs.readFileSync(script));
    script = extracted;
  }
  const worker = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const fail = () => { if (!stopped) onError('音量调节暂不可用，静音仍可使用。'); };
  worker.on('error', fail);
  worker.on('exit', fail);
  worker.stdin.on('error', fail);
  worker.stderr.on('data', fail);
  readline.createInterface({ input: worker.stdout }).on('line', line => {
    try { onError(JSON.parse(line).ok ? '' : '音量调节暂不可用，静音仍可使用。'); } catch { fail(); }
  });
  function update() {
    if (stopped || worker.stdin.destroyed || !worker.stdin.writable || worker.exitCode !== null) return;
    const pids = [...new Set([process.pid, ...app.getAppMetrics().map(metric => metric.pid)])];
    worker.stdin.write(JSON.stringify({ volume, muted: muted || volume === 0, pids, readOnly: false }) + '\n');
  }
  // Catch audio sessions created by newly opened pages or changed output devices.
  const timer = setInterval(update, 1000);
  return {
    apply(nextVolume, nextMuted) { volume = nextVolume; muted = nextMuted; update(); },
    close() { stopped = true; clearInterval(timer); worker.stdin.end(); worker.kill(); }
  };
};
