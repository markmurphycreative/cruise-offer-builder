import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not find ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function createClassList() {
  const classes = new Set();
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
    contains(name) { return classes.has(name); }
  };
}

function createHarness(offers) {
  const listeners = {};
  const elements = {
    'preview-scaler': { classList: createClassList(), style: {} },
    'card-output': { classList: createClassList(), innerHTML: '' },
    'preview-title': { textContent: 'ALL 4 CARDS' },
    'sheets-file': { clickCount: 0, click() { this.clickCount += 1; } },
    'preview-wrap': {
      classList: createClassList(),
      dataset: {},
      addEventListener(type, handler) { listeners[type] = handler; },
      contains(node) { return node === this; }
    }
  };
  const context = {
    offers,
    updatePreviewTitle: () => { elements['preview-title'].textContent = 'ALL 4 CARDS'; },
    setSheetsStatus: (message, className) => { elements.status = { message, className }; },
    dismissSplashAndShowBuilder: () => { elements.dismissedSplash = true; },
    loadFromCSVFile: event => { elements.loadedFile = event.target.files[0]; if (event._onSuccess) event._onSuccess(); },
    document: {
      getElementById: id => elements[id] || null,
      querySelector: selector => selector === '.preview-wrap' ? elements['preview-wrap'] : null
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('isOfferLoaded'),
    extractFunction('triggerCsvFilePicker'),
    extractFunction('isCsvUploadFile'),
    extractFunction('loadDroppedCSVFile'),
    extractFunction('isCampaignJsonUploadFile'),
    extractFunction('loadDroppedCampaignFile'),
    extractFunction('loadDroppedWorkspaceFile'),
    extractFunction('initEmptyWorkspaceUploadZone'),
    extractFunction('renderEmptyPreviewIfNeeded')
  ].join('\n'), context);
  return { context, elements, listeners };
}

test('fresh previews use the whole blank workspace as a subtle upload zone before rendering cards', () => {
  assert.match(html, /\.preview-scaler\.empty-preview\{[^}]*display:flex;[^}]*align-items:center;[^}]*justify-content:center;/);
  assert.match(html, /\.preview-wrap\.empty-upload-zone\{cursor:pointer;\}/);
  assert.match(html, /\.preview-wrap\.empty-upload-zone:hover,\.preview-wrap\.empty-upload-zone\.drag-over\{[^}]*background:#d4d0c7;[^}]*box-shadow:inset 0 0 0 2px rgba\(160,146,103,\.48\)/);
  assert.match(html, /\.preview-empty-state\{[^}]*width:min\(475px,calc\(100% - 30px\)\);[^}]*text-align:center;[^}]*background:none;[^}]*border:none;[^}]*border-radius:0;[^}]*box-shadow:none;[^}]*font-family:'Montserrat',sans-serif;[^}]*color:var\(--navy\);[^}]*cursor:pointer;[^}]*transition:opacity \.18s ease,transform \.18s ease;/);
  assert.match(html, /\.preview-empty-state::before\{[^}]*content:'⇧';[^}]*border:1px dashed rgba\(21,39,63,\.42\);/);
  assert.match(html, /\.preview-empty-state h2\{[^}]*padding:0;[^}]*background:none;[^}]*color:var\(--navy\);[^}]*font-family:'Montserrat',sans-serif;[^}]*font-size:16\.5px;[^}]*font-weight:400;/);
  assert.match(html, /\.preview-empty-state p\{[^}]*margin:14px 0 0;[^}]*padding:0;[^}]*background:none;[^}]*color:var\(--navy\);[^}]*font-family:'Montserrat',sans-serif;[^}]*font-size:9px;[^}]*font-weight:300;[^}]*line-height:1\.5;[^}]*opacity:\.72;/);
  assert.match(html, /\.preview-empty-state p \+ p\{margin-top:7px;\}/);
  assert.doesNotMatch(html, /\.preview-empty-state(?: h2| p)?\{[^}]*background:var\(--(?:navy|gold)\)/);
  assert.doesNotMatch(html, /preview-empty-rule/);
  assert.match(html, /<h2>Ready To Build<\/h2><p>Load a Google Sheet or CSV to generate your cruise cards instantly\.<\/p><p>Click anywhere or drag a CSV or campaign file into this workspace\.<\/p>/);

  const renderPreviewMode = extractFunction('renderPreviewMode');
  assert.ok(renderPreviewMode.indexOf('if(renderEmptyPreviewIfNeeded()) return;') < renderPreviewMode.indexOf("if(viewMode === 'email')"));
  assert.ok(renderPreviewMode.indexOf('if(renderEmptyPreviewIfNeeded()) return;') < renderPreviewMode.indexOf("if(viewMode === 'all')"));
  assert.match(extractFunction('renderVisibleCard'), /if\(renderEmptyPreviewIfNeeded\(\)\) return;/);

  const { context, elements } = createHarness([{}, {}, {}, {}]);
  assert.equal(context.renderEmptyPreviewIfNeeded(), true);
  assert.equal(elements['preview-title'].textContent, 'ALL 4 CARDS');
  assert.equal(elements['preview-scaler'].classList.contains('empty-preview'), true);
  assert.equal(elements['card-output'].classList.contains('empty-preview-output'), true);
  assert.equal(elements['preview-wrap'].classList.contains('empty-upload-zone'), true);
  assert.match(elements['card-output'].innerHTML, /Ready To Build/);
  assert.match(elements['card-output'].innerHTML, /Click anywhere or drag a CSV or campaign file into this workspace\./);
  context.triggerCsvFilePicker();
  assert.equal(elements['sheets-file'].clickCount, 1);
});

test('loaded and session-restored offers bypass the empty upload zone and keep normal preview rendering available', () => {
  const { context, elements } = createHarness([{ name: 'Caribbean Escape' }, {}, {}, {}]);
  elements['card-output'].innerHTML = '<div class="existing-card">Previously rendered card</div>';
  elements['preview-wrap'].classList.add('drag-over');

  assert.equal(context.renderEmptyPreviewIfNeeded(), false);
  assert.equal(elements['preview-title'].textContent, 'ALL 4 CARDS');
  assert.equal(elements['preview-scaler'].classList.contains('empty-preview'), false);
  assert.equal(elements['card-output'].classList.contains('empty-preview-output'), false);
  assert.equal(elements['preview-wrap'].classList.contains('empty-upload-zone'), false);
  assert.equal(elements['preview-wrap'].classList.contains('drag-over'), false);
  assert.equal(elements['card-output'].innerHTML, '<div class="existing-card">Previously rendered card</div>');

  assert.match(extractFunction('renderEmptyPreviewIfNeeded'), /const showEmptyState = !offers\.some\(isOfferLoaded\);/);
  assert.match(extractFunction('refreshAfterRestore'), /renderPreviewMode\(true\);/);
  assert.match(extractFunction('renderPreviewMode'), /c\.innerHTML = bc\(d \|\| \{\}\);/);
  assert.match(extractFunction('renderVisibleCard'), /out\.innerHTML = renderOfferWithOptionalCtaHTML\(visibleFieldsToData\(\), getCtaSettingsFromUI\(\)\);/);
});


test('CSV import button and zero-offer workspace share the existing hidden file input click path', () => {
  assert.equal((html.match(/id="sheets-file"/g) || []).length, 1);
  assert.match(html, /<button class="abtn" onclick="triggerCsvFilePicker\(\)"[^>]*>Load Downloaded CSV File<\/button>/);
  assert.match(extractFunction('triggerCsvFilePicker'), /const input=document\.getElementById\("sheets-file"\);[\s\S]*if\(input\) input\.click\(\);/);
  assert.match(extractFunction('renderEmptyPreviewIfNeeded'), /const showEmptyState = !offers\.some\(isOfferLoaded\);[\s\S]*wrap\.classList\.toggle\('empty-upload-zone', showEmptyState\);/);
  assert.match(extractFunction('initEmptyWorkspaceUploadZone'), /wrap\.addEventListener\('click',[\s\S]*triggerCsvFilePicker\(\);/);
});

test('empty workspace click stays empty-only while CSV and JSON drag/drop use workspace routing', () => {
  const csvFile = { name: 'offers.csv', type: 'text/csv' };
  const blank = createHarness([{}, {}, {}, {}]);

  blank.context.renderEmptyPreviewIfNeeded();
  blank.context.initEmptyWorkspaceUploadZone();
  blank.listeners.click({ preventDefault() { blank.elements.clickPrevented = true; } });
  assert.equal(blank.elements.clickPrevented, true);
  assert.equal(blank.elements['sheets-file'].clickCount, 1);

  blank.listeners.dragover({ preventDefault() { blank.elements.dragPrevented = true; }, dataTransfer: {} });
  assert.equal(blank.elements.dragPrevented, true);
  assert.equal(blank.elements['preview-wrap'].classList.contains('drag-over'), true);

  blank.listeners.drop({
    preventDefault() { blank.elements.dropPrevented = true; },
    dataTransfer: { files: [csvFile] }
  });
  assert.equal(blank.elements.dropPrevented, true);
  assert.equal(blank.elements.loadedFile, csvFile);
  assert.equal(blank.elements.dismissedSplash, true);

  const loaded = createHarness([{ name: 'Loaded offer' }, {}, {}, {}]);
  loaded.context.renderEmptyPreviewIfNeeded();
  loaded.context.initEmptyWorkspaceUploadZone();
  loaded.listeners.click({ preventDefault() { loaded.elements.clickPrevented = true; } });
  loaded.listeners.drop({ preventDefault() { loaded.elements.dropPrevented = true; }, dataTransfer: { files: [csvFile] } });
  assert.equal(loaded.elements.clickPrevented, undefined);
  assert.equal(loaded.elements.dropPrevented, true);
  assert.equal(loaded.elements.loadedFile, csvFile);
});
