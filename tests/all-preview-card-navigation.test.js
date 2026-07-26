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
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function createHarness() {
  const calls = [];
  const offers = [
    { name: 'Offer 1', price: '100' },
    { name: 'Offer 2', price: '200' },
    { name: 'Offer 3', price: '300' },
    { name: 'Offer 4', price: '400' }
  ];
  const context = {
    offers,
    cur: 0,
    viewMode: 'all',
    calls,
    resetPasteOfferState: () => calls.push(['resetPasteOfferState']),
    syncOfferSelector: () => calls.push(['syncOfferSelector']),
    syncViewSelector: () => calls.push(['syncViewSelector']),
    loadOfferToEditor: index => calls.push(['loadOfferToEditor', index, offers[index].name]),
    updateLockUI: () => calls.push(['updateLockUI']),
    genUtm: () => calls.push(['genUtm']),
    genStandardUtms: () => calls.push(['genStandardUtms']),
    updateAllStatus: () => calls.push(['updateAllStatus']),
    updateExportFilenames: () => calls.push(['updateExportFilenames']),
    updateMoveOfferButtons: () => calls.push(['updateMoveOfferButtons']),
    renderPreviewMode: skipSave => calls.push(['renderPreviewMode', skipSave]),
    queueAutosave: () => calls.push(['queueAutosave'])
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('editOfferFromAllPreview'), context);
  vm.runInContext(extractFunction('handleAllPreviewCardKeydown'), context);
  return context;
}

test('clicking an All 4 preview card selects that offer and switches to Single without changing offer data', () => {
  const context = createHarness();
  const before = JSON.parse(JSON.stringify(context.offers));

  context.editOfferFromAllPreview(2);

  assert.equal(context.cur, 2);
  assert.equal(context.viewMode, 'single');
  assert.deepEqual(context.offers, before);
  assert.deepEqual(context.calls.slice(0, 4), [
    ['resetPasteOfferState'],
    ['syncOfferSelector'],
    ['syncViewSelector'],
    ['loadOfferToEditor', 2, 'Offer 3']
  ]);
  assert.ok(context.calls.some(call => call[0] === 'renderPreviewMode' && call[1] === true), 'Single preview should render without committing data');
  assert.deepEqual(context.calls.at(-1), ['queueAutosave']);
});

test('All 4 rendered cards expose click, keyboard, and accessible edit affordances', () => {
  assert.match(html, /\.all-preview-card\{[^}]*cursor:default;[^}]*transition:transform \.18s ease,box-shadow \.18s ease,outline-color \.18s ease;/);
  assert.match(html, /\.all-preview-card:hover,\.all-preview-card:focus-visible\{[^}]*transform:translateY\(-4px\);[^}]*outline:2px solid rgba\(158,147,108,\.42\);/);
  const renderer = extractFunction('renderPreviewMode');
  assert.match(renderer, /loadedPreviewOffers\.map\(function\(item, loadedIndex\)\{/);
  assert.match(renderer, /const d = item\.data;[\s\S]*?const index = item\.index;/);
  assert.match(renderer, /c\.className = 'all-preview-card'/);
  assert.match(renderer, /c\.setAttribute\('role', 'button'\);/);
  assert.match(renderer, /c\.setAttribute\('tabindex', '0'\);/);
  assert.match(renderer, /'Edit Offer ' \+ \(index \+ 1\)/);
  assert.match(renderer, /c\.addEventListener\('click', function\(\)\{ editOfferFromAllPreview\(index\); \}\);/);
  assert.match(renderer, /c\.addEventListener\('keydown', function\(event\)\{ handleAllPreviewCardKeydown\(event, index\); \}\);/);
});

test('keyboard activation on an All 4 preview card follows the same navigation path', () => {
  const context = createHarness();
  let prevented = false;

  context.handleAllPreviewCardKeydown({ key: 'Enter', preventDefault: () => { prevented = true; } }, 3);

  assert.equal(prevented, true);
  assert.equal(context.cur, 3);
  assert.equal(context.viewMode, 'single');
  assert.ok(context.calls.some(call => call[0] === 'loadOfferToEditor' && call[1] === 3 && call[2] === 'Offer 4'));
});

test('export rendering remains isolated from All 4 preview navigation wrappers', () => {
  const exportRenderer = extractFunction('renderCardToImageBlob');
  const exportAll = extractFunction('exportAllJPG');

  assert.match(exportRenderer, /wrap\.innerHTML = renderCardHTML\(offerData\);/);
  assert.doesNotMatch(exportRenderer, /all-preview-card|editOfferFromAllPreview|handleAllPreviewCardKeydown|renderPreviewMode/);
  assert.match(exportAll, /const blob=await renderCardToImageBlob\(o,'image\/jpeg',0\.92\);/);
  assert.doesNotMatch(exportAll, /all-preview-card|editOfferFromAllPreview|handleAllPreviewCardKeydown|renderPreviewMode/);
});
