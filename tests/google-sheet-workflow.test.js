import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('const GOOGLE_SHEET_SOURCE_KEY =');
const end = html.indexOf('\nfunction loadFromCSVFile(event){', start);
assert.ok(start >= 0 && end > start, 'Could not locate Google Sheet workflow block');
const workflowSource = html.slice(start, end).replace('const GOOGLE_SHEET_SOURCE_KEY', 'var GOOGLE_SHEET_SOURCE_KEY');
const localFileImportStart = end + 1;
const localFileImportEnd = html.indexOf('\nconst LAST_SUCCESSFUL_CSV_KEY =', localFileImportStart);
assert.ok(localFileImportEnd > localFileImportStart, 'Could not locate local CSV file import block');
const localFileImportSource = html.slice(localFileImportStart, localFileImportEnd);

function createHarness({ savedSource = '', csv = 'operator,offer_name\nP&O,Caribbean', processSheetCSV } = {}) {
  const storage = new Map();
  if (savedSource) storage.set('cobGoogleSheetSourceV1', savedSource);
  const status = { className: '', _textContent: '', _innerHTML: '', get textContent() { return this._textContent; }, set textContent(value) { this._textContent = String(value); this._innerHTML = String(value); }, get innerHTML() { return this._innerHTML; }, set innerHTML(value) { this._innerHTML = String(value); this._textContent = String(value).replace(/<[^>]+>/g, ''); } };
  const input = { value: '' };
  const campaign = { value: 'Existing campaign' };
  const app = { focusOptions: null, focus(options) { this.focusOptions = options; context.document.activeElement = this; } };
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
      activeElement: input,
      getElementById: id => id === 'sheets-status' ? status : id === 'sheets-url' ? input : id === 'g-campaign' ? campaign : id === 'builder-app' ? app : null
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
      loadedStatus.textContent = '✓ 1 offer loaded';
    })
  };
  vm.createContext(context);
  vm.runInContext(workflowSource, context);
  return { context, storage, status, input, campaign, app, fetched, imported };
}

test('Campaign Import prioritises campaign files and keeps Google Sheets secondary', () => {
  assert.match(html, /<label for="sheets-url">Google Sheet URL<\/label>/);
  assert.match(html, /onclick="triggerCsvFilePicker\(\)"[^>]*>Load Campaign File<\/button>[\s\S]*?<label for="sheets-url">Google Sheet URL<\/label>[\s\S]*?onclick="loadFromSheets\(\)"[^>]*>Load Google Sheet<\/button>/);
  assert.doesNotMatch(html, /Refresh Offers/);
  assert.doesNotMatch(html, /onclick="refreshOffers\(\)"/);
  assert.doesNotMatch(html, /Paste CSV URL first/);
});

test('normal and published Google Sheet URLs are converted to their CSV endpoints', () => {
  const { context } = createHarness();
  assert.equal(context.extractSpreadsheetId('https://docs.google.com/spreadsheets/d/abc123/edit'), 'abc123');
  assert.equal(context.googleSheetUrlToCsvUrl('https://docs.google.com/spreadsheets/d/abc123/edit'), 'https://docs.google.com/spreadsheets/d/abc123/export?format=csv');
  assert.equal(context.googleSheetUrlToCsvUrl('https://docs.google.com/spreadsheets/d/abc123/edit?gid=42'), 'https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=42');
  assert.equal(context.googleSheetUrlToCsvUrl('https://docs.google.com/spreadsheets/d/abc123/edit#gid=7'), 'https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=7');
  assert.equal(context.extractSpreadsheetId('https://docs.google.com/spreadsheets/d/e/published123/pubhtml'), 'published123');
  assert.equal(context.googleSheetUrlToCsvUrl('https://docs.google.com/spreadsheets/d/e/published123/pubhtml'), 'https://docs.google.com/spreadsheets/d/e/published123/pub?output=csv');
  assert.equal(context.googleSheetUrlToCsvUrl('https://docs.google.com/spreadsheets/d/e/published123/pubhtml?gid=42&single=true'), 'https://docs.google.com/spreadsheets/d/e/published123/pub?output=csv&gid=42&single=true');
  assert.equal(context.googleSheetUrlToCsvUrl('https://docs.google.com/spreadsheets/d/e/published123/pub?output=csv&gid=42&single=true'), 'https://docs.google.com/spreadsheets/d/e/published123/pub?output=csv&gid=42&single=true');
  assert.equal(context.googleSheetUrlToCsvUrl('https://example.com/spreadsheets/d/abc123/edit'), '');
});

test('loading a Sheet stores the original source and routes generated CSV through the existing importer', async () => {
  const { context, storage, status, input, fetched, imported } = createHarness();
  input.value = 'https://docs.google.com/spreadsheets/d/abc123/edit?gid=42';
  assert.equal(await context.loadFromSheets(), true);
  assert.equal(storage.get('cobGoogleSheetSourceV1'), input.value);
  assert.deepEqual(fetched, ['https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=42']);
  assert.deepEqual(imported, ['operator,offer_name\nP&O,Caribbean']);
  assert.equal(status.textContent, '✓ 1 offer loaded');
});

test('successful Sheet loads move focus from the action control to the shortcut-safe app container', async () => {
  const { context, input, app } = createHarness();
  const loadButton = { tagName: 'BUTTON' };
  context.document.activeElement = loadButton;
  input.value = 'https://docs.google.com/spreadsheets/d/abc123/edit';
  assert.equal(await context.loadFromSheets(), true);
  assert.equal(context.document.activeElement, app);
  assert.equal(app.focusOptions.preventScroll, true);
  assert.match(html, /<div class="app start-hidden" id="builder-app" aria-hidden="true" tabindex="-1">/);
});

test('Load Sheet uses the existing remote CSV fallback path and forwards successful response text to processSheetCSV', async () => {
  const csv = 'operator\noffer without commas';
  const { context, input, fetched, imported } = createHarness({ csv });
  input.value = 'https://docs.google.com/spreadsheets/d/abc123/edit';
  context.fetch = async url => {
    fetched.push(url);
    if (fetched.length === 1) throw new Error('direct fetch blocked by CORS');
    return { ok: true, text: async () => csv };
  };
  assert.equal(await context.loadFromSheets(), true);
  assert.deepEqual(fetched, [
    'https://docs.google.com/spreadsheets/d/abc123/export?format=csv',
    'https://api.allorigins.win/raw?url=https%3A%2F%2Fdocs.google.com%2Fspreadsheets%2Fd%2Fabc123%2Fexport%3Fformat%3Dcsv'
  ]);
  assert.deepEqual(imported, [csv]);
});

test('published Sheet loads use the published CSV endpoint and proxy fallback after a blocked direct fetch', async () => {
  const csv = 'operator,offer_name\nP&O,Published Caribbean';
  const { context, input, fetched, imported } = createHarness({ csv });
  input.value = 'https://docs.google.com/spreadsheets/d/e/published123/pubhtml?gid=7&single=true';
  context.fetch = async url => {
    fetched.push(url);
    if (fetched.length === 1) throw new Error('direct published fetch blocked by CORS');
    return { ok: true, text: async () => csv };
  };
  assert.equal(await context.loadFromSheets(), true);
  assert.deepEqual(fetched, [
    'https://docs.google.com/spreadsheets/d/e/published123/pub?output=csv&gid=7&single=true',
    'https://api.allorigins.win/raw?url=https%3A%2F%2Fdocs.google.com%2Fspreadsheets%2Fd%2Fe%2Fpublished123%2Fpub%3Foutput%3Dcsv%26gid%3D7%26single%3Dtrue'
  ]);
  assert.deepEqual(imported, [csv]);
});

test('manual downloaded CSV file import still forwards FileReader text to processSheetCSV', () => {
  const csv = 'operator,offer_name\nP&O,Caribbean';
  const status = { className: '', _textContent: '', _innerHTML: '', get textContent() { return this._textContent; }, set textContent(value) { this._textContent = String(value); this._innerHTML = String(value); }, get innerHTML() { return this._innerHTML; }, set innerHTML(value) { this._innerHTML = String(value); this._textContent = String(value).replace(/<[^>]+>/g, ''); } };
  const imported = [];
  const file = { name: 'offers.csv' };
  const order = [];
  const app = { focus() { order.push('focus'); context.document.activeElement = this; } };
  const event = { target: { files: [file], value: 'offers.csv' }, _onSuccess: () => order.push('success') };
  const context = {
    console,
    document: { activeElement: event.target, getElementById: id => id === 'sheets-status' ? status : id === 'builder-app' ? app : null },
    resetShortcutFocusAfterImport: () => app.focus(),
    FileReader: class {
      readAsText(loadedFile) {
        assert.equal(loadedFile, file);
        this.result = csv;
        this.onload();
      }
    },
    processSheetCSV: (loadedCsv, loadedStatus) => imported.push({ csv: loadedCsv, status: loadedStatus })
  };
  vm.createContext(context);
  vm.runInContext(localFileImportSource, context);
  context.loadFromCSVFile(event);
  assert.deepEqual(imported, [{ csv, status }]);
  assert.equal(event.target.value, '');
  assert.deepEqual(order, ['success', 'focus']);
  assert.equal(context.document.activeElement, app);
});

test('saved source repopulates on startup without automatically loading offers', () => {
  const savedSource = 'https://docs.google.com/spreadsheets/d/saved123/edit';
  const { context, status, input, fetched, imported } = createHarness({ savedSource });
  assert.equal(context.restoreGoogleSheetSource(), savedSource);
  assert.equal(input.value, savedSource);
  assert.equal(status.textContent, '');
  assert.deepEqual(fetched, []);
  assert.deepEqual(imported, []);
  assert.match(html, /function initBuilderApp\(\)[\s\S]*?load\(0\);\s*restoreGoogleSheetSource\(\);/);
  assert.doesNotMatch(html, /function initBuilderApp\(\)[\s\S]*?load\(0\);\s*restoreLastSuccessfulCsv\(\);/);
});

test('Load Sheet always uses the current input URL instead of the saved source', async () => {
  const savedSource = 'https://docs.google.com/spreadsheets/d/saved123/edit?gid=9';
  const { context, status, input, fetched, storage } = createHarness({ savedSource });
  input.value = 'https://docs.google.com/spreadsheets/d/current123/edit?gid=4';
  assert.equal(await context.loadFromSheets(), true);
  assert.deepEqual(fetched, ['https://docs.google.com/spreadsheets/d/current123/export?format=csv&gid=4']);
  assert.equal(storage.get('cobGoogleSheetSourceV1'), input.value);
  assert.equal(status.textContent, '✓ 1 offer loaded');
});

test('failed normal Sheet load shows publish guidance and leaves existing campaign offers unchanged', async () => {
  const { context, status, input, campaign } = createHarness();
  input.value = 'https://docs.google.com/spreadsheets/d/saved123/edit';
  context.fetch = async () => { throw new Error('network down'); };
  const before = context.offers;
  assert.equal(await context.loadFromSheets(), false);
  assert.equal(status.textContent, 'Load failed. Try the published Google Sheet link from File > Share > Publish to web.');
  assert.equal(context.offers, before);
  assert.equal(context.offers[0].name, 'Existing offer');
  assert.equal(campaign.value, 'Existing campaign');
});

test('failed import rolls back partially changed offers and campaign data', async () => {
  const { context, status, campaign, input } = createHarness({
    processSheetCSV: (csv, loadedStatus) => {
      context.offers[0] = { name: 'Partial mutation' };
      campaign.value = 'Partial campaign mutation';
      loadedStatus.className = 'csv-error';
      loadedStatus.textContent = 'bad import';
    }
  });
  input.value = 'https://docs.google.com/spreadsheets/d/saved123/edit';
  assert.equal(await context.loadFromSheets(), false);
  assert.equal(status.textContent, 'Load failed. Try the published Google Sheet link from File > Share > Publish to web.');
  assert.equal(context.offers[0].name, 'Existing offer');
  assert.equal(campaign.value, 'Existing campaign');
});

test('Clear Saved Session removes the remembered Google Sheet source', () => {
  assert.match(html, /function confirmClearSavedSession\(\)[\s\S]*?localStorage\.removeItem\(GOOGLE_SHEET_SOURCE_KEY\);/);
});
