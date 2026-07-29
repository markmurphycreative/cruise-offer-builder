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

function extractConstant(name) {
  const match = html.match(new RegExp(`const ${name}=.*?;`));
  assert.ok(match, `Could not find ${name}`);
  return match[0];
}

function createInclusionContext() {
  const context = {};
  vm.createContext(context);
  vm.runInContext([
    extractConstant('CARD_INCLUSION_SEPARATOR'),
    extractConstant('CARD_INCLUSION_SAFE_WIDTH'),
    extractConstant('CARD_INCLUSION_FONT'),
    html.slice(html.indexOf('const CARD_INCLUSION_CABIN_PHRASES='), html.indexOf('function normaliseCardInclusionComponent')),
    extractFunction('escapeRegExp'),
    extractFunction('normaliseCardInclusionComponent'),
    extractFunction('classifyCardInclusionComponent'),
    extractFunction('makeCardInclusionComponent'),
    extractFunction('splitCardInclusionLineComponents'),
    extractFunction('normaliseFlightInclusionDisplay'),
    extractFunction('normaliseCruiseInclusionComponents'),
    extractFunction('stripCardInclusionRenderMarkup'),
    extractFunction('escapeCardInclusionHtml'),
    extractFunction('buildCardInclusionComponents'),
    extractFunction('orderCardInclusionComponents'),
    extractFunction('validateCardInclusionLines'),
    extractFunction('estimateCardInclusionTextWidth'),
    extractFunction('getCardInclusionMeasureText'),
    extractFunction('packCardInclusionComponents'),
    extractFunction('groupCardInclusionRenderLines'),
    extractFunction('renderCardInclusionLayout'),
    extractFunction('renderCardInclusion')
  ].join('\n'), context);
  return context;
}

test('Cruise renderer keeps every Included benefit phrase unbroken without changing stored copy', () => {
  const { renderCardInclusion } = createInclusionContext();
  const cases = [
    ['Luggage & Transfers Included', 'Luggage & Transfers Included'],
    ['Luggage Included', 'Luggage Included'],
    ['Transfers Included', 'Transfers Included'],
    ['Flights Included', 'Flights Included']
  ];

  for (const [source, escaped] of cases) {
    const rendered = renderCardInclusion(source);
    assert.match(rendered, new RegExp(`<span class="no-break included-phrase">${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`));
    assert.equal(source, cases.find(item => item[0] === source)[0]);
  }

  const combined = renderCardInclusion('Manchester Flights · Luggage Included');
  assert.match(combined, /Manchester Flights - <span class="no-break included-phrase">Luggage Included<\/span>/);
  assert.match(html, /\.cc \.cabin-phrase,\.cc \.no-break\{white-space:nowrap;\}/);
});

test('generated benefit separators exist only between components packed on the same line', () => {
  const { renderCardInclusionLayout } = createInclusionContext();
  const wide = { html: true, safeWidth: 2000, measureText: value => value.length * 10 };
  const narrow = { html: true, safeWidth: 300, measureText: value => value.length * 10 };

  const together = renderCardInclusionLayout('Manchester Flights · Luggage Included', wide);
  assert.match(together, /Manchester Flights - <span class="no-break included-phrase">Luggage Included<\/span>/);

  const wrapped = renderCardInclusionLayout('Newcastle Flights - Luggage & Transfers Included', narrow);
  assert.match(wrapped, /Newcastle Flights<\/span><\/span><span class="incl-line">/);
  assert.doesNotMatch(wrapped.replace(/<[^>]+>/g, '\n'), /(?:^|\n)\s*[-•·]\s*|\s*[-•·]\s*(?:\n|$)/);
  assert.match(wrapped, /<span class="no-break included-phrase">Luggage &(?:amp;)? Transfers Included<\/span>/);

  const absent = renderCardInclusionLayout('Newcastle Flights - ', wide);
  assert.doesNotMatch(absent.replace(/<[^>]+>/g, ''), /[-•·]\s*$/);
  for (const phrase of ['pre-cruise', '10-night cruise']) {
    assert.match(renderCardInclusionLayout(phrase, wide), new RegExp(phrase));
  }
});

test('multiline itinerary splitting treats wrapped and blank-line input as one continuous route', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractFunction('splitContinuousItineraryDestinations'), context);
  const expected = [
    'Miami, Florida',
    'Philipsburg, St Maarten',
    'Tortola, British Virgin Islands',
    'St. Croix, US Virgin Islands',
    'San Juan, Puerto Rico',
    'Puerto Plata, Dominican Republic',
    'The Beach Club At Bimini, Bahamas',
    'Miami, Florida'
  ];
  const multiline = `Miami, Florida - Philipsburg, St Maarten - Tortola, British Virgin Islands -\n\nSt. Croix, US Virgin Islands - San Juan, Puerto Rico -\nPuerto Plata, Dominican Republic - The Beach Club At Bimini, Bahamas -\nMiami, Florida`;
  const singleLine = expected.join(' - ');

  assert.deepEqual(Array.from(context.splitContinuousItineraryDestinations(multiline)), expected);
  assert.deepEqual(Array.from(context.splitContinuousItineraryDestinations(singleLine)), expected);
  assert.deepEqual(Array.from(context.splitContinuousItineraryDestinations('Saint-Pierre - St. Croix - At Sea - Miami')), ['Saint-Pierre', 'St. Croix', 'At Sea', 'Miami']);
});
