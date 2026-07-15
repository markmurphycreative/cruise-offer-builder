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
  let depth = 0;
  for (let i = html.indexOf('=', start) + 1; i < html.length; i += 1) {
    const char = html[i];
    if ('[{('.includes(char)) depth += 1;
    if (']})'.includes(char)) depth -= 1;
    if (char === ';' && depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}
function createContext() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeHtml'),
    extractConst('PACKAGE_OPERATORS'),
    extractConst('PACKAGE_BOARD_BASES'),
    extractConst('PACKAGE_FEATURES'),
    extractConst('PACKAGE_AIRPORTS'),
    extractFunction('isPackageOperator'),
    extractFunction('isPackageOffer'),
    extractFunction('packageOfferFromData'),
    extractFunction('formatPackageMoney'),
    extractFunction('packageAirportLine'),
    extractFunction('packageResortFeeText'),
    extractFunction('renderPackagePriceBlock'),
    extractFunction('renderPackageCard')
  ].join('\n') + '\nglobalThis.PACKAGE_OPERATORS = PACKAGE_OPERATORS; globalThis.PACKAGE_BOARD_BASES = PACKAGE_BOARD_BASES; globalThis.PACKAGE_FEATURES = PACKAGE_FEATURES; globalThis.PACKAGE_AIRPORTS = PACKAGE_AIRPORTS;', context);
  return context;
}

test('Package operator configuration defines Phase 1 logos and CTA text', () => {
  const { PACKAGE_OPERATORS } = createContext();
  assert.equal(PACKAGE_OPERATORS.tui.logo, 'assets/operator-logos/tui-logo.png');
  assert.equal(PACKAGE_OPERATORS.tui.ctaText, 'Call us for more info');
  assert.equal(PACKAGE_OPERATORS.jet2.logo, 'assets/operator-logos/jet2-holidays-logo.png');
  assert.equal(PACKAGE_OPERATORS.jet2.ctaText, 'Start your booking');
  assert.equal(PACKAGE_OPERATORS.easyjet.logo, 'assets/operator-logos/easyjet-logo.png');
  assert.equal(PACKAGE_OPERATORS.easyjet.ctaText, 'Call us for more info');
});

test('Package offer model maps existing builder fields without mutating Cruise fields', () => {
  const { packageOfferFromData } = createContext();
  const model = packageOfferFromData({
    operator: 'tui',
    name: 'Sidari, Corfu',
    ship: 'Marianna Apartments',
    nights: '10',
    boardlbl: 'Self Catering',
    day: '6th',
    month: 'August 2026',
    sailingFrom: 'Newcastle',
    price: '646pp',
    resortFee: '10pp',
    totalPrice: '656pp',
    basis: 'Based on 2 Adults Sharing'
  });
  assert.equal(model.offerType, 'package');
  assert.equal(model.destination, 'Sidari, Corfu');
  assert.equal(model.hotel, 'Marianna Apartments');
  assert.equal(model.departureAirport, 'Newcastle');
  assert.equal(model.totalPrice, '656pp');
});

test('Package renderer supports resort-fee and total-price layouts', () => {
  const { renderPackageCard } = createContext();
  const htmlOutput = renderPackageCard({
    operator: 'easyjet',
    name: 'Berlin, Germany',
    ship: 'Leonardo Hotel',
    nights: '3',
    boardlbl: 'Room Only',
    day: '20th',
    month: 'November 2026',
    sailingFrom: 'Newcastle',
    incl: 'Hand Luggage Included',
    price: '323pp',
    resortFee: '12pp',
    totalPrice: '335pp'
  });
  assert.match(htmlOutput, /class="pc pkg-easyjet"/);
  assert.match(htmlOutput, /\+£12pp Total Local Resort Fee/);
  assert.match(htmlOutput, /£335/);
  assert.match(htmlOutput, /Call us for more info/);
});

test('Jet2 package renderer reads the Free Child Place ribbon from package data', () => {
  const { renderPackageCard } = createContext();
  const htmlOutput = renderPackageCard({
    operator: 'jet2',
    tags: 'Free Child Place · Family',
    name: 'Magalluf, Majorca',
    ship: 'FERGUS Club Mallorca Waterpark',
    nights: '7',
    boardlbl: 'All Inclusive',
    day: '13th',
    month: 'August 2026',
    sailingFrom: 'Newcastle',
    price: '2209',
    basis: 'Based on 2 Adults & 1 Child Sharing'
  });
  assert.match(htmlOutput, /Offer Includes a Free Child Place/);
  assert.match(htmlOutput, /Start your booking/);
  assert.match(htmlOutput, /assets\/operator-logos\/jet2-holidays-logo\.png/);
});
