import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name){
  const start = html.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} exists`);
  const bodyStart = html.indexOf('{', html.indexOf(')', start));
  assert.notEqual(bodyStart, -1, `${name} body starts`);
  let depth = 0;
  let opened = false;
  for(let i=bodyStart;i<html.length;i++){
    if(html[i] === '{'){ depth++; opened = true; }
    else if(html[i] === '}'){
      depth--;
      if(opened && depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`${name} did not close`);
}

test('authoritative Package model has isolated Package slots, metadata, active index, operator, assets and copy overrides', () => {
  assert.match(html, /function createCampaignModel[\s\S]*metadata:Object\.assign/);
  assert.match(html, /function createCampaignModel[\s\S]*cruiseOffers:createBlankOfferSlotsForCampaign\("cruise"\)/);
  assert.match(html, /function createCampaignModel[\s\S]*packageOffers:createBlankOfferSlotsForCampaign\("package"\)/);
  assert.match(html, /function createCampaignModel[\s\S]*activeOfferIndex:0/);
  assert.match(html, /function createCampaignModel[\s\S]*packageFields:\{\}/);
  assert.match(html, /function createCampaignModel[\s\S]*packageOperatorState:\{operator:"",operatorKey:""\}/);
  assert.match(html, /function createCampaignModel[\s\S]*packageAssetState:\{\}/);
  assert.match(html, /function createCampaignModel[\s\S]*packageCopyOverrides:\{\}/);
});

test('blank Package offers are created by a factory and exclude ghost-offer fields', () => {
  const fn = extractFunction('createBlankPackageOffer');
  assert.match(fn, /return \{offerType:"package",packageCopyOverrides:\{\}\};/);
  for (const field of ['destination','hotel','date','airport','price','resortFee','operator','ship','ports','cabin','tags','theme_tags']) {
    assert.doesNotMatch(fn, new RegExp(`\\b${field}\\b`));
  }
});

test('New Package replaces the campaign model and active offer collection instead of mutating old offers', () => {
  const reset = extractFunction('resetBuilderToBlankSession');
  assert.match(reset, /replaceCampaignModel\(campaignType\)/);
  assert.match(reset, /currentCampaignType = campaignType/);
  assert.match(reset, /cur = 0/);
  assert.match(extractFunction('replaceCampaignModel'), /campaignModel=createCampaignModel\(type, metadata\)/);
  assert.match(extractFunction('syncOffersAliasForCampaign'), /offers=getActiveOfferCollection\(currentCampaignType\)/);
});

test('Package render/data paths use packageOffers[cur] and do not read visible fields for blank Package identity', () => {
  assert.match(extractFunction('currentFormData'), /packageOffers[\s\S]*createBlankPackageOffer\(\)/);
  assert.match(extractFunction('visibleFieldsToData'), /packageOffers[\s\S]*createBlankPackageOffer\(\)/);
  assert.match(extractFunction('renderVisibleCard'), /syncOffersAliasForCampaign\(currentCampaignType\)/);
  assert.match(extractFunction('renderPreviewMode'), /syncOffersAliasForCampaign\(currentCampaignType\)/);
});

test('Package loaded count rejects Cruise offers and Package save serializes active Package collection only', () => {
  assert.match(extractFunction('isOfferLoaded'), /currentCampaignType[\s\S]*==="package"[\s\S]*o\.offerType[\s\S]*!=="package"[\s\S]*return false/);
  assert.match(extractFunction('buildAutosavePayload'), /getActiveOfferCollection\(activeCampaignType\)/);
  assert.match(extractFunction('buildCampaignFilePayload'), /makePortableCampaignOffers\(getActiveOfferCollection\(currentCampaignType\)\)/);
});

for (const [name, pattern] of [
  ['Cruise loaded → Home → New Package', /replaceCampaignModel\(campaignType\)[\s\S]*currentCampaignType = campaignType/],
  ['Package loaded → Home → New Package', /packageOffers=createBlankOfferSlotsForCampaign\("package"\)/],
  ['Package loaded → New Campaign', /function resetBuilderToFreshSession[\s\S]*resetBuilderToBlankSession/],
  ['Package Offer 1 loaded → switch Offer 2', /function sv[\s\S]*cur = next[\s\S]*loadOfferToEditor\(cur\)/],
  ['Package Offer 1 loaded → new campaign → switch Offer 1', /replaceCampaignModel[\s\S]*cur=0/],
  ['Save Package → load Package → New Package', /applySessionPayload[\s\S]*replaceCampaignModel\(restoreType\)/],
  ['Refresh with recovered session → New Package', /restoreSavedSessionOnStartup[\s\S]*applySessionPayload/],
  ['Blank Package preview rendered repeatedly', /isPackageOfferMaterializedFromEditor[\s\S]*meaningful\.some/]
]) {
  test(`state-transition guard: ${name}`, () => assert.match(html, pattern));
}
