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

test('wide hero images map horizontal slider from full-left to full-right crop', () => {
  const { calculateHeroCropLayout } = cropContext();
  const frame = [1200, 849];
  const natural = [3000, 849];

  const left = calculateHeroCropLayout(...frame, ...natural, 0, 50, 100, 'fill');
  const centre = calculateHeroCropLayout(...frame, ...natural, 50, 50, 100, 'fill');
  const right = calculateHeroCropLayout(...frame, ...natural, 100, 50, 100, 'fill');

  assertClose(left.left, 0);
  assertClose(right.left, -right.overflowX);
  assertClose(centre.left, -centre.overflowX / 2);
  assertClose(left.top, 0);
});

test('tall hero images map vertical slider from top to bottom crop', () => {
  const { calculateHeroCropLayout } = cropContext();
  const frame = [1200, 849];
  const natural = [1200, 2600];

  const top = calculateHeroCropLayout(...frame, ...natural, 50, 0, 100, 'fill');
  const centre = calculateHeroCropLayout(...frame, ...natural, 50, 50, 100, 'fill');
  const bottom = calculateHeroCropLayout(...frame, ...natural, 50, 100, 100, 'fill');

  assertClose(top.top, 0);
  assertClose(bottom.top, -bottom.overflowY);
  assertClose(centre.top, -centre.overflowY / 2);
  assertClose(top.left, 0);
});

test('fill frame and zoom use rendered overflow instead of a fixed nudge range', () => {
  const { calculateHeroCropLayout } = cropContext();
  const frame = [1200, 849];
  const natural = [1600, 900];

  const unzoomed = calculateHeroCropLayout(...frame, ...natural, 100, 50, 100, 'fill');
  const zoomed = calculateHeroCropLayout(...frame, ...natural, 100, 50, 150, 'fill');

  assertClose(unzoomed.left, -unzoomed.overflowX);
  assertClose(zoomed.left, -zoomed.overflowX);
  assert.ok(zoomed.overflowX > unzoomed.overflowX);
  assert.ok(zoomed.overflowY > unzoomed.overflowY);
});

test('fit image centres non-overflowing axes and pans overflowing axes', () => {
  const { calculateHeroCropLayout } = cropContext();
  const frame = [1200, 849];
  const natural = [3000, 1000];

  const fitLeft = calculateHeroCropLayout(...frame, ...natural, 0, 0, 100, 'fit');
  const fitRight = calculateHeroCropLayout(...frame, ...natural, 100, 100, 100, 'fit');
  const zoomedRight = calculateHeroCropLayout(...frame, ...natural, 100, 100, 150, 'fit');

  assertClose(fitLeft.width, 1200);
  assertClose(fitLeft.left, 0);
  assertClose(fitRight.left, 0, 'slider should not move when there is no horizontal overflow');
  assert.equal(fitLeft.top, fitRight.top, 'letterboxed vertical axis stays centred without overflow');
  assertClose(zoomedRight.left, -zoomedRight.overflowX);
  assertClose(zoomedRight.top, (frame[1] - zoomedRight.height) / 2, 'non-overflowing vertical axis stays centred after fit zoom');
});

test('preview and export share the same hero crop application path', () => {
  assert.match(extractFunction('renderCardHTML'), /data-crop-x="\$\{cx\}"/);
  assert.match(extractFunction('renderCardHTML'), /data-fit-mode="\$\{heroFitMode\}"/);
  assert.match(extractFunction('renderVisibleCard'), /scheduleHeroCropPositions\(out\)/);
  assert.match(extractFunction('renderCardToImageBlob'), /scheduleHeroCropPositions\(wrap\)/);
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
