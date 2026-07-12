import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} to exist`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function extractConst(name) {
  const start = html.indexOf(`const ${name}=`);
  assert.notEqual(start, -1, `Expected ${name} to exist`);
  const end = html.indexOf(';', start);
  assert.notEqual(end, -1, `Expected ${name} declaration to end`);
  return html.slice(start, end + 1);
}

function createContext() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('normaliseRoyalCaribbeanShipName'),
    extractConst('TITLE_CONNECTOR_WORDS'),
    extractFunction('normaliseTitleConnectors'),
    extractFunction('normaliseKnownDisplayText'),
    extractConst('RENDERED_PORT_COUNTRY_CLEANUP'),
    extractFunction('normaliseRenderedPortCleanupKey'),
    extractFunction('removeRenderedPortTrailingCountry'),
    extractFunction('formatRenderedItineraryPort')
  ].join('\n'), context);
  return context;
}

test('cruise title preposition normalisation keeps connector words lowercase except first word', () => {
  const context = createContext();

  assert.equal(context.normaliseTitleConnectors('Sunlit Shores Of Spain'), 'Sunlit Shores of Spain');
  assert.equal(context.normaliseTitleConnectors('Legend Of The Seas'), 'Legend of the Seas');
  assert.equal(context.normaliseTitleConnectors('Icons Of Japan & China'), 'Icons of Japan & China');
  assert.equal(context.normaliseTitleConnectors('THE Wonders Of Norway'), 'THE Wonders of Norway');
  assert.equal(context.normaliseKnownDisplayText('Jewels Of Japan'), 'Jewels of Japan');
});

test('rendered itinerary ports remove redundant trailing country names only for approved city-country pairs', () => {
  const context = createContext();

  assert.equal(context.formatRenderedItineraryPort('Casablanca, Morocco'), 'Casablanca');
  assert.equal(context.formatRenderedItineraryPort('Lisbon, Portugal'), 'Lisbon');
  assert.equal(context.formatRenderedItineraryPort('Barcelona, Spain'), 'Barcelona');
  assert.equal(context.formatRenderedItineraryPort('Naples, Italy'), 'Naples');

  assert.equal(context.formatRenderedItineraryPort('La Coruña, Galicia'), 'La Coruña, Galicia');
  assert.equal(context.formatRenderedItineraryPort('Porto Grande, Cape Verde'), 'Porto Grande, Cape Verde');
  assert.equal(context.formatRenderedItineraryPort("St John's, Antigua"), "St John's, Antigua");
  assert.equal(context.formatRenderedItineraryPort('St Peter Port, Guernsey'), 'St Peter Port, Guernsey');
  assert.equal(context.formatRenderedItineraryPort('Port Louis, Mauritius'), 'Port Louis, Mauritius');
});
