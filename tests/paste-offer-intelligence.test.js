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

function createHarness() {
  const classes = new Set();
  const panel = {
    innerHTML: '',
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    }
  };
  const context = {
    document: { getElementById(id) { return id === 'offer-intel-panel' ? panel : null; } },
    console: { warn() {} },
    AIRPORT_WORDS: ['newcastle', 'manchester'],
    OPERATOR_SHIPS: { po: ['Arvia'], cunard: ['Queen Anne'], fred: ['Bolette'] },
    OPERATOR_HEADERS: { po: { name: 'P&O Cruises' }, cunard: { name: 'Cunard' }, fred: { name: 'Fred. Olsen Cruise Lines' } },
    OPERATOR_INTELLIGENCE: { po: { category: 'Mainstream ocean cruise', dawsonUrl: 'https://example.test/po' }, cunard: { category: 'Heritage ocean cruise', dawsonUrl: 'https://example.test/cunard' } },
    getOperatorLandingUrl(key) { return key === 'po' ? 'https://example.test/po' : ''; }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeRegExp'),
    extractFunction('getOfferIntelligenceShipOperator'),
    extractFunction('getOfferIntelligenceCruiseTypes'),
    extractFunction('detectOfferIntelligenceInclusions'),
    extractFunction('clearOfferIntelligencePanel'),
    extractFunction('renderOfferIntelligencePanel')
  ].join('\n'), context);
  return { context, panel };
}

test('Offer Intelligence infers known ship operators without changing parsed data', () => {
  const { context, panel } = createHarness();
  const parsed = { ship: 'Arvia', name: 'Caribbean Escape', nights: '14', boardlbl: 'Full Board', price: '1669' };
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed, raw: 'Arvia\nFlights, luggage and transfers included from Newcastle\nInside Cabin' }));

  assert.equal(parsed.operatorKey, undefined);
  assert.equal(panel.classList.contains('active'), true);
  assert.match(panel.innerHTML, /Operator inferred from ship: P&amp;O Cruises|Operator inferred from ship: P&O Cruises/);
  assert.match(panel.innerHTML, /Flights Included/);
  assert.match(panel.innerHTML, /Luggage Included/);
  assert.match(panel.innerHTML, /Transfers Included/);
  assert.match(panel.innerHTML, /Departure Airport Detected/);
  assert.match(panel.innerHTML, /Cabin Type Detected/);
});

test('Offer Intelligence reports missing fields and avoids false operator matches for unknown ships', () => {
  const { context, panel } = createHarness();
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ship: 'Mystery Ship', price: '999' }, raw: 'Mystery Ship\n£999pp' }));

  assert.match(panel.innerHTML, /Board Basis not detected/);
  assert.match(panel.innerHTML, /Departure Airport not detected/);
  assert.match(panel.innerHTML, /Nights not detected/);
  assert.doesNotMatch(panel.innerHTML, /Operator inferred from ship/);
});

