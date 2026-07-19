import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name){
  const marker = `function ${name}`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `${name} exists`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  for(let i = brace; i < html.length; i += 1){
    if(html[i] === '{') depth += 1;
    else if(html[i] === '}'){
      depth -= 1;
      if(depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`${name} function did not terminate`);
}

test('New Campaign and splash startup share the canonical blank session initialiser', () => {
  assert.match(extractFunction('resetBuilderToFreshSession'), /return resetBuilderToBlankSession\(type, \{feedback:"New campaign ready", clearSavedSession:true\}\);/);
  assert.match(html, /window\.openBuilderFromSplash = function\(event\)\{[\s\S]*?resetBuilderToBlankSession\(\);[\s\S]*?dismissSplashAndShowBuilder\("fresh"\);/);
  assert.match(html, /window\.openBuilderFromSplashCampaignType = function\(type,event\)\{[\s\S]*?resetBuilderToBlankSession\(type\);[\s\S]*?dismissSplashAndShowBuilder\("fresh"\);/);
  assert.doesNotMatch(html, /openBuilderFromSplashCampaignType[\s\S]{0,400}initialiseSplashCampaignType\(type\)/);
});

test('canonical blank session clears campaign, editor, import, OCR, parser, preview and async render state', () => {
  assert.match(html, /function resetBuilderToBlankSession\(type=currentCampaignType, options=\{\}\)\{[\s\S]*?const campaignType=normaliseCampaignType\(type\);/);
  assert.match(html, /function resetBuilderToBlankSession[\s\S]*?autosaveHydrating = true;[\s\S]*?offers = \[\{\},\{\},\{\},\{\}\];[\s\S]*?currentCampaignType = campaignType;/);
  assert.match(html, /function resetBuilderToBlankSession[\s\S]*?lockedOffers = \[false,false,false,false\];[\s\S]*?lockedHeroImages = \[false,false,false,false\];[\s\S]*?cur = 0;[\s\S]*?viewMode = "all";[\s\S]*?zoomPct = 32;/);
  assert.match(html, /"raw-paste","multi-offer-paste","sheets-url","f-utm-content","vision-review-text"/);
  assert.match(html, /"parse-result","multi-offer-result","sheets-status"[\s\S]*?"screenshot-import-review","ai-campaign-context-preview"/);
  assert.match(html, /function resetBuilderToBlankSession[\s\S]*?applySafeGlobalDefaults\(\);[\s\S]*?initialiseCampaignNamingDefaults\(\);[\s\S]*?load\(0\);[\s\S]*?refreshAfterRestore\(\);/);
  assert.match(html, /function resetBuilderToBlankSession[\s\S]*?resetCampaignHistoryBaseline\(\);[\s\S]*?markBuilderStateClean\(\);/);
});

test('transient reset invalidates stale preview frames and import/parser review buffers', () => {
  const transient = extractFunction('resetTransientCampaignState');
  assert.match(transient, /previewRenderGeneration \+= 1;/);
  assert.match(transient, /pendingParseResult = null;/);
  assert.match(transient, /pendingVisionImportItems = \[\];/);
  assert.match(transient, /selectedScreenshotImportIds = new Set\(\);/);
  assert.match(transient, /screenshotImportReviewItems = \[\];/);
  assert.match(transient, /clearActiveEditorDomFields\(\);[\s\S]*?clearCurrentPreviewOutputState\(\);/);
  assert.match(transient, /resetPasteOfferState\(\);[\s\S]*?resetMultiOfferState\(\);[\s\S]*?resetPoaSuggestionState\(\);/);
});
