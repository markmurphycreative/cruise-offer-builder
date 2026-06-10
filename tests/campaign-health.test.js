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
  for (let i = bodyStart; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function createCleanOffer(name) {
  return {
    name,
    ship: 'Arvia',
    price: '1669',
    day: '20',
    month: 'November 2026',
    ports: 'Barbados • Martinique',
    nights: '14',
    board: 'FB',
    boardlbl: 'Full Board',
    operator: 'po',
    tags: 'Adult Only Options · Cuisine · Entertainment · Family',
    _img: 'hero-one.jpg',
    _utm: 'https://example.com/?utm_source=klaviyo'
  };
}

function createHarness({ globals = {}, offers = [{}, {}, {}, {}], cur = 0, headers = {} } = {}) {
  const elements = {
    'g-campaign': { value: globals.campaign || '' },
    'g-date': { value: globals.date || '' },
    'g-airport': { value: globals.airport || '' },
    'g-terms': { value: globals.terms || '' },
    'prod-status-collapsed-summary': { textContent: '' },
    'prod-status-summary': { className: '', innerHTML: '' },
    'prod-status-list': { innerHTML: '' }
  };
  const context = {
    offers,
    cur,
    OPERATOR_HEADERS: headers,
    document: { getElementById: id => elements[id] || null }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('isOfferLoaded'),
    extractFunction('hasCriticalOfferContent'),
    extractFunction('hasOperatorLogo'),
    extractFunction('getOfferReadiness'),
    extractFunction('updateProductionStatus')
  ].join('\n'), context);
  return { context, elements };
}

test('export checklist is renamed in place and retains its existing panel styling', () => {
  assert.match(html, /<details class="prod-status" id="prod-status">\s*<summary class="prod-status-toggle">\s*<span class="prod-status-title">Campaign Health<\/span>\s*<span class="prod-status-collapsed-summary" id="prod-status-collapsed-summary"><\/span>[\s\S]*?<div class="prod-status-summary" id="prod-status-summary"><\/div>\s*<div class="prod-status-list" id="prod-status-list"><\/div>\s*<\/details>/);
  assert.doesNotMatch(html, /<details class="prod-status" id="prod-status" open>/);
  assert.match(html, /\.prod-status\[open\] \.prod-status-collapsed-summary\{display:none;\}/);
  assert.doesNotMatch(html, /<div class="prod-status-title">Export Checklist<\/div>/);
  assert.match(html, /\.prod-status-secondary\{font-size:8px;font-weight:400;opacity:\.60;\}/);
});

test('campaign health reports grouped required checks and updates to ready when known campaign state is complete', () => {
  const { context, elements } = createHarness();
  context.updateProductionStatus();
  assert.equal(elements['prod-status-collapsed-summary'].textContent, '1 blockers · 2 warnings');
  assert.equal(elements['prod-status-summary'].innerHTML, '⚠ Campaign Not Ready<br><span class="prod-status-secondary">1 blocker • 2 warnings</span>');
  assert.equal(elements['prod-status-summary'].className, 'prod-status-summary warn');
  ['Campaign', 'Offers', 'Assets', 'Marketing'].forEach(group => {
    assert.match(elements['prod-status-list'].innerHTML, new RegExp(`<div class="prod-status-group">${group}<\\/div>`));
  });
  assert.match(elements['prod-status-list'].innerHTML, /Campaign name missing/);
  assert.match(elements['prod-status-list'].innerHTML, /Send date missing/);
  assert.match(elements['prod-status-list'].innerHTML, /Departure airport missing/);
  assert.match(elements['prod-status-list'].innerHTML, /Default T&Cs missing/);
  assert.match(elements['prod-status-list'].innerHTML, /No offers loaded/);
  assert.doesNotMatch(elements['prod-status-list'].innerHTML, /0\/4 offers loaded/);
  assert.match(elements['prod-status-list'].innerHTML, /Hero image required for export/);
  assert.match(elements['prod-status-list'].innerHTML, /Operator logo missing/);
  assert.match(elements['prod-status-list'].innerHTML, /Operator not selected/);
  assert.match(elements['prod-status-list'].innerHTML, /UTM missing/);

  Object.assign(elements['g-campaign'], { value: 'summer-cruises' });
  Object.assign(elements['g-date'], { value: '16th May 2026' });
  Object.assign(elements['g-airport'], { value: 'Newcastle' });
  Object.assign(elements['g-terms'], { value: 'T&Cs Apply' });
  context.OPERATOR_HEADERS.po = { pngData: 'assets/operator-logos/po-cruises-logo.png' };
  context.offers.splice(0, 4,
    createCleanOffer('One'),
    createCleanOffer('Two'),
    createCleanOffer('Three'),
    createCleanOffer('Four')
  );
  context.updateProductionStatus();
  assert.equal(elements['prod-status-collapsed-summary'].textContent, 'Ready for export');
  assert.equal(elements['prod-status-summary'].innerHTML, 'Ready for Export<br><span class="prod-status-secondary">No blockers found</span>');
  assert.equal(elements['prod-status-summary'].className, 'prod-status-summary ok');
  assert.match(elements['prod-status-list'].innerHTML, /Offers loaded \(4\/4\)/);
  assert.doesNotMatch(elements['prod-status-list'].innerHTML, /At least one offer loaded/);
  assert.match(elements['prod-status-list'].innerHTML, /Hero image loaded/);
  assert.match(elements['prod-status-list'].innerHTML, /Operator logo present/);
  assert.match(elements['prod-status-list'].innerHTML, /Operator selected/);
  assert.match(elements['prod-status-list'].innerHTML, /UTMs generated/);
});

test('campaign health summary applies singular grammar to its explicit blocker and warning counts', () => {
  const { context, elements } = createHarness({ globals: { campaign: 'campaign' } });
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '⚠ Campaign Not Ready<br><span class="prod-status-secondary">1 blocker • 1 warning</span>');
});

test('campaign health count, hero, operator logo and operator checks react to current builder state', () => {
  const { context, elements } = createHarness({
    globals: { campaign: 'campaign', date: '16th May 2026', airport: 'NCL', terms: 'T&Cs Apply' },
    offers: [{ name: 'One' }, {}, {}, {}],
    headers: { custom: { pngData: null, svgData: null } }
  });
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '⚠ Campaign Not Ready<br><span class="prod-status-secondary">1 blocker • 0 warnings</span>');
  assert.match(elements['prod-status-list'].innerHTML, /<div class="prod-status-item ok"><span>•<\/span><span>Offers loaded \(1\/4\)<\/span><\/div>/);
  assert.match(elements['prod-status-list'].innerHTML, /At least one offer loaded/);

  Object.assign(context.offers[0], { operator: 'custom', _logoCustom: 'data:image/png;base64,logo', _img: 'hero.jpg', _utm: 'https://example.com/utm' });
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '⚠ Campaign Not Ready<br><span class="prod-status-secondary">0 blockers • 0 warnings</span>');
  assert.match(elements['prod-status-list'].innerHTML, /Operator logo present/);

  elements['g-terms'].value = '';
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '⚠ Campaign Not Ready<br><span class="prod-status-secondary">0 blockers • 0 warnings</span>');
  elements['g-terms'].value = 'T&Cs Apply';

  context.offers.push({ name: 'Two' }, { name: 'Three' }, { name: 'Four' });
  context.offers.splice(1, 3);
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, 'Ready for Export<br><span class="prod-status-secondary">No blockers found</span>');
});

test('campaign health renders offer-loading progress without a redundant all-loaded message', () => {
  for (let loaded = 1; loaded <= 4; loaded += 1) {
    const offers = Array.from({ length: 4 }, (_, index) => index < loaded ? { name: `Offer ${index + 1}` } : {});
    const { context, elements } = createHarness({ offers });
    context.updateProductionStatus();
    assert.match(elements['prod-status-list'].innerHTML, new RegExp(`<div class="prod-status-item ok"><span>•<\/span><span>Offers loaded \\(${loaded}\/4\\)<\/span><\/div>`));
    if (loaded < 4) {
      assert.match(elements['prod-status-list'].innerHTML, /At least one offer loaded/);
    } else {
      assert.doesNotMatch(elements['prod-status-list'].innerHTML, /At least one offer loaded/);
    }
    assert.doesNotMatch(elements['prod-status-list'].innerHTML, /No offers loaded/);
  }
});

test('campaign health refresh wiring is passive and does not introduce export blocking or alerts', () => {
  assert.match(html, /id="g-campaign"[^>]*oninput="genAllUtms\(\);updateAllStatus\(\)"/);
  assert.match(html, /id="g-date"[^>]*oninput="genUtm\(\);genStandardUtms\(\);updateAllStatus\(\)"/);
  assert.match(html, /id="g-airport"[^>]*oninput="updateAllStatus\(\)"/);
  assert.match(extractFunction('operatorChanged'), /genUtm\(\); genStandardUtms\(\);\s*try \{ updateAllStatus\(\); \} catch\(e\)\{\}\s*updateExportFilenames\(\);/);
  assert.doesNotMatch(extractFunction('updateProductionStatus'), /alert|confirm|modal|exportCurrent|exportAll|exportCampaignPack/);
});
