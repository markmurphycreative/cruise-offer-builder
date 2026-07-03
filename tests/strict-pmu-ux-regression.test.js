import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('preview toolbar has high-contrast active mode styling and zoom reset control', () => {
  assert.match(html, /<span class="pval" id="zoom-val" aria-live="polite" hidden>32%<\/span>\s*<span class="zoom-input-wrap">\s*<input class="zoom-input" id="zoom-input" type="text" inputmode="numeric" pattern="\[0-9%\]\*" data-min="10" data-max="150" value="32"[\s\S]*?<span class="zoom-input-suffix" aria-hidden="true">%<\/span>[\s\S]*?<button class="zoom-reset" id="zoom-reset" type="button" onclick="resetPreviewZoom\(\)"/);
  assert.match(html, /\.view-pill\{[^}]*background:var\(--navy\);[^}]*border:1px solid rgba\(212,175,55,\.72\);[^}]*box-shadow:inset 0 -2px 0 rgba\(212,175,55,\.38\)/);
  assert.match(html, /\.vbtn\.active\{color:#fff;font-weight:600;text-shadow:none;\}/);
  assert.match(html, /\.zoom-input-wrap\{display:inline-flex;[^}]*border:1px solid rgba\(255,255,255,\.28\);[^}]*border-radius:6px;[^}]*background:rgba\(255,255,255,\.09\);/);
  assert.match(html, /\.zoom-input-wrap:focus-within\{[^}]*border-color:rgba\(212,175,55,\.78\);[^}]*box-shadow:0 0 0 2px rgba\(160,146,103,\.36\)/);
  assert.match(html, /\.zoom-reset\{display:none;[^}]*font-weight:700;/);
  assert.match(html, /\.zoom-reset\.visible\{display:inline-flex;\}/);
  assert.match(html, /function updatePreviewZoomControls\(\)\{[\s\S]*?if\(input\) input\.value=String\(value\);[\s\S]*?if\(reset\) reset\.classList\.toggle\("visible", value!==32\);[\s\S]*?\}/);
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
