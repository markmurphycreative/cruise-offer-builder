import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('const GOOGLE_SHEET_SOURCE_KEY =');
const end = html.indexOf('\nfunction loadFromCSVFile(event){', start);
assert.ok(start >= 0 && end > start, 'Could not locate Google Sheet workflow block');
const workflowSource = html.slice(start, end).replace('const GOOGLE_SHEET_SOURCE_KEY', 'var GOOGLE_SHEET_SOURCE_KEY');

function createHarness({ savedSource = '', csv = 'operator,offer_name\nP&O,Caribbean', processSheetCSV } = {}) {
  const storage = new Map();
  if (savedSource) storage.set('cobGoogleSheetSourceV1', savedSource);
  const status = { className: '', textContent: '' };
  const input = { value: '' };
  const campaign = { value: 'Existing campaign' };
  const fetched = [];
  const imported = [];
  const context = {
    URL,
    console,
    encodeURIComponent,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    document: {
      getElementById: id => id === 'sheets-status' ? status : id === 'sheets-url' ? input : id === 'g-campaign' ? campaign : null
    },
    fetch: async url => {
      fetched.push(url);
      return { ok: true, text: async () => csv };
    },
    offers: [{ name: 'Existing offer' }, {}, {}, {}],
    cur: 0,
    processSheetCSV: processSheetCSV || ((loadedCsv, loadedStatus) => {
      imported.push(loadedCsv);
      context.offers[0] = { name: 'Loaded offer' };
      loadedStatus.className = 'csv-success';
      loadedStatus.textContent = '✓ Loaded 1 offer(s)';
    })
  };
  vm.createContext(context);
  vm.runInContext(workflowSource, context);
  return { context, storage, status, input, campaign, fetched, imported };
}

test('Google Sheet input and actions replace the CSV URL workflow', () => {
  assert.match(html, /<label for="sheets-url">Google Sheet URL<\/label>/);
  assert.match(html, /onclick="loadFromSheets\(\)">Load Sheet<\/button>/);
  assert.match(html, /onclick="refreshOffers\(\)">Refresh Offers<\/button>/);
  assert.doesNotMatch(html, /Paste CSV URL first/);
});

test('spreadsheet IDs are extracted and converted to published CSV export URLs', () => {
  const { context } = createHarness();
  assert.equal(context.extractSpreadsheetId('https://docs.google.com/spreadsheets/d/abc123/edit'), 'abc123');
  assert.equal(context.googleSheetUrlToCsvUrl('https://docs.google.com/spreadsheets/d/abc123/edit'), 'https://docs.google.com/spreadsheets/d/abc123/export?format=csv');
  assert.equal(context.googleSheetUrlToCsvUrl('https://docs.google.com/spreadsheets/d/abc123/edit?gid=42'), 'https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=42');
  assert.equal(context.googleSheetUrlToCsvUrl('https://docs.google.com/spreadsheets/d/abc123/edit#gid=7'), 'https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=7');
  assert.equal(context.googleSheetUrlToCsvUrl('https://example.com/spreadsheets/d/abc123/edit'), '');
});

test('loading a Sheet stores the original source and routes generated CSV through the existing importer', async () => {
  const { context, storage, status, input, fetched, imported } = createHarness();
  input.value = 'https://docs.google.com/spreadsheets/d/abc123/edit?gid=42';
  assert.equal(await context.loadFromSheets(), true);
  assert.equal(storage.get('cobGoogleSheetSourceV1'), input.value);
  assert.deepEqual(fetched, ['https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=42']);
  assert.deepEqual(imported, ['operator,offer_name\nP&O,Caribbean']);
  assert.equal(status.textContent, 'Offers loaded');
});

test('saved source repopulates on startup without automatically loading offers', () => {
  const savedSource = 'https://docs.google.com/spreadsheets/d/saved123/edit';
  const { context, status, input, fetched, imported } = createHarness({ savedSource });
  assert.equal(context.restoreGoogleSheetSource(), savedSource);
  assert.equal(input.value, savedSource);
  assert.equal(status.textContent, 'Connected to Google Sheet');
  assert.deepEqual(fetched, []);
  assert.deepEqual(imported, []);
  assert.match(html, /function initBuilderApp\(\)[\s\S]*?load\(0\);\s*restoreGoogleSheetSource\(\);/);
  assert.doesNotMatch(html, /function initBuilderApp\(\)[\s\S]*?load\(0\);\s*restoreLastSuccessfulCsv\(\);/);
});

test('Refresh Offers uses the saved source instead of unsaved input changes', async () => {
  const savedSource = 'https://docs.google.com/spreadsheets/d/saved123/edit?gid=9';
  const { context, status, input, fetched } = createHarness({ savedSource });
  input.value = 'https://docs.google.com/spreadsheets/d/unsaved/edit';
  assert.equal(await context.refreshOffers(), true);
  assert.deepEqual(fetched, ['https://docs.google.com/spreadsheets/d/saved123/export?format=csv&gid=9']);
  assert.equal(status.textContent, 'Refresh complete');
});

test('Refresh without a saved source is non-blocking and leaves offers unchanged', async () => {
  const { context, status, fetched } = createHarness();
  const before = context.offers;
  assert.equal(await context.refreshOffers(), false);
  assert.equal(status.textContent, 'No saved source');
  assert.equal(context.offers, before);
  assert.deepEqual(fetched, []);
});

test('failed fetch leaves existing campaign offers unchanged', async () => {
  const { context, status } = createHarness({ savedSource: 'https://docs.google.com/spreadsheets/d/saved123/edit' });
  context.fetch = async () => { throw new Error('network down'); };
  const before = context.offers;
  assert.equal(await context.refreshOffers(), false);
  assert.equal(status.textContent, 'Failed to load');
  assert.equal(context.offers, before);
  assert.equal(context.offers[0].name, 'Existing offer');
});

test('failed import rolls back partially changed offers and campaign data', async () => {
  const { context, status, campaign } = createHarness({
    savedSource: 'https://docs.google.com/spreadsheets/d/saved123/edit',
    processSheetCSV: (csv, loadedStatus) => {
      context.offers[0] = { name: 'Partial mutation' };
      campaign.value = 'Partial campaign mutation';
      loadedStatus.className = 'csv-error';
      loadedStatus.textContent = 'bad import';
    }
  });
  assert.equal(await context.refreshOffers(), false);
  assert.equal(status.textContent, 'Failed to load');
  assert.equal(context.offers[0].name, 'Existing offer');
  assert.equal(campaign.value, 'Existing campaign');
});

test('Clear Saved Session removes the remembered Google Sheet source', () => {
  assert.match(html, /function confirmClearSavedSession\(\)[\s\S]*?localStorage\.removeItem\(GOOGLE_SHEET_SOURCE_KEY\);/);
});
