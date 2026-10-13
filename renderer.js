const $ = id => document.getElementById(id);
let state, settingsSaveTimer, pendingSetting;
async function command(action, value) {
  const result = await window.browser.command(action, value);
  if (result?.error) {
    if (action === 'save') $('settings-error').textContent = result.error;
    else showAddressError(result.error);
  }
  return result;
}
window.browser.onState(next => {
  state = next;
  document.documentElement.dataset.theme = next.config.theme;
  $('menu-button').setAttribute('aria-expanded', String(next.menuOpen));
  $('back').disabled = !next.back;
  $('forward').disabled = !next.forward;
  $('reload').disabled = !next.url;
  document.title = next.config.title;
  $('error-panel').hidden = !next.failure;
  $('error-detail').textContent = next.failure;
  if (document.activeElement !== $('address')) {
    $('address').value = next.url;
    clearAddressError();
  }
  if (!next.settings && $('settings-dialog').open) $('settings-dialog').close();
});
function clearAddressError() {
  $('address').setCustomValidity('');
  $('address').removeAttribute('aria-invalid');
  $('address').title = '网址或搜索';
  $('address-error').textContent = '';
}
function showAddressError(message) {
  $('address-error').textContent = message;
  $('address').setCustomValidity(message);
  $('address').setAttribute('aria-invalid', 'true');
  $('address').title = message;
}
window.browser.onFocusAddress(async () => {
  if ($('settings-dialog').open) await closeSettings();
  clearAddressError();
  $('address').focus(); $('address').select();
});
$('address').oninput = clearAddressError;
$('address').onfocus = () => command('address-focus', true);
$('address').onblur = () => {
  command('address-focus', false);
  if (!$('address').hasAttribute('aria-invalid')) $('address').value = state?.url || '';
};
$('address').addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    clearAddressError(); $('address').value = state?.url || ''; $('address').blur();
  }
});
document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); command('focus-address'); }
});
$('address-form').onsubmit = async event => {
  event.preventDefault();
  clearAddressError();
  const result = await command('navigate', $('address').value);
  if (result?.error) $('address').reportValidity();
  else $('address').blur();
};
for (const action of ['minimize', 'close']) $(action).onclick = () => command(action);
$('menu-button').onclick = () => command('menu');
$('go-home').onclick = () => command('home');
for (const action of ['back', 'forward', 'reload']) $(action).onclick = () => command(action);
$('retry').onclick = () => command('reload');
async function openSettings() {
  if ($('settings-dialog').open) return;
  const form = $('settings-form');
  for (const key of ['width', 'height', 'title', 'home', 'theme']) form.elements[key].value = state.config[key];
  form.elements.autoScale.checked = state.config.autoScale;
  form.elements.stealthMode.checked = state.config.stealthMode;
  $('settings-error').textContent = '';
  $('settings-save-status').textContent = '修改后自动保存';
  await command('settings', true); $('settings-dialog').showModal();
}
window.browser.onOpenSettings(openSettings);
async function saveSetting() {
  clearTimeout(settingsSaveTimer);
  const input = pendingSetting;
  pendingSetting = undefined;
  if (!input) return;
  if (!input.checkValidity()) {
    $('settings-error').textContent = `${input.closest('label').firstChild.textContent.trim()}：${input.validationMessage}`;
    $('settings-save-status').textContent = '此项未保存，请填写有效值';
    return;
  }
  $('settings-error').textContent = '';
  $('settings-save-status').textContent = '正在保存…';
  const result = await command('save', { [input.name]: input.type === 'checkbox' ? input.checked : input.value });
  $('settings-save-status').textContent = result?.error ? '此项未保存' : '已自动保存';
}
async function closeSettings() {
  await saveSetting();
  await command('settings', false);
}
$('cancel-settings').onclick = closeSettings;
$('settings-dialog').addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
$('settings-form').addEventListener('input', event => {
  if (!event.target.name) return;
  pendingSetting = event.target;
  clearTimeout(settingsSaveTimer);
  $('settings-error').textContent = '';
  $('settings-save-status').textContent = '等待自动保存…';
  settingsSaveTimer = setTimeout(saveSetting, 400);
});
$('settings-form').addEventListener('change', event => {
  if (pendingSetting !== event.target) return;
  saveSetting();
});
$('settings-form').onsubmit = event => {
  event.preventDefault();
  saveSetting();
};
command('ready');
