const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAddress } = require('./url');
test('网址、搜索和危险协议边界', () => {
  assert.equal(resolveAddress('example.com/a'), 'https://example.com/a');
  assert.equal(resolveAddress('localhost:8080/a'), 'http://localhost:8080/a');
  assert.equal(resolveAddress('中文 搜索'), 'https://www.bing.com/search?q=%E4%B8%AD%E6%96%87%20%E6%90%9C%E7%B4%A2');
  for (const input of ['', 'file:///C:/Windows', 'javascript:alert(1)', 'https://user:pass@example.com']) assert.throws(() => resolveAddress(input));
});
