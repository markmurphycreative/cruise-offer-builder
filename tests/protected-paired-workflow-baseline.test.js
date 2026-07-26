import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const baseline = fs.readFileSync(new URL('../docs/protected-working-baseline.md', import.meta.url), 'utf8');

function extractFunction(name) {
  const signature = html.match(new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{`));
  assert.ok(signature, `${name} must exist`);
  const start = signature.index;
  const open = start + signature[0].length - 1;
  let depth = 0;
  for (let index = open; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`${name} must have a complete body`);
}

test('records the exact approved implementation commit as the permanent baseline', () => {
  assert.match(baseline, /6e098ce0e45a5f6642b7ade5610640efb9f37e10/);
  assert.match(baseline, /source of truth/i);
  assert.match(baseline, /Cruise and Package working baseline/);
});

test('protects the compact instant Arrange Cards UI and excludes replacement workflows', () => {
  const control = html.match(/<div class="reorder-group" aria-label="Arrange Cards controls">[\s\S]*?\n  <\/div>/)?.[0] || '';
  assert.match(control, /<span>Arrange Cards<\/span>/);
  assert.match(control, /id="move-left-btn" onclick="moveOfferLeft\(\)"/);
  assert.match(control, /id="move-right-btn" onclick="moveOfferRight\(\)"/);
  assert.match(html, /tab\.addEventListener\('drop',[\s\S]*?moveOfferState\(dragFrom, idx\)/);
  assert.doesNotMatch(html, /arrange-cards-modal|openArrangeCardsModal|confirmArrangeCards|Confirm Order/);
});

test('reorder is atomic and refreshes UTMs, views, summaries, exports, then autosave', () => {
  const move = extractFunction('moveOfferState');
  assert.match(move, /offers\.splice\(fromIdx, 1\)[\s\S]*offers\.splice\(toIdx, 0, movedOffer\)/);
  assert.match(move, /lockedOffers\.splice\(fromIdx, 1\)[\s\S]*lockedOffers\.splice\(toIdx, 0, movedLock\)/);
  assert.match(move, /refreshAfterOfferReorder\(\)/);

  const refresh = extractFunction('refreshAfterOfferReorder');
  const orderedCalls = ['syncOfferSelector()', 'genUtm()', 'genAllUtms(true)', 'genStandardUtms()', 'updateAllStatus()', 'updateExportFilenames()', 'renderPreviewMode(true)', 'queueAutosave({immediate:true})'];
  let previous = -1;
  for (const call of orderedCalls) {
    const position = refresh.indexOf(call);
    assert.ok(position > previous, `${call} must run in the protected refresh order`);
    previous = position;
  }
});

test('keeps detailed Tracking Links complete and shared by Cruise and Package', () => {
  const section = html.match(/<div class="section" data-section-key="utm-link">[\s\S]*?<div class="section" data-section-key=/)?.[0] || '';
  assert.match(section, />Tracking Links</);
  assert.match(section, />Operator Landing Page</);
  assert.match(section, /id="f-url"/);
  assert.match(section, /id="utm-current-card"/);
  assert.match(section, /id="utm-generated-list"/);
  assert.match(section, /id="utm-visible-output"/);
  const renderer = extractFunction('renderGeneratedUtmCards');
  assert.match(renderer, /onclick="copyAllUtms\(\)">Copy All UTMs/);
  assert.match(renderer, /onclick="copyUtm\(\$\{item\.index\}, this\)"[\s\S]*>Copy<\/button>/);
  assert.doesNotMatch(section, /currentCampaignType\s*===|campaignType\s*===/);
});

test('import drafts are inert and autosave serializes only authoritative campaign offers', () => {
  assert.match(extractFunction('handleMultiOfferKeydown'), /Load Offers is the sole import\/replace entry point[\s\S]*return false/);
  assert.doesNotMatch(extractFunction('handleMultiOfferInput'), /loadMultiOffers|applyParsedOffer|offers\s*=|offers\.splice/);
  assert.doesNotMatch(extractFunction('resetMultiImportedOffersFromEmptyPaste'), /offers\s*=|offers\.splice|applyParsedOffer/);

  const autosave = extractFunction('buildAutosavePayload');
  assert.match(autosave, /getActiveOfferCollection\(activeCampaignType\)/);
  assert.doesNotMatch(autosave, /multi-offer-paste|raw-paste|pendingParseResult|pendingScreenshotImports|innerHTML/);
});

test('campaignType is authoritative across save, restore, import, and isolated collections', () => {
  const restore = extractFunction('applySessionPayload');
  assert.match(restore, /restoreType=normaliseCampaignType\(\(data\.campaign&&data\.campaign\.campaignType\) \|\| data\.campaignType \|\| "cruise"\)/);
  assert.match(restore, /replaceCampaignModel\(restoreType\)/);
  assert.match(restore, /stampOfferCollectionCampaignType\(offers,restoreType\)/);
  assert.match(restore, /if\(restoreType==="package"\) packageOffers=offers; else cruiseOffers=offers/);

  const parse = extractFunction('parseOffer');
  assert.match(parse, /campaignType=normaliseCampaignType\(currentCampaignType\)/);
  assert.match(parse, /campaignType==="package"[\s\S]*parsePackageOfferText/);
  assert.match(parse, /parseOfferText/);
  assert.match(extractFunction('performMultiOfferImport'), /currentCampaignType==="package"[\s\S]*Cruise Trello text import is available only in a Cruise campaign/);
});

test('All 4 retains separate native geometries and scales one complete 2-by-2 canvas', () => {
  const geometry = extractFunction('getAllPreviewCardGeometry');
  assert.match(geometry, /type === 'package'/);
  assert.match(geometry, /width:1200, height:885, fixedHeight:true/);
  assert.match(geometry, /width:1200, height:null, fixedHeight:false/);

  const render = extractFunction('renderPreviewMode');
  assert.match(render, /stage\.className = 'all-preview-stage'/);
  assert.match(render, /canvas\.className = 'all-preview-canvas'/);
  assert.match(render, /grid\.className = 'all-preview-grid'/);
  assert.match(render, /grid\.style\.gridTemplateColumns = Array\(metrics\.columns\)\.fill\(metrics\.cardWidth \+ 'px'\)\.join\(' '\)/);
  assert.match(render, /cards\.forEach\(function\(c\)/);
  assert.match(render, /prepareAllPreviewLayout\(stage, canvas, metrics, entryPane\)/);
  assert.match(extractFunction('applyAllPreviewLayout'), /canvas\.style\.transform = 'scale\(' \+ scale \+ '\)'/);
});

test('paired reopen path preserves typed offers without cross-campaign field inference', () => {
  const payload = extractFunction('buildCampaignFilePayload');
  assert.match(payload, /makePortableCampaignOffers\(getActiveOfferCollection\(currentCampaignType\)\)/);
  assert.match(payload, /campaignType:currentCampaignType/);

  const restore = extractFunction('applySessionPayload');
  assert.doesNotMatch(restore, /offerType.*\?.*package|operator.*\?.*package|ship.*\?.*package/);
  assert.match(extractFunction('syncOffersAliasForCampaign'), /getActiveOfferCollection\(currentCampaignType\)/);
  assert.match(extractFunction('createCampaignModel'), /cruiseOffers:createBlankOfferSlotsForCampaign\("cruise"\)[\s\S]*packageOffers:createBlankOfferSlotsForCampaign\("package"\)/);
});
