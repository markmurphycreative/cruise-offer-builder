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
  assert.match(html, /function setView\(v\)\{[\s\S]*?renderPreviewMode\(true\);\s*queueAutosave\(\);/);
});
