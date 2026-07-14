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
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}
function extractConst(name) {
  const match = html.match(new RegExp(`const\\s+${name}\\s*=`));
  assert.ok(match, `Could not find ${name}`);
  const start = match.index;
  const end = html.indexOf(';', start);
  return html.slice(start, end + 1);
}
function createContext() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext([
    extractConst('OPERATOR_SHIPS'),
    extractConst('OPERATOR_ALIASES'),
    'const OPERATOR_HEADERS={royal:{name:"Royal Caribbean"},ambassador:{name:"Ambassador Cruise Line"},celebrity:{name:"Celebrity Cruises"},po:{name:"P&O Cruises"},marella:{name:"Marella Cruises"},fred:{name:"Fred. Olsen Cruise Lines"},msc:{name:"MSC Cruises"},cunard:{name:"Cunard"},ncl:{name:"Norwegian Cruise Line"},princess:{name:"Princess Cruises"},virgin:{name:"Virgin Voyages"},amawaterways:{name:"AmaWaterways"}};',
    extractFunction('escapeRegExp'),
    extractFunction('findKnownOperatorShip'),
    extractConst('CRUISE_OFFER_DETECTION_THRESHOLD'),
    extractConst('CRUISE_OFFER_DETECTION_MARGIN'),
    extractConst('CRUISE_OFFER_SIGNAL_WEIGHTS'),
    extractConst('NON_CRUISE_OFFER_SIGNAL_WEIGHTS'),
    extractFunction('detectCruiseOffer')
  ].join('\n'), context);
  return context;
}

const cruise1 = `Royal Caribbean\n\nSpain & France\n\n25th September 2026\n\n8 night cruise\n\nLiberty Of The Seas\n\nSailing from Southampton\n\nOcean View Cabin\n\nFull Board\n\n£1689 for a family of two adults & 1 child\n\nItinerary\n\nSouthampton - Paris (Le Havre), France - Bilbao, Spain - La Coruna, Spain - Vigo, Spain - Cherbourg, France - Southampton`;
const cruise2 = `Offer 3 - Norwegian Fjords\n\n28 May 2027\n\n8 Nights Sailing on Celebrity Apex - Full Board\n\nSailing from Southampton\n\nInside Cabin\n\nNo Transfers\n\n£1,499.00 per person\n\nSouthampton, England\nAt Sea\nHaugesund, Norway\nMolde, Norway\nTrondheim, Norway\nOlden, Norway\nBergen, Norway\nAt Sea\nSouthampton, England`;
const cruise3 = `Ambassador Cruise Line\n\nCoastal Gems of Sweden & Denmark\n\n20th June 2028\n\n7 night cruise\n\nAmbition\n\nSailing from Port of Tyne\n\nInside Cabin\n\nFull Board\n\n£765 per person based on 2 sharing`;
const packageHoliday = `Your holiday to...\n\nSunset Paradise Resort\n\nLassi, Kefalonia\n\nHoliday summary\n\n7 nights from 21st Jul 2026\n\nBed and Breakfast\n\n2 Adults\n\n1 x Studio\n\n2 x 10kg Hand Baggage\n\n2 x 22kg Bag Allowance\n\nCoach Transfers\n\nFlight details\n\nGoing out\n\nNewcastle NCL to Kefalonia EFL\n\nPayable to your travel agent\n\n£1,148`;
const touring = `Japan Uncovered\n\nDay 1: Fly to Tokyo\n\nDay 2: Tokyo sightseeing\n\nDay 3: Travel to Mount Fuji\n\nTour highlights\n\nEscorted touring\n\nLocal guide\n\nMeals included\n\nHotels throughout the tour`;

test('detectCruiseOffer returns high-confidence Cruise for exact cruise fixtures', () => {
  const { detectCruiseOffer } = createContext();
  for (const fixture of [cruise1, cruise2, cruise3]) {
    const result = detectCruiseOffer(fixture);
    assert.equal(result.isCruise, true);
    assert.equal(result.confidence, 'high');
    assert.ok(result.cruiseScore >= result.threshold);
  }
});

test('detectCruiseOffer recognises operator plus ship and cabin plus sailing wording', () => {
  const { detectCruiseOffer } = createContext();
  const result = detectCruiseOffer('Celebrity Cruises\nCelebrity Apex\nSailing from Southampton\nBalcony Cabin');
  assert.equal(result.isCruise, true);
  assert.ok(result.matchedSignals.includes('recognised cruise operator plus ship'));
  assert.ok(result.matchedSignals.includes('cabin type'));
  assert.ok(result.matchedSignals.includes('sailing from'));
});

test('detectCruiseOffer blocks package holiday, touring, ambiguous, unknown and weak cruise wording', () => {
  const { detectCruiseOffer } = createContext();
  const blocked = [
    packageHoliday,
    touring,
    'Cruise and stay holiday\n\n7 nights\n\nHotel included\n\nTransfers included',
    'Summer Escape\n\nAmazing value\n\nBook today\n\nLimited availability',
    'This page mentions cruise line and cruise ship in generic marketing copy.'
  ];
  for (const fixture of blocked) assert.equal(detectCruiseOffer(fixture).isCruise, false);
});

function createRoutingContext(rawValue = '') {
  const context = createContext();
  const fields = {
    'raw-paste': { value: rawValue },
    'offer-type-detection': { textContent: '', className: '' },
    'parse-result': { textContent: '', className: '' },
    'vision-review-text': { value: rawValue }
  };
  Object.assign(context, {
    document: { getElementById(id) { return fields[id] || null; } },
    offers: [{}],
    cur: 0,
    pendingParseResult: null,
    pasteOfferClearedByInput: false,
    resetPoaSuggestionState() {},
    clearOfferIntelligencePanel() { context.offerIntelCleared = true; },
    cancelParsedOffer() { context.cancelled = true; },
    parseOfferText() { context.parserCalled = true; throw new Error('Cruise parser should not run'); },
    resetActiveOfferFromEmptyPaste() { context.resetEmptyCalled = true; return true; },
    rv() {}, updateAllStatus() {}, genUtm() {}, checkPortsWarn() {}, updateExportFilenames() {}, runSpellQA() {}
  });
  vm.runInContext([
    extractFunction('setOfferTypeDetection'),
    extractFunction('setParseStatus'),
    extractFunction('parseOffer'),
    extractFunction('handleVisionReviewTextInput'),
    extractFunction('handlePasteOfferInput')
  ].join('\n'), context);
  context.fields = fields;
  return context;
}

test('Not Cruise routing stops before Cruise parser and preserves source text', () => {
  const context = createRoutingContext(packageHoliday);
  assert.equal(context.parseOffer(), false);
  assert.equal(context.parserCalled, undefined);
  assert.equal(context.fields['raw-paste'].value, packageHoliday);
  assert.equal(context.fields['offer-type-detection'].textContent, 'Detected: Not Cruise');
  assert.match(context.fields['parse-result'].textContent, /Non-cruise offer detected/);
  assert.match(context.fields['parse-result'].textContent, /This offer will not be loaded into the Cruise parser/);
});

test('Vision review textarea is the source of truth and manual edits are respected', () => {
  const context = createRoutingContext('Summer Escape');
  context.handleVisionReviewTextInput({ target: { value: cruise2 } });
  assert.equal(context.fields['offer-type-detection'].textContent, 'Detected: Cruise');
  context.handleVisionReviewTextInput({ target: { value: touring } });
  assert.equal(context.fields['offer-type-detection'].textContent, 'Detected: Not Cruise');
});

test('Paste Offer re-detects on input and clears detection when input is cleared', () => {
  const context = createRoutingContext(cruise1);
  context.handlePasteOfferInput({ target: context.fields['raw-paste'] });
  assert.equal(context.fields['offer-type-detection'].textContent, 'Detected: Cruise');
  context.fields['raw-paste'].value = '';
  context.handlePasteOfferInput({ target: context.fields['raw-paste'] });
  assert.equal(context.fields['offer-type-detection'].textContent, '');
  assert.equal(context.resetEmptyCalled, true);
});
