import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const EXPECTED_CRUISE_PRESETS = {
  ambassador: 'Adult Only Options · Entertainment · Sustainability · Value',
  celebrity: 'Cuisine · Cultural Experiences · Entertainment · Overnight Port Stays',
  cunard: 'Cuisine · Entertainment · Luxury · Wellness',
  fred: 'Cultural Experiences · Education · Entertainment · Unique Itineraries',
  marella: 'Accessible · Adult Only Options · All-inclusive · Entertainment',
  msc: 'All-inclusive · Entertainment · Family · Diverse Itineraries',
  ncl: "Entertainment · Family · Kids' Clubs · Value",
  po: 'Adult Only Options · Cuisine · Entertainment · Family',
  princess: 'All-inclusive · Cuisine · Entertainment · Family',
  royal: "Amenities · Family · Entertainment · Kids' Clubs",
  virgin: 'All-inclusive · Cuisine · Overnight Port Stays · Adult Only Options'
};

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not locate ${label}`);
  return match[0];
}

function createOperatorHarness() {
  const fields = {
    'f-operator': { value: '' },
    'f-tags': { value: '' },
    'f-url': { value: '' },
    'logo-override-area': { style: {} }
  };
  const source = [
    extract(/const OPERATOR_USP_PRESETS = \{[\s\S]*?\n\};/, 'OPERATOR_USP_PRESETS'),
    extract(/function operatorChanged\(silent\)\{[\s\S]*?\n\}/, 'operatorChanged')
  ].join('\n').replace('const OPERATOR_USP_PRESETS', 'var OPERATOR_USP_PRESETS');
  const context = {
    document: { getElementById: id => fields[id] },
    offers: [{}],
    cur: 0,
    OPERATOR_HEADERS: Object.fromEntries(Object.keys(EXPECTED_CRUISE_PRESETS).map(key => [key, {}])),
    OPERATOR_CONFIG: {},
    getOperatorLandingUrl: () => '',
    shouldAutoFillUrl: () => false,
    rv: () => {},
    genUtm: () => {},
    genStandardUtms: () => {},
    updateExportFilenames: () => {}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, fields };
}

test('every supported cruise operator has the exact requested USP preset', () => {
  const { context } = createOperatorHarness();
  assert.deepEqual(
    Object.fromEntries(Object.keys(EXPECTED_CRUISE_PRESETS).map(key => [key, context.OPERATOR_USP_PRESETS[key]])),
    EXPECTED_CRUISE_PRESETS
  );
});

test('selecting and switching operators always replaces the current USP field value', () => {
  const { context, fields } = createOperatorHarness();
  for (const [key, expected] of Object.entries(EXPECTED_CRUISE_PRESETS)) {
    fields['f-tags'].value = 'Previously edited USP value';
    context.offers[0].tags = fields['f-tags'].value;
    fields['f-operator'].value = key;
    context.operatorChanged();
    assert.equal(fields['f-tags'].value, expected, `${key} field preset`);
    assert.equal(context.offers[0].tags, expected, `${key} offer preset`);
  }
});

test('the populated USP input remains user-editable until the next operator selection', () => {
  const { context, fields } = createOperatorHarness();
  fields['f-operator'].value = 'po';
  context.operatorChanged();
  fields['f-tags'].value = 'User edited USP';
  context.offers[0].tags = fields['f-tags'].value;
  assert.equal(fields['f-tags'].value, 'User edited USP');
  assert.equal(context.offers[0].tags, 'User edited USP');
  context.operatorChanged(true);
  assert.equal(fields['f-tags'].value, 'User edited USP');
  assert.equal(context.offers[0].tags, 'User edited USP');
  assert.match(html, /<input id="f-tags"[^>]*oninput="up\(\)"[^>]*>/);
  assert.doesNotMatch(html.match(/<input id="f-tags"[^>]*>/)[0], /\b(?:readonly|disabled)\b/i);
});

test('card generation and existing export entry points remain present', () => {
  for (const functionName of [
    'renderCardHTML',
    'renderCardToImageBlob',
    'exportCurrentJPG',
    'exportAllJPG',
    'exportCampaignPack'
  ]) {
    assert.match(html, new RegExp(`function ${functionName}\\(`), `${functionName} should remain defined`);
  }
});
