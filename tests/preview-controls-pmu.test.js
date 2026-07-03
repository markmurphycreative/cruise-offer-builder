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
  assert.match(html, /\.vbtn\{[^}]*font-weight:500;[^}]*background:transparent;[^}]*color:#fff;[^}]*cursor:default;/);
  assert.match(html, /\.vbtn::after\{[^}]*height:2px;[^}]*background:var\(--gold\);[^}]*opacity:0;/);
  assert.match(html, /\.vbtn:hover:not\(\.active\)\{color:var\(--gold\);\}/);
  assert.match(html, /\.vbtn\.active::after\{opacity:1;transform:scaleX\(1\);\}/);
  assert.doesNotMatch(html, /neon|#ff0|background:linear-gradient\(180deg,#d4af37|color:#0e1b2a;font-weight:800/);
});

test('preview zoom has typed whole-number input synced with slider and reset', () => {
  assert.match(html, /<span class="zoom-input-wrap">\s*<input class="zoom-input" id="zoom-input" type="text" inputmode="numeric" pattern="\[0-9%\]\*" data-min="10" data-max="150" value="32"/);
  assert.match(html, /<span class="zoom-input-suffix" aria-hidden="true">%<\/span>/);
  assert.match(html, /onkeydown="handleZoomInputKeydown\(event\)" onblur="commitZoomInput\(\)"/);
  assert.match(extractFunction('normalisePreviewZoomValue'), /parseInt\(val,10\)/);
  assert.match(extractFunction('normalisePreviewZoomValue'), /Math\.min\(bounds\.max, Math\.max\(bounds\.min, whole\)\)/);
  assert.match(extractFunction('updatePreviewZoomControls'), /const input=document\.getElementById\("zoom-input"\);[\s\S]*if\(input\) input\.value=String\(value\);/);
  assert.match(extractFunction('handleZoomInputKeydown'), /event\.key === "Enter"[\s\S]*commitZoomInput\(\)/);
  assert.match(extractFunction('resetPreviewZoom'), /setZoom\(32\)/);
});

test('preview pan mode is removed so Spacebar/browser behaviour is restored', () => {
  assert.doesNotMatch(html, /previewPanState|initPreviewPanNavigation|canStartPreviewPan|setPreviewPanReady|endPreviewPanDrag/);
  assert.doesNotMatch(html, /preview-wrap\.pan-ready|preview-wrap\.panning|preview-wrap\.pan-ready \*|preview-wrap\.panning \*/);
  assert.doesNotMatch(extractFunction('handleKeyboardShortcut'), /previewPanState|spaceDown/);
});
