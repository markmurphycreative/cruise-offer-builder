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
  const elements = {
    ...Object.fromEntries(dots.map(dot => [dot.id, dot])),
    'g-campaign': { value: 'summer-cruises' },
    'g-date': { value: '16th May 2026' },
    'g-airport': { value: 'Newcastle' },
    'g-terms': { value: 'T&Cs Apply' },
    'prod-status-summary': { className: '', innerHTML: '' },
    'prod-status-list': { innerHTML: '' }
  };
  const context = {
    offers,
    cur: 0,
    OPERATOR_HEADERS: { po: { pngData: 'assets/operator-logos/po-cruises-logo.png' } },
    document: { getElementById: id => elements[id] || null }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('isOfferLoaded'),
    extractFunction('hasOperatorLogo'),
    extractFunction('getOfferReadiness'),
    extractFunction('isCleanOfferValid'),
    extractFunction('getOfferStatus'),
    extractFunction('updateProductionStatus'),
    extractFunction('updateAllStatus')
  ].join('\n'), context);
  return { context, dots, elements };
}

test('offer tabs start grey instead of displaying a transient amber state before initial refresh', () => {
  for (let index = 0; index < 4; index += 1) {
    assert.match(html, new RegExp(`<span class="status-dot" id="sd${index}"><\\/span>`));
  }
});

test('each offer tab dot independently reflects the existing per-offer readiness status', () => {
  const green = createCleanOffer('Ready');
  const amber = { ...createCleanOffer('Partial'), _utm: '' };
  const red = { ...createCleanOffer('Missing required'), _img: '' };
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

test('Campaign Health ready regression: all loaded export-ready offers display green without selector-only field gates', () => {
  const offers = Array.from({ length: 4 }, (_, index) => ({
    name: `Imported Offer ${index + 1}`,
    _img: `hero-${index + 1}.jpg`,
    operator: 'po',
    _utm: `https://example.com/${index + 1}?utm_source=klaviyo`
  }));
  const { context, dots, elements } = createHarness(offers);

  context.updateAllStatus();

  assert.equal(elements['prod-status-summary'].innerHTML, '✓ Ready for Export<br><span class="prod-status-secondary">No blockers found</span>');
  assert.deepEqual(dots.map(dot => dot.className), Array(4).fill('status-dot green'));
});

test('empty detection for tab dots reuses Campaign Health offer-loading logic', () => {
  const { context } = createHarness([{}, { ship: 'Arvia' }, { price: '1669' }, { _img: 'hero.jpg' }]);

  assert.equal(context.getOfferStatus(0), '');
  assert.equal(context.getOfferStatus(1), 'red');
  assert.equal(context.getOfferStatus(2), 'red');
  assert.equal(context.getOfferStatus(3), 'amber');
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
