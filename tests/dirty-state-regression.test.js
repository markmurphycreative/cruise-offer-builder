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

function createDirtyHarness() {
  const fieldIds = [
    'g-campaign', 'g-date', 'g-description', 'g-owner', 'g-airport', 'g-terms',
    'raw-paste', 'multi-offer-paste', 'sheets-url', 'f-utm-content'
  ];
  const fields = Object.fromEntries(fieldIds.map(id => [id, { value: '' }]));
  fields['g-description'].value = 'Weekly cruise offers';
  fields['g-owner'].value = 'Marketing';
  fields['g-airport'].value = 'Newcastle';
  fields['g-terms'].value = 'T&Cs Apply';
  const context = {
    document: { getElementById: id => fields[id] || null },
    offers: [{}, {}, {}, {}],
    lockedOffers: [false, false, false, false],
    lockedHeroImages: [false, false, false, false],
    ctaSettings: { enabled: false, text: 'Click To Call Us For More Info', phone: '01912229701' },
    CTA_DEFAULTS: { enabled: false, text: 'Click To Call Us For More Info', phone: '01912229701' },
    DEFAULT_CAMPAIGN_DESCRIPTION: 'Weekly cruise offers',
    DEFAULT_CAMPAIGN_OWNER: 'Marketing',
    autosaveHasUnsavedChanges: false,
    getAutoCampaignNameState: () => true,
    isOfferLoaded: offer => !!(offer && (offer.name || offer.ship || offer.price || offer._img || offer._itineraryImg))
  };
  vm.createContext(context);
  vm.runInContext(`
    var lastCleanBuilderStateSignature = null;
    ${extractFunction('getBuilderDirtyStateSignature')}
    ${extractFunction('markBuilderStateClean')}
    ${extractFunction('hasMeaningfulBuilderContent')}
    ${extractFunction('hasUnsavedBuilderChanges')}
  `, context);
  return { context, fields };
}

test('blank sessions with only default campaign fields stay clean until a real edit occurs', () => {
  const { context, fields } = createDirtyHarness();
  context.markBuilderStateClean();

  assert.equal(context.hasMeaningfulBuilderContent(), false);
  assert.equal(context.hasUnsavedBuilderChanges(), false);

  fields['g-campaign'].value = 'Summer Sale';
  assert.equal(context.hasMeaningfulBuilderContent(), true);
  assert.equal(context.hasUnsavedBuilderChanges(), true);
});

test('restored blank sessions use the same clean baseline as new blank campaigns', () => {
  const fresh = createDirtyHarness();
  const restored = createDirtyHarness();

  fresh.context.markBuilderStateClean();
  restored.context.markBuilderStateClean();

  assert.equal(restored.context.getBuilderDirtyStateSignature(), fresh.context.getBuilderDirtyStateSignature());
  assert.equal(restored.context.hasUnsavedBuilderChanges(), false);

  restored.context.offers[0] = { name: 'Mediterranean Cruise' };
  assert.equal(restored.context.hasUnsavedBuilderChanges(), true);
});

test('splash action labels are simplified and ordered in the markup', () => {
  assert.match(html, /id="splash-open-builder-btn"[^>]*>New<\/button>[\s\S]*id="splash-continue-session-btn"[^>]*>Continue<\/button>[\s\S]*id="splash-load-campaign-btn"[^>]*>Load<\/button>[\s\S]*id="splash-load-csv-btn"[^>]*>CSV<\/button>/);
  assert.doesNotMatch(html, /\.splash-btn\{[^}]*text-transform/);
});


test('splash markup does not include an in-app title bar label', () => {
  assert.doesNotMatch(html, /Cruise Builder - murfi v4\.0/);
});

test('splash outline buttons use neutral charcoal styling', () => {
  assert.match(html, /\.splash-btn\.secondary\{[^}]*border-color:rgba\(138,145,153,\.52\);[^}]*background:rgba\(47,51,56,\.34\);/);
  assert.doesNotMatch(html, /\.splash-btn\.secondary\{[^}]*(?:var\(--gold|gold|170,160,125|158,147,108)/i);
});
