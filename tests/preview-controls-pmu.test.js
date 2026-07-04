import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `Could not find ${name}`);
  let depth = 0;
  let seen = false;
  for (let i = start; i < html.length; i += 1) {
    if (html[i] === '{') { depth += 1; seen = true; }
    else if (html[i] === '}') {
      depth -= 1;
      if (seen && depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

test('preview mode buttons use restrained navy styling with gold underline active state', () => {
  assert.match(html, /\.view-btns\{[^}]*border:0;[^}]*background:var\(--navy\);/);
  assert.match(html, /\.view-pill\{display:none;\}/);
  assert.match(html, /\.vbtn\{[^}]*font-weight:300;[^}]*line-height:1\.25;[^}]*background:transparent;[^}]*color:#fff;[^}]*cursor:default;/);
  assert.match(html, /\.vbtn::after\{[^}]*height:1px;[^}]*background:var\(--gold\);[^}]*opacity:0;/);
  assert.match(html, /\.vbtn:hover:not\(\.active\)\{color:var\(--gold\);\}/);
  assert.match(html, /\.vbtn\.active::after\{opacity:1;transform:scaleX\(1\);\}/);
  assert.doesNotMatch(html, /neon|#ff0|background:linear-gradient\(180deg,#d4af37|color:#0e1b2a;font-weight:800/);
});

test('preview zoom shows relative adjustment while preserving internal slider scale and reset', () => {
  assert.match(html, /<input type="range" min="-100" max="100" value="0" oninput="setZoomFromSlider\(this\.value\)" id="zoom-slider" aria-label="Preview zoom adjustment">/);
  assert.match(html, /<span class="pval" id="zoom-val" aria-live="polite" onclick="beginZoomInputEdit\(\)">0<\/span>/);
  assert.match(html, /pattern="\[\+-\]\?\[0-9\]\*" data-min="-100" data-max="100" value="0" aria-label="Relative preview zoom adjustment"/);
  assert.doesNotMatch(html, /<span>Zoom<\/span>/);
  assert.match(extractFunction('normalisePreviewZoomValue'), /parseInt\(val,10\)/);
  assert.match(extractFunction('getRelativePreviewZoomValue'), /current < base/);
  assert.match(extractFunction('formatRelativePreviewZoomValue'), /relative>0 \? "\+"\+relative : String\(relative\)/);
  assert.match(extractFunction('updatePreviewZoomControls'), /if\(slider\) slider\.value=String\(getRelativePreviewZoomValue\(value\)\);/);
  assert.match(extractFunction('updatePreviewZoomControls'), /if\(label\) label\.textContent=relative;/);
  assert.match(extractFunction('updatePreviewZoomControls'), /if\(input && document\.activeElement !== input\) input\.value=relative;/);
  assert.match(extractFunction('setZoomFromSlider'), /setZoom\(previewZoomFromRelativeValue\(normalisePreviewZoomSliderValue\(val\)\)\)/);
  assert.match(extractFunction('commitZoomInput'), /previewZoomFromRelativeValue\(input\.value\)/);
  assert.match(extractFunction('resetPreviewZoom'), /setZoom\(getDefaultPreviewZoom\(\)\)/);
});

test('preview pan mode is removed so Spacebar/browser behaviour is restored', () => {
  assert.doesNotMatch(html, /previewPanState|initPreviewPanNavigation|canStartPreviewPan|setPreviewPanReady|endPreviewPanDrag/);
  assert.doesNotMatch(html, /preview-wrap\.pan-ready|preview-wrap\.panning|preview-wrap\.pan-ready \*|preview-wrap\.panning \*/);
  assert.doesNotMatch(extractFunction('handleKeyboardShortcut'), /previewPanState|spaceDown/);
});
