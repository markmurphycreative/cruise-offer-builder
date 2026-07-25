import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
  throw new Error(name);
}

test('real All 4 editor update route changes Jet2 price without rewriting layout geometry', () => {
  const stage = { dataset:{ workspaceWidth:'900', workspaceHeight:'700', baseScale:'0.2', layoutApplications:'1' }, style:{}, offsetWidth:520, offsetHeight:380 };
  const canvas = { dataset:{ scale:'0.2' }, style:{} };
  const cards = Array.from({length:4}, (_, index) => ({
    dataset:{offerIndex:String(index)}, style:{width:'1200px',height:'885px'}, innerHTML:`Offer ${index + 1} £574pp`,
    rect:{x:index%2 ? 270 : 10,y:index>1 ? 200 : 10,width:240,height:177}
  }));
  const transformBefore = 'scale(0.2)';
  canvas.style.transform = transformBefore;
  const rectsBefore = cards.map(card => ({...card.rect}));
  const context = {
    console, viewMode:'all', cur:0, offers:[{resortFee:'12'}, {}, {}, {}],
    document:{ querySelector(selector){
      const match = selector.match(/data-offer-index="(\d+)"/);
      if(match) return cards[Number(match[1])];
      if(selector === '.all-preview-stage') return stage;
      return null;
    }},
    getCtaSettingsFromUI(){ return {enabled:false}; },
    bc(data){ return `Offer 1 £${574 + Number(String(data.resortFee).replace(/\D/g,''))}pp`; },
    renderOfferWithOptionalCtaHTML(data){ return this.bc(data); },
    adjustVisitSectionHeights(){}, enhanceClickableHeroImagesAndPlaceholders(){}, enhanceHeroDropTarget(){}, scheduleHeroCropPositions(){},
    allPreviewCardMarkupCache:{ get(){ return null; }, set(){} },
    commitVisibleFields(){ context.offers[0].resortFee='15'; }, genUtm(){}, genStandardUtms(){}, updateAllStatus(){}, checkPortsWarn(){}, runSpellQA(){}, updateExportFilenames(){}, queueAutosave(){}, renderPreviewMode(){ throw new Error('All 4 must not fully rerender'); }, renderVisibleCard(){}
  };
  vm.createContext(context);
  vm.runInContext(`${extractLastFunction('reconcileAllPreviewPriceRegion')}\n${extractLastFunction('updateAllPreviewCard')}\n${extractLastFunction('up')}`, context);

  vm.runInContext('up()', context);
  assert.match(cards[0].innerHTML, /£589pp/);
  assert.equal(canvas.style.transform, transformBefore);
  assert.equal(stage.dataset.baseScale, '0.2');
  assert.equal(stage.dataset.layoutApplications, '1');
  assert.deepEqual(cards.map(card => card.rect), rectsBefore);
  assert.equal(cards[1].innerHTML, 'Offer 2 £574pp');
  assert.equal(cards[2].innerHTML, 'Offer 3 £574pp');
  assert.equal(cards[3].innerHTML, 'Offer 4 £574pp');
});

test('All 4 fit ignores duplicate workspace measurements but applies real resizes', () => {
  assert.match(extractLastFunction('applyAllPreviewLayout'), /workspaceUnchanged/);
  assert.match(extractLastFunction('applyAllPreviewLayout'), /PREVIEW_LAYOUT_TOLERANCE/);
  assert.match(extractLastFunction('updateAllPreviewCard'), /reconcileAllPreviewPriceRegion\(card, nextMarkup\)/);
  assert.doesNotMatch(extractLastFunction('updateAllPreviewCard'), /applyAllPreviewLayout|schedulePreviewFitLayout|style\.transform/);
  assert.match(extractLastFunction('up'), /viewMode === 'all'\) updateAllPreviewCard\(cur\)/);
});

test('visible resort-fee input uses atomic price-region reconciliation in the mounted All 4 card', () => {
  const field = html.match(/<input id="f-resortFee"[^>]+>/)?.[0] || '';
  assert.match(field, /oninput="updateResortFee\(\)"/, 'the real visible resort-fee field must use its authoritative content-only route');

  const update = extractLastFunction('updateAllPreviewCard');
  const reconcile = extractLastFunction('reconcileAllPreviewPriceRegion');
  const resortFeeUpdate = extractLastFunction('updateResortFee');
  assert.match(resortFeeUpdate, /viewMode === 'all'/);
  assert.match(resortFeeUpdate, /updateAllPreviewCard\(cur, 'resort-fee'\)/);
  assert.doesNotMatch(resortFeeUpdate, /\bup\(|schedulePreviewFitLayout|applyAllPreviewLayout|renderVisibleCard/);
  assert.match(reconcile, /currentRoot\.querySelector\('\.pkg-pricing'\)/);
  assert.match(reconcile, /withoutPrice\(previousRoot\) !== withoutPrice\(nextRoot\)/,
    'only a price-only markup change may take the targeted route');
  assert.match(reconcile, /currentPrice\.replaceChildren/,
    'the complete next price structure must be committed synchronously inside the existing wrapper');
  assert.doesNotMatch(reconcile, /card\.innerHTML|card\.replace|applyAllPreviewLayout|schedulePreviewFitLayout|renderPreviewMode/);
  assert.match(update, /if\(!priceOnly\) card\.innerHTML = nextMarkup/,
    'non-price edits retain the existing card-content update behaviour');
  assert.doesNotMatch(update, /applyAllPreviewLayout|schedulePreviewFitLayout|renderPreviewMode|renderVisibleCard/);
});

test('resort-fee delayed lifecycle has no general render or resize-render route', async () => {
  const resortFeeUpdate = extractLastFunction('updateResortFee');
  assert.match(resortFeeUpdate, /commitVisibleFields\(\)/, 'the visible value is synchronised first');
  assert.match(resortFeeUpdate, /updateAllPreviewCard/, 'the selected mounted card is reconciled');
  assert.match(resortFeeUpdate, /queueAutosave\(\)/, 'persistence remains scheduled after reconciliation');
  assert.doesNotMatch(resortFeeUpdate, /renderPreviewMode\(true\)[\s\S]*viewMode === 'all'/,
    'the All 4 branch must not fall through to the general renderer');

  assert.doesNotMatch(script, /window\.addEventListener\(["']resize["'],\s*rv\s*\)/,
    'resize must never retain a captured legacy content renderer');
  const stableResize = script.match(/window\.addEventListener\('resize', function\(\)\{([^}]+)\}\);/)?.[1] || '';
  assert.match(stableResize, /schedulePreviewFitLayout\(\)/);
  assert.doesNotMatch(stableResize, /\brv\(|renderPreviewMode|renderVisibleCard/);

  // Let the same classes of queued work used by autosave/history/preview layout
  // drain; none is permitted to manufacture a second render route.
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
});

test('preview diagnostics distinguish content reconciliation from shell rendering', () => {
  assert.match(script, /window\.__cobPreviewDiagnostics = previewRenderDiagnostics/);
  assert.match(extractLastFunction('updateAllPreviewCard'), /allPreviewContentUpdates \+= 1/);
  assert.match(extractLastFunction('renderPreviewMode'), /fullRenderRequests \+= 1/);
  assert.match(extractLastFunction('renderPreviewMode'), /fullRenderExecutions \+= 1/);
  assert.match(extractLastFunction('applyAllPreviewLayout'), /allPreviewLayoutApplications \+= 1/);
});

test('legacy full-render requests reconcile into the mounted All 4 shell', () => {
  const source = extractLastFunction('reconcileMountedAllPreview');
  assert.match(source, /stage\.isConnected/);
  assert.match(source, /slots\.length !== expected\.length/);
  assert.match(source, /slot\.dataset\.offerIndex !== expected\[i\]/);
  assert.match(source, /updateAllPreviewCards\(\)/);
  assert.doesNotMatch(source, /innerHTML\s*=|replaceChildren|appendChild|style\.transform|applyAllPreviewLayout/);

  const render = extractLastFunction('renderPreviewMode');
  const reconcileAt = render.indexOf('reconcileMountedAllPreview(loadedPreviewOffers, fixedCardHeight)');
  const clearAt = render.indexOf('out.replaceChildren(stage)', reconcileAt);
  assert.ok(reconcileAt > -1, 'All 4 render path must attempt an in-place reconcile');
  assert.ok(clearAt > reconcileAt, 'atomic shell replacement must only occur after reconcile rejects an incompatible shell');
});
