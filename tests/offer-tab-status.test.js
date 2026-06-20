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
  assert.match(html, /\.status-dot\{[^}]*pointer-events:none;/);
  for (let index = 0; index < 4; index += 1) {
    assert.match(html, new RegExp(`<button class="otab(?: active)?" id="ot${index}" onclick="sv\\(${index}\\)"[^>]*>[\\s\\S]*?<span class="status-dot" id="sd${index}" title="No offer loaded" aria-hidden="true"><\\/span><\\/button>`));
  }
  assert.doesNotMatch(html, /navigateOfferStatus|handleStatusDotKeydown|getOfferStatusNavigation|getStatusNavigationTarget|getStatusNavigationSection|openStatusNavigationSection|status-dot-target/);
  assert.doesNotMatch(html, /<span class="status-dot"[^>]*(?:onclick|onkeydown|role="button"|tabindex=)/);
});



test('empty offer state hides tabs only when no offers are loaded', () => {
  const toggles = [];
  const tabs = { classList: { toggle(name, active){ toggles.push(['tabs', name, active]); } } };
  const empty = { classList: { toggle(name, active){ toggles.push(['empty', name, active]); } } };
  const context = {
    offers: [{}, {}, {}, {}],
    document: {
      querySelector(selector){ return selector === '.offer-tabs' ? tabs : null; },
      getElementById(id){ return id === 'offer-empty-state' ? empty : null; }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('isOfferLoaded'),
    extractFunction('getLoadedOfferCount'),
    extractFunction('updateEmptyOfferState')
  ].join('\n'), context);

  context.updateEmptyOfferState();
  assert.deepEqual(toggles.splice(0), [['tabs', 'empty-hidden', true], ['empty', 'active', true]]);

  context.offers[0] = { name: 'Loaded Offer' };
  context.updateEmptyOfferState();
  assert.deepEqual(toggles.splice(0), [['tabs', 'empty-hidden', false], ['empty', 'active', false]]);
});

test('offer tab labels switch from fallback text to operator and ship identifiers for loaded offers', () => {
  const context = {
    offers: [
      { operator: 'celebrity', ship: 'Celebrity Apex' },
      { operator: 'cunard', ship: 'Queen Anne' },
      { operator: 'royal', ship: 'Icon of the Seas' },
      {}
    ],
    OPERATOR_HEADERS: {
      celebrity: { name: 'Celebrity Cruises' },
      cunard: { name: 'Cunard' },
      royal: { name: 'Royal Caribbean' }
    },
    OFFER_TAB_OPERATOR_LABELS: {
      celebrity: 'Celebrity',
      'Celebrity Cruises': 'Celebrity',
      cunard: 'Cunard',
      royal: 'RCI',
      'Royal Caribbean': 'RCI'
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('isOfferLoaded'),
    extractFunction('getOfferTabOperatorLabel'),
    extractFunction('isRoyalCaribbeanOfferTabOperator'),
    extractFunction('getOfferTabShipLabel'),
    extractFunction('getOfferTabLabelParts')
  ].join('\n'), context);

  assert.deepEqual(JSON.parse(JSON.stringify([0, 1, 2, 3].map(index => context.getOfferTabLabelParts(index)))), [
    { number: 'Offer 1', operator: 'Celebrity', ship: 'Celebrity Apex' },
    { number: 'Offer 2', operator: 'Cunard', ship: 'Queen Anne' },
    { number: 'Offer 3', operator: 'RCI', ship: 'Icon OTS' },
    { number: 'Offer 4', operator: '', ship: '' }
  ]);
});

test('offer tab aliases apply to long operator names without changing stored operator values', () => {
  const context = {
    offers: [
      { operator: 'amawaterways', ship: 'AmaSerena' },
      { operator: 'Royal Caribbean', ship: 'Liberty of the Seas' },
      { operator: 'fred', ship: 'Bolette' },
      { operator: 'Unlisted Long Operator Name', ship: 'Discovery' }
    ],
    OPERATOR_HEADERS: {
      amawaterways: { name: 'AmaWaterways' },
      fred: { name: 'Fred. Olsen Cruise Lines' }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    'const OFFER_TAB_OPERATOR_LABELS = ' + JSON.stringify({
      amawaterways: 'AMA',
      AmaWaterways: 'AMA',
      royal: 'RCI',
      'Royal Caribbean': 'RCI',
      fred: 'Fred.Olsen',
      'Fred. Olsen Cruise Lines': 'Fred.Olsen'
    }) + ';',
    extractFunction('isOfferLoaded'),
    extractFunction('getOfferTabOperatorLabel'),
    extractFunction('isRoyalCaribbeanOfferTabOperator'),
    extractFunction('getOfferTabShipLabel'),
    extractFunction('getOfferTabLabelParts')
  ].join('\n'), context);

  assert.deepEqual(JSON.parse(JSON.stringify([0, 1, 2, 3].map(index => context.getOfferTabLabelParts(index)))), [
    { number: 'Offer 1', operator: 'AMA', ship: 'AmaSerena' },
    { number: 'Offer 2', operator: 'RCI', ship: 'Liberty OTS' },
    { number: 'Offer 3', operator: 'Fred.Olsen', ship: 'Bolette' },
    { number: 'Offer 4', operator: 'Unlisted Long Operator Name', ship: 'Discovery' }
  ]);
  assert.deepEqual(context.offers.map(offer => offer.operator), ['amawaterways', 'Royal Caribbean', 'fred', 'Unlisted Long Operator Name']);
});


test('Royal Caribbean offer tab ship aliases shorten known and unknown of the Seas names only in tab labels', () => {
  const context = {
    offers: [
      { operator: 'Royal Caribbean', ship: 'Utopia of the Seas' },
      { operator: 'rci', ship: 'Mystery of the Seas' },
      { operator: 'celebrity', ship: 'Celebrity of the Seas' },
      { operator: 'Royal Caribbean', ship: 'Spectrum Princess' }
    ],
    OPERATOR_HEADERS: {
      celebrity: { name: 'Celebrity Cruises' }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    'const OFFER_TAB_OPERATOR_LABELS = ' + JSON.stringify({
      royal: 'RCI',
      'Royal Caribbean': 'RCI',
      rci: 'RCI',
      celebrity: 'Celebrity',
      'Celebrity Cruises': 'Celebrity'
    }) + ';',
    extractFunction('isOfferLoaded'),
    extractFunction('getOfferTabOperatorLabel'),
    extractFunction('isRoyalCaribbeanOfferTabOperator'),
    extractFunction('getOfferTabShipLabel'),
    extractFunction('getOfferTabLabelParts')
  ].join('\n'), context);

  assert.deepEqual(JSON.parse(JSON.stringify([0, 1, 2, 3].map(index => context.getOfferTabLabelParts(index)))), [
    { number: 'Offer 1', operator: 'RCI', ship: 'Utopia OTS' },
    { number: 'Offer 2', operator: 'RCI', ship: 'Mystery OTS' },
    { number: 'Offer 3', operator: 'Celebrity', ship: 'Celebrity of the Seas' },
    { number: 'Offer 4', operator: 'RCI', ship: 'Spectrum Princess' }
  ]);
  assert.deepEqual(context.offers.map(offer => offer.ship), ['Utopia of the Seas', 'Mystery of the Seas', 'Celebrity of the Seas', 'Spectrum Princess']);
});

test('offer tab labels fall back cleanly when ship or operator details are missing', () => {
  const context = {
    offers: [
      { operator: 'fred', ship: '', name: 'Norwegian Fjords' },
      { ship: 'Bolette' },
      { operator: '', ship: 'Sky Princess' },
      {}
    ],
    OPERATOR_HEADERS: { fred: { name: 'Fred. Olsen Cruise Lines' } },
    OFFER_TAB_OPERATOR_LABELS: { fred: 'Fred.Olsen', 'Fred. Olsen Cruise Lines': 'Fred.Olsen' }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('isOfferLoaded'),
    extractFunction('getOfferTabOperatorLabel'),
    extractFunction('isRoyalCaribbeanOfferTabOperator'),
    extractFunction('getOfferTabShipLabel'),
    extractFunction('getOfferTabLabelParts')
  ].join('\n'), context);

  assert.deepEqual(JSON.parse(JSON.stringify([0, 1, 2, 3].map(index => context.getOfferTabLabelParts(index)))), [
    { number: 'Offer 1', operator: 'Fred.Olsen', ship: '' },
    { number: 'Offer 2', operator: '', ship: '' },
    { number: 'Offer 3', operator: '', ship: '' },
    { number: 'Offer 4', operator: '', ship: '' }
  ]);
});

test('active offer tab and gold pill use fully square corners', () => {
  assert.match(html, /\.otab\.active\{[^}]*border-radius:0;/);
  assert.match(html, /\.offer-pill\{[^}]*border-radius:0;[^}]*background:linear-gradient\(180deg,#b2a374 0%,var\(--gold\) 100%\);/);
  assert.doesNotMatch(html, /\.otab\.active\{[^}]*border-radius:[1-9]px;/);
  assert.doesNotMatch(html, /\.offer-pill\{[^}]*border-radius:[1-9]px;/);
});

test('offer tab label layout keeps fixed tab widths, truncation, and clearer hierarchy', () => {
  assert.match(html, /\.offer-tab-item\{[^}]*flex:1;min-width:0;/);
  assert.match(html, /\.offer-tab-label\{[^}]*flex-direction:column;[^}]*width:100%;min-width:0;[^}]*text-align:center;/);
  assert.match(html, /\.offer-tab-number,\.offer-tab-operator,\.offer-tab-ship\{[^}]*overflow:hidden;text-overflow:ellipsis;white-space:nowrap;/);
  assert.match(html, /\.offer-tab-number\{[^}]*font-size:7px;[^}]*text-transform:uppercase;[^}]*color:var\(--muted\);/);
  assert.match(html, /\.offer-tab-operator\{[^}]*font-size:9px;[^}]*font-weight:700;[^}]*color:var\(--text\);/);
  assert.match(html, /\.offer-tab-ship\{[^}]*font-size:8px;[^}]*font-weight:500;[^}]*color:var\(--muted\);/);
  assert.match(html, /\.otab\.active \.offer-tab-operator\{color:var\(--navy\);font-weight:700;[^}]*opacity:1;\}/);
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

  assert.equal(elements['prod-status-summary'].innerHTML, 'Ready for Export<br><span class="prod-status-secondary">0 blockers • 0 warnings</span>');
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
