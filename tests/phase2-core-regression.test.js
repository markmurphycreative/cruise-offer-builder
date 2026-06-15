import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} to exist`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function extractBlock(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not locate source block: ${startMarker}`);
  return html.slice(start, end);
}

const campaignConstants = [
  'const CAMPAIGN_FILE_TYPE = "cruise-offer-builder-campaign";',
  'const CAMPAIGN_FILE_SCHEMA_VERSION = "1.0";',
  'const APP_VERSION = "v2.2.2";',
  'const AUTOSAVE_KEY = "cobSessionAutosaveV1";',
  'const CTA_DEFAULTS = {enabled:false,text:"Click To Call Us For More Info",phone:"01912229701"};'
].join('\n');

function runFunctions(names, context = {}, prefix = '') {
  vm.createContext(context);
  vm.runInContext(`${prefix}\n${names.map(extractFunction).join('\n')}`, context);
  return context;
}

function element(value = '') {
  return { value, textContent: '', innerHTML: '', className: '', dataset: {}, style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} } };
}

function createCsvHarness() {
  const elements = { 'g-campaign': element(''), 'csv-status': element('') };
  for (const id of ['g-date', 'g-airport', 'g-terms']) elements[id] = element('');
  const context = {
    console: { error() {}, warn() {}, log() {} },
    document: { getElementById: id => elements[id] || null, querySelectorAll: () => [] },
    offers: [{}, {}, {}, {}],
    cur: 0,
    restoringLastSuccessfulCsv: false,
    OPERATOR_CONFIG: { msc: { aliases: [/msc/i] }, cunard: { aliases: [/cunard/i] }, princess: { aliases: [/princess/i] }, ncl: { aliases: [/ncl|norwegian/i] }, po: { aliases: [/p&o|p and o/i] }, marella: { aliases: [/marella/i] } },
    findKnownOperatorShip: () => null,
    parseFamilyPassengerBasis: () => '',
    isHeroImageLocked: () => false,
    preserveLockedHeroImageData() {},
    load() {}, renderSingleOffer() {}, updateAllStatus() {}, genAllUtms() {}, updateExportFilenames() {}, storeLastSuccessfulCsv() {}
  };
  const prefix = 'function normaliseItineraryDisplay(text){ return String(text||"").split(/[|•]/).map(s=>s.trim()).filter(Boolean).join(" • "); }\nfunction buildCSVDetailsLine(){ return ""; }';
  runFunctions(['parseCSV', 'processSheetCSV'], context, prefix);
  return { context, elements };
}

const sampleCsv = [
  'campaign_name,operator,offer_name,ship_name,price,nights,date,board_basis,inclusions,ports,url',
  'Phase 2 Campaign,MSC Cruises,Greek Isles Escape,MSC Virtuosa,1299,7,16 May 2026,Full Board = FB,Fly from Newcastle,Athens | Santorini | Mykonos,https://example.com/msc',
  'Phase 2 Campaign,Cunard,Norwegian Fjords,Queen Mary 2,999,5,20 June 2026,All Inclusive = AI,No fly,Southampton | Bergen | Flam,https://example.com/cunard'
].join('\n');

test('Phase 2 CSV import loads sample rows and populates operator, itinerary, price and board basis data', () => {
  const { context, elements } = createCsvHarness();
  context.processSheetCSV(sampleCsv, elements['csv-status']);

  assert.equal(elements['csv-status'].textContent, '✓ 2 offers loaded');
  assert.equal(elements['g-campaign'].value, 'Phase 2 Campaign');
  assert.deepEqual(context.offers.slice(0, 2).map(o => o.operator), ['msc', 'cunard']);
  assert.deepEqual(context.offers.slice(0, 2).map(o => o.price), ['1299', '999']);
  assert.match(context.offers[0].ports, /Athens • Santorini • Mykonos/);
  assert.equal(context.offers[0].board, 'FB');
  assert.equal(context.offers[0].boardlbl, 'Full Board');
  assert.equal(context.offers[1].board, 'AI');
  assert.equal(context.offers[1].boardlbl, 'All Inclusive');
});

function createCampaignHarness() {
  const elements = {
    'g-campaign': element('Phase 2 Campaign'), 'g-date': element('16 May 2026'), 'g-airport': element('Newcastle'), 'g-terms': element('Terms'),
    'copy-qa-status': element('QA ready'), 'sheets-url': element('')
  };
  const calls = [];
  const storage = new Map();
  const context = {
    console: { warn() {}, error() {}, log() {} }, Date, JSON,
    document: { getElementById: id => elements[id] || null, querySelectorAll: () => [] },
    localStorage: { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) || null, removeItem: k => storage.delete(k) },
    offers: [
      { name: 'Greek Isles Escape', operator: 'msc', ship: 'MSC Virtuosa', price: '1299', url: 'https://example.com/msc' },
      { name: 'Norwegian Fjords', operator: 'cunard', ship: 'Queen Mary 2', price: '999', url: 'https://example.com/cunard' },
      { name: 'Canaries', operator: 'princess', ship: 'Sky Princess', price: '1099', url: 'https://example.com/princess' },
      { name: 'Baltic Capitals', operator: 'ncl', ship: 'Norwegian Dawn', price: '1199', url: 'https://example.com/ncl' }
    ],
    cur: 2, viewMode: 'email', lockedOffers: [false, true, false, false], lockedHeroImages: [false, false, true, false], autosaveHydrating: false, autosaveAwaitingRestoreDecision: false, allowLargeEmbeddedImagesDuringRestore: false,
    save() {}, syncHeroLockMetadata() {}, getSectionCollapseState: () => new Map([['campaign-import', false]]), getOpenSectionKey: () => 'campaign-import', getCampaignNamingSnapshot: () => ({ owner: 'Mark', description: 'Cruise Worldwide Mixed', autoCampaignName: false }),
    makePortableCampaignOffers: source => JSON.parse(JSON.stringify(source)), getSavedGoogleSheetSource: () => 'https://docs.google.com/spreadsheets/d/example/edit', getCtaSettingsFromUI: () => ({ enabled: true, text: 'Call us', phone: '01912229701' }),
    getCtaSummaryRows: () => [{ cardIndex: 0, enabled: true }], isHeroImageLocked: i => i === 2, readSavedSession: () => ({ savedAt: 'previous' }), getCampaignQaSnapshot: () => ({ copyQaStatus: 'QA ready', capturedForReferenceOnly: true }),
    restoreCampaignNamingSnapshot() {}, applyCtaSettings(v) { calls.push(['cta', v]); }, syncViewSelector() {}, applySectionCollapseState() {}, resetCampaignLibraryStartupState() {}, loadOfferToEditor() {}, updateOfferPill() {}, openCsvImportWhenNoOffersLoaded() {},
    updateLockUI() {}, genUtm() {}, genAllUtms() {}, genStandardUtms() {}, updateAllStatus() {}, updateExportFilenames() {}, updateMoveOfferButtons() {}, renderPreviewMode() {}, updateHeroRestoreNote() {}, runSpellQA() {}, showSessionFeedback: (m, w) => calls.push(['feedback', m, w]), setAutosaveStatus() {}, updateSavedSessionStatus() {}, syncAutosaveStatus() {}, sessionHasMissingHeroImages: () => false
  };
  runFunctions(['buildCampaignFilePayload', 'parseCampaignFileText', 'applySessionPayload', 'buildAutosavePayload', 'saveSessionNow', 'readSavedSession', 'restoreSavedSessionOnStartup', 'countLoadedSessionOffers', 'refreshAfterRestore'], context, campaignConstants);
  return { context, elements, calls, storage };
}

test('Phase 2 JSON campaign save includes expected keys and export metadata', () => {
  const { context } = createCampaignHarness();
  const payload = context.buildCampaignFilePayload();
  assert.deepEqual(Object.keys(payload).sort(), ['appVersion', 'campaign', 'ctaData', 'ctaSettings', 'exportedAt', 'fileType', 'heroImages', 'logoSettings', 'operatorLandingPages', 'operatorSettings', 'qa', 'schemaVersion', 'sessionMetadata', 'sourceInfo', 'state', 'utmData'].sort());
  assert.equal(payload.campaign.name, 'Phase 2 Campaign');
  assert.equal(payload.state.activeOfferIndex, 2);
  assert.deepEqual(payload.operatorSettings.byCard.map(card => card.operator), ['msc', 'cunard', 'princess', 'ncl']);
  assert.deepEqual(payload.operatorLandingPages, ['https://example.com/msc', 'https://example.com/cunard', 'https://example.com/princess', 'https://example.com/ncl']);
});

test('Phase 2 JSON campaign load and save/load round trip preserve active card, order and operators', () => {
  const { context, elements } = createCampaignHarness();
  const payload = context.buildCampaignFilePayload();
  payload.state.offers = [payload.state.offers[2], payload.state.offers[0], payload.state.offers[3], payload.state.offers[1]];
  payload.state.activeOfferIndex = 1;
  payload.state.cur = 1;
  const parsed = context.parseCampaignFileText(JSON.stringify(payload));
  context.applySessionPayload({ ...parsed.state, cur: parsed.state.activeOfferIndex });
  assert.equal(context.cur, 1);
  assert.equal(elements['g-campaign'].value, 'Phase 2 Campaign');
  assert.deepEqual(context.offers.map(o => o.name), ['Canaries', 'Greek Isles Escape', 'Baltic Capitals', 'Norwegian Fjords']);
  assert.deepEqual(context.offers.map(o => o.operator), ['princess', 'msc', 'ncl', 'cunard']);
});

test('Phase 2 session restore rehydrates autosave without corrupting offer data or reordered cards', () => {
  const { context, storage } = createCampaignHarness();
  const reordered = [context.offers[3], context.offers[1], context.offers[0], context.offers[2]].map(o => ({ ...o }));
  storage.set('cobSessionAutosaveV1', JSON.stringify({ version: '1.0', savedAt: '2026-06-15T10:00:00.000Z', cur: 3, viewMode: 'all', campaign: { name: 'Restored Campaign', date: '20 June 2026', airport: 'Newcastle', terms: 'Terms' }, offers: reordered }));
  assert.equal(context.restoreSavedSessionOnStartup(), true);
  assert.equal(context.cur, 3);
  assert.deepEqual(context.offers.map(o => o.name), ['Baltic Capitals', 'Norwegian Fjords', 'Greek Isles Escape', 'Canaries']);
  assert.deepEqual(context.offers.map(o => o.price), ['1199', '999', '1299', '1099']);
});

function createUtmHarness() {
  const elements = { 'g-date': element('16 May 2026'), 'f-name': element(''), 'f-url': element(''), 'f-operator': element(''), 'utm-visible-output': element(''), 'utm-generated-list': element(''), 'utm-panel-title': element(''), 'utm-current-card': element(''), 'utm-context-id': element(''), 'utm-context-meta': element(''), 'utm-context-title': element(''), 'utm-out': element(''), 'utm-copy-btn': element('') };
  elements['f-name'].value = 'Canaries';
  elements['f-url'].value = 'https://example.com/msc-canaries';
  elements['f-operator'].value = 'msc';
  const context = { console: { log() {} }, document: { getElementById: id => elements[id] || null }, navigator: { clipboard: { writeText: () => Promise.resolve() } }, alert() {}, setTimeout() {}, OPERATOR_HEADERS: {}, cur: 0, offers: [
    { operator: 'msc', name: 'Canaries', url: 'https://example.com/msc-canaries' },
    { operator: 'msc', name: 'Greek Isles', url: 'https://example.com/msc' },
    { operator: 'cunard', name: 'Fjords', url: 'https://example.com/cunard' },
    { operator: 'ncl', name: 'Baltic', url: 'https://example.com/ncl' }
  ] };
  const prefix = extractBlock('const OPERATOR_CONFIG =', '\nfunction getOperatorLandingUrl').replace('const OPERATOR_CONFIG', 'var OPERATOR_CONFIG');
  const utm = extractBlock('// CLEAN UTM MODULE', '\nconst STANDARD_UTM_LINKS =').replace('const DANDS_OPERATOR_UTM', 'var DANDS_OPERATOR_UTM');
  vm.createContext(context);
  vm.runInContext(`${prefix}\n${utm}`, context);
  return { context, elements };
}

test('Phase 2 UTM generation populates values with card order and preserves operator landing pages', () => {
  const { context, elements } = createUtmHarness();
  const output = context.genAllUtms(true);
  assert.match(output, /utm_content=160526_msc_canaries_card1/);
  assert.match(output, /utm_content=160526_msc_greek_isles_card2/);
  assert.match(output, /utm_content=160526_cunard_fjords_card3/);
  assert.match(output, /utm_content=160526_norwegian_baltic_card4/);
  assert.equal(context.offers[1].url, 'https://www.dawsonandsanderson.co.uk/cruises');
  assert.equal(context.offers[2].url, 'https://www.dawsonandsanderson.co.uk/cunard');
  assert.equal(context.offers[3].url, 'https://www.dawsonandsanderson.co.uk/cruises');
  assert.match(elements['utm-generated-list'].innerHTML, /CARD 1/);
});

function createAiHarness() {
  const elements = { 'ai-prompt-type': element('subject-lines'), 'ai-prompt-tone': element('Direct'), 'ai-prompt-output': element(''), 'ai-prompt-copy-status': element(''), 'g-campaign': element('Phase 2 Campaign'), 'g-date': element('16 May 2026'), 'g-description': element('Cruise Worldwide Mixed'), 'g-owner': element('Mark'), 'g-airport': element('Newcastle') };
  const context = { document: { getElementById: id => elements[id] || null }, offers: [{ name: 'Greek Isles Escape', operator: 'msc', ship: 'MSC Virtuosa', price: '1299', ports: 'Athens • Santorini', boardlbl: 'Full Board' }], cur: 0, save() {} };
  vm.createContext(context);
  const operatorConfig = 'var OPERATOR_CONFIG = { msc: { displayName: \"MSC Cruises\" } };';
  const aiBlock = html.slice(html.indexOf('function getAiCopyOperatorName'), html.indexOf('// ═══════════════════════════════════════════════════════\n// STATE'));
  vm.runInContext(`${operatorConfig}\n${aiBlock}`, context);
  return { context, elements };
}

test('Phase 2 AI Copy prompt generation succeeds and is non-empty for all required prompt types', () => {
  const { context, elements } = createAiHarness();
  for (const type of ['subject-lines', 'preview-text', 'subject-preview', 'taglines', 'short-description', 'long-description', 'copy-pack-campaign']) {
    elements['ai-prompt-type'].value = type;
    context.generateAiCopyPrompt();
    assert.ok(elements['ai-prompt-output'].value.trim().length > 100, `${type} prompt should be populated`);
    assert.match(elements['ai-prompt-output'].value, /Return the copy only/);
  }
});

test('Phase 2 campaign export payload is generated and preserves campaign metadata', () => {
  const { context } = createCampaignHarness();
  const payload = context.buildCampaignFilePayload();
  assert.equal(payload.campaign.name, 'Phase 2 Campaign');
  assert.equal(payload.campaign.date, '16 May 2026');
  assert.equal(payload.campaign.airport, 'Newcastle');
  assert.equal(payload.qa.copyQaStatus, 'QA ready');
  assert.equal(payload.sourceInfo.googleSheetUrl, 'https://docs.google.com/spreadsheets/d/example/edit');
});

test('Phase 2 reordered cards persist after save/load and session restore', () => {
  const { context, storage } = createCampaignHarness();
  context.offers = [context.offers[2], context.offers[0], context.offers[3], context.offers[1]];
  const payload = context.buildCampaignFilePayload();
  context.applySessionPayload(payload.state);
  assert.deepEqual(context.offers.map(o => o.name), ['Canaries', 'Greek Isles Escape', 'Baltic Capitals', 'Norwegian Fjords']);
  context.saveSessionNow();
  assert.ok(storage.get('cobSessionAutosaveV1'));
  context.offers = [{}, {}, {}, {}];
  assert.equal(context.restoreSavedSessionOnStartup(), true);
  assert.deepEqual(context.offers.map(o => o.name), ['Canaries', 'Greek Isles Escape', 'Baltic Capitals', 'Norwegian Fjords']);
});
