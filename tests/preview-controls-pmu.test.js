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
  assert.match(html, /<input class="zoom-input" id="zoom-input" type="number" min="10" max="70" step="1" value="32"/);
  assert.match(html, /onkeydown="handleZoomInputKeydown\(event\)" onblur="commitZoomInput\(\)"/);
  assert.match(extractFunction('normalisePreviewZoomValue'), /parseInt\(val,10\)/);
  assert.match(extractFunction('normalisePreviewZoomValue'), /Math\.min\(bounds\.max, Math\.max\(bounds\.min, whole\)\)/);
  assert.match(extractFunction('updatePreviewZoomControls'), /const input=document\.getElementById\("zoom-input"\);[\s\S]*if\(input\) input\.value=String\(value\);/);
  assert.match(extractFunction('handleZoomInputKeydown'), /event\.key === "Enter"[\s\S]*commitZoomInput\(\)/);
  assert.match(extractFunction('resetPreviewZoom'), /setZoom\(32\)/);
});
