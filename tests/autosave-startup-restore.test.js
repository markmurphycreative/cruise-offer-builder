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

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    storage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    }
  };
}

function makePayload(overrides = {}) {
  return {
    version: '1.0',
    savedAt: '2026-06-02T10:15:00.000Z',
    cur: 2,
    viewMode: 'email',
    lockedOffers: [false, true, false, false],
    lockedHeroImages: [true, false, true, false],
    sectionState: { campaign: false, offers: true },
    openSectionKey: 'campaign',
    campaign: { name: 'June Cruise Campaign', date: '02/06/2026', airport: 'Newcastle', terms: 'T&Cs Apply' },
    offers: [
      { name: 'First Offer', ship: 'Arvia', price: '1000' },
      { name: 'Second Offer', ship: 'Queen Anne', price: '1100' },
      { name: 'Third Offer', ship: 'Resilient Lady', price: '1200' },
      { name: 'Fourth Offer', ship: 'Marella Explorer', price: '1300' }
    ],
    ...overrides
  };
}

function createStartupHarness(rawAutosave = JSON.stringify(makePayload())) {
  const { values, storage } = createStorage(rawAutosave == null ? {} : { cobSessionAutosaveV1: rawAutosave });
  const fields = Object.fromEntries(['g-campaign', 'g-date', 'g-airport', 'g-terms'].map(id => [id, { value: '' }]));
  const tabs = Array.from({ length: 4 }, () => ({ classList: { toggle() {} } }));
  const calls = [];
  const context = {
    console,
    localStorage: storage,
    sessionStorage: storage,
    document: {
      getElementById: id => fields[id] || null,
      querySelectorAll: selector => selector === '.otab' ? tabs : []
    },
    offers: [{}, {}, {}, {}],
    lockedOffers: [false, false, false, false],
    cur: 0,
    viewMode: 'single',
    autosaveHydrating: false,
    autosaveLastSavedAt: null,
    allowLargeEmbeddedImagesDuringRestore: false,
    syncViewSelector: () => calls.push('view'),
    applySectionCollapseState: () => calls.push('sections'),
    restoreCampaignNamingSnapshot: () => calls.push('campaign-naming'),
    loadOfferToEditor: index => calls.push(['active-card', index]),
    updateOfferPill: () => calls.push('pill'),
    openCsvImportWhenNoOffersLoaded: () => calls.push('empty-state'),
    refreshAfterRestore: () => {
      calls.push('refresh');
      fields.preview = { innerHTML: context.offers.filter(offer => offer.name).map(offer => offer.name).join('|') };
    },
    syncAutosaveStatus: () => calls.push('status'),
    showSessionFeedback: (message, warning) => calls.push(['feedback', message, warning])
  };
  vm.createContext(context);
  vm.runInContext(`
    var AUTOSAVE_KEY = "cobSessionAutosaveV1";
    ${extractFunction('readSavedSession')}
    ${extractFunction('sessionHasMissingHeroImages')}
    ${extractFunction('applySessionPayload')}
    ${extractFunction('restoreSavedSessionOnStartup')}
  `, context);
  return { context, calls, fields, values };
}

test('autosave payload stores all four current offers under the Session Status key', () => {
  const context = {
    offers: makePayload().offers,
    lockedOffers: [false, true, false, false],
    lockedHeroImages: [true, false, true, false],
    cur: 2,
    viewMode: 'email',
    save() {},
    getSectionCollapseState: () => new Map([['campaign', false]]),
    getOpenSectionKey: () => 'campaign',
    getCampaignNamingSnapshot: () => ({ owner: 'Marketing' }),
    document: { getElementById: id => ({ value: { 'g-campaign': 'June Cruise Campaign', 'g-date': '02/06/2026', 'g-airport': 'Newcastle', 'g-terms': 'T&Cs Apply' }[id] || '' }) }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('buildAutosavePayload'), context);
  const payload = context.buildAutosavePayload();
  assert.equal(payload.offers.length, 4);
  assert.deepEqual(Array.from(payload.offers, offer => offer.name), ['First Offer', 'Second Offer', 'Third Offer', 'Fourth Offer']);
  assert.deepEqual(Array.from(payload.lockedHeroImages), [true, false, true, false]);
  assert.deepEqual(Array.from(payload.offers, offer => offer.heroLocked), [true, false, true, false]);
  assert.match(html, /const AUTOSAVE_KEY = "cobSessionAutosaveV1";/);
});

test('Session Status reports four loaded offers from the autosave payload', () => {
  const status = { innerHTML: '' };
  const context = {
    document: { getElementById: id => id === 'saved-session-status' ? status : null },
    readSavedSession: () => null
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction('formatAutosaveTime')}
${extractFunction('countLoadedSessionOffers')}
${extractFunction('updateSavedSessionStatus')}`, context);
  context.updateSavedSessionStatus(makePayload());
  assert.match(status.innerHTML, /^<strong>Session Status<\/strong><span class="session-status-summary">✓ Session saved • 4 offers • \d{2}:\d{2}<\/span>$/);
});

test('fresh startup hydrates four autosaved offers, active card, view mode and a non-empty preview', () => {
  const { context, calls, fields } = createStartupHarness();
  assert.equal(context.restoreSavedSessionOnStartup(), true);
  assert.deepEqual(Array.from(context.offers, offer => offer.name), ['First Offer', 'Second Offer', 'Third Offer', 'Fourth Offer']);
  assert.equal(context.cur, 2);
  assert.equal(context.viewMode, 'email');
  assert.match(fields.preview.innerHTML, /First Offer\|Second Offer\|Third Offer\|Fourth Offer/);
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'active-card' && call[1] === 2));
  assert.ok(calls.includes('refresh'));
  assert.ok(calls.includes('status'));
});

test('Clear Saved Session removes autosave so the next startup does not restore', () => {
  const { context, values } = createStartupHarness();
  Object.assign(context, {
    closeClearSessionModal() {},
    closeSessionRestoreModal() {},
    GOOGLE_SHEET_SOURCE_KEY: 'cobGoogleSheetSourceV1',
    LAST_SUCCESSFUL_CSV_KEY: 'cobLastSuccessfulCsvV1',
    BUILDER_OPEN_STORAGE_KEY: 'cobBuilderOpenV1',
    autosaveAwaitingRestoreDecision: true,
    pendingRestoreSession: makePayload()
  });
  vm.runInContext(extractFunction('confirmClearSavedSession'), context);
  context.confirmClearSavedSession();
  assert.equal(values.has('cobSessionAutosaveV1'), false);
  assert.equal(context.restoreSavedSessionOnStartup(), false);
  assert.deepEqual(Array.from(context.offers), [{}, {}, {}, {}]);
});

test('invalid autosave JSON and autosave without offers are ignored gracefully', () => {
  const invalidJson = createStartupHarness('{not valid');
  assert.doesNotThrow(() => invalidJson.context.restoreSavedSessionOnStartup());
  assert.equal(invalidJson.context.restoreSavedSessionOnStartup(), false);

  const missingOffers = createStartupHarness(JSON.stringify({ version: '1.0', campaign: {} }));
  assert.doesNotThrow(() => missingOffers.context.restoreSavedSessionOnStartup());
  assert.equal(missingOffers.context.restoreSavedSessionOnStartup(), false);
});

test('standalone initialization is registered after DOM ready and keeps autosave restore on the Continue Last Session path', () => {
  assert.match(html, /if\(document\.readyState==="loading"\) document\.addEventListener\("DOMContentLoaded",initStandaloneApp,\{once:true\}\);/);
  assert.match(extractFunction('initStandaloneApp'), /initStartScreenActions\(\);[\s\S]*?initBuilderApp\(\);[\s\S]*?hydrateSplashRecentSession\(\);/);
  assert.match(extractFunction('initBuilderApp'), /restoreGoogleSheetSource\(\);[\s\S]*?const shouldRestoreSession=builderStartupBypassMode && builderStartupBypassMode !== "fresh";[\s\S]*?const restoredSession=shouldRestoreSession \? restoreSavedSessionOnStartup\(\) : false;/);
  assert.match(extractFunction('hydrateSplashRecentSession'), /pendingRestoreSession = saved;[\s\S]*?autosaveAwaitingRestoreDecision = !builderStartupBypassMode;/);
  assert.match(html, /window\.openBuilderFromSplash = function\(event\)\{[\s\S]*?resetBuilderToBlankSession\(\);[\s\S]*?dismissSplashAndShowBuilder\("fresh"\);/);
  assert.doesNotMatch(html, /DISABLE_AUTORESTORE_SESSION/);
});
