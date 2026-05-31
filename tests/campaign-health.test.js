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

function createHarness({ globals = {}, offers = [{}, {}, {}, {}], cur = 0, headers = {} } = {}) {
  const elements = {
    'g-campaign': { value: globals.campaign || '' },
    'g-date': { value: globals.date || '' },
    'g-airport': { value: globals.airport || '' },
    'g-terms': { value: globals.terms || '' },
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
    extractFunction('hasOperatorLogo'),
    extractFunction('updateProductionStatus')
  ].join('\n'), context);
  return { context, elements };
}

test('export checklist is renamed in place and retains its existing panel styling', () => {
  assert.match(html, /<div class="prod-status" id="prod-status">\s*<div class="prod-status-title">Campaign Health<\/div>\s*<div class="prod-status-summary" id="prod-status-summary"><\/div>\s*<div class="prod-status-list" id="prod-status-list"><\/div>/);
  assert.doesNotMatch(html, /<div class="prod-status-title">Export Checklist<\/div>/);
  assert.match(html, /\.prod-status-secondary\{font-size:8px;font-weight:500;opacity:\.72;\}/);
});

test('campaign health reports grouped required checks and updates to ready when known campaign state is complete', () => {
  const { context, elements } = createHarness();
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '⚠ Campaign Not Ready<br><span class="prod-status-secondary">10 items need attention</span>');
  assert.equal(elements['prod-status-summary'].className, 'prod-status-summary warn');
  ['Campaign', 'Offers', 'Assets', 'Marketing'].forEach(group => {
    assert.match(elements['prod-status-list'].innerHTML, new RegExp(`<div class="prod-status-group">${group}<\\/div>`));
  });
  assert.match(elements['prod-status-list'].innerHTML, /Campaign name missing/);
  assert.match(elements['prod-status-list'].innerHTML, /Send date missing/);
  assert.match(elements['prod-status-list'].innerHTML, /Departure airport missing/);
  assert.match(elements['prod-status-list'].innerHTML, /Default T&Cs missing/);
  assert.match(elements['prod-status-list'].innerHTML, /0\/4 offers loaded/);
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
    { name: 'One', operator: 'po', _img: 'hero-one.jpg', _utm: 'https://example.com/?utm_source=klaviyo' },
    { name: 'Two' },
    { name: 'Three' },
    { name: 'Four' }
  );
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '✓ Ready for Export<br><span class="prod-status-secondary">All checks passed</span>');
  assert.equal(elements['prod-status-summary'].className, 'prod-status-summary ok');
  assert.match(elements['prod-status-list'].innerHTML, /4\/4 offers loaded/);
  assert.match(elements['prod-status-list'].innerHTML, /Hero image loaded/);
  assert.match(elements['prod-status-list'].innerHTML, /Operator logo present/);
  assert.match(elements['prod-status-list'].innerHTML, /Operator selected/);
  assert.match(elements['prod-status-list'].innerHTML, /UTMs generated/);
});

test('campaign health count, hero, operator logo and operator checks react to current builder state', () => {
  const { context, elements } = createHarness({
    globals: { campaign: 'campaign', date: '16th May 2026', airport: 'NCL', terms: 'T&Cs Apply' },
    offers: [{ name: 'One' }, {}, {}, {}],
    headers: { custom: { pngData: null, svgData: null } }
  });
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '⚠ Campaign Not Ready<br><span class="prod-status-secondary">5 items need attention</span>');
  assert.match(elements['prod-status-list'].innerHTML, /1\/4 offers loaded/);

  Object.assign(context.offers[0], { operator: 'custom', _logoCustom: 'data:image/png;base64,logo', _img: 'hero.jpg', _utm: 'https://example.com/utm' });
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '⚠ Campaign Not Ready<br><span class="prod-status-secondary">1 item needs attention</span>');
  assert.match(elements['prod-status-list'].innerHTML, /Operator logo present/);

  elements['g-terms'].value = '';
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '⚠ Campaign Not Ready<br><span class="prod-status-secondary">2 items need attention</span>');
  elements['g-terms'].value = 'T&Cs Apply';

  context.offers.push({ name: 'Two' }, { name: 'Three' }, { name: 'Four' });
  context.offers.splice(1, 3);
  context.updateProductionStatus();
  assert.equal(elements['prod-status-summary'].innerHTML, '✓ Ready for Export<br><span class="prod-status-secondary">All checks passed</span>');
});

test('campaign health refresh wiring is passive and does not introduce export blocking or alerts', () => {
  assert.match(html, /id="g-campaign"[^>]*oninput="genAllUtms\(\);updateAllStatus\(\)"/);
  assert.match(html, /id="g-date"[^>]*oninput="genUtm\(\);genStandardUtms\(\);updateAllStatus\(\)"/);
  assert.match(html, /id="g-airport"[^>]*oninput="updateAllStatus\(\)"/);
  assert.match(extractFunction('operatorChanged'), /genUtm\(\); genStandardUtms\(\);\s*try \{ updateAllStatus\(\); \} catch\(e\)\{\}\s*updateExportFilenames\(\);/);
  assert.doesNotMatch(extractFunction('updateProductionStatus'), /alert|confirm|modal|exportCurrent|exportAll|exportCampaignPack/);
});
