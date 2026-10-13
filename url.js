const allowed = new Set(['http:', 'https:']);
function resolveAddress(input) {
  const value = String(input ?? '').trim();
  if (!value) throw new Error('请输入网址或搜索内容');
  if (/^[a-z][\w+.-]*:/i.test(value) && !/^[\w.-]+:\d+(\/|$)/.test(value)) {
    const url = new URL(value);
    if (!allowed.has(url.protocol) || url.username || url.password) throw new Error('仅支持普通 HTTP / HTTPS 网址');
    return url.href;
  }
  if (!/\s/.test(value) && (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#]|$)/i.test(value))) {
    return resolveAddress(`${/^(localhost|127\.)/.test(value) ? 'http' : 'https'}://${value}`);
  }
  return `https://www.bing.com/search?q=${encodeURIComponent(value)}`;
}
module.exports = { resolveAddress };
