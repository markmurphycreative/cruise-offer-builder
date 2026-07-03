import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('preview toolbar has restrained active mode styling and always-visible zoom reset control', () => {
  assert.match(html, /<span class="toolbar-divider" aria-hidden="true"><\/span>\s*<span class="pval" id="zoom-val" aria-live="polite" onclick="beginZoomInputEdit\(\)">32%<\/span>\s*<span class="zoom-input-wrap" id="zoom-input-wrap">\s*<input class="zoom-input" id="zoom-input" type="text" inputmode="numeric" pattern="\[0-9%\]\*" data-min="10" data-max="150" value="32"[\s\S]*?<span class="zoom-input-suffix" aria-hidden="true">%<\/span>[\s\S]*?<button class="zoom-reset" id="zoom-reset" type="button" onclick="resetPreviewZoom\(\)"/);
  assert.match(html, /\.view-btns\{[^}]*border:0;[^}]*background:var\(--navy\);/);
  assert.match(html, /\.vbtn\.active\{color:#fff;font-weight:500;text-shadow:none;\}/);
  assert.match(html, /\.vbtn\.active::after\{opacity:1;transform:scaleX\(1\);\}/);
  assert.match(html, /\.zoom-input-wrap\{display:none;[^}]*background:transparent;[^}]*border:0;[^}]*border-radius:0;/);
  assert.match(html, /\.zoom-input-wrap\.editing\{display:inline-flex;\}/);
  assert.match(html, /\.zoom-reset\{display:inline-flex;[^}]*background:transparent;[^}]*color:var\(--gold\);[^}]*font-weight:400;/);
  assert.match(html, /\.zoom-reset\.visible\{display:inline-flex;\}/);
  assert.match(html, /function updatePreviewZoomControls\(\)\{[\s\S]*?if\(input && document\.activeElement !== input\) input\.value=String\(value\);[\s\S]*?if\(reset\) reset\.classList\.add\("visible"\);[\s\S]*?\}/);
  assert.match(html, /function resetPreviewZoom\(\)\{[\s\S]*?setZoom\(32\);[\s\S]*?wrap\.scrollTo\(\{left:0,top:0,behavior:'auto'\}\);[\s\S]*?\}/);
});

test('UTM current card selected state is visibly stronger than inactive cards', () => {
  assert.match(html, /\.utm-current-card\{--utm-operator-accent:var\(--gold\);--utm-operator-tint:rgba\(160,146,103,\.14\);\}/);
  assert.match(html, /\.utm-offer-card\.utm-current-card\{[^}]*border-color:rgba\(160,146,103,\.72\);[^}]*box-shadow:/);
  assert.match(html, /\.utm-offer-card\.utm-current-card \.utm-context-id strong,\.utm-offer-card\.utm-current-card \.utm-context-id span\{color:var\(--navy\);font-weight:800;\}/);
});

test('keyboard shortcut guard blocks standard editable controls and contenteditable states', () => {
  assert.match(html, /function isShortcutBlockedTarget\(target\)\{[\s\S]*?if\(target\.isContentEditable\) return true;[\s\S]*?target\.closest\('input,textarea,select,\[contenteditable\]'\)[\s\S]*?\[contenteditable="true"\][\s\S]*?\[contenteditable="plaintext-only"\]/);
});
