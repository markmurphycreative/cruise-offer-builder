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
  assert.match(html, /return \{version:'1\.0',savedAt:new Date\(\)\.toISOString\(\),cur,viewMode,builderMode,/);
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
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{#card-output,\.view-pill\{transition:none;\}\}/);
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
  assert.match(html, /function updateViewPill\(\)\{[\s\S]*?pill\.style\.width = activeButton\.offsetWidth \+ 'px';[\s\S]*?pill\.style\.transform = 'translateX\(' \+ activeButton\.offsetLeft \+ 'px\)';/);
  assert.match(html, /syncViewSelector\(\);\s*renderPreviewMode\(true\);/);
  assert.match(html, /requestAnimationFrame\(updateViewPill\);/);
  assert.doesNotMatch(html, /\.vbtn\.active\{[^}]*background:/);
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

test('Single preview uses a centred scaled footprint without changing card dimensions', () => {
  assert.match(html, /\.preview-wrap\{[^}]*justify-content:center;[^}]*align-items:flex-start;[^}]*\}/);
  assert.match(html, /\.preview-scaler\{flex:0 0 auto;margin-block:0;\}/);
  assert.match(html, /#card-output\{[^}]*transform-origin:top left;[^}]*\}/);
  assert.match(html, /out\.style\.left = '';/);
  assert.match(html, /out\.style\.transformOrigin = 'top left';/);
  assert.match(html, /out\.style\.transform = 'scale\(' \+ scale \+ '\)';/);
  assert.doesNotMatch(html, /out\.style\.left = '50%';/);
  assert.doesNotMatch(html, /out\.style\.transform = 'translateX\(-50%\) scale/);
  assert.match(html, /\.cc\{width:1200px;/);
});

test('Single preview canvas height follows the scaled card footprint plus normal padding only', () => {
  assert.match(html, /\.preview-pane\.single-preview-pane\{background:#fff;\}/);
  assert.match(html, /\.preview-wrap\.single-preview\{flex:0 1 auto;min-height:0;\}/);
  assert.match(html, /function setSinglePreviewCanvasHeight\(renderedHeight, scale\)\{[\s\S]*?const verticalPadding = 24;[\s\S]*?const canvasHeight = Math\.ceil\(renderedHeight \* scale\) \+ verticalPadding;[\s\S]*?wrap\.style\.height = canvasHeight \+ 'px';[\s\S]*?wrap\.style\.flexBasis = canvasHeight \+ 'px';[\s\S]*?wrap\.style\.maxHeight = '100%';/);
  assert.match(html, /function renderVisibleCard\(\)\{\s*setPreviewWrapMode\('single'\);/);
  assert.match(html, /const renderedHeight = out\.offsetHeight;\s*setScalerBox\(1200, renderedHeight, scale\);\s*setSinglePreviewCanvasHeight\(renderedHeight, scale\);/);
});

test('preview scroll footprint ends naturally after Single, Email and All 4 rendered content', () => {
  assert.doesNotMatch(html, /\.preview-scaler\{[^}]*margin-block:auto;/);
  assert.match(html, /function setPreviewWrapMode\(mode\)\{[\s\S]*?wrap\.classList\.toggle\('single-preview', isSingle\);[\s\S]*?pane\.classList\.toggle\('single-preview-pane', isSingle\);[\s\S]*?if\(!isSingle\)\{[\s\S]*?wrap\.style\.height = '';[\s\S]*?wrap\.style\.flexBasis = '';[\s\S]*?wrap\.style\.maxHeight = '';/);
  assert.match(html, /syncViewSelector\(\);\s*setPreviewWrapMode\(viewMode\);/);
  assert.match(html, /scaler\.style\.width = Math\.ceil\(width \* scale\) \+ 'px';/);
  assert.match(html, /scaler\.style\.height = Math\.ceil\(renderedHeight \* scale\) \+ 'px';/);
  assert.match(html, /const renderedHeight = out\.offsetHeight;\s*setScalerBox\(1200, renderedHeight, scale\);\s*setSinglePreviewCanvasHeight\(renderedHeight, scale\);/);
  assert.match(html, /setScalerBox\(1200, out\.offsetHeight \|\| stackWrap\.offsetHeight, baseScale \* EMAIL_PREVIEW_SCALE\);/);
  assert.match(html, /setScalerBox\(gridW, fullH, Math\.max\(0\.08, fitScale\)\);/);
});

test('preview-only scaling leaves export dimensions unchanged', () => {
  assert.match(html, /const exportWidth = 1200;/);
  assert.match(html, /width:1200px;min-width:1200px;max-width:1200px;transform:none;/);
});
