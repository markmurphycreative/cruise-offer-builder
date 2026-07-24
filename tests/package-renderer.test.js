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

function parseAttributes(raw) {
  const attrs = {};
  raw.replace(/([\w:-]+)="([^"]*)"/g, (_, name, value) => { attrs[name] = value; return ''; });
  return attrs;
}
function parsePackageCardDocument(cardHtml) {
  class Element {
    constructor(tagName, attrs, parentElement = null) {
      this.tagName = tagName.toUpperCase();
      this.attributes = attrs;
      this.parentElement = parentElement;
      this.children = [];
      this.className = attrs.class || '';
    }
    get outerHTML() { return this._outerHTML || ''; }
    get previousElementSibling() { const siblings = this.parentElement ? this.parentElement.children : []; return siblings[siblings.indexOf(this) - 1] || null; }
    get nextElementSibling() { const siblings = this.parentElement ? this.parentElement.children : []; return siblings[siblings.indexOf(this) + 1] || null; }
    getAttribute(name) { return this.attributes[name] || null; }
    matches(selector) { return selector.split('.').filter(Boolean).every(cls => this.className.split(/\s+/).includes(cls)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const parts = selector.trim().split(/\s+/);
      const out = [];
      const walk = node => {
        if (matchesSelectorPath(node, parts)) out.push(node);
        node.children.forEach(walk);
      };
      walk(this);
      return out;
    }
  }
  function matchesSimple(node, simple) {
    const attrMatch = simple.match(/^([\w-]+)?\[([^=]+)="([^"]+)"\]$/);
    if (attrMatch) return (!attrMatch[1] || node.tagName.toLowerCase() === attrMatch[1]) && node.getAttribute(attrMatch[2]) === attrMatch[3];
    const tag = simple.match(/^[\w-]+/);
    if (tag && node.tagName.toLowerCase() !== tag[0]) return false;
    return (simple.match(/\.[\w-]+/g) || []).every(cls => node.className.split(/\s+/).includes(cls.slice(1)));
  }
  function matchesSelectorPath(node, parts) {
    let current = node;
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      while (current && !matchesSimple(current, parts[i])) current = current.parentElement;
      if (!current) return false;
      current = current.parentElement;
    }
    return true;
  }
  const root = new Element('root', {});
  const stack = [root];
  const tokenRe = /<\/?[^>]+>/g;
  let match;
  while ((match = tokenRe.exec(cardHtml))) {
    const token = match[0];
    if (token.startsWith('</')) { stack.pop(); continue; }
    const tag = token.match(/^<([\w-]+)/)[1];
    const el = new Element(tag, parseAttributes(token), stack[stack.length - 1]);
    el._outerHTML = token.endsWith('/>') || tag === 'img' ? token : cardHtml.slice(match.index, findClosingTagEnd(cardHtml, tag, match.index));
    stack[stack.length - 1].children.push(el);
    if (!['img', 'br'].includes(tag) && !token.endsWith('/>')) stack.push(el);
  }
  return root;
}
function findClosingTagEnd(htmlText, tag, start) {
  const close = htmlText.indexOf(`</${tag}>`, start);
  return close === -1 ? htmlText.indexOf('>', start) + 1 : close + tag.length + 3;
}
function computePackageLogoStyles(card, logo) {
  const css = html.slice(html.indexOf('/* Package card renderer */'), html.indexOf('.cc .header-block img'));
  const styles = {};
  for (const block of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const selector = block[1].trim();
    if (!selector.split(',').some(part => selectorMatchesCardLogo(part.trim(), card, logo))) continue;
    for (const decl of block[2].split(';')) {
      const [prop, value] = decl.split(':').map(part => part && part.trim());
      if (prop && value) styles[prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
  }
  return styles;
}
function selectorMatchesCardLogo(selector, card, logo) {
  if (selector === '.pc .pkg-operator-logo') return card.matches('pc') && logo.matches('pkg-operator-logo');
  if (selector === '.pc.pkg-jet2 .pkg-operator-logo--jet2' || selector === '.pc.pkg-jet2.pkg-jet2-couples .pkg-operator-logo--jet2') return card.matches('pc') && card.matches('pkg-jet2') && logo.matches('pkg-operator-logo--jet2');
  if (selector === '.pc .pkg-operator-logo--tui') return card.matches('pc') && logo.matches('pkg-operator-logo--tui');
  if (selector === '.pc .pkg-operator-logo--easyjet') return card.matches('pc') && logo.matches('pkg-operator-logo--easyjet');
  return false;
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
  assert.equal(PACKAGE_OPERATORS.jet2.skin.header, 'assets/package-skins/jet2/header-couples.png');
  assert.equal(PACKAGE_OPERATORS.jet2.skin.headerCouples, 'assets/package-skins/jet2/header-couples.png');
  assert.equal(PACKAGE_OPERATORS.jet2.skin.headerFamily, 'assets/package-skins/jet2/header-family.png');
  assert.equal(PACKAGE_OPERATORS.jet2.skin.footer, 'assets/package-skins/jet2/footer.png');
  assert.equal(PACKAGE_OPERATORS.easyjet.logo, 'assets/operator-logos/easyjet-logo.png');
  assert.equal(PACKAGE_OPERATORS.easyjet.ctaText, 'Start your booking');
});

test('Package operator logos use operator-specific natural-aspect placement classes', () => {
  assert.match(html, /\.pc \.pkg-operator-logo\{[^}]*display:block;[^}]*position:absolute;[^}]*width:auto;[^}]*height:auto;[^}]*object-fit:contain;[^}]*pointer-events:none;/);
  assert.match(html, /\.pc \.pkg-operator-logo--tui\{left:28px;bottom:14px;width:300px;\}/);
  assert.match(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-operator-logo--jet2\{[^}]*left:calc\(var\(--pkg-left\) - 89px\);[^}]*top:570\.5px;[^}]*width:506px;[^}]*transform:translateY\(-50%\);[^}]*\}/);
  assert.doesNotMatch(html, /\.pc \.pkg-operator-logo--jet2\{left:150px;bottom:88px;width:310px;\}/);
  assert.match(html, /\.pc\.pkg-jet2\{--pkg-left:98px;\}/);
  assert.match(html, /\.pc\.pkg-jet2\.pkg-jet2-couples\{--pkg-left:76px;\}/);
  assert.match(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-body\{[^}]*height:626px;[^}]*padding:0;[^}]*position:relative;[^}]*display:block;/);
  assert.match(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-details\{[^}]*position:absolute;[^}]*left:var\(--pkg-left\);[^}]*top:299px;/);
  assert.match(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-pricing\{[^}]*position:absolute;[^}]*right:76px;[^}]*top:0;[^}]*width:500px;[^}]*height:626px;/);
  assert.match(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-pricing \.pkg-lead\{[^}]*position:absolute;[^}]*right:0;[^}]*top:116px;[^}]*margin:0;[^}]*width:500px;[^}]*\}/);
  assert.match(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-pricing \.pkg-total\{[^}]*position:absolute;[^}]*right:0;[^}]*top:450px;[^}]*margin:0;[^}]*width:500px;[^}]*\}/);
  assert.match(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-pricing:not\(\.pkg-pricing--with-fee\) \.pkg-total\{top:466px;\}/);
  assert.doesNotMatch(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-pricing \.pkg-lead\{[^}]*top:106px;/, 'Jet2 resort-fee lead price should be moved down another 10px from the previous top');
  assert.doesNotMatch(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-pricing \.pkg-total\{[^}]*top:438px;/, 'Jet2 resort-fee total price should be moved down another 10px from the previous top');
  assert.doesNotMatch(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-pricing:not\(\.pkg-pricing--with-fee\) \.pkg-total\{top:461px;\}/, 'Jet2 standard price block should be moved down another 5px from the previous top');
  assert.match(html, /\.pc\.pkg-jet2 \.pkg-head\{height:154px;[^}]*border:0;\}/);
  assert.match(html, /\.pc\.pkg-jet2 \.pkg-skin-header\{height:auto;object-fit:contain;object-position:top center;\}/);
  assert.match(html, /\.pc\.pkg-jet2 \.pkg-fee\{color:#000;\}/);
  assert.match(html, /\.pc \.pkg-operator-logo--easyjet\{left:6px;bottom:-27px;width:430px;\}/);

  const { renderPackageCard } = createContext();
  assert.match(renderPackageCard({ operator: 'tui' }), /pkg-operator-logo pkg-operator-logo--tui/);
  const jet2Html = renderPackageCard({ operator: 'jet2' });
  assert.match(jet2Html, /<img class="pkg-operator-logo pkg-operator-logo--jet2" src="assets\/operator-logos\/jet2-holidays-logo\.png" alt="" role="presentation" aria-hidden="true">/);
  assert.match(jet2Html, /<div class="pkg-head"><img class="pkg-skin-header" src="assets\/package-skins\/jet2\/header-couples\.png"/);
  assert.equal((jet2Html.match(/assets\/operator-logos\/jet2-holidays-logo\.png/g) || []).length, 1);
  assert.match(jet2Html, /pkg-skin-header/);
  assert.match(jet2Html, /header-couples\.png/);
  assert.doesNotMatch(jet2Html, /pkg-head-operator-logo|header-family\.png/);
  assert.match(renderPackageCard({ operator: 'easyjet' }), /pkg-operator-logo pkg-operator-logo--easyjet/);
});


test('Jet2 operator logo renderer output and live package selector support visible details placement', () => {
  const { renderPackageCard, renderPackageOperatorLogo, PACKAGE_OPERATORS } = createContext();
  const cardHtml = renderPackageCard({
    operator: 'jet2',
    name: 'Lassi, Kefalonia',
    ship: 'Sunset Paradise Resort',
    nights: '7',
    boardlbl: 'Bed & Breakfast',
    day: '21st',
    month: 'July 2026',
    sailingFrom: 'Newcastle',
    incl: 'Luggage & Transfers Included',
    price: '574pp',
    totalPrice: '1148',
    basis: 'Based on 2 Adults Sharing'
  });
  const document = parsePackageCardDocument(cardHtml);
  const card = document.querySelector('.pc');
  const logo = document.querySelector('.pkg-operator-logo--jet2');
  assert.equal(card.className, 'pc pkg-jet2 pkg-jet2-couples');
  assert.ok(logo, 'Jet2 logo should be present');
  assert.equal(document.querySelectorAll('img[src="assets/operator-logos/jet2-holidays-logo.png"]').length, 1);
  assert.equal(logo.parentElement.className, 'pkg-jet2-couples-content');
  assert.equal(logo.parentElement.parentElement.className, 'pkg-body');
  assert.match(logo.previousElementSibling.outerHTML, /pkg-detail-text/);
  assert.ok(logo.previousElementSibling.querySelector('.pkg-inclusion'));
  assert.equal(logo.className, 'pkg-operator-logo pkg-operator-logo--jet2');
  assert.equal(logo.getAttribute('src'), 'assets/operator-logos/jet2-holidays-logo.png');
  assert.ok(document.querySelector('.pkg-body .pkg-operator-logo--jet2'));
  assert.equal(document.querySelector('.pkg-details .pkg-operator-logo--jet2'), null);
  assert.equal(document.querySelector('.pkg-head .pkg-operator-logo--jet2'), null);
  assert.equal(document.querySelector('.pkg-head img[src="assets/operator-logos/jet2-holidays-logo.png"]'), null);
  assert.ok(document.querySelector('.pkg-skin-header'));
  assert.ok(document.querySelector('.pkg-head img[src="assets/operator-logos/dawson-and-sanderson-logo.png"]'));
  assert.equal(renderPackageOperatorLogo(PACKAGE_OPERATORS.jet2, 'jet2'), logo.outerHTML);

  const computed = computePackageLogoStyles(card, logo);
  assert.equal(computed.position, 'absolute');
  assert.equal(computed.display, 'block');
  assert.equal(computed.left, 'calc(var(--pkg-left) - 89px)');
  assert.equal(computed.top, '570.5px');
  assert.equal(computed.transform, 'translateY(-50%)');
  assert.equal(computed.width, '506px');
  assert.equal(computed.height, 'auto');
  assert.equal(computed.objectFit, 'contain');
  assert.equal(computed.pointerEvents, 'none');
});

test('Jet2 logo belongs to the left details column while TUI and easyJet keep direct-card logo placement', () => {
  const { renderPackageCard, renderPackageOperatorLogo, PACKAGE_OPERATORS } = createContext();
  assert.match(html, /\.pc\{[^}]*position:relative;/, '.pc should remain the positioned containing block');
  assert.match(html, /\.pc \.pkg-body\{[^}]*position:relative;/, '.pkg-body should keep its positioning for existing layout');
  assert.match(html, /\.pc\.pkg-jet2\.pkg-jet2-couples \.pkg-jet2-couples-content\{[^}]*transform:translateY\(-38px\);/, 'Jet2 couples content should move as one grouped translation');
  for (const operator of ['tui', 'easyjet']) {
    const cardHtml = renderPackageCard({ operator, name: 'Destination', ship: 'Hotel', nights: '7', boardlbl: 'Self Catering', price: '499pp' });
    const document = parsePackageCardDocument(cardHtml);
    const logo = document.querySelector(`.pkg-operator-logo--${operator}`);
    assert.ok(logo, `${operator} shared logo should be present`);
    assert.equal(logo.outerHTML, renderPackageOperatorLogo(PACKAGE_OPERATORS[operator], operator));
    assert.equal(document.querySelectorAll('.pkg-operator-logo').length, 1);
    assert.equal(logo.parentElement.className, `pc pkg-${operator}`);
    assert.equal(logo.previousElementSibling.className, 'pkg-body');
    assert.equal(logo.nextElementSibling.className, 'pkg-footer');
    assert.equal(document.querySelector(`.pkg-body .pkg-operator-logo--${operator}`), null);
    assert.equal(document.querySelector(`.pkg-details .pkg-operator-logo--${operator}`), null);
  }
  const jet2Html = renderPackageCard({ operator: 'jet2', name: 'Destination', ship: 'Hotel', nights: '7', boardlbl: 'Self Catering', price: '499pp' });
  const jet2Doc = parsePackageCardDocument(jet2Html);
  const jet2Logo = jet2Doc.querySelector('.pkg-operator-logo--jet2');
  assert.equal(jet2Logo.parentElement.className, 'pkg-jet2-couples-content');
  assert.equal(jet2Logo.parentElement.parentElement.className, 'pkg-body');
  assert.equal(jet2Doc.querySelectorAll('.pkg-operator-logo').length, 1);
  assert.match(jet2Html, /<div class="pkg-jet2-couples-content"><div class="pkg-destination">[\s\S]*<div class="pkg-details"><div class="pkg-detail-text">[\s\S]*<span class="pkg-detail-line pkg-inclusion">Luggage &amp; Transfers Included<\/span>[\s\S]*<\/div><\/div><img class="pkg-operator-logo pkg-operator-logo--jet2"/);
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
  assert.equal(model.leadPrice, '646');
  assert.equal(model.totalPrice, '646');
  assert.equal(model.bookingTotal, '');
  assert.equal(model.localFeePerPerson, '10');
  assert.equal(model.resortFee, '10pp');
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
  assert.match(htmlOutput, /£323<span class="pkg-pp">pp<\/span>/);
  assert.match(htmlOutput, /£335<span class="pkg-pp">pp<\/span>/);
  assert.match(htmlOutput, /<div class="pkg-price-label">Total Price<\/div>/);
  assert.match(htmlOutput, /assets\/package-skins\/easyjet\/footer\.png/);
});



test('Package couples renderer contract is shared by Jet2, TUI and easyJet', () => {
  const { renderPackageCard, packageOfferFromData } = createContext();
  ['jet2', 'tui', 'easyjet'].forEach(operator => {
    const standard = renderPackageCard({ operator, name: 'Destination', ship: 'Hotel', price: '699pp', totalPrice: '1398', adults: '2', children: '0' });
    assert.match(standard, /£699<span class="pkg-pp">pp<\/span>/, operator);
    assert.doesNotMatch(standard, /£1,398|Total Price|pkg-fee/, operator);

    const feeModel = packageOfferFromData({ operator, name: 'Lassi, Kefalonia', ship: 'Sunset Paradise Resort', price: '574', totalPrice: '1148', localFeeAmount: '24', localFeeType: 'total', adults: '2', children: '0' });
    assert.equal(feeModel.bookingTotal, '1148', operator);
    assert.equal(feeModel.leadPrice, '574', operator);
    assert.equal(feeModel.localFeeAmount, '24', operator);
    assert.equal(feeModel.localFeeType, 'total', operator);
    assert.equal(feeModel.localFeePerPerson, '12', operator);
    const fee = renderPackageCard(feeModel);
    assert.match(fee, /£574<span class="pkg-pp">pp<\/span>/, operator);
    assert.match(fee, /\+£12pp (?:Local Resort Fee|Total Local Resort Fee)/, operator);
    assert.match(fee, /£586<span class="pkg-pp">pp<\/span>/, operator);
    assert.doesNotMatch(fee, /£1,148/, operator);
    assert.match(fee, /<div class="pkg-price-label">Total Price<\/div>/, operator);
  });
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
  assert.match(htmlOutput, /assets\/package-skins\/jet2\/header-family\.png/);
  assert.match(htmlOutput, /assets\/operator-logos\/jet2-holidays-logo\.png/);
});


test('Jet2 couples render with fee uses canonical assets, compact inclusions and combined total label', () => {
  const { renderPackageCard } = createContext();
  const out = renderPackageCard({ operator: 'jet2', name: 'Kefalonia, Greece', ship: 'Sunset Paradise Resort', nights: '7', boardlbl: 'Bed & Breakfast', day: '21', month: 'July 2026', sailingFrom: 'Newcastle', price: '574pp', leadPrice: '574pp', totalPrice: '1148', localFeeAmount: '24', localFeeType: 'total', localFeePerPerson: '12', displayTotalPerPerson: '586', adults: '2', children: '0', handLuggage: '2 x 10kg', holdLuggage: '2 x 22kg', transfers: 'Coach transfers included' });
  assert.match(out, /assets\/package-skins\/jet2\/header-couples\.png/);
  assert.match(out, /assets\/package-skins\/jet2\/footer\.png/);
  assert.match(out, /assets\/operator-logos\/jet2-holidays-logo\.png/);
  assert.match(out, /Kefalonia, Greece/);
  assert.match(out, /Sunset Paradise Resort/);
  assert.match(out, /21st July 2026/);
  assert.match(out, /Newcastle Flights/);
  assert.match(out, /Luggage &amp; Transfers Included/);
  assert.match(out, /£574<span class="pkg-pp">pp<\/span>/);
  assert.match(out, /\+£12pp Local Resort Fee/);
  assert.match(out, /£586<span class="pkg-pp">pp<\/span>/);
  assert.match(out, /<div class="pkg-price-label">Total Price<\/div>/);
  assert.match(out, /£574<span class="pkg-pp">pp<\/span>[\s\S]*\+£12pp Local Resort Fee[\s\S]*£586<span class="pkg-pp">pp<\/span>[\s\S]*Total Price[\s\S]*Based on 2 Adults Sharing/);
  assert.match(out, /Based on 2 Adults Sharing/);
  assert.match(out, /<div class="pkg-footer-cta"><div class="pkg-cta-main">Start your booking<\/div><div class="pkg-cta-sub">or visit us in store<\/div><\/div>/);
  const edited = renderPackageCard({ operator: 'jet2', ctaPrimary: 'Book online', ctaSecondary: '', packageCopyOverrides: { ctaPrimary: 'Book online', ctaSecondary: '' }, name: 'Kefalonia', ship: 'Hotel', price: '574pp', adults: '2', children: '0' });
  assert.match(edited, /<div class="pkg-cta-main">Book online<\/div>/);
  assert.doesNotMatch(edited, /<div class="pkg-cta-sub">/);
  const blankPriceCopy = renderPackageCard({ operator: 'jet2', price: '574pp', priceLabel: '', basis: '', incl: '', ctaPrimary: '', ctaSecondary: '' });
  assert.match(blankPriceCopy, /Based on 2 Adults Sharing/);
  assert.match(blankPriceCopy, /Start your booking/);
  assert.match(blankPriceCopy, /Luggage &amp; Transfers Included/);
  const deliberateBlankCopy = renderPackageCard({ operator: 'jet2', price: '574pp', packageCopyOverrides: { priceLabel: '', basis: '', inclusions: '', ctaSecondary: '' } });
  assert.doesNotMatch(deliberateBlankCopy, /pkg-price-label|pkg-basis|pkg-cta-sub|Luggage &amp; Transfers Included/);
  assert.doesNotMatch(out, /Our Rating|TripAdvisor|176 Reviews|Holiday Summary|Flight Details|Going out|Coming back|NCL|EFL|Hand Luggage Included|Hold Luggage Included|Coach Transfers/);
});

test('Jet2 couples derive per-person resort fee from total local fee and party size', () => {
  const { renderPackageCard, packageOfferFromData } = createContext();
  const model = packageOfferFromData({ operator: 'jet2', name: 'Lassi, Kefalonia', ship: 'Sunset Paradise Resort', price: '574', localFeeAmount: '24', localFeeType: 'total', localFeeWording: 'Approximately £24 total tourist tax payable locally', adults: '2', children: '0' });
  assert.equal(model.leadPrice, '574');
  assert.equal(model.resortFee, '12pp');
  assert.equal(model.totalPrice, '574');
  assert.equal(model.bookingTotal, '');
  const out = renderPackageCard({ operator: 'jet2', name: 'Lassi, Kefalonia', ship: 'Sunset Paradise Resort', price: '574', localFeeAmount: '24', localFeeType: 'total', localFeeWording: 'Approximately £24 total tourist tax payable locally', adults: '2', children: '0' });
  assert.match(out, /£574<span class="pkg-pp">pp<\/span>/);
  assert.match(out, /\+£12pp Local Resort Fee/);
  assert.match(out, /£586<span class="pkg-pp">pp<\/span>/);
  assert.match(out, /<div class="pkg-price-label">Total Price<\/div>/);
  assert.doesNotMatch(out, /Approximately £24 total tourist tax payable locally/);
});


test('Jet2 White City couples render keeps per-person pricing without total label', () => {
  const { renderPackageCard } = createContext();
  const out = renderPackageCard({ operator: 'jet2', name: 'Antalya, Turkey', ship: 'White City Beach Hotel', nights: '7', boardlbl: 'All Inclusive', day: '7th', month: 'July 2026', sailingFrom: 'Leeds Bradford', flightDisplay: 'Leeds Bradford Flights', price: '703', leadPrice: '703', totalPrice: '1406', bookingTotal: '1406', priceLabel: '', adults: '2', children: '0' });
  assert.match(out, /pkg-jet2 pkg-jet2-couples/);
  assert.match(out, /assets\/package-skins\/jet2\/header-couples\.png/);
  assert.match(out, /White City Beach Hotel/);
  assert.match(out, /Antalya, Turkey/);
  assert.match(out, /Leeds Bradford Flights/);
  assert.match(out, /£703<span class="pkg-pp">pp<\/span>[\s\S]*Based on 2 Adults Sharing/);
  assert.equal((out.match(/class="pkg-price /g) || []).length, 1);
  assert.doesNotMatch(out, />Total Price</);
  assert.doesNotMatch(out, /£1,406|£1406/);
  assert.doesNotMatch(out, /bookingTotal|Total Price/);
});

test('Jet2 couples render without fee has a single lower price block and no empty fee line', () => {
  const { renderPackageCard } = createContext();
  const out = renderPackageCard({ operator: 'jet2', name: 'Playa De Las Americas, Tenerife', ship: 'Servatur Caribe Apartments', nights: '7', boardlbl: 'Self Catering', day: '15', month: 'July 2026', sailingFrom: 'Leeds Bradford', price: '499pp', leadPrice: '499pp', adults: '2', children: '0' });
  assert.match(out, /assets\/package-skins\/jet2\/header-couples\.png/);
  assert.equal((out.match(/class="pkg-price /g) || []).length, 1);
  assert.match(out, /£499<span class="pkg-pp">pp<\/span>[\s\S]*Based on 2 Adults Sharing/);
  assert.match(out, /Leeds Bradford Flights/);
  assert.doesNotMatch(out, /pkg-fee|Local Resort Fee|£0/);
});

test('Jet2 family render total price only and free child place controls family header', () => {
  const { renderPackageCard } = createContext();
  const family = renderPackageCard({ operator: 'jet2', name: 'Majorca', ship: 'Family Resort', totalPrice: '2209', price: '699pp', adults: '2', children: '1', freeChildPlace: false });
  assert.match(family, /£2,209<span class="pkg-pp"><\/span>/);
  assert.doesNotMatch(family, /Total Price/);
  assert.match(family, /Based on 2 Adults &amp; 1 Child Sharing/);
  assert.doesNotMatch(family, /header-family\.png/);
  const familyFee = renderPackageCard({ operator: 'jet2', name: 'Majorca', ship: 'Family Resort', totalPrice: '2209', localFeeAmount: '24', localFeeType: 'total', adults: '2', children: '1', basis: 'Based on 2 Adults & 1 Child Sharing' });
  assert.match(familyFee, /£2,209<span class="pkg-pp"><\/span>[\s\S]*\+£24 total local resort fee[\s\S]*£2,233<span class="pkg-pp"><\/span>[\s\S]*Total Price[\s\S]*Based on 2 Adults &amp; 1 Child Sharing/);
  assert.doesNotMatch(familyFee, /£2,233<span class="pkg-pp">pp<\/span>/);
  const freeChild = renderPackageCard({ operator: 'jet2', name: 'Majorca', ship: 'Family Resort', totalPrice: '2209', adults: '2', children: '1', freeChildPlace: true });
  assert.match(freeChild, /assets\/package-skins\/jet2\/header-family\.png/);
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
  assert.match(out, /Based on two grown-ups/);
  assert.match(out, /Reserve today/);
  assert.match(out, /then pop in store/);
});


test('Package copy overrides distinguish absent, custom and deliberately blank values', () => {
  const { renderPackageCard, packageOfferFromData } = createContext();
  const base = { operator: 'jet2', offerType: 'package', name: 'Kefalonia, Greece', ship: 'Sunset Paradise Resort', nights: '7', sailingFrom: 'Newcastle', price: '574pp', adults: '2', children: '0' };
  const defaultHtml = renderPackageCard(base);
  assert.match(defaultHtml, /assets\/operator-logos\/jet2-holidays-logo\.png/);
  assert.match(defaultHtml, /assets\/package-skins\/jet2\/header-couples\.png/);
  assert.match(defaultHtml, /assets\/package-skins\/jet2\/footer\.png/);
  assert.match(defaultHtml, /7 Nights/);
  assert.match(defaultHtml, /Newcastle Flights/);
  assert.match(defaultHtml, /Start your booking/);
  assert.match(defaultHtml, /or visit us in store/);
  assert.match(defaultHtml, /Based on 2 Adults Sharing/);
  assert.match(defaultHtml, /Luggage &amp; Transfers Included/);

  const oldCampaignHtml = renderPackageCard({ ...base, ctaPrimary: '', ctaSecondary: '', priceLabel: '', basis: '', incl: '', packageNightsLabel: '', packageFlightsLabel: '' });
  assert.match(oldCampaignHtml, /7 Nights/);
  assert.match(oldCampaignHtml, /Newcastle Flights/);
  assert.match(oldCampaignHtml, /Start your booking/);
  assert.match(oldCampaignHtml, /or visit us in store/);
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
  const repairedCtaModel = packageOfferFromData({ ...edited, ctaSecondary: 'orvisitusinstore' });
  assert.equal(repairedCtaModel.ctaSecondary, 'or visit us in store');
  assert.equal(model.leadPrice, '574');
  assert.equal(model.totalPrice, '574');
  assert.equal(model.bookingTotal, '');
  assert.equal(model.resortFee, '12pp');
  const editedHtml = renderPackageCard(edited);
  assert.match(editedHtml, /O&#39;Brien &amp; Sons Hotel, South-Coast/);
  assert.match(editedHtml, /£574<span class="pkg-pp">pp<\/span>/);
  assert.match(editedHtml, /\+£12pp Local Resort Fee/);
  assert.match(editedHtml, /£586<span class="pkg-pp">pp<\/span>/);
  assert.match(editedHtml, /<div class="pkg-price-label">Total Price<\/div>/);

  const offerOne = renderPackageCard({ offerType: 'package', operator: 'jet2', name: 'Kefalonia', ctaSecondary: 'or visit us in store', price: '574', resortFee: '12' });
  const offerTwo = renderPackageCard({ offerType: 'package', operator: 'jet2', name: 'Majorca', ctaSecondary: 'call into branch', price: '699', resortFee: '25' });
  assert.match(offerOne, /Kefalonia/);
  assert.doesNotMatch(offerOne, /Majorca|call into branch|£699|£25/);
  assert.match(offerTwo, /Majorca/);
  assert.doesNotMatch(offerTwo, /Kefalonia|or visit us in store|£574|£12/);
});


test('Jet2 package renderer contains Jet2 body columns in a fixed grid content area', () => {
  const { renderPackageCard } = createContext();
  const css = html.slice(html.indexOf('/* Package card renderer */'), html.indexOf('.cc .header-block img'));
  assert.doesNotMatch(css, /\.pc \.pkg-detail-spacer/);
  assert.doesNotMatch(css, /\.pc \.pkg-pricing > \.pkg-total:last-child\{margin-top:auto;\}/);
  ['Bed & Breakfast', 'Half Board', 'All Inclusive'].forEach(boardBasis => {
    const card = renderPackageCard({ offerType: 'package', operator: 'jet2', name: 'Lassi, Kefalonia', ship: 'Sunset Paradise Resort', nights: '7', boardBasis, day: '21', month: 'July 2026', sailingFrom: 'Newcastle', price: '574', resortFee: '12', totalPrice: '586', basis: 'Based on 2 Adults Sharing', incl: 'Luggage & Transfers Included' });
    assert.match(card.replace(/&amp;/g, '&'), new RegExp('7 Nights[\\s\\S]*' + boardBasis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*21st July 2026[\\s\\S]*Newcastle Flights[\\s\\S]*Luggage & Transfers Included[\\s\\S]*assets/operator-logos/jet2-holidays-logo.png'));
    assert.doesNotMatch(card, /pkg-detail-spacer/);
    assert.match(card, /£574<span class="pkg-pp">pp<\/span>[\s\S]*\+£12pp Local Resort Fee[\s\S]*Based on 2 Adults Sharing/);
    assert.match(card, /£586<span class="pkg-pp">pp<\/span>/);
    assert.match(card, /<div class="pkg-price-label">Total Price<\/div>/);
  });
});

test('Package Offer Details exposes package labels and hides cruise-only controls', () => {
  assert.match(html, /CTA Primary/);
  assert.match(html, /CTA Secondary/);
  assert.match(html, /Hotel \/ Accommodation/);
  assert.match(html, /Departure Airport/);
  assert.match(html, /const cruiseOnly=\["tags","theme_tags","ports","board"\]/);
});
