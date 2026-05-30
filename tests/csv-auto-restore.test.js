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

function createRestoreHarness(initialCsv = '') {
  const storage = new Map();
  if (initialCsv) storage.set('cobLastSuccessfulCsvV1', initialCsv);
  const status = {};
  const processed = [];
  const source = [
    extract(/const LAST_SUCCESSFUL_CSV_KEY = [\s\S]*?\nlet restoringLastSuccessfulCsv = false;/, 'last successful CSV state'),
    extract(/function storeLastSuccessfulCsv\(csv\)\{[\s\S]*?\n\}/, 'storeLastSuccessfulCsv'),
    extract(/function restoreLastSuccessfulCsv\(\)\{[\s\S]*?\n\}/, 'restoreLastSuccessfulCsv')
  ].join('\n').replace('const LAST_SUCCESSFUL_CSV_KEY', 'var LAST_SUCCESSFUL_CSV_KEY').replace('let restoringLastSuccessfulCsv', 'var restoringLastSuccessfulCsv');
  const context = {
    document: { getElementById: id => id === 'sheets-status' ? status : null },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    processSheetCSV: (csv, csvStatus) => processed.push({ csv, status: csvStatus })
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, processed, status, storage };
}

test('the last successfully loaded CSV is stored locally and a newer CSV replaces it', () => {
  const { context, storage } = createRestoreHarness();
  context.storeLastSuccessfulCsv('operator,offer_name\nP&O,First');
  assert.equal(storage.get('cobLastSuccessfulCsvV1'), 'operator,offer_name\nP&O,First');
  context.storeLastSuccessfulCsv('operator,offer_name\nCunard,Replacement');
  assert.equal(storage.get('cobLastSuccessfulCsvV1'), 'operator,offer_name\nCunard,Replacement');
});

test('startup restore replays a stored CSV through the existing importer without a file picker', () => {
  const csv = 'operator,offer_name\nP&O,Caribbean';
  const { context, processed, status } = createRestoreHarness(csv);
  assert.equal(context.restoreLastSuccessfulCsv(), true);
  assert.deepEqual(processed, [{ csv, status }]);
  assert.equal(context.restoringLastSuccessfulCsv, false);
});

test('fresh users keep the normal startup state when no previous CSV exists', () => {
  const { context, processed } = createRestoreHarness();
  assert.equal(context.restoreLastSuccessfulCsv(), false);
  assert.deepEqual(processed, []);
});

test('only successful imports persist CSV restore data and Clear Saved Session removes it', () => {
  assert.match(html, /if\(loaded && !restoringLastSuccessfulCsv\) storeLastSuccessfulCsv\(csv\);/);
  assert.match(html, /function confirmClearSavedSession\(\)[\s\S]*?localStorage\.removeItem\(LAST_SUCCESSFUL_CSV_KEY\);/);
  assert.match(html, /function initBuilderApp\(\)[\s\S]*?load\(0\);\s*restoreLastSuccessfulCsv\(\);/);
});

test('restoring a four-offer CSV repopulates card fields, operator logos and the existing UTM refresh path', () => {
  const csv = [
    'operator,offer_name,ship_name,price,nights,date,ports,url',
    'P&O Cruises,Caribbean Escape,Arvia,1669,14,12 November 2026,Barbados • Martinique,https://example.com/po',
    'Marella Cruises,Captivating Coasts,Marella Explorer,1439,10,4 April 2027,Tenerife • Corfu,https://example.com/marella',
    'Cunard,Northern Lights,Queen Anne,1199,7,8 February 2027,Southampton • Tromso,https://example.com/cunard',
    'Virgin Voyages,Greek Island Glow,Resilient Lady,999,8,3 June 2027,Athens • Mykonos,https://example.com/virgin'
  ].join('\n');
  const storage = new Map();
  const status = {};
  const campaign = { value: '' };
  let utmRefreshes = 0;
  const start = html.indexOf('const LAST_SUCCESSFUL_CSV_KEY =');
  const end = html.indexOf('\nfunction currentSheetTemplateTSV()', start);
  assert.ok(start >= 0 && end > start, 'Could not locate CSV persistence/import block');
  const source = html.slice(start, end)
    .replace('const LAST_SUCCESSFUL_CSV_KEY', 'var LAST_SUCCESSFUL_CSV_KEY')
    .replace('let restoringLastSuccessfulCsv', 'var restoringLastSuccessfulCsv');
  const context = {
    console,
    offers: [{}, {}, {}, {}],
    cur: 0,
    OPERATOR_CONFIG: {
      po: { aliases: [/\bp\s*&\s*o\b/i] },
      marella: { aliases: [/\bmarella\b/i] },
      cunard: { aliases: [/\bcunard\b/i] },
      virgin: { aliases: [/\bvirgin\b/i] }
    },
    document: {
      getElementById: id => id === 'sheets-status' ? status : id === 'g-campaign' ? campaign : null,
      querySelectorAll: () => []
    },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    load: () => {},
    renderSingleOffer: () => {},
    updateAllStatus: () => {},
    genAllUtms: () => { utmRefreshes += 1; },
    updateExportFilenames: () => {}
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  context.processSheetCSV(csv, status);
  assert.equal(status.textContent, '✓ Loaded 4 offer(s)');
  assert.equal(storage.get('cobLastSuccessfulCsvV1'), csv);

  context.offers = [{}, {}, {}, {}];
  assert.equal(context.restoreLastSuccessfulCsv(), true);
  assert.deepEqual(
    context.offers.map(({ operator, _logoDisplay, name, ship, price, day, month, ports, url }) => ({ operator, _logoDisplay, name, ship, price, day, month, ports, url })),
    [
      { operator: 'po', _logoDisplay: 'operator', name: 'Caribbean Escape', ship: 'Arvia', price: '1669', day: '12', month: 'November 2026', ports: 'Barbados • Martinique', url: 'https://example.com/po' },
      { operator: 'marella', _logoDisplay: 'operator', name: 'Captivating Coasts', ship: 'Marella Explorer', price: '1439', day: '4', month: 'April 2027', ports: 'Tenerife • Corfu', url: 'https://example.com/marella' },
      { operator: 'cunard', _logoDisplay: 'operator', name: 'Northern Lights', ship: 'Queen Anne', price: '1199', day: '8', month: 'February 2027', ports: 'Southampton • Tromso', url: 'https://example.com/cunard' },
      { operator: 'virgin', _logoDisplay: 'operator', name: 'Greek Island Glow', ship: 'Resilient Lady', price: '999', day: '3', month: 'June 2027', ports: 'Athens • Mykonos', url: 'https://example.com/virgin' }
    ]
  );
  assert.equal(utmRefreshes, 2, 'initial import and automatic restore should both run the existing UTM refresh');
});
