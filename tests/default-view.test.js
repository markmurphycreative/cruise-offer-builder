import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('fresh startup defaults to the All 4 preview with the matching active button', () => {
  assert.match(html, /<button class="vbtn" id="vb-single"[^>]*>Single<\/button>/);
  assert.match(html, /<button class="vbtn" id="vb-email"[^>]*>Email<\/button>/);
  assert.match(html, /<button class="vbtn active" id="vb-all"[^>]*>All 4<\/button>/);
  assert.match(html, /let cur = 0, viewMode = "all", zoomPct = 32;/);
});

test('autosave persists and restore reapplies an existing valid view preference', () => {
  assert.match(html, /return \{version:'1\.0',savedAt:new Date\(\)\.toISOString\(\),cur,viewMode,builderMode,/);
  assert.match(html, /if\(\["single","email","all"\]\.includes\(data\.viewMode\)\) viewMode = data\.viewMode;/);
  assert.match(html, /b\.classList\.toggle\("active", x === viewMode\);/);
  assert.match(html, /function setView\(v\)\{[\s\S]*?renderPreviewMode\(true\);[\s\S]*?queueAutosave\(\);/);
});

test('preview mode switches fade in quickly without animating layout or zoom dimensions', () => {
  assert.match(html, /#card-output\{opacity:1;transition:opacity \.15s ease-out;\}/);
  assert.match(html, /#card-output\.preview-mode-transition\{opacity:0;\}/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{#card-output,\.view-pill\{transition:none;\}\}/);
  assert.match(html, /function fadePreviewModeIn\(\)\{[\s\S]*?out\.classList\.add\('preview-mode-transition'\);[\s\S]*?requestAnimationFrame\(function\(\)\{[\s\S]*?out\.classList\.remove\('preview-mode-transition'\);/);
  assert.match(html, /renderPreviewMode\(true\);\s*if\(didChange\) fadePreviewModeIn\(\);\s*queueAutosave\(\);/);
  assert.doesNotMatch(html, /#card-output[^}]*transition:[^;}]*(?:width|height|transform)/);
});

test('view selector uses a transform-driven sliding gold pill without changing button sizing', () => {
  assert.match(html, /<span class="view-pill" id="view-pill" aria-hidden="true"><\/span>/);
  assert.match(html, /\.view-pill\{[^}]*background:var\(--gold\);[^}]*transform:translateX\(0\);[^}]*transition:transform \.18s ease,width \.18s ease;/);
  assert.match(html, /\.vbtn\.active\{color:var\(--navy\);\}/);
  assert.match(html, /function updateViewPill\(\)\{[\s\S]*?pill\.style\.width = activeButton\.offsetWidth \+ 'px';[\s\S]*?pill\.style\.transform = 'translateX\(' \+ activeButton\.offsetLeft \+ 'px\)';/);
  assert.match(html, /updateViewPill\(\);\s*renderPreviewMode\(true\);/);
  assert.match(html, /requestAnimationFrame\(updateViewPill\);/);
  assert.doesNotMatch(html, /\.vbtn\.active\{[^}]*background:/);
});
