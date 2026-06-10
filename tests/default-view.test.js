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
  assert.match(html, /\.view-pill\{[^}]*border-radius:4px;[^}]*background:var\(--gold\);[^}]*transform:translateX\(0\);[^}]*pointer-events:none;\}/);
  assert.doesNotMatch(html, /\.view-pill\{[^}]*transition:/);
  assert.doesNotMatch(html, /\.(?:view-btns|view-pill)\{[^}]*border-radius:999px;/);
  assert.match(html, /\.vbtn\.active\{color:var\(--navy\);\}/);
  assert.match(html, /function updateSegmentedPill\(pill, activeButton\)\{[\s\S]*?pill\.style\.width = activeButton\.offsetWidth \+ 'px';[\s\S]*?pill\.style\.transform = 'translateX\(' \+ activeButton\.offsetLeft \+ 'px\)';/);
  assert.match(html, /syncViewSelector\(\);\s*renderPreviewMode\(true\);/);
  assert.match(html, /window\.addEventListener\('resize', function\(\)\{[\s\S]*?updateViewPill\(\);[\s\S]*?updateOfferPill\(\);/);
  assert.doesNotMatch(html, /\.vbtn\.active\{[^}]*background:/);
});



test('Offer 1–4 selector reuses the sliding segmented-control pill while retaining status dots and offer switching hooks', () => {
  assert.match(html, /<div class="offer-tabs">\s*<span class="offer-pill" id="offer-pill" aria-hidden="true"><\/span>/);
  assert.match(html, /\.offer-tabs\{[^}]*border:1px solid var\(--border\);[^}]*border-radius:4px;[^}]*overflow:hidden;[^}]*isolation:isolate;/);
  assert.match(html, /\.offer-pill\{[^}]*border-radius:2px;[^}]*background:var\(--gold\);[^}]*transform:translateX\(0\);[^}]*transition:transform \.2s ease,width \.2s ease;/);
  assert.match(html, /\.otab\.active\{color:var\(--navy\);border-radius:2px;\}/);
  assert.doesNotMatch(html, /\.otab\.active\{[^}]*border-bottom/);
  assert.match(html, /\.offer-tab-item\{[^}]*position:relative;[^}]*flex:1;[^}]*min-width:0;/);
  assert.match(html, /\.otab\{[^}]*width:100%;[^}]*padding:5px 4px 14px;[^}]*font-size:10px;/);
  assert.match(html, /\.status-dot\{[^}]*position:absolute;[^}]*width:8px;[^}]*height:8px;[^}]*border-radius:50%;/);
  assert.match(html, /\.status-dot\.green\{background:var\(--green\);\}\s*\.status-dot\.amber\{background:var\(--amber\);\}\s*\.status-dot\.red\{background:var\(--red\);\}/);
  for(let i = 0; i < 4; i += 1){
    assert.match(html, new RegExp('<div class="offer-tab-item"><button class="otab(?: active)?" id="ot' + i + '" onclick="sv\\(' + i + '\\)"[^>]*><span>Offer ' + (i + 1) + '<\/span><span class="status-dot" id="sd' + i + '" title="No offer loaded" aria-hidden="true"><\/span><\/button><\/div>'));
  }
  assert.match(html, /function syncOfferSelector\(\)\{[\s\S]*?t\.classList\.toggle\('active', idx === activeIndex\);[\s\S]*?updateOfferPill\(\);/);
  assert.match(html, /function updateOfferPill\(\)\{\s*const activeTab=document\.getElementById\('ot' \+ cur\);\s*updateSegmentedPill\(document\.getElementById\('offer-pill'\), activeTab&&activeTab\.parentElement\);/);
});

test('Single and Email previews display at 75% of their prior on-screen scale while All 4 retains its fit scale', () => {
  assert.match(html, /const SINGLE_PREVIEW_SCALE = 0\.75;/);
  assert.match(html, /const EMAIL_PREVIEW_SCALE = 0\.75;/);
  assert.match(html, /const scale = \(zoomPct \/ 100\) \* SINGLE_PREVIEW_SCALE;/);
  assert.match(html, /setScalerBox\(1200, out\.offsetHeight \|\| stackWrap\.offsetHeight, baseScale \* EMAIL_PREVIEW_SCALE\);/);
  assert.match(html, /const fitScale = Math\.min\(pane\.w \/ gridW, pane\.h \/ fullH, 0\.32\);/);
  assert.match(html, /setScalerBox\(gridW, fullH, Math\.max\(0\.08, fitScale\)\);/);
});

test('preview canvas uses a slightly darker warm neutral background across modes', () => {
  assert.match(html, /\.preview-wrap\{[^}]*background:#dedad2;[^}]*\}/);
});

test('preview layout retains the stable shared canvas treatment without Single-only overrides', () => {
  assert.match(html, /\.preview-wrap\{[^}]*justify-content:center;[^}]*align-items:stretch;[^}]*background:#dedad2;[^}]*\}/);
  assert.match(html, /\.preview-scaler\{margin-block:auto;transform-origin:top center;\}/);
  assert.doesNotMatch(html, /single-preview/);
  assert.doesNotMatch(html, /setSinglePreviewCanvasHeight/);
  assert.doesNotMatch(html, /setPreviewWrapMode/);
  assert.match(html, /scaler\.style\.width = '1200px';[\s\S]*?scaler\.style\.transform = 'scale\(' \+ scale \+ '\)';[\s\S]*?scaler\.style\.transformOrigin = 'top center';[\s\S]*?scaler\.style\.height = Math\.ceil\(out\.offsetHeight \* scale\) \+ 'px';/);
});

test('shared preview scaler retains stable dimensions for Email and All 4 layouts', () => {
  assert.match(html, /function setScalerBox\(width, renderedHeight, scale\)\{[\s\S]*?scaler\.style\.width = width \+ 'px';[\s\S]*?scaler\.style\.transform = 'scale\(' \+ scale \+ '\)';[\s\S]*?scaler\.style\.transformOrigin = 'top center';[\s\S]*?scaler\.style\.height = Math\.ceil\(renderedHeight \* scale\) \+ 'px';/);
  assert.match(html, /setScalerBox\(1200, out\.offsetHeight \|\| stackWrap\.offsetHeight, baseScale \* EMAIL_PREVIEW_SCALE\);/);
  assert.match(html, /const pane = getPreviewPaneSize\(\);[\s\S]*?const fullH = grid\.offsetHeight \|\| out\.offsetHeight \|\| 4600;[\s\S]*?setScalerBox\(gridW, fullH, Math\.max\(0\.08, fitScale\)\);/);
});

test('preview-only scaling leaves export dimensions unchanged', () => {
  assert.match(html, /const exportWidth = 1200;/);
  assert.match(html, /width:1200px;min-width:1200px;max-width:1200px;transform:none;/);
});
