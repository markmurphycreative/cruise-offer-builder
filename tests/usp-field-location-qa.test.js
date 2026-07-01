import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function section(key) {
  const start = html.indexOf(`data-section-key="${key}"`);
  assert.notEqual(start, -1, `${key} section should exist`);
  const next = html.indexOf('<div class="section"', start + 1);
  return html.slice(start, next === -1 ? html.length : next);
}

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not locate ${label}`);
  return match[0];
}

test('USP top-bar input is the existing tags field in Offer Details only', () => {
  const operatorLogo = section('operator-logo');
  const offerDetails = section('offer-details');

  assert.doesNotMatch(operatorLogo, /id="f-tags"/, 'Operator Logo panel should not contain the USP field');
  assert.match(offerDetails, /<label>Top Bar USP Text<\/label><input id="f-tags"[^>]*oninput="up\(\)"/, 'Offer Details should contain the existing f-tags binding');
  assert.equal((html.match(/id="f-tags"/g) || []).length, 1, 'USP input should not be duplicated');
});

test('existing campaign data still restores USP text through the unchanged tags field key', () => {
  assert.match(html, /const FLDS = \["tags",/, 'tags remains the first saved/restored offer field');
  assert.match(html, /FLDS\.forEach\(f=>\{ const e=document\.getElementById\("f-"\+f\); if\(e\) offers\[cur\]\[f\]=e\.value; \}\);/, 'save continues persisting f-tags to offer.tags');
  assert.match(html, /FLDS\.forEach\(f=>\{ const e=document\.getElementById\("f-"\+f\); if\(e\) e\.value=offers\[i\]\[f\]\|\|""; \}\);/, 'load continues restoring offer.tags to f-tags');
});

test('card rendering and export continue using offer.tags for the top-bar USP strip', () => {
  assert.match(html, /const tags=String\(d\.tags\|\|OPERATOR_USP_PRESETS\[key\]\|\|"Cruise · Destinations · Entertainment"\)/, 'card header should read the unchanged offer.tags key');
  assert.match(html, /<div class="operator-png-usp" style="background:\$\{accent\};">\$\{tags\}<\/div>/, 'top strip should render the tags value unchanged');
  for (const functionName of ['renderCardHTML', 'renderCardToImageBlob', 'exportCurrentJPG', 'exportAllJPG', 'exportCampaignPack']) {
    assert.match(html, new RegExp(`function ${functionName}\\(`), `${functionName} should remain defined`);
  }
});

test('Copy QA marks USP text as checked when the existing f-tags value is populated', () => {
  const fields = Object.fromEntries(['f-name', 'f-ship', 'f-incl', 'f-ports', 'f-tags', 'raw-paste', 'f-operator'].map(id => [id, { value: '', classList: { toggle() {} } }]));
  fields['f-tags'].value = 'Adult Only Options · Cuisine · Entertainment · Family';
  const elements = {
    ...fields,
    'copy-qa-checklist': { innerHTML: '' },
    'copy-qa-status': { textContent: '', classList: { toggle() {} } },
    'copy-qa-note': { textContent: '' },
    'spell-warn-name': { textContent: '' },
    'spell-warn-ports': { textContent: '' },
    'spell-warn-tags': { textContent: '' },
    'spell-warn-raw': { textContent: '' }
  };
  const source = [
    extract(/const SPELLCHECK_FIELDS=\[[\s\S]*?\n\];/, 'SPELLCHECK_FIELDS'),
    extract(/const PROTECTED_WORDS=[\s\S]*?;\nlet copyQaRunCount=0;/, 'copy QA globals'),
    extract(/function getLikelyTypos\(text\)\{[\s\S]*?\n\}/, 'getLikelyTypos'),
    extract(/function buildQaChecklist\(rows\)\{[\s\S]*?\n\}/, 'buildQaChecklist'),
    extract(/function getCurrentOfferUspText\(\)\{[\s\S]*?\n\}/, 'getCurrentOfferUspText'),
    extract(/function runSpellQA\(\)\{[\s\S]*?\n\}/, 'runSpellQA')
  ].join('\n').replace('const SPELLCHECK_FIELDS', 'var SPELLCHECK_FIELDS').replace('const PROTECTED_WORDS', 'var PROTECTED_WORDS').replace('let copyQaRunCount=0;', 'var copyQaRunCount=0;');
  const context = {
    document: { getElementById: id => elements[id] || null },
    setSpellWarn: (id, value) => { if (elements[id]) elements[id].textContent = value; },
    getOperatorShipQaIssue: () => ''
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.runSpellQA();

  assert.match(elements['copy-qa-checklist'].innerHTML, /<strong>USP text<\/strong><span class="state">Adult Only Options · Cuisine · Entertainment · Family<\/span>/);
  assert.doesNotMatch(elements['copy-qa-checklist'].innerHTML, /<strong>USP text<\/strong><span class="state">Missing<\/span>/);
});


test('Copy QA checks current selected offer tags when the visible USP field has not supplied text', () => {
  const fields = Object.fromEntries(['f-name', 'f-ship', 'f-incl', 'f-ports', 'f-tags', 'raw-paste', 'f-operator'].map(id => [id, { value: '', classList: { toggle() {} } }]));
  const elements = {
    ...fields,
    'copy-qa-checklist': { innerHTML: '' },
    'copy-qa-status': { textContent: '', classList: { toggle() {} } },
    'copy-qa-note': { textContent: '' },
    'spell-warn-name': { textContent: '' },
    'spell-warn-ports': { textContent: '' },
    'spell-warn-tags': { textContent: '' },
    'spell-warn-raw': { textContent: '' }
  };
  const source = [
    extract(/const SPELLCHECK_FIELDS=\[[\s\S]*?\n\];/, 'SPELLCHECK_FIELDS'),
    extract(/const PROTECTED_WORDS=[\s\S]*?;\nlet copyQaRunCount=0;/, 'copy QA globals'),
    extract(/function getLikelyTypos\(text\)\{[\s\S]*?\n\}/, 'getLikelyTypos'),
    extract(/function buildQaChecklist\(rows\)\{[\s\S]*?\n\}/, 'buildQaChecklist'),
    extract(/function getCurrentOfferUspText\(\)\{[\s\S]*?\n\}/, 'getCurrentOfferUspText'),
    extract(/function runSpellQA\(\)\{[\s\S]*?\n\}/, 'runSpellQA')
  ].join('\n').replace('const SPELLCHECK_FIELDS', 'var SPELLCHECK_FIELDS').replace('const PROTECTED_WORDS', 'var PROTECTED_WORDS').replace('let copyQaRunCount=0;', 'var copyQaRunCount=0;');
  const context = {
    document: { getElementById: id => elements[id] || null },
    setSpellWarn: (id, value) => { if (elements[id]) elements[id].textContent = value; },
    getOperatorShipQaIssue: () => '',
    offers: [{ tags: '' }, { tags: 'Cuisine · Entertainment · Family' }],
    cur: 1
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.runSpellQA();

  assert.match(elements['copy-qa-checklist'].innerHTML, /<strong>USP text<\/strong><span class="state">Cuisine · Entertainment · Family<\/span>/);
});

test('Copy QA marks USP text empty only when f-tags and current offer tags are both empty', () => {
  const fields = Object.fromEntries(['f-name', 'f-ship', 'f-incl', 'f-ports', 'f-tags', 'raw-paste', 'f-operator'].map(id => [id, { value: '', classList: { toggle() {} } }]));
  const elements = {
    ...fields,
    'copy-qa-checklist': { innerHTML: '' },
    'copy-qa-status': { textContent: '', classList: { toggle() {} } },
    'copy-qa-note': { textContent: '' },
    'spell-warn-name': { textContent: '' },
    'spell-warn-ports': { textContent: '' },
    'spell-warn-tags': { textContent: '' },
    'spell-warn-raw': { textContent: '' }
  };
  const source = [
    extract(/const SPELLCHECK_FIELDS=\[[\s\S]*?\n\];/, 'SPELLCHECK_FIELDS'),
    extract(/const PROTECTED_WORDS=[\s\S]*?;\nlet copyQaRunCount=0;/, 'copy QA globals'),
    extract(/function getLikelyTypos\(text\)\{[\s\S]*?\n\}/, 'getLikelyTypos'),
    extract(/function buildQaChecklist\(rows\)\{[\s\S]*?\n\}/, 'buildQaChecklist'),
    extract(/function getCurrentOfferUspText\(\)\{[\s\S]*?\n\}/, 'getCurrentOfferUspText'),
    extract(/function runSpellQA\(\)\{[\s\S]*?\n\}/, 'runSpellQA')
  ].join('\n').replace('const SPELLCHECK_FIELDS', 'var SPELLCHECK_FIELDS').replace('const PROTECTED_WORDS', 'var PROTECTED_WORDS').replace('let copyQaRunCount=0;', 'var copyQaRunCount=0;');
  const context = {
    document: { getElementById: id => elements[id] || null },
    setSpellWarn: (id, value) => { if (elements[id]) elements[id].textContent = value; },
    getOperatorShipQaIssue: () => '',
    offers: [{ tags: '' }],
    cur: 0
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.runSpellQA();

  assert.match(elements['copy-qa-checklist'].innerHTML, /<strong>USP text<\/strong><span class="state">Missing<\/span>/);
});

test('imported offers materialise operator top-bar presets when switching selected offers', () => {
  assert.match(html, /if\(o\.operator\|\|o\.name\|\|o\.ship\|\|o\.price\|\|o\.incl\|\|o\.ports\) applyOperatorTopBarUspDefault\(o,o\.operator\|\|""\);/, 'load path should materialise top-bar USP fallback on the offer');
  assert.match(html, /FLDS\.forEach\(f=>\{\n    const e=document\.getElementById\('f-'\+f\);\n    if\(e\) e\.value = o\[f\] \|\| '';\n  \}\);/, 'load path should restore offer.tags into the visible f-tags field through FLDS');
});

test('campaign save/load preserves imported USP values through the tags field', () => {
  assert.match(html, /function buildAutosavePayload\(\)\{[\s\S]*?const clonedOffers = JSON\.parse\(JSON\.stringify\(offers \|\| \[\{\},\{\},\{\},\{\}\]\)\);/, 'campaign/autosave payload should clone offers including tags');
  assert.match(html, /function applySessionPayload\(data\)\{[\s\S]*?offers = data\.offers\.slice\(0,4\)\.map/, 'campaign/session restore should restore saved offers including tags');
  assert.match(html, /const FLDS = \["tags",/, 'tags should remain part of the editor save/load field list');
});

test('Copy QA marks imported USP text checked without manual f-tags typing', () => {
  const fields = Object.fromEntries(['f-name', 'f-ship', 'f-incl', 'f-ports', 'f-tags', 'raw-paste', 'f-operator'].map(id => [id, { value: '', classList: { toggle() {} } }]));
  const elements = {
    ...fields,
    'copy-qa-checklist': { innerHTML: '' },
    'copy-qa-status': { textContent: '', classList: { toggle() {} } },
    'copy-qa-note': { textContent: '' },
    'spell-warn-name': { textContent: '' },
    'spell-warn-ports': { textContent: '' },
    'spell-warn-tags': { textContent: '' },
    'spell-warn-raw': { textContent: '' }
  };
  const source = [
    extract(/const SPELLCHECK_FIELDS=\[[\s\S]*?\n\];/, 'SPELLCHECK_FIELDS'),
    extract(/const PROTECTED_WORDS=[\s\S]*?;\nlet copyQaRunCount=0;/, 'copy QA globals'),
    extract(/function getLikelyTypos\(text\)\{[\s\S]*?\n\}/, 'getLikelyTypos'),
    extract(/function buildQaChecklist\(rows\)\{[\s\S]*?\n\}/, 'buildQaChecklist'),
    extract(/function getCurrentOfferUspText\(\)\{[\s\S]*?\n\}/, 'getCurrentOfferUspText'),
    extract(/function runSpellQA\(\)\{[\s\S]*?\n\}/, 'runSpellQA')
  ].join('\n').replace('const SPELLCHECK_FIELDS', 'var SPELLCHECK_FIELDS').replace('const PROTECTED_WORDS', 'var PROTECTED_WORDS').replace('let copyQaRunCount=0;', 'var copyQaRunCount=0;');
  const context = {
    document: { getElementById: id => elements[id] || null },
    setSpellWarn: (id, value) => { if (elements[id]) elements[id].textContent = value; },
    getOperatorShipQaIssue: () => '',
    offers: [{ tags: 'Accessible · All Inclusive · Entertainment · Family' }],
    cur: 0
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.runSpellQA();

  assert.match(elements['copy-qa-checklist'].innerHTML, /<strong>USP text<\/strong><span class="state">Accessible · All Inclusive · Entertainment · Family<\/span>/);
});

test('Copy QA excludes technical URLs from spelling warnings while keeping customer copy checks', () => {
  assert.match(html, /\{id:"f-url",warnId:"spell-warn-name",label:"Landing page",notRelevant:true,spellcheck:false\}/, 'landing page should be present in QA status but excluded from spellchecking');
  const source = [
    extract(/const PROTECTED_WORDS=[\s\S]*?;\nlet copyQaRunCount=0;/, 'copy QA globals'),
    extract(/function getLikelyTypos\(text\)\{[\s\S]*?\n\}/, 'getLikelyTypos')
  ].join('\n').replace('const PROTECTED_WORDS', 'var PROTECTED_WORDS').replace('let copyQaRunCount=0;', 'var copyQaRunCount=0;');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.deepEqual(JSON.parse(JSON.stringify(context.getLikelyTypos('https://www.dawsonandsanderson.co.uk/cruises?utm_source=email&utm_medium=newsletter'))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(context.getLikelyTypos('hero-image-caribean.jpg'))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(context.getLikelyTypos('Caribean cruise with tranfers incldued'))), ['caribean', 'tranfers', 'incldued']);
});
