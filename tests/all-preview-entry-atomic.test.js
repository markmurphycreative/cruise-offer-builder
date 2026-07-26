import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

function extractLastFunction(name){
  const start = script.lastIndexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const open = script.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < script.length; i++){
    if(script[i] === '{') depth++;
    if(script[i] === '}' && --depth === 0) return script.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('All 4 entry measures complete native cards before preparing its atomic 2x2 commit', () => {
  const render = extractLastFunction('renderPreviewMode');
  const paneAt = render.indexOf('const entryPane = getPreviewPaneSize()');
  const cardsAt = render.indexOf('loadedPreviewOffers.map');
  const measureAt = render.indexOf('measureAllPreviewCardHeight(cards, cardGeometry)');
  const columnsAt = render.indexOf("grid.style.gridTemplateColumns = Array(metrics.columns)");
  const prepareAt = render.indexOf('prepareAllPreviewLayout(stage, canvas, metrics, entryPane)');
  const commitAt = render.indexOf('out.replaceChildren(stage)');

  assert.ok(paneAt > -1, 'the stable workspace is measured on entry');
  assert.ok(cardsAt > paneAt, 'complete cards are built after the workspace snapshot');
  assert.ok(measureAt > cardsAt, 'native card height is resolved from complete cards');
  assert.ok(columnsAt > measureAt, 'final grid columns are assigned from measured native geometry');
  assert.ok(prepareAt > columnsAt, 'the detached shell receives its final fit after all cards exist');
  assert.ok(commitAt > prepareAt, 'the fully prepared shell is committed atomically');
  assert.doesNotMatch(render.slice(prepareAt, commitAt), /requestAnimationFrame|scheduleAllPreviewLayout|schedulePreviewFitLayout/);
  assert.doesNotMatch(render, /out\.(?:appendChild\(stage\)|innerHTML\s*=\s*''[\s\S]*appendChild\(stage\))/,
    'an unfinished connected All 4 shell must never be exposed');
});

test('the authoritative entry fit uses fixed geometry and records one prepared fit', () => {
  const prepare = extractLastFunction('prepareAllPreviewLayout');
  const render = extractLastFunction('renderPreviewMode');
  assert.match(prepare, /applyAllPreviewLayout\(stage, canvas, metrics, pane\)/);
  assert.match(prepare, /stage\.dataset\.entryPrepared = 'true'/);
  assert.match(prepare, /allPreviewEntryFits \+= 1/);
  assert.equal((render.match(/prepareAllPreviewLayout\(/g) || []).length, 1);
  assert.doesNotMatch(prepare, /offsetWidth|offsetHeight|scrollWidth|scrollHeight|getBoundingClientRect|requestAnimationFrame/);
});

test('entering All 4 cancels a stale queued fit from Single or Email', () => {
  const setView = extractLastFunction('setView');
  assert.match(setView, /nextViewMode === 'all' && pendingAllPreviewLayoutFrame/);
  assert.match(setView, /cancelAnimationFrame\(pendingAllPreviewLayoutFrame\)/);
  assert.match(setView, /pendingAllPreviewLayoutFrame = null/);
  assert.ok(setView.indexOf('pendingAllPreviewLayoutFrame = null') < setView.indexOf('renderPreviewMode(true)'),
    'stale callbacks are removed before the All 4 render starts');
});

test('All 4 entrance has no scale, transform, position, size or opacity transition', () => {
  assert.match(html, /\.all-preview-stage\{[^}]*overflow:visible;/);
  assert.match(html, /\.all-preview-canvas\{[^}]*transform-origin:top left;[^}]*will-change:transform;\}/);
  assert.doesNotMatch(html, /\.all-preview-(?:stage|canvas|grid)\{[^}]*transition\s*:/);
  assert.doesNotMatch(html, /\.all-preview-(?:stage|canvas|grid)\{[^}]*(?:animation|transition)[^}]*(?:transform|scale|width|height|top|left|opacity)/);
});
