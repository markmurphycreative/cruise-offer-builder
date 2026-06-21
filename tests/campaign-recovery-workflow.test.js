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

test('CSV and sheet import clears stale hero data before applying new offer rows', () => {
  assert.match(html, /if\(typeof clearHeroImageDataFromOffer==="function"\) clearHeroImageDataFromOffer\(loaded\);/);
  assert.match(html, /\["_img","_imgSource","_imgNeedsReupload","_cropZoom","_cropX","_cropY","_cropPosVersion","_heroFitMode","heroLocked"\]\.forEach\(key=>\{ delete newOffer\[key\]; \}\);/);
  assert.match(html, /if\(hero\)\{ newOffer\._img=hero; \}/);
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


test('campaign history renders the live campaign library sidebar with required labels and actions', () => {
  assert.match(html, /const CAMPAIGN_HISTORY_KEY = "cobCampaignHistoryV1";/);
  assert.match(html, /const CAMPAIGN_RECENT_MAX = 20;/);
  assert.doesNotMatch(html, /id="recent-campaigns-panel"/);
  assert.match(html, /id="campaign-library-panel"/);
  assert.match(html, /<h3 class="campaign-library-title"><span class="campaign-library-title-main">CAMPAIGN LIBRARY <span class="count-badge" id="campaign-library-count">0<\/span><\/span><span class="campaign-library-subtitle">Saved campaigns and backups<\/span><\/h3><span class="section-toggle">▾<\/span>/);
  assert.doesNotMatch(html, /<h3>SAVED CAMPAIGNS <span class="count-badge" id="campaign-library-count">0<\/span><\/h3>/);
  assert.match(html, /<h4>Pinned Campaigns<\/h4><span class="section-toggle">▾<\/span>/);
  assert.match(html, /<h4>SAVED CAMPAIGNS <span class="count-badge count-badge--saved" id="saved-campaign-count">0<\/span><\/h4><span class="section-toggle">▾<\/span>/);
  assert.doesNotMatch(html, /<h4>Recent Campaigns<\/h4><span class="section-toggle">▾<\/span>/);
  assert.match(html, /id="campaign-library-dashboard" aria-live="polite"/);
  assert.doesNotMatch(html, /\["Recent",/);
  assert.match(html, /id="pinned-campaign-list" class="campaign-history-list"/);
  assert.match(html, /id="recent-campaign-list" class="campaign-history-list"/);
  assert.doesNotMatch(html, /id="saved-campaign-list" class="campaign-history-list"/);
  assert.match(html, /renderCampaignHistoryList\("pinned-campaign-list", buckets\.pinned, "No pinned campaigns yet\."\)/);
  assert.match(html, /renderCampaignHistoryList\("recent-campaign-list", buckets\.recent, "No saved campaigns yet\."\)/);
  assert.doesNotMatch(html, /renderCampaignHistoryList\("saved-campaign-list", buckets\.saved, "No saved campaigns\."\)/);
  assert.match(html, /restoreCampaignHistoryEntry\('\$\{safeId\}'\)">Load<\/button>/);
  assert.match(html, /togglePinCampaignHistoryEntry\('\$\{safeId\}'\)">Pin<\/button>/);
  assert.match(html, /deleteCampaignHistoryEntry\('\$\{safeId\}'\)">Delete<\/button>/);
  assert.doesNotMatch(html, /restoreCampaignHistoryEntry\('\$\{safeId\}'\)">Open<\/button>/);
  assert.doesNotMatch(html, /<div class="act-row">[\s\S]*?Clear Saved Session[\s\S]*?<\/div>/);
  assert.match(html, /<h4>Campaign Actions<\/h4><span class="section-toggle">▾<\/span>[\s\S]*?onclick="clearSavedSession\(\)">Clear Current Session<\/button>/);
  assert.match(html, /const payload=buildCampaignFilePayload\(\);[\s\S]*?addCampaignHistoryEntry\(buildCampaignHistoryEntryFromPayload\(payload, "saved"\)\)/);
  assert.match(html, /addCampaignHistoryEntry\(buildCampaignHistoryEntryFromPayload\(parsed, "backup"\)\)/);
});

test('campaign thumbnails render synthetic identity cards from saved campaign data without images', () => {
  const context = runFunctions([
    'escapeCampaignHistoryText',
    'getCampaignThumbnailPayload',
    'getCampaignThumbnailName',
    'getCampaignThumbnailOffers',
    'isCampaignThumbnailOfferPresent',
    'getCampaignOperatorShortLabel',
    'getCampaignThumbnailOperatorLabels',
    'getCampaignThumbnailOperatorEntries',
    'getCampaignThumbnailOperatorKey',
    'campaignThumbnailRgba',
    'getCampaignThumbnailOperatorColour',
    'getCampaignThumbnailPillStyle',
    'getCampaignThumbnailOfferCount',
    'getCampaignThumbnailSavedTime',
    'renderCampaignThumbnail'
  ], {
    OPERATOR_HEADERS: {
      celebrity: { color: '#1a1a1a' },
      cunard: { color: '#8b0000' },
      msc: { color: '#003399' },
      princess: { color: '#1a3a5c' }
    },
    OPERATOR_SKINS: {
      celebrity: { infoBar: '#c66828' },
      princess: { infoBar: '#a7c2c6' }
    }
  });
  const item = {
    title: 'June Cruise Mixed',
    savedAt: '2026-06-09T19:21:00.000Z',
    payload: {
      state: {
        offers: [
          { operator: 'celebrity', name: 'Celebrity offer' },
          { operator: 'cunard', name: 'Cunard offer' },
          { operator: 'msc', name: 'MSC offer' },
          { operator: 'princess', name: 'Princess offer' }
        ]
      }
    }
  };

  assert.deepEqual(context.getCampaignThumbnailOperatorLabels(item), ['CX', 'CUN', 'MSC', 'PRN']);
  assert.equal(context.getCampaignThumbnailOfferCount(item), 4);
  const markup = context.renderCampaignThumbnail(item);
  assert.match(markup, /class="campaign-thumbnail"/);
  assert.match(markup, />CX<\/span>/);
  assert.match(markup, />CUN<\/span>/);
  assert.match(markup, />MSC<\/span>/);
  assert.match(markup, />PRN<\/span>/);
  assert.match(markup, /style="background:rgba\(198,104,40,0\.14\);border-color:rgba\(198,104,40,0\.36\);color:rgba\(198,104,40,0\.68\);"/);
  assert.match(markup, /style="background:rgba\(139,0,0,0\.14\);border-color:rgba\(139,0,0,0\.36\);color:rgba\(139,0,0,0\.68\);"/);
  assert.match(markup, /style="background:rgba\(0,51,153,0\.14\);border-color:rgba\(0,51,153,0\.36\);color:rgba\(0,51,153,0\.68\);"/);
  assert.match(markup, /style="background:rgba\(167,194,198,0\.24\);border-color:rgba\(167,194,198,0\.58\);color:rgba\(167,194,198,0\.68\);"/);
  assert.match(markup, /June Cruise Mixed/);
  assert.match(markup, /4 Offers · Saved/);
  assert.doesNotMatch(markup, /<img\b|canvas|data:image|base64|html2canvas/i);
});

test('campaign thumbnail operator abbreviations and missing data fall back safely', () => {
  const context = runFunctions([
    'escapeCampaignHistoryText',
    'getCampaignThumbnailPayload',
    'getCampaignThumbnailName',
    'getCampaignThumbnailOffers',
    'isCampaignThumbnailOfferPresent',
    'getCampaignOperatorShortLabel',
    'getCampaignThumbnailOperatorLabels',
    'getCampaignThumbnailOperatorEntries',
    'getCampaignThumbnailOperatorKey',
    'campaignThumbnailRgba',
    'getCampaignThumbnailOperatorColour',
    'getCampaignThumbnailPillStyle',
    'getCampaignThumbnailOfferCount',
    'getCampaignThumbnailSavedTime',
    'renderCampaignThumbnail'
  ]);

  assert.equal(context.getCampaignOperatorShortLabel('P&O Cruises'), 'P&O');
  assert.equal(context.getCampaignOperatorShortLabel('Marella Cruises'), 'MAR');
  assert.equal(context.getCampaignOperatorShortLabel('Fred. Olsen Cruise Lines'), 'FOL');
  assert.equal(context.getCampaignOperatorShortLabel('Royal Caribbean'), 'RC');
  assert.equal(context.getCampaignOperatorShortLabel('Some Unknown Operator'), 'SOM');
  assert.equal(context.getCampaignOperatorShortLabel(''), '—');

  assert.equal(
    context.getCampaignThumbnailPillStyle('P&O Cruises'),
    'background:rgba(160,146,103,0.2);border-color:rgba(160,146,103,0.52);color:rgba(160,146,103,0.68);'
  );
  assert.equal(
    context.getCampaignThumbnailPillStyle('Marella Cruises'),
    'background:rgba(160,146,103,0.2);border-color:rgba(160,146,103,0.52);color:rgba(160,146,103,0.68);'
  );
  assert.equal(
    context.getCampaignThumbnailPillStyle('Fred. Olsen Cruise Lines'),
    'background:rgba(160,146,103,0.24);border-color:rgba(160,146,103,0.58);color:rgba(160,146,103,0.68);'
  );
  assert.equal(
    context.getCampaignThumbnailPillStyle('Cunard'),
    'background:rgba(160,146,103,0.14);border-color:rgba(160,146,103,0.36);color:rgba(160,146,103,0.68);'
  );
  const missing = { payload: { state: { campaign: {}, offers: [{ operator: '', heroLocked: true }] } } };
  assert.equal(context.getCampaignThumbnailName(missing), 'Untitled Campaign');
  assert.deepEqual(context.getCampaignThumbnailOperatorLabels(missing), ['—']);
  assert.equal(context.getCampaignThumbnailOfferCount(missing), 0);
  const markup = context.renderCampaignThumbnail(missing);
  assert.match(markup, /Untitled Campaign/);
  assert.match(markup, />—<\/span>/);
  assert.match(markup, /style="background:rgba\(160,146,103,0\.14\);border-color:rgba\(160,146,103,0\.36\);color:rgba\(160,146,103,0\.68\);"/);
  assert.match(markup, /0 Offers/);
  assert.doesNotMatch(markup, /Saved \d/);
});

test('campaign history list keeps existing actions while inserting reusable thumbnails', () => {
  const writes = [];
  const context = runFunctions([
    'campaignHistoryDisplayType',
    'campaignHistoryMeta',
    'escapeCampaignHistoryText',
    'renderCampaignHistoryEmptyState',
    'getCampaignThumbnailPayload',
    'getCampaignThumbnailName',
    'getCampaignThumbnailOffers',
    'isCampaignThumbnailOfferPresent',
    'getCampaignOperatorShortLabel',
    'getCampaignThumbnailOperatorLabels',
    'getCampaignThumbnailOperatorEntries',
    'getCampaignThumbnailOperatorKey',
    'campaignThumbnailRgba',
    'getCampaignThumbnailOperatorColour',
    'getCampaignThumbnailPillStyle',
    'getCampaignThumbnailOfferCount',
    'getCampaignThumbnailSavedTime',
    'renderCampaignThumbnail',
    'renderCampaignHistoryList'
  ], {
    formatCampaignDate: () => '09 Jun 2026',
    document: { getElementById: () => ({ set innerHTML(value) { writes.push(value); } }) }
  });

  context.renderCampaignHistoryList('recent-campaign-list', [{
    id: 'abc',
    title: 'Action Safe Campaign',
    savedAt: '2026-06-09T12:00:00.000Z',
    payload: { state: { offers: [{ operator: 'royal', name: 'Loaded offer' }] } }
  }], 'No saved campaigns yet.');

  assert.match(writes[0], /class="campaign-thumbnail" role="button" tabindex="0" title="Load campaign" aria-label="Load campaign" onclick="restoreCampaignHistoryEntry\('abc'\)"/);
  assert.match(writes[0], /onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);restoreCampaignHistoryEntry\('abc'\);\}"/);
  assert.match(writes[0], /restoreCampaignHistoryEntry\('abc'\)">Load<\/button>/);
  assert.match(writes[0], /togglePinCampaignHistoryEntry\('abc'\)">Pin<\/button>/);
  assert.match(writes[0], /deleteCampaignHistoryEntry\('abc'\)">Delete<\/button>/);
});

test('campaign history cards render the campaign title once while preserving metadata and actions', () => {
  const writes = [];
  const context = runFunctions([
    'campaignHistoryDisplayType',
    'campaignHistoryMeta',
    'escapeCampaignHistoryText',
    'renderCampaignHistoryEmptyState',
    'getCampaignThumbnailPayload',
    'getCampaignThumbnailName',
    'getCampaignThumbnailOffers',
    'isCampaignThumbnailOfferPresent',
    'getCampaignOperatorShortLabel',
    'getCampaignThumbnailOperatorEntries',
    'getCampaignThumbnailOperatorKey',
    'campaignThumbnailRgba',
    'getCampaignThumbnailOperatorColour',
    'getCampaignThumbnailPillStyle',
    'getCampaignThumbnailOfferCount',
    'getCampaignThumbnailSavedTime',
    'renderCampaignThumbnail',
    'renderCampaignHistoryList'
  ], {
    formatCampaignDate: () => '09 Jun 2026',
    document: { getElementById: () => ({ set innerHTML(value) { writes.push(value); } }) }
  });

  context.renderCampaignHistoryList('recent-campaign-list', [{
    id: 'abc',
    title: 'Single Title Campaign',
    type: 'saved',
    savedAt: '2026-06-09T12:00:00.000Z',
    payload: { state: { offers: [{ operator: 'royal', name: 'Loaded offer' }] } }
  }], 'No saved campaigns yet.');

  const markup = writes[0];
  const titleMatches = markup.match(/Single Title Campaign/g) || [];
  assert.equal(titleMatches.length, 1);
  assert.doesNotMatch(markup, /class="campaign-history-title"/);
  assert.match(markup, /<div class="campaign-history-meta">09 Jun 2026 · Campaign<\/div>/);
  assert.match(markup, /1 Offer · Saved/);
  assert.match(markup, />RC<\/span>/);
  assert.match(markup, /<button class="abtn btn-compact" onclick="restoreCampaignHistoryEntry\('abc'\)">Load<\/button>/);
  assert.match(markup, /<button class="abtn btn-compact" onclick="togglePinCampaignHistoryEntry\('abc'\)">Pin<\/button>/);
  assert.match(markup, /<button class="abtn red btn-compact" onclick="deleteCampaignHistoryEntry\('abc'\)">Delete<\/button>/);
});

test('campaign library thumbnail uses the same restore handler as the Load button without changing other actions', () => {
  const writes = [];
  const context = runFunctions([
    'campaignHistoryDisplayType',
    'campaignHistoryMeta',
    'escapeCampaignHistoryText',
    'renderCampaignHistoryEmptyState',
    'getCampaignThumbnailPayload',
    'getCampaignThumbnailName',
    'getCampaignThumbnailOffers',
    'isCampaignThumbnailOfferPresent',
    'getCampaignOperatorShortLabel',
    'getCampaignThumbnailOperatorLabels',
    'getCampaignThumbnailOperatorEntries',
    'getCampaignThumbnailOperatorKey',
    'campaignThumbnailRgba',
    'getCampaignThumbnailOperatorColour',
    'getCampaignThumbnailPillStyle',
    'getCampaignThumbnailOfferCount',
    'getCampaignThumbnailSavedTime',
    'renderCampaignThumbnail',
    'renderCampaignHistoryList'
  ], {
    formatCampaignDate: () => '09 Jun 2026',
    document: { getElementById: () => ({ set innerHTML(value) { writes.push(value); } }) }
  });

  context.renderCampaignHistoryList('recent-campaign-list', [{
    id: 'abc',
    title: 'Clickable Thumbnail Campaign',
    savedAt: '2026-06-09T12:00:00.000Z',
    payload: { state: { offers: [{ operator: 'royal', name: 'Loaded offer' }] } }
  }], 'No saved campaigns yet.');

  const markup = writes[0];
  const thumbnailRestoreCalls = markup.match(/class="campaign-thumbnail"[\s\S]*?onclick="restoreCampaignHistoryEntry\('abc'\)"/g) || [];
  const loadButtonRestoreCalls = markup.match(/<button class="abtn btn-compact" onclick="restoreCampaignHistoryEntry\('abc'\)">Load<\/button>/g) || [];

  assert.equal(thumbnailRestoreCalls.length, 1);
  assert.equal(loadButtonRestoreCalls.length, 1);
  assert.match(markup, /<button class="abtn btn-compact" onclick="togglePinCampaignHistoryEntry\('abc'\)">Pin<\/button>/);
  assert.match(markup, /<button class="abtn red btn-compact" onclick="deleteCampaignHistoryEntry\('abc'\)">Delete<\/button>/);
  assert.doesNotMatch(markup, /togglePinCampaignHistoryEntry\('abc'\)[\s\S]*class="campaign-thumbnail"/);
  assert.doesNotMatch(markup, /deleteCampaignHistoryEntry\('abc'\)[\s\S]*class="campaign-thumbnail"/);
});

test('campaign thumbnail data is generated at render time and not persisted to history entries', () => {
  const context = runFunctions(['campaignHistoryTitleFromPayload', 'buildCampaignHistoryEntryFromPayload'], {
    document: { getElementById: () => ({ value: '' }) }
  });
  const entry = context.buildCampaignHistoryEntryFromPayload({
    campaign: { name: 'No Stored Preview' },
    state: { offers: [{ operator: 'msc', name: 'Offer' }] }
  }, 'saved');

  assert.equal(entry.title, 'No Stored Preview');
  assert.equal(Object.hasOwn(entry, 'thumbnail'), false);
  assert.equal(Object.hasOwn(entry, 'thumbnailData'), false);
  assert.equal(Object.hasOwn(entry, 'screenshot'), false);
  assert.doesNotMatch(JSON.stringify(entry), /data:image|base64|html2canvas|thumbnail/i);
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
  const context = runFunctions(['campaignHistoryTime', 'sortCampaignHistory', 'sortCampaignHistoryNewest', 'isCampaignHistoryBackup', 'isCampaignHistoryCampaign', 'getCampaignLibraryBuckets'], {
    CAMPAIGN_RECENT_MAX: 20,
    readCampaignHistory: () => history
  });

  const buckets = context.getCampaignLibraryBuckets();

  assert.deepEqual(buckets.pinned.map(item => item.id), ['campaign-3', 'campaign-22']);
  assert.equal(buckets.recent.length, 20);
  assert.deepEqual(buckets.recent.map(item => item.id), history.slice(0, 20).map(item => item.id));
  assert.ok(buckets.recent.some(item => item.pinned), 'recent bucket should include pinned campaigns');
  assert.equal(buckets.backup.length, 0);
  assert.equal(Object.hasOwn(buckets, 'saved'), false);
});


test('campaign library separates campaign and backup entries into display buckets', () => {
  const history = [
    { id: 'campaign-1', title: 'Campaign 1', type: 'saved', updatedAt: '2026-06-09T12:00:00.000Z', recentAt: '2026-06-09T12:00:00.000Z', payload: {} },
    { id: 'backup-1', title: 'Backup 1', type: 'backup', updatedAt: '2026-06-09T12:01:00.000Z', recentAt: '2026-06-09T12:01:00.000Z', payload: {} },
    { id: 'campaign-2', title: 'Campaign 2', updatedAt: '2026-06-09T12:02:00.000Z', recentAt: '2026-06-09T12:02:00.000Z', payload: {} }
  ];
  const context = runFunctions(['campaignHistoryTime', 'sortCampaignHistory', 'sortCampaignHistoryNewest', 'isCampaignHistoryBackup', 'isCampaignHistoryCampaign', 'getCampaignLibraryBuckets'], {
    CAMPAIGN_RECENT_MAX: 20,
    readCampaignHistory: () => history
  });

  const buckets = context.getCampaignLibraryBuckets();

  assert.deepEqual(buckets.recent.map(item => item.id), ['campaign-2', 'campaign-1']);
  assert.deepEqual(buckets.backup.map(item => item.id), ['backup-1']);
});

test('campaign library refresh displays existing stored campaigns and backups in separate sections', () => {
  const history = [
    { id: 'campaign-1', title: 'Campaign 1', type: 'saved', updatedAt: '2026-06-09T12:00:00.000Z', recentAt: '2026-06-09T12:00:00.000Z', payload: {} },
    { id: 'backup-1', title: 'Backup 1', type: 'backup', updatedAt: '2026-06-09T12:01:00.000Z', recentAt: '2026-06-09T12:01:00.000Z', payload: {} }
  ];
  const rendered = new Map();
  const context = runFunctions([
    'campaignHistoryTime',
    'sortCampaignHistory',
    'sortCampaignHistoryNewest',
    'isCampaignHistoryBackup',
    'isCampaignHistoryCampaign',
    'getCampaignLibraryBuckets',
    'refreshCampaignHistoryUI'
  ], {
    CAMPAIGN_RECENT_MAX: 20,
    readCampaignHistory: () => history,
    renderCampaignLibraryDashboard: () => {},
    renderCampaignHistoryList: (targetId, items) => rendered.set(targetId, items.map(item => item.id))
  });

  context.refreshCampaignHistoryUI();

  assert.deepEqual(rendered.get('recent-campaign-list'), ['campaign-1']);
  assert.deepEqual(rendered.get('backup-campaign-list'), ['backup-1']);
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


test('campaign library reopens a stored backup through the same backup restore pipeline', () => {
  const storedPayload = { fileType: 'cruise-offer-builder-campaign', schemaVersion: '1.0', state: { offers: [{ name: 'Backup' }] } };
  const storage = new Map([['cobCampaignHistoryV1', JSON.stringify([{ id: 'backup', title: 'Backup', type: 'backup', payload: storedPayload }])]]);
  const calls = [];
  const context = runFunctions(['readCampaignHistory', 'restoreCampaignHistoryEntry'], {
    CAMPAIGN_HISTORY_KEY: 'cobCampaignHistoryV1',
    localStorage: { getItem: key => storage.get(key) || null },
    parseCampaignFileText: text => JSON.parse(text),
    restoreCampaignFilePayload: payload => calls.push(payload)
  });
  assert.equal(context.restoreCampaignHistoryEntry('backup'), true);
  assert.deepEqual(calls, [storedPayload]);
});

test('campaign library pin action toggles pinned state without changing stored campaign data', () => {
  const originalPayload = { state: { offers: [{ name: 'Pinned offer' }] } };
  let history = [{ id: 'abc', title: 'Pinned Campaign', type: 'saved', pinned: false, payload: originalPayload }];
  let refreshed = 0;
  const context = runFunctions(['campaignHistoryTime', 'sortCampaignHistory', 'togglePinCampaignHistoryEntry'], {
    readCampaignHistory: () => history,
    writeCampaignHistory: next => {
      history = next;
      return true;
    },
    refreshCampaignHistoryUI: () => { refreshed += 1; }
  });

  context.togglePinCampaignHistoryEntry('abc');

  assert.equal(history[0].pinned, true);
  assert.ok(history[0].pinnedAt);
  assert.deepEqual(history[0].payload, originalPayload);
  assert.equal(refreshed, 1);
});

test('campaign library delete action removes only the selected history entry and refreshes the library', () => {
  let history = [
    { id: 'abc', title: 'Delete Me', payload: { state: { offers: [{ name: 'Delete' }] } } },
    { id: 'keep', title: 'Keep Me', payload: { state: { offers: [{ name: 'Keep' }] } } }
  ];
  let refreshed = 0;
  const context = runFunctions(['deleteCampaignHistoryEntry'], {
    readCampaignHistory: () => history,
    writeCampaignHistory: next => {
      history = next;
      return true;
    },
    refreshCampaignHistoryUI: () => { refreshed += 1; }
  });

  context.deleteCampaignHistoryEntry('abc');

  assert.deepEqual(history.map(item => item.id), ['keep']);
  assert.equal(history[0].title, 'Keep Me');
  assert.equal(refreshed, 1);
});
