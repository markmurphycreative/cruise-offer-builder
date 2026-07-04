import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('preview toolbar has grouped desktop selector styling and always-visible zoom reset control', () => {
  assert.match(html, /<div class="ptool" aria-label="Zoom">\s*<span>Zoom<\/span>\s*<input type="range" min="10" max="150" value="32" oninput="setZoom\(this.value\)" id="zoom-slider">\s*<span class="pval" id="zoom-val" aria-live="polite" onclick="beginZoomInputEdit\(\)">32%<\/span>[\s\S]*?<button class="zoom-reset" id="zoom-reset" type="button" onclick="resetPreviewZoom\(\)"/);
  assert.match(html, /\.view-selector\{min-width:132px;\}/);
  assert.match(html, /\.view-btns\{[^}]*display:grid;[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
  assert.match(html, /\.vbtn\.active\{color:#fff;font-weight:600;text-shadow:none;background:rgba\(160,146,103,\.14\);\}/);
  assert.match(html, /\.vbtn\.active::after\{opacity:1;transform:scaleX\(1\);\}/);
  assert.match(html, /\.zoom-input-wrap\{display:none;[^}]*background:transparent;[^}]*border:0;[^}]*border-radius:0;/);
  assert.match(html, /\.zoom-input-wrap\.editing\{display:inline-flex;\}/);
  assert.match(html, /\.zoom-reset\{display:inline-flex;[^}]*background:transparent;[^}]*color:rgba\(255,255,255,\.62\);[^}]*font-weight:300;/);
  assert.match(html, /\.zoom-reset\.visible\{display:inline-flex;\}/);
  assert.match(html, /function updatePreviewZoomControls\(\)\{[\s\S]*?if\(input && document\.activeElement !== input\) input\.value=String\(value\);[\s\S]*?if\(reset\) reset\.classList\.add\("visible"\);[\s\S]*?\}/);
  assert.match(html, /function resetPreviewZoom\(\)\{[\s\S]*?setZoom\(32\);[\s\S]*?wrap\.scrollTo\(\{top:0,behavior:'auto'\}\);[\s\S]*?\}/);
});


test('UTM current card selected state is visibly stronger than inactive cards', () => {
  assert.match(html, /\.utm-current-card\{--utm-operator-accent:var\(--gold\);--utm-operator-tint:rgba\(160,146,103,\.14\);\}/);
  assert.match(html, /\.utm-offer-card\.utm-current-card\{[^}]*border-color:rgba\(160,146,103,\.72\);[^}]*box-shadow:/);
  assert.match(html, /\.utm-offer-card\.utm-current-card \.utm-context-id strong,\.utm-offer-card\.utm-current-card \.utm-context-id span\{color:var\(--navy\);font-weight:800;\}/);
});

test('keyboard shortcut guard blocks standard editable controls and contenteditable states', () => {
  assert.match(html, /function isShortcutBlockedTarget\(target\)\{[\s\S]*?if\(target\.isContentEditable\) return true;[\s\S]*?target\.closest\('input,textarea,select,\[contenteditable\]'\)[\s\S]*?\[contenteditable="true"\][\s\S]*?\[contenteditable="plaintext-only"\]/);
});
