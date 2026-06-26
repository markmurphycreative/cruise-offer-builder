import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not locate ${name}`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}


function extractConstant(name) {
  const match = html.match(new RegExp(`const ${name}=.*?;`));
  assert.ok(match, `Could not locate ${name}`);
  return match[0];
}

function csvImportSource() {
  const start = html.indexOf('const LAST_SUCCESSFUL_CSV_KEY =');
  const end = html.indexOf('\nfunction currentSheetTemplateTSV()', start);
  assert.ok(start >= 0 && end > start, 'Could not locate CSV import block');
  return [
    extractFunction('normaliseDestinationName'),
    extractFunction('parseFamilyPassengerBasis'),
    html.slice(start, end)
  ].join('\n')
    .replace('const LAST_SUCCESSFUL_CSV_KEY', 'var LAST_SUCCESSFUL_CSV_KEY')
    .replace('let restoringLastSuccessfulCsv', 'var restoringLastSuccessfulCsv');
}

function createCsvHarness() {
  const status = {};
  const context = {
    console,
    offers: [{}, {}, {}, {}],
    cur: 0,
    OPERATOR_CONFIG: { celebrity: { aliases: [/\bcelebrity\b/i] } },
    document: {
      getElementById: id => id === 'sheets-status' ? status : id === 'g-campaign' ? { value: '' } : null,
      querySelectorAll: () => []
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    load: () => {},
    renderSingleOffer: () => {},
    updateAllStatus: () => {},
    genAllUtms: () => {},
    updateExportFilenames: () => {},
    findKnownOperatorShip: () => null
  };
  vm.createContext(context);
  vm.runInContext(csvImportSource(), context);
  return { context, status };
}

function createRenderContext() {
  const context = {
    OPERATOR_HERO_PLACEHOLDERS: {},
    getOperatorSkinStyle: () => '',
    getHeaderHTML: () => '',
    renderHeroHTML: () => '',
    document: { getElementById: id => id === 'g-terms' ? { value: 'T&Cs Apply' } : null }
  };
  vm.createContext(context);
  vm.runInContext([
    extractConstant('ITINERARY_SAFE_WIDTH'),
    extractConstant('ITINERARY_FONT'),
    extractConstant('ITINERARY_SEPARATOR'),
    extractFunction('normaliseDestinationName'),
    extractFunction('cleanPortsDisplay'),
    extractConstant('RETURN_EMBARKATION_PORTS'),
    extractFunction('getDestinationComparisonValue'),
    extractFunction('removeDuplicateReturnToOriginDestination'),
    extractFunction('estimateItineraryTextWidth'),
    extractFunction('getItineraryMeasureText'),
    extractFunction('renderItineraryLine'),
    extractFunction('packItineraryLines'),
    extractFunction('getRenderedItineraryPorts'),
    extractFunction('cleanEmbarkationPortDisplay'),
    extractFunction('getEmbarkationPort'),
    extractFunction('chunkBullets'),
    html.slice(html.indexOf('const CARD_INCLUSION_CABIN_PHRASES='), html.indexOf('function normaliseCardInclusionComponent')),
    extractFunction('normaliseCardInclusionComponent'),
    extractFunction('isCardPreCruiseComponent'),
    extractFunction('splitCardInclusionLineComponents'),
    extractFunction('buildCardInclusionComponents'),
    extractFunction('validateCardInclusionLines'),
    extractFunction('buildCardInclusionRenderLines'),
    extractFunction('normaliseSubtitleSeparator'),
    extractFunction('renderCardInclusion'),
    extractFunction('renderCruiseTitle'),
    extractFunction('escapeAttr'),
    extractFunction('getItineraryImageSource'),
    html.slice(html.indexOf('const EDITABLE_IMAGE_CONFIG='), html.indexOf('function getEditableImageViewport')),
    extractFunction('getEditableImageConfig'),
    extractFunction('renderEditableImageHTML'),
    extractFunction('renderItineraryImageHTML'),
    extractFunction('renderCardHTML'),
    extractFunction('bc')
  ].join('\n'), context);
  return context;
}

function textBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `Missing ${endNeedle}`);
  return source.slice(start + startNeedle.length, end);
}

test('destination normalisation improves readability without trailing bullet opportunities', () => {
  const { chunkBullets, cleanPortsDisplay, getEmbarkationPort } = createRenderContext();

  assert.equal(cleanPortsDisplay('Piraeus (Athens)'), 'Piraeus, Athens');
  assert.equal(cleanPortsDisplay('Paris (Le Havre), France'), 'Paris, Le Havre, France');
  assert.equal(cleanPortsDisplay('Souda (for Chania), Crete'), 'Souda, Chania, Crete');
  assert.equal(cleanPortsDisplay('Mykonos (overnight)'), 'Mykonos');
  assert.equal(getEmbarkationPort('Piraeus (Athens) • Mykonos • Piraeus (Athens)'), 'Piraeus');
  assert.equal(getEmbarkationPort('At Sea • Southampton • Lisbon • Southampton'), 'Southampton');

  const rendered = chunkBullets('Chania, Crete • Piraeus (Athens)', 3);
  assert.equal(rendered, '<span class="port-line"><span class="port-unit">Chania,&nbsp;Crete</span> <span class="port-separator">•</span> <span class="port-unit">Piraeus,&nbsp;Athens</span></span>');
  assert.doesNotMatch(rendered, /<br>/);
  assert.doesNotMatch(rendered, /<span class="port-line">\s*<span class="port-separator">•<\/span>/);
  assert.doesNotMatch(rendered, /<span class="port-separator">•<\/span>\s*<\/span>/);
});

test('card subtitle separators render hyphens while itinerary separators stay bullets', () => {
  const { renderCardHTML, normaliseSubtitleSeparator } = createRenderContext();
  const cases = [
    ['Luggage Included • Ocean View Cabin', 'Luggage Included - Ocean View Cabin'],
    ['Newcastle Flights Included • Inside Cabin', 'Newcastle Flights Included - Inside Cabin'],
    ['Manchester Flights, Luggage Included • Balcony Cabin', 'Manchester Flights, Luggage Included - Balcony Cabin'],
    ['No Fly • Ocean View Cabin', 'No Fly - Ocean View Cabin'],
    ['Coach Included • Inside Cabin', 'Coach Included - Inside Cabin']
  ];

  for (const [input, expected] of cases) {
    assert.equal(normaliseSubtitleSeparator(input), expected);
    const card = renderCardHTML({ name: 'Cruise Title', incl: input, ports: 'Barbados • Martinique' });
    assert.match(card.replace(/<span class="cabin-phrase">(.*?)<\/span>/g, '$1').replace(/&nbsp;/g, ' '), new RegExp(`<div class="incl">${expected}</div>`));
  }

  const card = renderCardHTML({ name: 'Cruise Title', incl: 'Luggage Included • Ocean View Cabin', ports: 'Barbados • Martinique' });
  assert.match(card, /<span class="port-unit">Barbados<\/span> <span class="port-separator">•<\/span> <span class="port-unit">Martinique<\/span>/);
});

test('card inclusion rendering keeps known cabin phrases non-breaking', () => {
  const { renderCardHTML, renderCardInclusion } = createRenderContext();
  const rendered = renderCardInclusion('Newcastle Flights - Transfers Included - Inside Cabin');
  assert.equal(rendered, 'Newcastle Flights - Transfers Included - <span class="cabin-phrase">Inside&nbsp;Cabin</span>');
  const renderedPreCruise = renderCardInclusion('Newcastle Flights - Transfers Included\nInside Cabin - 1 Night Pre-Cruise Stay in Miami');
  assert.equal(renderedPreCruise, 'Newcastle Flights - Transfers Included - <span class="cabin-phrase">Inside&nbsp;Cabin</span><br>1 Night Pre-Cruise Stay in Miami');
  assert.doesNotMatch(renderedPreCruise, /Transfers Included -<br>|Transfers Included -$|^-/);

  const card = renderCardHTML({
    name: 'Celebrity Equinox',
    incl: 'Newcastle Flights - Transfers Included - Inside Cabin',
    ports: 'Barcelona • Rome'
  });
  assert.match(card, /<div class="incl">Newcastle Flights - Transfers Included - <span class="cabin-phrase">Inside&nbsp;Cabin<\/span><\/div>/);
  assert.doesNotMatch(card, /Inside Cabin<\/div>/);
});

test('card title rendering converts hyphenated cruise title terms to non-breaking hyphens only in title output', () => {
  const { renderCardHTML, renderCruiseTitle } = createRenderContext();
  const card = renderCardHTML({
    name: 'Eastern Caribbean Fly-Cruise Back-to-Back',
    incl: 'Pre-Cruise Stay • Adults-Only Venue',
    ports: 'Barbados • Martinique'
  });

  assert.equal(renderCruiseTitle('Fly-Cruise Mini-Break Adults-Only Pre-Cruise Post-Cruise Back-to-Back'), 'Fly‑Cruise Mini‑Break Adults‑Only Pre‑Cruise Post‑Cruise Back‑to‑Back');
  assert.match(card, /<div class="cname">Eastern Caribbean Fly‑Cruise Back‑to‑Back<\/div>/);
  assert.doesNotMatch(card, /<div class="cname">[^<]*Fly-Cruise/);
  assert.match(card, /<div class="incl">Pre-Cruise Stay - Adults-Only Venue<\/div>/);
  assert.match(card, /<span class="port-unit">Barbados<\/span>/);
});

test('CSV pre-cruise stay is detected and excluded from title, details, sailing and destinations', () => {
  const { context, status } = createCsvHarness();
  const csv = [
    'operator,offer_name,ship_name,price,nights,date,board_basis,inclusions,ports,passenger_basis',
    'Celebrity Cruises,Greek Islands,Celebrity Infinity,1299,7,12 June 2027,FB,"1 night pre-cruise stay at 4 Star hotel Athens Piraeus (Athens) Bed & Breakfast, Newcastle flights, luggage and transfers", "Piraeus (Athens)|Mykonos (overnight)|Souda (for Chania), Crete",Based On 2 Adults Sharing'
  ].join('\n');

  context.processSheetCSV(csv, status);
  const offer = context.offers[0];

  assert.equal(status.textContent, '✓ 1 offer loaded');
  assert.equal(offer.preCruiseStay.text, '1 Night Pre-Cruise at the 4 Star Hotel Athens');
  assert.equal(offer.preCruiseStay.board, undefined);
  assert.equal(offer.name, 'Greek Islands');
  assert.equal(offer.ship, 'Celebrity Infinity');
  assert.match(offer.incl, /Newcastle Flights|Luggage & Transfers Included/);
  assert.doesNotMatch(offer.name, /pre-cruise|hotel|Athens/i);
  assert.doesNotMatch(offer.incl, /pre-cruise|4 Star hotel|Piraeus|Bed & Breakfast/i);
  assert.equal(offer.ports, 'Piraeus, Athens • Mykonos • Souda, Chania, Crete');
  assert.doesNotMatch(offer.ports, /pre-cruise|overnight|hotel/i);

  const second = createCsvHarness();
  second.context.processSheetCSV([
    'operator,offer_name,ship_name,price,nights,date,board_basis,inclusions,ports,passenger_basis',
    'Celebrity Cruises,Greek Islands,Celebrity Infinity,1299,7,12 June 2027,FB,"1 night pre-cruise stay at 4 Star hotel Piraeus, Athens Bed & Breakfast, Newcastle flights", "Piraeus, Athens|Mykonos",Based On 2 Adults Sharing'
  ].join('\n'), second.status);
  assert.equal(second.context.offers[0].preCruiseStay.text, '1 Night Pre-Cruise at the 4 Star Hotel Athens');
  assert.doesNotMatch(second.context.offers[0].preCruiseStay.text, /Piraeus, Athens|Bed & Breakfast/i);
});

test('pre-cruise note renders above You\'ll Visit while passenger basis remains only below price', () => {
  const { renderCardHTML } = createRenderContext();
  const card = renderCardHTML({
    name: 'Greek Islands',
    incl: 'Newcastle Flights · Luggage & Transfers Included',
    ship: 'Celebrity Infinity',
    price: '1299',
    basis: 'Based On 2 Adults Sharing',
    board: 'FB',
    boardlbl: 'Full Board',
    day: '12',
    month: 'June 2027',
    nights: '7',
    ports: 'Piraeus, Athens • Mykonos • Souda, Chania, Crete',
    preCruiseStay: { text: '1 Night Pre-Cruise at the 4 Star Hotel Athens', board: 'Bed & Breakfast' }
  });

  assert.ok(card.indexOf('1 Night Pre-Cruise at the 4 Star Hotel Athens') < card.indexOf("You'll Visit"));
  assert.match(card, /<div class="vsec"><div class="visit-inner"><div class="vpts precruise-note"><div>1 Night Pre-Cruise at the 4 Star Hotel Athens<\/div><\/div><div class="vtit">You'll Visit<\/div>/);
  const preCruiseNote = textBetween(card, '<div class="vpts precruise-note">', '</div><div class="vtit">');
  assert.equal((preCruiseNote.match(/<div>/g) || []).length, 1);
  assert.doesNotMatch(preCruiseNote, /Piraeus \(Athens\)|Piraeus, Athens|Bed & Breakfast|Full Board|Half Board|Mykonos|Souda/i);
  assert.match(html, /\.cc \.precruise-note\{margin-bottom:30px;white-space:nowrap;\}/);

  const titleArea = textBetween(card, '<div class="cname">', '</div><div class="incl">');
  const detailsLine = textBetween(card, '<div class="incl">', '</div><div class="sname">');
  const sailingLine = textBetween(card, '<div class="sname">', '</div><div class="price-block">');
  const destinations = textBetween(card, '<div class="vtit">You\'ll Visit</div><div class="vpts">', '</div></div></div><div class="tcbar">');

  assert.doesNotMatch(titleArea, /Sailing on|Based On|Pre-Cruise|Celebrity Infinity|Newcastle Flights/i);
  assert.doesNotMatch(detailsLine, /Full Board|Based On|Celebrity Infinity|Pre-Cruise/i);
  assert.equal(sailingLine, 'Sailing on Celebrity Infinity from Piraeus');
  assert.doesNotMatch(destinations, /Pre-Cruise|Bed & Breakfast|Based On|Celebrity Infinity|overnight/i);
  assert.equal((card.match(/Based On 2 Adults Sharing/g) || []).length, 1);
  assert.match(card, /<div class="pbasis">Based On 2 Adults Sharing<\/div>/);
});

test('cards without pre-cruise stay keep the existing itinerary section HTML while cleaning duplicated return embarkation ports', () => {
  const { renderCardHTML } = createRenderContext();
  const card = renderCardHTML({ ship: 'Liberty of the Seas', ports: 'Southampton • Lisbon • Southampton', basis: 'Based On 2 Adults Sharing' });

  assert.match(card, /<div class="sname">Sailing on Liberty of the Seas from Southampton<\/div>/);
  assert.match(card, /<div class="vsec"><div class="visit-inner"><div class="vtit">You'll Visit<\/div><div class="vpts"><span class="port-line"><span class="port-unit">Southampton<\/span> <span class="port-separator">•<\/span> <span class="port-unit">Lisbon<\/span><\/span><\/div><\/div><\/div>/);
  assert.doesNotMatch(card, /precruise-note|Pre-Cruise|Bed & Breakfast/);
});


test('card You\'ll Visit output excludes cruise title when using cleaned parsed ports', () => {
  const { renderCardHTML } = createRenderContext();
  const card = renderCardHTML({ name: 'Norwegian Fjords', ship: 'Queen Anne', ports: 'Southampton • Stavanger • Olden • Geiranger • Bergen • Southampton' });
  const destinations = textBetween(card, '<div class="vpts">', '</div></div></div><div class="tcbar">');

  assert.match(destinations, /Southampton/);
  assert.match(destinations, /Stavanger/);
  assert.doesNotMatch(destinations, /Norwegian\s*Fjords/);
});

test('preview and export use the same card rendering path with no pre-cruise panels or special layouts', () => {
  assert.match(html, /out\.innerHTML=renderCardHTML\(data\|\|\{\}\);/);
  assert.match(html, /wrap\.innerHTML = renderCardHTML\(offerData\);/);
  assert.match(html, /c\.innerHTML = bc\(d \|\| \{\}\);/);
  assert.match(html, /const card=bc\(offerData \|\| \{\}\);/);
  assert.match(html, /<div class="vsec"><div class="visit-inner">\$\{preCruiseHTML\}<div class="vtit">You'll Visit<\/div><div class="vpts">\$\{portsHTML\}<\/div><\/div><\/div>/);
  assert.doesNotMatch(html, /precruise-(?:panel|box|badge|overlay|callout|popup)|pre-cruise-(?:panel|box|badge|overlay|callout|popup)/i);
});
