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

function extractBlock(startText, endText) {
  const start = html.indexOf(startText);
  assert.notEqual(start, -1, `Could not locate ${startText}`);
  const end = html.indexOf(endText, start);
  assert.notEqual(end, -1, `Could not locate ${endText}`);
  return html.slice(start, end);
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
  const focused = [];
  const scrolled = [];
  const makeClassList = (initial = []) => {
    const set = new Set(initial);
    return {
      contains: cls => set.has(cls),
      toggle(cls, force) {
        const enabled = force === undefined ? !set.has(cls) : !!force;
        if (enabled) set.add(cls); else set.delete(cls);
      }
    };
  };
  const elements = {
    'g-campaign': { value: globals.campaign || '', focus(options) { focused.push(['g-campaign', options]); } },
    'g-date': { value: globals.date || '', focus(options) { focused.push(['g-date', options]); } },
    'g-airport': { value: globals.airport || '', focus(options) { focused.push(['g-airport', options]); } },
    'g-terms': { value: globals.terms || '', focus(options) { focused.push(['g-terms', options]); } },
    'f-operator': { focus(options) { focused.push(['f-operator', options]); } },
    'f-url': { focus(options) { focused.push(['f-url', options]); } },
    'dz-hero': { focus(options) { focused.push(['dz-hero', options]); } },
    'prod-status-collapsed-summary': { textContent: '' },
    'prod-status-summary': { className: '', innerHTML: '' },
    'prod-status-list': { innerHTML: '' }
  };
  const headersByKey = new Map();
  const sections = ['operator-logo', 'hero-image', 'utm-link'].map(key => {
    const body = { classList: makeClassList(['section-body', 'hidden']) };
    const header = { classList: makeClassList(['collapsed']), nextElementSibling: body };
    const section = {
      dataset: { sectionKey: key },
      querySelector(selector) { return selector === '.section-hdr' ? header : null; },
      scrollIntoView(options) { scrolled.push([key, options]); }
    };
    headersByKey.set(key, header);
    return section;
  });
  const campaignBar = { scrollIntoView(options) { scrolled.push(['campaign-details', options]); } };
  const context = {
    offers,
    cur,
    OPERATOR_HEADERS: headers,
    document: {
      getElementById: id => elements[id] || null,
      querySelector(selector) {
        if (selector === '.campaign-bar') return campaignBar;
        const sectionMatch = selector.match(/\.section\[data-section-key="([^"]+)"\]/);
        if (sectionMatch) return sections.find(section => section.dataset.sectionKey === sectionMatch[1]) || null;
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '.section[data-section-key] .section-hdr') return Array.from(headersByKey.values());
        return [];
      }
    },
    setTimeout(fn) { fn(); },
    sv(i) { context.switchedTo = i; context.cur = i; },
    focused,
    scrolled,
    headersByKey
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('setSectionCollapsedByHeader'),
    extractFunction('isOfferLoaded'),
    extractFunction('hasCriticalOfferContent'),
    extractFunction('hasOperatorLogo'),
    extractFunction('getOfferReadiness'),
    extractBlock('const CAMPAIGN_HEALTH_ACTIONS=', 'function updateProductionStatus'),
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
  assert.match(elements['prod-status-list'].innerHTML, /Default T&amp;Cs missing/);
  assert.match(elements['prod-status-list'].innerHTML, /No offers loaded/);
  assert.doesNotMatch(elements['prod-status-list'].innerHTML, /0\/4 offers loaded/);
  assert.match(elements['prod-status-list'].innerHTML, /Offer 1 missing hero image/);
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
  assert.equal(elements['prod-status-summary'].innerHTML, '✓ Ready for Export<br><span class="prod-status-secondary">No blockers found</span>');
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
  assert.match(elements['prod-status-list'].innerHTML, /<div class="prod-status-item ok"><span>✓<\/span><span>Offers loaded \(1\/4\)<\/span><\/div>/);
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
  assert.equal(elements['prod-status-summary'].innerHTML, '✓ Ready for Export<br><span class="prod-status-secondary">No blockers found</span>');
});

test('campaign health renders offer-loading progress without a redundant all-loaded message', () => {
  for (let loaded = 1; loaded <= 4; loaded += 1) {
    const offers = Array.from({ length: 4 }, (_, index) => index < loaded ? { name: `Offer ${index + 1}` } : {});
    const { context, elements } = createHarness({ offers });
    context.updateProductionStatus();
    assert.match(elements['prod-status-list'].innerHTML, new RegExp(`<div class="prod-status-item ok"><span>✓<\/span><span>Offers loaded \\(${loaded}\/4\\)<\/span><\/div>`));
    if (loaded < 4) {
      assert.match(elements['prod-status-list'].innerHTML, /At least one offer loaded/);
    } else {
      assert.doesNotMatch(elements['prod-status-list'].innerHTML, /At least one offer loaded/);
    }
    assert.doesNotMatch(elements['prod-status-list'].innerHTML, /No offers loaded/);
  }
});

test('campaign health missing hero labels prefer ship, then operator, then generic offer', () => {
  let harness = createHarness({ offers: [{ ship: 'Celebrity Apex', operator: 'celebrity' }, {}, {}, {}] });
  harness.context.updateProductionStatus();
  assert.match(harness.elements['prod-status-list'].innerHTML, /Offer 1 \(Celebrity Apex\) missing hero image/);

  harness = createHarness({ offers: [{ operator: 'celebrity' }, {}, {}, {}] });
  harness.context.updateProductionStatus();
  assert.match(harness.elements['prod-status-list'].innerHTML, /Offer 1 \(Celebrity\) missing hero image/);

  harness = createHarness();
  harness.context.updateProductionStatus();
  assert.match(harness.elements['prod-status-list'].innerHTML, /Offer 1 missing hero image/);
});

test('campaign health action mappings open the correct sections and focus repair fields', () => {
  const { context } = createHarness({ offers: [{ name: 'One' }, {}, {}, {}], cur: 0 });
  context.handleCampaignHealthAction('missingHeroImage', 0);
  assert.equal(context.scrolled.at(-1)[0], 'hero-image');
  assert.equal(context.scrolled.at(-1)[1].block, 'start');
  assert.equal(context.headersByKey.get('hero-image').classList.contains('collapsed'), false);
  assert.equal(context.focused.at(-1)[0], 'dz-hero');
  assert.equal(context.focused.at(-1)[1].preventScroll, true);

  context.handleCampaignHealthAction('missingOperatorLogo', 0);
  assert.equal(context.scrolled.at(-1)[0], 'operator-logo');
  assert.equal(context.scrolled.at(-1)[1].block, 'start');
  assert.equal(context.headersByKey.get('operator-logo').classList.contains('collapsed'), false);
  assert.equal(context.focused.at(-1)[0], 'f-operator');
  assert.equal(context.focused.at(-1)[1].preventScroll, true);

  context.handleCampaignHealthAction('operatorNotSelected', 0);
  assert.equal(context.scrolled.at(-1)[0], 'operator-logo');
  assert.equal(context.scrolled.at(-1)[1].block, 'start');
  assert.equal(context.focused.at(-1)[0], 'f-operator');
  assert.equal(context.focused.at(-1)[1].preventScroll, true);

  context.handleCampaignHealthAction('missingUtm', 0);
  assert.equal(context.scrolled.at(-1)[0], 'utm-link');
  assert.equal(context.scrolled.at(-1)[1].block, 'start');
  assert.equal(context.focused.at(-1)[0], 'f-url');
  assert.equal(context.focused.at(-1)[1].preventScroll, true);

  context.handleCampaignHealthAction('missingTerms', null);
  assert.equal(context.scrolled.at(-1)[0], 'campaign-details');
  assert.equal(context.scrolled.at(-1)[1].block, 'start');
  assert.equal(context.focused.at(-1)[0], 'g-terms');
  assert.equal(context.focused.at(-1)[1].preventScroll, true);
});

test('campaign health switches offer before navigating offer-specific issues', () => {
  const { context } = createHarness({ offers: [{}, { ship: 'Queen Anne' }, {}, {}], cur: 0 });
  context.handleCampaignHealthAction('missingHeroImage', 1);
  assert.equal(context.switchedTo, 1);
  assert.equal(context.cur, 1);
  assert.equal(context.scrolled.at(-1)[0], 'hero-image');
  assert.equal(context.scrolled.at(-1)[1].block, 'start');
});

test('campaign health rows support keyboard activation and leave non-actionable rows plain', () => {
  const { context, elements } = createHarness();
  context.updateProductionStatus();
  assert.match(elements['prod-status-list'].innerHTML, /role="button" tabindex="0" onclick="handleCampaignHealthAction\('missingHeroImage',0\)"/);
  assert.match(elements['prod-status-list'].innerHTML, /onkeydown="handleCampaignHealthKeydown\(event,'missingHeroImage',0\)"/);
  assert.match(elements['prod-status-list'].innerHTML, /<div class="prod-status-item warn "><span>⚠<\/span><span>No offers loaded<\/span><\/div>/);

  let prevented = false;
  context.handleCampaignHealthKeydown({ key: 'Enter', preventDefault() { prevented = true; } }, 'missingUtm', 0);
  assert.equal(prevented, true);
  assert.equal(context.scrolled.at(-1)[0], 'utm-link');
  assert.equal(context.scrolled.at(-1)[1].block, 'start');

  prevented = false;
  context.handleCampaignHealthKeydown({ key: ' ', preventDefault() { prevented = true; } }, 'missingDate', null);
  assert.equal(prevented, true);
  assert.equal(context.focused.at(-1)[0], 'g-date');
  assert.equal(context.focused.at(-1)[1].preventScroll, true);
});

test('campaign health refresh wiring is passive and does not introduce export blocking or alerts', () => {
  assert.match(html, /id="g-campaign"[^>]*oninput="genAllUtms\(\);updateAllStatus\(\)"/);
  assert.match(html, /id="g-date"[^>]*oninput="genUtm\(\);genStandardUtms\(\);updateAllStatus\(\)"/);
  assert.match(html, /id="g-airport"[^>]*oninput="updateAllStatus\(\)"/);
  assert.match(extractFunction('operatorChanged'), /genUtm\(\); genStandardUtms\(\);\s*try \{ updateAllStatus\(\); \} catch\(e\)\{\}\s*updateExportFilenames\(\);/);
  assert.doesNotMatch(extractFunction('updateProductionStatus'), /alert|confirm|modal|exportCurrent|exportAll|exportCampaignPack/);
});
