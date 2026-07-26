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
  for(let i=open;i<script.length;i++){
    if(script[i]==='{') depth++;
    if(script[i]==='}' && --depth===0) return script.slice(start,i+1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('mode switching commits editor fields before rendering structured offer data', () => {
  const setView=extractLastFunction('setView');
  const commitAt=setView.indexOf('commitVisibleFields()');
  const renderAt=setView.indexOf('renderPreviewMode(true)');
  assert.ok(commitAt>-1 && renderAt>commitAt);
  assert.match(extractLastFunction('renderPreviewMode'), /renderOfferWithOptionalCtaHTML\(d/);
  assert.doesNotMatch(extractLastFunction('renderPreviewMode'), /querySelector\([^)]*(?:f-name|f-day|f-month)/);
});

test('cruise paste parser explicitly rejects a departure date as its title', () => {
  const parser=extractLastFunction('parseOfferText');
  assert.match(parser, /A date has its own structured fields/);
  assert.match(parser, /if\(title&&\/\^\(\?:\\d\{1,2\}/);
  assert.ok(parser.indexOf('title=""') < parser.indexOf('parsed.name=stripOfferHeadingPrefix'));
});

test('preview zoom and scroll state are isolated for Single, All 4 and Email', () => {
  assert.match(script, /const previewZoomByMode = \{single:32, all:32, email:32\};/);
  assert.match(script, /const previewScrollByMode = \{[\s\S]*single:\{left:0,top:0\}[\s\S]*all:\{left:0,top:0\}[\s\S]*email:\{left:0,top:0\}/);
  const setView=extractLastFunction('setView');
  assert.match(setView, /capturePreviewScroll\(previousViewMode\)/);
  assert.match(setView, /zoomPct = previewZoomByMode\[nextViewMode\]/);
  assert.match(setView, /restorePreviewScroll\(nextViewMode\)/);
  const edit=extractLastFunction('editOfferFromAllPreview');
  assert.match(edit, /previewZoomByMode\.all=normalisePreviewZoomValue\(zoomPct\)/);
  assert.match(edit, /zoomPct=previewZoomByMode\.single/);
});

test('All 4 fit uses the complete two-row outer canvas in both dimensions', () => {
  const metrics=extractLastFunction('getAllPreviewGridMetrics');
  const scale=extractLastFunction('calculateAllPreviewScale');
  assert.match(metrics, /canvasWidth:\(cardWidth \* columns\).*\(padding \* 2\)/);
  assert.match(metrics, /canvasHeight:\(cardHeight \* rows\).*\(padding \* 2\)/);
  assert.match(scale, /paneWidth \/ canvasWidth/);
  assert.match(scale, /paneHeight \/ canvasHeight/);
  assert.match(scale, /Math\.min\(scaleByWidth, scaleByHeight\)/);
});
