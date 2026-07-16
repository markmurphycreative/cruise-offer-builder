import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('campaign type defines filtered operator buckets and syncs the dropdown when context changes', () => {
  assert.match(html, /const CAMPAIGN_OPERATOR_KEYS = \{[\s\S]*cruise:\["po","amawaterways","marella","royal","ambassador","celebrity","fred","msc","cunard","ncl","princess","virgin"\][\s\S]*package:\["tui","jet2","easyjet"\][\s\S]*touring:\["riviera","wendy","newmarket","travelsphere","justyou","titan"\][\s\S]*worldwide:\["kuoni","inspiring","goldmedal"\]/);
  assert.match(html, /function syncOperatorDropdownForCampaign\(type=currentCampaignType\)\{[\s\S]*option\.hidden=!visible;[\s\S]*option\.disabled=!visible;[\s\S]*select\.value="";[\s\S]*offers\[cur\]\.operator="";/);
  assert.match(html, /function applyCampaignContext\(type=currentCampaignType\)\{[\s\S]*syncOperatorDropdownForCampaign\(currentCampaignType\);[\s\S]*return currentCampaignType;/);
});

test('operator saving and changing rejects operators outside the active campaign type', () => {
  assert.match(html, /function operatorChanged\(silent\)\{[\s\S]*syncOperatorDropdownForCampaign\(currentCampaignType\);[\s\S]*if\(!isOperatorValidForCampaign\(key,currentCampaignType\)\)\{[\s\S]*key="";[\s\S]*operatorSelect\.value="";/);
  assert.match(html, /offers\[cur\]\.operator=isOperatorValidForCampaign\(op\.value,currentCampaignType\)\?op\.value:"";/);
  assert.match(html, /base\.operator = isOperatorValidForCampaign\(op\.value,currentCampaignType\) \? \(op\.value \|\| ''\) : '';/);
});

test('card rendering routes by active campaign type without package operator or missing-field cruise fallback', () => {
  assert.match(html, /function getActiveRenderCampaignType\(d\)\{[\s\S]*return normaliseCampaignType\(typeof currentCampaignType!=="undefined" \? currentCampaignType : "cruise"\);[\s\S]*\}/);
  assert.match(html, /function renderCardHTML\(d\)\{[\s\S]*if\(activeType==="package"\) return renderPackageCard[\s\S]*if\(activeType==="touring"\) return renderTouringCard[\s\S]*if\(activeType==="worldwide"\) return renderWorldwideCard[\s\S]*return renderCruiseCard\(d\);[\s\S]*\}/);
  assert.match(html, /function isPackageOffer\(d\)\{ return getActiveRenderCampaignType\(d\)==="package"; \}/);
});
