import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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

function createHarness() {
  const context = {
    OPERATOR_HEADERS: {
      po: { name: 'P&O Cruises' },
      celebrity: { name: 'Celebrity Cruises' },
      marella: { name: 'Marella Cruises' },
      virgin: { name: 'Virgin Voyages' }
    },
    OPERATOR_ALIASES: {
      po: [/\bp\s*&\s*o\b/i, /\bp&o\s+cruises\b/i],
      celebrity: [/\bcelebrity\b/i],
      marella: [/\bmarella\b/i],
      virgin: [/\bvirgin\b/i]
    },
    OPERATOR_SHIPS: {
      po: ['Arvia'],
      celebrity: ['Celebrity Apex'],
      marella: ['Explorer'],
      virgin: ['Scarlet Lady']
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeRegExp'),
    extractFunction('findKnownOperatorShip'),
    extractFunction('isDividerLine'),
    extractFunction('getOfferLabelIndex'),
    extractFunction('isOfferLabelLine'),
    extractFunction('hasExplicitOfferMarkers'),
    extractFunction('isKnownOperatorHeadingLine'),
    extractFunction('hasAccumulatedOfferEvidence'),
    extractFunction('isLikelyOfferStartLine'),
    extractFunction('getMultiOfferImportBlocks'),
    extractFunction('splitMultiOfferImport')
  ].join('\n'), context);
  return context;
}


function createImportContext(field, result, parsedBlocks) {
  const harness = createHarness();
  return {
    Number,
    offers: [{}, {}, {}, {}],
    cur: 0,
    activeMultiOfferImportIndexes: [],
    PARSE_FIELD_MAP: { operatorKey: 'f-operator', name: 'f-name' },
    OPERATOR_HEADERS: harness.OPERATOR_HEADERS,
    OPERATOR_ALIASES: harness.OPERATOR_ALIASES,
    OPERATOR_SHIPS: harness.OPERATOR_SHIPS,
    document: {
      getElementById(id) {
        if (id === 'multi-offer-result') return result;
        if (id === 'multi-offer-paste') return field;
        return null;
      },
      querySelectorAll() { return []; }
    },
    isOfferLoaded(offer) { return !!(offer && (offer.name || offer.operator)); },
    defaultTopBarUspForOperator() { return ''; },
    applyOperatorTopBarUspDefault() {},
    stripTransientPasteOfferFields() {},
    clearHeroImageDataFromOffer() {},
    loadOfferToEditor() {}, rv() {}, updateAllStatus() {}, genUtm() {}, checkPortsWarn() {}, updateExportFilenames() {}, runSpellQA() {}, queueAutosave() {},
    parseOfferText(block) {
      parsedBlocks.push(block);
      const firstLine = block.split('\n').find(line => !/^offer\s/i.test(line));
      return { parsed: { operatorKey: firstLine.toLowerCase().replace(/\W+/g, '') }, confidence: 'high', score: 100 };
    }
  };
}

function runImportFunctions(context) {
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeRegExp'),
    extractFunction('findKnownOperatorShip'),
    extractFunction('isDividerLine'),
    extractFunction('getOfferLabelIndex'),
    extractFunction('isOfferLabelLine'),
    extractFunction('hasExplicitOfferMarkers'),
    extractFunction('isKnownOperatorHeadingLine'),
    extractFunction('hasAccumulatedOfferEvidence'),
    extractFunction('isLikelyOfferStartLine'),
    extractFunction('getMultiOfferImportBlocks'),
    extractFunction('splitMultiOfferImport'),
    extractFunction('setMultiOfferStatus'),
    extractFunction('getParsedOfferMissingCount'),
    extractFunction('clampParseConfidenceScore'),
    extractFunction('getMultiOfferImportQualityResult'),
    extractFunction('applyParsedOfferToSlot'),
    extractFunction('performMultiOfferImport')
  ].join('\n'), context);
}


const mixedOperatorBatch = `Offer 1 Celebrity
Celebrity Cruises
Celebrity Infinity
Madeira, Canaries & Morocco
Ocean View Cabin
12 nights
From £1,559pp
Includes Barcelona pre-cruise stay

Offer 2 Marella
Marella Cruises
Marella Discovery
Aegean Delights
Outside Cabin
7 nights
From £1,355pp
Adults Only
Flights from Newcastle

Offer 3 Cunard
Cunard
Queen Elizabeth
Norwegian Fjords & Northern Lights
Inside Cabin
12 nights
From £1,299pp
Includes $40 onboard credit

Offer 4 Fred Olsen
Fred. Olsen Cruise Lines
Bolette
Newcastle departure
Inside Cabin
From £1,999pp
Free return taxi
Duration shows 13 nights but itinerary indicates 12 nights`;

test('mixed operator multi-offer import isolates blocks, parser calls, assignment, counts and all-preview payloads', () => {
  const field = { value: mixedOperatorBatch };
  const result = { innerHTML: '', className: '' };
  const parseCalls = [];
  const previewCalls = [];
  const expected = [
    { operatorKey: 'celebrity', name: 'Madeira, Canaries & Morocco', ship: 'Celebrity Infinity', forbidden: /Marella|Cunard|Fred\.?\s*Olsen|taxi/i },
    { operatorKey: 'marella', name: 'Aegean Delights', ship: 'Marella Discovery', forbidden: /Celebrity|Cunard|Fred\.?\s*Olsen|Barcelona|taxi/i },
    { operatorKey: 'cunard', name: 'Norwegian Fjords & Northern Lights', ship: 'Queen Elizabeth', forbidden: /Celebrity|Marella|Fred\.?\s*Olsen|Adults Only|taxi/i },
    { operatorKey: 'fred-olsen', name: 'Newcastle departure', ship: 'Bolette', forbidden: /Celebrity|Marella|Cunard|Adults Only|Barcelona/i }
  ];
  const context = createImportContext(field, result, parseCalls);
  context.cur = 2;
  context.PARSE_FIELD_MAP = { operatorKey: 'f-operator', name: 'f-name', ship: 'f-ship', incl: 'f-incl' };
  context.isOfferStarted = offer => !!(offer && (offer.name || offer.operator || offer.ship || offer.incl));
  context.console = { log() {}, debug() {} };
  context.requestAnimationFrame = fn => fn();
  context.renderPreviewMode = () => { previewCalls.push(context.offers.filter(context.isOfferStarted).map(offer => ({ ...offer }))); };
  context.parseOfferText = (block) => {
    const index = parseCalls.length;
    parseCalls.push(block);
    const item = expected[index];
    assert.ok(item, `Unexpected parse call ${index}`);
    assert.equal(block, context.getMultiOfferImportBlocks(mixedOperatorBatch)[index].block);
    assert.equal(item.forbidden.test(block), false, `Block ${index} contains cross-offer text`);
    return { parsed: { operatorKey: item.operatorKey, name: item.name, ship: item.ship, incl: block }, confidence: 'high', score: 100 };
  };
  runImportFunctions(context);

  const blocks = context.getMultiOfferImportBlocks(mixedOperatorBatch);
  assert.equal(blocks.length, 4);
  assert.equal(JSON.stringify(blocks.map(item => item.targetIndex)), JSON.stringify([0, 1, 2, 3]));
  blocks.forEach((item, index) => {
    const operatorHits = [
      /celebrity/i.test(item.block),
      /marella/i.test(item.block),
      /cunard/i.test(item.block),
      /fred\s*\.?\s*olsen/i.test(item.block)
    ].filter(Boolean).length;
    assert.equal(operatorHits, 1, `Block ${index} should contain exactly one operator`);
  });

  context.performMultiOfferImport(false);
  assert.equal(parseCalls.length, 4);
  assert.deepEqual(context.offers.slice(0, 4).map(offer => offer.operator), ['celebrity', 'marella', 'cunard', 'fred-olsen']);
  assert.deepEqual(context.offers.slice(0, 4).map(offer => offer.name), expected.map(item => item.name));
  assert.equal(context.cur, 2);
  assert.equal(context.offers.some(context.isOfferStarted), true);
  assert.equal(context.offers.filter(context.isOfferStarted).length, 4);
  assert.equal(previewCalls.at(-1).length, 4);
});

test('splitMultiOfferImport splits Trello-style divider imports into four offers', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer 1

P&O Cruises
Arvia
Spain & France

--------------------------------

Offer 2

Celebrity Cruises
Celebrity Apex
Portugal & Spain

--------------------------------

Offer 3

Marella Cruises
Explorer
Canary Islands

--------------------------------

Offer 4

Virgin Voyages
Scarlet Lady
Greek Island Glow`);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0], 'Offer 1\nP&O Cruises\nArvia\nSpain & France');
  assert.equal(blocks[3], 'Offer 4\nVirgin Voyages\nScarlet Lady\nGreek Island Glow');
});

test('splitMultiOfferImport detects plain-copy boundaries from operator names', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`P&O Cruises
Arvia
Spain & France

Celebrity Cruises
Celebrity Apex
Portugal & Spain

Marella Cruises
Explorer
Canary Islands

Virgin Voyages
Scarlet Lady
Greek Island Glow`);
  assert.equal(blocks.length, 4);
  assert.equal(JSON.stringify(blocks.map(block => block.split('\n')[0])), JSON.stringify(['P&O Cruises', 'Celebrity Cruises', 'Marella Cruises', 'Virgin Voyages']));
});

test('splitMultiOfferImport prioritises numeric Offer markers and keeps marker headings', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer 1
Celebrity Cruises
Celebrity Apex
Italy Cruise

Offer 2
Royal Caribbean
Icon of the Seas
Caribbean Escape

Offer 3
Marella Cruises
Explorer
Canary Islands

Offer 4
P&O Cruises
Arvia
Spain & France`);

  assert.equal(JSON.stringify(blocks), JSON.stringify([
    'Offer 1\nCelebrity Cruises\nCelebrity Apex\nItaly Cruise',
    'Offer 2\nRoyal Caribbean\nIcon of the Seas\nCaribbean Escape',
    'Offer 3\nMarella Cruises\nExplorer\nCanary Islands',
    'Offer 4\nP&O Cruises\nArvia\nSpain & France'
  ]));
  assert.ok(blocks.every(block => /^offer\s/i.test(block)));
});



test('splitMultiOfferImport uses marker splitting only for marked four-offer pastes', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer 1
Celebrity Cruises
Celebrity Apex
Italy Cruise

Offer 2
Royal Caribbean International
Icon of the Seas
Caribbean Escape

Offer 3
Marella Cruises
Explorer
Canary Islands

Offer 4
Cunard
Queen Anne
Norwegian Fjords`);

  assert.equal(blocks.length, 4);
  assert.equal(JSON.stringify(blocks.map(block => block.split('\n')[0])), JSON.stringify([
    'Offer 1',
    'Offer 2',
    'Offer 3',
    'Offer 4'
  ]));
});

test('splitMultiOfferImport skips operator fallback when explicit markers exist inside paste', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer 1
Celebrity Cruises
Celebrity Apex
Italy Cruise

Royal Caribbean International
Icon of the Seas
This operator line belongs to marked Offer 1

Offer 2
Marella Cruises
Explorer
Canary Islands`);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0], [
    'Offer 1',
    'Celebrity Cruises',
    'Celebrity Apex',
    'Italy Cruise',
    '',
    'Royal Caribbean International',
    'Icon of the Seas',
    'This operator line belongs to marked Offer 1'
  ].join('\n'));
  assert.equal(blocks[1], 'Offer 2\nMarella Cruises\nExplorer\nCanary Islands');
});

test('splitMultiOfferImport accepts uppercase OFFER markers', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`OFFER 1
Celebrity Cruises
Apex

OFFER 2
Marella Cruises
Explorer

OFFER 3
Virgin Voyages
Scarlet Lady

OFFER 4
P&O Cruises
Arvia`);

  assert.equal(blocks.length, 4);
  assert.equal(blocks[0], 'OFFER 1\nCelebrity Cruises\nApex');
  assert.equal(blocks[3], 'OFFER 4\nP&O Cruises\nArvia');
});

test('splitMultiOfferImport accepts Offer One wording', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer One
Celebrity Cruises
Apex

Offer Two
Marella Cruises
Explorer

Offer Three
Virgin Voyages
Scarlet Lady

Offer Four
P&O Cruises
Arvia`);

  assert.equal(JSON.stringify(blocks.map(block => block.split('\n')[0])), JSON.stringify(['Offer One', 'Offer Two', 'Offer Three', 'Offer Four']));
});

test('splitMultiOfferImport removes decorative separator-only lines from marked imports', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer 1
## =====================
Celebrity Cruises
#####################
Celebrity Apex

Offer 2
=====================
Marella Cruises
Explorer`);

  assert.equal(JSON.stringify(blocks), JSON.stringify(['Offer 1\nCelebrity Cruises\nCelebrity Apex', 'Offer 2\nMarella Cruises\nExplorer']));
});

test('single-offer parse flow remains separate from Multi Offer Import splitting', () => {
  assert.doesNotMatch(extractFunction('parseOffer'), /splitMultiOfferImport/);
  assert.match(extractFunction('parseOffer'), /parseOfferText\(raw,\{renderIntelligence:true\}\)/);
});

test('Multi Offer Import passes the same blocks as individual single-offer parses', () => {
  const context = createHarness();
  const offers = [
    'Celebrity Cruises\nCelebrity Apex\nItaly Cruise',
    'Royal Caribbean\nIcon of the Seas\nCaribbean Escape',
    'Marella Cruises\nExplorer\nCanary Islands',
    'P&O Cruises\nArvia\nSpain & France'
  ];
  const multiPaste = offers.map((offer, index) => `Offer ${index + 1}\n${offer}`).join('\n\n');
  const parseOfferText = block => ({ parsed: { raw: block }, score: 100, confidence: 'high' });

  assert.equal(
    JSON.stringify(context.splitMultiOfferImport(multiPaste).map(block => parseOfferText(block).parsed)),
    JSON.stringify(offers.map((block, index) => parseOfferText(`Offer ${index + 1}\n${block}`).parsed))
  );
});

test('Multi Offer Import UI and parser reuse hooks are present', () => {
  assert.match(html, /Multi Offer Import/);
  assert.match(html, /<textarea id="multi-offer-paste"[^>]* oninput="handleMultiOfferInput\(event\)"[^>]* onkeydown="handleMultiOfferKeydown\(event\)"/);
  assert.match(html, /Load All Offers/);
  assert.match(extractFunction('performMultiOfferImport'), /parseOfferText\(blockText,\{renderIntelligence:false\}\)/);
  assert.match(extractFunction('performMultiOfferImport'), /Replace existing offers\?/);
});

test('Multi Offer Import textarea Enter submits through Load All Offers', () => {
  const context = {
    calls: 0,
    loadAllOffers() { context.calls += 1; }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('handleMultiOfferKeydown'), context);
  let prevented = false;
  context.handleMultiOfferKeydown({
    key: 'Enter',
    target: { id: 'multi-offer-paste' },
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.equal(context.calls, 1);
});

test('Multi Offer Import textarea Shift Enter keeps native newline behaviour', () => {
  const context = {
    calls: 0,
    loadAllOffers() { context.calls += 1; }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('handleMultiOfferKeydown'), context);
  let prevented = false;
  context.handleMultiOfferKeydown({
    key: 'Enter',
    shiftKey: true,
    target: { id: 'multi-offer-paste' },
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, false);
  assert.equal(context.calls, 0);
});

test('Multi Offer Import manual clear removes stale result rows and imported offers', () => {
  const result = { innerHTML: 'Offer 1 Loaded', className: 'parse-result high' };
  const field = { value: '' };
  const calls = [];
  const tabs = Array.from({ length: 4 }, () => ({ classList: { toggle(name, state) { calls.push(['tab', name, state]); } } }));
  const context = {
    Number,
    offers: [{ name: 'Imported 1' }, { name: 'Imported 2' }, { name: 'Sheet offer' }, {}],
    cur: 0,
    activeMultiOfferImportIndexes: [0, 1],
    isOfferLoaded(offer) { return !!(offer && offer.name); },
    loadOfferToEditor(index) { calls.push(['loadOfferToEditor', index]); },
    renderOfferIndex(index) { calls.push(['renderOfferIndex', index]); },
    updateAllStatus() { calls.push(['updateAllStatus']); },
    queueAutosave() { calls.push(['queueAutosave']); },
    recordCampaignHistoryAfterAsyncChange(label) { calls.push(['history', label]); },
    document: {
      getElementById(id) {
        if (id === 'multi-offer-result') return result;
        if (id === 'multi-offer-paste') return field;
        return null;
      },
      querySelectorAll(selector) {
        assert.equal(selector, '.otab');
        return tabs;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('setMultiOfferStatus'),
    extractFunction('refreshOfferWorkspaceAfterEmptyPaste'),
    extractFunction('resetMultiImportedOffersFromEmptyPaste'),
    extractFunction('handleMultiOfferInput')
  ].join('\n'), context);
  context.handleMultiOfferInput({ inputType: 'deleteContentBackward' });

  assert.equal(result.innerHTML, '');
  assert.equal(result.className, 'parse-result ');
  assert.deepEqual(JSON.parse(JSON.stringify(context.offers)), [{}, {}, { name: 'Sheet offer' }, {}]);
  assert.equal(context.cur, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(context.activeMultiOfferImportIndexes)), []);
  assert.ok(calls.some(call => call[0] === 'updateAllStatus'));
  assert.ok(calls.some(call => call[0] === 'history' && call[1] === 'Multi offer import cleared'));
});

test('Multi Offer Import result rows are clickable navigation shortcuts without buttons', () => {
  const performMultiOfferImport = extractFunction('performMultiOfferImport');
  assert.match(performMultiOfferImport, /class="multi-offer-status-row"/);
  assert.match(performMultiOfferImport, /title="Open Offer \$\{index\+1\}"/);
  assert.match(performMultiOfferImport, /title="Open this offer"/);
  assert.match(performMultiOfferImport, /onclick="jumpToMultiOfferStatus\(\$\{index\}\)"/);
  assert.doesNotMatch(performMultiOfferImport, /<button class="abtn btn-compact" type="button" onclick="cur=\$\{index\}/);
  assert.match(html, /\.multi-offer-status-row\{[^}]*cursor:pointer;/);
});

test('jumpToMultiOfferStatus reuses tab selection, switches to Single view, and preserves sidebar scroll position', () => {
  const calls = [];
  const offerDetailsHeader = {
    classList: {
      contains(value) { return value === 'collapsed'; },
      toggle(value, state) { calls.push(['toggle-header', value, state]); }
    },
    nextElementSibling: {
      classList: {
        contains(value) { return value === 'section-body'; },
        toggle(value, state) { calls.push(['toggle-body', value, state]); }
      }
    }
  };
  const offerDetailsSection = {
    querySelector(selector) {
      assert.equal(selector, '.section-hdr');
      return offerDetailsHeader;
    },
    scrollIntoView(options) { calls.push(['scroll', options.block]); }
  };
  const context = {
    Number,
    calls,
    sv(index) { calls.push(['sv', index]); },
    setView(mode) { calls.push(['setView', mode]); },
    document: {
      querySelector(selector) {
        assert.equal(selector, '.section[data-section-key="offer-details"]');
        return offerDetailsSection;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('setSectionCollapsedByHeader'),
    extractFunction('openOfferDetailsSection'),
    extractFunction('jumpToMultiOfferStatus')
  ].join('\n'), context);

  assert.equal(context.jumpToMultiOfferStatus(2), true);
  assert.deepEqual(calls, [
    ['sv', 2],
    ['setView', 'single']
  ]);
});


test('Multi Offer Import clamps displayed confidence scores to 100', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractFunction('clampParseConfidenceScore'), context);

  assert.equal(context.clampParseConfidenceScore(110), 100);
  assert.equal(context.clampParseConfidenceScore(105), 100);
  assert.equal(context.clampParseConfidenceScore(98), 98);
});



test('Multi Offer Import loads exactly four marked blocks without additional ignored status', () => {
  const result = { innerHTML: '', className: '' };
  const field = { value: `Offer 1
Celebrity Cruises
Celebrity Apex
Italy Cruise

Offer 2
Royal Caribbean International
Icon of the Seas
Caribbean Escape

Offer 3
Marella Cruises
Explorer
Canary Islands

Offer 4
Cunard
Queen Anne
Norwegian Fjords` };
  const parsedBlocks = [];
  const context = {
    offers: [{}, {}, {}, {}],
    cur: 0,
    activeMultiOfferImportIndexes: [],
    PARSE_FIELD_MAP: { operatorKey: 'f-operator', name: 'f-name' },
    OPERATOR_HEADERS: createHarness().OPERATOR_HEADERS,
    OPERATOR_ALIASES: createHarness().OPERATOR_ALIASES,
    OPERATOR_SHIPS: createHarness().OPERATOR_SHIPS,
    document: {
      getElementById(id) {
        if (id === 'multi-offer-result') return result;
        if (id === 'multi-offer-paste') return field;
        return null;
      },
      querySelectorAll() { return []; }
    },
    isOfferLoaded() { return false; },
    defaultTopBarUspForOperator() { return ''; },
    applyOperatorTopBarUspDefault() {},
    stripTransientPasteOfferFields() {},
    loadOfferToEditor() {}, rv() {}, updateAllStatus() {}, genUtm() {}, checkPortsWarn() {}, updateExportFilenames() {}, runSpellQA() {}, queueAutosave() {},
    parseOfferText(block) {
      parsedBlocks.push(block);
      const firstLine = block.split('\n').find(line => !/^offer\s/i.test(line));
      return { parsed: { operatorKey: firstLine.toLowerCase().replace(/\W+/g, '') }, confidence: 'high', score: 100 };
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeRegExp'),
    extractFunction('findKnownOperatorShip'),
    extractFunction('isDividerLine'),
    extractFunction('getOfferLabelIndex'),
    extractFunction('isOfferLabelLine'),
    extractFunction('hasExplicitOfferMarkers'),
    extractFunction('isKnownOperatorHeadingLine'),
    extractFunction('hasAccumulatedOfferEvidence'),
    extractFunction('isLikelyOfferStartLine'),
    extractFunction('getMultiOfferImportBlocks'),
    extractFunction('splitMultiOfferImport'),
    extractFunction('setMultiOfferStatus'),
    extractFunction('getParsedOfferMissingCount'),
    extractFunction('clampParseConfidenceScore'),
    extractFunction('getMultiOfferImportQualityResult'),
    extractFunction('applyParsedOfferToSlot'),
    extractFunction('performMultiOfferImport')
  ].join('\n'), context);

  context.performMultiOfferImport(false);

  assert.equal(parsedBlocks.length, 4);
  assert.equal(context.offers.length, 4);
  assert.doesNotMatch(result.innerHTML, /additional offers ignored/i);
});


test('Multi Offer Import applies parsed sailing from per slot without cross-slot wiping', () => {
  const result = { innerHTML: '', className: '' };
  const field = { value: `Offer 1
Celebrity Cruises
Sailing from Barcelona

Offer 2
Celebrity Cruises
Sailing from Southampton

Offer 3
Celebrity Cruises
Sailing from Civitavecchia

Offer 4
Celebrity Cruises
Sailing from Barcelona` };
  const parsedBlocks = [];
  const context = createImportContext(field, result, parsedBlocks);
  context.PARSE_FIELD_MAP = { operatorKey: 'f-operator', departurePort: 'f-departurePort', sailingFrom: 'f-sailingFrom' };
  context.parseOfferText = (block) => {
    parsedBlocks.push(block);
    const departurePort = (block.match(/Sailing from ([^\n]+)/) || [])[1];
    return { parsed: { operatorKey: 'celebrity', departurePort, sailingFrom: departurePort === 'Civitavecchia' ? 'Rome' : departurePort }, confidence: 'high', score: 100 };
  };
  context.getCruiseGatewayDepartureDisplay = port => port === 'Civitavecchia' ? 'Rome' : port;
  context.getAutoSailingFromForOffer = offer => context.getCruiseGatewayDepartureDisplay(offer.departurePort || '');
  context.applyAutoSailingFromToOffer = offer => {
    if (offer._sailingFromManual) return offer.sailingFrom || '';
    offer.sailingFrom = context.getAutoSailingFromForOffer(offer);
    offer._sailingFromManual = false;
    return offer.sailingFrom;
  };
  runImportFunctions(context);

  context.performMultiOfferImport(false);

  assert.deepEqual(context.offers.map(offer => offer.departurePort), ['Barcelona', 'Southampton', 'Civitavecchia', 'Barcelona']);
  assert.deepEqual(context.offers.map(offer => offer.sailingFrom), ['Barcelona', 'Southampton', 'Rome', 'Barcelona']);
  assert.deepEqual(context.offers.map(offer => offer._sailingFromManual), [false, false, false, false]);
});

test('Multi Offer Import status rows use the clamped confidence score for display', () => {
  const performMultiOfferImport = extractFunction('performMultiOfferImport');
  assert.match(performMultiOfferImport, /Confidence \$\{clampParseConfidenceScore\(quality\.score\)\}/);
  assert.doesNotMatch(performMultiOfferImport, /Confidence \$\{result\.score\}/);
});

test('Multi Offer Import logs exact raw text checked for destination typo QA', () => {
  const fn = extractFunction('getMultiOfferImportQualityResult');
  assert.match(fn, /console\.debug\("\[multi-offer-import spell qa\]",\{checkedText:String\(rawText\|\|""\),parsedPorts:String\(parsed\.ports\|\|""\),issues:spellingIssues\}\)/);
});

test('Multi Offer Import loaded status includes raw destination typo QA warnings and lowers displayed confidence', () => {
  const result = { innerHTML: '', className: '' };
  const field = { value: `Celebrity Cruises
Celebrity Apex
Mediterranean Discovery
7 nights
Full Board
£999
Barcelona, Span
Florence/Pisa, Laspezia, Italy` };
  const parsedBlocks = [];
  const context = createImportContext(field, result, parsedBlocks);
  context.parseOfferText = (block) => {
    parsedBlocks.push(block);
    return {
      parsed: {
        operatorKey: 'celebrity',
        name: 'Mediterranean Discovery',
        ship: 'Celebrity Apex',
        day: '12',
        month: 'June 2027',
        nights: '7',
        price: '999',
        boardlbl: 'Full Board',
        ports: 'Barcelona • La Spezia • Italy'
      },
      confidence: 'high',
      score: 100
    };
  };
  context.getOfferIntelligenceQualityDetails = () => ({ score: 88, spellingIssues: [{ token: 'Span', suggestion: 'Spain' }, { token: 'Laspezia', suggestion: 'La Spezia' }] });
  runImportFunctions(context);

  context.performMultiOfferImport(false);

  assert.match(result.innerHTML, /Offer 1 Loaded/);
  assert.match(result.innerHTML, /Confidence 88 · 0 missing fields · 2 QA warnings/);
  assert.doesNotMatch(result.innerHTML, /Confidence 100 · 0 missing fields(?:<|$)/);
  assert.match(result.className, /partial/);
});

test('Multi Offer Import clears stale hero data on imported slots', () => {
  assert.match(extractFunction('applyParsedOfferToSlot'), /clearHeroImageDataFromOffer\(index\)/);
});

test('marked Offer 3 only imports into Card 3 and passes isolated marked block', () => {
  const result = { innerHTML: '', className: '' };
  const field = { value: `Offer 3
Marella Cruises
Explorer` };
  const parsedBlocks = [];
  const context = createImportContext(field, result, parsedBlocks);
  context.offers = [{ name: 'Existing 1' }, { name: 'Existing 2' }, { name: 'Existing 3' }, { name: 'Existing 4' }];
  runImportFunctions(context);
  context.performMultiOfferImport(false);
  assert.deepEqual(parsedBlocks, ['Offer 3\nMarella Cruises\nExplorer']);
  assert.equal(context.offers[0].name, 'Existing 1');
  assert.equal(context.offers[1].name, 'Existing 2');
  assert.equal(context.offers[2].operator, 'marellacruises');
  assert.equal(context.offers[3].name, 'Existing 4');
  assert.equal(JSON.stringify(context.activeMultiOfferImportIndexes), JSON.stringify([2]));
  assert.equal(context.cur, 0);
});

test('marked Offer 4 only imports into Card 4', () => {
  const result = { innerHTML: '', className: '' };
  const field = { value: `OFFER 4
Cunard
Queen Anne` };
  const parsedBlocks = [];
  const context = createImportContext(field, result, parsedBlocks);
  context.offers = [{ name: 'Existing 1' }, { name: 'Existing 2' }, { name: 'Existing 3' }, { name: 'Existing 4' }];
  runImportFunctions(context);
  context.performMultiOfferImport(false);
  assert.deepEqual(parsedBlocks, ['OFFER 4\nCunard\nQueen Anne']);
  assert.equal(context.offers[0].name, 'Existing 1');
  assert.equal(context.offers[1].name, 'Existing 2');
  assert.equal(context.offers[2].name, 'Existing 3');
  assert.equal(context.offers[3].operator, 'cunard');
  assert.equal(JSON.stringify(context.activeMultiOfferImportIndexes), JSON.stringify([3]));
});

test('marked Offer 2 plus Offer 4 imports into Cards 2 and 4 only', () => {
  const result = { innerHTML: '', className: '' };
  const field = { value: `Offer 2
Royal Caribbean
Icon of the Seas

Offer Four
Cunard
Queen Anne` };
  const parsedBlocks = [];
  const context = createImportContext(field, result, parsedBlocks);
  context.offers = [{ name: 'Existing 1' }, { name: 'Existing 2' }, { name: 'Existing 3' }, { name: 'Existing 4' }];
  runImportFunctions(context);
  context.performMultiOfferImport(false);
  assert.deepEqual(parsedBlocks, ['Offer 2\nRoyal Caribbean\nIcon of the Seas', 'Offer Four\nCunard\nQueen Anne']);
  assert.equal(context.offers[0].name, 'Existing 1');
  assert.equal(context.offers[1].operator, 'royalcaribbean');
  assert.equal(context.offers[2].name, 'Existing 3');
  assert.equal(context.offers[3].operator, 'cunard');
  assert.equal(JSON.stringify(context.activeMultiOfferImportIndexes), JSON.stringify([1, 3]));
});

test('getMultiOfferImportBlocks preserves full marked Offer 1-4 targets', () => {
  const context = createHarness();
  const blocks = context.getMultiOfferImportBlocks(`Offer One
Celebrity Cruises
Apex

Offer 2
Royal Caribbean
Icon

OFFER 3
Marella Cruises
Explorer

Offer Four
Cunard
Queen Anne`);
  assert.equal(JSON.stringify(blocks.map(item => item.targetIndex)), JSON.stringify([0, 1, 2, 3]));
  assert.equal(JSON.stringify(blocks.map(item => item.block.split('\n')[0])), JSON.stringify(['Offer One', 'Offer 2', 'OFFER 3', 'Offer Four']));
});

test('unmarked Multi Offer Import fallback still loads sequentially', () => {
  const result = { innerHTML: '', className: '' };
  const field = { value: `Marella Cruises
Explorer
Canaries


Cunard
Queen Anne
Fjords` };
  const parsedBlocks = [];
  const context = createImportContext(field, result, parsedBlocks);
  runImportFunctions(context);
  context.performMultiOfferImport(false);
  assert.equal(context.offers[0].operator, 'marellacruises');
  assert.equal(context.offers[1].operator, 'cunard');
  assert.equal(JSON.stringify(context.activeMultiOfferImportIndexes), JSON.stringify([0, 1]));
});

test('splitMultiOfferImport splits four complete stacked offers without explicit markers', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Celebrity Cruises
Canaries & Portugal Cruise
7th October 2026
11 night cruise
Celebrity Apex
Sailing from Southampton
Inside Cabin
Full Board
£999 per person based on 2 sharing
Itinerary
Southampton - Porto (Leixoes) Portugal - Lisbon, Portugal - Gran Canaria, Canary Islands - Tenerife, Canary Islands - Madeira (Funchal), Portugal - Vigo, Spain - Southampton

Fred Olsen
Flavours of France & Northern Spain
17th October 2027
9 night cruise
Bolette
Sailing from Port Of Tyne
Inside Cabin
Full Board
£899 per person based on 2 sharing
Itinerary
Newcastle - Honfleur, France - Gijon, Asturias, Spain - Santander, Cantabria Spain - Cruise by Royal Palace of La Magdal - Pauillas - Newcastle

Marella Cruises
Aegean Shores
5th May 2027
7 night cruise
Explorer
Sailing from Corfu
Inside Cabin
All Inclusive
£799 per person based on 2 sharing
Itinerary
Corfu - Rhodes - Santorini - Corfu

Virgin Voyages
Greek Island Glow
12th June 2027
7 night cruise
Scarlet Lady
Sailing from Athens
Sea Terrace
Full Board
£1199 per person based on 2 sharing
Itinerary
Athens - Mykonos - Rhodes - Athens`);

  assert.equal(blocks.length, 4);
  assert.equal(JSON.stringify(blocks.map(block => block.split('\n')[0])), JSON.stringify(['Celebrity Cruises', 'Fred Olsen', 'Marella Cruises', 'Virgin Voyages']));
});

test('single complete unmarked offer remains one block only', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Celebrity Cruises
Canaries & Portugal Cruise
7th October 2026
11 night cruise
Celebrity Apex
Sailing from Southampton
Inside Cabin
Full Board
£999 per person based on 2 sharing
Itinerary
Southampton - Porto (Leixoes) Portugal - Lisbon, Portugal - Gran Canaria - Southampton`);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].split('\n')[0], 'Celebrity Cruises');
});

test('operator names inside normal offer content do not incorrectly split a block', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Celebrity Cruises
Celebrity Apex
Canaries & Portugal Cruise
Meet other Celebrity guests onboard before the itinerary is confirmed
Royal Caribbean International appears in comparison copy, not as a new offer

Marella Cruises
Aegean Shores
5th May 2027
7 night cruise
Explorer
All Inclusive
£799 per person
Itinerary
Corfu - Rhodes - Corfu`);

  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /Royal Caribbean International appears in comparison copy/);
  assert.equal(blocks[1].split('\n')[0], 'Marella Cruises');
});

test('Fred Olsen Port Of Tyne stacked example does not keep homeports in parsed You’ll Visit ports', () => {
  const context = createHarness();
  const [block] = context.splitMultiOfferImport(`Fred Olsen
Flavours of France & Northern Spain
17th October 2027
9 night cruise
Bolette
Sailing from Port Of Tyne
Inside Cabin
Full Board
£899 per person based on 2 sharing
Itinerary
Newcastle - Honfleur, France - Gijon, Asturias, Spain - Santander, Cantabria Spain - Cruise by Royal Palace of La Magdal - Pauillas - Newcastle`);

  assert.equal(block.split('\n')[0], 'Fred Olsen');
  assert.doesNotMatch(block, /^Port Of Tyne$/m);
  assert.match(block, /Honfleur, France/);
});

test('Marella luggage after itinerary is preserved in same block and not treated as a split port', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Marella Cruises
Greek Islands
1st August 2027
7 night cruise
Explorer
Sailing from Corfu
Inside Cabin
All Inclusive
£999 per person based on 2 sharing
Itinerary
Corfu - Rhodes - Santorini - Corfu
Luggage & transfers included`);

  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /Luggage & transfers included$/);
});

test('Multi Offer Import overwrites each parsed slot without reusing active editor or stale slot state', () => {
  const result = { innerHTML: '', className: '' };
  const field = { value: `Offer 1
Celebrity Cruises
Fresh One

Offer 2
Marella Cruises
Fresh Two

Offer 3
P&O Cruises
Fresh Three

Offer 4
Virgin Voyages
Fresh Four` };
  const parsedBlocks = [];
  const logs = [];
  const context = createImportContext(field, result, parsedBlocks);
  context.cur = 2;
  context.console = { log(label, entry) { logs.push(entry || label); }, debug() {} };
  context.offers = [
    { operator: 'stale-a', name: 'Stale One', ship: 'Old Ship 1' },
    { operator: 'stale-b', name: 'Stale Two', ship: 'Old Ship 2' },
    { operator: 'stale-c', name: 'Stale Three', ship: 'Old Ship 3' },
    { operator: 'stale-d', name: 'Stale Four', ship: 'Old Ship 4' }
  ];
  context.PARSE_FIELD_MAP = { operatorKey: 'f-operator', name: 'f-name' };
  context.parseOfferText = (block) => {
    parsedBlocks.push(block);
    const lines = block.split('\n').filter(line => !/^offer\s/i.test(line));
    const [operator, title] = lines;
    return {
      parsed: { operatorKey: operator.toLowerCase().replace(/\W+/g, ''), name: title },
      confidence: 'high',
      score: 100
    };
  };
  runImportFunctions(context);

  context.performMultiOfferImport(true);

  assert.equal(context.offers.length, 4);
  assert.deepEqual(context.offers.map(offer => offer.name), ['Fresh One', 'Fresh Two', 'Fresh Three', 'Fresh Four']);
  assert.deepEqual(context.offers.map(offer => offer.ship), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(context.offers.some(context.isOfferLoaded), true);
  assert.deepEqual(logs.map((entry, index) => ({ sourceIndex: entry.sourceIndex, targetIndex: entry.targetIndex, activeEditor: 2 })), [
    { sourceIndex: 0, targetIndex: 0, activeEditor: 2 },
    { sourceIndex: 1, targetIndex: 1, activeEditor: 2 },
    { sourceIndex: 2, targetIndex: 2, activeEditor: 2 },
    { sourceIndex: 3, targetIndex: 3, activeEditor: 2 }
  ]);
});

test('Multi Offer Import retains full pasted textarea and defaults intelligence collapsed after import', () => {
  const field = { value: mixedOperatorBatch };
  const result = { innerHTML: '', className: '' };
  const parseCalls = [];
  const context = createImportContext(field, result, parseCalls);
  context.PARSE_FIELD_MAP = { operatorKey: 'f-operator', name: 'f-name', ship: 'f-ship', incl: 'f-incl' };
  context.console = { log() {}, debug() {} };
  context.requestAnimationFrame = fn => fn();
  context.renderPreviewMode = () => {};
  context.parseOfferText = (block) => {
    parseCalls.push(block);
    return { parsed: { operatorKey: 'celebrity', name: `Offer ${parseCalls.length}`, ship: 'Ship', incl: block }, confidence: 'high', score: 100 };
  };
  runImportFunctions(context);
  context.performMultiOfferImport(false);
  assert.equal(field.value, mixedOperatorBatch);
  assert.equal(parseCalls.length, 4);
  assert.equal((result.innerHTML.match(/class="multi-offer-status-row"/g) || []).length, 4);
  assert.match(html, /return `<details class="parser-intelligence-details">/);
  assert.doesNotMatch(html, /<details class="parser-intelligence-details" open>/);
  assert.ok(!field.value.trim().startsWith('Offer 4 Fred Olsen'));
});
