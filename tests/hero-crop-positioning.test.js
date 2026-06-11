import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not locate ${name}`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function cropContext() {
  const context = {};
  vm.createContext(context);
  vm.runInContext([
    extractFunction('clampHeroCropValue'),
    extractFunction('calculateHeroCropLayout')
  ].join('\n'), context);
  return context;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.000001, message || `${actual} should equal ${expected}`);
}

function assertEdgeOffsets(layout, expectedX, expectedY) {
  assertClose(layout.offsetX, expectedX, `offsetX should be ${expectedX}`);
  assertClose(layout.offsetY, expectedY, `offsetY should be ${expectedY}`);
  assert.equal(layout.backgroundPositionX, `${layout.offsetX}px`);
  assert.equal(layout.backgroundPositionY, `${layout.offsetY}px`);
}

test('wide hero images use true background-position from full-left to full-right crop', () => {
  const { calculateHeroCropLayout } = cropContext();
  const frame = [1200, 849];
  const natural = [3000, 849];

  const left = calculateHeroCropLayout(...frame, ...natural, 0, 50, 100, 'fill');
  const centre = calculateHeroCropLayout(...frame, ...natural, 50, 50, 100, 'fill');
  const right = calculateHeroCropLayout(...frame, ...natural, 100, 50, 100, 'fill');

  assertClose(left.overflowX, 1800);
  assertEdgeOffsets(left, 0, 0);
  assertEdgeOffsets(centre, -900, 0);
  assertEdgeOffsets(right, -1800, 0);
  assertClose(left.offsetX + left.overflowX, 1800, 'left crop must touch the left image edge');
  assertClose(right.offsetX + right.overflowX, 0, 'right crop must touch the right image edge');
});

test('tall hero images use true background-position from top to bottom crop', () => {
  const { calculateHeroCropLayout } = cropContext();
  const frame = [1200, 849];
  const natural = [1200, 2400];

  const top = calculateHeroCropLayout(...frame, ...natural, 50, 0, 100, 'fill');
  const centre = calculateHeroCropLayout(...frame, ...natural, 50, 50, 100, 'fill');
  const bottom = calculateHeroCropLayout(...frame, ...natural, 50, 100, 100, 'fill');

  assertClose(top.overflowY, 1551);
  assertEdgeOffsets(top, 0, 0);
  assertEdgeOffsets(centre, 0, -775.5);
  assertEdgeOffsets(bottom, 0, -1551);
  assertClose(top.offsetY + top.overflowY, 1551, 'top crop must touch the top image edge');
  assertClose(bottom.offsetY + bottom.overflowY, 0, 'bottom crop must touch the bottom image edge');
});

test('fill frame behaves like cover and zoom increases background-size and pan range', () => {
  const { calculateHeroCropLayout } = cropContext();
  const frame = [1200, 849];
  const natural = [1600, 900];

  const unzoomed = calculateHeroCropLayout(...frame, ...natural, 100, 50, 100, 'fill');
  const zoomed = calculateHeroCropLayout(...frame, ...natural, 100, 50, 150, 'fill');

  assertClose(unzoomed.width, 1509.3333333333333);
  assertClose(unzoomed.height, 849);
  assert.equal(unzoomed.backgroundSize, `${unzoomed.width}px ${unzoomed.height}px`);
  assert.equal(unzoomed.backgroundPositionX, `${unzoomed.offsetX}px`);
  assertClose(unzoomed.offsetX, -unzoomed.overflowX);
  assert.ok(zoomed.width > unzoomed.width);
  assert.ok(zoomed.height > unzoomed.height);
  assert.ok(zoomed.overflowX > unzoomed.overflowX);
  assert.ok(zoomed.overflowY > unzoomed.overflowY);
});

test('fit image behaves like contain while non-overflowing axes stay centred', () => {
  const { calculateHeroCropLayout } = cropContext();
  const frame = [1200, 849];
  const natural = [3000, 1000];

  const fitLeft = calculateHeroCropLayout(...frame, ...natural, 0, 0, 100, 'fit');
  const fitRight = calculateHeroCropLayout(...frame, ...natural, 100, 100, 100, 'fit');
  const zoomedRight = calculateHeroCropLayout(...frame, ...natural, 100, 100, 150, 'fit');

  assertClose(fitLeft.width, 1200);
  assertClose(fitLeft.height, 400);
  assertEdgeOffsets(fitLeft, 0, 224.5);
  assertEdgeOffsets(fitRight, 0, 224.5);
  assert.equal(fitLeft.backgroundPositionX, '0px', 'slider should not move when there is no horizontal overflow');
  assert.equal(fitLeft.backgroundPositionY, '224.5px', 'letterboxed vertical axis stays centred without overflow');
  assertClose(zoomedRight.offsetX, -600);
  assertClose(zoomedRight.offsetY, 124.5, 'non-overflowing vertical axis stays centred after fit zoom');
});

test('hero crop rendering uses background-image, background-size and background-position instead of object crop controls', () => {
  const css = html.match(/\.cc \.hero\{[^}]+\}/)[0];
  const renderCard = extractFunction('renderCardHTML');
  const applyCrop = extractFunction('applyHeroCropPositions');

  assert.match(renderCard, /<div class="hero"/);
  assert.match(renderCard, /background-image:\$\{heroImageCss\}/);
  assert.doesNotMatch(renderCard, /<img class="hero"|object-fit|object-position|transform:none/);
  assert.match(css, /background-repeat:no-repeat/);
  assert.match(css, /background-position:50% 50%/);
  assert.match(css, /background-size:cover/);
  assert.doesNotMatch(css, /object-fit|object-position|transform/);
  assert.match(applyCrop, /hero\.style\.backgroundSize=layout\.backgroundSize/);
  assert.match(applyCrop, /hero\.style\.backgroundPosition=layout\.backgroundPositionX\+' '\+layout\.backgroundPositionY/);
  assert.match(extractFunction('calculateHeroCropLayout'), /const offsetX=overflowX>0 \? -overflowX\*\(x\/100\) : \(fw-width\)\/2/);
  assert.doesNotMatch(applyCrop, /objectFit|objectPosition|style\.left|style\.top|style\.transform/);
});

test('preview and export share the same background crop application path', () => {
  assert.match(extractFunction('renderCardHTML'), /data-crop-x="\$\{cx\}"/);
  assert.match(extractFunction('renderCardHTML'), /data-fit-mode="\$\{heroFitMode\}"/);
  assert.match(extractFunction('renderVisibleCard'), /scheduleHeroCropPositions\(out\)/);
  assert.match(extractFunction('renderCardToImageBlob'), /scheduleHeroCropPositions\(wrap\)/);
  assert.match(extractFunction('renderCardToImageBlob'), /heroBackgrounds = Array\.from\(wrap\.querySelectorAll\('\.hero-wrap \.hero\[data-hero-src\]'\)\)/);
  assert.match(extractFunction('renderCardToImageBlob'), /applyHeroCropPositions\(wrap\)[\s\S]*requestAnimationFrame[\s\S]*applyHeroCropPositions\(wrap\)/);
});

test('hero crop save and load values remain the existing zoom, horizontal and vertical percentages', () => {
  assert.match(extractFunction('saveEditorToOffer'), /o\._cropZoom=parseInt\(z\.value\|\|100,10\)/);
  assert.match(extractFunction('saveEditorToOffer'), /o\._cropX=parseInt\(x\.value\|\|50,10\)/);
  assert.match(extractFunction('saveEditorToOffer'), /o\._cropY=parseInt\(y\.value\|\|50,10\)/);
  assert.match(extractFunction('loadOfferToEditor'), /cz\) cz\.value=o\._cropZoom\|\|100/);
  assert.match(extractFunction('loadOfferToEditor'), /cx\) cx\.value=o\._cropX\?\?50/);
  assert.match(extractFunction('loadOfferToEditor'), /cy\) cy\.value=o\._cropY\?\?50/);
});
