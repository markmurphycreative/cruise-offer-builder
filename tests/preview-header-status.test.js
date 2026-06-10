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

function createCleanOffer(name = 'Caribbean Escape') {
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
    _img: 'hero.jpg',
    _utm: 'https://example.com/?utm_source=klaviyo'
  };
}

function createHarness({ offers = [{}, {}, {}, {}], cur = 0, viewMode = 'all' } = {}) {
  const title = { textContent: '' };
  const context = {
    offers,
    cur,
    viewMode,
    OPERATOR_HEADERS: { po: { pngData: 'assets/operator-logos/po-cruises-logo.png' } },
    document: { getElementById: id => id === 'preview-title' ? title : null }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('isOfferLoaded'),
    extractFunction('hasCriticalOfferContent'),
    extractFunction('hasOperatorLogo'),
    extractFunction('getOfferReadiness'),
    extractFunction('getPreviewOfferStatusLabel'),
    extractFunction('updatePreviewTitle')
  ].join('\n'), context);
  return { context, title };
}

test('All 4 and Email preview headers expose compact loaded-offer progress', () => {
  const offers = [createCleanOffer('One'), createCleanOffer('Two'), {}, {}];
  const { context, title } = createHarness({ offers });

  context.updatePreviewTitle();
  assert.equal(title.textContent, 'ALL 4 CARDS • 2/4 LOADED');

  context.viewMode = 'email';
  context.updatePreviewTitle();
  assert.equal(title.textContent, 'EMAIL PREVIEW • 2/4 LOADED');

  context.offers.splice(2, 2, createCleanOffer('Three'), createCleanOffer('Four'));
  context.updatePreviewTitle();
  assert.equal(title.textContent, 'EMAIL PREVIEW • 4/4 LOADED');

  context.viewMode = 'all';
  context.offers.splice(0, 4, {}, {}, {}, {});
  context.updatePreviewTitle();
  assert.equal(title.textContent, 'ALL 4 CARDS');
});

test('Single preview header reuses readiness state for the selected offer status', () => {
  const ready = createCleanOffer();
  const { context, title } = createHarness({ offers: [ready, {}, {}, {}], viewMode: 'single' });

  context.updatePreviewTitle();
  assert.equal(title.textContent, 'LIVE PREVIEW — OFFER 1 • READY');

  context.offers[0]._img = '';
  context.updatePreviewTitle();
  assert.equal(title.textContent, 'LIVE PREVIEW — OFFER 1 • NEEDS IMAGE');

  context.offers[0]._img = 'hero.jpg';
  context.offers[0]._utm = '';
  context.updatePreviewTitle();
  assert.equal(title.textContent, 'LIVE PREVIEW — OFFER 1 • INCOMPLETE');

  context.offers[0].price = '';
  context.updatePreviewTitle();
  assert.equal(title.textContent, 'LIVE PREVIEW — OFFER 1 • MISSING DATA');

  context.offers[0] = {};
  context.updatePreviewTitle();
  assert.equal(title.textContent, 'LIVE PREVIEW — OFFER 1');
});

test('existing status refresh path also refreshes the preview title without changing status-dot logic', () => {
  const statusRefresh = extractFunction('updateAllStatus');
  assert.match(statusRefresh, /updateProductionStatus\(\);[\s\S]*if\(typeof updatePreviewTitle===\"function\"\) updatePreviewTitle\(\);/);
  assert.match(statusRefresh, /if\(typeof updateSectionCompletionIndicators===\"function\"\) updateSectionCompletionIndicators\(\);/);
  assert.match(extractFunction('renderEmptyPreviewIfNeeded'), /updatePreviewTitle\(\);/);
  assert.match(extractFunction('renderVisibleCard'), /updatePreviewTitle\(\);/);
  assert.match(extractFunction('renderPreviewMode'), /if\(viewMode === 'email'\)\{\s*updatePreviewTitle\(\);/);
  assert.match(extractFunction('renderPreviewMode'), /if\(viewMode === 'all'\)\{\s*updatePreviewTitle\(\);/);
});
