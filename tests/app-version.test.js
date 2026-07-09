import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

function extractVersionBootstrap(source = html) {
  const match = source.match(/const APP_VERSION = "[^"]+";[\s\S]*?document\.querySelectorAll\("\[data-app-version\]"\)\.forEach\(label => \{ label\.textContent = APP_VERSION; \}\);/);
  assert.ok(match, 'Could not locate the APP_VERSION bootstrap');
  return match[0];
}

function runVersionBootstrap(source = html) {
  const labels = Array.from({ length: (source.match(/data-app-version(?=[ >])/g) || []).length }, () => ({ textContent: '' }));
  const context = {
    document: {
      title: '',
      querySelectorAll: selector => selector === '[data-app-version]' ? labels : []
    }
  };
  vm.createContext(context);
  vm.runInContext(extractVersionBootstrap(source).replace('const APP_VERSION', 'var APP_VERSION').replace('const APP_TITLE', 'var APP_TITLE'), context);
  return { context, labels };
}


test('static title and installed app metadata match the runtime browser/window title', () => {
  assert.match(html, /<title>em \| builder v4\.0<\/title>/);
  assert.match(html, /<meta name="application-name" content="em \| builder v4\.0">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="em v4\.0">/);
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  assert.equal(manifest.name, 'em | builder v4.0');
  assert.equal(manifest.short_name, 'em v4.0');
  assert.doesNotMatch(html, /Cruise Builder/);
  assert.doesNotMatch(JSON.stringify(manifest), /Cruise Builder/);
});

test('the application version is defined once and hydrates every displayed version label', () => {
  assert.equal((html.match(/const APP_VERSION = "v\d+\.\d+(?:\.\d+)?(?:\.\d+)?";/g) || []).length, 1);
  assert.equal((html.match(/data-app-version(?=[ >])/g) || []).length, 1);

  const { context, labels } = runVersionBootstrap();
  assert.equal(context.document.title, context.APP_TITLE);
  assert.deepEqual(labels.map(label => label.textContent), [context.APP_VERSION]);
});

test('changing only APP_VERSION updates the title and every version label', () => {
  const changedHtml = html.replace(/const APP_VERSION = "v\d+\.\d+(?:\.\d+)?(?:\.\d+)?";/, 'const APP_VERSION = "v9.9.9";');
  const { context, labels } = runVersionBootstrap(changedHtml);
  assert.equal(context.document.title, 'em | builder v9.9.9');
  assert.deepEqual(labels.map(label => label.textContent), ['v9.9.9']);
});

test('splash logo and navigation are centred by the shared lock-up without translate offsets', () => {
  assert.match(html, /\.splash-lockup\{[^}]*display:flex;[^}]*flex-direction:column;[^}]*align-items:center;[^}]*width:max-content;[^}]*margin:0 auto;/);
  assert.match(html, /<div class="splash-lockup">[\s\S]*?<img class="splash-icon"[\s\S]*?<div class="splash-actions">/);
  assert.doesNotMatch(html, /\.splash-actions\{[^}]*transform:translateX/);
});

test('splash saved session copy uses saved work wording', () => {
  assert.match(html, /name\.textContent="Saved work found";/);
  assert.doesNotMatch(html, /Previous work found/);
});
