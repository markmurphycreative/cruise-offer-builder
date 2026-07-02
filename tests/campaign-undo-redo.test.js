import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not find ${label}`);
  return match[0];
}

test('campaign history is capped to 20 undo and redo states', () => {
  assert.match(html, /const CAMPAIGN_HISTORY_LIMIT = 20;/);
  assert.match(html, /function trimCampaignHistoryStack\(stack\)\{ while\(stack\.length > CAMPAIGN_HISTORY_LIMIT\) stack\.shift\(\); \}/);
  assert.match(html, /campaignHistoryState\.undoStack\.push\(campaignHistoryState\.current\);[\s\S]*?trimCampaignHistoryStack\(campaignHistoryState\.undoStack\);/);
  assert.match(html, /campaignHistoryState\.redoStack\.push\(campaignHistoryState\.current\);[\s\S]*?trimCampaignHistoryStack\(campaignHistoryState\.redoStack\);/);
});

test('campaign history snapshots restore campaign state instead of reversing individual UI actions', () => {
  const block = extract(/\/\/ CAMPAIGN UNDO \/ REDO HISTORY[\s\S]*?function recordCampaignHistoryAfterAsyncChange/, 'campaign undo/redo history block');
  assert.match(block, /offers:clonePlain\(offers \|\| \[\{\},\{\},\{\},\{\}\]\)\.slice\(0,4\)/);
  assert.match(block, /viewMode:typeof viewMode === \"string\" \? viewMode : \"all\"/);
  assert.match(block, /campaign,\n\s*ctaSettings:/);
  assert.match(block, /lockedOffers:Array\.isArray\(lockedOffers\)/);
  assert.match(block, /lockedHeroImages:Array\.isArray\(lockedHeroImages\)/);
  assert.match(block, /restoreCampaignHistorySnapshot\(snapshot\)/);
  assert.match(block, /offers=Array\.isArray\(data\.offers\)/);
  assert.match(block, /applyCtaSettings\(data\.ctaSettings \|\| CTA_DEFAULTS\)/);
  assert.match(block, /viewMode=\[\"single\",\"all\",\"email\"\]\.includes\(data\.viewMode\) \? data\.viewMode : \"all\"/);
  assert.match(block, /syncViewSelector\(\)/);
  assert.match(block, /loadOfferToEditor\(cur\)/);
  assert.match(block, /refreshAfterRestore\(\)/);
});


test('history restore clears transient Paste Offer UI when undo returns active offer to blank', () => {
  const block = extract(/function syncPasteOfferStateAfterHistoryRestore[\s\S]*?function restoreCampaignHistorySnapshot/, 'paste offer history restore sync block');
  assert.match(block, /const activeOffer=\(offers\|\|\[\]\)\[cur\]\|\|\{\};/);
  assert.match(block, /const hasLoadedOffers=Array\.isArray\(offers\)&&offers\.some\(isOfferLoaded\);/);
  assert.match(block, /if\(!hasLoadedOffers \|\| !isOfferLoaded\(activeOffer\)\)\{[\s\S]*?resetPasteOfferState\(\);[\s\S]*?\}/);
  const restoreBlock = extract(/function restoreCampaignHistorySnapshot\(snapshot\)\{[\s\S]*?finally\{[\s\S]*?\n  \}/, 'campaign history restore function');
  assert.match(restoreBlock, /syncPasteOfferStateAfterHistoryRestore\(\);[\s\S]*?refreshAfterRestore\(\)/);
});

test('history snapshots intern unchanged image payloads by reference', () => {
  const block = extract(/function encodeCampaignHistoryImages[\s\S]*?function decodeCampaignHistoryImages/, 'image interning helpers');
  assert.match(block, /campaignHistoryImageRefs\.get\(imageKey\)/);
  assert.match(block, /campaignHistoryImages\.set\(ref,imageKey\)/);
  assert.match(block, /__campaignHistoryImageRef:ref/);
});

test('meaningful campaign changes are recorded while view-only changes are excluded', () => {
  assert.match(html, /isCampaignHistoryMeaningfulTarget\(el\)[\s\S]*?\["zoom-slider","sheets-url","preset-select"\]\.includes\(el\.id\)/);
  assert.match(html, /el\.id\.startsWith\("g-"\) \|\| el\.id\.startsWith\("f-"\) \|\| el\.id\.startsWith\("cta-"\) \|\| el\.id\.startsWith\("crop-"\)/);
  assert.match(html, /recordCampaignHistoryAfterAsyncChange\(type==="hero"\?"Hero image change":\(type==="itinerary"\?"Route map change":"Logo image change"\)\)/);
  assert.match(html, /recordCampaignHistoryAfterAsyncChange\("Card reorder"\)/);
  assert.match(html, /recordCampaignHistoryAfterAsyncChange\("CSV import"\)/);
  assert.match(html, /recordCampaignHistoryAfterAsyncChange\("Google Sheet import"\)/);
  assert.match(html, /recordCampaignHistoryAfterAsyncChange\("Campaign load"\)/);
  assert.match(html, /recordCampaignHistoryAfterAsyncChange\("Session restore"\)/);
  assert.doesNotMatch(extract(/function setView\(v\)\{[\s\S]*?\n\}/, 'setView function'), /recordCampaignHistory/);
});

test('text input history entries are debounced and keyboard undo/redo is wired', () => {
  assert.match(html, /const CAMPAIGN_HISTORY_TEXT_DEBOUNCE_MS = 650;/);
  assert.match(html, /scheduleCampaignHistoryEntry\("Campaign field edit", isCampaignHistoryTextInput\(el\) \? CAMPAIGN_HISTORY_TEXT_DEBOUNCE_MS : 280\)/);
  assert.match(html, /event\.key\.toLowerCase\(\) === 'z'[\s\S]*?if\(event\.shiftKey\) redoCampaignChange\(\);[\s\S]*?else undoCampaignChange\(\);/);
});


test('async user actions commit immediately so sequential Load Offer actions stay separate', () => {
  const block = extract(/function recordCampaignHistoryAfterAsyncChange\(label="Campaign change"\)\{[\s\S]*?\n\}/, 'async history recorder');
  assert.match(block, /commitCampaignHistoryEntry\(label\);/);
  assert.doesNotMatch(block, /scheduleCampaignHistoryEntry\(label,0\)/);
  assert.match(html, /if\(applied\)\{ if\(typeof recordCampaignHistoryAfterAsyncChange==="function"\) recordCampaignHistoryAfterAsyncChange\("Offer loaded"\)/);
  assert.match(html, /if\(results\.length&&typeof recordCampaignHistoryAfterAsyncChange==="function"\) recordCampaignHistoryAfterAsyncChange\("Multi offer import"\)/);
});

function createCampaignHistoryHarness() {
  const historyBlock = extract(/const CAMPAIGN_HISTORY_LIMIT = 20;[\s\S]*?function redoCampaignChange\(\)\{[\s\S]*?\n\}/, 'executable campaign history functions');
  const context = {
    console,
    clearTimeout,
    setTimeout,
    autosaveHydrating: false,
    cur: 0,
    viewMode: 'all',
    ctaSettings: {},
    lockedOffers: [false,false,false,false],
    lockedHeroImages: [false,false,false,false],
    offers: [{},{},{},{}],
    document: { getElementById(){ return null; } },
    normaliseCtaSettings: value => value || {},
    normaliseHeroLockArray: value => Array.isArray(value) ? value.slice(0,4) : [false,false,false,false],
    isOfferLoaded: offer => !!(offer && offer.name),
    resetPasteOfferState(){},
    resetMultiOfferState(){},
    loadOfferToEditor(index){
      if (context.offers[index] && !context.offers[index]._heroFitMode) context.offers[index]._heroFitMode = 'fill';
    },
    refreshAfterRestore(){},
    queueAutosave(){},
  };
  vm.createContext(context);
  vm.runInContext(`${historyBlock}\nthis.api={campaignHistoryState,resetCampaignHistoryBaseline,commitCampaignHistoryEntry,undoCampaignChange,redoCampaignChange};`, context);
  return context;
}

function loadedOfferCount(offers) {
  return offers.filter(offer => offer && offer.name).length;
}

test('sequential Load Offer commits walk the full undo and redo stack', () => {
  const harness = createCampaignHistoryHarness();
  harness.api.resetCampaignHistoryBaseline();
  for (let index = 0; index < 4; index += 1) {
    harness.offers[index] = { name: `Offer ${index + 1}` };
    harness.cur = index;
    assert.equal(harness.api.commitCampaignHistoryEntry('Offer loaded'), true);
    assert.equal(harness.api.campaignHistoryState.undoStack.length, index + 1);
  }
  assert.equal(loadedOfferCount(harness.offers), 4);
  for (const expectedCount of [3,2,1,0]) {
    assert.equal(harness.api.undoCampaignChange(), true);
    assert.equal(loadedOfferCount(harness.offers), expectedCount);
  }
  for (const expectedCount of [1,2,3,4]) {
    assert.equal(harness.api.redoCampaignChange(), true);
    assert.equal(loadedOfferCount(harness.offers), expectedCount);
  }
});

test('history undo skips restore-normalisation duplicates instead of stopping at one previous state', () => {
  const harness = createCampaignHistoryHarness();
  harness.api.resetCampaignHistoryBaseline();
  for (let index = 0; index < 4; index += 1) {
    harness.offers[index] = { name: `Offer ${index + 1}` };
    harness.cur = index;
    harness.api.commitCampaignHistoryEntry('Offer loaded');
  }
  assert.equal(harness.api.undoCampaignChange(), true);
  assert.equal(loadedOfferCount(harness.offers), 3);
  assert.equal(harness.offers[harness.cur]._heroFitMode, 'fill');
  assert.equal(harness.api.undoCampaignChange(), true);
  assert.equal(loadedOfferCount(harness.offers), 2);
});

test('multi offer import is stored as one undoable batch', () => {
  const harness = createCampaignHistoryHarness();
  harness.api.resetCampaignHistoryBaseline();
  harness.offers = [1,2,3,4].map(index => ({ name: `Imported ${index}` }));
  assert.equal(harness.api.commitCampaignHistoryEntry('Multi offer import'), true);
  assert.equal(loadedOfferCount(harness.offers), 4);
  assert.equal(harness.api.undoCampaignChange(), true);
  assert.equal(loadedOfferCount(harness.offers), 0);
});

test('multiple hero replacements undo one replacement at a time', () => {
  const harness = createCampaignHistoryHarness();
  harness.api.resetCampaignHistoryBaseline();
  harness.offers[0] = { name: 'Offer 1', _img: 'hero-one' };
  harness.api.commitCampaignHistoryEntry('Hero image change');
  harness.offers[0] = { ...harness.offers[0], _img: 'hero-two' };
  harness.api.commitCampaignHistoryEntry('Hero image change');
  harness.offers[0] = { ...harness.offers[0], _img: 'hero-three' };
  harness.api.commitCampaignHistoryEntry('Hero image change');
  assert.equal(harness.api.undoCampaignChange(), true);
  assert.equal(harness.offers[0]._img, 'hero-two');
  assert.equal(harness.api.undoCampaignChange(), true);
  assert.equal(harness.offers[0]._img, 'hero-one');
});

test('manual text edits debounce into meaningful snapshots without preview/autosave entries', () => {
  const harness = createCampaignHistoryHarness();
  harness.api.resetCampaignHistoryBaseline();
  harness.offers[0] = { name: 'First edit' };
  harness.api.commitCampaignHistoryEntry('Campaign field edit');
  harness.offers[0] = { name: 'Second edit' };
  harness.api.commitCampaignHistoryEntry('Campaign field edit');
  const undoDepthBeforePreviewSwitch = harness.api.campaignHistoryState.undoStack.length;
  harness.viewMode = 'email';
  assert.equal(harness.api.campaignHistoryState.undoStack.length, undoDepthBeforePreviewSwitch);
  assert.equal(harness.api.undoCampaignChange(), true);
  assert.equal(harness.offers[0].name, 'First edit');
  assert.equal(harness.api.undoCampaignChange(), true);
  assert.equal(harness.offers[0].name, undefined);
  harness.autosaveHydrating = true;
  harness.offers[0] = { name: 'Autosave restore' };
  assert.equal(harness.api.commitCampaignHistoryEntry('Autosave'), false);
});
