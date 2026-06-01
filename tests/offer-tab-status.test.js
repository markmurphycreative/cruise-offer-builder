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
  const dots = Array.from({ length: 4 }, (_, index) => ({ id: `sd${index}`, className: '', title: '', setAttribute(name, value) { this[name] = value; } }));
  const tabs = Array.from({ length: 4 }, (_, index) => ({ id: `ot${index}`, title: '', setAttribute(name, value) { this[name] = value; } }));
  const elements = {
    ...Object.fromEntries(dots.map(dot => [dot.id, dot])),
    ...Object.fromEntries(tabs.map(tab => [tab.id, tab])),
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
    extractFunction('getMissingCriticalOfferFields'),
    extractFunction('hasCriticalOfferContent'),
    extractFunction('hasOperatorLogo'),
    extractFunction('getOfferReadiness'),
    extractFunction('isCleanOfferValid'),
    extractFunction('getOfferStatus'),
    extractFunction('getOfferStatusTooltip'),
    extractFunction('updateProductionStatus'),
    extractFunction('updateAllStatus')
  ].join('\n'), context);
  return { context, dots, tabs, elements };
}

test('offer tabs start grey instead of displaying a transient amber state before initial refresh', () => {
  for (let index = 0; index < 4; index += 1) {
    assert.match(html, new RegExp(`<span class="status-dot" id="sd${index}" title="No offer loaded" aria-hidden="true"><\/span>`));
  }
});


test('status dots remain diagnostic indicators inside the normal offer-tab buttons without navigation hooks', () => {
  for (let index = 0; index < 4; index += 1) {
    assert.match(html, new RegExp(`<button class="otab(?: active)?" id="ot${index}" onclick="sv\\(${index}\\)"[^>]*>[\\s\\S]*?<span class="status-dot" id="sd${index}" title="No offer loaded" aria-hidden="true"><\\/span><\\/button>`));
  }
  assert.doesNotMatch(html, /navigateOfferStatus|handleStatusDotKeydown|getOfferStatusNavigation|status-dot-target|scrollIntoView/);
});

test('each offer tab dot independently maps empty, incomplete, invalid and export-ready offers', () => {
  const green = createCleanOffer('Ready');
  const amber = { ...createCleanOffer('Incomplete'), _img: '' };
  const red = { ...createCleanOffer('Invalid'), price: '' };
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

test('offer selector tooltips explain green, amber, red and grey status using readiness details', () => {
  const offers = [
    createCleanOffer('Ready'),
    { ...createCleanOffer('Missing hero'), _img: '' },
    { ...createCleanOffer('Missing cruise price'), price: '' },
    {}
  ];
  const { context, dots, tabs } = createHarness(offers);

  context.updateAllStatus();

  assert.deepEqual(dots.map(dot => dot.title), [
    'Ready for export',
    'Hero image missing',
    'Price missing',
    'No offer loaded'
  ]);
  assert.deepEqual(tabs.map(tab => tab.title), dots.map(dot => dot.title));
  assert.deepEqual(tabs.map(tab => tab['aria-label']), [
    'Offer 1 status: Ready for export',
    'Offer 2 status: Hero image missing',
    'Offer 3 status: Price missing',
    'Offer 4 status: No offer loaded'
  ]);
});

test('amber tooltips use the most useful operator, logo and UTM blocker from existing readiness state', () => {
  const { context } = createHarness([
    { ...createCleanOffer('Missing operator'), operator: '' },
    { ...createCleanOffer('Missing logo'), operator: 'custom' },
    { ...createCleanOffer('Missing UTM'), _utm: '' },
    {}
  ]);

  assert.equal(context.getOfferStatusTooltip(0), 'Operator not selected');
  assert.equal(context.getOfferStatusTooltip(1), 'Operator logo missing');
  assert.equal(context.getOfferStatusTooltip(2), 'UTM missing');
});

test('selector-only critical content status does not alter Campaign Health readiness rules', () => {
  const offers = Array.from({ length: 4 }, (_, index) => ({
    name: `Imported Offer ${index + 1}`,
    _img: `hero-${index + 1}.jpg`,
    operator: 'po',
    _utm: `https://example.com/${index + 1}?utm_source=klaviyo`
  }));
  const { context, dots, elements } = createHarness(offers);

  context.updateAllStatus();

  assert.equal(elements['prod-status-summary'].innerHTML, '✓ Ready for Export<br><span class="prod-status-secondary">No blockers found</span>');
  assert.deepEqual(dots.map(dot => dot.className), Array(4).fill('status-dot red'));
});

test('empty detection for tab dots reuses Campaign Health offer-loading logic', () => {
  const { context } = createHarness([{}, { ship: 'Arvia' }, { price: '1669' }, { _img: 'hero.jpg' }]);

  assert.equal(context.getOfferStatus(0), '');
  assert.equal(context.getOfferStatus(1), 'red');
  assert.equal(context.getOfferStatus(2), 'red');
  assert.equal(context.getOfferStatus(3), 'red');
});


test('CSV-style loaded offers without images are amber and become green when images are added', () => {
  const offers = Array.from({ length: 4 }, (_, index) => ({ ...createCleanOffer(`Imported ${index + 1}`), _img: '' }));
  const { context, dots } = createHarness(offers);

  context.updateAllStatus();
  assert.deepEqual(dots.map(dot => dot.className), Array(4).fill('status-dot amber'));

  offers.forEach((offer, index) => { offer._img = `hero-${index + 1}.jpg`; });
  context.updateAllStatus();
  assert.deepEqual(dots.map(dot => dot.className), Array(4).fill('status-dot green'));
});

test('session-restored state and reordered state retain status colours derived from offer content', () => {
  const offers = [
    { ...createCleanOffer('Ready') },
    { ...createCleanOffer('Missing hero'), _img: '' },
    { ...createCleanOffer('Missing cruise price'), price: '' },
    {}
  ];
  const { context, dots } = createHarness(offers);

  context.updateAllStatus();
  assert.deepEqual(dots.map(dot => dot.className), ['status-dot green', 'status-dot amber', 'status-dot red', 'status-dot']);
  assert.deepEqual(dots.map(dot => dot.title), ['Ready for export', 'Hero image missing', 'Price missing', 'No offer loaded']);

  context.offers = [offers[3], offers[0], offers[2], offers[1]];
  context.updateAllStatus();
  assert.deepEqual(dots.map(dot => dot.className), ['status-dot', 'status-dot green', 'status-dot red', 'status-dot amber']);
  assert.deepEqual(dots.map(dot => dot.title), ['No offer loaded', 'Ready for export', 'Price missing', 'Hero image missing']);
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
