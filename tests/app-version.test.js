import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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
  vm.runInContext(extractVersionBootstrap(source).replace('const APP_VERSION', 'var APP_VERSION'), context);
  return { context, labels };
}

test('the application version is defined once and hydrates every displayed version label', () => {
  assert.equal((html.match(/const APP_VERSION = "v1\.6\.3";/g) || []).length, 1);
  assert.equal((html.match(/data-app-version(?=[ >])/g) || []).length, 2);

  const { context, labels } = runVersionBootstrap();
  assert.equal(context.APP_VERSION, 'v1.6.3');
  assert.equal(context.document.title, 'Cruise Offer Builder v1.6.3 — Dawson & Sanderson');
  assert.deepEqual(labels.map(label => label.textContent), ['v1.6.3', 'v1.6.3']);
});

test('changing only APP_VERSION updates the title and every version label', () => {
  const changedHtml = html.replace('const APP_VERSION = "v1.6.3";', 'const APP_VERSION = "v9.9.9";');
  const { context, labels } = runVersionBootstrap(changedHtml);
  assert.equal(context.document.title, 'Cruise Offer Builder v9.9.9 — Dawson & Sanderson');
  assert.deepEqual(labels.map(label => label.textContent), ['v9.9.9', 'v9.9.9']);
});
