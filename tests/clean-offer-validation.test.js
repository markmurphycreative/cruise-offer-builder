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

function createHarness(offer, headers = { po: { pngData: 'assets/operator-logos/po-cruises-logo.png' } }) {
  const context = { offers: [offer], OPERATOR_HEADERS: headers };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('isOfferLoaded'),
    extractFunction('hasCriticalOfferContent'),
    extractFunction('hasOperatorLogo'),
    extractFunction('getOfferReadiness'),
    extractFunction('isCleanOfferValid'),
    extractFunction('getOfferStatus')
  ].join('\n'), context);
  return context;
}

function createCleanOffer() {
  return {
    name: 'Eastern Caribbean Islands Fly-Cruise',
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
    tags: 'Adult Only Options · Cuisine · Entertainment · Family',
    _utm: 'https://example.com/?utm_source=klaviyo'
  };
}

test('clean-offer validation accepts a genuinely complete loaded offer', () => {
  const context = createHarness(createCleanOffer());
  assert.equal(context.isCleanOfferValid(context.offers[0]), true);
  assert.equal(context.getOfferStatus(0), 'green');
});

test('selector status marks every required cruise content field as critical without altering export readiness', () => {
  for (const field of ['name', 'ship', 'price', 'day', 'month', 'ports', 'nights', 'board', 'boardlbl']) {
    const offer = createCleanOffer();
    offer[field] = '';
    const context = createHarness(offer);
    assert.equal(context.isCleanOfferValid(context.offers[0]), true);
    assert.equal(context.getOfferStatus(0), 'red', `${field} should be critical for the selector dot`);
  }
});

test('offer status maps non-critical readiness checks such as hero image and UTM to amber', () => {
  const missingHeroImage = createCleanOffer();
  missingHeroImage._img = '';
  assert.equal(createHarness(missingHeroImage).getOfferStatus(0), 'amber');

  const missingUtm = createCleanOffer();
  missingUtm._utm = '';
  assert.equal(createHarness(missingUtm).getOfferStatus(0), 'amber');
});

test('clean-offer validation requires an available operator logo', () => {
  const offer = createCleanOffer();
  const context = createHarness(offer, { po: { pngData: null, svgData: null } });
  assert.equal(context.isCleanOfferValid(context.offers[0]), false);
  assert.equal(context.getOfferStatus(0), 'amber');

  offer._logoCustom = 'data:image/png;base64,logo';
  assert.equal(context.isCleanOfferValid(context.offers[0]), true);
  assert.equal(context.getOfferStatus(0), 'green');
});
