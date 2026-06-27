import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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
    document: { getElementById(id) {
      if (id === 'offer-intel-panel') return panel;
      if (id === 'f-name') return { value: '' };
      if (id === 'f-incl') return this.inclInput || (this.inclInput = { value: '' });
      return null;
    } },
    console: { warn() {} },
    window: {},
    offers: [{}],
    cur: 0,
    up() {},
    AIRPORT_WORDS: ['newcastle', 'manchester'],
    ITINERARY_SECTION_LABEL: /^(?:itinerary|you(?:'|’)?ll visit)\b/i,
    ITINERARY_FOOTER_LABEL: /^(?:luggage\s*(?:&|and)\s*transfers?\s+included|flights?\s+included|inclusions?|what(?:'|’)?s included|price|from £|terms(?:\s*&\s*conditions)?|book now|call to book|cabin|accommodation)\b/i,
    OPERATOR_ALIASES: { royal: [/\broyal caribbean\b/i], po: [/\bp\s*&\s*o\b/i], cunard: [/\bcunard\b/i], ncl: [/\bnorwegian\s+cruise\s+line\b/i, /\bncl\b/i], msc: [/\bmsc\b/i], virgin: [/\bvirgin\b/i] },
    OPERATOR_SHIPS: { royal: ['Liberty of the Seas'], po: ['Arvia', 'Iona'], cunard: ['Queen Anne'], fred: ['Bolette'], virgin: ['Scarlet Lady'], msc: ['MSC Virtuosa'], ncl: ['Norwegian Prima', 'Pride of America'] },
    OPERATOR_HEADERS: { royal: { name: 'Royal Caribbean' }, po: { name: 'P&O Cruises' }, cunard: { name: 'Cunard' }, fred: { name: 'Fred. Olsen Cruise Lines' }, virgin: { name: 'Virgin Voyages' }, msc: { name: 'MSC Cruises' }, ncl: { name: 'Norwegian Cruise Line' } },
    OPERATOR_INTELLIGENCE: { po: { name: 'P&O Cruises', category: 'Mainstream ocean cruise', dawsonUrl: 'https://example.test/po' }, cunard: { name: 'Cunard', category: 'Heritage ocean cruise', dawsonUrl: 'https://example.test/cunard' }, virgin: { name: 'Virgin Voyages', category: 'Adults-only lifestyle cruise' }, msc: { name: 'MSC Cruises', category: 'Mainstream ocean cruise' }, ncl: { name: 'Norwegian Cruise Line', category: 'Mainstream ocean cruise' } },
    getOperatorLandingUrl(key) { return key === 'po' ? 'https://example.test/po' : ''; }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeRegExp'),
    extractFunction('getOfferIntelligenceShipOperator'),
    extractFunction('findKnownOperatorShip'),
    extractConst('CABIN_TYPE_EXCLUSIONS'),
    extractConst('NON_PORT_EXTRACTION_EXCLUSION_PATTERNS'),
    extractFunction('normaliseExtractionExclusionValue'),
    extractFunction('isCabinTypeExclusion'),
    extractFunction('isNonPortExtractionValue'),
    extractFunction('extractOfferPrice'),
    extractFunction('formatParsedPriceDisplay'),
    extractFunction('cleanDestinationOnlyLines'),
    extractFunction('normalisePortComparisonValue'),
    extractFunction('isExcludedParsedPort'),
    extractFunction('isStandalonePortCandidate'),
    extractConst('PARSED_PORT_COUNTRY_SUFFIXES'),
    extractConst('PARSED_PORT_STATUS_ANNOTATIONS'),
    extractFunction('normaliseParsedPortBracketText'),
    extractFunction('removeParsedPortCountrySuffix'),
    extractFunction('cleanParsedPorts'),
    extractFunction('getStandalonePortLines'),
    extractFunction('formatAirportName'),
    extractFunction('detectFlightAirport'),
    extractFunction('getOfferIntelligenceCruiseTypes'),
    extractFunction('getCruiseDepartureWording'),
    extractFunction('hasPortOfTyneDepartureKnowledge'),
    extractFunction('getOfferIntelligenceCruiseKnowledge'),
    extractFunction('hasOfferIntelligenceNegativeContext'),
    extractFunction('detectOfferIntelligenceInclusions'),
    extractFunction('joinOfferIntelligenceSuggestionParts'),
    extractFunction('getOfferIntelligenceCardInclusionSuggestion'),
    extractFunction('getOfferIntelligenceUspStripSuggestion'),
    extractFunction('getOfferIntelligenceCopyThemes'),
    extractFunction('getOfferIntelligenceQualityScore'),
    extractFunction('getOfferIntelligenceActionSuggestions'),
    extractConst('EMBARKATION_PORTS'),
    extractConst('PORT_COUNTRIES'),
    extractConst('PORT_REGIONS'),
    extractFunction('normalisePortIntelligenceName'),
    extractFunction('removeDuplicateReturnEmbarkationPortsString'),
    extractFunction('getPortIntelligence'),
    extractFunction('renderPortsIntelligenceSection'),
    extractFunction('clearOfferIntelligencePanel'),
    extractFunction('formatOfferIntelligencePorts'),
    extractFunction('getOfferIntelligenceDetectedFields'),
    extractFunction('getOfferIntelligenceAirport'),
    extractFunction('getOfferIntelligenceQualityDetails'),
    extractFunction('renderOfferQualitySection'),
    extractFunction('escapePoaSuggestionHtml'),
    extractFunction('getPoaCabinOptions'),
    extractFunction('getPoaCabinRecommendation'),
    extractFunction('renderPoaCabinTypeSuggestion'),
    extractFunction('applyPoaCabinType'),
    extractFunction('detectCabinType'),
    extractFunction('detectTransferStatus'),
    extractFunction('detectPreCruiseStay'),
    extractFunction('getOfferIntelligenceSummary'),
    extractFunction('normaliseCruiseTitleCandidate'),
    extractFunction('isRecognisedPortTitleLine'),
    extractFunction('isCruiseTitleRecoveryExcludedLine'),
    extractFunction('scoreCruiseTitleRecoveryCandidate'),
    extractFunction('getCruiseTitleRecoveryPortsIntelligence'),
    extractFunction('getCruiseTitleRecoveryPortsSuggestion'),
    extractFunction('getCruiseTitleRecoverySuggestion'),
    extractFunction('renderOfferIntelligencePanel')
  ].join('\n'), context);
  return { context, panel };
}



test('Cruise Knowledge standardises Newcastle embarkation wording without changing airport text', () => {
  const { context, panel } = createHarness();
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, {
    parsed: { operatorKey: 'po', ship: 'Iona', ports: 'Newcastle, England • Stavanger • Newcastle, England' },
    raw: 'Sailing from Newcastle\nFlying from Newcastle'
  }));
  assert.match(panel.innerHTML, /Cruise Knowledge/);
  assert.match(panel.innerHTML, /Departure wording standardised to:\s*Port of Tyne/);
  const embarkation = vm.runInContext('getCruiseDepartureWording("Newcastle, England")', context);
  assert.equal(embarkation, 'Port of Tyne');
  const airport = vm.runInContext('detectFlightAirport("Flying from Newcastle")', context);
  assert.equal(airport, 'Newcastle');
});

test('POA cabin suggestion renders segmented chips and applying one preserves user choice', () => {
  const { context } = createHarness();
  const htmlOut = vm.runInContext('renderPoaCabinTypeSuggestion(parsed, raw, "celebrity")', Object.assign(context, { parsed: {}, raw: 'Celebrity cruise offer' }));
  assert.match(htmlOut, /Cabin Type not detected/);
  assert.match(htmlOut, /poa-cabin-chip/);
  assert.match(htmlOut, /Balcony \(Recommended\)/);
  assert.match(htmlOut, /AquaClass/);
  vm.runInContext('window.currentPoaParsed = parsed; window.currentPoaRawText = raw; applyPoaCabinType("Ocean View")', Object.assign(context, { parsed: {}, raw: 'Celebrity cruise offer' }));
  assert.equal(context.document.inclInput.value, 'Ocean View Cabin');
  assert.equal(context.offers[0]._poaCabinType, 'Ocean View Cabin');
});

test('Ports Intelligence detects Spain and France with embarkation exclusions', () => {
  const { context, panel } = createHarness();
  const intelligence = vm.runInContext('getPortIntelligence("Southampton • Le Havre • Bilbao • La Coruna • Vigo • Cherbourg • Southampton");', context);
  assert.deepEqual(JSON.parse(JSON.stringify(intelligence.countries)), { Spain: 3, France: 2 });
  assert.equal(intelligence.region, 'Western Europe');
  assert.equal(intelligence.suggestedRoute, 'Spain & France');
  assert.equal(intelligence.confidence, 'High');
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ports: 'Southampton • Le Havre • Bilbao • La Coruna • Vigo • Cherbourg • Southampton' }, raw: '' }));
  assert.match(panel.innerHTML, /PORTS INTELLIGENCE/);
  assert.match(panel.innerHTML, /Spain/);
  assert.match(panel.innerHTML, /France/);
  assert.match(panel.innerHTML, /Suggested Route: Spain &amp; France|Suggested Route: Spain & France/);
  assert.doesNotMatch(panel.innerHTML, /Apply/);
});

test('Celebrity paste offer fields detect cabin, transfers, pre-cruise stay, and clean ports', () => {
  const { context } = createHarness();
  const raw = `7 Nights Sailing on Celebrity Beyond - Full Board
Sailing from Miami
Flying from Newcastle
Inside Cabin
Transfers Included
1 Night Pre-Cruise Stay in Miami
£1,569.00 per person
Miami, Florida
Perfect Day Cococay, Bahamas
At Sea,
George Town, Grand Cayman
Cozumel, Mexico
At Sea
Nassau, Bahamas
Miami, Florida`;
  const fields = vm.runInContext('getOfferIntelligenceDetectedFields(parsed, raw).fields', Object.assign(context, {
    parsed: { ship: 'Celebrity Beyond', nights: '7', boardlbl: 'Full Board', price: '1569' },
    raw
  }));
  assert.match(fields.join('\n'), /Cabin Type: Inside Cabin/);
  assert.match(fields.join('\n'), /Transfers: Included/);
  assert.match(fields.join('\n'), /Pre-Cruise Stay: 1 Night in Miami/);

  const ports = vm.runInContext('cleanParsedPorts(lines, { exclude: [] })', Object.assign(context, {
    lines: [
      'Miami, Florida',
      'Perfect Day Cococay, Bahamas',
      'At Sea,',
      'George Town, Grand Cayman',
      'Cozumel, Mexico',
      'At Sea',
      'Nassau, Bahamas',
      'Miami, Florida',
      'Inside Cabin',
      'Transfers Included',
      '1 Night Pre-Cruise Stay in Miami'
    ]
  }));
  assert.equal(ports, 'Miami, Florida • Perfect Day Cococay, Bahamas • George Town, Grand Cayman • Cozumel, Mexico • Nassau, Bahamas • Miami, Florida');
});

test('Celebrity bracketed ports preserve location aliases and remove cruising segments', () => {
  const { context } = createHarness();
  const ports = vm.runInContext('cleanParsedPorts(lines, { exclude: [] })', Object.assign(context, {
    lines: [
      'Rome (Civitavecchia), Italy',
      'Florence/Pisa(La Spezia), Italy (Overnight)',
      'Nice (Villefranche), France',
      'Provence (Marseille), France',
      'Inside Passage (Cruising)',
      'At Sea'
    ]
  }));
  assert.equal(ports, 'Rome, for Civitavecchia • Florence/Pisa, for La Spezia • Nice, for Villefranche • Provence, for Marseille');
  assert.doesNotMatch(ports, /Cruising|At Sea|Overnight|Inside Passage/);
});

test('Ports Intelligence covers Italy Malta Greek Islands Norwegian Fjords Adriatic duplicates unknowns and empty lists', () => {
  const { context } = createHarness();
  const cases = [
    ['Civitavecchia • Naples • Valletta', { Italy: 2, Malta: 1 }, 'Mediterranean', 'Italy & Malta'],
    ['Athens • Santorini • Mykonos • Rhodes', { Greece: 3 }, 'Greek Islands', 'Greek Islands'],
    ['Southampton • Bergen • Olden • Geiranger • Stavanger • Southampton', { Norway: 4 }, 'Norwegian Fjords', 'Norwegian Fjords'],
    ['Dubrovnik • Split • Kotor • Budva', { Croatia: 2, Montenegro: 2 }, 'Adriatic', 'Adriatic Coastlines'],
    ['Bilbao • Bilbao • Mystery Port', { Spain: 2 }, 'Western Europe', 'Spain'],
    ['Southampton • Mystery Port • Southampton', {}, '', ''],
    ['', {}, '', '']
  ];
  for (const [ports, countries, region, route] of cases) {
    const result = vm.runInContext('getPortIntelligence(ports);', Object.assign(context, { ports }));
    assert.deepEqual(JSON.parse(JSON.stringify(result.countries)), countries);
    assert.equal(result.region, region);
    assert.equal(result.suggestedRoute, route);
  }
});

test('Cruise Title recovery falls back to Ports Intelligence suggestion only when title is missing', () => {
  const { context } = createHarness();
  let suggestion = vm.runInContext('getCruiseTitleRecoverySuggestion(parsed, raw);', Object.assign(context, { parsed: { ports: 'Civitavecchia • Naples • Valletta' }, raw: '' }));
  assert.equal(suggestion.value, 'Italy & Malta');
  assert.equal(suggestion.confidenceLabel, 'High Confidence');
  suggestion = vm.runInContext('getCruiseTitleRecoverySuggestion(parsed, raw);', Object.assign(context, { parsed: { name: 'Existing Title', ports: 'Civitavecchia • Naples • Valletta' }, raw: '' }));
  assert.equal(suggestion, null);
});

test('Cruise Title recovery uses high-confidence Ports Intelligence for port-only pastes', () => {
  const { context } = createHarness();
  const examples = [
    { raw: 'Southampton\nLe Havre\nBilbao\nLa Coruna\nVigo\nCherbourg', expected: 'Spain & France' },
    { raw: 'Athens\nSantorini\nMykonos\nRhodes', expected: 'Greek Islands' },
    { raw: 'Civitavecchia\nNaples\nMessina\nValletta', expected: 'Italy & Malta' },
    { raw: 'Southampton\nBergen\nOlden\nGeiranger\nStavanger', expected: 'Norwegian Fjords' }
  ];

  for (const example of examples) {
    const suggestion = vm.runInContext('getCruiseTitleRecoverySuggestion(parsed, raw);', Object.assign(context, { parsed: {}, raw: example.raw }));
    assert.ok(suggestion, `Expected title suggestion for ${example.expected}`);
    assert.equal(suggestion.value, example.expected);
    assert.equal(suggestion.confidenceLabel, 'High Confidence');
    assert.equal(suggestion.id, 'cruise-title-recovery-ports');
  }
});

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
  assert.match(panel.innerHTML, /poa-icon-svg/);
  assert.match(panel.innerHTML, /<span>Card Inclusion: Flights, Luggage (?:&amp;|&) Transfers Included<\/span>/);
  assert.doesNotMatch(panel.innerHTML, /💡/);
  assert.match(panel.innerHTML, /Quality Score:<\/strong> 76/);
  assert.match(panel.innerHTML, /OFFER QUALITY/);
  assert.match(panel.innerHTML, /Missing:/);
  assert.match(panel.innerHTML, /Departure Date/);
  assert.match(panel.innerHTML, /You’ll Visit Ports|Ports/);
  assert.doesNotMatch(panel.innerHTML, /85 \/ 100/);
  assert.match(panel.innerHTML, /Cruise Title: Caribbean Escape/);
  assert.match(panel.innerHTML, /Ship: Arvia/);
  assert.match(panel.innerHTML, /Nights: 14/);
  assert.match(panel.innerHTML, /Board Basis: Full Board/);
  assert.match(panel.innerHTML, /Price: £1,669pp/);
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
  assert.match(panel.innerHTML, /Quality Score:<\/strong> 96/);
  assert.match(panel.innerHTML, /OFFER QUALITY/);
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
  assert.deepEqual(JSON.parse(JSON.stringify(high)), { count: 9, label: 'High Confidence', level: 'high' });

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

test('Trello hardening detects required inclusion wording variants', () => {
  const { context } = createHarness();
  const cases = [
    ['Includes checked luggage & transfers', ['Luggage Included', 'Transfers Included']],
    ['Luggage & Transfers included', ['Luggage Included', 'Transfers Included']],
    ['All luggage and transfers included', ['Luggage Included', 'Transfers Included']],
    ['Coach from Washington Services', ['Transfers Included']],
    ['Includes return coach transfer', ['Transfers Included']],
    ['£50.00 per person onboard spend', ['Onboard Spend Included']],
    ['£20pp OBC', ['Onboard Spend Included']],
    ['1 night pre-cruise hotel', ['Hotel Stay Included']],
    ['10 included experiences', ['Shore Excursions Included']],
    ['Free WIFI', ['Wi-Fi Included']],
    ['drinks and tips included', ['Drinks Package Included', 'Gratuities Included']]
  ];

  for (const [raw, expectedLabels] of cases) {
    const inclusions = vm.runInContext('detectOfferIntelligenceInclusions({}, raw);', Object.assign(context, { raw }));
    for (const label of expectedLabels) assert.ok(inclusions.includes(label), `${raw} should detect ${label}`);
  }
});

test('Trello hardening negative upsell wording does not mark drinks dining or Wi-Fi included', () => {
  const { context } = createHarness();
  const raw = 'Go all inclusive with drinks, speciality dining and WIFI from £40pp per day';
  const inclusions = vm.runInContext('detectOfferIntelligenceInclusions({}, raw);', Object.assign(context, { raw }));

  assert.equal(inclusions.includes('Drinks Package Included'), false);
  assert.equal(inclusions.includes('Speciality Dining Included'), false);
  assert.equal(inclusions.includes('Wi-Fi Included'), false);
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
    extractFunction('normaliseCruiseTitleCandidate'),
    extractFunction('isRecognisedPortTitleLine'),
    extractFunction('isCruiseTitleRecoveryExcludedLine'),
    extractFunction('scoreCruiseTitleRecoveryCandidate'),
    extractFunction('getCruiseTitleRecoveryPortsIntelligence'),
    extractFunction('getCruiseTitleRecoveryPortsSuggestion'),
    extractFunction('getCruiseTitleRecoverySuggestion'),
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


test('Cruise Title recovery suggests strong missing titles without accepting noisy lines', () => {
  const { context } = createHarness();
  const raw = `Royal Caribbean
Liberty of the Seas
Spain & France Explorer
8 Nights
25 September 2026
Flights Included
£1299pp`;
  const suggestion = vm.runInContext('getCruiseTitleRecoverySuggestion(parsed, raw);', Object.assign(context, { parsed: { operatorKey: 'royal', ship: 'Liberty of the Seas', nights: '8', day: '25', month: 'September 2026', price: '1299' }, raw }));

  assert.equal(suggestion.title, 'Cruise Title');
  assert.equal(suggestion.value, 'Spain & France Explorer');
  assert.equal(suggestion.confidenceLabel, 'High Confidence');
  assert.equal(suggestion.fieldKey, 'name');
});

test('Cruise Title recovery rejects prices dates inclusions cabins and port lists', () => {
  const { context } = createHarness();
  const raw = `P&O Cruises
Arvia
14 Nights
20 November 2026
Flights Included
Inside Cabin
Southampton - Madeira - Tenerife
£1599pp`;
  const suggestion = vm.runInContext('getCruiseTitleRecoverySuggestion(parsed, raw);', Object.assign(context, { parsed: { operatorKey: 'po', ship: 'Arvia', nights: '14', day: '20', month: 'November 2026', price: '1599' }, raw }));

  assert.equal(suggestion.value, 'Portugal & Spain');
  assert.equal(suggestion.id, 'cruise-title-recovery-ports');
});

test('Cruise Title recovery rejects labelled data fields as title candidates', () => {
  const { context } = createHarness();
  const raw = `Ship: Liberty of the Seas
Departure Date: 25 September 2026
Price: £1689pp
Missing:
Cruise Title`;
  const suggestion = vm.runInContext('getCruiseTitleRecoverySuggestion(parsed, raw);', Object.assign(context, { parsed: { operatorKey: 'royal', ship: 'Liberty of the Seas', day: '25', month: 'September 2026', price: '1689' }, raw }));

  assert.equal(suggestion, null);
});

test('Cruise Title recovery still suggests standalone itinerary-style lines', () => {
  const { context } = createHarness();
  const examples = [
    {
      raw: `Royal Caribbean
Liberty of the Seas
Spain & France
8 Nights
25 September 2026`,
      parsed: { operatorKey: 'royal', ship: 'Liberty of the Seas', nights: '8', day: '25', month: 'September 2026' },
      expected: 'Spain & France'
    },
    {
      raw: `P&O Cruises
Arvia
Eastern Caribbean Islands Fly-Cruise
14 Nights
20 November 2026`,
      parsed: { operatorKey: 'po', ship: 'Arvia', nights: '14', day: '20', month: 'November 2026' },
      expected: 'Eastern Caribbean Islands Fly-Cruise'
    }
  ];

  for (const example of examples) {
    const suggestion = vm.runInContext('getCruiseTitleRecoverySuggestion(parsed, raw);', Object.assign(context, { parsed: example.parsed, raw: example.raw }));
    assert.ok(suggestion, `Expected title suggestion for ${example.expected}`);
    assert.equal(suggestion.value, example.expected);
  }
});
