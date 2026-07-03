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

test('preview mode active pill uses refined CB gold rather than bright yellow', () => {
  assert.match(html, /\.view-pill\{[^}]*linear-gradient\(180deg,#d4af37 0%,#b99a32 100%\)/);
  assert.match(html, /\.vbtn\.active\{color:#0e1b2a;/);
  assert.doesNotMatch(html, /neon|#ff0|yellow/);
});

test('preview zoom has typed whole-number input synced with slider and reset', () => {
  assert.match(html, /<span class="zoom-input-wrap">\s*<input class="zoom-input" id="zoom-input" type="text" inputmode="numeric" pattern="\[0-9%\]\*" data-min="10" data-max="70" value="32"/);
  assert.match(html, /<span class="zoom-input-suffix" aria-hidden="true">%<\/span>/);
  assert.match(html, /onkeydown="handleZoomInputKeydown\(event\)" onblur="commitZoomInput\(\)"/);
  assert.match(extractFunction('normalisePreviewZoomValue'), /parseInt\(val,10\)/);
  assert.match(extractFunction('normalisePreviewZoomValue'), /Math\.min\(bounds\.max, Math\.max\(bounds\.min, whole\)\)/);
  assert.match(extractFunction('updatePreviewZoomControls'), /const input=document\.getElementById\("zoom-input"\);[\s\S]*if\(input\) input\.value=String\(value\);/);
  assert.match(extractFunction('handleZoomInputKeydown'), /event\.key === "Enter"[\s\S]*commitZoomInput\(\)/);
  assert.match(extractFunction('resetPreviewZoom'), /setZoom\(32\)/);
});

test('preview pan mode uses Spacebar guarded by editable focus protection', () => {
  assert.match(html, /\.preview-wrap\.pan-ready\{cursor:grab;user-select:none;\}/);
  assert.match(html, /\.preview-wrap\.panning\{cursor:grabbing;scroll-behavior:auto;\}/);
  assert.match(html, /const previewPanState = \{[\s\S]*?spaceDown:false,[\s\S]*?dragging:false,/);
  assert.match(extractFunction('canStartPreviewPan'), /return !isShortcutBlockedTarget\(active\) && !isShortcutBlockedTarget\(event && event\.target\);/);
  assert.match(extractFunction('initPreviewPanNavigation'), /event\.code !== 'Space' && event\.key !== ' '/);
  assert.match(extractFunction('initPreviewPanNavigation'), /event\.preventDefault\(\);\n    setPreviewPanReady\(true\);/);
  assert.match(extractFunction('initPreviewPanNavigation'), /wrap\.scrollLeft = previewPanState\.startScrollLeft - dx;/);
  assert.match(extractFunction('initPreviewPanNavigation'), /wrap\.scrollTop = previewPanState\.startScrollTop - dy;/);
  assert.match(extractFunction('handleKeyboardShortcut'), /typeof previewPanState !== 'undefined' && previewPanState\.spaceDown/);
});
