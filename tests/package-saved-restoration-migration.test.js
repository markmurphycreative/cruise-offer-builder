import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(name){const start=html.indexOf(`function ${name}(`);assert.notEqual(start,-1,name);const open=html.indexOf('{',start);let depth=0;for(let i=open;i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}')depth--;if(!depth)return html.slice(start,i+1);}throw Error(name);}
function cn(name){const match=html.match(new RegExp(`const\\s+${name}\\s*=`));assert.ok(match,name);return html.slice(match.index,html.indexOf(';',match.index)+1);}
function harness(){
  const context={Date,console,PERSISTED_PASTE_OFFER_KEY:'_rawPastedOfferText',createPackageOfferId:()=>`generated-id`,getPackageOperatorMatch:text=>/jet\s*2/i.test(text)?'jet2':''};
  vm.createContext(context);
  vm.runInContext([
    cn('PACKAGE_OPERATORS'),cn('PACKAGE_OFFER_SCHEMA_VERSION'),fn('normalisePackageOperatorKey'),fn('isPackageOperator'),
    fn('packageNumericValue'),fn('packageCleanNumericString'),fn('getLegacyPackageSourceEvidence'),
    fn('getLegacyPackageOperatorEvidence'),fn('getLegacyPackageParsedSource'),fn('migrateLegacyPackageOffer')
  ].join('\n'),context);
  return context;
}

test('saved Test Offers 2 migration repairs every legacy offer by stable ID and preserves valid lower offers',()=>{
  const c=harness();
  const source=(base,fee)=>({supplier:'Jet2 Holidays',parsed:{basePricePerPerson:String(base),feePerPerson:String(fee),passengerCount:'2',adults:'2',children:'0'}});
  const legacy=[
    {offerId:'test-offers-2-tenerife',offerType:'package',campaignType:'package',operator:'Operator not detected',cardStyle:'generic',name:'Tenerife, Spain',ship:'Servatur Caribe Apartments',price:'285',leadPrice:'285',totalPrice:'570',bookingTotal:'570',adults:'2',children:'0',packageImportMetadata:source(574,12)},
    {offerId:'test-offers-2-gran-canaria',offerType:'package',campaignType:'package',operator:'',cardType:'fallback',name:'Gran Canaria, Spain',ship:'Servatur Castillo De Sol',price:'515',leadPrice:'515',totalPrice:'1030',bookingTotal:'1030',adults:'2',children:'0',packageImportMetadata:source(550,1)},
    {offerId:'test-offers-2-alanya',offerType:'package',campaignType:'package',operator:'jet2',operatorKey:'jet2',cardType:'jet2-package',rendererId:'jet2-package',packageSchemaVersion:2,name:'Alanya, Turkey',basePricePerPerson:'703'},
    {offerId:'test-offers-2-icmeler',offerType:'package',campaignType:'package',operator:'jet2',operatorKey:'jet2',cardType:'jet2-package',rendererId:'jet2-package',packageSchemaVersion:2,name:'Icmeler, Dalaman',basePricePerPerson:'574',feePerPerson:'12'}
  ];
  const validBefore=structuredClone(legacy.slice(2));
  const restored=legacy.map(offer=>c.migrateLegacyPackageOffer(offer));

  assert.deepEqual(restored.map(offer=>offer.offerId),legacy.map(offer=>offer.offerId));
  assert.deepEqual(restored.slice(0,2).map(offer=>[offer.operator,offer.cardType,offer.basePricePerPerson,offer.feePerPerson,offer.finalPricePerPerson,offer.finalTotal]),[
    ['jet2','jet2-package','574','12','586','1172'],
    ['jet2','jet2-package','550','1','551','1102']
  ]);
  assert.equal(JSON.stringify(restored.slice(0,2)).match(/"(?:price|leadPrice|totalPrice|bookingTotal)":"(?:285|515|1030)"/),null);
  assert.equal(JSON.stringify(restored.slice(2)),JSON.stringify(validBefore));
  assert.deepEqual(restored.map(offer=>offer.name),['Tenerife, Spain','Gran Canaria, Spain','Alanya, Turkey','Icmeler, Dalaman']);
});

test('operator recovery requires explicit supplier evidence and never defaults an unresolved Package offer to Jet2',()=>{
  const c=harness();
  const unresolved=c.migrateLegacyPackageOffer({offerId:'tui-compatible',offerType:'package',name:'Tenerife, Spain',price:'600'});
  assert.equal(unresolved.operator,'');
  assert.equal(unresolved.cardType,undefined);
  assert.equal(unresolved.price,'600');
  assert.doesNotMatch(fn('renderPackageOperatorLogo'),/Operator not detected/);
});
