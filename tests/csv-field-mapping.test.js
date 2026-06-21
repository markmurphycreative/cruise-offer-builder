import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not locate ${label}`);
  return match[0];
}

function createImportHarness() {
  const storage = new Map();
  const status = {};
  const campaign = { value: '' };
  const start = html.indexOf('const LAST_SUCCESSFUL_CSV_KEY =');
  const end = html.indexOf('\nfunction currentSheetTemplateTSV()', start);
  assert.ok(start >= 0 && end > start, 'Could not locate CSV persistence/import block');
  const source = [
    extract(/function normaliseDestinationName\(port\)\{[\s\S]*?\n\}/, 'destination normaliser'),
    extract(/function parseFamilyPassengerBasis\(text\)\{[\s\S]*?\n\}/, 'family passenger basis parser'),
    html.slice(start, end)
  ].join('\n')
    .replace('const LAST_SUCCESSFUL_CSV_KEY', 'var LAST_SUCCESSFUL_CSV_KEY')
    .replace('let restoringLastSuccessfulCsv', 'var restoringLastSuccessfulCsv');

  const context = {
    console,
    offers: [{}, {}, {}, {}],
    cur: 0,
    OPERATOR_CONFIG: {
      marella: { aliases: [/\bmarella\b/i] },
      amawaterways: { aliases: [/\bamawaterways\b/i] },
      royal: { aliases: [/\broyal\s+caribbean\b/i] }
    },
    document: {
      getElementById: id => id === 'sheets-status' ? status : id === 'g-campaign' ? campaign : null,
      querySelectorAll: () => []
    },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    load: () => {},
    renderSingleOffer: () => {},
    updateAllStatus: () => {},
    genAllUtms: () => {},
    updateExportFilenames: () => {},
    findKnownOperatorShip: () => null
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, status };
}

function importCSV(csv) {
  const harness = createImportHarness();
  harness.context.processSheetCSV(csv, harness.status);
  assert.equal(harness.status.textContent, '✓ 1 offer loaded');
  return harness.context.offers[0];
}

test('CSV Title column always becomes the card title and cannot be replaced by inclusions', () => {
  const offer = importCSV([
    'Operator,Title,Board Basis,Price,Ship,Inclusions,Passenger Basis,Itinerary',
    'Marella Cruises,Iconic Islands,All Inclusive,£1249,Marella Voyager,Checked luggage & transfers,2 Adults Sharing,Corfu | Rhodes | Patmos | Heraklion'
  ].join('\n'));

  assert.equal(offer.name, 'Iconic Islands');
  assert.notEqual(offer.name, offer.incl);
  assert.equal(offer.incl, 'Luggage & Transfers Included');
});

test('CSV Title column cannot be replaced by ship names or passenger basis text', () => {
  const offer = importCSV([
    'Operator,Title,Price,Ship,Inclusions,Passenger Basis,Itinerary',
    'Royal Caribbean,Spain & France,£1689,Liberty of the Seas,Ocean View Cabin,2 Adults & 1 Child,Barcelona | Marseille | Valencia'
  ].join('\n'));

  assert.equal(offer.name, 'Spain & France');
  assert.equal(offer.ship, 'Liberty of the Seas');
  assert.equal(offer.incl, 'Ocean View Cabin · Family');
  assert.equal(offer.basis, 'Based On 2 Adults & 1 Child Sharing');
  assert.doesNotMatch(offer.name, /Liberty of the Seas|Based On|Child/i);
});


test('CSV importer only falls back from Title when the Title cell is genuinely empty', () => {
  const offer = importCSV([
    'Operator,Title,offer_name,Price,Ship,Inclusions,Itinerary',
    'Marella Cruises,,Fallback Cruise Name,£1249,Marella Voyager,Checked luggage & transfers,Corfu | Rhodes'
  ].join('\n'));

  assert.equal(offer.name, 'Fallback Cruise Name');
});

test('details line is built only from inclusions and attributes while ship and basis stay in their own fields', () => {
  const offer = importCSV([
    'Operator,Title,Board Basis,Price,Ship,Inclusions,Passenger Basis,Itinerary',
    'AmaWaterways,Swiss Alps & Rhine Castles,Full Board,£1899,AmaSerena,Luggage & transfers included,2 Adults Sharing,Basel | Strasbourg | Cologne | Amsterdam'
  ].join('\n'));

  assert.equal(offer.name, 'Swiss Alps & Rhine Castles');
  assert.equal(offer.incl, 'Luggage & Transfers Included');
  assert.equal(offer.ship, 'AmaSerena');
  assert.equal(offer.basis, 'Based On 2 Adults Sharing');
  assert.doesNotMatch(offer.incl, /AmaSerena|Based On|Swiss Alps|£|Basel|Strasbourg|Cologne|Amsterdam/);
});


test('details line keeps supporting inclusions but excludes board basis labels', () => {
  const offer = importCSV([
    'Operator,Title,Departure Type,Departure,Board Basis,Price,Ship,Inclusions,Passenger Basis,Itinerary',
    'Marella Cruises,Canaries Escape,Fly Cruise,Newcastle,All Inclusive,£1299,Marella Voyager,"Flights, luggage, transfers, drinks package, Wi-Fi, entertainment, service charges",2 Adults Sharing,Tenerife | Madeira'
  ].join('\n'));

  assert.equal(offer.board, 'AI');
  assert.equal(offer.boardlbl, 'All Inclusive');
  assert.equal(offer.incl, 'Newcastle Flights · Luggage & Transfers Included · Drinks Package · Wi-Fi Included · Entertainment Included · Service Charges Included');
  assert.doesNotMatch(offer.incl, /All Inclusive|Full Board|Half Board|Dining/);
});


test('CSV fly cruises use the Departure value in the flights wording', () => {
  const offer = importCSV([
    'Operator,Title,Departure Type,Departure,Price,Ship,Inclusions,Itinerary',
    'Marella Cruises,Greek Islands,Fly Cruise,Edinburgh,£1199,Marella Explorer,Luggage and transfers included,Corfu | Rhodes'
  ].join('\n'));

  assert.equal(offer.incl, 'Edinburgh Flights · Luggage & Transfers Included');
});

test('CSV no fly cruises never add flights wording', () => {
  const offer = importCSV([
    'Operator,Title,Departure Type,Departure,Price,Ship,Inclusions,Itinerary',
    'Marella Cruises,British Isles,No Fly Cruise,Southampton,£999,Marella Explorer,Flights luggage transfers,Southampton | Bruges'
  ].join('\n'));

  assert.equal(offer.incl, 'Luggage & Transfers Included');
  assert.doesNotMatch(offer.incl, /Flights/i);
});

test('CSV luggage and transfers stay separate when only one inclusion is present', () => {
  const luggageOffer = importCSV([
    'Operator,Title,Price,Ship,Inclusions,Itinerary',
    'Marella Cruises,Luggage Only,£999,Marella Explorer,Luggage included,Corfu | Rhodes'
  ].join('\n'));
  const transferOffer = importCSV([
    'Operator,Title,Price,Ship,Inclusions,Itinerary',
    'Marella Cruises,Transfers Only,£999,Marella Explorer,Transfers included,Corfu | Rhodes'
  ].join('\n'));

  assert.equal(luggageOffer.incl, 'Luggage Included');
  assert.equal(transferOffer.incl, 'Transfers Included');
});

test('passenger basis wording never appears in title, details, sailing or itinerary data', () => {
  const offer = importCSV([
    'Operator,Title,Price,Ship,Inclusions,Passenger Basis,Itinerary',
    'Royal Caribbean,Family Fjords,£2089,Odyssey of the Seas,Balcony Cabin,2 Adults & 2 Children,Bergen | Flam | Stavanger'
  ].join('\n'));

  assert.equal(offer.basis, 'Based On 2 Adults & 2 Children Sharing');
  assert.doesNotMatch([offer.name, offer.incl, offer.ship, offer.ports].join(' || '), /Based On|2 Adults|Children Sharing/);
});

test('CSV itinerary pipe separators convert to the builder bullet separator', () => {
  const offer = importCSV([
    'Operator,Title,Price,Ship,Inclusions,Itinerary',
    'Marella Cruises,Iconic Islands,£1249,Marella Voyager,Checked luggage & transfers,Corfu | Rhodes | Patmos | Heraklion'
  ].join('\n'));

  assert.equal(offer.ports, 'Corfu • Rhodes • Patmos • Heraklion');
  assert.doesNotMatch(offer.ports, /\|/);
});


test('CSV itinerary keeps pipe-separated comma destinations atomic', () => {
  const offer = importCSV([
    'Operator,Title,Price,Ship,Inclusions,Itinerary',
    'Marella Cruises,Spanish Shores,£1249,Marella Voyager,Checked luggage & transfers,"Bilbao, Spain | La Coruna, Spain | Vigo, Spain | Souda (for Chania), Crete"'
  ].join('\n'));

  assert.equal(offer.ports, 'Bilbao, Spain • La Coruna, Spain • Vigo, Spain • Souda, Chania, Crete');
  assert.doesNotMatch(offer.ports, /Bilbao • Spain|La Coruna • Spain|Chania\) • Crete/);
});

test('existing pasted-offer parser, card renderer, and export renderer paths remain unchanged', () => {
  assert.match(html, /function parseOffer\(\)\{/);
  assert.match(html, /const PARSE_FIELD_MAP=\{operatorKey:"f-operator",tags:"f-tags",name:"f-name",ship:"f-ship",incl:"f-incl",price:"f-price",basis:"f-basis",board:"f-board",boardlbl:"f-boardlbl",day:"f-day",month:"f-month",nights:"f-nights",ports:"f-ports"\};/);
  assert.match(html, /out\.innerHTML=renderCardHTML\(data\|\|\{\}\);/);
  assert.match(html, /wrap\.innerHTML = renderCardHTML\(offerData\);/);
  assert.match(html, /html2canvas\(target, \{/);
});

test('card layout render order remains unchanged for imported and manually built cards', () => {
  assert.match(
    html,
    /\$\{getHeaderHTML\(d\)\}\$\{heroHTML\}<div class="isec"><div class="isec-content"><div class="cname">\$\{name\}<\/div><div class="incl">\$\{incl\}<\/div><div class="sname">\$\{shipLine\}<\/div><div class="price-block">\$\{priceHTML\}<div class="pbasis">\$\{basis\}<\/div><\/div><\/div><\/div><div class="ibar">[\s\S]*<div class="vsec"><div class="visit-inner">\$\{preCruiseHTML\}<div class="vtit">You'll Visit<\/div><div class="vpts">\$\{portsHTML\}<\/div><\/div><\/div><div class="tcbar">\$\{terms\}<\/div>/
  );
});

test('CSV imported USP/tag text is written to offer.tags for f-tags persistence', () => {
  const offer = importCSV([
    'Operator,Title,Ship,Price,Nights,Date,Board Basis,Tags,Inclusions,Itinerary',
    'Marella Cruises,Greek Island Gems,Marella Voyager,£1249,7,12 May 2027,All Inclusive,Accessible · All Inclusive · Entertainment · Family,Flights included,Corfu | Rhodes | Patmos'
  ].join('\n'));

  assert.equal(offer.tags, 'Accessible · All Inclusive · Entertainment · Family');
});

test('CSV import writes the same fallback top-bar USP text into offer.tags when no tag column is supplied', () => {
  const offer = importCSV([
    'Operator,Title,Ship,Price,Nights,Date,Board Basis,Inclusions,Itinerary',
    'Marella Cruises,Greek Island Gems,Marella Voyager,£1249,7,12 May 2027,All Inclusive,Flights included,Corfu | Rhodes | Patmos'
  ].join('\n'));

  assert.equal(offer.tags, 'Cruise · Destinations · Entertainment');
});

test('Google Sheet imported airport inclusions use Paste Offer airport normalisation before cabin subtitle generation', () => {
  const offer = importCSV([
    'Operator,Ship,Title,Date,Nights,Inclusions,Cabin,Board Basis,Price,Itinerary,Tags',
    'Celebrity Cruises,Celebrity Millennium,Best of Japan - Golden Week,29 April 2027,12,Flights from Newcastle,Inside Cabin,Full Board,3089,Tokyo • Kyoto (Osaka) • Kochi • Busan • Nagasaki • Kagoshima • Mt Fuji (Shimizu) • Tokyo,Inside Cabin • Japan • Hotel Stay'
  ].join('\n'));

  assert.equal(offer.incl, 'Newcastle Flights Included - Inside Cabin');
  assert.match(offer.incl, /Newcastle Flights Included - Inside Cabin/);
  assert.doesNotMatch(offer.incl, /^Flights -/);
});

test('Google Sheet imported inclusion values match required airport and non-flight mappings', () => {
  const cases = [
    ['Flights from Newcastle', 'Newcastle Flights Included'],
    ['Flights included from Newcastle', 'Newcastle Flights Included'],
    ['Direct flights included from Newcastle', 'Newcastle Flights Included'],
    ['Fly from Newcastle', 'Newcastle Flights Included'],
    ['Flying from Newcastle', 'Newcastle Flights Included'],
    ['Flights from Manchester', 'Manchester Flights Included'],
    ['Flights from Leeds Bradford', 'Leeds Bradford Flights Included'],
    ['Flights from Glasgow', 'Glasgow Flights Included'],
    ['Flights from Belfast', 'Belfast Flights Included'],
    ['Newcastle Flights, Luggage & Transfers Included', 'Newcastle Flights, Luggage & Transfers Included'],
    ['Manchester Luggage Included', 'Manchester Flights, Luggage Included'],
    ['Glasgow Transfers Included', 'Glasgow Flights, Transfers Included'],
    ['Luggage Included', 'Luggage Included'],
    ['Coach Included', 'Coach Included'],
    ['No Fly', 'No Fly']
  ];

  for (const [input, expected] of cases) {
    const offer = importCSV([
      'Operator,Title,Price,Ship,Inclusions,Itinerary',
      `Celebrity Cruises,Mapping Case,£999,Celebrity Millennium,"${input}",Tokyo | Kyoto`
    ].join('\n'));
    assert.equal(offer.incl, expected, `${input} should normalise to ${expected}`);
  }
});
