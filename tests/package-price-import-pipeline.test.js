import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(name){const start=html.indexOf(`function ${name}(`);assert.notEqual(start,-1,name);const open=html.indexOf('{',start);let depth=0;for(let i=open;i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}')depth--;if(!depth)return html.slice(start,i+1);}throw Error(name);}
function cn(name){const m=html.match(new RegExp(`const\\s+${name}\\s*=`));assert.ok(m,name);return html.slice(m.index,html.indexOf(';',m.index)+1);}
function harness(){
 const c={console,currentCampaignType:'package',offers:[{},{},{},{}],cur:0,document:{getElementById(){return null;}},clearHeroImageDataFromOffer(){},applyAutoSailingFromToOffer(){},applyOperatorTopBarUspDefault(){},stripTransientPasteOfferFields(){},defaultTopBarUspForOperator(){return ''},normaliseCampaignType:v=>v||'package',clampParseConfidenceScore:v=>Math.max(0,Math.min(100,Number(v)||0))};vm.createContext(c);
 vm.runInContext(['function escapeRegExp(value){return String(value||"").replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")}',cn('PACKAGE_OFFER_DETECTION_THRESHOLD'),cn('PACKAGE_OFFER_SIGNAL_WEIGHTS'),cn('PACKAGE_OPERATORS'),cn('PACKAGE_COPY_FIELDS'),cn('PACKAGE_BOARD_BASES'),cn('JET2_APPROVED_INCLUSION_COPY'),'const PARSE_FIELD_MAP={operatorKey:"f-operator",tags:"f-tags",name:"f-name",ship:"f-ship",incl:"f-incl",price:"f-price",basis:"f-basis",board:"f-board",boardlbl:"f-boardlbl",day:"f-day",month:"f-month",nights:"f-nights",ports:"f-ports"};',fn('getActiveRenderCampaignType'),fn('normalisePackageOperatorKey'),fn('isPackageOperator'),fn('isTrustedJet2DawsonQuote'),fn('getPackageOperatorMatch'),fn('detectPackageOffer'),fn('normalisePackageOcrText'),fn('titleCasePackageValue'),fn('normaliseJet2PackageDestination'),fn('detectPackageBoardBasis'),fn('extractPackageDepartureAirport'),fn('extractPackageSharingBasis'),fn('extractPackagePrices'),fn('isUnsafePackageTitleLine'),fn('cleanPackageParsedTitle'),fn('sanitisePackageHotelCandidate'),fn('extractHolidaySummaryAccommodation'),fn('extractStructuredPackageAccommodation'),fn('extractHolidayToAccommodation'),fn('extractPriorityPackageHotel'),fn('parseJet2DawsonQuote'),fn('isJet2SourceInclusionCopy'),fn('normaliseJet2PackageInclusionCopy'),fn('parsePackageOfferText'),fn('packageNumericValue'),fn('packageCleanNumericString'),fn('applyJet2PackageDefaults'),fn('normalisePackagePricingFields'),fn('getBulkPackageImportFallbackOperator'),fn('isUnsafeImportedPackageVisibleValue'),fn('normaliseBulkImportedPackageOffer'),fn('applyParsedOfferToSlot')].join('\n'),c);return c;
}
const fixtures=[
 ['Turgay',`Turgay Hotel\nAntalya, Turkey\n7 Nights\nAll Inclusive\n2 Adults\n<span aria-hidden="true">£5</span><span aria-hidden="true">£683</span>\nPrice per person £583\nWas £683`,583,0,0,583],
 ['White City',`White City Beach Hotel\nAntalya, Turkey\n7 Nights\nAll Inclusive\n2 Adults\nPrice per person £843\n<span class="mobile">£843pp</span>`,843,0,0,843],
 ['Servatur',`Servatur Waikiki Resort\nGran Canaria, Spain\n7 Nights\nAll Inclusive\n2 Adults\nTotal booking price £1,100\nPrice per person £550\nApproximately £2 tourist tax payable locally`,550,2,1,551],
 ['Thanos',`Thanos Hotel\nPaphos, Cyprus\n7 Nights\nBed & Breakfast\n2 Adults\nPrice per person £583\nApproximately £24 tourist tax payable locally\nPrevious price £725`,583,24,12,595]
];

test('real four-offer import route preserves structured base, fee and final values through switching and restore',()=>{
 const c=harness();
 fixtures.forEach(([label,raw,base,feeTotal,feePp,final],index)=>{
   const extracted=c.extractPackagePrices(raw);
   assert.equal(Number(extracted.basePricePerPerson),base,`${label} extracted base`);
   assert.notEqual(extracted.basePricePerPerson,'5683');
   const result=c.parsePackageOfferText(raw,{});
   assert.deepEqual([Number(result.parsed.basePricePerPerson),Number(result.parsed.feeTotal||0),Number(result.parsed.feePerPerson||0),Number(result.parsed.passengerCount),Number(result.parsed.finalPricePerPerson)],[base,feeTotal,feePp,2,final],`${label} parsed structure`);
   assert.equal(c.applyParsedOfferToSlot(result,index,raw),true);
 });
 fixtures.forEach(([label,,base,feeTotal,feePp,final],index)=>{
   c.cur=index; const o=c.offers[c.cur]; c.normalisePackagePricingFields(o);
   assert.deepEqual([Number(o.basePricePerPerson),Number(o.feeTotal||0),Number(o.feePerPerson||0),Number(o.passengerCount),Number(o.finalPricePerPerson)],[base,feeTotal,feePp,2,final],`${label} populated/stored`);
   assert.equal(Number(o.price),base,`${label} form base`); assert.equal(Number(o.localFeePerPerson||0),feePp,`${label} fee field`);
 });
 for(let pass=0;pass<5;pass++) [3,0,2,1].forEach(i=>{c.cur=i;c.normalisePackagePricingFields(c.offers[i]);});
 const restored=JSON.parse(JSON.stringify(c.offers));
 restored.forEach((o,i)=>{c.normalisePackagePricingFields(o);assert.equal(Number(o.price),fixtures[i][2]);assert.equal(Number(o.finalPricePerPerson),fixtures[i][5]);});
 assert.equal(JSON.stringify(restored).includes('5683'),false);
 assert.notEqual(restored[2].price,restored[2].feePerPerson);
 assert.notEqual(restored[3].price,restored[3].feePerPerson);
});

test('price candidates remain isolated across nodes and an already-pp fee is not divided again',()=>{
 const c=harness();
 const raw=`Example Resort\n7 Nights\n2 Adults\n<span>£5</span><span>£683</span>\nPrevious price £725\nPrice per person £583\nTourist tax £12pp`;
 const p=c.parsePackageOfferText(raw,{}).parsed;
 assert.equal(p.basePricePerPerson,'583');assert.equal(p.feePerPerson,'12');assert.equal(p.feeTotal,'');assert.equal(p.finalPricePerPerson,'595');
 assert.ok(c.extractPackagePrices(raw).candidates.every(x=>x.value!=='5683'));
});

test('Jet2 current pp prices outrank booking totals and fees, and Icmeler is canonical',()=>{
 const c=harness();
 const raw=`Jet2holidays\nYour holiday to...\nTurgay Apartments\nIcmeler, Dalaman Area\n7 Nights\n2 Adults\nCurrent price per person £583\nTotal booking price £1,166`;
 const parsed=c.parsePackageOfferText(raw,{}).parsed;
 assert.equal(parsed.name,'Icmeler, Turkey');
 assert.equal(parsed.basePricePerPerson,'583');
 assert.equal(parsed.resortFee||'','');

 const feeFirst=c.extractPackagePrices(`Local tourist tax £1pp\nCurrent price per person £550\nTotal booking price £1,100`);
 assert.equal(feeFirst.basePricePerPerson,'550');
 assert.equal(feeFirst.feePerPerson,'1');
});
