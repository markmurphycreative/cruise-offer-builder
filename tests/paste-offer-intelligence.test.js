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
    OPERATOR_SHIPS: { po: ['Arvia'], cunard: ['Queen Anne'], fred: ['Bolette'], virgin: ['Scarlet Lady'], msc: ['MSC Virtuosa'] },
    OPERATOR_HEADERS: { po: { name: 'P&O Cruises' }, cunard: { name: 'Cunard' }, fred: { name: 'Fred. Olsen Cruise Lines' }, virgin: { name: 'Virgin Voyages' }, msc: { name: 'MSC Cruises' } },
    OPERATOR_INTELLIGENCE: { po: { name: 'P&O Cruises', category: 'Mainstream ocean cruise', dawsonUrl: 'https://example.test/po' }, cunard: { name: 'Cunard', category: 'Heritage ocean cruise', dawsonUrl: 'https://example.test/cunard' }, virgin: { name: 'Virgin Voyages', category: 'Adults-only lifestyle cruise' }, msc: { name: 'MSC Cruises', category: 'Mainstream ocean cruise' } },
    getOperatorLandingUrl(key) { return key === 'po' ? 'https://example.test/po' : ''; }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeRegExp'),
    extractFunction('getOfferIntelligenceShipOperator'),
    extractFunction('getOfferIntelligenceCruiseTypes'),
    extractFunction('getOfferIntelligenceCruiseKnowledge'),
    extractFunction('detectOfferIntelligenceInclusions'),
    extractFunction('clearOfferIntelligencePanel'),
    extractFunction('getOfferIntelligenceDetectedFields'),
    extractFunction('getOfferIntelligenceSummary'),
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
  assert.match(panel.innerHTML, /Departure Airport: Newcastle/);
  assert.match(panel.innerHTML, /Cabin Type: Inside Cabin/);
  assert.match(panel.innerHTML, /Cruise Title: Caribbean Escape/);
  assert.match(panel.innerHTML, /Ship: Arvia/);
  assert.match(panel.innerHTML, /Nights: 14/);
  assert.match(panel.innerHTML, /Board Basis: Full Board/);
  assert.match(panel.innerHTML, /Price: £1669pp/);
  assert.doesNotMatch(panel.innerHTML, /Operator USPs Available/);
  assert.doesNotMatch(panel.innerHTML, /Landing Page Available/);
});

test('Offer Intelligence reports missing fields and avoids false operator matches for unknown ships', () => {
  const { context, panel } = createHarness();
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ship: 'Mystery Ship', price: '999' }, raw: 'Mystery Ship\n£999pp' }));

  assert.match(panel.innerHTML, /Board Basis not detected/);
  assert.match(panel.innerHTML, /Departure Airport not detected/);
  assert.match(panel.innerHTML, /Nights not detected/);
  assert.doesNotMatch(panel.innerHTML, /Operator inferred from ship/);
});


test('Offer Intelligence shows ports detection only when parsed ports exist', () => {
  const { context, panel } = createHarness();
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ports: 'Barbados • Martinique' }, raw: 'Barbados • Martinique' }));
  assert.match(panel.innerHTML, /You’ll Visit Ports: Detected/g);

  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { price: '999' }, raw: '£999pp' }));
  assert.doesNotMatch(panel.innerHTML, /You’ll Visit Ports: Detected/);
});

test('Offer Intelligence summary counts detected panel fields using simple confidence labels', () => {
  const { context } = createHarness();
  const high = vm.runInContext('getOfferIntelligenceSummary(parsed, raw);', Object.assign(context, { parsed: { operatorKey: 'po', name: 'Caribbean Escape', ship: 'Arvia', day: '20', month: 'November 2026', nights: '14', boardlbl: 'Full Board', price: '1669', ports: 'Barbados • Martinique' }, raw: 'Inside Cabin from Newcastle' }));
  assert.deepEqual(JSON.parse(JSON.stringify(high)), { count: 10, label: 'High Confidence', level: 'high' });

  const partial = vm.runInContext('getOfferIntelligenceSummary(parsed, raw);', Object.assign(context, { parsed: { ship: 'Arvia', nights: '14', price: '1669', ports: 'Barbados • Martinique' }, raw: '' }));
  assert.deepEqual(JSON.parse(JSON.stringify(partial)), { count: 4, label: 'Partial Match', level: 'partial' });

  const low = vm.runInContext('getOfferIntelligenceSummary(parsed, raw);', Object.assign(context, { parsed: { price: '999' }, raw: '' }));
  assert.deepEqual(JSON.parse(JSON.stringify(low)), { count: 1, label: 'Needs Review', level: 'low' });
});

test('Offer Intelligence shows compact cruise knowledge for known ship matches without mutating parsed data', () => {
  const { context, panel } = createHarness();
  const parsed = { ship: 'Scarlet Lady', price: '999' };
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed, raw: 'Scarlet Lady from Barcelona' }));

  assert.equal(parsed.operatorKey, undefined);
  assert.match(panel.innerHTML, /Cruise Knowledge/);
  assert.match(panel.innerHTML, /Operator: Virgin Voyages/);
  assert.match(panel.innerHTML, /Cruise Type: Ocean Cruise/);
  assert.match(panel.innerHTML, /Audience: Adults Only/);
});

test('Offer Intelligence hides cruise knowledge when no confident operator or ship exists', () => {
  const { context, panel } = createHarness();
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ship: 'Mystery Ship', price: '999' }, raw: 'Mystery Ship £999pp' }));

  assert.doesNotMatch(panel.innerHTML, /Cruise Knowledge/);
  assert.doesNotMatch(panel.innerHTML, /Cruise Type:/);
  assert.doesNotMatch(panel.innerHTML, /Audience:/);
});
