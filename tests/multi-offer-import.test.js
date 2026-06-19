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
  assert.match(html, /id="multi-offer-paste"[^>]*oninput="handleMultiOfferImportInput\(event\)"/);
  assert.match(html, /Load All Offers/);
  assert.match(extractFunction('performMultiOfferImport'), /parseOfferText\(block,\{renderIntelligence:false\}\)/);
  assert.match(extractFunction('performMultiOfferImport'), /Replace existing offers\?/);
});


test('Multi Offer Import empty input and history restore clear transient result state only', () => {
  assert.match(extractFunction('handleMultiOfferImportInput'), /if\(!raw\.trim\(\)\) resetMultiOfferImportState\(\{clearText:false\}\)/);
  assert.doesNotMatch(extractFunction('handleMultiOfferImportInput'), /offers\s*=/);
  assert.match(extractFunction('syncMultiOfferImportStateAfterHistoryRestore'), /resetMultiOfferImportState\(\)/);
  const restoreBlock = html.match(/function restoreCampaignHistorySnapshot\(snapshot\)\{[\s\S]*?finally\{/)[0];
  assert.match(restoreBlock, /syncMultiOfferImportStateAfterHistoryRestore\(\);[\s\S]*?refreshAfterRestore\(\)/);
});

