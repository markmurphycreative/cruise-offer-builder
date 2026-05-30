import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not locate ${label}`);
  return match[0];
}

function createShipQaHarness() {
  const source = [
    extract(/const OPERATOR_SHIPS = \{[\s\S]*?\n\};/, 'OPERATOR_SHIPS'),
    extract(/function levenshteinDistance\(a,b\)\{[\s\S]*?\n\}/, 'levenshteinDistance'),
    extract(/function getOperatorShipQaIssue\(operatorKey,shipName\)\{[\s\S]*?\n\}/, 'getOperatorShipQaIssue')
  ].join('\n').replace('const OPERATOR_SHIPS', 'var OPERATOR_SHIPS');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test('Royal Caribbean ship catalogue contains the official first-pass list', () => {
  const { OPERATOR_SHIPS } = createShipQaHarness();
  assert.equal(OPERATOR_SHIPS.royal.length, 30);
  assert.ok(OPERATOR_SHIPS.royal.includes('Navigator of the Seas'));
  assert.deepEqual(Object.keys(OPERATOR_SHIPS), ['royal']);
});

test('exact Royal Caribbean ship name passes QA', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('royal', 'Navigator of the Seas'), '');
});

test('close Royal Caribbean ship name warns with the closest suggestion', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(
    getOperatorShipQaIssue('royal', 'Navigator of the Seat'),
    'Possible ship name error: did you mean Navigator of the Seas?'
  );
});

test('empty Royal Caribbean ship name keeps empty QA behaviour', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('royal', ''), '');
});

test('unknown Royal Caribbean ship name receives a soft warning without suggestion', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(
    getOperatorShipQaIssue('royal', 'Entirely Unknown Vessel'),
    'Ship name not found in Royal Caribbean ship list.'
  );
});

test('other operators retain existing ship QA behaviour', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('po', 'Navigator of the Seat'), '');
  assert.equal(getOperatorShipQaIssue('', 'Navigator of the Seat'), '');
});

function createQaPanelHarness(operator, ship) {
  const elements = Object.fromEntries([
    ['f-name', ''],
    ['f-ship', ship],
    ['f-incl', ''],
    ['f-ports', ''],
    ['f-tags', ''],
    ['raw-paste', ''],
    ['f-operator', operator],
    ['spell-warn-name', ''],
    ['spell-warn-ports', ''],
    ['spell-warn-tags', ''],
    ['spell-warn-raw', ''],
    ['copy-qa-status', ''],
    ['copy-qa-checklist', ''],
    ['copy-qa-note', '']
  ].map(([id, value]) => [id, {
    id,
    value,
    textContent: '',
    innerHTML: '',
    classList: { classes: new Set(), toggle(name, force) { force ? this.classes.add(name) : this.classes.delete(name); } }
  }]));
  const source = [
    extract(/const OPERATOR_SHIPS = \{[\s\S]*?\n\};/, 'OPERATOR_SHIPS'),
    extract(/const SPELLCHECK_FIELDS=\[[\s\S]*?\n\];/, 'SPELLCHECK_FIELDS'),
    extract(/const PROTECTED_WORDS=new Set\([\s\S]*?\);/, 'PROTECTED_WORDS'),
    'let copyQaRunCount=0;',
    extract(/function getLikelyTypos\(text\)\{[\s\S]*?\n\}/, 'getLikelyTypos'),
    extract(/function levenshteinDistance\(a,b\)\{[\s\S]*?\n\}/, 'levenshteinDistance'),
    extract(/function getOperatorShipQaIssue\(operatorKey,shipName\)\{[\s\S]*?\n\}/, 'getOperatorShipQaIssue'),
    extract(/function setSpellWarn\(warnId,msg\)\{[^\n]+\}/, 'setSpellWarn'),
    extract(/function buildQaChecklist\(rows\)\{[\s\S]*?\n\}/, 'buildQaChecklist'),
    extract(/function runSpellQA\(\)\{[\s\S]*?\n\}/, 'runSpellQA')
  ].join('\n').replace('const OPERATOR_SHIPS', 'var OPERATOR_SHIPS');
  const context = { document: { getElementById: id => elements[id] } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, elements };
}

test('Royal Caribbean close match appears as a passive QA warning in the existing panel', () => {
  const { context, elements } = createQaPanelHarness('royal', 'Navigator of the Seat');
  context.runSpellQA();
  assert.match(elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">⚠ Review<\/span>/);
  assert.match(elements['spell-warn-name'].textContent, /Possible ship name error: did you mean Navigator of the Seas\?/);
  assert.match(elements['copy-qa-note'].textContent, /Possible ship name error: did you mean Navigator of the Seas\?/);
});

test('Royal Caribbean exact and empty values preserve checked and empty panel states', () => {
  const exact = createQaPanelHarness('royal', 'Navigator of the Seas');
  exact.context.runSpellQA();
  assert.match(exact.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">✓ Checked<\/span>/);

  const empty = createQaPanelHarness('royal', '');
  empty.context.runSpellQA();
  assert.match(empty.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">— Empty \/ not checked<\/span>/);
});

test('unknown Royal Caribbean value and non-Royal value diverge only for operator-scoped QA', () => {
  const unknown = createQaPanelHarness('royal', 'Entirely Unknown Vessel');
  unknown.context.runSpellQA();
  assert.match(unknown.elements['spell-warn-name'].textContent, /Ship name not found in Royal Caribbean ship list\./);

  const other = createQaPanelHarness('po', 'Entirely Unknown Vessel');
  other.context.runSpellQA();
  assert.match(other.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">✓ Checked<\/span>/);
  assert.equal(other.elements['spell-warn-name'].textContent, '');
});
