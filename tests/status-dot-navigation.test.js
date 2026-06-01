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

function createCleanOffer(name = 'Caribbean Escape') {
  return {
    name,
    ship: 'Arvia',
    price: '1669',
    day: '20',
    month: 'November 2026',
    ports: 'Barbados • Martinique • St Kitts',
    nights: '14',
    board: 'FB',
    boardlbl: 'Full Board',
    _img: 'hero-one.jpg',
    operator: 'po',
    _utm: 'https://example.com/?utm_source=klaviyo'
  };
}

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    contains: name => classes.has(name),
    add: name => classes.add(name),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    toggle(name, force) {
      if (force === undefined ? !classes.has(name) : force) classes.add(name);
      else classes.delete(name);
    }
  };
}

function createSection(key, { collapsed = true, exportSection = false } = {}) {
  const body = { classList: createClassList(collapsed ? ['section-body', 'hidden'] : ['section-body']) };
  const hdr = { classList: createClassList(collapsed ? ['collapsed'] : []), nextElementSibling: body };
  return {
    key,
    dataset: { sectionKey: key },
    classList: createClassList(),
    offsetWidth: 340,
    scrollCalls: [],
    scrollIntoView(options) { this.scrollCalls.push(options); },
    querySelector(selector) { return !exportSection && selector === '.section-hdr' ? hdr : null; },
    hdr,
    body
  };
}

function createHarness(offers) {
  const hero = createSection('hero-image');
  const logo = createSection('operator-logo');
  const details = createSection('offer-details');
  const csv = createSection('csv-import', { collapsed: false });
  const exportCards = createSection('export-cards', { exportSection: true });
  const sections = [csv, logo, hero, details];
  const timers = [];
  let autosaves = 0;
  const context = {
    offers,
    cur: 0,
    get autosaves() { return autosaves; },
    statusDotHighlightTimer: null,
    OPERATOR_HEADERS: { po: { pngData: 'assets/operator-logos/po-cruises-logo.png' } },
    queueAutosave() { autosaves += 1; },
    clearTimeout() {},
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    document: {
      querySelector(selector) {
        if (selector === '.export-section') return exportCards;
        const match = selector.match(/^\.section\[data-section-key="(.+)"\]$/);
        return match ? sections.find(section => section.key === match[1]) || null : null;
      },
      querySelectorAll(selector) {
        return selector === '.section[data-section-key] .section-hdr' ? sections.map(section => section.hdr) : [];
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('getMissingCriticalOfferFields'),
    extractFunction('hasCriticalOfferContent'),
    extractFunction('hasOperatorLogo'),
    extractFunction('isOfferLoaded'),
    extractFunction('getOfferReadiness'),
    extractFunction('getOfferStatusNavigationIssue'),
    extractFunction('getOfferStatusNavigationTarget'),
    extractFunction('setSectionCollapsedByHeader'),
    extractFunction('getStatusNavigationSection'),
    extractFunction('openStatusNavigationSection'),
    extractFunction('navigateOfferStatus'),
    extractFunction('handleStatusDotKeydown')
  ].join('\n'), context);
  return { context, sections: { csv, logo, hero, details, exportCards }, timers };
}

function createEvent(key) {
  return {
    key,
    prevented: 0,
    stopped: 0,
    preventDefault() { this.prevented += 1; },
    stopPropagation() { this.stopped += 1; }
  };
}

test('status dots retain tooltip titles while exposing click and keyboard navigation hooks', () => {
  for (let index = 0; index < 4; index += 1) {
    assert.match(html, new RegExp(`<span class="status-dot" id="sd${index}" title="No offer loaded" role="button" tabindex="0" aria-label="Navigate to Offer ${index + 1} issue: No offer loaded" onclick="navigateOfferStatus\\(event,${index}\\)" onkeydown="handleStatusDotKeydown\\(event,${index}\\)"><\\/span>`));
  }
  assert.match(html, /\.status-dot\.green\{background:var\(--green\);\}/);
  assert.match(html, /\.status-dot\.amber\{background:var\(--amber\);\}/);
  assert.match(html, /\.status-dot\.red\{background:var\(--red\);\}/);
});

test('navigation issue resolution follows the requested priority while reusing readiness fields', () => {
  const base = createCleanOffer();
  const offers = [
    { ...base, _img: '', operator: '', price: '', ship: '', ports: '', _utm: '' },
    { ...base, operator: 'custom', price: '', name: '', ship: '', ports: '', _utm: '' },
    { ...base, operator: '', price: '', name: '', ship: '', ports: '', _utm: '' },
    { ...base, price: '', name: '', ship: '', ports: '', _utm: '' },
    { ...base, name: '', ship: '', ports: '', _utm: '' },
    { ...base, ship: '', ports: '', _utm: '' },
    { ...base, ports: '', _utm: '' },
    { ...base, _utm: '' }
  ];
  const { context } = createHarness(offers);
  assert.deepEqual(offers.map((_, index) => context.getOfferStatusNavigationIssue(index)), [
    'hero-image-missing',
    'operator-logo-missing',
    'operator-not-selected',
    'price-missing',
    'cruise-name-missing',
    'ship-name-missing',
    'ports-missing',
    'utm-missing'
  ]);
  assert.deepEqual(offers.map((_, index) => context.getOfferStatusNavigationTarget(index)), [
    'hero-image',
    'operator-logo',
    'operator-logo',
    'offer-details',
    'offer-details',
    'offer-details',
    'offer-details',
    'export-cards'
  ]);
});

test('click navigation opens a collapsed accordion, scrolls it near the top, flashes briefly, and leaves offer selection unchanged', () => {
  const { context, sections, timers } = createHarness([createCleanOffer(), { ...createCleanOffer(), _img: '' }]);
  const event = createEvent();
  context.navigateOfferStatus(event, 1);

  assert.equal(event.prevented, 1);
  assert.equal(event.stopped, 1);
  assert.equal(context.cur, 0);
  assert.equal(sections.hero.hdr.classList.contains('collapsed'), false);
  assert.equal(sections.hero.body.classList.contains('hidden'), false);
  assert.equal(sections.csv.hdr.classList.contains('collapsed'), true);
  assert.equal(sections.hero.scrollCalls.length, 1);
  assert.equal(sections.hero.scrollCalls[0].behavior, 'smooth');
  assert.equal(sections.hero.scrollCalls[0].block, 'start');
  assert.equal(sections.hero.classList.contains('status-dot-target'), true);
  assert.equal(context.autosaves, 1);
  assert.equal(timers[0].delay, 1000);

  timers[0].callback();
  assert.equal(sections.hero.classList.contains('status-dot-target'), false);
  assert.equal(sections.hero.hdr.classList.contains('collapsed'), false);
});

test('UTM navigation scrolls and flashes Export Cards without changing accordion state', () => {
  const { context, sections } = createHarness([{ ...createCleanOffer(), _utm: '' }]);
  context.navigateOfferStatus(createEvent(), 0);
  assert.equal(sections.exportCards.scrollCalls.length, 1);
  assert.equal(sections.exportCards.scrollCalls[0].behavior, 'smooth');
  assert.equal(sections.exportCards.scrollCalls[0].block, 'start');
  assert.equal(sections.exportCards.classList.contains('status-dot-target'), true);
  assert.equal(sections.csv.hdr.classList.contains('collapsed'), false);
  assert.equal(context.autosaves, 0);
});

test('ready and unloaded offer dots leave the current UI state untouched', () => {
  const { context, sections, timers } = createHarness([createCleanOffer(), {}]);
  context.navigateOfferStatus(createEvent(), 0);
  context.navigateOfferStatus(createEvent(), 1);
  assert.equal(sections.csv.hdr.classList.contains('collapsed'), false);
  assert.equal(sections.hero.scrollCalls.length, 0);
  assert.equal(sections.logo.scrollCalls.length, 0);
  assert.equal(sections.details.scrollCalls.length, 0);
  assert.equal(sections.exportCards.scrollCalls.length, 0);
  assert.equal(timers.length, 0);
  assert.equal(context.autosaves, 0);
});

test('Enter and Space activate dot navigation while unrelated keys remain passive', () => {
  const { context, sections } = createHarness([{ ...createCleanOffer(), _img: '' }]);
  const unrelated = createEvent('ArrowDown');
  context.handleStatusDotKeydown(unrelated, 0);
  assert.equal(sections.hero.scrollCalls.length, 0);
  assert.equal(unrelated.prevented, 0);

  const enter = createEvent('Enter');
  context.handleStatusDotKeydown(enter, 0);
  assert.equal(sections.hero.scrollCalls.length, 1);
  assert.equal(enter.prevented, 1);
  assert.equal(enter.stopped, 1);

  const space = createEvent(' ');
  context.handleStatusDotKeydown(space, 0);
  assert.equal(sections.hero.scrollCalls.length, 2);
  assert.equal(space.prevented, 1);
  assert.equal(space.stopped, 1);
});

test('restored and reordered offer arrays route from their current content without mutating selection', () => {
  const { context, sections } = createHarness([createCleanOffer(), createCleanOffer('Second Offer')]);
  context.offers = [{ ...createCleanOffer('Restored Offer'), _img: '' }, createCleanOffer('Second Offer')];
  context.navigateOfferStatus(createEvent(), 0);
  assert.equal(sections.hero.scrollCalls.length, 1);
  assert.equal(context.cur, 0);

  context.offers = [context.offers[1], { ...context.offers[0], _img: 'restored-hero.jpg', _utm: '' }];
  assert.equal(context.getOfferStatusNavigationIssue(1), 'utm-missing');
  context.navigateOfferStatus(createEvent(), 1);
  assert.equal(sections.exportCards.scrollCalls.length, 1);
  assert.equal(context.cur, 0);
});
