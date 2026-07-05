import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('desktop window title bar uses neutral charcoal rather than CB Gold', () => {
  assert.match(html, /<meta name="theme-color" content="#2f3338">/);
  assert.match(html, /--desktop-titlebar-bg:#2f3338;--desktop-titlebar-fg:#f5f5f2;/);
  assert.match(html, /html,body\{[^}]*background:var\(--desktop-titlebar-bg,var\(--bg\)\);\}/);
  assert.match(html, /body\{color-scheme:dark light;\}/);
  assert.match(html, /@media \(display-mode:browser\)\{html,body\{background:var\(--bg\);\}\}/);

  const titlebarBg = html.match(/--desktop-titlebar-bg:([^;]+);/)?.[1];
  const themeColor = html.match(/<meta name="theme-color" content="([^"]+)">/)?.[1];
  assert.notEqual(titlebarBg?.toLowerCase(), '#9e936c');
  assert.notEqual(themeColor?.toLowerCase(), '#9e936c');
  assert.notEqual(themeColor?.toLowerCase(), '#9e936c');
});
