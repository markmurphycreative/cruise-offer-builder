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
  assert.match(html, /const cardsFolder=zip\.folder\('offer-cards'\); const utmFolder=zip\.folder\('utms'\); const summaryFolder=zip\.folder\('summary'\)/);
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
  assert.match(html, /if\(typeof updateOfferTabLabels==="function"\) updateOfferTabLabels\(\);/);
  assert.doesNotMatch(html, /label\.textContent=`Offer \$\{index\+1\}`/);
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


test('campaign history renders one unified campaign library with expandable pinned and recent buckets', () => {
  assert.match(html, /const CAMPAIGN_HISTORY_KEY = "cobCampaignHistoryV1";/);
  assert.match(html, /const CAMPAIGN_RECENT_MAX = 20;/);
  assert.doesNotMatch(html, /id="recent-campaigns-panel"/);
  assert.match(html, /id="campaign-library-panel"/);
  assert.match(html, /<h3>Campaign Library <span class="count-badge" id="campaign-library-count">0<\/span><\/h3><span class="section-toggle">▾<\/span>/);
  assert.match(html, /<h4>Pinned Campaigns<\/h4><span class="section-toggle">▾<\/span>/);
  assert.match(html, /<h4>Saved Campaigns<\/h4><span class="section-toggle">▾<\/span>/);
  assert.doesNotMatch(html, /<h4>Recent Campaigns<\/h4><span class="section-toggle">▾<\/span>/);
  assert.match(html, /id="campaign-library-dashboard" aria-live="polite"/);
  assert.match(html, /id="pinned-campaign-list" class="campaign-history-list"/);
  assert.match(html, /id="recent-campaign-list" class="campaign-history-list"/);
  assert.doesNotMatch(html, /id="saved-campaign-list" class="campaign-history-list"/);
  assert.match(html, /renderCampaignHistoryList\("pinned-campaign-list", buckets\.pinned, "No pinned campaigns yet\."\)/);
  assert.match(html, /renderCampaignHistoryList\("recent-campaign-list", buckets\.recent, "No saved campaigns yet\."\)/);
  assert.doesNotMatch(html, /renderCampaignHistoryList\("saved-campaign-list", buckets\.saved, "No saved campaigns\."\)/);
  assert.match(html, /restoreCampaignHistoryEntry\('\$\{safeId\}'\)">Load<\/button>/);
  assert.match(html, /togglePinCampaignHistoryEntry\('\$\{safeId\}'\)">\$\{item\.pinned\?'Unpin':'Pin'\}<\/button>/);
  assert.match(html, /deleteCampaignHistoryEntry\('\$\{safeId\}'\)">Delete<\/button>/);
  assert.match(html, /const payload=buildCampaignFilePayload\(\);[\s\S]*?addCampaignHistoryEntry\(buildCampaignHistoryEntryFromPayload\(payload, "saved"\)\)/);
  assert.match(html, /addCampaignHistoryEntry\(buildCampaignHistoryEntryFromPayload\(parsed, "backup"\)\)/);
});

test('campaign library buckets keep pinned first and show the last 20 recent campaigns including pinned entries', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const history = Array.from({ length: 25 }, (_, index) => ({
    id: `campaign-${index}`,
    title: `Campaign ${index}`,
    type: 'saved',
    pinned: index === 3 || index === 22,
    pinnedAt: index === 3 ? '2026-06-01T09:00:00.000Z' : index === 22 ? '2026-06-02T09:00:00.000Z' : '',
    updatedAt: new Date(now - index * 60000).toISOString(),
    recentAt: new Date(now - index * 60000).toISOString(),
    payload: { id: index }
  }));
  const context = runFunctions(['campaignHistoryTime', 'sortCampaignHistory', 'sortCampaignHistoryNewest', 'getCampaignLibraryBuckets'], {
    CAMPAIGN_RECENT_MAX: 20,
    readCampaignHistory: () => history
  });

  const buckets = context.getCampaignLibraryBuckets();

  assert.deepEqual(buckets.pinned.map(item => item.id), ['campaign-3', 'campaign-22']);
  assert.equal(buckets.recent.length, 20);
  assert.deepEqual(buckets.recent.map(item => item.id), history.slice(0, 20).map(item => item.id));
  assert.ok(buckets.recent.some(item => item.pinned), 'recent bucket should include pinned campaigns');
  assert.equal(Object.hasOwn(buckets, 'saved'), false);
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
