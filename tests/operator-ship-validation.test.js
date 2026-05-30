import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('ship name QA warnings use the stronger red warning treatment', () => {
  assert.match(html, /#spell-warn-name\{color:var\(--red\);\}/);
});

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
  assert.deepEqual(Object.keys(OPERATOR_SHIPS), ['ambassador', 'celebrity', 'cunard', 'fred', 'marella', 'msc', 'ncl', 'po', 'princess', 'royal', 'virgin']);
});

test('Ambassador Cruise Line ship catalogue contains the requested list', () => {
  const { OPERATOR_SHIPS } = createShipQaHarness();
  assert.deepEqual(Array.from(OPERATOR_SHIPS.ambassador), ['Ambition', 'Renaissance', 'Ambience']);
});

test('Ambassador Cruise Line ship QA covers exact, close, empty and unknown values', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('ambassador', 'Ambition'), '');
  assert.equal(
    getOperatorShipQaIssue('ambassador', 'Ambiance'),
    'Possible ship name error: did you mean Ambience?'
  );
  assert.equal(getOperatorShipQaIssue('ambassador', ''), '');
  assert.equal(
    getOperatorShipQaIssue('ambassador', 'Entirely Unknown Vessel'),
    'Ship name not found in Ambassador Cruise Line ship list.'
  );
});

test('Celebrity Cruises ship catalogue contains the requested list', () => {
  const { OPERATOR_SHIPS } = createShipQaHarness();
  assert.deepEqual(Array.from(OPERATOR_SHIPS.celebrity), [
    'Celebrity Apex',
    'Celebrity Ascent',
    'Celebrity Beyond',
    'Celebrity Constellation',
    'Celebrity Eclipse',
    'Celebrity Edge',
    'Celebrity Equinox',
    'Celebrity Flora',
    'Celebrity Infinity',
    'Celebrity Millennium',
    'Celebrity Reflection',
    'Celebrity Silhouette',
    'Celebrity Solstice',
    'Celebrity Summit',
    'Celebrity Xcel'
  ]);
});

test('Celebrity Cruises ship QA covers exact, close, empty and unknown values', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('celebrity', 'Celebrity Beyond'), '');
  assert.equal(
    getOperatorShipQaIssue('celebrity', 'Celebrity Beyound'),
    'Possible ship name error: did you mean Celebrity Beyond?'
  );
  assert.equal(getOperatorShipQaIssue('celebrity', ''), '');
  assert.equal(
    getOperatorShipQaIssue('celebrity', 'Entirely Unknown Vessel'),
    'Ship name not found in Celebrity Cruises ship list.'
  );
});

test('Marella Cruises ship catalogue contains the requested list', () => {
  const { OPERATOR_SHIPS } = createShipQaHarness();
  assert.deepEqual(Array.from(OPERATOR_SHIPS.marella), [
    'Marella Explorer',
    'Marella Explorer 2',
    'Marella Discovery',
    'Marella Discovery 2',
    'Marella Voyager'
  ]);
});

test('P&O Cruises ship catalogue contains the requested list', () => {
  const { OPERATOR_SHIPS } = createShipQaHarness();
  assert.deepEqual(Array.from(OPERATOR_SHIPS.po), ['Arvia', 'Iona', 'Britannia', 'Ventura', 'Azura', 'Arcadia', 'Aurora']);
});

test('exact Marella Cruises ship name passes QA', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('marella', 'Marella Explorer'), '');
});

test('close Marella Cruises ship name warns with the closest suggestion', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(
    getOperatorShipQaIssue('marella', 'Marella Explorar'),
    'Possible ship name error: did you mean Marella Explorer?'
  );
});

test('empty Marella Cruises ship name keeps empty QA behaviour', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('marella', ''), '');
});

test('unknown Marella Cruises ship name receives a soft warning without suggestion', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(
    getOperatorShipQaIssue('marella', 'Entirely Unknown Vessel'),
    'Ship name not found in Marella Cruises ship list.'
  );
});

test('exact P&O Cruises ship name passes QA', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('po', 'Arvia'), '');
});

test('close P&O Cruises ship name warns with the closest suggestion', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(
    getOperatorShipQaIssue('po', 'Ionna'),
    'Possible ship name error: did you mean Iona?'
  );
});

test('empty P&O Cruises ship name keeps empty QA behaviour', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('po', ''), '');
});

test('unknown P&O Cruises ship name receives a soft warning without suggestion', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(
    getOperatorShipQaIssue('po', 'Entirely Unknown Vessel'),
    'Ship name not found in P&O Cruises ship list.'
  );
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

test('remaining cruise operator ship catalogues contain the requested lists', () => {
  const { OPERATOR_SHIPS } = createShipQaHarness();
  assert.deepEqual(Array.from(OPERATOR_SHIPS.fred), ['Bolette', 'Borealis', 'Balmoral']);
  assert.deepEqual(Array.from(OPERATOR_SHIPS.msc), [
    'MSC World America', 'MSC Euribia', 'MSC Seascape', 'MSC World Europa', 'MSC Seashore',
    'MSC Virtuosa', 'MSC Grandiosa', 'MSC Bellissima', 'MSC Seaview', 'MSC Seaside',
    'MSC Meraviglia', 'MSC Preziosa', 'MSC Divina', 'MSC Splendida', 'MSC Fantasia',
    'MSC Magnifica', 'MSC Poesia', 'MSC Orchestra', 'MSC Musica', 'MSC Sinfonia',
    'MSC Armonia', 'MSC Opera', 'MSC Lirica'
  ]);
  assert.deepEqual(Array.from(OPERATOR_SHIPS.cunard), ['Queen Anne', 'Queen Mary 2', 'Queen Victoria', 'Queen Elizabeth']);
  assert.deepEqual(Array.from(OPERATOR_SHIPS.ncl), [
    'Norwegian Aqua', 'Norwegian Luna', 'Norwegian Prima', 'Norwegian Viva', 'Norwegian Encore',
    'Norwegian Bliss', 'Norwegian Joy', 'Norwegian Escape', 'Norwegian Getaway', 'Norwegian Breakaway',
    'Norwegian Epic', 'Norwegian Gem', 'Norwegian Jade', 'Norwegian Jewel', 'Norwegian Pearl',
    'Norwegian Dawn', 'Norwegian Star', 'Norwegian Spirit', 'Norwegian Sky', 'Norwegian Sun',
    'Pride of America'
  ]);
  assert.deepEqual(Array.from(OPERATOR_SHIPS.princess), [
    'Caribbean Princess', 'Coral Princess', 'Crown Princess', 'Diamond Princess', 'Discovery Princess',
    'Emerald Princess', 'Enchanted Princess', 'Grand Princess', 'Island Princess', 'Majestic Princess',
    'Regal Princess', 'Royal Princess', 'Ruby Princess', 'Sapphire Princess', 'Sky Princess',
    'Star Princess', 'Sun Princess'
  ]);
  assert.deepEqual(Array.from(OPERATOR_SHIPS.virgin), ['Scarlet Lady', 'Valiant Lady', 'Resilient Lady', 'Brilliant Lady']);
});

test('remaining cruise operators validate exact, close, empty and unknown ship values', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  const scenarios = [
    ['fred', 'Fred. Olsen Cruise Lines', 'Bolette', 'Bolete'],
    ['msc', 'MSC Cruises', 'MSC Virtuosa', 'MSC Virtousa'],
    ['cunard', 'Cunard', 'Queen Mary 2', 'Queen Mary 3'],
    ['ncl', 'Norwegian Cruise Line', 'Norwegian Prima', 'Norwegian Prina'],
    ['princess', 'Princess Cruises', 'Sky Princess', 'Sky Prinzess'],
    ['virgin', 'Virgin Voyages', 'Scarlet Lady', 'Scarlett Lady']
  ];
  for (const [operator, operatorName, exact, typo] of scenarios) {
    assert.equal(getOperatorShipQaIssue(operator, exact), '');
    assert.equal(getOperatorShipQaIssue(operator, typo), `Possible ship name error: did you mean ${exact}?`);
    assert.equal(getOperatorShipQaIssue(operator, ''), '');
    assert.equal(getOperatorShipQaIssue(operator, 'Entirely Unknown Vessel'), `Ship name not found in ${operatorName} ship list.`);
  }
});

test('operators without ship catalogues retain existing ship QA behaviour', () => {
  const { getOperatorShipQaIssue } = createShipQaHarness();
  assert.equal(getOperatorShipQaIssue('tui', 'Ionna'), '');
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

test('newly catalogued operator states appear as passive QA results in the existing panel', () => {
  const exact = createQaPanelHarness('msc', 'MSC Virtuosa');
  exact.context.runSpellQA();
  assert.match(exact.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">✓ Checked<\/span>/);

  const close = createQaPanelHarness('msc', 'MSC Virtousa');
  close.context.runSpellQA();
  assert.match(close.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">⚠ Review<\/span>/);
  assert.match(close.elements['spell-warn-name'].textContent, /Possible ship name error: did you mean MSC Virtuosa\?/);
  assert.match(close.elements['copy-qa-note'].textContent, /Passive checks only — review:/);

  const empty = createQaPanelHarness('msc', '');
  empty.context.runSpellQA();
  assert.match(empty.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">— Empty \/ not checked<\/span>/);

  const unknown = createQaPanelHarness('msc', 'Entirely Unknown Vessel');
  unknown.context.runSpellQA();
  assert.match(unknown.elements['spell-warn-name'].textContent, /Ship name not found in MSC Cruises ship list\./);
  assert.match(unknown.elements['copy-qa-note'].textContent, /Passive checks only — review:/);
});

test('Ambassador Cruise Line states appear as passive QA results in the existing panel', () => {
  const exact = createQaPanelHarness('ambassador', 'Ambition');
  exact.context.runSpellQA();
  assert.match(exact.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">✓ Checked<\/span>/);

  const close = createQaPanelHarness('ambassador', 'Ambiance');
  close.context.runSpellQA();
  assert.match(close.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">⚠ Review<\/span>/);
  assert.match(close.elements['spell-warn-name'].textContent, /Possible ship name error: did you mean Ambience\?/);
  assert.match(close.elements['copy-qa-note'].textContent, /Possible ship name error: did you mean Ambience\?/);

  const empty = createQaPanelHarness('ambassador', '');
  empty.context.runSpellQA();
  assert.match(empty.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">— Empty \/ not checked<\/span>/);

  const unknown = createQaPanelHarness('ambassador', 'Entirely Unknown Vessel');
  unknown.context.runSpellQA();
  assert.match(unknown.elements['spell-warn-name'].textContent, /Ship name not found in Ambassador Cruise Line ship list\./);
  assert.match(unknown.elements['copy-qa-note'].textContent, /Passive checks only — review:/);
});

test('Celebrity Cruises states appear as passive QA results in the existing panel', () => {
  const exact = createQaPanelHarness('celebrity', 'Celebrity Beyond');
  exact.context.runSpellQA();
  assert.match(exact.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">✓ Checked<\/span>/);

  const close = createQaPanelHarness('celebrity', 'Celebrity Beyound');
  close.context.runSpellQA();
  assert.match(close.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">⚠ Review<\/span>/);
  assert.match(close.elements['spell-warn-name'].textContent, /Possible ship name error: did you mean Celebrity Beyond\?/);
  assert.match(close.elements['copy-qa-note'].textContent, /Possible ship name error: did you mean Celebrity Beyond\?/);

  const empty = createQaPanelHarness('celebrity', '');
  empty.context.runSpellQA();
  assert.match(empty.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">— Empty \/ not checked<\/span>/);

  const unknown = createQaPanelHarness('celebrity', 'Entirely Unknown Vessel');
  unknown.context.runSpellQA();
  assert.match(unknown.elements['spell-warn-name'].textContent, /Ship name not found in Celebrity Cruises ship list\./);
  assert.match(unknown.elements['copy-qa-note'].textContent, /Passive checks only — review:/);
});

test('Marella Cruises states appear as passive QA results in the existing panel', () => {
  const exact = createQaPanelHarness('marella', 'Marella Explorer');
  exact.context.runSpellQA();
  assert.match(exact.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">✓ Checked<\/span>/);

  const close = createQaPanelHarness('marella', 'Marella Explorar');
  close.context.runSpellQA();
  assert.match(close.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">⚠ Review<\/span>/);
  assert.match(close.elements['spell-warn-name'].textContent, /Possible ship name error: did you mean Marella Explorer\?/);
  assert.match(close.elements['copy-qa-note'].textContent, /Possible ship name error: did you mean Marella Explorer\?/);

  const empty = createQaPanelHarness('marella', '');
  empty.context.runSpellQA();
  assert.match(empty.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">— Empty \/ not checked<\/span>/);

  const unknown = createQaPanelHarness('marella', 'Entirely Unknown Vessel');
  unknown.context.runSpellQA();
  assert.match(unknown.elements['spell-warn-name'].textContent, /Ship name not found in Marella Cruises ship list\./);
});

test('P&O Cruises states appear as passive QA results in the existing panel', () => {
  const exact = createQaPanelHarness('po', 'Arvia');
  exact.context.runSpellQA();
  assert.match(exact.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">✓ Checked<\/span>/);

  const close = createQaPanelHarness('po', 'Ionna');
  close.context.runSpellQA();
  assert.match(close.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">⚠ Review<\/span>/);
  assert.match(close.elements['spell-warn-name'].textContent, /Possible ship name error: did you mean Iona\?/);

  const empty = createQaPanelHarness('po', '');
  empty.context.runSpellQA();
  assert.match(empty.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">— Empty \/ not checked<\/span>/);

  const unknown = createQaPanelHarness('po', 'Entirely Unknown Vessel');
  unknown.context.runSpellQA();
  assert.match(unknown.elements['spell-warn-name'].textContent, /Ship name not found in P&O Cruises ship list\./);
});

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

test('unknown Royal Caribbean value and non-catalogued operator value diverge only for operator-scoped QA', () => {
  const unknown = createQaPanelHarness('royal', 'Entirely Unknown Vessel');
  unknown.context.runSpellQA();
  assert.match(unknown.elements['spell-warn-name'].textContent, /Ship name not found in Royal Caribbean ship list\./);

  const other = createQaPanelHarness('tui', 'Entirely Unknown Vessel');
  other.context.runSpellQA();
  assert.match(other.elements['copy-qa-checklist'].innerHTML, /<strong>Ship name<\/strong><span class="state">✓ Checked<\/span>/);
  assert.equal(other.elements['spell-warn-name'].textContent, '');
});
