import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const CELEBRITY_CRUISES_OFFER = `Celebrity Cruises
Panama Canal & Southern Caribbean
7th March 2027
14 nights Cruise (plus 1 night pre-cruise stay)
Celebrity Ascent
Flights included from Newcastle
Inside Cabin
Full Board
£2849 per person based on 2 sharing
Itinerary
Fort Lauderdale, Florida - At Sea - At Sea -
Cartagena, Colombia -
Panama Canal (Cruising) - Colon, Panama - At Sea -
Oranjestad, Aruba -
Willemstad, Curacao - Kralendijk, Bonaire - At Sea -
At Sea - Fort Lauderdale, Florida
Luggage & Transfers included.`;

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not find ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function createClassList() {
  const classes = new Set();
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
    contains(name) { return classes.has(name); }
  };
}

function createHarness(offers, cur = 0, { hasParsePreviewModal = true } = {}) {
  const fields = Object.fromEntries([
    'operator', 'name', 'ship', 'incl', 'price', 'board', 'boardlbl', 'day', 'month', 'nights', 'ports'
  ].map(name => [`f-${name}`, { value: '', classList: createClassList(), offsetWidth: 0 }]));
  const modal = { classList: createClassList() };
  modal.classList.add('active');
  const status = { textContent: '', className: '' };
  const rawPaste = { value: '' };
  const previewBody = { innerHTML: '' };
  const confidenceBadge = { className: '', textContent: '' };
  const tabs = Array.from({ length: 4 }, (_, index) => ({ classList: createClassList(), index }));
  tabs[cur]?.classList.add('active');
  const calls = { load: 0, rv: 0, status: 0, utm: 0, ports: 0, filenames: 0, spell: 0, autosave: 0 };
  const context = {
    offers,
    cur,
    PARSE_FIELD_MAP: {
      operatorKey: 'f-operator', name: 'f-name', ship: 'f-ship', incl: 'f-incl', price: 'f-price',
      board: 'f-board', boardlbl: 'f-boardlbl', day: 'f-day', month: 'f-month', nights: 'f-nights', ports: 'f-ports'
    },
    document: {
      getElementById(id) {
        if(id === 'parse-preview-modal') return hasParsePreviewModal ? modal : null;
        if(id === 'parse-result') return status;
        if(id === 'raw-paste') return rawPaste;
        if(id === 'parse-preview-body') return previewBody;
        if(id === 'parse-confidence-badge') return confidenceBadge;
        return fields[id] || null;
      },
      querySelectorAll(selector) { return selector === '.otab' ? tabs : []; }
    },
    isOfferLoaded: offer => !!(offer && (offer.name || offer.ship || offer.price || offer._img)),
    BOARD_MAP: { FB: ['FB', 'Full Board'], 'FULL BOARD': ['FB', 'Full Board'] },
    OPERATOR_HEADERS: {},
    OPERATOR_SHIPS: { celebrity: ['Celebrity Ascent'] },
    OPERATOR_ALIASES: { celebrity: [/\bcelebrity\b/i, /\bcelebrity\s+cruises\b/i] },
    AIRPORT_WORDS: ['newcastle'],
    getLikelyTypos() { return []; },
    setSpellWarn() {},
    operatorChanged() {},
    load() { calls.load += 1; Object.values(fields).forEach(field => { field.value = ''; }); },
    rv() { calls.rv += 1; },
    updateAllStatus() { calls.status += 1; },
    genUtm() { calls.utm += 1; },
    checkPortsWarn() { calls.ports += 1; },
    updateExportFilenames() { calls.filenames += 1; },
    runSpellQA() { calls.spell += 1; },
    queueAutosave() { calls.autosave += 1; },
    setTimeout(callback) { callback(); }
  };
  vm.createContext(context);
  vm.runInContext([
    'let pendingParseResult=null;',
    extractFunction('parseOffer'),
    extractFunction('setParseStatus'),
    extractFunction('showParsePreview'),
    extractFunction('cancelParsedOffer'),
    extractFunction('prepareOfferSlotForParsedOffer'),
    extractFunction('applyParsedOffer')
  ].join('\n'), context);
  return {
    context, fields, modal, status, tabs, calls, rawPaste,
    apply(parsed, confidence = 'high') {
      context.__parsed = parsed;
      context.__confidence = confidence;
      vm.runInContext('pendingParseResult={parsed:__parsed,confidence:__confidence}; applyParsedOffer();', context);
    },
    parse(raw) {
      rawPaste.value = raw;
      vm.runInContext('parseOffer();', context);
    }
  };
}

test('Paste Offer creates and populates Offer 1 when no offers are loaded', () => {
  const harness = createHarness([], 2);
  harness.apply({ name: 'Caribbean Escape', ship: 'Arvia', price: '1669', nights: '14' });

  assert.equal(harness.context.cur, 0);
  assert.equal(harness.context.offers.length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.context.offers[0])), { name: 'Caribbean Escape', ship: 'Arvia', price: '1669', nights: '14' });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.context.offers.slice(1))), [{}, {}, {}]);
  assert.equal(harness.tabs[0].classList.contains('active'), true);
  assert.equal(harness.tabs[2].classList.contains('active'), false);
  assert.deepEqual(harness.calls, { load: 1, rv: 1, status: 1, utm: 1, ports: 1, filenames: 1, spell: 1, autosave: 1 });
});

test('Paste Offer reuses Offer 1 when the fresh builder already has empty placeholder slots', () => {
  const harness = createHarness([{}, {}, {}, {}], 3);
  harness.apply({ name: 'Mediterranean Escape', price: '1299' });

  assert.equal(harness.context.cur, 0);
  assert.equal(harness.context.offers.length, 4);
  assert.deepEqual(harness.context.offers, [{ name: 'Mediterranean Escape', price: '1299' }, {}, {}, {}]);
  assert.equal(harness.calls.load, 1);
  assert.equal(harness.calls.autosave, 1);
});

test('Paste Offer preserves the selected slot when offers are already loaded', () => {
  const offers = [{ name: 'Existing Offer 1' }, { name: 'Existing Offer 2' }, {}, {}];
  const harness = createHarness(offers, 1);
  harness.apply({ name: 'Updated Offer 2', price: '2049' });

  assert.equal(harness.context.cur, 1);
  assert.deepEqual(harness.context.offers, [{ name: 'Existing Offer 1' }, { name: 'Updated Offer 2', price: '2049' }, {}, {}]);
  assert.equal(harness.tabs[1].classList.contains('active'), true);
  assert.equal(harness.calls.autosave, 1);
});

test('Paste Offer does not create a blank offer when parsing detected no fields', () => {
  const harness = createHarness([], 0);
  harness.apply({}, 'low');

  assert.deepEqual(harness.context.offers, []);
  assert.equal(harness.calls.autosave, 0);
  assert.equal(harness.status.textContent, 'No offer fields detected');
});

test('empty pasted text keeps the existing warning and cannot create an offer', () => {
  assert.match(extractFunction('parseOffer'), /if\(!raw\.trim\(\)\) return setParseStatus\("Nothing to parse","low"\);/);
});

test('real Load Offer runtime path applies the supplied Celebrity offer when the preview modal is absent', () => {
  const harness = createHarness([], 2, { hasParsePreviewModal: false });
  harness.parse(CELEBRITY_CRUISES_OFFER);

  assert.equal(harness.context.cur, 0);
  assert.equal(harness.context.offers.length, 4);
  assert.equal(harness.context.offers[0].operator, 'celebrity');
  assert.equal(harness.context.offers[0].name, 'Panama Canal & Southern Caribbean');
  assert.equal(harness.context.offers[0].ship, 'Celebrity Ascent');
  assert.equal(harness.context.offers[0].price, '2849');
  assert.equal(harness.context.offers[0].nights, '14');
  assert.equal(harness.context.offers[0].day, '7');
  assert.equal(harness.context.offers[0].month, 'March 2027');
  assert.equal(harness.context.offers[0].board, 'FB');
  assert.equal(harness.context.offers[0].boardlbl, 'Full Board');
  assert.match(harness.context.offers[0].ports, /Fort Lauderdale/);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.context.offers.slice(1))), [{}, {}, {}]);
  assert.equal(harness.calls.rv, 1);
  assert.equal(harness.calls.status, 1);
  assert.equal(harness.calls.autosave, 1);
});

test('real Load Offer runtime path does not create slots for clearly unparseable text', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse('This is clearly not a cruise offer.');

  assert.deepEqual(harness.context.offers, []);
  assert.equal(harness.status.textContent, 'No offer fields detected');
  assert.equal(harness.calls.autosave, 0);
});

test('Load Offer button reaches parseOffer and parseOffer applies directly when no preview modal exists', () => {
  assert.match(html, /<button class="parse-btn" onclick="parseOffer\(\)">/);
  assert.match(extractFunction('parseOffer'), /if\(!showParsePreview\(\)\) applyParsedOffer\(\);/);
});
