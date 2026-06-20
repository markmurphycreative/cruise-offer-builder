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
  const context = {
    OPERATOR_HEADERS: {
      po: { name: 'P&O Cruises' },
      celebrity: { name: 'Celebrity Cruises' },
      marella: { name: 'Marella Cruises' },
      virgin: { name: 'Virgin Voyages' }
    },
    OPERATOR_ALIASES: {
      po: [/\bp\s*&\s*o\b/i, /\bp&o\s+cruises\b/i],
      celebrity: [/\bcelebrity\b/i],
      marella: [/\bmarella\b/i],
      virgin: [/\bvirgin\b/i]
    },
    OPERATOR_SHIPS: {
      po: ['Arvia'],
      celebrity: ['Celebrity Apex'],
      marella: ['Explorer'],
      virgin: ['Scarlet Lady']
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeRegExp'),
    extractFunction('findKnownOperatorShip'),
    extractFunction('isDividerLine'),
    extractFunction('isOfferLabelLine'),
    extractFunction('isLikelyOfferStartLine'),
    extractFunction('splitMultiOfferImport')
  ].join('\n'), context);
  return context;
}

test('splitMultiOfferImport splits Trello-style divider imports into four offers', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer 1

P&O Cruises
Arvia
Spain & France

--------------------------------

Offer 2

Celebrity Cruises
Celebrity Apex
Portugal & Spain

--------------------------------

Offer 3

Marella Cruises
Explorer
Canary Islands

--------------------------------

Offer 4

Virgin Voyages
Scarlet Lady
Greek Island Glow`);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0], 'P&O Cruises\nArvia\nSpain & France');
  assert.equal(blocks[3], 'Virgin Voyages\nScarlet Lady\nGreek Island Glow');
});

test('splitMultiOfferImport detects plain-copy boundaries from operator names', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`P&O Cruises
Arvia
Spain & France

Celebrity Cruises
Celebrity Apex
Portugal & Spain

Marella Cruises
Explorer
Canary Islands

Virgin Voyages
Scarlet Lady
Greek Island Glow`);
  assert.equal(blocks.length, 4);
  assert.equal(JSON.stringify(blocks.map(block => block.split('\n')[0])), JSON.stringify(['P&O Cruises', 'Celebrity Cruises', 'Marella Cruises', 'Virgin Voyages']));
});

test('Multi Offer Import UI and parser reuse hooks are present', () => {
  assert.match(html, /MULTI OFFER IMPORT/);
  assert.match(html, /<textarea id="multi-offer-paste"[^>]* oninput="handleMultiOfferInput\(event\)"[^>]* onkeydown="handleMultiOfferKeydown\(event\)"/);
  assert.match(html, /Load All Offers/);
  assert.match(extractFunction('performMultiOfferImport'), /parseOfferText\(block,\{renderIntelligence:false\}\)/);
  assert.match(extractFunction('performMultiOfferImport'), /Replace existing offers\?/);
});

test('Multi Offer Import textarea Enter submits through Load All Offers', () => {
  const context = {
    calls: 0,
    loadAllOffers() { context.calls += 1; }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('handleMultiOfferKeydown'), context);
  let prevented = false;
  context.handleMultiOfferKeydown({
    key: 'Enter',
    target: { id: 'multi-offer-paste' },
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.equal(context.calls, 1);
});

test('Multi Offer Import textarea Shift Enter keeps native newline behaviour', () => {
  const context = {
    calls: 0,
    loadAllOffers() { context.calls += 1; }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('handleMultiOfferKeydown'), context);
  let prevented = false;
  context.handleMultiOfferKeydown({
    key: 'Enter',
    shiftKey: true,
    target: { id: 'multi-offer-paste' },
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, false);
  assert.equal(context.calls, 0);
});

test('Multi Offer Import manual clear removes stale result rows only', () => {
  const result = { innerHTML: 'Offer 1 Loaded', className: 'parse-result high' };
  const field = { value: '' };
  const context = {
    document: {
      getElementById(id) {
        if (id === 'multi-offer-result') return result;
        if (id === 'multi-offer-paste') return field;
        return null;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([extractFunction('setMultiOfferStatus'), extractFunction('handleMultiOfferInput')].join('\n'), context);
  context.handleMultiOfferInput({ inputType: 'deleteContentBackward' });

  assert.equal(result.innerHTML, '');
  assert.equal(result.className, 'parse-result ');
});
