import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not locate ${name}`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('successful export actions expose session-only green completion ticks', () => {
  const ids = ['exp-single-complete', 'exp-single-jpg-complete', 'exp-all-complete', 'exp-all-jpg-complete', 'exp-pack-complete'];
  ids.forEach(id => {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="Export completed"`));
    assert.match(html, new RegExp(`markExportComplete\\(["']${id}["']\\)`));
  });
  assert.match(html, /\.export-complete\{display:none;color:#b8f0c7;/);
  assert.match(html, /\.export-complete\.active\{display:inline;\}/);
  assert.doesNotMatch(extractFunction('markExportComplete'), /localStorage|sessionStorage/);
  assert.doesNotMatch(html, /class="export-complete active"/);
});

test('Celebrity Cruises alone receives the recommended empty hero imagery placeholder', () => {
  const script = [
    'function getOperatorSkinStyle(){ return ""; }',
    'function getHeaderHTML(){ return ""; }',
    extractFunction('cleanPortsDisplay'),
    extractFunction('chunkBullets'),
    extractFunction('renderCardHTML'),
    'result = { celebrity: renderCardHTML({operator:"celebrity"}), other: renderCardHTML({operator:"royal"}), image: renderCardHTML({operator:"celebrity", _img:"hero.jpg"}) };'
  ].join('\n');
  const context = { document: { getElementById: () => ({ value: '' }) }, result: null };
  vm.createContext(context);
  vm.runInContext(script, context);
  assert.match(context.result.celebrity, /Celebrity Cruises/);
  assert.match(context.result.celebrity, /Lifestyle &amp; Luxury Imagery Recommended/);
  assert.doesNotMatch(context.result.other, /Lifestyle &amp; Luxury Imagery Recommended/);
  assert.doesNotMatch(context.result.image, /Lifestyle &amp; Luxury Imagery Recommended/);
});

test('missing hero QA retains passive logic while adding a stronger warning treatment', () => {
  assert.match(html, /warnLbl:"⚠ Hero image missing",warningClass:"hero-warning"/);
  assert.match(html, /\.prod-status-item\.hero-warning\{color:var\(--red\);background:#fff0f0;border:1px solid #f0b0b0;/);
  assert.match(html, /Passive checks only — no auto-correction\. Export is never blocked\./);
});

test('saved-session summary reports the existing autosave payload without changing storage', () => {
  const status = { innerHTML: '' };
  const context = {
    document: { getElementById: id => id === 'saved-session-status' ? status : null },
    readSavedSession: () => null
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('formatAutosaveTime'),
    extractFunction('countLoadedSessionOffers'),
    extractFunction('updateSavedSessionStatus')
  ].join('\n'), context);

  context.updateSavedSessionStatus();
  assert.equal(status.innerHTML, '<strong>No Saved Session</strong>');

  context.updateSavedSessionStatus({ savedAt: '2026-05-30T09:24:00Z', offers: [{ name: 'One' }, { price: '999' }, {}, { _img: 'hero.jpg' }] });
  assert.match(status.innerHTML, /^<strong>Session Saved<\/strong>3 Offers Loaded<br>Last Updated: /);
  assert.doesNotMatch(extractFunction('updateSavedSessionStatus'), /setItem|removeItem/);
});
