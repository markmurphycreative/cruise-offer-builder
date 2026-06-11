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
  const ids = ['exp-single-jpg-complete', 'exp-all-jpg-complete', 'exp-pack-complete'];
  ids.forEach(id => {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="Export completed"`));
    assert.match(html, new RegExp(`markExportComplete\\(["']${id}["']\\)`));
  });
  assert.match(html, /\.export-complete\{display:none;color:#b8f0c7;/);
  assert.match(html, /\.export-complete\.active\{display:inline;\}/);
  assert.doesNotMatch(extractFunction('markExportComplete'), /localStorage|sessionStorage/);
  assert.doesNotMatch(html, /class="export-complete active"/);
});


test('export toasts replace the active notification and dismiss automatically after 2.5 seconds', () => {
  assert.match(html, /id="export-toast" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /\.export-toast\{position:fixed;right:16px;bottom:16px;/);
  assert.match(html, /\.export-toast\.active\{opacity:1;visibility:visible;transform:translateY\(0\);\}/);

  const toast = { className: 'export-toast', textContent: '', offsetWidth: 0 };
  const timers = new Map();
  let timerId = 0;
  const context = {
    document: { getElementById: id => id === 'export-toast' ? toast : null },
    clearTimeout: id => timers.delete(id),
    setTimeout: (callback, delay) => { timerId += 1; timers.set(timerId, { callback, delay }); return timerId; }
  };
  vm.createContext(context);
  vm.runInContext(`var exportToastTimer;\n${extractFunction('showExportToast')}`, context);

  context.showExportToast('JPG exported successfully');
  assert.equal(toast.textContent, 'JPG exported successfully');
  assert.equal(toast.className, 'export-toast active');
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 2500);

  context.showExportToast('Export failed', 'error');
  assert.equal(toast.textContent, 'Export failed');
  assert.equal(toast.className, 'export-toast error active');
  assert.equal(timers.size, 1, 'replacing a toast clears its previous dismissal timer');

  [...timers.values()][0].callback();
  assert.equal(toast.className, 'export-toast');
});

test('all export entry points report their existing success and failure outcomes through toasts', () => {
  assert.match(extractFunction('exportCurrent'), /showExportToast\("Card exported successfully"\)/);
  assert.match(extractFunction('exportAll'), /showExportToast\("ZIP exported successfully"\)/);
  assert.match(extractFunction('exportCurrentJPG'), /showExportToast\('JPG exported successfully'\)/);
  assert.match(extractFunction('exportAllJPG'), /showExportToast\('ZIP exported successfully'\)/);
  assert.match(extractFunction('exportCampaignPack'), /showExportToast\('Campaign pack exported successfully'\)/);
  assert.match(extractFunction('exportAllJPG'), /showExportToast\('No offer loaded','error'\)/);
  ['exportCurrent', 'exportAll', 'exportCurrentJPG', 'exportAllJPG', 'exportCampaignPack'].forEach(name => {
    assert.match(extractFunction(name), /showExportToast\(['"]Export failed['"],["']error["']\)/);
  });
});


test('export panel exposes only the streamlined JPG and campaign-pack actions while retaining internal PNG support', () => {
  assert.match(html, /class="export-actions single-action">\s*<button class="export-btn single" onclick="exportCurrentJPG\(\)" id="exp-single-jpg-btn"/);
  assert.match(html, /class="export-actions single-action">\s*<button class="export-btn all" onclick="exportAllJPG\(\)" id="exp-all-jpg-btn"/);
  assert.match(html, /class="export-actions single-action">\s*<button class="export-btn all" onclick="exportCampaignPack\(\)" id="exp-pack-btn"/);
  assert.match(html, /id="exp-pack-lbl">Export Campaign Pack<\/span><span aria-hidden="true">Export Campaign Pack<\/span>/);
  assert.doesNotMatch(html, /id="exp-single-btn"/);
  assert.doesNotMatch(html, /id="exp-all-btn"/);
  assert.match(html, /function exportCurrent\(\)/);
  assert.match(html, /function exportAll\(\)/);
  assert.match(extractFunction('exportCurrentJPG'), /renderCardToImageBlob\(o,'image\/jpeg',0\.92\)/);
  assert.match(extractFunction('exportAllJPG'), /renderCardToImageBlob\(o,'image\/jpeg',0\.92\)/);
  assert.match(extractFunction('exportCampaignPack'), /renderCardToImageBlob\(o,'image\/png',1\.0\)/);
});

test('supported cruise operators receive their recommended empty hero imagery placeholders only when no hero image exists', () => {
  const expected = {
    po: ['P&amp;O Cruises', 'Destination Imagery Recommended'],
    marella: ['Marella Cruises', 'Beach &amp; Destination Imagery Recommended'],
    celebrity: ['Celebrity Cruises', 'Lifestyle &amp; Luxury Imagery Recommended'],
    royal: ['Royal Caribbean', 'Ship &amp; Destination Imagery Recommended'],
    fred: ['Fred. Olsen Cruise Lines', 'Scenic Destination Imagery Recommended'],
    cunard: ['Cunard', 'Elegant Destination Imagery Recommended'],
    princess: ['Princess Cruises', 'Destination &amp; Discovery Imagery Recommended'],
    msc: ['MSC Cruises', 'Mediterranean Lifestyle Imagery Recommended'],
    ncl: ['Norwegian Cruise Line', 'Destination &amp; Lifestyle Imagery Recommended'],
    virgin: ['Virgin Voyages', 'Lifestyle Imagery Recommended'],
    ambassador: ['Ambassador Cruise Line', 'Scenic Destination Imagery Recommended']
  };
  const placeholders = html.match(/const OPERATOR_HERO_PLACEHOLDERS = \{[\s\S]*?\n\};/)?.[0];
  assert.ok(placeholders, 'Could not locate OPERATOR_HERO_PLACEHOLDERS');
  const script = [
    placeholders.replace('const OPERATOR_HERO_PLACEHOLDERS', 'var OPERATOR_HERO_PLACEHOLDERS'),
    'function getOperatorSkinStyle(){ return ""; }',
    'function getHeaderHTML(){ return ""; }',
    extractFunction('cleanPortsDisplay'),
    extractFunction('chunkBullets'),
    extractFunction('escapeAttr'),
    extractFunction('getHeroImageSource'),
    extractFunction('renderHeroHTML'),
    extractFunction('renderCardHTML'),
    'result = Object.fromEntries(Object.keys(OPERATOR_HERO_PLACEHOLDERS).map(operator => [operator, { empty: renderCardHTML({operator}), image: renderCardHTML({operator, _img:"hero.jpg"}) }]));',
    'result.other = { empty: renderCardHTML({operator:"custom"}) };'
  ].join('\n');
  const context = { document: { getElementById: () => ({ value: '' }) }, result: null };
  vm.createContext(context);
  vm.runInContext(script, context);

  assert.deepEqual(Object.keys(context.result).filter(operator => operator !== 'other'), Object.keys(expected));
  Object.entries(expected).forEach(([operator, [name, recommendation]]) => {
    assert.match(context.result[operator].empty, new RegExp(`<div class="hph"><span>${name}</span><span>${recommendation}</span></div>`));
    assert.doesNotMatch(context.result[operator].image, new RegExp(recommendation));
  });
  assert.match(context.result.other.empty, /<div class="hph"><span><\/span><\/div>/);
});

test('empty hero placeholder text is approximately 25% larger without changing the hero dimensions or positioning styles', () => {
  assert.match(html, /\.cc \.hph\{width:1200px;height:849px;background:#b8ccd8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;\}/);
  assert.match(html, /\.cc \.hph span\{font-size:28px;font-weight:300;color:#5a7a90;font-family:'Montserrat',sans-serif;\}/);
});

test('required hero QA retains passive logic while adding a stronger warning treatment', () => {
  assert.match(html, /warnLbl:"⚠ Hero image required for export",warningClass:"hero-warning"/);
  assert.match(html, /\.prod-status-item\.hero-warning\{color:var\(--red\);background:#fff0f0;border:1px solid #f0b0b0;/);
  assert.match(html, /Passive checks only — no auto-correction\. Export is never blocked\./);
});

test('saved-session utility bar starts compact before autosave hydration', () => {
  assert.match(html, /<div class="session-status" id="saved-session-status" aria-live="polite"><span class="session-status-summary">No saved session<\/span><\/div>/);
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
  assert.equal(status.innerHTML, '<span class="session-status-summary">No saved session</span>');

  context.updateSavedSessionStatus({ savedAt: '2026-05-30T09:24:00Z', offers: [{ name: 'One' }, { price: '999' }, {}, { _img: 'hero.jpg' }] });
  assert.match(status.innerHTML, /^<span class="session-status-summary">✓ Session saved • 3 offers • \d{2}:\d{2}<\/span>$/);
  assert.doesNotMatch(extractFunction('updateSavedSessionStatus'), /setItem|removeItem/);
});
