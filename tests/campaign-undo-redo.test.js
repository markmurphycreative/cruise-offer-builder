import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

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
  assert.match(block, /campaign,\n\s*ctaSettings:/);
  assert.match(block, /lockedOffers:Array\.isArray\(lockedOffers\)/);
  assert.match(block, /lockedHeroImages:Array\.isArray\(lockedHeroImages\)/);
  assert.match(block, /restoreCampaignHistorySnapshot\(snapshot\)/);
  assert.match(block, /offers=Array\.isArray\(data\.offers\)/);
  assert.match(block, /applyCtaSettings\(data\.ctaSettings \|\| CTA_DEFAULTS\)/);
  assert.match(block, /loadOfferToEditor\(cur\)/);
  assert.match(block, /refreshAfterRestore\(\)/);
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
  assert.match(html, /recordCampaignHistoryAfterAsyncChange\(type==="hero"\?"Hero image change":"Logo image change"\)/);
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
