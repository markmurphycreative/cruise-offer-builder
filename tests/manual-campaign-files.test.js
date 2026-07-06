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

const constants = [
  'const CAMPAIGN_FILE_TYPE = "cruise-offer-builder-campaign";',
  'const CAMPAIGN_FILE_SCHEMA_VERSION = "1.0";'
].join('\n');

function runFunctions(names, context = {}) {
  vm.createContext(context);
  vm.runInContext(`${constants}\n${names.map(extractFunction).join('\n')}\n`, context);
  return context;
}

test('manual campaign save/load controls separate primary workflows from recovery and autosave controls', () => {
  assert.match(html, /<div class="act-row">\s*<button class="abtn gold" type="button" onclick="saveCampaignFile\(\)">Save Campaign<\/button>\s*<button class="abtn navy" type="button" onclick="triggerLoadCampaignFile\(\)">Load Campaign<\/button>/);
  assert.match(html, /<section class="campaign-library-category" data-campaign-category="utility">[\s\S]*?<button class="abtn btn-compact" type="button" onclick="triggerLoadCampaignBackup\(\)">Load Campaign Backup<\/button>\s*<input id="campaign-backup-input" type="file" accept="\.json,application\/json"[^>]+onchange="loadCampaignBackup\(event\)"/);
  assert.doesNotMatch(html, /<div class="act-row">\s*<button class="abtn" type="button" onclick="triggerLoadCampaignBackup\(\)">Load Campaign Backup<\/button>/);
  assert.match(html, /id="campaign-file-input" type="file" accept="\.json,application\/json"[^>]+onchange="loadCampaignFile\(event\)"/);
  assert.doesNotMatch(html, /Campaign files are reusable backups\. Autosave handles day-to-day recovery\./);
  assert.match(html, /<h3>Campaign Actions<\/h3>/);
  assert.match(html, /onclick="clearSavedSession\(\)">Clear Current Session<\/button>/);
});

test('campaign filenames use the DAS campaign naming convention and parsed send date', () => {
  const elements = {
    'g-campaign': { value: 'Cruise May 2026' },
    'g-date': { value: '16 May 2026', getAttribute: () => '' }
  };
  const context = runFunctions(['buildCampaignFilename'], {
    document: { getElementById: id => elements[id] },
    slugifyCampaignName: name => String(name).toLowerCase().replace(/\s+/g, '-'),
    parseSendDateToDDMMYY: () => '160526'
  });
  assert.equal(context.buildCampaignFilename(), 'DAS_campaign_cruise-may-2026_160526.json');
});

test('portable manual snapshots retain data URL heroes, crop positions and logo overrides while marking non-portable file references', () => {
  const context = runFunctions(['makePortableCampaignOffers']);
  const offers = [
    { name: 'One', _img: 'data:image/png;base64,hero', _cropZoom: 145, _cropX: 22, _cropY: 64, _logoCustom: 'data:image/png;base64,logo', customColour: '#123456' },
    { name: 'Two', _img: 'blob:https://builder.test/hero', _logoCustom: 'file:///tmp/logo.png' },
    { name: 'Three', url: 'https://example.com/cruise' },
    { name: 'Four', ports: 'A • B' }
  ];
  const snapshot = context.makePortableCampaignOffers(offers);
  assert.equal(snapshot.length, 4);
  assert.equal(snapshot[0]._img, 'data:image/png;base64,hero');
  assert.equal(snapshot[0]._logoCustom, 'data:image/png;base64,logo');
  assert.deepEqual([snapshot[0]._cropZoom, snapshot[0]._cropX, snapshot[0]._cropY], [145, 22, 64]);
  assert.equal(snapshot[0].customColour, '#123456');
  assert.equal(snapshot[1]._img, undefined);
  assert.equal(snapshot[1]._imgSource, 'blob:https://builder.test/hero');
  assert.equal(snapshot[1]._imgNeedsReupload, true);
  assert.equal(snapshot[1]._logoCustom, undefined);
  assert.equal(snapshot[1]._logoNeedsReupload, true);
  assert.equal(offers[1]._img, 'blob:https://builder.test/hero', 'export sanitising must not mutate live editor state');
});

test('campaign parser accepts builder files and rejects malformed, foreign and incompatible files without evaluating them', () => {
  const context = runFunctions(['parseCampaignFileText']);
  const valid = { fileType: 'cruise-offer-builder-campaign', schemaVersion: '1.0', state: { offers: [{}, {}, {}, {}] } };
  assert.equal(context.parseCampaignFileText(JSON.stringify(valid)).state.offers.length, 4);
  assert.throws(() => context.parseCampaignFileText('{bad json'), /Invalid JSON/);
  assert.throws(() => context.parseCampaignFileText(JSON.stringify({ hello: 'world' })), /Not a murfi campaign file/);
  assert.throws(() => context.parseCampaignFileText(JSON.stringify({ ...valid, schemaVersion: '2.0' })), /Incompatible campaign file version/);
  assert.equal(context.parseCampaignFileText(JSON.stringify({ projectType: 'cruise-offer-builder-project', offers: [{}, {}, {}, {}] })).isLegacyProject, true);
});

test('restoring a four-card campaign preserves order and view mode but defaults active offer to Offer 1', () => {
  const elements = { 'sheets-url': { value: '' } };
  const stored = new Map();
  const calls = [];
  const context = runFunctions(['campaignFileNeedsImageCheck', 'restoreCampaignFilePayload'], {
    APP_VERSION: 'v2.1.0',
    GOOGLE_SHEET_SOURCE_KEY: 'cobGoogleSheetSourceV1',
    autosaveTimer: null,
    clearTimeout: () => calls.push('clear-timeout'),
    document: { getElementById: id => elements[id] || null },
    localStorage: { removeItem: key => stored.delete(key) },
    storeGoogleSheetSource: url => { stored.set('sheet', url); return url; },
    applySessionPayload: payload => calls.push(['apply', payload]),
    saveSessionNow: () => calls.push('autosave'),
    showSessionFeedback: (message, warning) => calls.push(['feedback', message, warning]),
    resetShortcutFocusAfterImport: () => calls.push('focus')
  });
  const offers = [
    { name: 'First', operator: 'po', _img: 'data:image/png;base64,one', _cropX: 10 },
    { name: 'Second', operator: 'msc', _img: 'https://example.com/two.jpg', _cropY: 75 },
    { name: 'Third', operator: 'ncl', ports: 'A • B' },
    { name: 'Fourth', operator: 'cunard', customColour: '#abcdef' }
  ];
  const result = context.restoreCampaignFilePayload({
    parsed: { appVersion: 'v2.1.0', sourceInfo: { googleSheetUrl: 'https://docs.google.com/spreadsheets/d/example/edit' } },
    state: { offers, cardOrder: [0, 1, 2, 3], activeOfferIndex: 2, viewMode: 'email' },
    isLegacyProject: false
  });
  const restored = calls.find(call => Array.isArray(call) && call[0] === 'apply')[1];
  assert.deepEqual(Array.from(restored.offers, offer => offer.name), ['First', 'Second', 'Third', 'Fourth']);
  assert.equal(restored.cur, 0);
  assert.equal(restored.viewMode, 'email');
  assert.equal(stored.get('sheet'), 'https://docs.google.com/spreadsheets/d/example/edit');
  assert.ok(calls.includes('autosave'));
  assert.equal(result.imageWarning, false);
  assert.equal(result.compatibilityWarning, false);
  assert.deepEqual(calls.slice(-2), [['feedback', 'Campaign loaded', false], 'focus']);
});

test('restored image re-upload markers and older project files produce clear non-crashing warnings', () => {
  const calls = [];
  const context = runFunctions(['campaignFileNeedsImageCheck', 'restoreCampaignFilePayload'], {
    APP_VERSION: 'v2.1.0',
    GOOGLE_SHEET_SOURCE_KEY: 'cobGoogleSheetSourceV1',
    autosaveTimer: null,
    clearTimeout() {},
    document: { getElementById: () => null },
    localStorage: { removeItem() {} },
    applySessionPayload() {},
    saveSessionNow() {},
    showSessionFeedback: (message, warning) => calls.push([message, warning]),
    resetShortcutFocusAfterImport() {}
  });
  const imageResult = context.restoreCampaignFilePayload({ parsed: {}, state: { offers: [{ _imgNeedsReupload: true }] }, isLegacyProject: false });
  assert.equal(imageResult.imageWarning, true);
  assert.equal(imageResult.compatibilityWarning, false);
  assert.deepEqual(calls.pop(), ['Campaign loaded, images may need checking', true]);
  const legacyResult = context.restoreCampaignFilePayload({ parsed: {}, state: { offers: [{}] }, isLegacyProject: true });
  assert.equal(legacyResult.imageWarning, false);
  assert.equal(legacyResult.compatibilityWarning, true);
  assert.deepEqual(calls.pop(), ['Campaign loaded with compatibility warning', true]);
});

test('saved campaign schema explicitly covers app metadata, ordered card state, source info, QA, UTMs, operators, logos and heroes', () => {
  const source = extractFunction('buildCampaignFilePayload');
  for (const expected of [
    'fileType:CAMPAIGN_FILE_TYPE', 'schemaVersion:CAMPAIGN_FILE_SCHEMA_VERSION', 'appVersion:APP_VERSION', 'exportedAt',
    'campaign', 'offers:portableOffers', 'cardOrder:[0,1,2,3]', 'activeOfferIndex:cur', 'viewMode:', 'lockedOffers:',
    'operatorSettings:', 'logoSettings:', 'heroImages:', 'utmData:', 'operatorLandingPages:', 'qa:getCampaignQaSnapshot()',
    'sourceInfo:{googleSheetUrl:googleSheetSource}', 'sessionMetadata:'
  ]) assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});


test('campaign load defaults to Offer 1 while preserving restored campaign data and refresh path', () => {
  const restoreSource = extractFunction('refreshAfterRestore');
  for (const expected of ['genUtm();', 'genAllUtms(true);', 'genStandardUtms();', 'updateAllStatus();', 'updateExportFilenames();', 'renderPreviewMode(true);', 'runSpellQA();']) {
    assert.match(restoreSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const restorePayloadSource = extractFunction('restoreCampaignFilePayload');
  assert.match(restorePayloadSource, /restored\.cur=0;/);
  assert.match(restorePayloadSource, /allowLargeEmbeddedImagesDuringRestore=true;[\s\S]*?applySessionPayload\(restored\);[\s\S]*?allowLargeEmbeddedImagesDuringRestore=false;[\s\S]*?saveSessionNow\(\);[\s\S]*?resetShortcutFocusAfterImport\(\);/);
});


test('manual file loads opt into restoring large embedded hero data while normal autosave hydration keeps its storage guard', () => {
  const source = extractFunction('applySessionPayload');
  assert.match(source, /!allowLargeEmbeddedImagesDuringRestore && o\._img/);
  assert.match(extractFunction('restoreCampaignFilePayload'), /allowLargeEmbeddedImagesDuringRestore=true;[\s\S]*?applySessionPayload\(restored\);[\s\S]*?allowLargeEmbeddedImagesDuringRestore=false;/);
});


test('invalid JSON selected through the file input reports feedback and does not invoke restore', () => {
  const calls = [];
  class FakeReader {
    readAsText() { this.result = '{not valid'; this.onload(); }
  }
  const context = runFunctions(['loadCampaignFile'], {
    FileReader: FakeReader,
    parseCampaignFileText() { throw new Error('Invalid JSON'); },
    restoreCampaignFilePayload() { calls.push('restore'); },
    console: { warn() {} },
    showSessionFeedback: (message, warning) => calls.push([message, warning])
  });
  const input = { files: [{}], value: 'campaign.json' };
  assert.doesNotThrow(() => context.loadCampaignFile({ target: input }));
  assert.deepEqual(calls, [['Invalid campaign file: Invalid JSON', true]]);
  assert.equal(input.value, '');
});
