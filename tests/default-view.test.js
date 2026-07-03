import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('fresh startup defaults to the All 4 preview with the matching active button and render path', () => {
  assert.match(html, /<button class="vbtn" id="vb-single"[^>]*>Single<\/button>/);
  assert.match(html, /<button class="vbtn" id="vb-email"[^>]*>Email<\/button>/);
  assert.match(html, /<button class="vbtn active" id="vb-all"[^>]*>All 4<\/button>/);
  assert.match(html, /let cur = 0, viewMode = "all", zoomPct = 32;/);
  assert.match(html, /function sv\(i\)\{[\s\S]*?renderPreviewMode\(true\);[\s\S]*?queueAutosave\(\);/);
});

test('autosave persists and restore reapplies an existing valid view preference through selector sync', () => {
  assert.match(html, /return \{version:'1\.0',savedAt:new Date\(\)\.toISOString\(\),cur,viewMode,/);
  assert.match(html, /if\(\["single","email","all"\]\.includes\(data\.viewMode\)\) viewMode = data\.viewMode;/);
  assert.match(html, /function applySessionPayload\(data\)\{[\s\S]*?syncViewSelector\(\);[\s\S]*?refreshAfterRestore\(\);/);
  assert.match(html, /function syncViewSelector\(\)\{[\s\S]*?b\.classList\.toggle\('active', x === viewMode\);[\s\S]*?updateViewPill\(\);/);
});

test('Single, Email and All 4 switching normalises state and renders the selected mode', () => {
  assert.match(html, /function normalisePreviewMode\(v\)\{\s*return \['single','email','all'\]\.includes\(v\) \? v : 'single';\s*\}/);
  assert.match(html, /function setView\(v\)\{[\s\S]*?viewMode = nextViewMode;[\s\S]*?syncViewSelector\(\);[\s\S]*?renderPreviewMode\(true\);[\s\S]*?queueAutosave\(\);/);
  assert.match(html, /function renderPreviewMode\(skipSave\)\{[\s\S]*?syncViewSelector\(\);[\s\S]*?if\(viewMode === 'email'\)[\s\S]*?if\(viewMode === 'all'\)[\s\S]*?renderVisibleCard\(\);/);
});

test('preview mode switches render immediately without fade, slide, or deferred mode transitions', () => {
  assert.match(html, /#card-output\{[^}]*opacity:1;[^}]*\}/);
  assert.doesNotMatch(html, /#card-output\{[^}]*transition:/);
  assert.doesNotMatch(html, /preview-mode-transition/);
  assert.doesNotMatch(html, /fadePreviewModeIn/);
  assert.match(html, /function setView\(v\)\{[\s\S]*?viewMode = nextViewMode;[\s\S]*?syncViewSelector\(\);[\s\S]*?renderPreviewMode\(true\);[\s\S]*?queueAutosave\(\);/);
  assert.doesNotMatch(html, /renderPreviewMode\(true\);\s*if\(didChange\)/);
});

test('view selector indicator updates instantly while retaining segmented-control styling', () => {
  assert.match(html, /<span class="view-pill" id="view-pill" aria-hidden="true"><\/span>/);
  assert.match(html, /\.view-btns\{[^}]*border-radius:6px;[^}]*\}/);
  assert.match(html, /\.view-pill\{[^}]*border-radius:4px;[^}]*background:linear-gradient\(180deg,#d4af37 0%,#b99a32 100%\);[^}]*transform:translateX\(0\);[^}]*pointer-events:none;\}/);
  assert.doesNotMatch(html, /\.view-pill\{[^}]*transition:/);
  assert.doesNotMatch(html, /\.(?:view-btns|view-pill)\{[^}]*border-radius:999px;/);
  assert.match(html, /\.vbtn\.active\{color:#0e1b2a;font-weight:800;/);
  assert.match(html, /function updateSegmentedPill\(pill, activeButton\)\{[\s\S]*?activeButton\.getBoundingClientRect\(\);[\s\S]*?container\.getBoundingClientRect\(\);[\s\S]*?pill\.style\.width = width \+ 'px';[\s\S]*?pill\.style\.transform = 'translate3d\(' \+ x \+ 'px,0,0\)';/);
  assert.match(html, /syncViewSelector\(\);[\s\S]*?runSpellQA\(\);[\s\S]*?renderPreviewMode\(true\);/);
  assert.match(html, /window\.addEventListener\('resize', queueSegmentedPillSync\);/);
  assert.match(html, /new ResizeObserver\(queueSegmentedPillSync\)/);
  assert.match(html, /document\.fonts\.ready\.then\(queueSegmentedPillSync\)/);
  assert.doesNotMatch(html, /\.vbtn\.active\{[^}]*background:/);
});



test('Offer 1–4 selector reuses the sliding segmented-control pill while retaining status accents and offer switching hooks', () => {
  assert.match(html, /<div class="offer-tabs empty-hidden">\s*<span class="offer-pill" id="offer-pill" aria-hidden="true"><\/span>/);
  assert.match(html, /<div class="offer-empty-state active" id="offer-empty-state" role="button" tabindex="0" title="Open Campaign Import" aria-label="Open Campaign Import" onclick="openCampaignImportFromEmptyState\(\)" onkeydown="handleEmptyOfferStateKeydown\(event\)">[\s\S]*?No offers loaded[\s\S]*?Load a sheet, CSV, campaign or paste an offer\./);
  assert.match(html, /\.offer-tabs\{[^}]*border:1px solid var\(--border\);[^}]*border-radius:0;[^}]*overflow:hidden;[^}]*isolation:isolate;/);
  assert.match(html, /\.offer-tabs\.empty-hidden\{display:none;\}/);
  assert.match(html, /\.offer-empty-state\{[^}]*min-height:56px;[^}]*padding:7px 12px;[^}]*border:1px solid var\(--border\);[^}]*border-radius:var\(--radius\);[^}]*background:transparent;[^}]*text-align:left;[^}]*cursor:pointer;[^}]*justify-content:center;/);
  assert.match(html, /\.offer-empty-state\.active\{display:flex;\}/);
  assert.match(html, /\.offer-empty-state-title\{[^}]*font-weight:600;[^}]*letter-spacing:0;[^}]*color:var\(--navy\);/);
  assert.match(html, /\.offer-empty-state-copy\{[^}]*font-size:9\.5px;[^}]*color:var\(--muted\);/);
  assert.match(html, /<div class="offer-context-label empty-hidden" id="active-offer-label" aria-live="polite">Editing Offer 1 of 4<\/div>/);
  assert.match(html, /\.offer-context-label\.empty-hidden\{display:none;\}/);
  assert.doesNotMatch(html, /\.offer-empty-state\{[^}]*background:var\(--gold\)/);
  assert.doesNotMatch(html, /\.offer-empty-state-title\{[^}]*text-transform:uppercase/);
  assert.doesNotMatch(html, /\.offer-empty-state-copy\{[^}]*text-shadow:/);
  assert.match(html, /\.offer-pill\{[^}]*border-radius:0;[^}]*background:#dedbd3;[^}]*transform:translateX\(0\);[^}]*transition:transform \.2s ease,width \.2s ease;/);
  assert.match(html, /\.otab\.active\{color:var\(--navy\);border-radius:0;box-shadow:inset 0 -2px 0 rgba\(14,27,42,\.18\);\}/);
  assert.doesNotMatch(html, /\.otab\.active\{[^}]*border-bottom/);
  assert.match(html, /\.offer-tab-item\{[^}]*position:relative;[^}]*flex:1;[^}]*min-width:0;/);
  assert.match(html, /\.otab\{[^}]*width:100%;[^}]*min-height:52px;[^}]*padding:8px 6px 18px;[^}]*font-size:10px;/);
  assert.match(html, /\.offer-tab-label\{[^}]*gap:3px;[^}]*line-height:1\.14;/);
  assert.match(html, /\.otab::after\{[^}]*position:absolute;[^}]*bottom:0;[^}]*height:2px;[^}]*background:transparent;/);
  assert.match(html, /\.otab\.status-green::after\{background:rgba\(42,122,74,\.72\);\}\s*\.otab\.status-amber::after\{background:rgba\(212,130,10,\.72\);\}\s*\.otab\.status-red::after\{background:rgba\(192,57,43,\.72\);\}/);
  for(let i = 0; i < 4; i += 1){
    assert.match(html, new RegExp('<div class="offer-tab-item"><button class="otab(?: active)?" id="ot' + i + '" onclick="sv\\(' + i + '\\)"[\\s\\S]*?<span class="offer-lock-toggle"[\\s\\S]*?<\\/span><\\/button><\\/div>'));
  }
  assert.doesNotMatch(html, /class="status-dot"|\.status-dot/);
  assert.match(html, /function syncOfferSelector\(\)\{[\s\S]*?updateEmptyOfferState\(\);[\s\S]*?t\.classList\.toggle\('active', idx === activeIndex\);[\s\S]*?updateOfferPill\(\);/);
  assert.match(html, /\.reorder-actions\.empty-hidden\{display:none;\}/);
  assert.match(html, /function updateEmptyOfferState\(\)\{[\s\S]*?reorderActions[\s\S]*?reorderActions\.classList\.toggle\("empty-hidden", !hasLoadedOffers\);[\s\S]*?activeLabel\.classList\.toggle\("empty-hidden", !hasLoadedOffers\);/);
  assert.match(html, /function updateOfferPill\(\)\{\s*const activeTab=document\.getElementById\('ot' \+ cur\);\s*updateSegmentedPill\(document\.getElementById\('offer-pill'\), activeTab&&activeTab\.parentElement\);/);
  assert.match(html, /function openCampaignImportFromEmptyState\(\)\{[\s\S]*?const isExpanded=isSectionExpandedByKey\(sectionKey\);[\s\S]*?if\(isExpanded\)\{[\s\S]*?setSectionCollapsedByHeader\(hdr, true\);[\s\S]*?return;[\s\S]*?openSectionByKey\(sectionKey\);[\s\S]*?scrollIntoView\(\{block:"start",behavior:"smooth"\}\);[\s\S]*?document\.getElementById\("sheets-url"\);[\s\S]*?focus\(\{preventScroll:true\}\);[\s\S]*?queueAutosave\(\);/);
  assert.match(html, /function handleEmptyOfferStateKeydown\(event\)\{[\s\S]*?event\.key!=="Enter"&&event\.key!==" "[\s\S]*?event\.preventDefault\(\);[\s\S]*?openCampaignImportFromEmptyState\(\);/);
});

test('Single, Email and All 4 previews share the same zoom scaling controls', () => {
  assert.match(html, /const SINGLE_PREVIEW_SCALE = 0\.75;/);
  assert.match(html, /const EMAIL_PREVIEW_SCALE = 0\.75;/);
  assert.match(html, /const scale = \(zoomPct \/ 100\) \* SINGLE_PREVIEW_SCALE;/);
  assert.match(html, /setScalerBox\(1200, out\.offsetHeight \|\| stackWrap\.offsetHeight, baseScale \* EMAIL_PREVIEW_SCALE\);/);
  assert.match(html, /const allScale = baseScale \* SINGLE_PREVIEW_SCALE;/);
  assert.match(html, /transform:scale\(' \+ allScale \+ '\);transform-origin:top center;/);
  assert.match(html, /setScalerBox\(gridW, fullH, 1\);[\s\S]*?scaler\.style\.height = Math\.ceil\(fullH \* allScale\) \+ 'px';/);
  assert.doesNotMatch(html, /const fitScale = Math\.min\(pane\.w \/ gridW, pane\.h \/ fullH, 0\.32\);/);
});

test('preview canvas uses a slightly darker warm neutral background across modes', () => {
  assert.match(html, /\.preview-wrap\{[^}]*background:#dedad2;[^}]*\}/);
});

test('preview layout retains the stable shared canvas treatment without Single-only overrides', () => {
  assert.match(html, /\.preview-wrap\{[^}]*justify-content:center;[^}]*align-items:stretch;[^}]*background:#dedad2;[^}]*\}/);
  assert.match(html, /\.preview-scaler\{margin-block:auto;transform-origin:top center;will-change:transform;\}/);
  assert.doesNotMatch(html, /single-preview/);
  assert.doesNotMatch(html, /setSinglePreviewCanvasHeight/);
  assert.doesNotMatch(html, /setPreviewWrapMode/);
  assert.match(html, /scaler\.style\.width = '1200px';[\s\S]*?scaler\.style\.transform = 'scale\(' \+ scale \+ '\)';[\s\S]*?scaler\.style\.transformOrigin = 'top center';[\s\S]*?scaler\.style\.height = Math\.ceil\(out\.offsetHeight \* scale\) \+ 'px';/);
});

test('shared preview scaler retains stable dimensions for Email and All 4 layouts', () => {
  assert.match(html, /function setScalerBox\(width, renderedHeight, scale\)\{[\s\S]*?scaler\.style\.width = width \+ 'px';[\s\S]*?scaler\.style\.transform = 'scale\(' \+ scale \+ '\)';[\s\S]*?scaler\.style\.transformOrigin = 'top center';[\s\S]*?scaler\.style\.height = Math\.ceil\(renderedHeight \* scale\) \+ 'px';/);
  assert.match(html, /setScalerBox\(1200, out\.offsetHeight \|\| stackWrap\.offsetHeight, baseScale \* EMAIL_PREVIEW_SCALE\);/);
  assert.match(html, /const fullH = grid\.offsetHeight \|\| out\.offsetHeight \|\| 4600;[\s\S]*?setScalerBox\(gridW, fullH, 1\);[\s\S]*?scaler\.style\.height = Math\.ceil\(fullH \* allScale\) \+ 'px';/);
});

test('preview-only scaling leaves export dimensions unchanged', () => {
  assert.match(html, /const exportWidth = 1200;/);
  assert.match(html, /width:1200px;min-width:1200px;max-width:1200px;transform:none;/);
});
