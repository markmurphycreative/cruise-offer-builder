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
  const classes = new Set();
  const panel = {
    innerHTML: '',
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    }
  };
  const context = {
    document: { getElementById(id) { return id === 'offer-intel-panel' ? panel : null; } },
    console: { warn() {} },
    AIRPORT_WORDS: ['newcastle', 'manchester'],
    ITINERARY_FOOTER_LABEL: /^(?:luggage\s*(?:&|and)\s*transfers?\s+included|flights?\s+included|inclusions?|what(?:'|’)?s included|price|from £|terms(?:\s*&\s*conditions)?|book now|call to book|cabin|accommodation)\b/i,
    OPERATOR_ALIASES: { po: [/\bp\s*&\s*o\b/i], cunard: [/\bcunard\b/i], ncl: [/\bnorwegian\s+cruise\s+line\b/i, /\bncl\b/i], msc: [/\bmsc\b/i], virgin: [/\bvirgin\b/i] },
    OPERATOR_SHIPS: { po: ['Arvia', 'Iona'], cunard: ['Queen Anne'], fred: ['Bolette'], virgin: ['Scarlet Lady'], msc: ['MSC Virtuosa'], ncl: ['Norwegian Prima', 'Pride of America'] },
    OPERATOR_HEADERS: { po: { name: 'P&O Cruises' }, cunard: { name: 'Cunard' }, fred: { name: 'Fred. Olsen Cruise Lines' }, virgin: { name: 'Virgin Voyages' }, msc: { name: 'MSC Cruises' }, ncl: { name: 'Norwegian Cruise Line' } },
    OPERATOR_INTELLIGENCE: { po: { name: 'P&O Cruises', category: 'Mainstream ocean cruise', dawsonUrl: 'https://example.test/po' }, cunard: { name: 'Cunard', category: 'Heritage ocean cruise', dawsonUrl: 'https://example.test/cunard' }, virgin: { name: 'Virgin Voyages', category: 'Adults-only lifestyle cruise' }, msc: { name: 'MSC Cruises', category: 'Mainstream ocean cruise' }, ncl: { name: 'Norwegian Cruise Line', category: 'Mainstream ocean cruise' } },
    getOperatorLandingUrl(key) { return key === 'po' ? 'https://example.test/po' : ''; }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeRegExp'),
    extractFunction('getOfferIntelligenceShipOperator'),
    extractFunction('findKnownOperatorShip'),
    extractFunction('normalisePortComparisonValue'),
    extractFunction('isExcludedParsedPort'),
    extractFunction('isStandalonePortCandidate'),
    extractFunction('getStandalonePortLines'),
    extractFunction('getOfferIntelligenceCruiseTypes'),
    extractFunction('getOfferIntelligenceCruiseKnowledge'),
    extractFunction('hasOfferIntelligenceNegativeContext'),
    extractFunction('detectOfferIntelligenceInclusions'),
    extractFunction('joinOfferIntelligenceSuggestionParts'),
    extractFunction('getOfferIntelligenceCardInclusionSuggestion'),
    extractFunction('getOfferIntelligenceUspStripSuggestion'),
    extractFunction('getOfferIntelligenceCopyThemes'),
    extractFunction('getOfferIntelligenceQualityScore'),
    extractFunction('getOfferIntelligenceActionSuggestions'),
    extractFunction('clearOfferIntelligencePanel'),
    extractFunction('formatOfferIntelligencePorts'),
    extractFunction('getOfferIntelligenceDetectedFields'),
    extractFunction('getOfferIntelligenceAirport'),
    extractFunction('getOfferIntelligenceQualityDetails'),
    extractFunction('renderOfferQualitySection'),
    extractFunction('getOfferIntelligenceSummary'),
    extractFunction('renderOfferIntelligencePanel')
  ].join('\n'), context);
  return { context, panel };
}

test('Offer Intelligence infers known ship operators without changing parsed data', () => {
  const { context, panel } = createHarness();
  const parsed = { ship: 'Arvia', name: 'Caribbean Escape', nights: '14', boardlbl: 'Full Board', price: '1669' };
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed, raw: 'Arvia\nFlights, luggage and transfers included from Newcastle\nInside Cabin' }));

  assert.equal(parsed.operatorKey, undefined);
  assert.equal(panel.classList.contains('active'), true);
  assert.match(panel.innerHTML, /Operator inferred from ship: P&amp;O Cruises|Operator inferred from ship: P&O Cruises/);
  assert.match(panel.innerHTML, /Flights Included/);
  assert.match(panel.innerHTML, /Luggage Included/);
  assert.match(panel.innerHTML, /Transfers Included/);
  assert.match(panel.innerHTML, /Departure Airport: Newcastle/);
  assert.match(panel.innerHTML, /Cabin Type: Inside Cabin/);
  assert.match(panel.innerHTML, /Offer Intelligence/);
  assert.match(panel.innerHTML, /💡<\/span><span>Card Inclusion: Flights, Luggage &amp; Transfers Included|💡<\/span><span>Card Inclusion: Flights, Luggage & Transfers Included/);
  assert.match(panel.innerHTML, /Quality Score: 80/);
  assert.match(panel.innerHTML, /Offer Quality/);
  assert.match(panel.innerHTML, /Missing:/);
  assert.match(panel.innerHTML, /Departure Date/);
  assert.match(panel.innerHTML, /You’ll Visit Ports|Ports/);
  assert.doesNotMatch(panel.innerHTML, /85 \/ 100/);
  assert.match(panel.innerHTML, /Cruise Title: Caribbean Escape/);
  assert.match(panel.innerHTML, /Ship: Arvia/);
  assert.match(panel.innerHTML, /Nights: 14/);
  assert.match(panel.innerHTML, /Board Basis: Full Board/);
  assert.match(panel.innerHTML, /Price: £1669pp/);
  assert.doesNotMatch(panel.innerHTML, /Operator USPs Available/);
  assert.doesNotMatch(panel.innerHTML, /Landing Page Available/);
});

test('Offer Intelligence actions suggest compact card inclusion and USP strip lines without mutating data', () => {
  const { context, panel } = createHarness();
  const parsed = { operatorKey: 'msc', name: 'Mediterranean Discovery', ship: 'MSC Virtuosa', day: '12', month: 'June 2027', nights: '7', boardlbl: 'Full Board', price: '999', ports: 'Barcelona • Rome • Palma' };
  const raw = 'Mediterranean Discovery\nDrinks package included\nWi-Fi included\nOnboard spend included';

  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed, raw }));

  assert.equal(parsed.incl, undefined);
  assert.match(panel.innerHTML, /Card Inclusion: Drinks, Wi-Fi &amp; Onboard Spend Included|Card Inclusion: Drinks, Wi-Fi & Onboard Spend Included/);
  assert.match(panel.innerHTML, /Suggested USP Strip: Onboard Spend • Drinks Package • Wi-Fi/);
  assert.match(panel.innerHTML, /Copy Themes: Family • Mediterranean • Entertainment/);
  assert.match(panel.innerHTML, /Quality Score: 90/);
  assert.match(panel.innerHTML, /Offer Quality/);
  assert.match(panel.innerHTML, /Missing:/);
  assert.match(panel.innerHTML, /Departure Airport/);
  assert.doesNotMatch(panel.innerHTML, /95 \/ 100/);
});

test('Offer Intelligence copy themes stay theme-only and support premium, adults-only and river signals', () => {
  const { context } = createHarness();

  const fjords = vm.runInContext('getOfferIntelligenceCopyThemes(parsed, raw, "cunard");', Object.assign(context, { parsed: { operatorKey: 'cunard', name: 'Norwegian Fjords', ship: 'Queen Anne', ports: 'Southampton • Bergen • Olden' }, raw: 'Norwegian Fjords' }));
  assert.deepEqual(JSON.parse(JSON.stringify(fjords)), ['Luxury', 'Scenic Cruising', 'Norway']);

  const virgin = vm.runInContext('getOfferIntelligenceCopyThemes(parsed, raw, "virgin");', Object.assign(context, { parsed: { operatorKey: 'virgin', ship: 'Scarlet Lady', ports: 'Barcelona • Ibiza' }, raw: 'Scarlet Lady adults only Mediterranean' }));
  assert.deepEqual(JSON.parse(JSON.stringify(virgin)), ['Adults Only', 'Mediterranean', 'Lifestyle']);

  const river = vm.runInContext('getOfferIntelligenceCopyThemes(parsed, raw, "amawaterways");', Object.assign(context, { parsed: { operatorKey: 'amawaterways', ship: 'AmaSerena', ports: 'Budapest • Vienna' }, raw: 'AmaSerena River Cruise Europe' }));
  assert.deepEqual(JSON.parse(JSON.stringify(river)), ['Culture', 'River Cruising', 'Europe']);
});


test('Offer Intelligence infers Queen Anne as Cunard premium knowledge only', () => {
  const { context, panel } = createHarness();
  const parsed = { ship: 'Queen Anne', price: '1199' };
  const inferred = vm.runInContext('getOfferIntelligenceShipOperator("Queen Anne");', context);

  assert.equal(inferred.operatorKey, 'cunard');
  assert.notEqual(inferred.operatorKey, 'ncl');
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed, raw: 'Queen Anne\nNorwegian Fjords\n£1199pp' }));

  assert.match(panel.innerHTML, /Operator inferred from ship: Cunard/);
  assert.match(panel.innerHTML, /Cruise Knowledge/);
  assert.match(panel.innerHTML, /Operator: Cunard/);
  assert.match(panel.innerHTML, /Cruise Type: Ocean Cruise/);
  assert.match(panel.innerHTML, /Audience: Premium/);
  assert.doesNotMatch(panel.innerHTML, /Norwegian Cruise Line/);
  assert.doesNotMatch(panel.innerHTML, /Family Friendly/);
});

test('Offer Intelligence detects standalone port lines and displays them compactly in panel', () => {
  const { context, panel } = createHarness();
  const raw = 'Queen Anne\nSouthampton\nStavanger\nOlden\nGeiranger\nBergen\nSouthampton';
  const portLines = vm.runInContext('getStandalonePortLines(raw.split(/\\n/));', Object.assign(context, { raw }));

  assert.deepEqual(JSON.parse(JSON.stringify(portLines)), ['Southampton', 'Stavanger', 'Olden', 'Geiranger', 'Bergen', 'Southampton']);
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ship: 'Queen Anne', ports: portLines.join(' • ') }, raw }));

  assert.match(panel.innerHTML, /You’ll Visit Ports: Southampton · Stavanger · Olden · Geiranger · Bergen · Southampton/);
  assert.doesNotMatch(panel.innerHTML, /You’ll Visit Ports: Detected/);
});

test('Known ship inference remains exact and avoids generic or ambiguous matches', () => {
  const { context } = createHarness();

  for (const [ship, operatorKey] of [['Arvia', 'po'], ['Iona', 'po'], ['MSC Virtuosa', 'msc'], ['Scarlet Lady', 'virgin']]) {
    const match = vm.runInContext('findKnownOperatorShip(ship);', Object.assign(context, { ship }));
    assert.equal(match.operatorKey, operatorKey);
    assert.equal(match.ship, ship);
  }

  assert.equal(vm.runInContext('findKnownOperatorShip("Queen")', context), null);
  assert.equal(vm.runInContext('findKnownOperatorShip("Norwegian Fjords on Queen Anne")', context).operatorKey, 'cunard');
  assert.equal(vm.runInContext('findKnownOperatorShip("Operator Ship Cruise")', context), null);

  context.OPERATOR_SHIPS.ncl.push('Queen Anne');
  assert.equal(vm.runInContext('findKnownOperatorShip("Queen Anne")', context), null);
});

test('Offer Intelligence reports missing fields and avoids false operator matches for unknown ships', () => {
  const { context, panel } = createHarness();
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ship: 'Mystery Ship', price: '999' }, raw: 'Mystery Ship\n£999pp' }));

  assert.match(panel.innerHTML, /Board Basis not detected/);
  assert.match(panel.innerHTML, /Departure Airport/);
  assert.match(panel.innerHTML, /Nights not detected/);
  assert.doesNotMatch(panel.innerHTML, /Operator inferred from ship/);
});


test('Offer Intelligence shows ports detection only when parsed ports exist', () => {
  const { context, panel } = createHarness();
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ports: 'Barbados • Martinique' }, raw: 'Barbados • Martinique' }));
  assert.match(panel.innerHTML, /You’ll Visit Ports: Barbados · Martinique/g);

  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { price: '999' }, raw: '£999pp' }));
  assert.doesNotMatch(panel.innerHTML, /You’ll Visit Ports: Detected/);
});

test('Offer Intelligence summary counts detected panel fields using simple confidence labels', () => {
  const { context } = createHarness();
  const high = vm.runInContext('getOfferIntelligenceSummary(parsed, raw);', Object.assign(context, { parsed: { operatorKey: 'po', name: 'Caribbean Escape', ship: 'Arvia', day: '20', month: 'November 2026', nights: '14', boardlbl: 'Full Board', price: '1669', ports: 'Barbados • Martinique' }, raw: 'Inside Cabin from Newcastle' }));
  assert.deepEqual(JSON.parse(JSON.stringify(high)), { count: 10, label: 'High Confidence', level: 'high' });

  const partial = vm.runInContext('getOfferIntelligenceSummary(parsed, raw);', Object.assign(context, { parsed: { ship: 'Arvia', nights: '14', price: '1669', ports: 'Barbados • Martinique' }, raw: '' }));
  assert.deepEqual(JSON.parse(JSON.stringify(partial)), { count: 4, label: 'Partial Match', level: 'partial' });

  const low = vm.runInContext('getOfferIntelligenceSummary(parsed, raw);', Object.assign(context, { parsed: { price: '999' }, raw: '' }));
  assert.deepEqual(JSON.parse(JSON.stringify(low)), { count: 1, label: 'Needs Review', level: 'low' });
});

test('Offer Intelligence shows compact cruise knowledge for known ship matches without mutating parsed data', () => {
  const { context, panel } = createHarness();
  const parsed = { ship: 'Scarlet Lady', price: '999' };
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed, raw: 'Scarlet Lady from Barcelona' }));

  assert.equal(parsed.operatorKey, undefined);
  assert.match(panel.innerHTML, /Cruise Knowledge/);
  assert.match(panel.innerHTML, /Operator: Virgin Voyages/);
  assert.match(panel.innerHTML, /Cruise Type: Ocean Cruise/);
  assert.match(panel.innerHTML, /Audience: Adults Only/);
});

test('Offer Intelligence hides cruise knowledge when no confident operator or ship exists', () => {
  const { context, panel } = createHarness();
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ship: 'Mystery Ship', price: '999' }, raw: 'Mystery Ship £999pp' }));

  assert.doesNotMatch(panel.innerHTML, /Cruise Knowledge/);
  assert.doesNotMatch(panel.innerHTML, /Cruise Type:/);
  assert.doesNotMatch(panel.innerHTML, /Audience:/);
});


test('POA v3 detects advanced inclusion variants and normalises duplicate wording', () => {
  const { context } = createHarness();
  const raw = [
    'Includes flights from Newcastle with regional flights',
    'Luggage Included and checked baggage included',
    'Airport transfers, overseas transfers and private transfers included',
    'Classic drinks package with premium drinks',
    'WiFi package and internet package',
    'Gratuities Included and Tips Included',
    'Onboard credit, on-board spend and spending money',
    'Shore excursions included, selected excursions included and guided excursions',
    'Pre-cruise hotel and hotel night included',
    'Rail travel included, train included and Eurostar included',
    'Speciality dining included and dining package included',
    'Free cabin upgrade with balcony upgrade',
    'Balcony cabin included'
  ].join('\n');
  const inclusions = vm.runInContext('detectOfferIntelligenceInclusions(parsed, raw);', Object.assign(context, { parsed: {}, raw }));

  assert.deepEqual(JSON.parse(JSON.stringify(inclusions)), [
    'Flights Included',
    'Luggage Included',
    'Transfers Included',
    'Drinks Package Included',
    'Wi-Fi Included',
    'Gratuities Included',
    'Onboard Spend Included',
    'Shore Excursions Included',
    'Hotel Stay Included',
    'Rail Included',
    'Speciality Dining Included',
    'Cabin Upgrade Included',
    'Balcony Cabin Included'
  ]);
});

test('POA v3 detects requested real-world inclusion wording variants', () => {
  const { context } = createHarness();
  const cases = [
    ['Flights Included', ['Flights Included', 'Includes flights', 'Return flights', 'Regional flights', 'Flights from Newcastle', 'Newcastle flights']],
    ['Luggage Included', ['Baggage Included', 'Checked baggage', 'Hold luggage', 'Includes luggage']],
    ['Transfers Included', ['Transfers Included', 'Airport transfers', 'Overseas transfers', 'Return transfers', 'Coach transfers', 'Private transfers']],
    ['Drinks Package Included', ['Drinks Package Included', 'Drinks included', 'All-inclusive drinks', 'Premium drinks', 'Classic drinks package']],
    ['Wi-Fi Included', ['Wi-Fi Included', 'WiFi Included', 'Wi-Fi package', 'Internet package', 'WiFi package']],
    ['Gratuities Included', ['Gratuities Included', 'Tips Included', 'Service charges included']],
    ['Onboard Spend Included', ['Onboard spend', 'On board spend', 'On-board spend', 'Onboard credit', 'On board credit', 'Shipboard credit', 'Spending money']],
    ['Shore Excursions Included', ['Shore excursions included', 'Excursions included', 'Guided excursions', 'Selected excursions included']],
    ['Hotel Stay Included', ['Hotel stay included', 'Pre-cruise hotel', 'Post-cruise hotel', 'Hotel night included', 'Includes hotel stay']],
    ['Rail Included', ['Rail included', 'Train included', 'Eurostar included', 'Rail travel included']],
    ['Speciality Dining Included', ['Speciality dining included', 'Dining package included']],
    ['Cabin Upgrade Included', ['Cabin upgrade included', 'Free cabin upgrade', 'Balcony upgrade', 'Ocean view upgrade']]
  ];

  for (const [label, phrases] of cases) {
    for (const phrase of phrases) {
      const inclusions = vm.runInContext('detectOfferIntelligenceInclusions({}, raw);', Object.assign(context, { raw: phrase }));
      assert.ok(inclusions.includes(label), `${phrase} should detect ${label}`);
    }
  }
});

test('POA v3 negative inclusion phrases do not create false positives', () => {
  const { context } = createHarness();
  const raw = [
    'Transfers available at extra cost',
    'Drinks package optional',
    'Gratuities not included',
    'Flights excluding regional departures',
    'Hotel stay available at supplement',
    'Rail travel payable locally',
    'Cabin upgrade available',
    'Shore excursions excluded',
    'WiFi package extra cost'
  ].join('\n');
  const inclusions = vm.runInContext('detectOfferIntelligenceInclusions({}, raw);', Object.assign(context, { raw }));

  assert.deepEqual(JSON.parse(JSON.stringify(inclusions)), []);
});

test('POA v3 inclusion detection does not alter summary confidence field counts', () => {
  const { context } = createHarness();
  const raw = 'Includes flights, luggage, airport transfers, premium drinks, WiFi package, gratuities and onboard credit';
  const summary = vm.runInContext('getOfferIntelligenceSummary(parsed, raw);', Object.assign(context, { parsed: { price: '999' }, raw }));

  assert.deepEqual(JSON.parse(JSON.stringify(summary)), { count: 1, label: 'Needs Review', level: 'low' });
});

test('POA Suggestions render only card and USP suggestions with confidence and current versus suggested values', () => {
  const fields = {
    'f-incl': { value: 'Flights Included' },
    'f-tags': { value: '' },
    'field-incl': { classList: { toggle() {} } },
    'field-tags': { classList: { toggle() {} } }
  };
  const context = {
    document: { getElementById(id) { return fields[id] || null; }, querySelectorAll() { return []; } },
    offers: [{ incl: 'Flights Included', tags: '' }],
    cur: 0,
    poaAppliedSuggestions: {},
    getOfferIntelligenceSummary() { return { level: 'high', label: 'High Confidence', count: 7 }; },
    window: {},
    up() {}
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('joinOfferIntelligenceSuggestionParts'),
    extractFunction('getPoaCardInclusionSuggestion'),
    extractFunction('getPoaUspStripSuggestion'),
    extractFunction('clearPoaSuggestionHighlights'),
    extractFunction('setPoaSuggestionHighlight'),
    extractFunction('getPoaSuggestionConfidenceLabel'),
    extractFunction('getPoaAssistedApplySuggestions'),
    extractFunction('escapePoaSuggestionHtml'),
    extractFunction('formatPoaSuggestionValue'),
    extractFunction('getPoaSuggestionCurrentValue'),
    extractFunction('renderPoaAssistedApplySuggestions'),
    extractFunction('applyPoaSuggestion'),
    extractFunction('removePoaSuggestion')
  ].join('\n'), context);

  const suggestions = vm.runInContext('getPoaAssistedApplySuggestions({}, "", ["Flights Included", "Luggage Included", "Transfers Included", "Wi-Fi Included", "Drinks Package Included", "Onboard Spend Included"], "po")', context);
  assert.deepEqual(JSON.parse(JSON.stringify(suggestions.map(s => s.id))), ['card-inclusion', 'usp-strip']);

  const htmlOutput = vm.runInContext('renderPoaAssistedApplySuggestions(suggestions)', Object.assign(context, { suggestions }));
  assert.match(htmlOutput, /Card Inclusion/);
  assert.match(htmlOutput, /USP Strip/);
  assert.match(htmlOutput, /High Confidence/);
  assert.match(htmlOutput, /Current:<\/span>Flights Included/);
  assert.match(htmlOutput, /Suggested:<\/span>Flights, Luggage &amp; Transfers Included/);
  assert.doesNotMatch(htmlOutput, /Theme Tags|💡/);
});

test('POA Suggestions remove restores each suggestion previous value independently', () => {
  const fields = {
    'f-incl': { value: 'Flights Included' },
    'f-tags': { value: 'Original USP' }
  };
  const context = {
    document: { getElementById(id) { return fields[id] || null; }, querySelectorAll() { return []; } },
    offers: [{ incl: 'Flights Included', tags: 'Original USP' }],
    cur: 0,
    poaAppliedSuggestions: {},
    window: {},
    up() {},
    renderOfferIntelligencePanel() {}
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('clearPoaSuggestionHighlights'),
    extractFunction('applyPoaSuggestion'),
    extractFunction('removePoaSuggestion')
  ].join('\n'), context);
  context.window.currentPoaSuggestions = [
    { id: 'card-inclusion', value: 'Flights, Luggage & Transfers Included', fieldKey: 'incl', fieldId: 'f-incl' },
    { id: 'usp-strip', value: 'Wi-Fi Included • Drinks Package Included', fieldKey: 'tags', fieldId: 'f-tags' }
  ];

  vm.runInContext('applyPoaSuggestion("card-inclusion"); applyPoaSuggestion("usp-strip");', context);
  assert.equal(fields['f-incl'].value, 'Flights, Luggage & Transfers Included');
  assert.equal(fields['f-tags'].value, 'Wi-Fi Included • Drinks Package Included');

  vm.runInContext('removePoaSuggestion("card-inclusion");', context);
  assert.equal(fields['f-incl'].value, 'Flights Included');
  assert.equal(fields['f-tags'].value, 'Wi-Fi Included • Drinks Package Included');

  vm.runInContext('removePoaSuggestion("usp-strip");', context);
  assert.equal(fields['f-tags'].value, 'Original USP');
});
