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

test('preview mode switches soft-fade within the premium transition window without animating layout or zoom dimensions', () => {
  assert.match(html, /#card-output\{[^}]*opacity:1;[^}]*transition:opacity \.22s ease-out;[^}]*\}/);
  assert.match(html, /#card-output\.preview-mode-transition\{opacity:0;\}/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{#card-output,\.view-pill,\.offer-pill\{transition:none;\}\}/);
  assert.match(html, /function fadePreviewModeIn\(\)\{[\s\S]*?out\.classList\.add\('preview-mode-transition'\);[\s\S]*?requestAnimationFrame\(function\(\)\{[\s\S]*?out\.classList\.remove\('preview-mode-transition'\);/);
  assert.match(html, /renderPreviewMode\(true\);\s*if\(didChange\) fadePreviewModeIn\(\);\s*queueAutosave\(\);/);
  assert.doesNotMatch(html, /#card-output[^}]*transition:[^;}]*(?:width|height|transform)/);
});

test('view selector keeps a transform-driven sliding gold indicator with subtly rounded segmented-control corners', () => {
  assert.match(html, /<span class="view-pill" id="view-pill" aria-hidden="true"><\/span>/);
  assert.match(html, /\.view-btns\{[^}]*border-radius:6px;[^}]*\}/);
  assert.match(html, /\.view-pill\{[^}]*border-radius:4px;[^}]*background:var\(--gold\);[^}]*transform:translateX\(0\);[^}]*transition:transform \.2s ease,width \.2s ease;/);
  assert.doesNotMatch(html, /\.(?:view-btns|view-pill)\{[^}]*border-radius:999px;/);
  assert.match(html, /\.vbtn\.active\{color:var\(--navy\);\}/);
  assert.match(html, /function updateSegmentedPill\(pill, activeButton\)\{[\s\S]*?pill\.style\.width = activeButton\.offsetWidth \+ 'px';[\s\S]*?pill\.style\.transform = 'translateX\(' \+ activeButton\.offsetLeft \+ 'px\)';/);
  assert.match(html, /syncViewSelector\(\);\s*renderPreviewMode\(true\);/);
  assert.match(html, /requestAnimationFrame\(function\(\)\{[\s\S]*?updateViewPill\(\);[\s\S]*?updateOfferPill\(\);/);
  assert.doesNotMatch(html, /\.vbtn\.active\{[^}]*background:/);
});



test('Offer 1–4 selector reuses the sliding segmented-control pill while retaining status dots and offer switching hooks', () => {
  assert.match(html, /<div class="offer-tabs">\s*<span class="offer-pill" id="offer-pill" aria-hidden="true"><\/span>/);
  assert.match(html, /\.offer-tabs\{[^}]*border:1px solid var\(--border\);[^}]*border-radius:6px;[^}]*overflow:hidden;[^}]*isolation:isolate;/);
  assert.match(html, /\.offer-pill\{[^}]*border-radius:4px;[^}]*background:var\(--gold\);[^}]*transform:translateX\(0\);[^}]*transition:transform \.2s ease,width \.2s ease;/);
  assert.doesNotMatch(html, /\.otab\.active\{[^}]*border-bottom/);
  assert.match(html, /\.otab\{[^}]*padding:5px 4px;[^}]*font-size:10px;[^}]*gap:1px;/);
  assert.match(html, /\.status-dot\{[^}]*width:8px;[^}]*height:8px;[^}]*flex-shrink:0;[^}]*border-radius:50%;/);
  assert.match(html, /\.status-dot\.green\{background:var\(--green\);\}\s*\.status-dot\.amber\{background:var\(--amber\);\}\s*\.status-dot\.red\{background:var\(--red\);\}/);
  for(let i = 0; i < 4; i += 1){
    assert.match(html, new RegExp('<button class="otab(?: active)?" id="ot' + i + '" onclick="sv\\(' + i + '\\)"[^>]*><span>Offer ' + (i + 1) + '<\\/span><span class="status-dot" id="sd' + i + '"><\\/span><\\/button>'));
  }
  assert.match(html, /function syncOfferSelector\(\)\{[\s\S]*?t\.classList\.toggle\('active', idx === activeIndex\);[\s\S]*?updateOfferPill\(\);/);
  assert.match(html, /function updateOfferPill\(\)\{\s*updateSegmentedPill\(document\.getElementById\('offer-pill'\), document\.getElementById\('ot' \+ cur\)\);/);
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
  assert.match(html, /scaler\.style\.width = '1200px';[\s\S]*?scaler\.style\.transform = 'scale\(' \+ scale \+ '\)';[\s\S]*?scaler\.style\.transformOrigin = 'top center';[\s\S]*?setTimeout\(function\(\)\{ scaler\.style\.height = \(out\.offsetHeight \* scale\) \+ 'px'; \}, 100\);/);
});

test('shared preview scaler retains stable dimensions for Email and All 4 layouts', () => {
  assert.match(html, /function setScalerBox\(width, renderedHeight, scale\)\{[\s\S]*?scaler\.style\.width = width \+ 'px';[\s\S]*?scaler\.style\.transform = 'scale\(' \+ scale \+ '\)';[\s\S]*?scaler\.style\.transformOrigin = 'top center';[\s\S]*?scaler\.style\.height = Math\.ceil\(renderedHeight \* scale\) \+ 'px';/);
  assert.match(html, /setTimeout\(function\(\)\{ setScalerBox\(1200, out\.offsetHeight \|\| stackWrap\.offsetHeight, baseScale \* EMAIL_PREVIEW_SCALE\); \}, 80\);/);
  assert.match(html, /setTimeout\(function\(\)\{[\s\S]*?const pane = getPreviewPaneSize\(\);[\s\S]*?setScalerBox\(gridW, fullH, Math\.max\(0\.08, fitScale\)\);[\s\S]*?\}, 120\);/);
});

test('preview-only scaling leaves export dimensions unchanged', () => {
  assert.match(html, /const exportWidth = 1200;/);
  assert.match(html, /width:1200px;min-width:1200px;max-width:1200px;transform:none;/);
});
