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
    ITINERARY_FOOTER_LABEL: /^(?:luggage\s*(?:&|and)\s*transfers?\s+included|flights?\s+included|inclusions?|what(?:'|’)?s included|price|from £|terms(?:\s*&\s*conditions)?|book now|call to book|cabin|accommodation)\b/i,
    OPERATOR_ALIASES: { po: [/\bp\s*&\s*o\b/i], cunard: [/\bcunard\b/i], ncl: [/\bnorwegian\s+cruise\s+line\b/i, /\bncl\b/i], msc: [/\bmsc\b/i], virgin: [/\bvirgin\b/i] },
    OPERATOR_SHIPS: { po: ['Arvia', 'Iona'], cunard: ['Queen Anne'], fred: ['Bolette'], virgin: ['Scarlet Lady'], msc: ['MSC Virtuosa'], ncl: ['Norwegian Prima', 'Pride of America'] },
    OPERATOR_HEADERS: { po: { name: 'P&O Cruises' }, cunard: { name: 'Cunard' }, fred: { name: 'Fred. Olsen Cruise Lines' }, virgin: { name: 'Virgin Voyages' }, msc: { name: 'MSC Cruises' }, ncl: { name: 'Norwegian Cruise Line' } },
    OPERATOR_INTELLIGENCE: { po: { name: 'P&O Cruises', category: 'Mainstream ocean cruise', dawsonUrl: 'https://example.test/po' }, cunard: { name: 'Cunard', category: 'Heritage ocean cruise', dawsonUrl: 'https://example.test/cunard' }, virgin: { name: 'Virgin Voyages', category: 'Adults-only lifestyle cruise' }, msc: { name: 'MSC Cruises', category: 'Mainstream ocean cruise' }, ncl: { name: 'Norwegian Cruise Line', category: 'Mainstream ocean cruise' } },
    getOperatorLandingUrl(key) { return key === 'po' ? 'https://example.test/po' : ''; }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeRegExp'),
    extractFunction('getOfferIntelligenceShipOperator'),
    extractFunction('findKnownOperatorShip'),
    extractFunction('getStandalonePortLines'),
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


test('Offer Intelligence infers Queen Anne as Cunard premium knowledge only', () => {
  const { context, panel } = createHarness();
  const parsed = { ship: 'Queen Anne', price: '1199' };
  const inferred = vm.runInContext('getOfferIntelligenceShipOperator("Queen Anne");', context);

  assert.equal(inferred.operatorKey, 'cunard');
  assert.notEqual(inferred.operatorKey, 'ncl');
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed, raw: 'Queen Anne\nNorwegian Fjords\n£1199pp' }));

  assert.match(panel.innerHTML, /Operator inferred from ship: Cunard/);
  assert.match(panel.innerHTML, /Cruise Knowledge/);
  assert.match(panel.innerHTML, /Operator: Cunard/);
  assert.match(panel.innerHTML, /Cruise Type: Ocean Cruise/);
  assert.match(panel.innerHTML, /Audience: Premium/);
  assert.doesNotMatch(panel.innerHTML, /Norwegian Cruise Line/);
  assert.doesNotMatch(panel.innerHTML, /Family Friendly/);
});

test('Offer Intelligence detects standalone port lines without exposing each port in panel', () => {
  const { context, panel } = createHarness();
  const raw = 'Queen Anne\nSouthampton\nStavanger\nOlden\nGeiranger\nBergen\nSouthampton';
  const portLines = vm.runInContext('getStandalonePortLines(raw.split(/\\n/));', Object.assign(context, { raw }));

  assert.deepEqual(JSON.parse(JSON.stringify(portLines)), ['Southampton', 'Stavanger', 'Olden', 'Geiranger', 'Bergen', 'Southampton']);
  vm.runInContext('renderOfferIntelligencePanel(parsed, raw);', Object.assign(context, { parsed: { ship: 'Queen Anne', ports: portLines.join(' • ') }, raw }));

  assert.match(panel.innerHTML, /You’ll Visit Ports: Detected/);
  assert.doesNotMatch(panel.innerHTML, /Stavanger • Olden/);
});

test('Known ship inference remains exact and avoids generic or ambiguous matches', () => {
  const { context } = createHarness();

  for (const [ship, operatorKey] of [['Arvia', 'po'], ['Iona', 'po'], ['MSC Virtuosa', 'msc'], ['Scarlet Lady', 'virgin']]) {
    const match = vm.runInContext('findKnownOperatorShip(ship);', Object.assign(context, { ship }));
    assert.equal(match.operatorKey, operatorKey);
    assert.equal(match.ship, ship);
  }

  assert.equal(vm.runInContext('findKnownOperatorShip("Queen")', context), null);
  assert.equal(vm.runInContext('findKnownOperatorShip("Norwegian Fjords on Queen Anne")', context).operatorKey, 'cunard');
  assert.equal(vm.runInContext('findKnownOperatorShip("Operator Ship Cruise")', context), null);

  context.OPERATOR_SHIPS.ncl.push('Queen Anne');
  assert.equal(vm.runInContext('findKnownOperatorShip("Queen Anne")', context), null);
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
