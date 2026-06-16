import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sectionHeaders = [...html.matchAll(/<div class="section-hdr(?: collapsed)?" onclick="toggleSec\(this\)">\s*<h3>([\s\S]*?)<\/h3><span class="section-toggle">▾<\/span>/g)]
  .map(([, heading]) => heading);

const headingLabels = sectionHeaders.map(heading => heading
  .replace(/<svg[\s\S]*?<\/svg>/, '')
  .replace(/<span class="export-health-count ready" id="export-health-count">Ready<\/span>/, '')
  .trim());

test('every sidebar section heading uses one inline monochrome SVG icon', () => {
  assert.equal(sectionHeaders.length, 11);
  sectionHeaders.forEach(heading => {
    assert.match(heading, /^<svg class="section-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">[\s\S]*<\/svg>[^<]+(?:<span class="section-complete"[^>]*>✓<\/span>)?(?:<span class="export-health-count ready" id="export-health-count">Ready<\/span>)?$/);
    assert.doesNotMatch(heading, /\p{Extended_Pictographic}/u);
  });
  assert.match(html, /\.section-icon\{width:18px;height:18px;flex-shrink:0;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none;transition:color \.18s ease,opacity \.18s ease;\}/);
});

test('sidebar section names follow the primary workflow and use the requested display labels', () => {
  assert.deepEqual(headingLabels, [
    'Campaign Import',
    'Campaign Presets',
    'Operator Logo',
    'Hero Image',
    'Offer Details',
    'CTA Assets',
    'Paste Offer',
    'Export Cards',
    'UTM Link',
    'Standard UTMs',
    'AI Copy',
  ]);
});



test('completion indicators tint existing icons without standalone checkmarks', () => {
  assert.doesNotMatch(html, /section-complete/);
  assert.doesNotMatch(html, />✓<\/span><\/h3>/);
  assert.match(html, /\.section-hdr\.complete \.section-icon\{color:var\(--green\);\}/);
  assert.match(html, /header\.classList\.toggle\("complete", !!complete\);/);
  assert.doesNotMatch(html, /section-(?:warning|error|missing|incomplete)/);
});

test('required workflow headings expose the requested icon shapes', () => {
  const [upload, save, logoAsset, image, fileText, ctaAssets, clipboardPaste] = sectionHeaders;
  assert.match(upload, /<polyline points="17 8 12 3 7 8"><\/polyline>/);
  assert.match(save, /<path d="M17 21v-8H7v8"><\/path>/);
  assert.match(ctaAssets, /<rect width="18" height="10" x="3" y="7" rx="2"><\/rect>/);
  assert.match(clipboardPaste, /<path d="m17 10 4 4-4 4"><\/path>/);
  assert.match(logoAsset, /<circle cx="10" cy="13" r="2"><\/circle>/);
  assert.match(image, /<circle cx="9" cy="9" r="2"><\/circle>/);
  assert.match(fileText, /<path d="M16 13H8"><\/path>/);
});


test('hero drop zone reuses the Hero Image heading SVG instead of an emoji', () => {
  const heroImageSvg = sectionHeaders[3].match(/<svg[\s\S]*?<\/svg>/)[0];
  const heroDropzone = html.match(/<div class="dropzone hero-dropzone"[\s\S]*?<img class="dz-thumb hero-t"/)[0];
  assert.match(heroDropzone, new RegExp(heroImageSvg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(heroDropzone, /🖼/);
});

test('Load Offer button uses a document import SVG while preserving its handler and label', () => {
  const loadOfferButton = html.match(/<button class="parse-btn" onclick="parseOffer\(\)">([\s\S]*?)<\/button>/)[0];
  assert.match(loadOfferButton, /^<button class="parse-btn" onclick="parseOffer\(\)"><svg class="section-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">[\s\S]*<\/svg>Load Offer<\/button>$/);
  assert.match(loadOfferButton, /<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"><\/path>/);
  assert.match(loadOfferButton, /<path d="m9 15 3 3 3-3"><\/path>/);
  assert.doesNotMatch(loadOfferButton, /⚡/);
  assert.match(html, /\.parse-btn\{[^}]*display:flex;align-items:center;justify-content:center;gap:6px;\}/);
  assert.match(html, /\.parse-btn \.section-icon\{margin:-3px 0;\}/);
});
