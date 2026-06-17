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

function lockContext(extra = '') {
  const calls = { autosave: 0, status: [] };
  const context = {
    lockedOffers: [false, false, false, false],
    cur: 0,
    document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
    queueAutosave: () => { calls.autosave += 1; },
    updateHeroImageLockUI: () => {},
    showHeroDropStatus: (message, isError) => calls.status.push({ message, isError }),
    setTimeout: () => 0
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('normaliseOfferLockArray'),
    extractFunction('isOfferLocked'),
    extractFunction('getLockedOfferMessage'),
    extractFunction('showOfferLockStatus'),
    extractFunction('canEditOffer'),
    extractFunction('setOfferLocked'),
    extractFunction('toggleLock'),
    extractFunction('toggleOfferLockFromTile'),
    extractFunction('updateOfferLockTiles'),
    extractFunction('updateLockUI'),
    extra
  ].join('\n'), context);
  context.calls = calls;
  return context;
}

test('each offer can be locked and unlocked independently with tile state updates', () => {
  const context = lockContext();
  context.setOfferLocked(1, true);
  context.setOfferLocked(3, true);
  assert.deepEqual(JSON.parse(JSON.stringify(context.lockedOffers)), [false, true, false, true]);
  assert.equal(context.isOfferLocked(0), false);
  assert.equal(context.isOfferLocked(1), true);
  context.setOfferLocked(1, false);
  assert.deepEqual(JSON.parse(JSON.stringify(context.lockedOffers)), [false, false, false, true]);
});

test('offer selector tiles include native lock toggles and locked styling', () => {
  for (const index of [0, 1, 2, 3]) {
    assert.match(html, new RegExp(`id="lock-toggle-${index}"[\\s\\S]*?toggleOfferLockFromTile\\(event,${index}\\)`));
  }
  assert.match(html, /\.offer-lock-toggle\{[^}]*top:4px[^}]*right:4px[^}]*width:14px[^}]*background:transparent/);
  assert.match(html, /\.offer-lock-toggle\{[^}]*color:rgba\(78,89,101,\.82\)[^}]*opacity:\.74/);
  assert.match(html, /\.offer-lock-toggle\.locked\{[^}]*color:var\(--gold\)[^}]*background:transparent/);
  assert.match(html, /\.otab\.active \.offer-lock-toggle\.locked\{color:#fff;\}/);
  assert.match(html, /\.offer-lock-toggle svg\{[^}]*width:14px[^}]*stroke-width:2\.15/);
  assert.match(html, /\.offer-lock-toggle\.locked svg\{[^}]*width:14px[^}]*stroke-width:1\.9[^}]*flex:0 0 14px/);
  assert.doesNotMatch(html, /\.otab\.offer-locked \.offer-tab-number::after\{content:" · Locked"/);
  assert.match(html, /lock-icon-open/);
  assert.match(html, /lock-icon-locked/);
});

test('locked offer blocks paste offer while unlocking restores parse apply', () => {
  const context = lockContext(`
    let pendingParseResult={parsed:{name:'Locked Name'},confidence:'high'};
    const PARSE_FIELD_MAP={name:'f-name'};
    const touched=[];
    function setParseStatus(message){ calls.status.push({message}); }
    function cancelParsedOffer(){ pendingParseResult=null; }
    function prepareOfferSlotForParsedOffer(){ return true; }
    function operatorChanged(){}
    function rv(){}
    function updateAllStatus(){}
    function genUtm(){}
    function checkPortsWarn(){}
    function updateExportFilenames(){}
    function runSpellQA(){}
    function recordCampaignHistoryAfterAsyncChange(){}
    var offers=[{}];
    document.getElementById=id=>id==='f-name'?{value:'',classList:{remove(){},add(){}},offsetWidth:0}:null;
    ${extractFunction('applyParsedOffer')}
  `);
  context.setOfferLocked(0, true);
  context.applyParsedOffer();
  assert.deepEqual(JSON.parse(JSON.stringify(context.offers[0])), {});
  assert.match(context.calls.status.at(-1).message, /Offer 1 is locked/);

  vm.runInContext("pendingParseResult = { parsed: { name: 'Unlocked Name' }, confidence: 'high' };", context);
  context.setOfferLocked(0, false);
  context.applyParsedOffer();
  assert.equal(context.offers[0].name, 'Unlocked Name');
});

test('locked offer blocks hero replacement and drag/drop application', () => {
  const context = lockContext(`
    var offers=[{_img:'old'}, {}, {}, {}];
    function setThumb(){}
    function syncHeroUi(){}
    function refreshOfferUi(){ calls.refreshed=true; }
    function recordCampaignHistoryAfterAsyncChange(){ calls.history=true; }
    ${extractFunction('applyHeroImageSourceToOffer')}
  `);
  context.setOfferLocked(0, true);
  assert.equal(context.applyHeroImageSourceToOffer('new', 0), false);
  assert.equal(context.offers[0]._img, 'old');
  context.setOfferLocked(0, false);
  assert.equal(context.applyHeroImageSourceToOffer('new', 0), true);
  assert.equal(context.offers[0]._img, 'new');
});

test('locked offer blocks reorder involving either selected or target card', () => {
  const context = lockContext(`
    var offers=[{name:'One'}, {name:'Two'}, {name:'Three'}, {name:'Four'}];
    ${extractFunction('moveOfferState')}
  `);
  context.setOfferLocked(1, true);
  context.moveOfferState(0, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(context.offers.map(offer => offer.name))), ['One', 'Two', 'Three', 'Four']);
  context.moveOfferState(1, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(context.offers.map(offer => offer.name))), ['One', 'Two', 'Three', 'Four']);
  context.setOfferLocked(1, false);
  context.moveOfferState(0, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(context.offers.map(offer => offer.name))), ['Two', 'One', 'Three', 'Four']);
});

test('save/autosave/campaign backups preserve locks and old campaigns default to unlocked', () => {
  assert.match(html, /lockedOffers:Array\.isArray\(lockedOffers\) \? lockedOffers\.slice\(0,4\) : \[false,false,false,false\]/);
  assert.match(html, /lockedOffers = Array\.isArray\(data\.lockedOffers\) \? data\.lockedOffers\.slice\(0,4\) : \[false,false,false,false\]/);
  assert.match(html, /lockedOffers=Array\.isArray\(data\.lockedOffers\) \? data\.lockedOffers\.slice\(0,4\) : \[false,false,false,false\]/);
});

test('Campaign Summary shows locked card status', () => {
  assert.match(html, /const lockedSummary=.*?Offer \$\{index\+1\}/s);
  assert.match(html, /<strong>Locked cards<\/strong><br>\$\{summaryHtml\(lockedSummary\)\}/);
});
