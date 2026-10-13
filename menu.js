const $ = id => document.getElementById(id);
async function command(action, value, close = false) {
  try {
    const result = await window.browser.command(action, value);
    if (result?.error) { $('menu-error').textContent = result.error; $('menu-error').hidden = false; return; }
    if (close) await window.browser.command('close-menu');
  } catch { /* The parent may close this menu while opening an input or settings dialog. */ }
}
window.browser.onState(state => {
  document.documentElement.dataset.theme = state.config.theme;
  if (document.activeElement !== $('volume-level')) $('volume-level').value = state.config.volume;
  $('volume-value').textContent = `${state.config.volume}%`;
  $('volume-muted').checked = state.config.muted;
  $('top-toggle').checked = state.config.top;
  $('menu-error').textContent = state.audioError;
  $('menu-error').hidden = !state.audioError;
});
$('open-address').onclick = () => command('focus-address');
$('settings').onclick = () => command('menu-settings');
$('volume-level').oninput = () => command('audio', { volume: Number($('volume-level').value), muted: false });
$('volume-muted').onchange = () => command('audio', { muted: $('volume-muted').checked });
$('top-toggle').onchange = () => command('save', { top: $('top-toggle').checked });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); command('close-menu'); }
  if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); command('focus-address'); }
});
command('ready');
