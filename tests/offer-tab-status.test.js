import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name, fromIndex = 0) {
  const start = html.indexOf(`function ${name}(`, fromIndex);
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

function createCleanOffer(name = 'Caribbean Escape') {
  return {
    name,
    ship: 'Arvia',
    price: '1669',
    day: '20',
    month: 'November 2026',
    ports: 'Barbados • Martinique • St Kitts',
    nights: '14',
    board: 'FB',
    boardlbl: 'Full Board',
    _img: 'hero-one.jpg',
    operator: 'po',
    tags: 'Cuisine · Entertainment · Family',
    _utm: 'https://example.com/?utm_source=klaviyo'
  };
}

function createHarness(offers) {
  const dots = Array.from({ length: 4 }, (_, index) => ({ id: `sd${index}`, className: '' }));
  const elements = Object.fromEntries(dots.map(dot => [dot.id, dot]));
  const context = {
    offers,
    cur: 0,
    OPERATOR_HEADERS: { po: { pngData: 'assets/operator-logos/po-cruises-logo.png' } },
    document: { getElementById: id => elements[id] || null },
    updateProductionStatus() {}
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('hasOperatorLogo'),
    extractFunction('isCleanOfferValid'),
    extractFunction('isOfferLoaded'),
    extractFunction('getOfferStatus'),
    extractFunction('updateAllStatus')
  ].join('\n'), context);
  return { context, dots };
}

test('offer tabs start grey instead of displaying a transient amber state before initial refresh', () => {
  for (let index = 0; index < 4; index += 1) {
    assert.match(html, new RegExp(`<span class="status-dot" id="sd${index}"><\\/span>`));
  }
});

test('each offer tab dot independently reflects the existing per-offer readiness status', () => {
  const green = createCleanOffer('Ready');
  const amber = { ...createCleanOffer('Partial'), _img: '' };
  const red = { ...createCleanOffer('Missing required'), ship: '' };
  const grey = {};
  const { context, dots } = createHarness([green, amber, red, grey]);

  context.updateAllStatus();

  assert.deepEqual(dots.map(dot => dot.className), [
    'status-dot green',
    'status-dot amber',
    'status-dot red',
    'status-dot'
  ]);
});

test('empty detection for tab dots reuses Campaign Health offer-loading logic', () => {
  const { context } = createHarness([{}, { ship: 'Arvia' }, { price: '1669' }, { _img: 'hero.jpg' }]);

  assert.equal(context.getOfferStatus(0), '');
  assert.equal(context.getOfferStatus(1), 'red');
  assert.equal(context.getOfferStatus(2), 'red');
  assert.equal(context.getOfferStatus(3), 'red');
});

test('editing, Sheet or CSV loading, restore and reorder refresh dots after readiness mutations', () => {
  const lastUp = html.lastIndexOf('function up(){');
  const up = extractFunction('up', lastUp);
  assert.ok(up.indexOf('genUtm()') < up.indexOf('updateAllStatus()'));

  const stableCsvWrapper = html.indexOf('const processSheetCSVStable = processSheetCSV;');
  const csvRefresh = html.slice(stableCsvWrapper, html.indexOf('// ═══════════════════════════════════════════════════════', stableCsvWrapper));
  assert.ok(csvRefresh.indexOf('genAllUtms(true)') < csvRefresh.indexOf('updateAllStatus()'));

  const restore = extractFunction('refreshAfterRestore');
  assert.ok(restore.indexOf('genAllUtms(true)') < restore.indexOf('updateAllStatus()'));

  const reorder = extractFunction('refreshAfterOfferReorder');
  assert.ok(reorder.indexOf('genAllUtms(true)') < reorder.indexOf('updateAllStatus()'));
  assert.match(extractFunction('removeHeroImage'), /refreshOfferUi\(\{utm:false,spell:false\}\)/);
  assert.match(extractFunction('readFile'), /readAsText[\s\S]*refreshOfferUi|refreshOfferUi[\s\S]*readAsText/);
});
