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

const namingSource = html.slice(
  html.indexOf('const DEFAULT_CAMPAIGN_OWNER = "Mark";'),
  html.indexOf('const AUTOSAVE_KEY = "cobSessionAutosaveV1";')
);

function createHarness() {
  const elements = {
    'g-campaign': { value: '', dataset: {}, addEventListener(type, fn) { this.listener = { type, fn }; } },
    'g-date': { value: '', dataset: {}, addEventListener(type, fn) { this.listener = { type, fn }; } },
    'g-description': { value: '' },
    'g-owner': { value: '' },
    'g-auto-campaign': { checked: true }
  };
  const context = {
    console,
    document: { getElementById: id => elements[id] || null },
    genAllUtms() {},
    updateAllStatus() {}
  };
  vm.createContext(context);
  vm.runInContext(`
    ${namingSource}
  `, context);
  return { context, elements };
}

test('new campaign defaults to today, British ordinal naming, weekday, description and owner', () => {
  const { context, elements } = createHarness();
  context.initialiseCampaignNamingDefaults(new Date('2026-06-03T12:00:00'));
  assert.equal(elements['g-date'].value, '3rd June 2026');
  assert.equal(elements['g-description'].value, 'Cruise Worldwide Mixed');
  assert.equal(elements['g-owner'].value, 'Mark');
  assert.equal(elements['g-campaign'].value, '3rd June 2026 - Wednesday - Cruise Worldwide Mixed (Mark)');
  assert.equal(elements['g-auto-campaign'].checked, true);
});

test('ordinal generation handles British suffix edge cases', () => {
  const { context } = createHarness();
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(context.ordinalDay), [
    '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'
  ]);
});

test('automatic campaign name tracks send date, description and owner changes', () => {
  const { context, elements } = createHarness();
  context.initialiseCampaignNamingDefaults(new Date('2026-06-03T12:00:00'));
  elements['g-date'].value = '30th May 2026';
  context.handleCampaignNamingFieldInput();
  assert.equal(elements['g-campaign'].value, '30th May 2026 - Saturday - Cruise Worldwide Mixed (Mark)');
  elements['g-description'].value = 'Celebrity Cruises - Cruise Worldwide';
  context.handleCampaignNamingFieldInput();
  elements['g-owner'].value = 'Alex';
  context.handleCampaignNamingFieldInput();
  assert.equal(elements['g-campaign'].value, '30th May 2026 - Saturday - Celebrity Cruises - Cruise Worldwide (Alex)');
});

test('send date input listener derives the weekday immediately while auto naming is enabled', () => {
  const { context, elements } = createHarness();
  context.initialiseCampaignNamingDefaults(new Date('2026-06-03T12:00:00'));

  elements['g-date'].value = '9th June 2026';
  elements['g-date'].listener.fn();
  assert.equal(elements['g-campaign'].value, '9th June 2026 - Tuesday - Cruise Worldwide Mixed (Mark)');

  elements['g-date'].value = '12th June 2026';
  elements['g-date'].listener.fn();
  assert.equal(elements['g-campaign'].value, '12th June 2026 - Friday - Cruise Worldwide Mixed (Mark)');
});

test('send date changes do not overwrite manual campaign names when auto naming is disabled', () => {
  const { context, elements } = createHarness();
  context.initialiseCampaignNamingDefaults(new Date('2026-06-03T12:00:00'));
  elements['g-campaign'].value = 'Do not overwrite me';
  context.handleCampaignNameInput();

  elements['g-date'].value = '12th June 2026';
  elements['g-date'].listener.fn();

  assert.equal(elements['g-campaign'].value, 'Do not overwrite me');
  assert.equal(elements['g-auto-campaign'].checked, false);
});

test('manual campaign name disables overwrites until regenerate is requested', () => {
  const { context, elements } = createHarness();
  context.initialiseCampaignNamingDefaults(new Date('2026-06-03T12:00:00'));
  elements['g-campaign'].value = 'My custom campaign';
  context.handleCampaignNameInput();
  elements['g-owner'].value = 'Alex';
  context.handleCampaignNamingFieldInput();
  assert.equal(elements['g-campaign'].value, 'My custom campaign');
  assert.equal(elements['g-auto-campaign'].checked, false);
  context.regenerateCampaignName();
  assert.equal(elements['g-campaign'].value, '3rd June 2026 - Wednesday - Cruise Worldwide Mixed (Alex)');
  assert.equal(elements['g-auto-campaign'].checked, true);
});

test('CSV filename parsing strips supported extensions, cleans underscores and extracts campaign metadata', () => {
  const { context, elements } = createHarness();
  const parsed = context.parseCampaignNameFromFilename('22nd_May_2026_-_Friday_-_Cruise_Worldwide_-_Wendy_Wu_Japan_Educational_(Mark).csv');
  assert.equal(parsed.name, '22nd May 2026 - Friday - Cruise Worldwide - Wendy Wu Japan Educational (Mark)');
  assert.equal(parsed.sendDate, '22nd May 2026');
  assert.equal(parsed.description, 'Cruise Worldwide - Wendy Wu Japan Educational');
  assert.equal(parsed.owner, 'Mark');
  for (const extension of ['csv', 'tsv', 'txt', 'json']) {
    assert.equal(context.cleanCampaignSourceName(`Campaign_Name.${extension}`), 'Campaign Name');
  }
  assert.equal(context.applyCsvFilenameCampaignMetadata('30th May 2026 - Saturday - Cruise Worldwide Mixed (Mark).csv'), true);
  assert.equal(elements['g-campaign'].value, '30th May 2026 - Saturday - Cruise Worldwide Mixed (Mark)');
  assert.equal(elements['g-date'].value, '30th May 2026');
  assert.equal(elements['g-owner'].value, 'Mark');
});

test('manual names outrank CSV filenames and sheet names while sheets use reliable names or generated fallback', () => {
  const { context, elements } = createHarness();
  context.initialiseCampaignNamingDefaults(new Date('2026-06-03T12:00:00'));
  assert.equal(context.applySheetSourceCampaignName('Reliable Sheet Source'), true);
  assert.equal(elements['g-campaign'].value, 'Reliable Sheet Source');
  elements['g-campaign'].value = 'Manual override';
  context.handleCampaignNameInput();
  assert.equal(context.applyCsvFilenameCampaignMetadata('30th May 2026 - Saturday - Cruise Worldwide Mixed (Mark).csv'), false);
  assert.equal(elements['g-campaign'].value, 'Manual override');

  const fallback = createHarness();
  fallback.context.initialiseCampaignNamingDefaults(new Date('2026-06-03T12:00:00'));
  assert.equal(fallback.context.applySheetSourceCampaignName(''), false);
  assert.equal(fallback.elements['g-campaign'].value, '3rd June 2026 - Wednesday - Cruise Worldwide Mixed (Mark)');
});

test('saved campaign restoration preserves exact name, metadata and auto state without regeneration', () => {
  const { context, elements } = createHarness();
  context.initialiseCampaignNamingDefaults(new Date('2026-06-03T12:00:00'));
  elements['g-campaign'].value = 'Saved exact custom name';
  context.restoreCampaignNamingSnapshot({ owner: 'Wendy', description: 'Japan Educational', autoCampaignName: true });
  assert.equal(elements['g-campaign'].value, 'Saved exact custom name');
  assert.equal(elements['g-owner'].value, 'Wendy');
  assert.equal(elements['g-description'].value, 'Japan Educational');
  assert.equal(elements['g-auto-campaign'].checked, true);
  assert.equal(context.applyCsvFilenameCampaignMetadata('30th May 2026 - Saturday - Cruise Worldwide Mixed (Mark).csv'), false);
  assert.equal(elements['g-campaign'].value, 'Saved exact custom name');
});
