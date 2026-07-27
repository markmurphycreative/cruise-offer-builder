import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(name){const start=html.indexOf(`function ${name}(`);assert.notEqual(start,-1,name);const open=html.indexOf('{',start);let depth=0;for(let i=open;i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}')depth--;if(!depth)return html.slice(start,i+1);}throw Error(name);}
function cn(name){const m=html.match(new RegExp(`const\\s+${name}\\s*=`));assert.ok(m,name);return html.slice(m.index,html.indexOf(';',m.index)+1);}
function harness(){const c={normaliseCampaignType:v=>v||'package',currentCampaignType:'package'};vm.createContext(c);vm.runInContext([cn('PACKAGE_OPERATORS'),cn('PACKAGE_LOCATION_COUNTRIES'),fn('getPackageLocationStructure'),fn('normalisePackageDisplayLocation'),fn('packageNumericValue'),fn('packageCleanNumericString'),fn('normalisePackageOperatorKey'),fn('isPackageOperator'),fn('isJet2SourceInclusionCopy'),cn('JET2_APPROVED_INCLUSION_COPY'),fn('normaliseJet2PackageInclusionCopy'),fn('getActiveRenderCampaignType'),fn('normalisePackagePricingFields')].join('\n'),c);return c;}

const package1=[
 {offerId:'p1-1',ship:'Thanos Studios & Apartments',name:'Troulos, Skiathos',operator:'jet2',basePricePerPerson:'583',feePerPerson:'12',adults:'2',children:'0'},
 {offerId:'p1-2',ship:'Servatur Castillo De Sol',name:'Puerto Rico, Gran Canaria',operator:'jet2',basePricePerPerson:'550',feePerPerson:'1',adults:'2',children:'0'},
 {offerId:'p1-3',ship:'White City Beach Hotel',name:'Nr Alanya, Antalya Area',operator:'jet2',basePricePerPerson:'843',adults:'2',children:'0'},
 {offerId:'p1-4',ship:'Turgay Apartments',name:'Icmeler, Dalaman Area',operator:'jet2',basePricePerPerson:'583',adults:'2',children:'0'}
];
const package2=[
 {offerId:'p2-1',ship:'Servatur Caribe Apartments',name:'Playa de las Americas, Tenerife',operator:'jet2',basePricePerPerson:'285',feePerPerson:'0',adults:'2',children:'0',incl:'Hand Luggage Included · Coach Transfers'},
 {offerId:'p2-2',ship:'Servatur Castillo De Sol',name:'Puerto Rico, Gran Canaria',operator:'jet2',basePricePerPerson:'514',feePerPerson:'1',adults:'2',children:'0',incl:'Hand Luggage Included · Return Coach Transfers'},
 {offerId:'p2-3',ship:'White City Beach Hotel',name:'Nr Alayna, Antalya Area',operator:'jet2',basePricePerPerson:'703',adults:'2',children:'0',incl:'Luggage & Transfers Included'},
 {offerId:'p2-4',ship:'Sunset Paradise Resort',name:'Lassi, Kefalonia',operator:'jet2',basePricePerPerson:'574',feePerPerson:'12',adults:'2',children:'0',incl:'Luggage & Transfers Included'}
];
function normaliseCampaign(c,offers){return offers.map(source=>c.normalisePackagePricingFields(structuredClone(source)));}

test('Test Package 1 prices and headers remain attached to independent stable offer IDs through reorder and restore',()=>{
 const c=harness(); const offers=normaliseCampaign(c,package1);
 assert.deepEqual(offers.map(o=>[o.offerId,o.ship,Number(o.basePricePerPerson),Number(o.finalPricePerPerson),Number(o.finalTotal)]),[
  ['p1-1','Thanos Studios & Apartments',583,595,1190],['p1-2','Servatur Castillo De Sol',550,551,1102],['p1-3','White City Beach Hotel',843,843,1686],['p1-4','Turgay Apartments',583,583,1166]
 ]);
 assert.notEqual(offers[0].basePricePerPerson,'5683'); assert.notEqual(offers[3].basePricePerPerson,'5683');
 assert.deepEqual(offers.slice(2).map(o=>o.displayLocation),['Alanya, Turkey','Icmeler, Dalaman']);
 const reordered=[offers[3],offers[0],offers[1],offers[2]]; const restored=JSON.parse(JSON.stringify(reordered));
 assert.deepEqual(restored.map(o=>o.offerId),['p1-4','p1-1','p1-2','p1-3']);
 assert.equal(restored.find(o=>o.offerId==='p1-4').ship,'Turgay Apartments');
});

test('Test Package 2 preserves full resort separately, shortens only display location, and removes Coach',()=>{
 const c=harness(); const offers=normaliseCampaign(c,package2);
 assert.deepEqual(offers.slice(0,2).map(o=>[o.offerId,o.ship,Number(o.basePricePerPerson),Number(o.finalPricePerPerson),Number(o.finalTotal)]),[
  ['p2-1','Servatur Caribe Apartments',285,285,570],['p2-2','Servatur Castillo De Sol',514,515,1030]
 ]);
 assert.deepEqual(offers.map(o=>o.displayLocation),['Tenerife, Spain','Gran Canaria, Spain','Alanya, Turkey','Lassi, Kefalonia']);
 assert.deepEqual(offers.slice(0,2).map(o=>[o.fullResort,o.island,o.country]),[['Playa de las Americas','Tenerife','Spain'],['Puerto Rico','Gran Canaria','Spain']]);
 assert.equal(JSON.stringify(offers).match(/coach/gi),null);
 const restored=JSON.parse(JSON.stringify([offers[3],offers[0],offers[1],offers[2]]));
 assert.equal(restored.find(o=>o.offerId==='p2-1').fullResort,'Playa de las Americas');
 assert.equal(restored.find(o=>o.offerId==='p2-2').displayLocation,'Gran Canaria, Spain');
});

test('legacy Package restore repairs the OCR price and canonicalises Jet2 styling data before rendering',()=>{
 const c=harness();
 const restored=c.normalisePackagePricingFields({offerType:'package',cardStyle:'Jet2 Holidays',ship:'Thanos Studios & Apartments',name:'Troulos, Skiathos',price:'£5,683',leadPrice:'5683',basePricePerPerson:'5,683',totalPrice:'5683',bookingTotal:'5,683',feePerPerson:'12',adults:'2',children:'0'});
 assert.equal(restored.operator,'jet2');
 assert.equal(restored.operatorKey,'jet2');
 assert.deepEqual([restored.basePricePerPerson,restored.price,restored.leadPrice,restored.feePerPerson,restored.finalPricePerPerson],['583','583','583','12','595']);
 assert.equal(JSON.stringify(restored).includes('5683'),false);
});

test('Package-only code remains explicitly gated and fixed heading typography is not reduced or wrapped',()=>{
 assert.match(html,/normaliseCampaignType\(currentCampaignType\)==="package"/);
 assert.match(html,/\.pc \.pkg-destination\{[^}]*font-size:56px[^}]*white-space:nowrap/);
 assert.doesNotMatch(html,/\.pkg-destination[^}]*text-overflow:ellipsis/);
 assert.match(fn('parseScreenshotTextForActiveBuilder'),/builder==="package"/);
 assert.match(fn('parseScreenshotTextForActiveBuilder'),/isolated:true/);
});
