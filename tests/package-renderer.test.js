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
    extractConst('PACKAGE_COPY_FIELDS'),
    extractFunction('normalisePackageOperatorKey'),
    extractFunction('isPackageOperator'),
    extractFunction('isPackageOffer'),
    extractFunction('packageOfferHasGenuineData'),
    extractFunction('packageDefaultCopyValue'),
    extractFunction('normalisePackageCopyOverrides'),
    extractFunction('packageCopyValue'),
    extractFunction('applyPackageCopyInputOverrides'),
    extractFunction('packageCopyEditorValue'),
    extractFunction('formatPackageOrdinalDate'),
    extractFunction('packageOfferFromData'),
    extractFunction('formatPackageMoney'),
    extractFunction('packageAirportLine'),
    extractFunction('packageResortFeeText'),
    extractFunction('renderPackagePriceBlock'),
    extractFunction('renderPackageOperatorLogo'),
    extractFunction('renderPackageCard')
  ].join('\n') + '\nglobalThis.PACKAGE_OPERATORS = PACKAGE_OPERATORS; globalThis.PACKAGE_COPY_FIELDS = PACKAGE_COPY_FIELDS; globalThis.PACKAGE_BOARD_BASES = PACKAGE_BOARD_BASES; globalThis.PACKAGE_FEATURES = PACKAGE_FEATURES; globalThis.PACKAGE_AIRPORTS = PACKAGE_AIRPORTS;', context);
  return context;
}

test('Package operator configuration defines Phase 1 logos and CTA text', () => {
  const { PACKAGE_OPERATORS } = createContext();
  assert.equal(PACKAGE_OPERATORS.tui.logo, 'assets/operator-logos/tui-logo.png');
  assert.equal(PACKAGE_OPERATORS.tui.ctaText, 'Start your booking');
  assert.equal(PACKAGE_OPERATORS.jet2.logo, 'assets/operator-logos/jet2-holidays-logo.png');
  assert.equal(PACKAGE_OPERATORS.jet2.ctaText, 'Start your booking');
  assert.equal(PACKAGE_OPERATORS.jet2.ctaSecondary, 'or visit us in store');
  assert.equal(PACKAGE_OPERATORS.jet2.skin.header, undefined);
  assert.equal(PACKAGE_OPERATORS.jet2.skin.headerCouples, undefined);
  assert.equal(PACKAGE_OPERATORS.jet2.skin.headerFamily, undefined);
  assert.equal(PACKAGE_OPERATORS.jet2.skin.footer, 'assets/package-skins/jet2/footer.png');
  assert.equal(PACKAGE_OPERATORS.easyjet.logo, 'assets/operator-logos/easyjet-logo.png');
  assert.equal(PACKAGE_OPERATORS.easyjet.ctaText, 'Start your booking');
});

test('Package operator logos use operator-specific natural-aspect placement classes', () => {
  assert.match(html, /\.pc \.pkg-operator-logo\{[^}]*display:block;[^}]*position:absolute;[^}]*width:auto;[^}]*height:auto;[^}]*object-fit:contain;[^}]*pointer-events:none;/);
  assert.match(html, /\.pc \.pkg-operator-logo--tui\{left:28px;bottom:14px;width:300px;\}/);
  assert.match(html, /\.pc \.pkg-operator-logo--jet2\{left:226px;bottom:114px;width:240px;\}/);
  assert.doesNotMatch(html, /\.pc\.pkg-jet2 \.pkg-operator-logo--jet2/);
  assert.match(html, /\.pc\.pkg-jet2\{--pkg-left:98px;\}/);
  assert.match(html, /\.pc\.pkg-jet2 \.pkg-head\{height:154px;[^}]*border:0;\}/);
  assert.match(html, /\.pc\.pkg-jet2 \.pkg-skin-header\{height:auto;object-fit:contain;object-position:top center;\}/);
  assert.match(html, /\.pc\.pkg-jet2 \.pkg-fee\{color:#000;\}/);
  assert.match(html, /\.pc \.pkg-operator-logo--easyjet\{left:6px;bottom:-27px;width:430px;\}/);

  const { renderPackageCard } = createContext();
  assert.match(renderPackageCard({ operator: 'tui' }), /pkg-operator-logo pkg-operator-logo--tui/);
  const jet2Html = renderPackageCard({ operator: 'jet2' });
  assert.match(jet2Html, /<img class="pkg-operator-logo pkg-operator-logo--jet2" src="assets\/operator-logos\/jet2-holidays-logo\.png" alt="" role="presentation" aria-hidden="true">/);
  assert.match(jet2Html, /<div class="pkg-head"><img class="pkg-head-logo" src="assets\/operator-logos\/dawson-and-sanderson-logo\.png" alt="Dawson &amp; Sanderson logo">/);
  assert.equal((jet2Html.match(/assets\/operator-logos\/jet2-holidays-logo\.png/g) || []).length, 1);
  assert.doesNotMatch(jet2Html, /pkg-head-operator-logo|pkg-skin-header|header-couples\.png|header-family\.png/);
  assert.match(renderPackageCard({ operator: 'easyjet' }), /pkg-operator-logo pkg-operator-logo--easyjet/);
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
  assert.equal(model.totalPrice, '656');
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
  assert.match(htmlOutput, /assets\/package-skins\/easyjet\/footer\.png/);
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
  assert.doesNotMatch(htmlOutput, /assets\/package-skins\/jet2\/header-family\.png/);
  assert.match(htmlOutput, /assets\/operator-logos\/jet2-holidays-logo\.png/);
});


test('Jet2 couples render with fee uses canonical assets, compact inclusions and combined total label', () => {
  const { renderPackageCard } = createContext();
  const out = renderPackageCard({ operator: 'jet2', name: 'Kefalonia, Greece', ship: 'Sunset Paradise Resort', nights: '7', boardlbl: 'Bed & Breakfast', day: '21', month: 'July 2026', sailingFrom: 'Newcastle', price: '574pp', leadPrice: '574pp', totalPrice: '1148', localFeeAmount: '24', localFeeType: 'total', localFeePerPerson: '12', displayTotalPerPerson: '586', adults: '2', children: '0', handLuggage: '2 x 10kg', holdLuggage: '2 x 22kg', transfers: 'Coach transfers included' });
  assert.doesNotMatch(out, /assets\/package-skins\/jet2\/header-couples\.png/);
  assert.match(out, /assets\/package-skins\/jet2\/footer\.png/);
  assert.match(out, /assets\/operator-logos\/jet2-holidays-logo\.png/);
  assert.match(out, /Kefalonia, Greece/);
  assert.match(out, /Sunset Paradise Resort/);
  assert.match(out, /21st July 2026/);
  assert.match(out, /Newcastle Flights/);
  assert.match(out, /Luggage &amp; Transfers Included/);
  assert.match(out, /£574<span class="pkg-pp">pp<\/span>/);
  assert.match(out, /\+£12pp Local Resort Fee/);
  assert.match(out, /£586<span class="pkg-pp">pp<\/span>[\s\S]*<div class="pkg-price-label">Total Price<\/div>/);
  assert.match(out, /Based on 2 Adults Sharing/);
  assert.match(out, /<div class="pkg-footer-cta"><div class="pkg-cta-main">Start your booking<\/div><div class="pkg-cta-sub">or visit us in store<\/div><\/div>/);
  const edited = renderPackageCard({ operator: 'jet2', ctaPrimary: 'Book online', ctaSecondary: '', packageCopyOverrides: { ctaPrimary: 'Book online', ctaSecondary: '' }, name: 'Kefalonia', ship: 'Hotel', price: '574pp', adults: '2', children: '0' });
  assert.match(edited, /<div class="pkg-cta-main">Book online<\/div>/);
  assert.doesNotMatch(edited, /<div class="pkg-cta-sub">/);
  const blankPriceCopy = renderPackageCard({ operator: 'jet2', price: '574pp', priceLabel: '', basis: '', incl: '', ctaPrimary: '', ctaSecondary: '' });
  assert.match(blankPriceCopy, /Total Price/);
  assert.match(blankPriceCopy, /Based on 2 Adults Sharing/);
  assert.match(blankPriceCopy, /Start your booking/);
  assert.match(blankPriceCopy, /Luggage &amp; Transfers Included/);
  const deliberateBlankCopy = renderPackageCard({ operator: 'jet2', price: '574pp', packageCopyOverrides: { priceLabel: '', basis: '', inclusions: '', ctaSecondary: '' } });
  assert.doesNotMatch(deliberateBlankCopy, /pkg-price-label|pkg-basis|pkg-cta-sub|Luggage &amp; Transfers Included/);
  assert.doesNotMatch(out, /Our Rating|TripAdvisor|176 Reviews|Holiday Summary|Flight Details|Going out|Coming back|NCL|EFL|Hand Luggage Included|Hold Luggage Included|Coach Transfers/);
});

test('Jet2 couples render without fee has a single lower price block and no empty fee line', () => {
  const { renderPackageCard } = createContext();
  const out = renderPackageCard({ operator: 'jet2', name: 'Playa De Las Americas, Tenerife', ship: 'Servatur Caribe Apartments', nights: '7', boardlbl: 'Self Catering', day: '15', month: 'July 2026', sailingFrom: 'Leeds Bradford', price: '499pp', leadPrice: '499pp', adults: '2', children: '0' });
  assert.doesNotMatch(out, /assets\/package-skins\/jet2\/header-couples\.png/);
  assert.equal((out.match(/class="pkg-price /g) || []).length, 1);
  assert.match(out, /£499<span class="pkg-pp">pp<\/span>[\s\S]*Total Price[\s\S]*Based on 2 Adults Sharing/);
  assert.match(out, /Leeds Bradford Flights/);
  assert.doesNotMatch(out, /pkg-fee|Local Resort Fee|£0/);
});

test('Jet2 family render total price only and free child place controls family header', () => {
  const { renderPackageCard } = createContext();
  const family = renderPackageCard({ operator: 'jet2', name: 'Majorca', ship: 'Family Resort', totalPrice: '2209', price: '699pp', adults: '2', children: '1', freeChildPlace: false });
  assert.match(family, /£2,209<span class="pkg-pp"><\/span>/);
  assert.match(family, /Total Price/);
  assert.match(family, /Based on 2 Adults &amp; 1 Child Sharing/);
  assert.doesNotMatch(family, /header-family\.png/);
  const freeChild = renderPackageCard({ operator: 'jet2', name: 'Majorca', ship: 'Family Resort', totalPrice: '2209', adults: '2', children: '1', freeChildPlace: true });
  assert.doesNotMatch(freeChild, /assets\/package-skins\/jet2\/header-family\.png/);
  assert.match(freeChild, /Offer Includes a Free Child Place/);
});

test('Unknown package operator renders neutral state instead of falling back to TUI', () => {
  const { renderPackageCard } = createContext();
  const out = renderPackageCard({ operator: '', name: 'Unknown', ship: 'Unknown Hotel', price: '100' });
  assert.match(out, /Operator not detected/);
  assert.doesNotMatch(out, /assets\/operator-logos\/tui-logo\.png/);
});

test('Package renderer uses editable labels for all non-parsed package copy', () => {
  const { renderPackageCard } = createContext();
  const out = renderPackageCard({
    operator: 'jet2',
    name: 'Kefalonia',
    ship: 'Hotel',
    nights: '7',
    packageNightsLabel: 'Evenings',
    sailingFrom: 'Newcastle',
    packageFlightsLabel: 'Departures',
    price: '574pp',
    leadPrice: '574pp',
    totalPrice: '586',
    resortFee: '12pp',
    packagePerPersonSuffix: 'per adult',
    packageResortFeeLabel: 'Pay locally charge',
    priceLabel: 'Holiday Total',
    basis: 'Based on two grown-ups',
    incl: 'Bags and coaches sorted',
    ctaPrimary: 'Reserve today',
    ctaSecondary: 'then pop in store'
  });
  assert.match(out, /7 Evenings/);
  assert.match(out, /Newcastle Departures/);
  assert.match(out, /Bags and coaches sorted/);
  assert.match(out, /£574<span class="pkg-pp">per adult<\/span>/);
  assert.match(out, /\+£12per adult Pay locally charge/);
  assert.match(out, /Holiday Total/);
  assert.match(out, /Based on two grown-ups/);
  assert.match(out, /Reserve today/);
  assert.match(out, /then pop in store/);
});


test('Package copy overrides distinguish absent, custom and deliberately blank values', () => {
  const { renderPackageCard, packageOfferFromData } = createContext();
  const base = { operator: 'jet2', offerType: 'package', name: 'Kefalonia, Greece', ship: 'Sunset Paradise Resort', nights: '7', sailingFrom: 'Newcastle', price: '574pp', adults: '2', children: '0' };
  const defaultHtml = renderPackageCard(base);
  assert.match(defaultHtml, /assets\/operator-logos\/jet2-holidays-logo\.png/);
  assert.doesNotMatch(defaultHtml, /assets\/package-skins\/jet2\/header-couples\.png/);
  assert.match(defaultHtml, /assets\/package-skins\/jet2\/footer\.png/);
  assert.match(defaultHtml, /7 Nights/);
  assert.match(defaultHtml, /Newcastle Flights/);
  assert.match(defaultHtml, /Start your booking/);
  assert.match(defaultHtml, /or visit us in store/);
  assert.match(defaultHtml, /Total Price/);
  assert.match(defaultHtml, /Based on 2 Adults Sharing/);
  assert.match(defaultHtml, /Luggage &amp; Transfers Included/);

  const oldCampaignHtml = renderPackageCard({ ...base, ctaPrimary: '', ctaSecondary: '', priceLabel: '', basis: '', incl: '', packageNightsLabel: '', packageFlightsLabel: '' });
  assert.match(oldCampaignHtml, /7 Nights/);
  assert.match(oldCampaignHtml, /Newcastle Flights/);
  assert.match(oldCampaignHtml, /Start your booking/);
  assert.match(oldCampaignHtml, /or visit us in store/);
  assert.match(oldCampaignHtml, /Total Price/);
  assert.match(oldCampaignHtml, /Based on 2 Adults Sharing/);
  assert.match(oldCampaignHtml, /Luggage &amp; Transfers Included/);

  const custom = { ...base, packageCopyOverrides: { ctaPrimary: 'Reserve now', ctaSecondary: 'call your local branch', nightsLabel: 'Evenings', flightsLabel: 'Departures', inclusions: 'Bags included', priceLabel: 'Holiday total', basis: 'Based on two adults' } };
  const customHtml = renderPackageCard(custom);
  assert.match(customHtml, /7 Evenings/);
  assert.match(customHtml, /Newcastle Departures/);
  assert.match(customHtml, /Reserve now/);
  assert.match(customHtml, /call your local branch/);
  assert.match(customHtml, /Bags included/);
  assert.equal(packageOfferFromData(custom).nights, '7');
  assert.equal(packageOfferFromData(custom).departureAirport, 'Newcastle');

  const clearedHtml = renderPackageCard({ ...base, packageCopyOverrides: { ctaSecondary: '' } });
  assert.match(clearedHtml, /Start your booking/);
  assert.doesNotMatch(clearedHtml, /pkg-cta-sub/);
});

test('Blank package and cruise-to-package state isolation do not render ghost cruise fields', () => {
  const { renderPackageCard, packageOfferFromData } = createContext();
  const cruiseOffer = { offerType: 'cruise', operator: 'po', name: 'Eastern Caribbean Islands Fly-Cruise', ship: 'Arvia', ports: 'Barbados • Martinique', tags: 'Adult Only Options · Cuisine', sailingFrom: 'Port of Tyne', price: '1669', ctaSecondary: 'old cruise CTA' };
  const blankPackageHtml = renderPackageCard({ offerType: 'package' });
  ['Eastern Caribbean', 'Arvia', 'Barbados', 'Martinique', 'Port of Tyne', '1669', 'old cruise CTA'].forEach(value => assert.doesNotMatch(blankPackageHtml, new RegExp(value)));
  assert.doesNotMatch(blankPackageHtml, /pkg-operator-missing|Operator not detected/);

  const model = packageOfferFromData({ offerType: 'package', operator: 'jet2', ports: cruiseOffer.ports, tags: cruiseOffer.tags, handLuggage: '2 x 10kg', holdLuggage: '2 x 22kg', roomType: 'Studio' });
  assert.equal(model.departureAirport, '');
  const htmlOutput = renderPackageCard({ offerType: 'package', operator: 'jet2', ports: cruiseOffer.ports, tags: cruiseOffer.tags, handLuggage: '2 x 10kg', holdLuggage: '2 x 22kg', roomType: 'Studio' });
  ['Barbados', 'Martinique', '2 x 10kg', '2 x 22kg', 'Studio', 'Adult Only Options'].forEach(value => assert.doesNotMatch(htmlOutput, new RegExp(value)));
  assert.match(htmlOutput, /Luggage &amp; Transfers Included/);
});


test('Package editing regression: Jet2 defaults, editable text, prices and offer independence render from model', () => {
  const { renderPackageCard, packageOfferFromData, normalisePackageOperatorKey } = createContext();
  assert.equal(normalisePackageOperatorKey('Jet2 Holidays'), 'jet2');
  const fresh = packageOfferFromData({ offerType: 'package', operator: 'Jet2 Holidays' });
  assert.equal(fresh.operator, 'jet2');
  assert.equal(fresh.ctaPrimary, 'Start your booking');
  assert.equal(fresh.ctaSecondary, 'or visit us in store');
  const freshHtml = renderPackageCard({ offerType: 'package', operator: 'Jet2 Holidays' });
  assert.match(freshHtml, /assets\/operator-logos\/jet2-holidays-logo\.png/);
  assert.match(freshHtml, /Start your booking/);
  assert.match(freshHtml, /or visit us in store/);

  const edited = { offerType: 'package', operator: 'jet2', name: 'Costa Adeje, Tenerife', ship: "O'Brien & Sons Hotel, South-Coast", sailingFrom: 'Leeds Bradford', price: '£574pp', totalPrice: '£586pp', resortFee: '+£12pp', ctaPrimary: 'Start your booking', ctaSecondary: 'or visit us in store', incl: 'Luggage, transfers & resort extras included.', adults: '2', children: '0' };
  const model = packageOfferFromData(edited);
  assert.equal(model.ctaSecondary, 'or visit us in store');
  assert.equal(model.leadPrice, '574');
  assert.equal(model.totalPrice, '586');
  assert.equal(model.resortFee, '12pp');
  const editedHtml = renderPackageCard(edited);
  assert.match(editedHtml, /O&#39;Brien &amp; Sons Hotel, South-Coast/);
  assert.match(editedHtml, /£574<span class="pkg-pp">pp<\/span>/);
  assert.match(editedHtml, /\+£12pp Local Resort Fee/);
  assert.match(editedHtml, /£586<span class="pkg-pp">pp<\/span>/);

  const offerOne = renderPackageCard({ offerType: 'package', operator: 'jet2', name: 'Kefalonia', ctaSecondary: 'or visit us in store', price: '574', resortFee: '12' });
  const offerTwo = renderPackageCard({ offerType: 'package', operator: 'jet2', name: 'Majorca', ctaSecondary: 'call into branch', price: '699', resortFee: '25' });
  assert.match(offerOne, /Kefalonia/);
  assert.doesNotMatch(offerOne, /Majorca|call into branch|£699|£25/);
  assert.match(offerTwo, /Majorca/);
  assert.doesNotMatch(offerTwo, /Kefalonia|or visit us in store|£574|£12/);
});

test('Package Offer Details exposes package labels and hides cruise-only controls', () => {
  assert.match(html, /CTA Primary/);
  assert.match(html, /CTA Secondary/);
  assert.match(html, /Hotel \/ Accommodation/);
  assert.match(html, /Departure Airport/);
  assert.match(html, /const cruiseOnly=\["tags","theme_tags","ports","board"\]/);
});
