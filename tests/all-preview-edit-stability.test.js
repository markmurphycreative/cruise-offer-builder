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
    commitVisibleFields(){ context.offers[0].resortFee='15'; }, genUtm(){}, genStandardUtms(){}, updateAllStatus(){}, checkPortsWarn(){}, runSpellQA(){}, updateExportFilenames(){}, queueAutosave(){}, renderPreviewMode(){ throw new Error('All 4 must not fully rerender'); }, renderVisibleCard(){}
  };
  vm.createContext(context);
  vm.runInContext(`${extractLastFunction('updateAllPreviewCard')}\n${extractLastFunction('up')}`, context);

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
  assert.match(extractLastFunction('updateAllPreviewCard'), /card\.innerHTML/);
  assert.doesNotMatch(extractLastFunction('updateAllPreviewCard'), /applyAllPreviewLayout|schedulePreviewFitLayout|style\.transform/);
  assert.match(extractLastFunction('up'), /viewMode === 'all'\) updateAllPreviewCard\(cur\)/);
});
