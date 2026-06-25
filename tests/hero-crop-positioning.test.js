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

  assertClose(left.overflowX, 1800);
  assertClose(left.left, 0);
  assertClose(centre.left, -900);
  assertClose(right.left, -1800);
  assertClose(left.top, 0);
});

test('tall hero images map vertical slider from top to bottom crop', () => {
  const { calculateHeroCropLayout } = cropContext();
  const frame = [1200, 849];
  const natural = [1200, 2400];

  const top = calculateHeroCropLayout(...frame, ...natural, 50, 0, 100, 'fill');
  const centre = calculateHeroCropLayout(...frame, ...natural, 50, 50, 100, 'fill');
  const bottom = calculateHeroCropLayout(...frame, ...natural, 50, 100, 100, 'fill');

  assertClose(top.overflowY, 1551);
  assertClose(top.top, 0);
  assertClose(centre.top, -775.5);
  assertClose(bottom.top, -1551);
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


test('route map crop engine uses the rendered route map viewport instead of hero dimensions', () => {
  assert.match(html, /itinerary:\{[^}]+viewport:\{width:1076,height:620\}/);
  assert.match(html, /hero:\{[^}]+viewport:\{width:1200,height:849\}/);
  assert.match(extractFunction('applyHeroCropPositions'), /applyEditableImageCropToImage\(img,img\.closest\('\.itinerary-wrap'\),620,'itinerary'\)/);
  assert.match(extractFunction('applyEditableImageCropToImage'), /const viewport=getEditableImageViewport\(type\|\|"hero"\)/);
  assert.match(extractFunction('applyEditableImageCropToImage'), /frameWidth=wrap\.offsetWidth\|\|wrap\.clientWidth\|\|frame\.width\|\|viewport\.width/);
});

test('hero crop rendering uses the restored img source path rather than background-image helpers', () => {
  const css = html.match(/\.cc \.hero\{[^}]+\}/)[0];
  const renderCard = extractFunction('renderCardHTML');
  const renderHero = extractFunction('renderHeroHTML');
  const applyCrop = extractFunction('applyHeroCropPositions');

  assert.match(renderCard, /renderHeroHTML\(d, heroPlaceholder\)/);
  assert.match(renderHero, /<img class="hero" src="\$\{escapeAttr\(heroSrc\)\}"/);
  assert.match(renderHero, /data-hero-src="\$\{escapeAttr\(heroSrc\)\}"/);
  assert.doesNotMatch(renderHero, /background-image|cssUrl/);
  assert.match(css, /object-fit:cover/);
  assert.match(css, /position:absolute/);
  assert.doesNotMatch(css, /background-repeat|background-position|background-size/);
  assert.match(applyCrop, /scope\.querySelectorAll\('\.hero-wrap img\.hero'\)/);
  assert.match(applyCrop, /img\.style\.width=layout\.width\+'px'/);
  assert.match(applyCrop, /img\.style\.left=layout\.left\+'px'/);
  assert.doesNotMatch(applyCrop, /backgroundSize|backgroundPosition/);
});

test('preview and export share the same img crop application path', () => {
  const renderHero = extractFunction('renderHeroHTML');
  assert.match(extractFunction('renderCardHTML'), /renderHeroHTML\(d, heroPlaceholder\)/);
  assert.match(renderHero, /data-crop-x="\$\{cx\}"/);
  assert.match(renderHero, /data-fit-mode="\$\{heroFitMode\}"/);
  assert.match(extractFunction('renderVisibleCard'), /scheduleHeroCropPositions\(out\)/);
  assert.match(extractFunction('renderCardToImageBlob'), /scheduleHeroCropPositions\(wrap\)/);
  assert.doesNotMatch(extractFunction('renderCardToImageBlob'), /heroBackgrounds|new Image\(\)/);
  assert.match(extractFunction('renderCardToImageBlob'), /applyHeroCropPositions\(wrap\)[\s\S]*requestAnimationFrame[\s\S]*applyHeroCropPositions\(wrap\)/);
});

test('hero crop save and load values remain the existing zoom, horizontal and vertical percentages', () => {
  assert.match(extractFunction('saveEditorToOffer'), /o\._cropZoom=parseInt\(z\.value\|\|100,10\)/);
  assert.match(extractFunction('saveEditorToOffer'), /o\._cropX=parseInt\(x\.value\|\|50,10\)/);
  assert.match(extractFunction('saveEditorToOffer'), /o\._cropY=parseInt\(y\.value\|\|50,10\)/);
  assert.match(extractFunction('loadOfferToEditor'), /setCropControlValue\('zoom', o\._cropZoom\|\|100\)/);
  assert.match(extractFunction('loadOfferToEditor'), /setCropControlValue\('x', o\._cropX\?\?50\)/);
  assert.match(extractFunction('loadOfferToEditor'), /setCropControlValue\('y', o\._cropY\?\?50\)/);
});

test('hero crop controls expose synced numeric percentage inputs without changing crop ranges', () => {
  assert.match(html, /id="crop-zoom" min="100" max="200" value="100" oninput="updateCrop\(\)"/);
  assert.match(html, /id="crop-zoom-input" min="100" max="200" value="100"[^>]+oninput="updateCropFromInput\('zoom'\)"/);
  assert.match(html, /id="crop-x" min="0" max="100" value="50" oninput="updateCrop\(\)"/);
  assert.match(html, /id="crop-x-input" min="0" max="100" value="50"[^>]+oninput="updateCropFromInput\('x'\)"/);
  assert.match(html, /id="crop-y" min="0" max="100" value="50" oninput="updateCrop\(\)"/);
  assert.match(html, /id="crop-y-input" min="0" max="100" value="50"[^>]+oninput="updateCropFromInput\('y'\)"/);
  assert.match(extractFunction('updateCrop'), /_cropZoom=setCropControlValue\("zoom"/);
  assert.match(extractFunction('updateCropFromInput'), /setCropControlValue\(axis,input\.value\)/);
});

test('hero upload thumbnail shows the full source image and helper metadata', () => {
  assert.match(html, /\.dz-thumb\.hero-t\{object-fit:contain/);
  assert.doesNotMatch(html, /\.dz-thumb\.hero-t\{object-fit:cover/);
  assert.match(html, /Thumbnail shows full source image\. Card preview shows cropped result\./);
  assert.match(extractFunction('updateHeroThumbInfo'), /dims\.textContent="Image: "\+w\+" × "\+h\+"px"/);
});

test('hero image panel exposes larger source thumbnail, status, quick position and crop preset controls', () => {
  assert.match(html, /\.dz-thumb\.hero-t\{object-fit:contain[^}]+height:170px[^}]+width:100%/);
  assert.doesNotMatch(html, /\.dz-thumb\.hero-t\{object-fit:cover/);
  assert.match(html, /id="hero-crop-status"/);
  assert.match(html, /id="hero-crop-status-zoom">100%/);
  assert.match(html, /id="hero-crop-status-mode">Fill Frame/);
  assert.match(html, /id="hero-mode-fill" class="abtn btn-compact hero-mode-btn"/);
  assert.match(html, /onclick="setHeroCropAxis\('x',0\)">Left 0%/);
  assert.match(html, /onclick="setHeroCropAxis\('x',50\)">Centre 50%/);
  assert.match(html, /onclick="setHeroCropAxis\('x',100\)">Right 100%/);
  assert.match(html, /onclick="setHeroCropAxis\('y',0\)">Top 0%/);
  assert.match(html, /onclick="setHeroCropAxis\('y',50\)">Centre 50%/);
  assert.match(html, /onclick="setHeroCropAxis\('y',100\)">Bottom 100%/);
  assert.match(html, /onclick="copyHeroCrop\(\)">Copy Crop/);
  assert.match(html, /onclick="pasteHeroCrop\(\)">Paste Crop/);
});

function extractCropWorkflowScript() {
  const start = html.indexOf('const CROP_CONTROLS=');
  const end = html.indexOf('function clampHeroCropValue', start);
  assert.notEqual(start, -1, 'Could not locate crop workflow start');
  assert.notEqual(end, -1, 'Could not locate crop workflow end');
  return html.slice(start, end);
}

function createCropWorkflowContext() {
  const elements = {};
  const makeInput = (id, value, min = '0', max = '100') => ({
    id,
    value: String(value),
    min,
    max,
    textContent: '',
    classList: { toggle() {} },
    setAttribute() {}
  });
  elements['crop-zoom'] = makeInput('crop-zoom', 125, '100', '200');
  elements['crop-zoom-input'] = makeInput('crop-zoom-input', 125, '100', '200');
  elements['crop-x'] = makeInput('crop-x', 22);
  elements['crop-x-input'] = makeInput('crop-x-input', 22);
  elements['crop-y'] = makeInput('crop-y', 64);
  elements['crop-y-input'] = makeInput('crop-y-input', 64);
  ['hero-crop-status-zoom', 'hero-crop-status-x', 'hero-crop-status-y', 'hero-crop-status-mode', 'hero-crop-preset-feedback'].forEach(id => {
    elements[id] = { id, textContent: '', classList: { toggle() {} }, setAttribute() {} };
  });
  ['crop-controls', 'hero-crop-status', 'hero-actions-panel', 'hero-quick-position', 'hero-crop-presets', 'hero-mode-fill', 'hero-mode-fit'].forEach(id => {
    elements[id] ||= { id, textContent: '', classList: { toggle() {} }, setAttribute() {} };
  });

  const context = {
    offers: [{ _img: 'hero-a', _cropZoom: 125, _cropX: 22, _cropY: 64, _cropPosVersion: 2, _heroFitMode: 'fit' }, { _img: 'hero-b' }],
    cur: 0,
    refreshes: 0,
    document: { getElementById: id => elements[id] || null, querySelector: () => null },
    refreshOfferUi: () => { context.refreshes += 1; },
    recordCampaignHistoryAfterAsyncChange: () => {}
  };
  context.elements = elements;
  vm.createContext(context);
  vm.runInContext(extractCropWorkflowScript(), context);
  return context;
}

test('quick position buttons update existing crop values without changing crop ranges', () => {
  const context = createCropWorkflowContext();
  context.setHeroCropAxis('x', 100);
  context.setHeroCropAxis('y', 0);

  assert.equal(context.offers[0]._cropX, 100);
  assert.equal(context.offers[0]._cropY, 0);
  assert.equal(context.offers[0]._cropPosVersion, 2);
  assert.equal(context.elements['crop-x'].value, 100);
  assert.equal(context.elements['crop-y'].value, 0);
  assert.equal(context.elements['hero-crop-status-x'].textContent, '100%');
  assert.equal(context.elements['hero-crop-status-y'].textContent, '0%');
});

test('copy and paste crop transfers zoom, position and fill fit mode between offers', () => {
  const context = createCropWorkflowContext();
  context.copyHeroCrop();
  context.cur = 1;
  context.elements['crop-zoom'].value = '100';
  context.elements['crop-x'].value = '50';
  context.elements['crop-y'].value = '50';
  context.pasteHeroCrop();

  assert.equal(context.offers[1]._cropZoom, 125);
  assert.equal(context.offers[1]._cropX, 22);
  assert.equal(context.offers[1]._cropY, 64);
  assert.equal(context.offers[1]._cropPosVersion, 2);
  assert.equal(context.offers[1]._heroFitMode, 'fit');
  assert.equal(context.elements['hero-crop-status-zoom'].textContent, '125%');
  assert.equal(context.elements['hero-crop-status-mode'].textContent, 'Fit Image');
});
