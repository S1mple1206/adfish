const $ = id => document.getElementById(id);
let state, settingsSaveTimer, pendingSetting;
async function command(action, value) {
  const result = await window.browser.command(action, value);
  if (result?.error) {
    if (action === 'save') $('settings-error').textContent = result.error;
    else $('address-error').textContent = result.error;
  }
  return result;
}
window.browser.onState(next => {
  const themeChanged = state?.config.theme !== next.config.theme;
  state = next;
  document.documentElement.dataset.theme = next.config.theme;
  if ($('ad-art').getAttribute('src') !== next.theme.image) $('ad-art').src = next.theme.image;
  $('ad-art').alt = next.theme.alt;
  $('ad-intro').textContent = next.theme.intro;
  $('menu-button').setAttribute('aria-expanded', String(next.menuOpen));
  for (const key of ['title', 'headline', 'caption']) $(key).textContent = next.config[key];
  $('headline').textContent = next.config.headline === next.theme.headline ? next.config.headline.replace('，', '，\n') : next.config.headline;
  if (themeChanged && $('settings-dialog').open) {
    for (const field of ['headline', 'caption', 'theme']) $('settings-form').elements[field].value = next.config[field];
  }
  $('home').hidden = !next.ad;
  document.body.classList.toggle('cover', next.ad);
  $('error-panel').hidden = !next.failure || next.ad;
  $('error-detail').textContent = next.failure;
  if (document.activeElement !== $('address')) $('address').value = next.url;
  if (!next.addressOpen && $('address-dialog').open) $('address-dialog').close();
  if (!next.settings && $('settings-dialog').open) $('settings-dialog').close();
});
window.browser.onFocusAddress(() => {
  $('address-error').textContent = '';
  if (!$('address-dialog').open) $('address-dialog').showModal();
  $('address').focus(); $('address').select();
});
document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') { event.preventDefault(); command('toggle-ad'); }
  else if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); command('focus-address'); }
});
$('address-form').onsubmit = async event => {
  event.preventDefault();
  const result = await command('navigate', $('address').value);
  if (result?.error) $('address-error').textContent = result.error;
};
$('cancel-address').onclick = () => command('address', false);
$('address-dialog').addEventListener('cancel', event => { event.preventDefault(); command('address', false); });
for (const action of ['minimize', 'close']) $(action).onclick = () => command(action);
$('menu-button').onclick = () => command('menu');
$('brand-home').onclick = () => command('return-ad');
$('explore').onclick = () => command('open-browser');
$('retry').onclick = () => command('reload');
async function openSettings() {
  if ($('settings-dialog').open) return;
  const form = $('settings-form');
  for (const key of ['width', 'height', 'title', 'headline', 'caption', 'home', 'theme']) form.elements[key].value = state.config[key];
  form.elements.autoScale.checked = state.config.autoScale;
  form.elements.hoverBrowse.checked = state.config.hoverBrowse;
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
