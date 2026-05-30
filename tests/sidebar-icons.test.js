import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sectionHeaders = [...html.matchAll(/<div class="section-hdr(?: collapsed)?" onclick="toggleSec\(this\)">\s*<h3>([\s\S]*?)<\/h3><span class="section-toggle">▾<\/span>/g)]
  .map(([, heading]) => heading);

const headingLabels = sectionHeaders.map(heading => heading.replace(/<svg[\s\S]*?<\/svg>/, ''));

test('every sidebar section heading uses one inline monochrome SVG icon', () => {
  assert.equal(sectionHeaders.length, 9);
  sectionHeaders.forEach(heading => {
    assert.match(heading, /^<svg class="section-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">[\s\S]*<\/svg>[^<]+$/);
    assert.doesNotMatch(heading, /\p{Extended_Pictographic}/u);
  });
  assert.match(html, /\.section-icon\{width:18px;height:18px;flex-shrink:0;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none;\}/);
});

test('sidebar section names retain their order and rename Hero to Hero Image', () => {
  assert.deepEqual(headingLabels, [
    'CSV Import',
    'Campaign Presets',
    'Paste Raw Offer',
    'Operator Logo',
    'Hero Image',
    'Offer Details',
    'Summary',
    'UTM Link',
    'Standard UTMs',
  ]);
});

test('required workflow headings expose the requested icon shapes', () => {
  const [upload, save, clipboardPaste, badge, image, fileText] = sectionHeaders;
  assert.match(upload, /<polyline points="17 8 12 3 7 8"><\/polyline>/);
  assert.match(save, /<path d="M17 21v-8H7v8"><\/path>/);
  assert.match(clipboardPaste, /<path d="m17 10 4 4-4 4"><\/path>/);
  assert.match(badge, /<path d="M3\.85 8\.62a4 4 0 0 1 4\.78-4\.77/);
  assert.match(image, /<circle cx="9" cy="9" r="2"><\/circle>/);
  assert.match(fileText, /<path d="M16 13H8"><\/path>/);
});
