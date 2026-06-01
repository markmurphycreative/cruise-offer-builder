import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not locate ${name}`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const presetSource = [
  'const CAMPAIGN_PRESETS_KEY = "campaignPresetsV1";',
  extractFunction('getCampaignSnapshot'),
  extractFunction('readCampaignPresets'),
  extractFunction('writeCampaignPresets'),
  extractFunction('refreshPresetList'),
  extractFunction('updatePresetButtons'),
  extractFunction('saveCampaignPreset'),
  extractFunction('loadCampaignPreset'),
  extractFunction('confirmDeleteCampaignPreset')
].join('\n');

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); }
  };
}

function createSelect() {
  return {
    children: [],
    disabled: false,
    innerHTML: '',
    value: '',
    appendChild(option) { this.children.push(option); }
  };
}

function createHarness({ storage = createStorage(), offers = [{ operator: 'po', _img: 'data:image/png;base64,hero', _utm: 'utm-state' }] } = {}) {
  const elements = {
    'preset-name': { value: '' },
    'preset-status': { textContent: '' },
    'preset-select': createSelect(),
    'preset-load-btn': { disabled: false },
    'preset-delete-btn': { disabled: false },
    'g-campaign': { value: 'Summer Campaign' },
    'g-date': { value: '16 May 2026' },
    'g-airport': { value: 'Newcastle' },
    'g-terms': { value: 'T&Cs Apply' }
  };
  const context = {
    console: { warn() {} },
    localStorage: storage,
    offers,
    cur: 0,
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement() { return { value: '', textContent: '' }; }
    },
    save() {},
    load() {},
    rv() {},
    updateAllStatus() {},
    genUtm() {},
    genStandardUtms() {},
    updateExportFilenames() {},
    openConfirmActionModal() {}
  };
  vm.runInNewContext(`${presetSource}\nthis.api = { readCampaignPresets, writeCampaignPresets, refreshPresetList, saveCampaignPreset, loadCampaignPreset, confirmDeleteCampaignPreset };`, context);
  return { api: context.api, context, elements, storage };
}

test('saving a campaign preset writes the complete existing snapshot to persistent storage', () => {
  const { api, elements, storage } = createHarness();
  elements['preset-name'].value = 'May Preset';

  api.saveCampaignPreset();

  const persisted = JSON.parse(storage.getItem('campaignPresetsV1'));
  assert.deepEqual(persisted['May Preset'].campaign, {
    name: 'Summer Campaign', date: '16 May 2026', airport: 'Newcastle', terms: 'T&Cs Apply'
  });
  assert.equal(persisted['May Preset'].offers[0].operator, 'po');
  assert.equal(persisted['May Preset'].offers[0]._img, 'data:image/png;base64,hero');
  assert.equal(persisted['May Preset'].offers[0]._utm, 'utm-state');
  assert.equal(elements['preset-select'].value, 'May Preset');
});

test('startup-style dropdown hydration reads saved campaign presets from localStorage', () => {
  assert.match(html, /function initBuilderApp\(\)\{\s*\/\/[^\n]+\n\s*refreshPresetList\(\);\s*try\{/);
  const storage = createStorage({ campaignPresetsV1: JSON.stringify({ 'Persisted Preset': { offers: [] } }) });
  const { api, elements } = createHarness({ storage });

  api.refreshPresetList();

  assert.deepEqual(elements['preset-select'].children.map(option => option.textContent), ['Persisted Preset']);
  assert.equal(elements['preset-select'].value, 'Persisted Preset');
  assert.equal(elements['preset-load-btn'].disabled, false);
  assert.equal(elements['preset-delete-btn'].disabled, false);
});


test('a persisted preset can be loaded after refresh-style dropdown hydration', () => {
  const storage = createStorage({ campaignPresetsV1: JSON.stringify({
    'Reload Me': {
      offers: [{ operator: 'ncl', name: 'Loaded Offer', _img: 'hero-ref', _utm: 'loaded-utm' }],
      campaign: { name: 'Loaded Campaign', date: '20 June 2026', airport: 'Manchester', terms: 'Loaded terms' }
    }
  }) });
  const refreshedPage = createHarness({ storage, offers: [{}] });

  refreshedPage.api.refreshPresetList();
  refreshedPage.api.loadCampaignPreset();

  assert.equal(refreshedPage.context.offers[0].name, 'Loaded Offer');
  assert.equal(refreshedPage.context.offers[0]._img, 'hero-ref');
  assert.equal(refreshedPage.context.offers[0]._utm, 'loaded-utm');
  assert.equal(refreshedPage.elements['g-campaign'].value, 'Loaded Campaign');
  assert.equal(refreshedPage.elements['g-date'].value, '20 June 2026');
  assert.equal(refreshedPage.elements['g-airport'].value, 'Manchester');
  assert.equal(refreshedPage.elements['g-terms'].value, 'Loaded terms');
});

test('deleted campaign presets stay deleted after refresh-style dropdown hydration', () => {
  const storage = createStorage({ campaignPresetsV1: JSON.stringify({ 'Old Preset': { offers: [] } }) });
  const firstPage = createHarness({ storage });

  firstPage.api.confirmDeleteCampaignPreset('Old Preset', firstPage.elements['preset-status']);
  const refreshedPage = createHarness({ storage });
  refreshedPage.api.refreshPresetList();

  assert.deepEqual(JSON.parse(storage.getItem('campaignPresetsV1')), {});
  assert.deepEqual(refreshedPage.elements['preset-select'].children.map(option => option.textContent), ['No presets saved']);
  assert.equal(refreshedPage.elements['preset-select'].value, '');
});

test('corrupt or unavailable campaign preset storage fails safely without breaking the dropdown', () => {
  const corrupt = createHarness({ storage: createStorage({ campaignPresetsV1: '{broken-json' }) });
  corrupt.api.refreshPresetList();
  assert.deepEqual(corrupt.elements['preset-select'].children.map(option => option.textContent), ['No presets saved']);

  const unavailableStorage = {
    getItem() { throw new Error('storage disabled'); },
    setItem() { throw new Error('storage disabled'); }
  };
  const unavailable = createHarness({ storage: unavailableStorage });
  unavailable.elements['preset-name'].value = 'Unavailable Preset';
  unavailable.api.refreshPresetList();
  unavailable.api.saveCampaignPreset();
  assert.equal(unavailable.elements['preset-status'].textContent, '⚠ Preset could not be saved in this browser');
});

test('preset save, overwrite, and delete leave autosave session storage untouched', () => {
  const autosave = JSON.stringify({ campaign: { name: 'Recovered Session' }, offers: [{ name: 'Existing' }] });
  const storage = createStorage({ cobSessionAutosaveV1: autosave });
  const { api, elements } = createHarness({ storage });
  elements['preset-name'].value = 'Reusable Preset';

  api.saveCampaignPreset();
  elements['g-campaign'].value = 'Updated Campaign';
  api.saveCampaignPreset(true);
  api.confirmDeleteCampaignPreset('Reusable Preset', elements['preset-status']);

  assert.equal(storage.getItem('cobSessionAutosaveV1'), autosave);
  assert.deepEqual(JSON.parse(storage.getItem('campaignPresetsV1')), {});
});
