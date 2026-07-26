import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=name=>{
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`${name} must exist`);
  let brace=source.indexOf('{',start),depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{') depth++;
    if(source[i]==='}'&&!--depth) return source.slice(start,i+1);
  }
  throw new Error(`Could not extract ${name}`);
};

test('campaign type, not detected fields, selects the paste parser',()=>{
  const body=fn('parseOffer');
  assert.match(body,/campaignType==="package"[\s\S]*parsePackageOfferText/);
  assert.match(body,/parseOfferText\(raw,\{renderIntelligence:true\}\)/);
  assert.doesNotMatch(body,/detection\.offerType==="package"\|\|detection\.isPackage/);
});

test('screenshot import is Package-only and has no Cruise parser fallback',()=>{
  const body=fn('parseScreenshotTextForActiveBuilder');
  assert.match(body,/builder==="package"[\s\S]*parsePackageOfferText/);
  assert.doesNotMatch(body,/parseOfferText/);
  assert.match(body,/return null/);
});

test('offer loading invokes Package normalisers only inside the Package route',()=>{
  const body=fn('normaliseOfferForCampaign');
  const packageBranch=body.indexOf('if(campaignType==="package")');
  assert.ok(packageBranch>0);
  for(const normaliser of ['normalisePackagePricingFields','syncPackageCanonicalFields','applyJet2PackageDefaults']){
    assert.ok(body.indexOf(normaliser)>packageBranch,`${normaliser} must be Package-only`);
  }
  assert.doesNotMatch(fn('loadOfferToEditor'),/applyJet2PackageDefaults\(normalisePackagePricingFields/);
});

test('restore and parsed-result application enforce authoritative campaign type',()=>{
  const restore=fn('applySessionPayload');
  assert.match(restore,/data\.campaignType \|\| "cruise"/);
  assert.doesNotMatch(restore,/inferCampaignTypeFromOffers/);
  assert.match(restore,/stampOfferCollectionCampaignType\(offers,restoreType\)/);
  const apply=fn('applyParsedOffer');
  assert.match(apply,/parsedType!==activeType/);
  assert.match(apply,/stampOfferCampaignType\(offers\[cur\],activeType\)/);
});

test('bulk assignment cannot turn a Cruise offer into Package because its operator is Jet2',()=>{
  const body=fn('applyParsedOfferToSlot');
  assert.match(body,/const isPackage=routeType==="package"/);
  assert.match(body,/if\(isPackage && String\(offer\.operator/);
  assert.doesNotMatch(body,/offer\.offerType="package"/);
});

test('campaign reset clears screenshot and paste parser results',()=>{
  const body=fn('resetTransientCampaignState');
  assert.match(body,/pendingParseResult = null/);
  assert.match(body,/pendingScreenshotImports = \[\]/);
  assert.match(body,/activeScreenshotImportIndex = 0/);
});
