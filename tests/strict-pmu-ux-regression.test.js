import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('preview toolbar has high-contrast active mode styling and zoom reset control', () => {
  assert.match(html, /<span class="pval" id="zoom-val">32%<\/span>\s*<button class="zoom-reset" id="zoom-reset" type="button" onclick="resetPreviewZoom\(\)"/);
  assert.match(html, /\.view-pill\{[^}]*background:#d4af37;[^}]*border:1px solid #f2d56f;[^}]*box-shadow:[^}]*inset/);
  assert.match(html, /\.vbtn\.active\{color:#0e1b2a;font-weight:800;/);
  assert.match(html, /\.zoom-reset\{display:none;[^}]*font-weight:700;/);
  assert.match(html, /\.zoom-reset\.visible\{display:inline-flex;\}/);
  assert.match(html, /function updatePreviewZoomControls\(\)\{[\s\S]*?if\(reset\) reset\.classList\.toggle\("visible", value!==32\);[\s\S]*?\}/);
  assert.match(html, /function resetPreviewZoom\(\)\{ setZoom\(32\); \}/);
});

test('UTM current card selected state is visibly stronger than inactive cards', () => {
  assert.match(html, /\.utm-current-card\{--utm-operator-accent:var\(--gold\);--utm-operator-tint:rgba\(160,146,103,\.14\);\}/);
  assert.match(html, /\.utm-offer-card\.utm-current-card\{[^}]*border-color:rgba\(160,146,103,\.72\);[^}]*box-shadow:/);
  assert.match(html, /\.utm-offer-card\.utm-current-card \.utm-context-id strong,\.utm-offer-card\.utm-current-card \.utm-context-id span\{color:var\(--navy\);font-weight:800;\}/);
});

test('keyboard shortcut guard blocks standard editable controls and contenteditable states', () => {
  assert.match(html, /function isShortcutBlockedTarget\(target\)\{[\s\S]*?if\(target\.isContentEditable\) return true;[\s\S]*?target\.closest\('input,textarea,select,\[contenteditable\]'\)[\s\S]*?\[contenteditable="true"\][\s\S]*?\[contenteditable="plaintext-only"\]/);
});
