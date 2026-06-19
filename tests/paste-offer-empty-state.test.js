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

const PATAGONIA_AND_ARGENTINA_OFFER = `Celebrity Cruises
Patagonia & Argentina
12th January 2027
14 nights Cruise
Celebrity Ascent
Flights included from Newcastle
Full Board
£3499 per person based on 2 sharing
You'll Visit
Buenos Aires
Montevideo - At Sea
Port Stanley, Falkland Islands
Cape Horn, Chile
Ushuaia
Strait of Magellan
Punta Arenas
At Sea
Puerto Madryn
Punta Del Este
Overnight Port Stay
Luggage & Transfers Included.`;

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

function extractLastFunction(name) {
  const start = html.lastIndexOf(`function ${name}(`);
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

function extractLoadOfferClickHandler() {
  const match = html.match(/<button class="parse-btn" onclick="([^"]+)">/);
  assert.ok(match, 'Could not find the live Load Offer button');
  return match[1];
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
    'operator', 'name', 'ship', 'incl', 'price', 'basis', 'board', 'boardlbl', 'day', 'month', 'nights', 'ports'
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
      operatorKey: 'f-operator', name: 'f-name', ship: 'f-ship', incl: 'f-incl', price: 'f-price', basis: 'f-basis',
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
    OPERATOR_HEADERS: { cunard: { name: 'Cunard' }, ncl: { name: 'Norwegian Cruise Line' }, po: { name: 'P&O Cruises' } },
    OPERATOR_SHIPS: { celebrity: ['Celebrity Ascent'], amawaterways: ['AmaBella', 'AmaDouro', 'AmaMagna', 'Zambezi Queen'], cunard: ['Queen Anne'], ncl: ['Norwegian Prima', 'Pride of America'], po: ['Arvia'] },
    OPERATOR_ALIASES: { celebrity: [/\bcelebrity\b/i, /\bcelebrity\s+cruises\b/i], cunard: [/\bcunard\b/i], ncl: [/\bnorwegian\s+cruise\s+line\b/i, /\bncl\b/i], po: [/\bp\s*&\s*o\b/i, /\bp&o\s+cruises\b/i] },
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
    `const ITINERARY_SECTION_LABEL=/^(?:itinerary|ports|you(?:'|’)?ll visit)\\s*:?\\s*(.*)$/i;`,
    `const ITINERARY_FOOTER_LABEL=/^(?:luggage\\s*(?:&|and)\\s*transfers?\\s+included|flights?\\s+included|inclusions?|what(?:'|’)?s included|price|from £|terms(?:\\s*&\\s*conditions)?|book now|call to book|cabin|accommodation)\\b/i;`,
    `const USP_TAG_LABEL=/^(?:top\\s*bar\\s*)?(?:usp|usps|tags?|tag\\s*row|top\\s*bar\\s*usp\\s*text)\\s*:?\\s*(.*)$/i;`,
    `const USP_TAG_KEYWORDS=/\\b(adult(?:s)?\\s*only|accessible|all\\s*inclusive|cuisine|dining|entertainment|family|families|luxury|wellness|destinations|cultural\\s+experiences|overnight\\s+port\\s+stays?)\\b/i;`,
    extractFunction('normaliseUspTagText'),
    extractFunction('inferUspTagsFromLines'),
    extractFunction('getItineraryLines'),
    extractFunction('normalisePortComparisonValue'),
    extractFunction('isExcludedParsedPort'),
    extractFunction('isStandalonePortCandidate'),
    extractFunction('cleanParsedPorts'),
    extractFunction('escapeRegExp'),
    extractFunction('findKnownOperatorShip'),
    extractFunction('getStandalonePortLines'),
    extractFunction('parseFamilyPassengerBasis'),
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

test('empty pasted text resets the active pasted offer instead of keeping stale rendered data', () => {
  assert.match(extractFunction('parseOffer'), /if\(!raw\.trim\(\)\) return resetActiveOfferFromEmptyPaste\(\);/);
  assert.match(extractFunction('handlePasteOfferInput'), /if\(!raw\.trim\(\)\) resetActiveOfferFromEmptyPaste\(\);/);
});



test('clearing Paste Offer resets only the selected offer, editor, preview and intelligence state', () => {
  const rawPaste = { value: '   \n  ' };
  const status = { textContent: '✓ Detected 9 fields — High Confidence', className: 'parse-result high' };
  const modal = { classList: createClassList() };
  const panel = { innerHTML: '<div>Offer Intelligence</div>', classList: createClassList() };
  panel.classList.add('active');
  const fields = {
    'f-operator': { value: 'po' },
    'f-tags': { value: 'Drinks Package' },
    'f-name': { value: 'Loaded Offer 3' },
    'f-ship': { value: 'Arvia' },
    'f-incl': { value: 'Flights Included' },
    'f-price': { value: '1669' },
    'f-board': { value: 'FB' },
    'f-boardlbl': { value: 'Full Board' },
    'f-day': { value: '20' },
    'f-month': { value: 'November 2026' },
    'f-nights': { value: '14' },
    'f-ports': { value: 'Barbados • Martinique' },
    'f-basis': { value: 'Based On 2 Adults Sharing' },
    'f-url': { value: 'https://example.com' },
    'f-utm_content': { value: 'utm' },
    'f-logo-display': { value: 'operator' }
  };
  const calls = [];
  const context = {
    console,
    document: {
      getElementById(id) {
        if(id === 'raw-paste') return rawPaste;
        if(id === 'parse-result') return status;
        if(id === 'parse-preview-modal') return modal;
        if(id === 'offer-intel-panel') return panel;
        return fields[id] || null;
      },
      querySelectorAll() { return []; }
    },
    window: { currentPoaSuggestions: [{ id: 'card-inclusion' }], currentPoaParsed: { price: '1669' }, currentPoaRawText: 'old raw' },
    clearPoaSuggestionHighlights() { calls.push('clear-highlights'); },
    loadOfferToEditor(index) {
      calls.push(`load:${index}`);
      Object.entries(fields).forEach(([id, field]) => {
        if(id === 'f-logo-display') field.value = 'operator';
        else field.value = '';
      });
    },
    renderOfferIndex(index) { calls.push(`render:${index}`); },
    updateAllStatus() { calls.push('status'); },
    checkPortsWarn() { calls.push('ports'); },
    genUtm() { calls.push('utm'); },
    genStandardUtms() { calls.push('standard-utms'); },
    updateExportFilenames() { calls.push('filenames'); },
    updateMoveOfferButtons() { calls.push('move-buttons'); },
    runSpellQA() { calls.push('spell'); },
    queueAutosave() { calls.push('autosave'); }
  };
  context.offers = [
    { name: 'Offer 1', price: '999' },
    { name: 'Offer 2', price: '1099' },
    { operator: 'po', name: 'Loaded Offer 3', ship: 'Arvia', price: '1669', ports: 'Barbados • Martinique', incl: 'Flights Included', tags: 'Drinks Package', _poaDepartureAirport: 'Newcastle', _logoCustom: 'logo', _img: 'hero' },
    { name: 'Offer 4', price: '1299' }
  ];
  vm.createContext(context);
  vm.runInContext([
    'const FLDS=["tags","theme_tags","name","ship","incl","price","basis","board","boardlbl","day","month","nights","ports","url","utm_content"]; let offers=globalThis.offers; let cur=2; let pendingParseResult={parsed:{name:"Loaded Offer 3"}}; let poaAppliedSuggestions={"card-inclusion":{previousValue:""}};',
    extractFunction('resetPoaSuggestionState'),
    extractFunction('clearOfferIntelligencePanel'),
    extractFunction('cancelParsedOffer'),
    extractFunction('resetActiveOfferFromEmptyPaste'),
    extractFunction('handlePasteOfferInput')
  ].join('\n'), context);

  vm.runInContext('handlePasteOfferInput();', context);

  assert.deepEqual(context.offers[0], { name: 'Offer 1', price: '999' });
  assert.deepEqual(context.offers[1], { name: 'Offer 2', price: '1099' });
  assert.deepEqual(JSON.parse(JSON.stringify(context.offers[2])), {});
  assert.deepEqual(context.offers[3], { name: 'Offer 4', price: '1299' });
  assert.equal(fields['f-name'].value, '');
  assert.equal(fields['f-ship'].value, '');
  assert.equal(fields['f-price'].value, '');
  assert.equal(fields['f-ports'].value, '');
  assert.equal(fields['f-operator'].value, '');
  assert.equal(panel.innerHTML, '');
  assert.equal(panel.classList.contains('active'), false);
  assert.equal(context.window.currentPoaSuggestions.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.currentPoaParsed)), {});
  assert.equal(context.window.currentPoaRawText, '');
  assert.equal(status.textContent, '');
  assert.equal(status.className, 'parse-result');
  assert.deepEqual(calls, ['clear-highlights', 'clear-highlights', 'load:2', 'render:2', 'status', 'ports', 'utm', 'standard-utms', 'filenames', 'move-buttons', 'spell', 'autosave']);
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
  assert.doesNotMatch(harness.context.offers[0].ports, /At Sea/i);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.context.offers.slice(1))), [{}, {}, {}]);
  assert.equal(harness.calls.rv, 1);
  assert.equal(harness.calls.status, 1);
  assert.equal(harness.calls.autosave, 1);
});



test('family passenger basis parser recognises child counts one through four', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractFunction('parseFamilyPassengerBasis'), context);

  assert.equal(context.parseFamilyPassengerBasis('for a family of two adults & 1 child'), 'Based On 2 Adults & 1 Child Sharing');
  assert.equal(context.parseFamilyPassengerBasis('for a family of 2 adults & 2 children'), 'Based On 2 Adults & 2 Children Sharing');
  assert.equal(context.parseFamilyPassengerBasis('for a family of two adults & 3 children'), 'Based On 2 Adults & 3 Children Sharing');
  assert.equal(context.parseFamilyPassengerBasis('for a family of 2 adults & 4 children'), 'Based On 2 Adults & 4 Children Sharing');
  assert.equal(context.parseFamilyPassengerBasis('£1249 per person based on 2 sharing'), '');
});

test('Paste Offer sets family passenger basis for one child while keeping the parsed price unchanged', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse('P&O Cruises\nFamily Caribbean offer\nArvia\n7 nights\nFull Board\n£1689 for a family of two adults & 1 child');

  assert.equal(harness.context.offers[0].price, '1689');
  assert.equal(harness.context.offers[0].basis, 'Based On 2 Adults & 1 Child Sharing');
});

test('Paste Offer sets family passenger basis for multiple children with numeric adults', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse('Marella Cruises\nFamily Mediterranean offer\nMarella Explorer\n7 nights\nFull Board\n£2499 for a family of 2 adults & 2 children');

  assert.equal(harness.context.offers[0].price, '2499');
  assert.equal(harness.context.offers[0].basis, 'Based On 2 Adults & 2 Children Sharing');
});

test('Paste Offer leaves standard per-person passenger basis unchanged', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse(CELEBRITY_CRUISES_OFFER);

  assert.equal(harness.context.offers[0].basis, undefined);
});

test("Paste Offer recognises Itinerary, Ports, and You'll Visit labels with line and bullet-separated destinations", () => {
  for (const label of ['Itinerary', 'Ports', "You'll Visit"]) {
    const harness = createHarness([], 0, { hasParsePreviewModal: false });
    harness.parse(`${label}
- Buenos Aires
• Montevideo
- At Sea
Luggage & Transfers Included`);

    assert.equal(harness.context.offers[0].ports, 'Buenos Aires • Montevideo');
  }
});

test('Paste Offer captures every Patagonia & Argentina destination across the full labelled itinerary section', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse(PATAGONIA_AND_ARGENTINA_OFFER);

  assert.equal(harness.context.offers[0].ports, [
    'Buenos Aires', 'Montevideo', 'Port Stanley', 'Falkland Islands', 'Cape Horn', 'Chile', 'Ushuaia',
    'Strait of Magellan', 'Punta Arenas', 'Puerto Madryn', 'Punta Del Este'
  ].join(' • '));
  assert.doesNotMatch(harness.context.offers[0].ports, /At Sea|Overnight|Luggage|Transfers/i);
});

test('Paste Offer keeps the existing Panama Canal & Southern Caribbean parser output unchanged', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse(CELEBRITY_CRUISES_OFFER);

  assert.equal(harness.context.offers[0].ports, [
    'Fort Lauderdale', 'Florida', 'Cartagena', 'Colombia', 'Panama Canal (Cruising)', 'Colon', 'Panama',
    'Oranjestad', 'Aruba', 'Willemstad', 'Curacao', 'Kralendijk', 'Bonaire', 'Fort Lauderdale', 'Florida'
  ].join(' • '));
});

test('Paste Offer itinerary cleanup excludes sea days and overnight labels while retaining genuine destinations', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse(`${CELEBRITY_CRUISES_OFFER}
Overnight Port Stay - overnight stay - Overnight - AT SEA`);

  const ports = harness.context.offers[0].ports.split(' • ');
  assert.equal(ports.includes('Fort Lauderdale'), true);
  assert.equal(ports.includes('Cartagena'), true);
  assert.equal(ports.includes('Panama Canal (Cruising)'), true);
  assert.equal(ports.includes('Colon'), true);
  assert.equal(ports.includes('Oranjestad'), true);
  assert.equal(ports.includes('Willemstad'), true);
  assert.equal(ports.includes('Curacao'), true);
  assert.equal(ports.includes('Kralendijk'), true);
  assert.equal(ports.includes('Bonaire'), true);
  assert.equal(ports.some(port => /^(?:at sea|overnight port stay|overnight stay|overnight)$/i.test(port)), false);
});

test('live Load Offer button click handler reaches the supplied Celebrity offer apply path', () => {
  const harness = createHarness([], 2, { hasParsePreviewModal: false });
  harness.context.__celebrityOffer = CELEBRITY_CRUISES_OFFER;
  harness.context.document.getElementById('raw-paste').value = harness.context.__celebrityOffer;

  vm.runInContext(extractLoadOfferClickHandler(), harness.context);

  assert.equal(harness.context.cur, 0);
  assert.equal(harness.context.offers.length, 4);
  assert.equal(harness.context.offers[0].name, 'Panama Canal & Southern Caribbean');
  assert.equal(harness.context.offers[0].ship, 'Celebrity Ascent');
  assert.equal(harness.context.offers[0].price, '2849');
  assert.equal(harness.context.isOfferLoaded(harness.context.offers[0]), true);
  assert.equal(harness.calls.rv, 1);
  assert.equal(harness.calls.status, 1);
  assert.equal(harness.calls.autosave, 1);
});



test('Paste Offer infers Queen Anne as Cunard and detects standalone port lines', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });

  harness.parse(`Queen Anne
7 nights
Full Board
£1199pp
Southampton
Stavanger
Olden
Geiranger
Bergen
Southampton`);

  assert.equal(harness.context.offers[0].operator, 'cunard');
  assert.equal(harness.context.offers[0].ship, 'Queen Anne');
  assert.equal(harness.context.offers[0].ports, 'Southampton • Stavanger • Olden • Geiranger • Bergen • Southampton');
  assert.notEqual(harness.context.offers[0].operator, 'ncl');
});


test('Paste Offer treats Norwegian Fjords as itinerary text and keeps Queen Anne as Cunard', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });

  harness.parse(`Norwegian Fjords
Queen Anne
7 nights
Full Board
£1199pp`);

  assert.equal(harness.context.offers[0].operator, 'cunard');
  assert.equal(harness.context.offers[0].ship, 'Queen Anne');
  assert.notEqual(harness.context.offers[0].operator, 'ncl');
});


test('Paste Offer excludes parsed cruise title from Norwegian Fjords standalone ports', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });

  harness.parse(`Norwegian Fjords
Queen Anne
12 Nights
15 May 2027
Full Board
From £1899pp
Southampton
Stavanger
Olden
Geiranger
Bergen
Southampton`);

  assert.equal(harness.context.offers[0].operator, 'cunard');
  assert.equal(harness.context.offers[0].ship, 'Queen Anne');
  assert.equal(harness.context.offers[0].name, 'Norwegian Fjords');
  assert.equal(harness.context.offers[0].ports, 'Southampton • Stavanger • Olden • Geiranger • Bergen • Southampton');
  assert.doesNotMatch(harness.context.offers[0].ports, /Norwegian Fjords/);
});

test('Paste Offer keeps Caribbean standalone ports while rejecting offer detail lines as ports', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });

  harness.parse(`Caribbean Escape
P&O Cruises
Arvia
14 Nights
20 November 2027
Full Board
From £1669pp
Flights, luggage and transfers included
Family Friendly
Premium
Adults Only
Ocean Cruise
Barbados
Martinique
St Kitts
Tortola
Antigua
St Lucia`);

  assert.equal(harness.context.offers[0].operator, 'po');
  assert.equal(harness.context.offers[0].ship, 'Arvia');
  assert.equal(harness.context.offers[0].ports, 'Barbados • Martinique • St Kitts • Tortola • Antigua • St Lucia');
  assert.doesNotMatch(harness.context.offers[0].ports, /P&O Cruises|Arvia|14 Nights|20 November|Full Board|1669|Flights|Family Friendly|Premium|Adults Only|Ocean Cruise/);
});

test('Paste Offer does not infer Norwegian Cruise Line from Norwegian Fjords without a ship', () => {
  const fjordsOnly = createHarness([], 0, { hasParsePreviewModal: false });

  fjordsOnly.parse(`Norwegian Fjords
7 nights
Full Board
£1199pp
Southampton`);

  assert.notEqual(fjordsOnly.context.offers[0].operator, 'ncl');
  assert.equal(fjordsOnly.context.offers[0].operator, undefined);

  const fullName = createHarness([], 0, { hasParsePreviewModal: false });
  fullName.parse(`Norwegian Cruise Line
Norwegian Fjords
Norwegian Prima
7 nights
Full Board
£1199pp`);

  assert.equal(fullName.context.offers[0].operator, 'ncl');
  assert.equal(fullName.context.offers[0].ship, 'Norwegian Prima');
});

test('Paste Offer infers priority known ships from ship name alone', () => {
  for (const [ship, operator] of [['Queen Anne', 'cunard'], ['Arvia', 'po'], ['MSC Virtuosa', 'msc']]) {
    const harness = createHarness([], 0, { hasParsePreviewModal: false });
    harness.context.OPERATOR_SHIPS.po = ['Arvia', 'Iona'];
    harness.context.OPERATOR_SHIPS.msc = ['MSC Virtuosa'];
    harness.context.OPERATOR_HEADERS.po = { name: 'P&O Cruises' };
    harness.context.OPERATOR_HEADERS.msc = { name: 'MSC Cruises' };
    harness.context.OPERATOR_ALIASES.po = [/\bp\s*&\s*o\b/i, /\bp\s*and\s*o\b/i];
    harness.context.OPERATOR_ALIASES.msc = [/\bmsc\b/i];

    harness.parse(`${ship}
7 nights
Full Board
£1199pp`);

    assert.equal(harness.context.offers[0].operator, operator, ship);
    assert.equal(harness.context.offers[0].ship, ship);
  }
});

test('Paste Offer recognises AmaWaterways ships without manual operator selection', () => {
  for (const ship of ['AmaMagna', 'AmaBella', 'AmaDouro', 'Zambezi Queen']) {
    const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
    harness.parse(`Luxury river cruise
${ship}
7 nights from £1999pp
Full Board`);
    assert.equal(harness.context.offers[0].operator, 'amawaterways', ship);
    assert.equal(harness.context.offers[0].ship, ship);
  }
});

test('refresh paths retain the export-filename compatibility hook used by load', () => {
  assert.match(html, /function updateExportFilenames\(\)\{\}/);
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


test('offer tab switches clear Paste Offer textarea and parse status without storing raw paste on offers', () => {
  const sv = extractFunction('sv');
  const reset = extractFunction('resetPasteOfferState');

  assert.match(sv, /const next=Number\(i\); const switched=next!==cur;/);
  assert.match(sv, /if\(switched\) resetPasteOfferState\(\);/);
  assert.match(reset, /raw\.value=""/);
  assert.match(reset, /status\.textContent=""/);
  assert.match(reset, /cancelParsedOffer\(\)/);
  assert.doesNotMatch(reset, /offers\[/);
});

test('switching selected offers clears only transient Paste Offer state and preserves loaded Offer Details', () => {
  const rawPaste = { value: 'Offer 1 pasted text' };
  const status = { textContent: '✓ Parsed 6 fields — High Confidence', className: 'parse-result high' };
  const modal = { classList: createClassList() };
  const fields = { 'f-name': { value: 'Loaded Offer 1' } };
  const tabs = Array.from({ length: 4 }, () => ({ classList: createClassList() }));
  const context = {
    console,
    document: {
      getElementById(id) {
        if(id === 'raw-paste') return rawPaste;
        if(id === 'parse-result') return status;
        if(id === 'parse-preview-modal') return modal;
        return fields[id] || null;
      },
      querySelectorAll(selector) { return selector === '.otab' ? tabs : []; }
    },
    updateLockUI() {},
    rv() {},
    setTimeout(callback) { callback(); },
    load(index) { fields['f-name'].value = context.offers[index].name || ''; }
  };
  context.offers = [{ name: 'Loaded Offer 1' }, { name: 'Loaded Offer 2' }, {}, {}];
  vm.createContext(context);
  vm.runInContext([
    'const FLDS=["name"]; let offers=globalThis.offers; let cur=0; let pendingParseResult={parsed:{name:"Loaded Offer 1"}};',
    extractFunction('save'),
    extractFunction('cancelParsedOffer'),
    extractFunction('resetPasteOfferState'),
    extractFunction('sv')
  ].join('\n'), context);

  vm.runInContext('sv(0);', context);
  assert.equal(rawPaste.value, 'Offer 1 pasted text');
  assert.equal(status.textContent, '✓ Parsed 6 fields — High Confidence');

  vm.runInContext('sv(1);', context);
  assert.equal(rawPaste.value, '');
  assert.equal(status.textContent, '');
  assert.equal(status.className, 'parse-result');
  assert.equal(fields['f-name'].value, 'Loaded Offer 2');
  assert.equal(context.offers[0].name, 'Loaded Offer 1');

  vm.runInContext('sv(0);', context);
  assert.equal(rawPaste.value, '');
  assert.equal(fields['f-name'].value, 'Loaded Offer 1');
});

test('effective tab switch handler saves the old card and clears transient Paste Offer state before loading a blank card', () => {
  const rawPaste = { value: 'Offer 1 pasted text' };
  const status = { textContent: '✓ Parsed 6 fields — High Confidence', className: 'parse-result high' };
  const modal = { classList: createClassList() };
  const fields = { 'f-name': { value: 'Loaded Offer 1' } };
  const calls = [];
  const context = {
    console,
    offers: [{ name: 'Loaded Offer 1' }, {}, {}, {}],
    document: {
      getElementById(id) {
        if(id === 'raw-paste') return rawPaste;
        if(id === 'parse-result') return status;
        if(id === 'parse-preview-modal') return modal;
        return fields[id] || null;
      }
    },
    commitVisibleFields() {
      const index = context.getCur();
      calls.push(`save:${index}`);
      context.offers[index].name = fields['f-name'].value;
    },
    syncOfferSelector() {},
    loadOfferToEditor(index) {
      calls.push(`load:${index}`);
      fields['f-name'].value = context.offers[index].name || '';
    },
    updateLockUI() {},
    genUtm() {},
    genStandardUtms() {},
    updateAllStatus() {},
    updateExportFilenames() {},
    updateMoveOfferButtons() {},
    renderPreviewMode() {},
    queueAutosave() {}
  };
  vm.createContext(context);
  vm.runInContext([
    'let cur=0; let pendingParseResult={parsed:{name:"Loaded Offer 1"}};',
    extractFunction('cancelParsedOffer'),
    extractFunction('resetPasteOfferState'),
    extractLastFunction('sv'),
    'globalThis.runSwitch=()=>sv(1); globalThis.getCur=()=>cur;'
  ].join('\n'), context);

  context.runSwitch();

  assert.deepEqual(calls, ['save:0', 'load:1']);
  assert.equal(context.getCur(), 1);
  assert.equal(rawPaste.value, '');
  assert.equal(status.textContent, '');
  assert.equal(status.className, 'parse-result');
  assert.equal(fields['f-name'].value, '');
  assert.equal(context.offers[0].name, 'Loaded Offer 1');
  assert.deepEqual(context.offers[1], {});

  vm.runInContext('sv(0);', context);
  assert.equal(fields['f-name'].value, 'Loaded Offer 1');
  assert.equal(rawPaste.value, '');

  vm.runInContext('sv(1);', context);
  fields['f-name'].value = 'Loaded Offer 2';
  rawPaste.value = 'Offer 2 pasted text';
  vm.runInContext('sv(2);', context);

  assert.equal(rawPaste.value, '');
  assert.equal(fields['f-name'].value, '');
  assert.equal(context.offers[1].name, 'Loaded Offer 2');
  assert.deepEqual(context.offers[2], {});
  assert.equal(Object.hasOwn(context.offers[0], 'rawPaste'), false);
  assert.equal(Object.hasOwn(context.offers[1], 'rawPaste'), false);
  assert.equal(Object.hasOwn(context.offers[2], 'rawPaste'), false);
});


test('offer storage sanitizer removes transient Paste Offer aliases without losing loaded card data', () => {
  const context = {
    offers: [
      { name: 'Loaded Offer 1', rawPaste: 'raw 1' },
      { name: 'Loaded Offer 2', pasteText: 'raw 2' },
      { parsedRaw: 'raw 3' },
      {}
    ]
  };
  vm.createContext(context);
  vm.runInContext([
    'const TRANSIENT_PASTE_OFFER_KEYS=["rawPaste","pasteText","parsedRaw"];',
    extractFunction('stripTransientPasteOfferFields'),
    'offers.forEach(stripTransientPasteOfferFields);'
  ].join('\n'), context);

  assert.deepEqual(JSON.parse(JSON.stringify(context.offers)), [
    { name: 'Loaded Offer 1' },
    { name: 'Loaded Offer 2' },
    {},
    {}
  ]);
});

test('canonical editor save and reload paths strip transient Paste Offer aliases', () => {
  assert.match(extractFunction('saveEditorToOffer'), /stripTransientPasteOfferFields\(offers\[cur\]/);
  assert.match(extractFunction('loadOfferToEditor'), /stripTransientPasteOfferFields\(offers\[i\]/);
  assert.match(extractFunction('visibleFieldsToData'), /stripTransientPasteOfferFields\(Object\.assign/);
  assert.match(extractFunction('commitVisibleFields'), /offers\[cur\] = stripTransientPasteOfferFields\(Object\.assign/);
});
