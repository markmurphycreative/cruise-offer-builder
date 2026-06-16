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
  assert.match(html, /const tags=d\.tags\|\|OPERATOR_USP_PRESETS\[key\]\|\|"Cruise · Destinations · Entertainment";/, 'card header should read the unchanged offer.tags key');
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

  assert.match(elements['copy-qa-checklist'].innerHTML, /<strong>USP text<\/strong><span class="state">✓ Checked<\/span>/);
  assert.doesNotMatch(elements['copy-qa-checklist'].innerHTML, /<strong>USP text<\/strong><span class="state">— Empty \/ not checked<\/span>/);
});
