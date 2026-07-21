import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFunction(name) { const start=html.indexOf(`function ${name}(`); assert.notEqual(start,-1,`Could not find ${name}`); const open=html.indexOf('{',html.indexOf(')',start)); let depth=0; for(let i=open;i<html.length;i++){ if(html[i]==='{') depth++; if(html[i]==='}') depth--; if(depth===0) return html.slice(start,i+1);} throw new Error(name); }
function extractConst(name) { const match=html.match(new RegExp(`const\\s+${name}\\s*=`)); assert.ok(match,`Could not find ${name}`); const start=match.index; let i=html.indexOf('=',start)+1; let depth=0; for(;i<html.length;i++){ const ch=html[i]; if(ch==='{'||ch==='['||ch==='(') depth++; else if(ch==='}'||ch===']'||ch===')') depth--; else if(ch===';'&&depth===0) return html.slice(start,i+1); } throw new Error(name); }

function createRenderContext(){
  const context={ console, document:{ getElementById(id){ return (id==='preview-scaler'||id==='card-output') ? {style:{}, innerHTML:'', classList:{toggle(){},remove(){}}} : null; }, querySelector(){ return null; }, querySelectorAll(){ return []; } } };
  vm.createContext(context);
  vm.runInContext([
    `function escapeHtml(value){ return String(value==null?"":value).replace(/[&<>"\x27]/g,function(ch){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\\x27":"&#39;"}[ch]; }); }`,
    'let currentCampaignType="package";',
    extractFunction('normaliseCampaignType'),
    extractConst('PACKAGE_OPERATORS'),
    extractConst('PACKAGE_COPY_FIELDS'),
    extractFunction('normalisePackageOperatorKey'),
    extractFunction('packageOfferHasGenuineData'),
    extractFunction('packageDefaultCopyValue'),
    extractFunction('normalisePackageCopyOverrides'),
    extractFunction('packageCopyValue'),
    extractFunction('packageNumericValue'),
    extractFunction('packageCleanNumericString'),
    extractFunction('formatPackageMoney'),
    extractFunction('formatPackageOrdinalDate'),
    extractFunction('packageAirportLine'),
    extractFunction('packageResortFeeText'),
    extractFunction('packageOfferFromData'),
    extractFunction('renderPackagePriceBlock'),
    extractFunction('renderPackageCard')
  ].join('\n'), context);
  return context;
}

test('blank Package renderer path emits no ghost offer copy, suffix, price or operator text', () => {
  const context=createRenderContext();
  const htmlOutput=vm.runInContext('renderPackageCard({ offerType:"package", packageCopyOverrides:{} })', context);
  for(const stale of ['Luggage &amp; Transfers Included','Luggage & Transfers Included','pp','Start your booking','or visit us in store','Operator not detected','pkg-price']){
    assert.doesNotMatch(htmlOutput, new RegExp(stale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('real New Package handler replaces stale Package objects and delegates Package preview through renderPreviewMode', () => {
  const context={ console, Date, Math, autosaveHydrating:false, autosaveHasUnsavedChanges:false, CTA_DEFAULTS:{enabled:false,text:'Click To Call Us For More Info',phone:'01912229701'}, document:{ getElementById(id){ return (id==='preview-scaler'||id==='card-output') ? {style:{}, innerHTML:'', classList:{toggle(){},remove(){}}} : null; }, querySelector(){ return null; }, querySelectorAll(){ return []; } }, clearTimeout(){}, setTimeout(){}, window:{} };
  Object.assign(context, { resetTransientCampaignState(){}, applyCampaignContext(type){ context.currentCampaignType=type; }, load(i){ context.cur=i; }, applySafeGlobalDefaults(){}, applyCtaSettings(v){ context.ctaSettings=v; }, initialiseCampaignNamingDefaults(){}, syncViewSelector(){}, updateOfferPill(){}, collapseBuilderSections(){}, applyNewCampaignSidebarDefaults(){}, refreshAfterRestore(){ context.refreshAfterRestoreCalled=true; }, showSessionFeedback(){}, syncAutosaveStatus(){}, resetCampaignHistoryBaseline(){}, markBuilderStateClean(){} });
  vm.createContext(context);
  vm.runInContext([
    'let cur=0, currentCampaignType="package", offers=[];',
    'function normaliseCampaignType(type){ const normalised=String(type||"cruise").toLowerCase().replace(/[^a-z]/g,""); return normalised==="package"?"package":"cruise"; }',
    extractFunction('createBlankCruiseOffer'),
    extractFunction('createBlankPackageOffer'),
    extractFunction('createBlankOfferForCampaign'),
    extractFunction('createBlankOfferSlotsForCampaign'),
    extractFunction('createCampaignModel'),
    'var campaignModel=createCampaignModel("package"), cruiseOffers=campaignModel.cruiseOffers, packageOffers=[{offerType:"package", name:"Lassi, Kefalonia", ship:"Sunset Paradise Resort", price:"574", operator:"jet2"},{},{},{}]; offers=packageOffers;',
    extractFunction('getActiveOfferCollection'),
    extractFunction('replaceCampaignModel'),
    extractFunction('resetBuilderToBlankSession')
  ].join('\n'), context);
  const oldPackageArray=context.packageOffers;
  const oldOffer=context.packageOffers[0];
  vm.runInContext('resetBuilderToBlankSession("package")', context);
  assert.notEqual(context.packageOffers, oldPackageArray);
  assert.notEqual(context.packageOffers[0], oldOffer);
  assert.equal(vm.runInContext('offers===packageOffers', context), true);
  assert.equal(vm.runInContext('cur', context), 0);
  assert.equal(vm.runInContext('packageOffers.filter(o => Object.values(o).some(v => String(v||"").trim() && v !== "package" && JSON.stringify(v) !== "{}")).length', context), 0);

  context.renderPreviewMode=function(skip){ context.previewSkip=skip; };
  context.normaliseCampaignType=context.normaliseCampaignType || (v=>String(v||'cruise'));
  vm.runInContext([extractFunction('renderOfferIndex')].join('\n'), context);
  vm.runInContext('renderOfferIndex(0)', context);
  assert.equal(context.previewSkip, true);
});
