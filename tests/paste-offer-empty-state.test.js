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
Panama Canal - Colon, Panama - At Sea -
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


function extractConst(name) {
  const start = html.indexOf(`const ${name}=`);
  assert.notEqual(start, -1, `Could not find ${name}`);
  const end = html.indexOf(';', start);
  return html.slice(start, end + 1);
}

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
  const visionReview = { value: '' };
  const visionReviewPanel = { classList: createClassList() };
  const visionReviewNote = { textContent: '' };
  const previewBody = { innerHTML: '' };
  const confidenceBadge = { className: '', textContent: '' };
  const tabs = Array.from({ length: 4 }, (_, index) => ({ classList: createClassList(), index }));
  tabs[cur]?.classList.add('active');
  const calls = { load: 0, rv: 0, status: 0, utm: 0, ports: 0, filenames: 0, spell: 0, autosave: 0 };
  const context = {
    offers,
    cur,
    offerImportMethod: "paste",
    PARSE_FIELD_MAP: {
      operatorKey: 'f-operator', name: 'f-name', ship: 'f-ship', incl: 'f-incl', price: 'f-price', basis: 'f-basis',
      board: 'f-board', boardlbl: 'f-boardlbl', day: 'f-day', month: 'f-month', nights: 'f-nights', ports: 'f-ports'
    },
    document: {
      getElementById(id) {
        if(id === 'parse-preview-modal') return hasParsePreviewModal ? modal : null;
        if(id === 'parse-result') return status;
        if(id === 'raw-paste') return rawPaste;
        if(id === 'vision-review-text') return visionReview;
        if(id === 'vision-review-panel') return visionReviewPanel;
        if(id === 'vision-review-note') return visionReviewNote;
        if(id === 'parse-preview-body') return previewBody;
        if(id === 'parse-confidence-badge') return confidenceBadge;
        return fields[id] || null;
      },
      querySelectorAll(selector) { return selector === '.otab' ? tabs : []; }
    },
    isOfferLoaded: offer => !!(offer && (offer.name || offer.ship || offer.price || offer._img)),
    BOARD_MAP: { FB: ['FB', 'Full Board'], 'FULL BOARD': ['FB', 'Full Board'], AI: ['AI', 'All Inclusive'], 'ALL INCLUSIVE': ['AI', 'All Inclusive'], HB: ['HB', 'Half Board'], 'HALF BOARD': ['HB', 'Half Board'] },
    OPERATOR_HEADERS: { cunard: { name: 'Cunard' }, ncl: { name: 'Norwegian Cruise Line' }, po: { name: 'P&O Cruises' }, royal: { name: 'Royal Caribbean' }, marella: { name: 'Marella Cruises' }, celebrity: { name: 'Celebrity Cruises' }, fred: { name: 'Fred. Olsen Cruise Lines' } },
    OPERATOR_SHIPS: { celebrity: ['Celebrity Apex', 'Celebrity Ascent'], amawaterways: ['AmaBella', 'AmaDouro', 'AmaMagna', 'Zambezi Queen'], cunard: ['Queen Anne'], ncl: ['Norwegian Prima', 'Pride of America'], po: ['Arvia'], royal: ['Oasis of the Seas', 'Legend of the Seas'], marella: ['Marella Discovery'], fred: ['Bolette'] },
    OPERATOR_ALIASES: { celebrity: [/\bcelebrity\b/i, /\bcelebrity\s+cruises\b/i], cunard: [/\bcunard\b/i], ncl: [/\bnorwegian\s+cruise\s+line\b/i, /\bncl\b/i], po: [/\bp\s*&\s*o\b/i, /\bp&o\s+cruises\b/i], royal: [/\broyal\s+caribbean\b/i, /\broyal\s+caribbean\s+international\b/i], marella: [/\bmarella\b/i], fred: [/\bfred\.?\s*olsen\b/i] },
    AIRPORT_WORDS: ['newcastle', 'manchester', 'edinburgh', 'leeds bradford', 'glasgow', 'birmingham', 'london', 'heathrow', 'gatwick', 'stansted', 'belfast'],
    getLikelyTypos() { return []; },
    setSpellWarn() {},
    operatorChanged() {},
    load() { calls.load += 1; Object.values(fields).forEach(field => { field.value = ''; }); },
    rv() { calls.rv += 1; },
    updateAllStatus() { calls.status += 1; },
    genUtm() { calls.utm += 1; },
    checkPortsWarn() { calls.ports += 1; },
    updateExportFilenames() { calls.filenames += 1; },
    handlePasteOfferInput(event) { calls.rawInput = event && event.target && event.target.value; },
    runSpellQA() { calls.spell += 1; },
    queueAutosave() { calls.autosave += 1; },
    setTimeout(callback) { callback(); }
  };
  vm.createContext(context);
  vm.runInContext([
    'let pendingParseResult=null;',
    extractConst('ITINERARY_SECTION_LABEL'),
    extractConst('ITINERARY_FOOTER_LABEL'),
    extractConst('USP_TAG_LABEL'),
    extractConst('USP_TAG_KEYWORDS'),
    extractConst('ITINERARY_HARD_STOP_PATTERN'),
    extractFunction('normaliseUspTagText'),
    extractFunction('inferUspTagsFromLines'),
    extractFunction('isItineraryHardStopLine'),
    extractFunction('getItineraryLines'),
    extractConst('CABIN_TYPE_EXCLUSIONS'),
    extractConst('NON_PORT_EXTRACTION_EXCLUSION_PATTERNS'),
    extractFunction('normaliseExtractionExclusionValue'),
    extractFunction('isCabinTypeExclusion'),
    extractFunction('isNonPortExtractionValue'),
    extractFunction('extractOfferPrice'),
    extractFunction('formatParsedPriceDisplay'),
    extractFunction('isInclusionCopyLine'),
    extractFunction('cleanDestinationOnlyLines'),
    extractFunction('truncateLinesAtItineraryHardStop'),
    extractFunction('normalisePortComparisonValue'),
    extractFunction('isExcludedParsedPort'),
    extractFunction('isStandalonePortCandidate'),
    extractConst('PARSED_PORT_COUNTRY_SUFFIXES'),
    extractConst('PARSED_PORT_STATUS_ANNOTATIONS'),
    extractFunction('normaliseParsedPortBracketText'),
    extractFunction('removeParsedPortCountrySuffix'),
    extractFunction('simplifyDestinationCountrySuffix'),
    extractFunction('normaliseDestinationName'),
    extractFunction('normaliseParsedDestinationDisplay'),
    html.slice(html.indexOf('const CARD_INCLUSION_SEPARATOR='), html.indexOf('function normaliseCardInclusionComponent')),
    extractFunction('normaliseSubtitleSeparator'),
    extractFunction('normaliseCardInclusionComponent'),
    extractFunction('classifyCardInclusionComponent'),
    extractFunction('isCardPreCruiseComponent'),
    extractFunction('makeCardInclusionComponent'),
    extractFunction('splitCardInclusionLineComponents'),
    extractFunction('normaliseFlightInclusionDisplay'),
    extractFunction('stripCardInclusionRenderMarkup'),
    extractFunction('escapeCardInclusionHtml'),
    extractFunction('buildCardInclusionComponents'),
    extractFunction('orderCardInclusionComponents'),
    extractFunction('validateCardInclusionLines'),
    extractFunction('estimateCardInclusionTextWidth'),
    extractFunction('getCardInclusionMeasureText'),
    extractFunction('packCardInclusionComponents'),
    extractFunction('groupCardInclusionRenderLines'),
    extractFunction('renderCardInclusionLayout'),
    extractFunction('renderCardInclusion'),
    extractFunction('buildCardInclusionRenderLines'),
    extractFunction('buildCardInclusionFromComponents'),
    extractFunction('buildCabinCardInclusionSegments'),
    extractFunction('cleanParsedPorts'),
    extractFunction('escapeRegExp'),
    extractFunction('findKnownOperatorShip'),
    extractFunction('normaliseCruiseTitleCandidate'),
    extractFunction('isKnownOperatorLine'),
    extractFunction('isKnownShipLine'),
    extractFunction('hasFollowingCruiseStructure'),
    extractFunction('isDirectCruiseTitleCandidate'),
    extractFunction('detectDirectCruiseTitle'),
    extractFunction('getStandalonePortLines'),
    extractFunction('parseFamilyPassengerBasis'),
    'const PASTE_OPERATOR_BOARD_DEFAULTS={po:["FB","Full Board"],celebrity:["FB","Full Board"],fred:["FB","Full Board"],amawaterways:["FB","Full Board"],ambassador:["FB","Full Board"],ncl:["FB","Full Board"],cunard:["FB","Full Board"],marella:["AI","All Inclusive"],princess:["AI","All Inclusive"],msc:["AI","All Inclusive"],virgin:["AI","All Inclusive"],riviera:["AI","All Inclusive"]};',
    extractConst('CRUISE_PASSENGER_BASIS_DEFAULT_OPERATORS'),
    extractConst('DEFAULT_CRUISE_PASSENGER_BASIS'),
    extractFunction('shouldDefaultCruisePassengerBasis'),
    extractFunction('detectPassengerBasis'),
    extractFunction('detectBoardBasis'),
    extractFunction('getOperatorBoardDefault'),
    extractFunction('formatAirportName'),
    extractFunction('normaliseShortAirportIncludedLines'),
    extractFunction('normaliseAirportInclusionPhrase'),
    extractFunction('detectAirportInclusion'),
    extractFunction('detectFlightAirport'),
    extractFunction('joinOfferIntelligenceSuggestionParts'),
    extractConst('EMBARKATION_PORTS'),
    extractConst('PORT_COUNTRIES'),
    extractConst('PORT_REGIONS'),
    extractFunction('normalisePortIntelligenceName'),
    extractFunction('removeDuplicateReturnEmbarkationPortsString'),
    extractFunction('getPortIntelligence'),
    extractFunction('isRecognisedPortTitleLine'),
    extractFunction('stripOfferHeadingPrefix'),
    extractFunction('removeSubjectToConditions'),
    extractFunction('applyInclusionEditorialRule'),
    extractConst('INCLUSION_EDITORIAL_RULES'),
    extractFunction('normaliseInclusionEditorialText'),
    extractFunction('extractCruiseNights'),
    extractFunction('getPreCruiseImpliedPlaces'),
    extractFunction('formatPreCruiseHotelInclusion'),
    extractFunction('extractSourceInclusionLine'),
    extractFunction('detectCabinType'),
    extractFunction('detectTransferStatus'),
    extractFunction('detectPreCruiseStay'),
    extractFunction('getEnglishOrdinalSuffix'),
    extractFunction('setVisionReviewText'),
    extractFunction('normaliseVisionExtractedText'),
    extractFunction('repairMalformedOrdinalDates'),
    extractFunction('isConfidentCruiseOffer'),
    extractFunction('hasLuggageIncludedWording'),
    extractFunction('hasLuggageExclusionWording'),
    extractFunction('shouldApplyCruiseDefaultLuggage'),
    extractFunction('applyCruiseDefaultLuggage'),
    extractFunction('parseExactStructuredOfferText'),
    extractFunction('parseOfferText'),
    extractFunction('getOfferIntelligenceAirport'),
    extractFunction('parseOffer'),
    extractFunction('loadOfferFromActiveMethod'),
    extractFunction('setParseStatus'),
    extractFunction('showParsePreview'),
    extractFunction('cancelParsedOffer'),
    extractFunction('prepareOfferSlotForParsedOffer'),
    extractFunction('applyParsedOffer')
  ].join('\n'), context);
  vm.runInContext([
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
  return {
    context, fields, modal, status, tabs, calls, rawPaste, visionReview, visionReviewPanel, visionReviewNote, previewBody,
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




test('PMU Vision Import normalises OCR ordinal artefacts before review text', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const text = harness.context.normaliseVisionExtractedText('Norwegian Fjords\n20™ June 2028\n20ᵀᴹ June 2028');
  assert.equal(text, 'Norwegian Fjords\n20th June 2028\n20th June 2028');
});



test('PMU Vision review textarea assignment defensively cleans OCR ordinal artefacts', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });

  harness.context.setVisionReviewText('Norwegian Fjords\n20™ June 2028', false);

  assert.equal(harness.visionReview.value, 'Norwegian Fjords\n20th June 2028');
  assert.doesNotMatch(harness.visionReview.value, /20™ June 2028/);
});


test('PMU Vision load re-cleans reviewed text before copying to Paste Offer textarea', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });

  harness.visionReview.value = 'Coastal Gems\n20™ June 2028';
  harness.context.offerImportMethod = 'vision';
  vm.runInContext('loadOfferFromActiveMethod();', harness.context);

  assert.equal(harness.visionReview.value, 'Coastal Gems\n20th June 2028');
  assert.equal(harness.rawPaste.value, 'Coastal Gems\n20th June 2028');
  assert.equal(harness.calls.rawInput, 'Coastal Gems\n20th June 2028');
});



test('PMU Vision Ambassador ordinal date survives review, load, parsing and card date tile', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const raw = `Coastal Gems of Sweden & Denmark
20™ June 2028
7 night cruise
Ambition
Sailing from Port Of Tyne
Inside Cabin
Full Board
£765 per person based on 2 sharing`;
  const cleaned = harness.context.normaliseVisionExtractedText(raw);
  assert.match(raw, /20™ June 2028/);
  assert.match(cleaned, /20th June 2028/);
  assert.doesNotMatch(cleaned, /20™ June 2028|20ᵀᴹ June 2028/);

  harness.context.setVisionReviewText(cleaned, false);
  assert.match(harness.visionReview.value, /20th June 2028/);

  harness.visionReview.value = cleaned.replace('Inside Cabin', 'Outside Cabin');
  harness.context.offerImportMethod = 'vision';
  vm.runInContext('loadOfferFromActiveMethod();', harness.context);
  assert.equal(harness.rawPaste.value, harness.visionReview.value);
  assert.equal(harness.calls.rawInput, harness.visionReview.value);
  assert.match(harness.rawPaste.value, /Outside Cabin/);
  assert.doesNotMatch(harness.rawPaste.value, /20™ June 2028/);

  const parsed = harness.context.offers[0];
  assert.equal(parsed.day, '20');
  assert.equal(parsed.month, 'June 2028');
  assert.notEqual(harness.status.textContent, 'DATE MISSING');
  assert.doesNotMatch(harness.status.textContent, /DATE MISSING/i);

  const cardContext = {
    document: { getElementById(id) { return id === 'g-terms' ? { value: 'T&Cs Apply' } : { value: '' }; } },
    OPERATOR_HERO_PLACEHOLDERS: {},
    getOperatorSkinStyle() { return ''; },
    getHeaderHTML() { return ''; },
    renderHeroHTML() { return ''; },
    renderItineraryImageHTML() { return ''; },
    getSailingFromDisplay() { return ''; },
    chunkBullets(value) { return String(value || ''); },
    renderCardInclusion(value) { return String(value || ''); },
    normaliseKnownDisplayText(value) { return String(value || '').trim(); }
  };
  vm.createContext(cardContext);
  vm.runInContext(extractFunction('renderCardHTML'), cardContext);
  for (const mode of ['All 4', 'Single', 'Email', 'All 4']) {
    cardContext.mode = mode;
    cardContext.offer = parsed;
    const html = vm.runInContext('renderCardHTML(offer)', cardContext);
    assert.match(html, /<div class="ival">20<\/div><div class="ilbl">June 2028<\/div>/);
  }

  const repeat = harness.context.normaliseVisionExtractedText(raw);
  assert.match(repeat, /20th June 2028/);
  assert.doesNotMatch(repeat, /20™ June 2028/);
});

test('PMU parser ordinal repair remains a safety net for malformed source text', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const examples = ['20™ June 2028', '20ᵀᴹ June 2028', '20TH June 2028', '20 th June 2028', '20% June 2028', '20* June 2028', '20? June 2028', '20# June 2028'];
  for (const raw of examples) {
    assert.equal(harness.context.repairMalformedOrdinalDates(raw).text, '20th June 2028');
  }
});

test('Paste Offer formats cabin card inclusions with flights, transfers, and cabin in the expected order', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const examples = [
    [`Flying from Newcastle
Inside Cabin
Transfers Included`, 'Transfers Included - Newcastle Flights - Inside Cabin'],
    [`Flying from Newcastle
Inside Cabin
Transfers Included
1 Night Pre-Cruise Stay in Miami`, 'Includes luggage - Transfers Included - Newcastle Flights - Inside Cabin - 1 Night Pre-Cruise Stay in Miami'],
    [`Flying from Newcastle
Inside Cabin
Transfers Included
2 Nights Pre-Cruise Stay in Vancouver`, 'Includes luggage - Transfers Included - Newcastle Flights - Inside Cabin - 2 Nights Pre-Cruise Stay in Vancouver'],
    [`Flying from Newcastle
Inside Cabin
No Transfers`, 'Newcastle Flights - Inside Cabin'],
    [`Flying from Newcastle
Inside Cabin
No Transfers
1 Night Pre-Cruise Stay in Miami`, 'Includes luggage - Newcastle Flights - Inside Cabin - 1 Night Pre-Cruise Stay in Miami'],
    [`Inside Cabin
Transfers Included`, 'Transfers Included - Inside Cabin'],
    [`Inside Cabin`, 'Inside Cabin']
  ];

  for (const [raw, expected] of examples) {
    const result = harness.context.parseOfferText(raw, { renderIntelligence: false });
    assert.equal(result.parsed.incl, expected);
  }
});

test('PMU: Paste Offer parser detects cruise night formats and prioritises cruise over hotel stays', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const examples = [
    ['5-night cruise', '5'],
    ['5 night cruise', '5'],
    ['5 nights', '5'],
    ['5-night', '5'],
    ['5 night', '5'],
    ['10-night cruise', '10'],
    ['17-night cruise', '17']
  ];

  for (const [duration, expected] of examples) {
    const result = harness.context.parseOfferText(`Mediterranean Highlights
Celebrity Apex
${duration}
Full Board
£999`, { renderIntelligence: false });
    assert.equal(result.parsed.nights, expected, duration);
  }

  const withHotelStay = harness.context.parseOfferText(`Includes 3-night pre-cruise stay
Mediterranean Highlights
Celebrity Apex
10-night cruise
Full Board
£999`, { renderIntelligence: false });
  assert.equal(withHotelStay.parsed.nights, '10');
});

test('PMU: Paste Offer parser removes subject to conditions from parsed output', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const result = harness.context.parseOfferText(`Celebrity Cruises | Celebrity Apex
FREE return taxi transfer from home to port (subject to conditions)
7-night cruise
Full Board
£999
Southampton • Lisbon`, { renderIntelligence: false });

  assert.equal(result.parsed.incl, 'Includes luggage - FREE return taxi transfer from home to port');
  assert.doesNotMatch(JSON.stringify(result.parsed), /subject to conditions/i);
});

test('permanent PMU: Paste Offer keeps inclusion labels and cabin types out of parsed ports', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const raw = `Celebrity Cruises
Mediterranean Fly Cruise
Celebrity Ascent
Flights included from Newcastle
Premium Drinks Package
Tips Included
Transfers Included
Flights Included
WiFi Included
Inside Cabin
Ocean View Cabin
Balcony Cabin
7 nights
Full Board
£1299pp
You'll Visit
Barcelona
Marseille
Valencia`;

  const result = harness.context.parseOfferText(raw, { renderIntelligence: false });

  assert.equal(result.parsed.incl, 'Includes luggage - Transfers Included - Newcastle Flights - Inside Cabin');
  assert.equal(result.parsed.ports, 'Barcelona • Marseille • Valencia');
  assert.doesNotMatch(result.parsed.ports, /Newcastle|Premium Drinks Package|Tips Included|Transfers Included|Flights Included|WiFi Included|Inside Cabin|Ocean View Cabin|Balcony Cabin/);
});

test('permanent PMU: Newcastle Flights displays when airport exists and generic Flights Included is the no-airport fallback', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const withAirport = harness.context.parseOfferText(`Flying from Newcastle
Inside Cabin
No Transfers`, { renderIntelligence: false });
  const withoutAirport = harness.context.parseOfferText(`Flights Included
Inside Cabin`, { renderIntelligence: false });

  assert.equal(withAirport.parsed.incl, 'Newcastle Flights - Inside Cabin');
  assert.equal(withoutAirport.parsed.incl, 'Flights Included');
  assert.doesNotMatch(withAirport.parsed.incl, /^Flights Included\b/);
});

test('permanent PMU: Paste Offer raw text persists through the Load Offer parse path', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const raw = `Celebrity Cruises
Celebrity Ascent
Flying from Newcastle
Inside Cabin
7 nights
Full Board
£1299pp
Itinerary
Barcelona
Marseille`;

  harness.parse(raw);

  assert.equal(harness.rawPaste.value, raw);
  assert.equal(harness.context.offers[0].ship, 'Celebrity Ascent');
});

test('permanent PMU: exports, POA helpers, and Paste Offer entry points remain wired', () => {
  assert.match(html, /function updateExportFilenames\(\)\{\}/);
  assert.match(html, /function getOfferIntelligenceAirport\(parsed,rawText\)/);
  assert.match(html, /function getPoaAssistedApplySuggestions\(parsed,rawText,inclusions,effectiveOperator\)/);
  assert.match(html, /<button class="parse-btn" onclick="loadOfferFromActiveMethod\(\)">/);
  assert.match(html, /<textarea id="raw-paste"/);
});

test('Paste Offer preserves Celebrity card inclusions and Norwegian port suffixes', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const offers = [
    { raw: `Flying from Newcastle
Inside Cabin
Transfers Included`, incl: 'Transfers Included - Newcastle Flights - Inside Cabin' },
    { raw: `Flying from Newcastle
Inside Cabin
Transfers Included
1 Night Pre-Cruise Stay in Miami`, incl: 'Includes luggage - Transfers Included - Newcastle Flights - Inside Cabin - 1 Night Pre-Cruise Stay in Miami' },
    { raw: `Norwegian Fjords
Inside Cabin
You'll Visit:
Southampton
Haugesund, Norway
Molde, Norway
Trondheim, Norway
Olden, Norway
Bergen, Norway
Southampton`, incl: 'Includes luggage - Inside Cabin', ports: 'Southampton • Haugesund, Norway • Molde, Norway • Trondheim, Norway • Olden, Norway • Bergen, Norway' },
    { raw: `Flying from Newcastle
Inside Cabin
Transfers Included
2 Nights Pre-Cruise Stay in Vancouver`, incl: 'Includes luggage - Transfers Included - Newcastle Flights - Inside Cabin - 2 Nights Pre-Cruise Stay in Vancouver' }
  ];

  offers.forEach(offer => {
    const result = harness.context.parseOfferText(offer.raw, { renderIntelligence: false });
    assert.equal(result.parsed.incl, offer.incl);
    assert.doesNotMatch(result.parsed.incl, /(?:^|\n)\s*-|-[ \t]*(?:\n|$)|Transfers IncludedInside Cabin/);
    if (offer.ports) assert.equal(result.parsed.ports, offer.ports);
  });
});


test('Paste Offer strips offer heading prefixes from parsed titles', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const examples = [
    ['Offer 1 - Italian Riviera & France', 'Italian Riviera & France'],
    ['Offer 2 - Grand Cayman, Mexico & Perfect Day', 'Grand Cayman, Mexico & Perfect Day'],
    ['Offer 3: Norwegian Fjords', 'Norwegian Fjords'],
    ['Offer 4 – Alaska Explorer', 'Alaska Explorer']
  ];

  for (const [heading, expected] of examples) {
    const result = harness.context.parseOfferText(`${heading}\nCelebrity Ascent\n7 nights\n£1999`, { renderIntelligence: false });
    assert.equal(result.parsed.name, expected);
  }
});


test('Paste Offer detects Royal Caribbean title after known operator and ship lines', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const result = harness.context.parseOfferText(`Royal Caribbean International
Oasis of the Seas
Western Mediterranean Explorer
7 Nights
25 September 2027
From £1299pp`, { renderIntelligence: false });

  assert.equal(result.parsed.operatorKey, 'royal');
  assert.equal(result.parsed.ship, 'Oasis of the Seas');
  assert.equal(result.parsed.name, 'Western Mediterranean Explorer');
});

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

test('Trello hardening detects occupancy variants and default sharing basis', () => {
  const cases = [
    ['£1249 per person based on 2 sharing', 'Based on 2 Adults Sharing'],
    ['£1689 for a family of two adults & 1 child', 'Based on 2 Adults & 1 Child Sharing'],
    ['£1189pp based on 2 adults sharing', 'Based on 2 Adults Sharing'],
    ['solo traveller', 'Based on Solo Occupancy']
  ];
  for (const [raw, expected] of cases) {
    const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
    harness.parse(`P&O Cruises\nArvia\n7 nights\n${raw}`);
    assert.equal(harness.context.offers[0].basis, expected);
  }
});

test('Paste Offer defaults missing cruise passenger basis without overwriting detected basis', () => {
  const missing = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  missing.parse(`Celebrity Cruises
Panama Canal & Southern Caribbean
7th March 2027
14 nights Cruise
Celebrity Ascent
Flights included from Newcastle
Inside Cabin
Full Board
£1259pp`);
  assert.equal(missing.context.offers[0].basis, 'Based on 2 Adults Sharing');
  assert.equal(missing.context.offers[0].price, '1259');

  const detectedStandard = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  detectedStandard.parse(`Celebrity Cruises
Celebrity Ascent
7 nights
£1259pp
Based on 2 Adults Sharing`);
  assert.equal(detectedStandard.context.offers[0].basis, 'Based on 2 Adults Sharing');

  const detectedDifferent = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  detectedDifferent.parse(`Celebrity Cruises
Celebrity Ascent
7 nights
£1259pp
solo traveller`);
  assert.equal(detectedDifferent.context.offers[0].basis, 'Based on Solo Occupancy');
});

test('Trello hardening detects board variants without applying operator defaults', () => {
  const variants = [
    ['Full Board', 'FB', 'Full Board'],
    ['Full Board dining', 'FB', 'Full Board'],
    ['All Inclusive - drinks and tips included', 'AI', 'All Inclusive'],
    ['Half Board', 'HB', 'Half Board']
  ];
  for (const [raw, code, label] of variants) {
    const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
    harness.parse(`P&O Cruises\nArvia\n7 nights\n£999pp\n${raw}`);
    assert.equal(harness.context.offers[0].board, code);
    assert.equal(harness.context.offers[0].boardlbl, label);
  }

  const po = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  po.parse('P&O Cruises\nArvia\n7 nights\n£999pp');
  assert.equal(po.context.offers[0].boardlbl, undefined);

  const marella = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  marella.context.OPERATOR_HEADERS.marella = { name: 'Marella Cruises' };
  marella.context.OPERATOR_ALIASES.marella = [/\bmarella\b/i, /\bmarella\s+cruises\b/i];
  marella.parse('Marella Cruises\nMarella Explorer\n7 nights\n£999pp');
  assert.equal(marella.context.offers[0].boardlbl, undefined);

  const pasted = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  pasted.parse('P&O Cruises\nArvia\n7 nights\n£999pp\nAll Inclusive');
  assert.equal(pasted.context.offers[0].boardlbl, 'All Inclusive');
});

test('Paste Offer preserves shortened UK departure airport inclusion source lines', () => {
  const airports = ['Newcastle', 'Manchester', 'Glasgow', 'Edinburgh', 'Belfast'];
  for (const airport of airports) {
    const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
    const result = harness.context.parseOfferText(`Fred. Olsen Cruise Lines
Bolette
Sailing on Bolette from ${airport}
${airport} Included
7 nights
From £999pp`, { renderIntelligence: false });
    assert.equal(result.parsed.incl, `Includes luggage - ${airport} Included`);
    assert.equal(harness.context.getOfferIntelligenceAirport(result.parsed, result.rawText), "");
  }
});


test('Paste Offer prefers detected airport inclusions over sailing port subtitle fallback examples', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const examples = [
    [`Royal Caribbean | Independence of the Seas
Spain, Portugal & France
11 Nights • 14th September 2027

Manchester Included
Balcony Cabin
From £1,649pp

You'll visit:
Southampton • Vigo, Spain • Lisbon, Portugal • Cadiz, Spain • Paris, Le Havre, France • Southampton

Full Board
Balcony Cabin • Family • Premium Ship`, 'Includes luggage - Manchester Included', 'Southampton • Vigo, Spain • Lisbon, Portugal • Cadiz, Spain • Paris, Le Havre, France'],
    [`MSC Cruises | MSC World Europa
Western Mediterranean
10 Nights • 3rd June 2027

Glasgow Included
Inside Cabin
From £1,199pp

You'll visit:
Barcelona • Marseille, France • Genoa, Italy • Naples, Italy • Messina, Sicily • Valletta, Malta • Barcelona

Full Board
Family • Value • Entertainment`, 'Includes luggage - Glasgow Included', 'Barcelona • Marseille, France • Genoa, Italy • Naples, Italy • Messina, Sicily • Valletta, Malta'],
    [`Princess Cruises | Regal Princess
Italian Riviera & Spain
12 Nights • 4th September 2027

Leeds Bradford Flights Included
Mini Suite
From £1,999pp

You'll visit:
Southampton • Rome, for Civitavecchia • Naples • Palma, Majorca • Barcelona • Gibraltar • Southampton

Full Board
Mini Suite • Med Fly-Cruise • Premium Ship`, 'Includes luggage - Leeds Bradford Flights Included', 'Southampton • Rome, for Civitavecchia • Naples • Palma, Majorca • Barcelona • Gibraltar']
  ];

  for (const [raw, expectedIncl, expectedPorts] of examples) {
    const result = harness.context.parseOfferText(raw, { renderIntelligence: false });
    assert.equal(result.parsed.incl, expectedIncl);
    assert.equal(result.parsed.ports, expectedPorts);
    assert.ok(result.score <= 100);
  }
});

test('Paste Offer preserves airport names on airport-specific inclusion lines', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const examples = [
    ['Leeds Bradford Flights, Luggage & Transfers Included', 'Leeds Bradford Flights, Luggage & Transfers Included'],
    ['Manchester Luggage Included', 'Manchester Luggage Included'],
    ['Includes luggage - Glasgow Transfers Included', 'Includes luggage - Glasgow Transfers Included'],
    ['Belfast Included', 'Includes luggage - Belfast Included']
  ];

  for (const [raw, expected] of examples) {
    const result = harness.context.parseOfferText(`P&O Cruises
Arvia
7 nights
${raw}
From £999pp`, { renderIntelligence: false });
    assert.equal(result.parsed.incl, expected);
  }
});


test('Paste Offer does not normalise generic Included lines as departure airport inclusions', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  const examples = ['Flights Included', 'Luggage Included', 'Hotel Included', 'Transfers Included'];
  for (const example of examples) {
    assert.equal(harness.context.normaliseShortAirportIncludedLines(example), example);
  }
});

test('Trello hardening detects UK airports only from flight wording', () => {
  const phrases = [
    ['Flights included from Newcastle', 'Newcastle'],
    ['Direct flight from Newcastle', 'Newcastle'],
    ['Flying from Newcastle', 'Newcastle'],
    ['Flights from Manchester', 'Manchester'],
    ['Flights included from Edinburgh', 'Edinburgh'],
    ['Fly from Newcastle', 'Newcastle']
  ];
  for (const [phrase, airport] of phrases) {
    const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
    assert.equal(vm.runInContext('detectFlightAirport(raw)', Object.assign(harness.context, { raw: phrase })), airport);
  }
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });
  assert.equal(vm.runInContext('detectFlightAirport(raw)', Object.assign(harness.context, { raw: 'Sailing from Southampton to Barcelona' })), '');
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
  assert.match(extractFunction('handlePasteOfferInput'), /if\(!hasText\)\{\n\s+pasteOfferClearedByInput=resetActiveOfferFromEmptyPaste\(\);/);
  assert.match(extractFunction('handlePasteOfferInput'), /if\(pasteOfferClearedByInput && isUndoRestore\)\{/);
});



test('restoring Paste Offer text after an empty clear re-runs parsing and preview state', () => {
  const harness = createHarness([{ name: 'Old Offer', price: '999' }], 0, { hasParsePreviewModal: true });
  vm.runInContext([
    'let pasteOfferClearedByInput=false;',
    'function resetActiveOfferFromEmptyPaste(){ offers[cur]={}; return true; }',
    extractFunction('handlePasteOfferInput')
  ].join('\n'), harness.context);

  harness.rawPaste.value = '';
  vm.runInContext('handlePasteOfferInput({ inputType: "deleteContentBackward" });', harness.context);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.context.offers[0])), {});

  harness.rawPaste.value = CELEBRITY_CRUISES_OFFER;
  vm.runInContext('handlePasteOfferInput({ inputType: "historyUndo" });', harness.context);

  assert.equal(harness.modal.classList.contains('active'), true);
  const restoredParse = vm.runInContext('pendingParseResult', harness.context);
  assert.ok(restoredParse, 'expected restored text to recreate pending parse state');
  assert.equal(restoredParse.parsed.name, 'Panama Canal & Southern Caribbean');
  assert.equal(restoredParse.parsed.ship, 'Celebrity Ascent');
  assert.equal(harness.previewBody.innerHTML.includes('Panama Canal & Southern Caribbean'), true);

  vm.runInContext('applyParsedOffer();', harness.context);
  assert.equal(harness.context.offers[0].name, 'Panama Canal & Southern Caribbean');
  assert.equal(harness.context.offers[0].ship, 'Celebrity Ascent');
  assert.equal(harness.context.offers[0].price, '2849');
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
    'f-basis': { value: 'Based on 2 Adults Sharing' },
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
    extractFunction('refreshOfferWorkspaceAfterEmptyPaste'),
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

  assert.equal(context.parseFamilyPassengerBasis('for a family of two adults & 1 child'), 'Based on 2 Adults & 1 Child Sharing');
  assert.equal(context.parseFamilyPassengerBasis('for a family of 2 adults & 2 children'), 'Based on 2 Adults & 2 Children Sharing');
  assert.equal(context.parseFamilyPassengerBasis('for a family of two adults & 3 children'), 'Based on 2 Adults & 3 Children Sharing');
  assert.equal(context.parseFamilyPassengerBasis('for a family of 2 adults & 4 children'), 'Based on 2 Adults & 4 Children Sharing');
  assert.equal(context.parseFamilyPassengerBasis('£1249 per person based on 2 sharing'), '');
});

test('Paste Offer sets family passenger basis for one child while keeping the parsed price unchanged', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse('P&O Cruises\nFamily Caribbean offer\nArvia\n7 nights\nFull Board\n£1689 for a family of two adults & 1 child');

  assert.equal(harness.context.offers[0].price, '1689');
  assert.equal(harness.context.offers[0].basis, 'Based on 2 Adults & 1 Child Sharing');
});

test('Paste Offer sets family passenger basis for multiple children with numeric adults', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse('Marella Cruises\nFamily Mediterranean offer\nMarella Explorer\n7 nights\nFull Board\n£2499 for a family of 2 adults & 2 children');

  assert.equal(harness.context.offers[0].price, '2499');
  assert.equal(harness.context.offers[0].basis, 'Based on 2 Adults & 2 Children Sharing');
});

test('Paste Offer normalises standard per-person passenger basis', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse(CELEBRITY_CRUISES_OFFER);

  assert.equal(harness.context.offers[0].basis, 'Based on 2 Adults Sharing');
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
    'Buenos Aires', 'Montevideo', 'Port Stanley, Falkland Islands', 'Cape Horn, Chile', 'Ushuaia',
    'Strait of Magellan', 'Punta Arenas', 'Puerto Madryn', 'Punta Del Este'
  ].join(' • '));
  assert.doesNotMatch(harness.context.offers[0].ports, /At Sea|Overnight|Luggage|Transfers/i);
});

test('Paste Offer keeps comma-qualified Panama Canal & Southern Caribbean ports atomic', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse(CELEBRITY_CRUISES_OFFER);

  assert.equal(harness.context.offers[0].ports, [
    'Fort Lauderdale, Florida', 'Cartagena, Colombia', 'Panama Canal', 'Colon, Panama',
    'Oranjestad, Aruba', 'Willemstad, Curacao', 'Kralendijk, Bonaire', 'Fort Lauderdale, Florida'
  ].join(' • '));
});

test('Paste Offer itinerary cleanup excludes sea days and overnight labels while retaining genuine destinations', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  harness.parse(`${CELEBRITY_CRUISES_OFFER}
Overnight Port Stay - overnight stay - Overnight - AT SEA`);

  const ports = harness.context.offers[0].ports.split(' • ');
  assert.equal(ports.includes('Fort Lauderdale, Florida'), true);
  assert.equal(ports.includes('Cartagena, Colombia'), true);
  assert.equal(ports.includes('Panama Canal'), true);
  assert.equal(ports.includes('Colon, Panama'), true);
  assert.equal(ports.includes('Oranjestad, Aruba'), true);
  assert.equal(ports.includes('Willemstad, Curacao'), true);
  assert.equal(ports.includes('Kralendijk, Bonaire'), true);
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
  assert.equal(harness.context.offers[0].ports, 'Southampton • Stavanger • Olden • Geiranger • Bergen');
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
  assert.equal(harness.context.offers[0].ports, 'Southampton • Stavanger • Olden • Geiranger • Bergen');
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


test('Paste Offer promotes high-confidence Ports Intelligence over recognised port title candidates', () => {
  const harness = createHarness([{}, {}, {}, {}], 0, { hasParsePreviewModal: false });

  harness.parse(`Southampton
Le Havre
Bilbao
La Coruna
Vigo
Cherbourg
Southampton`);

  assert.equal(harness.context.offers[0].name, 'Spain & France');
  assert.equal(harness.context.offers[0].ports, 'Southampton • Le Havre • Bilbao • La Coruna • Vigo • Cherbourg');
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
  assert.match(html, /<button class="parse-btn" onclick="loadOfferFromActiveMethod\(\)">/);
  assert.match(extractFunction('parseOffer'), /if\(!showParsePreview\(\)\) applyParsedOffer\(\);/);
});


test('offer tab switches preserve Paste Offer textarea per card while clearing parse status', () => {
  const sv = extractLastFunction('sv');
  const reset = extractFunction('resetPasteOfferState');

  assert.match(sv, /const next = Number\(i\) \|\| 0;\n  const switched = next !== cur;/);
  assert.match(sv, /if\(switched\) resetPasteOfferState\(\{preserveRaw:true\}\);/);
  assert.match(reset, /if\(raw&&!preserveRaw\) raw\.value=""/);
  assert.match(reset, /status\.textContent=""/);
  assert.match(reset, /cancelParsedOffer\(\)/);
  assert.match(html, /const PERSISTED_PASTE_OFFER_KEY="_rawPastedOfferText";/);
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
    commitVisibleFields() { context.offers[context.getCur ? context.getCur() : 0]._rawPastedOfferText = rawPaste.value; context.offers[context.getCur ? context.getCur() : 0].name = fields['f-name'].value; },
    syncOfferSelector() {},
    renderPreviewMode() {}, queueAutosave() {}, genUtm() {}, genStandardUtms() {}, updateAllStatus() {}, updateExportFilenames() {}, updateMoveOfferButtons() {}, updateLockUI() {},
    rv() {},
    setTimeout(callback) { callback(); },
    loadOfferToEditor(index) { fields['f-name'].value = context.offers[index].name || ''; rawPaste.value = context.offers[index]._rawPastedOfferText || ''; },
    load(index) { fields['f-name'].value = context.offers[index].name || ''; rawPaste.value = context.offers[index]._rawPastedOfferText || ''; } 
  };
  context.offers = [{ name: 'Loaded Offer 1' }, { name: 'Loaded Offer 2' }, {}, {}];
  vm.createContext(context);
  vm.runInContext([
    'const FLDS=["name"]; const PERSISTED_PASTE_OFFER_KEY="_rawPastedOfferText"; let offers=globalThis.offers; let cur=0; let pendingParseResult={parsed:{name:"Loaded Offer 1"}};',
    extractFunction('save'),
    extractFunction('cancelParsedOffer'),
    extractFunction('saveRawPasteForOffer'),
    extractFunction('restoreRawPasteForOffer'),
    extractFunction('resetPasteOfferState'),
    extractLastFunction('sv'),
    'globalThis.getCur=()=>cur;'
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
  assert.equal(rawPaste.value, 'Offer 1 pasted text');
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
      context.offers[index]._rawPastedOfferText = rawPaste.value;
    },
    syncOfferSelector() {},
    loadOfferToEditor(index) {
      calls.push(`load:${index}`);
      fields['f-name'].value = context.offers[index].name || '';
      rawPaste.value = context.offers[index]._rawPastedOfferText || '';
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
    'let cur=0; const PERSISTED_PASTE_OFFER_KEY="_rawPastedOfferText"; let pendingParseResult={parsed:{name:"Loaded Offer 1"}};',
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
  assert.equal(rawPaste.value, 'Offer 1 pasted text');

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
  assert.equal(context.offers[0]._rawPastedOfferText, 'Offer 1 pasted text');
  assert.equal(context.offers[1]._rawPastedOfferText, 'Offer 2 pasted text');
});



test('switching four pasted offers restores each raw Paste Offer textarea byte-for-byte', () => {
  const rawPaste = { value: '' };
  const fields = { 'f-name': { value: '' } };
  const context = {
    console,
    offers: [
      { name: 'One', _rawPastedOfferText: 'Offer 1 raw\nNewcastle' },
      { name: 'Two', _rawPastedOfferText: 'Offer 2 raw\r\nAmsterdam' },
      { name: 'Three', _rawPastedOfferText: 'Offer 3 raw  £999' },
      { name: 'Four', _rawPastedOfferText: 'Offer 4 raw\nInside Cabin' }
    ],
    document: { getElementById(id) { if(id === 'raw-paste') return rawPaste; return fields[id] || null; } },
    commitVisibleFields() { context.offers[context.getCur()]._rawPastedOfferText = rawPaste.value; },
    syncOfferSelector() {}, loadOfferToEditor(index) { rawPaste.value = context.offers[index]._rawPastedOfferText || ''; fields['f-name'].value = context.offers[index].name || ''; },
    updateLockUI() {}, genUtm() {}, genStandardUtms() {}, updateAllStatus() {}, updateExportFilenames() {}, updateMoveOfferButtons() {}, renderPreviewMode() {}, queueAutosave() {}
  };
  vm.createContext(context);
  vm.runInContext([
    'let cur=0; const PERSISTED_PASTE_OFFER_KEY="_rawPastedOfferText"; let pendingParseResult=null;',
    extractFunction('cancelParsedOffer'), extractFunction('resetPasteOfferState'), extractLastFunction('sv'), 'globalThis.getCur=()=>cur;'
  ].join('\n'), context);

  for (const index of [0, 1, 2, 3, 0, 2, 1, 3]) {
    vm.runInContext(`sv(${index});`, context);
    assert.equal(rawPaste.value, context.offers[index]._rawPastedOfferText);
  }
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

test('Paste Offer textarea Enter submits through the existing Load Offer path', () => {
  assert.match(html, /<textarea id="raw-paste"[^>]* onkeydown="handlePasteOfferKeydown\(event\)"/);
  const context = {
    calls: 0,
    parseOffer() { context.calls += 1; }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('handlePasteOfferKeydown'), context);
  let prevented = false;
  context.handlePasteOfferKeydown({
    key: 'Enter',
    target: { id: 'raw-paste' },
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.equal(context.calls, 1);
});

test('Paste Offer textarea Shift Enter keeps the native newline behaviour', () => {
  const context = {
    calls: 0,
    parseOffer() { context.calls += 1; }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('handlePasteOfferKeydown'), context);
  let prevented = false;
  context.handlePasteOfferKeydown({
    key: 'Enter',
    shiftKey: true,
    target: { id: 'raw-paste' },
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, false);
  assert.equal(context.calls, 0);
});

test('Paste Offer Enter handler ignores other textareas', () => {
  const context = {
    calls: 0,
    parseOffer() { context.calls += 1; }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('handlePasteOfferKeydown'), context);
  let prevented = false;
  context.handlePasteOfferKeydown({
    key: 'Enter',
    target: { id: 'f-ports' },
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, false);
  assert.equal(context.calls, 0);
});

test('Ports Intelligence QA fix pack acceptance offer stays destination-only with formatted price', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });

  harness.parse(`Celebrity Cruises
Celebrity Apex
7 Nights
Departing 14 September 2027
Inside Stateroom
Flights from Newcastle Included
Drinks, Wi-Fi & Gratuities Included
Southampton
Vigo
Lisbon
Porto (Leixoes)
La Coruna
Southampton
From £1,899pp
Based on 2 Adults Sharing`);

  assert.equal(harness.context.offers[0].operator, 'celebrity');
  assert.equal(harness.context.offers[0].ship, 'Celebrity Apex');
  assert.equal(harness.context.offers[0].name, 'Portugal & Spain');
  assert.equal(harness.context.offers[0].boardlbl, undefined);
  assert.equal(harness.context.offers[0].price, '1899');
  assert.equal(harness.context.offers[0].ports, 'Southampton • Vigo • Lisbon • Porto (Leixoes) • La Coruna');
  assert.doesNotMatch(harness.context.offers[0].ports, /Inside|Stateroom|Adults|Included|£/);
});

test('Paste Offer price parser preserves leading digits for comma-separated prices', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  const examples = [
    ['From £899pp', '899'],
    ['From £1,899pp', '1899'],
    ['From £2,499pp', '2499'],
    ['From £10,999pp', '10999'],
    ['From £12,499pp', '12499']
  ];

  for (const [input, expected] of examples) {
    harness.context.offers = [];
    harness.context.cur = 0;
    harness.parse(`Celebrity Cruises\nCelebrity Apex\n7 Nights\n${input}\nSouthampton\nVigo\nSouthampton`);
    assert.equal(harness.context.offers[0].price, expected);
  }
});


test('Paste Offer stops labelled itinerary parsing before board basis and USP lines', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const result = harness.context.parseOfferText(`Celebrity Cruises | Celebrity Apex
Norwegian Fjords
7th June 2027
7 nights
From £1299pp
You'll visit:
Southampton • Stavanger • Olden • Geiranger • Bergen • Southampton

Full Board

Balcony Cabin • Premium Ship • Fjords`, { renderIntelligence: false });

  assert.equal(result.parsed.ports, 'Southampton • Stavanger • Olden • Geiranger • Bergen');
  assert.equal(result.parsed.tags, 'Balcony Cabin · Premium Ship · Fjords');
  assert.doesNotMatch(result.parsed.ports, /Premium Ship|Fjords|Balcony Cabin|Full Board/);
});

test('Paste Offer preserves comma country qualifiers without creating standalone country ports', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const result = harness.context.parseOfferText(`Celebrity Cruises | Celebrity Apex
Norwegian Fjords
7 Nights • 18th July 2027

Newcastle Flights Included
Balcony Cabin
From £1,899pp

You'll visit:
Southampton • Stavanger, Norway • Olden, Norway • Geiranger, Norway • Bergen, Norway • Southampton

Full Board
Balcony Cabin • Premium Ship • Fjords`, { renderIntelligence: false });

  assert.equal(result.parsed.ports, 'Southampton • Stavanger, Norway • Olden, Norway • Geiranger, Norway • Bergen, Norway');
  assert.doesNotMatch(result.parsed.ports, /Premium Ship|Fjords/);
});

test('Paste Offer preserves comma aliases inside port labels while removing trailing country suffixes', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const result = harness.context.parseOfferText(`Royal Caribbean | Liberty of the Seas
Spain & France
8 Nights • 25th September 2026

You'll visit:
Southampton • Paris, Le Havre, France • Bilbao, Spain • La Coruna, Spain • Vigo, Spain • Cherbourg, France • Southampton`, { renderIntelligence: false });

  assert.equal(result.parsed.ports, 'Southampton • Paris, Le Havre, France • Bilbao, Spain • La Coruna, Spain • Vigo, Spain • Cherbourg, France');
});

test('Paste Offer preserves route location brackets while removing status annotations', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const result = harness.context.parseOfferText(`Mediterranean Highlights
You'll visit:
Florence/Pisa(La Spezia), Italy (Overnight)
Florence/Pisa (La Spezia), Italy
Rome (Civitavecchia), Italy
Paris (Le Havre), France
Berlin (Warnemünde), Germany
Kyoto/Osaka (Kobe), Japan
Barcelona, Spain
At Sea`, { renderIntelligence: false });

  assert.equal(result.parsed.ports, [
    'Florence/Pisa, for La Spezia',
    'Florence/Pisa, for La Spezia',
    'Rome, for Civitavecchia',
    'Paris, for Le Havre',
    'Berlin, for Warnemünde',
    'Kyoto/Osaka, for Kobe',
    'Barcelona, Spain'
  ].join(' • '));
  assert.doesNotMatch(result.parsed.ports, /At Sea|Overnight/);
});

test('Paste Offer preserves Marella real-world luggage, cabin, airport flights, and Tenerife itinerary ending', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const result = harness.context.parseOfferText(`Marella Cruises
Canarian Flavours
5th May 2027
7 night cruise
Explorer
Direct flights from/to Newcastle
Sailing from Malaga
Inside Cabin
All Inclusive
£819 per person based on 2 sharing
Itinerary
Malaga, Spain - Gibraltar - Casablanca, Morocco - Las Palmas, Gran Canaria - Santa Cruz de Tenerife, Tenerife
Luggage & Transfers included`, { renderIntelligence: false });

  assert.equal(result.parsed.incl, 'Luggage & Transfers Included - Newcastle Flights - Inside Cabin');
  assert.equal(result.parsed.ports, [
    'Malaga, Spain',
    'Gibraltar',
    'Casablanca, Morocco',
    'Las Palmas, Gran Canaria',
    'Santa Cruz de Tenerife, Tenerife'
  ].join(' • '));
});

test('Paste Offer normalises Celebrity Porto Leixoes bracket country without regressing known port alias rules', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const result = harness.context.parseOfferText(`Celebrity Cruises
Canaries & Portugal Cruise
7th October 2026
11 night cruise
Celebrity Apex
Sailing from Southampton
Inside Cabin
Full Board
£999 per person based on 2 sharing
Itinerary
Southampton - Porto (Leixoes) Portugal - Lisbon, Portugal - Madeira (Funchal), Portugal - Florence/Pisa(La Spezia), Italy - Rome (Civitavecchia), Italy - Nice (Villefranche), France - Southampton`, { renderIntelligence: false });

  assert.match(result.parsed.ports, /Porto, Leixoes, Portugal/);
  assert.match(result.parsed.ports, /Madeira, for Funchal/);
  assert.match(result.parsed.ports, /Florence\/Pisa, for La Spezia/);
  assert.match(result.parsed.ports, /Rome, for Civitavecchia/);
  assert.match(result.parsed.ports, /Nice, for Villefranche/);
});

test('Paste Offer keeps airport-specific non-flight inclusions and standard port suffixes', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const luggageResult = harness.context.parseOfferText(`Virgin Voyages | Valiant Lady
Mediterranean Icons
10 Nights • 14th September 2027

Manchester Luggage Included
Sea Terrace
From £1,899pp

You'll visit:
Barcelona • Marseille, France • Rome, for Civitavecchia • Ibiza • Palma, Majorca • Barcelona

All Inclusive
Adults Only • Premium Ship • Overnight Port Stays`, { renderIntelligence: false });

  assert.equal(luggageResult.parsed.incl, 'Manchester Luggage Included');

  const transfersResult = harness.context.parseOfferText(`MSC Cruises | MSC World Europa
Eastern Mediterranean Discovery
7 Nights • 22nd August 2027

Glasgow Transfers Included
Inside Cabin
From £999pp

You'll visit:
Athens • Kusadasi, Turkey • Istanbul, Turkey • Mykonos • Athens

Full Board
Family • Entertainment • Value`, { renderIntelligence: false });

  assert.equal(transfersResult.parsed.incl, 'Includes luggage - Glasgow Transfers Included');
  assert.equal(transfersResult.parsed.ports, 'Athens • Kusadasi, Turkey • Istanbul, Turkey • Mykonos');
});

test('PMU parser normalises known destinations, at symbols, basis casing and Celebrity include lines', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const result = harness.context.parseOfferText(`Celebrity Cruises
Australia, Wine & Tasmania Cruise
27th October 2026
10-night cruise
Celebrity Solstice
Flying from Newcastle
Sailing from Sydney
Full Board
£3119 per person based on 2 sharing
Itinerary
Sydney - Hobart, Tasmania - Kangaroo Island (Penneshaw) -
Adelaide - Melbourne - Eden - Sydney
Includes luggage and one way transfer to hotel.
Includes selected drinks with lunch & dinner.
Includes return transfers.
Includes 3-night pre-cruise stay @ Harbour Rocks Hotel Sydney - MGallery Collection`, { renderIntelligence: false });

  assert.equal(result.parsed.operatorKey, 'celebrity');
  assert.equal(result.parsed.name, 'Australia, Wine & Tasmania');
  assert.equal(result.parsed.nights, '10');
  assert.equal(result.parsed.basis, 'Based on 2 Adults Sharing');
  assert.match(result.parsed.incl, /Includes luggage and one-way hotel transfer/);
  assert.match(result.parsed.incl, /Includes selected drinks with lunch & dinner/);
  assert.match(result.parsed.incl, /Includes return transfers/);
  assert.doesNotMatch(result.parsed.incl, /return airport transfers/);
  assert.match(result.parsed.incl, /3-night pre-cruise stay at Harbour Rocks Hotel, Sydney/);
  assert.doesNotMatch(result.parsed.incl, /MGallery Collection/);
  assert.ok(result.parsed.incl.split('\n').every(line => !line.endsWith('.')));
  assert.match(result.parsed.ports, /Sydney/);
  assert.match(result.parsed.ports, /Hobart, Tasmania/);
  assert.match(result.parsed.ports, /Adelaide/);
  assert.match(result.parsed.ports, /Melbourne/);
  assert.match(result.parsed.ports, /Eden/);
  assert.doesNotMatch(result.parsed.ports, /MGallery Collection|Harbour Rocks Hotel|Hotel Sydney|pre-cruise|transfer|luggage/i);
  assert.doesNotMatch(JSON.stringify(result.parsed), /@|subject to conditions/i);

  const portsResult = harness.context.parseOfferText(`Marella Cruises
Mediterranean
7 nights
£999 per person based on 2 sharing
Itinerary
Laspezia - Palma De Mallorca - Port Of Tyne`, { renderIntelligence: false });
  assert.match(portsResult.parsed.ports, /La Spezia/);
  assert.match(portsResult.parsed.ports, /Palma de Mallorca/);
  assert.match(portsResult.parsed.ports, /Port of Tyne/);
});

test('PMU parser hard-stops Celebrity itinerary before hotel inclusion copy', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const result = harness.context.parseOfferText(`Celebrity Cruises
Australia, Wine & Tasmania Cruise
27th October 2026
10-night cruise
Celebrity Solstice
Flying from Newcastle
Sailing from Sydney
Full Board
£3119 per person based on 2 sharing
Itinerary
Sydney - Hobart, Tasmania - Kangaroo Island (Penneshaw) -
Adelaide - Melbourne - Eden - Sydney
Includes luggage and one way transfer to hotel.
Includes 3-night pre-cruise stay @ Harbour Rocks Hotel Sydney - MGallery Collection`, { renderIntelligence: false });

  const ports = result.parsed.ports.split(' • ');
  assert.deepEqual(ports, [
    'Sydney',
    'Hobart, Tasmania',
    'Kangaroo Island, Penneshaw',
    'Adelaide',
    'Melbourne',
    'Eden',
    'Sydney'
  ]);
  assert.doesNotMatch(result.parsed.ports, /MGallery Collection|Harbour Rocks Hotel|Hotel Sydney|luggage|transfer|hotel|pre-cruise|collection/i);
  assert.match(result.parsed.incl, /Includes luggage and one-way hotel transfer/);
  assert.match(result.parsed.incl, /3-night pre-cruise stay at Harbour Rocks Hotel, Sydney/);
  assert.ok(result.parsed.incl.split('\n').every(line => !line.endsWith('.')));
});


test('PMU inclusion editor stores multi-line card inclusions in a textarea', () => {
  assert.match(html, /<textarea id="f-incl"[^>]*oninput="up\(\)"[^>]*><\/textarea>/);
  assert.doesNotMatch(html, /<input id="f-incl"/);
});

test('PMU parser preserves Fred Olsen selected drinks and free taxi inclusions outside itinerary', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const result = harness.context.parseOfferText(`Fred. Olsen Cruise Lines
Scenic Spain and Portugal
15th May 2027
7-night cruise
Bolette
Sailing from Southampton
Full Board
£999 per person based on 2 sharing
Itinerary
Southampton - Lisbon - Vigo - Southampton
Includes selected drinks with lunch & dinner.
FREE return taxi transfer from home to port (subject to conditions)`, { renderIntelligence: false });

  assert.match(result.parsed.incl, /Includes selected drinks with lunch & dinner/);
  assert.match(result.parsed.incl, /FREE return taxi transfer from home to port\*/);
  assert.deepEqual(result.parsed.incl.split('\n'), [
    'Includes selected drinks with lunch & dinner',
    'FREE return taxi transfer from home to port*'
  ]);
  assert.doesNotMatch(result.parsed.incl, /\(subject to conditions\)/i);
  assert.ok(result.parsed.incl.split('\n').every(line => !line.endsWith('.')));
  assert.equal((result.parsed.incl.match(/\*/g) || []).length, 1);
  assert.doesNotMatch(result.parsed.ports, /taxi|transfer|home|port|subject to conditions/i);
});

test('Paste Offer rejects marketing labels, cabin types, USPs and board basis as ports', () => {
  const harness = createHarness([{}, {}, {}, {}]);
  const lines = ['Balcony Cabin', 'Ocean View Cabin', 'Inside Cabin', 'Premium Ship', 'Adults Only', 'Family', 'Med Fly-Cruise', 'All Inclusive', 'Luggage Included', 'Flights Included', 'Fjords', 'Smaller Ship'];

  const parsedPorts = harness.context.cleanParsedPorts(lines);

  assert.equal(parsedPorts, '');
});

test('Paste Offer clears stale hero data only on the selected slot before applying parsed fields', () => {
  assert.match(extractFunction('applyParsedOffer'), /clearHeroImageDataFromOffer\(cur\)/);
});


const EXACT_FOUR_OFFER_SOURCE = `Marella Cruises
Autumn Escape
26 November 2026
5-night cruise
Marella Discovery
Flying from Newcastle
Sailing from Malaga
All Inclusive
£799 per person based on 2 sharing
Itinerary
Malaga - Gibraltar - Casablanca, Morocco - Las Palmas, Gran Canaria - Santa Cruz de Tenerife

Celebrity Cruises
Australia, Wine & Tasmania
20 January 2027
10-night cruise
Celebrity Solstice
Flying from Newcastle
Sailing from Sydney
Full Board
£2999 per person based on 2 sharing
Itinerary
Sydney - Hobart, Tasmania - Kangaroo Island (Penneshaw) - Adelaide - Melbourne - Eden - Sydney
Includes luggage and one way transfer to hotel
Includes 3-night pre-cruise stay @ Harbour Rocks Hotel Sydney - MGallery Collection

Royal Caribbean
Western Mediterranean
14 June 2027
7-night cruise
Legend of the Seas
Flying from Newcastle
Sailing from Barcelona
Full Board
£1499 per person based on 2 sharing
Itinerary
Barcelona - Palma De Mallorca,Spain - Provence (Marseille), France - Florence / Pisa (Laspezia), Italy - Rome (Civitavecchia), Italy - Naples - Barcelona
Includes luggage and return transfers

Fred. Olsen Cruise Lines
Sunlit Shores Of Spain
18 August 2027
17-night cruise
Bolette
Sailing from Port Of Tyne
Full Board
£2499 per person based on 2 sharing
Itinerary
Saint Malo - Lisbon - Motril - Alicante - Barcelona - Gibraltar - Cadiz - La Coruna, Galicia
Includes selected drinks with lunch & dinner
FREE return taxi transfer from home to port (subject to conditions)`;

test('Paste Offer exact PMU four-offer source format preserves itinerary ports and separates inclusions', () => {
  const expected = [
    {
      operator: 'marella', name: 'Autumn Escape', nights: '5', airport: 'Newcastle',
      ports: ['Malaga', 'Gibraltar', 'Casablanca, Morocco', 'Las Palmas, Gran Canaria', 'Santa Cruz de Tenerife']
    },
    {
      operator: 'celebrity', name: 'Australia, Wine & Tasmania', nights: '10', airport: 'Newcastle',
      incl: 'Includes luggage and one-way hotel transfer\n3-night pre-cruise stay at Harbour Rocks Hotel, Sydney',
      ports: ['Sydney', 'Hobart, Tasmania', 'Kangaroo Island, Penneshaw', 'Adelaide', 'Melbourne', 'Eden', 'Sydney']
    },
    {
      operator: 'royal', name: 'Western Mediterranean', nights: '7', airport: 'Newcastle',
      incl: 'Includes luggage and return transfers',
      ports: ['Barcelona', 'Palma de Mallorca', 'Provence, for Marseille', 'Florence / Pisa, for La Spezia', 'Rome, for Civitavecchia', 'Naples', 'Barcelona']
    },
    {
      operator: 'fred', name: 'Sunlit Shores Of Spain', nights: '17',
      incl: 'Includes selected drinks with lunch & dinner\nFREE return taxi transfer from home to port*',
      ports: ['Saint Malo', 'Lisbon', 'Motril', 'Alicante', 'Barcelona', 'Gibraltar', 'Cadiz', 'La Coruna, Galicia']
    }
  ];
  const blocks = EXACT_FOUR_OFFER_SOURCE.split(/\n\s*\n(?=(?:Celebrity Cruises|Royal Caribbean|Fred\. Olsen Cruise Lines)\b)/);
  assert.equal(blocks.length, 4);
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  const parsedOffers = blocks.map(block => harness.context.parseOfferText(block, { renderIntelligence: false }).parsed);

  expected.forEach((item, index) => {
    const parsed = parsedOffers[index];
    assert.equal(parsed.operatorKey, item.operator);
    assert.equal(parsed.name, item.name);
    assert.equal(parsed.nights, item.nights);
    if (item.airport) assert.equal(parsed._poaDepartureAirport, item.airport);
    if (item.incl) assert.equal(parsed.incl, item.incl);
    assert.deepEqual(parsed.ports.split(' • '), item.ports);
    assert.doesNotMatch(parsed.ports, /Harbour Rocks|MGallery|taxi transfer|subject to conditions|Includes/i);
  });
  assert.doesNotMatch(parsedOffers[1].incl, /MGallery Collection/);
  assert.doesNotMatch(parsedOffers[3].incl, /subject to conditions/i);
});


test('PMU renderer keeps exact four-offer inclusions visible and immutable after repeated render passes', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  const blocks = EXACT_FOUR_OFFER_SOURCE.split(/\n\s*\n(?=(?:Celebrity Cruises|Royal Caribbean|Fred\. Olsen Cruise Lines)\b)/);
  const parsedOffers = blocks.map(block => harness.context.parseOfferText(block, { renderIntelligence: false }).parsed);
  const celebrity = parsedOffers.find(offer => offer.operatorKey === 'celebrity');
  const fred = parsedOffers.find(offer => offer.operatorKey === 'fred');

  assert.deepEqual(celebrity.incl.split('\n'), [
    'Includes luggage and one-way hotel transfer',
    '3-night pre-cruise stay at Harbour Rocks Hotel, Sydney'
  ]);
  assert.deepEqual(fred.incl.split('\n'), [
    'Includes selected drinks with lunch & dinner',
    'FREE return taxi transfer from home to port*'
  ]);

  const original = parsedOffers.map(offer => offer.incl);
  const visibleText = html => html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/home\nto port\*/g, 'home to port*').replace(/from\nhome to port\*/g, 'from home to port*').replace(/at\nHarbour Rocks Hotel/g, 'at Harbour Rocks Hotel').replace(/\n+/g, '\n').trim();

  for (const view of ['single', 'all', 'email']) {
    for (const offer of [celebrity, fred]) {
      const firstPass = harness.context.renderCardInclusion(offer.incl);
      const measuredLines = harness.context.groupCardInclusionRenderLines(
        harness.context.buildCardInclusionComponents(offer.incl),
        { measureText: text => harness.context.estimateCardInclusionTextWidth(text) }
      );
      assert.ok(measuredLines.length >= 2, `${offer.operatorKey} should keep multiple inclusion render lines in ${view}`);
      const secondPass = harness.context.renderCardInclusion(offer.incl);
      assert.equal(secondPass, firstPass, `${offer.operatorKey} inclusion rendering should be stable in ${view}`);
      assert.match(visibleText(secondPass), new RegExp(offer.incl.split('\n').map(line => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*')));
    }
  }

  assert.deepEqual(parsedOffers.map(offer => offer.incl), original);
  assert.doesNotMatch(celebrity.ports, /Harbour Rocks|hotel transfer/i);
  assert.doesNotMatch(fred.ports, /selected drinks|taxi transfer/i);

  const celebrityHtml = harness.context.renderCardInclusion(celebrity.incl);
  assert.match(celebrityHtml, /^<span class="incl-line"><span class="incl-component">Includes luggage and one-way hotel transfer<\/span><\/span><span class="incl-line"><span class="incl-component">3-night pre-cruise stay at <span class="no-break">Harbour Rocks Hotel, Sydney<\/span><\/span><\/span>$/);
  assert.match(html, /\.cc \.incl\{[^}]*display:flex;flex-direction:column;[^}]*align-items:center;[^}]*text-align:center;/);
  assert.match(html, /\.cc \.incl-line\{display:block;width:100%;max-width:100%;line-height:1\.22;margin-inline:auto;text-align:center;box-sizing:border-box;font-size:inherit;letter-spacing:inherit;white-space:normal;\}/);

  const fredHtml = harness.context.renderCardInclusion(fred.incl);
  assert.match(fredHtml, /FREE return taxi transfer from <span class="no-break">home to port\*<\/span>/);
  assert.equal(visibleText(fredHtml).includes('FREE return taxi transfer from home to port*'), true);
  assert.doesNotMatch(fredHtml, />port\*<\/span>/);
});

test('PMU regression: Fred Olsen taxi no-break rendering is rebuilt from plain text across view switching', () => {
  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  const blocks = EXACT_FOUR_OFFER_SOURCE.split(/\n\s*\n(?=(?:Celebrity Cruises|Royal Caribbean|Fred\. Olsen Cruise Lines)\b)/);
  const parsedOffers = blocks.map(block => harness.context.parseOfferText(block, { renderIntelligence: false }).parsed);
  const celebrity = parsedOffers.find(offer => offer.operatorKey === 'celebrity');
  const fred = parsedOffers.find(offer => offer.operatorKey === 'fred');
  const fredTaxiLine = 'FREE return taxi transfer from home to port*';
  const expectedFredHtml = '<span class="incl-line"><span class="incl-component">Includes selected drinks with lunch & dinner</span></span><span class="incl-line"><span class="incl-component">FREE return taxi transfer from <span class="no-break">home to port*</span></span></span>';
  const expectedCelebrityHtml = '<span class="incl-line"><span class="incl-component">Includes luggage and one-way hotel transfer</span></span><span class="incl-line"><span class="incl-component">3-night pre-cruise stay at <span class="no-break">Harbour Rocks Hotel, Sydney</span></span></span>';
  const originalInclusions = parsedOffers.map(offer => offer.incl);
  const originalComponents = harness.context.buildCardInclusionComponents(fred.incl);

  assert.equal(fred.incl.split('\n')[1], fredTaxiLine);
  assert.doesNotMatch(fred.incl, /<[^>]+>/);

  const assertFredRenderState = (label, rendered) => {
    assert.equal(fred.incl.split('\n')[1], fredTaxiLine, `${label}: stored Fred Olsen taxi line should remain plain text`);
    assert.doesNotMatch(fred.incl, /<[^>]+>/, `${label}: stored Fred Olsen inclusion should contain no HTML`);
    const components = harness.context.buildCardInclusionComponents(fred.incl);
    assert.deepEqual(components, originalComponents, `${label}: component data should be rebuilt without mutation`);
    components.forEach(component => assert.doesNotMatch(component.text, /<[^>]+>/, `${label}: component text should contain no HTML`));
    assert.equal((rendered.match(/<span class="no-break">home to port\*<\/span>/g) || []).length, 1, `${label}: should render one full home-to-port no-break wrapper`);
    assert.equal(rendered, expectedFredHtml, `${label}: rendered Fred Olsen HTML should be regenerated exactly`);
    assert.doesNotMatch(rendered.replace(/<span class="no-break">home to port\*<\/span>/g, ''), /port\*/, `${label}: port* should not appear outside the protected phrase`);
    assert.doesNotMatch(rendered, /<span class="incl-line">\s*<span class="incl-component">\s*port\*\s*<\/span>\s*<\/span>/i, `${label}: port* should not become its own row`);
  };

  let initialAllFourRender = null;
  const sequence = ['all', 'single', 'email', 'all', 'single', 'email'];
  for (let pass = 0; pass < 2; pass += 1) {
    for (const view of sequence) {
      const rendered = harness.context.renderCardInclusion(fred.incl);
      if (view === 'all' && initialAllFourRender === null) initialAllFourRender = rendered;
      if (view === 'all') assert.equal(rendered, initialAllFourRender, `${view} pass ${pass}: All 4 render should match the original All 4 render`);
      assertFredRenderState(`${view} pass ${pass}`, rendered);
      assert.equal(harness.context.renderCardInclusion(celebrity.incl), expectedCelebrityHtml, `${view} pass ${pass}: Celebrity rendering should remain unchanged`);
      assert.deepEqual(parsedOffers.map(offer => offer.incl), originalInclusions, `${view} pass ${pass}: no inclusion data should be mutated`);
    }
  }

  const renderedFromPreviousMarkup = harness.context.renderCardInclusion(initialAllFourRender);
  assert.equal(renderedFromPreviousMarkup, expectedFredHtml, 'rendering defensively strips any accidental previously-rendered inclusion markup before rebuilding');
});

test('PMU regression: structured Celebrity offer keeps consecutive hotel inclusion out of itinerary and card destinations', () => {
  const raw = `Celebrity Cruises

Australia, Wine & Tasmania Cruise

27th October 2026

10-night cruise

Celebrity Solstice

Flying from Newcastle

Sailing from Sydney

Full Board

£3119 per person based on 2 sharing

Itinerary

Sydney - Hobart, Tasmania - Kangaroo Island (Penneshaw) -

Adelaide - Melbourne - Eden - Sydney

Includes luggage and one way transfer to hotel.

Includes 3-night pre-cruise stay @ Harbour Rocks Hotel Sydney - MGallery Collection`;

  const harness = createHarness([], 0, { hasParsePreviewModal: false });
  const blocks = harness.context.splitMultiOfferImport(raw);
  assert.equal(blocks.length, 1);

  const result = harness.context.parseOfferText(blocks[0], { renderIntelligence: false });
  const parsed = result.parsed;
  const inclusionArray = parsed.incl.split('\n');
  const renderedInclusions = harness.context.renderCardInclusion(parsed.incl).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');

  assert.equal(parsed._poaDepartureAirport, 'Newcastle');
  assert.deepEqual(inclusionArray, [
    'Includes luggage and one-way hotel transfer',
    '3-night pre-cruise stay at Harbour Rocks Hotel, Sydney'
  ]);
  assert.equal(inclusionArray.filter(line => /^Includes\b/.test(line)).length, 1);
  assert.ok(inclusionArray.every(line => !line.endsWith('.')));
  assert.doesNotMatch(parsed.ports, /Harbour Rocks Hotel|MGallery Collection/);
  assert.deepEqual(parsed.ports.split(' • '), [
    'Sydney',
    'Hobart, Tasmania',
    'Kangaroo Island, Penneshaw',
    'Adelaide',
    'Melbourne',
    'Eden',
    'Sydney'
  ]);
  assert.equal(parsed.ports, 'Sydney • Hobart, Tasmania • Kangaroo Island, Penneshaw • Adelaide • Melbourne • Eden • Sydney');
  assert.doesNotMatch(parsed.ports, /Harbour Rocks Hotel|MGallery Collection|luggage|transfer|pre-cruise/i);
  assert.match(renderedInclusions, /3-night pre-cruise stay at Harbour Rocks Hotel, Sydney/);
  assert.doesNotMatch(renderedInclusions, /Includes 3-night pre-cruise stay/);
});
