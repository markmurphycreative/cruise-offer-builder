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

function runFunctions(names, context = {}) {
  vm.createContext(context);
  vm.runInContext(names.map(extractFunction).join('\n'), context);
  return context;
}

test('Campaign Pack export writes a portable campaign-data.json backup inside the summary folder without changing pack naming', () => {
  assert.match(html, /summaryFolder\.file\('campaign-data\.json', JSON\.stringify\(buildCampaignFilePayload\(\), null, 2\)\);/);
  assert.match(html, /const cardsFolder=zip\.folder\('cards'\); const utmFolder=zip\.folder\('utms'\); const summaryFolder=zip\.folder\('summary'\)/);
  assert.match(html, /downloadBlob\(blob,getCampaignPackFilename\(\)\)/);
});

test('campaign backup payload includes recovery-critical state for offers, metadata, images, locks, card order and autosave metadata', () => {
  for (const required of [
    'offers:portableOffers',
    'cardOrder:[0,1,2,3]',
    'lockedOffers:Array.isArray(lockedOffers)',
    'lockedHeroImages:Array.isArray(lockedHeroImages)',
    'heroLocked=!!',
    'heroLocked:isHeroImageLocked(cardIndex)',
    'viewMode:["single","email","all"].includes(viewMode)',
    'heroImages:{source:"state.offers"',
    'sessionMetadata:{savedAt:exportedAt,autosaveKey:AUTOSAVE_KEY,autosave:readSavedSession()'
  ]) {
    assert.ok(html.includes(required), `Missing ${required}`);
  }
  assert.match(html, /name:document\.getElementById\("g-campaign"\)\.value\|\|""/);
  assert.match(html, /date:document\.getElementById\("g-date"\)\.value\|\|""/);
  assert.match(html, /airport:document\.getElementById\("g-airport"\)\.value\|\|""/);
  assert.match(html, /terms:document\.getElementById\("g-terms"\)\.value\|\|""/);
  assert.match(html, /getCampaignNamingSnapshot/);
});

test('Load Campaign Backup control uses the existing campaign restore parser so backups reopen full campaign state', () => {
  assert.match(html, /onclick="triggerLoadCampaignBackup\(\)">Load Campaign Backup<\/button>/);
  assert.match(html, /id="campaign-backup-input" type="file" accept="\.json,application\/json"[^>]+onchange="loadCampaignBackup\(event\)"/);
  const context = runFunctions(['loadCampaignBackup'], { loadCampaignFile: event => ({ restored: event }) });
  const event = { target: { files: [{ name: 'campaign-data.json' }] } };
  assert.deepEqual(context.loadCampaignBackup(event), { restored: event });
});

test('hero image lock preserves imagery and crop fields while allowing text refreshes to replace normal offer data', () => {
  const context = runFunctions(['isHeroImageLocked', 'preserveLockedHeroImageData'], {
    lockedHeroImages: [false, true, false, false]
  });
  const previous = {
    _img: 'data:image/png;base64,locked',
    _cropZoom: 155,
    _cropX: 21,
    _cropY: 72,
    _cropPosVersion: 2,
    _heroFitMode: 'fit',
    name: 'Old Name',
    price: '999'
  };
  const incoming = {
    _img: 'https://example.com/new.jpg',
    _cropZoom: 100,
    _cropX: 50,
    _cropY: 50,
    _cropPosVersion: 2,
    _heroFitMode: 'fill',
    name: 'Fresh Sheet Name',
    price: '1234'
  };
  const merged = context.preserveLockedHeroImageData(incoming, 1, previous);
  assert.equal(merged.name, 'Fresh Sheet Name');
  assert.equal(merged.price, '1234');
  assert.equal(merged._img, previous._img);
  assert.deepEqual([merged._cropZoom, merged._cropX, merged._cropY, merged._heroFitMode], [155, 21, 72, 'fit']);
  assert.equal(merged.heroLocked, true);
});

test('CSV and sheet import path checks hero locks before writing sheet image data', () => {
  assert.match(html, /if\(hero && !\(typeof isHeroImageLocked==="function" && isHeroImageLocked\(loaded\)\)\)\{ newOffer\._img=hero; \}/);
  assert.match(html, /if\(typeof preserveLockedHeroImageData==="function"\) preserveLockedHeroImageData\(newOffer, loaded, offers\[loaded\]\);/);
});


test('hero image lock metadata is stored on offers and normalised from restored offer data', () => {
  const context = runFunctions(['normaliseHeroLockArray', 'syncHeroLockMetadata'], {
    offers: [{ heroLocked: true }, { heroLocked: false }, {}, { heroLocked: true }],
    lockedHeroImages: [false, false, true, false]
  });
  assert.deepEqual(Array.from(context.normaliseHeroLockArray(context.lockedHeroImages, context.offers)), [true, false, true, true]);
  assert.deepEqual(Array.from(context.syncHeroLockMetadata()), [true, false, true, true]);
  assert.deepEqual(Array.from(context.offers, offer => offer.heroLocked), [true, false, true, true]);
});

test('hero image protection UI uses consistent user-facing copy without state labels', () => {
  assert.match(html, /id="hero-lock-state">Protect Hero Image/);
  assert.match(html, /state\.textContent="Protect Hero Image"/);
  assert.match(html, /label\.textContent=`Offer \$\{index\+1\}`/);
  assert.doesNotMatch(html, /Hero Image (?:Locked|Unlocked)/);
  assert.doesNotMatch(html, /Image Locked/);
});

test('campaign restore can recover hero lock state from campaign-data heroImages entries', () => {
  const calls = [];
  const context = runFunctions(['restoreCampaignFilePayload'], {
    APP_VERSION: 'v2.1.0',
    GOOGLE_SHEET_SOURCE_KEY: 'cobGoogleSheetSourceV1',
    autosaveTimer: null,
    allowLargeEmbeddedImagesDuringRestore: false,
    clearTimeout() {},
    document: { getElementById: () => null },
    localStorage: { removeItem() {} },
    applySessionPayload: payload => calls.push(payload),
    saveSessionNow() {},
    showSessionFeedback() {},
    resetShortcutFocusAfterImport() {},
    campaignFileNeedsImageCheck: () => false,
    buildCampaignHistoryEntryFromPayload: payload => payload
  });
  context.restoreCampaignFilePayload({
    parsed: { heroImages: { byCard: [{ cardIndex: 0, heroLocked: true }, { cardIndex: 2, locked: true }] } },
    state: { offers: [{ _img: 'one' }, { _img: 'two' }, { _img: 'three' }, {}] },
    isLegacyProject: false
  });
  assert.deepEqual(Array.from(calls[0].lockedHeroImages), [true, false, true, false]);
});


test('campaign history stores recent saved and opened campaigns with Open, Delete and Pin controls', () => {
  assert.match(html, /const CAMPAIGN_HISTORY_KEY = "cobCampaignHistoryV1";/);
  assert.match(html, /<h3>Recent Campaigns<\/h3>/);
  assert.match(html, /<h3>Campaign Library<\/h3>/);
  assert.match(html, /restoreCampaignHistoryEntry\('\$\{item\.id\}'\)">Open<\/button>/);
  assert.match(html, /togglePinCampaignHistoryEntry\('\$\{item\.id\}'\)">\$\{item\.pinned\?'Unpin':'Pin'\}<\/button>/);
  assert.match(html, /deleteCampaignHistoryEntry\('\$\{item\.id\}'\)">Delete<\/button>/);
  assert.match(html, /const payload=buildCampaignFilePayload\(\);[\s\S]*?addCampaignHistoryEntry\(buildCampaignHistoryEntryFromPayload\(payload, "saved"\)\)/);
  assert.match(html, /addCampaignHistoryEntry\(buildCampaignHistoryEntryFromPayload\(parsed, "backup"\)\)/);
});

test('campaign library reopens a stored campaign through the same backup restore pipeline', () => {
  const storedPayload = { fileType: 'cruise-offer-builder-campaign', schemaVersion: '1.0', state: { offers: [{ name: 'One' }] } };
  const storage = new Map([['cobCampaignHistoryV1', JSON.stringify([{ id: 'abc', title: 'Campaign', payload: storedPayload }])]]);
  const calls = [];
  const context = runFunctions(['readCampaignHistory', 'restoreCampaignHistoryEntry'], {
    CAMPAIGN_HISTORY_KEY: 'cobCampaignHistoryV1',
    localStorage: { getItem: key => storage.get(key) || null },
    parseCampaignFileText: text => JSON.parse(text),
    restoreCampaignFilePayload: payload => calls.push(payload)
  });
  assert.equal(context.restoreCampaignHistoryEntry('abc'), true);
  assert.deepEqual(calls, [storedPayload]);
});
