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

test('splitMultiOfferImport prioritises numeric Offer markers and strips marker lines', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer 1
Celebrity Cruises
Celebrity Apex
Italy Cruise

Offer 2
Royal Caribbean
Icon of the Seas
Caribbean Escape

Offer 3
Marella Cruises
Explorer
Canary Islands

Offer 4
P&O Cruises
Arvia
Spain & France`);

  assert.equal(JSON.stringify(blocks), JSON.stringify([
    'Celebrity Cruises\nCelebrity Apex\nItaly Cruise',
    'Royal Caribbean\nIcon of the Seas\nCaribbean Escape',
    'Marella Cruises\nExplorer\nCanary Islands',
    'P&O Cruises\nArvia\nSpain & France'
  ]));
  assert.ok(blocks.every(block => !/^offer\s/i.test(block)));
});

test('splitMultiOfferImport accepts uppercase OFFER markers', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`OFFER 1
Celebrity Cruises
Apex

OFFER 2
Marella Cruises
Explorer

OFFER 3
Virgin Voyages
Scarlet Lady

OFFER 4
P&O Cruises
Arvia`);

  assert.equal(blocks.length, 4);
  assert.equal(blocks[0], 'Celebrity Cruises\nApex');
  assert.equal(blocks[3], 'P&O Cruises\nArvia');
});

test('splitMultiOfferImport accepts Offer One wording', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer One
Celebrity Cruises
Apex

Offer Two
Marella Cruises
Explorer

Offer Three
Virgin Voyages
Scarlet Lady

Offer Four
P&O Cruises
Arvia`);

  assert.equal(JSON.stringify(blocks.map(block => block.split('\n')[0])), JSON.stringify(['Celebrity Cruises', 'Marella Cruises', 'Virgin Voyages', 'P&O Cruises']));
});

test('splitMultiOfferImport removes decorative separator-only lines from marked imports', () => {
  const context = createHarness();
  const blocks = context.splitMultiOfferImport(`Offer 1
## =====================
Celebrity Cruises
#####################
Celebrity Apex

Offer 2
=====================
Marella Cruises
Explorer`);

  assert.equal(JSON.stringify(blocks), JSON.stringify(['Celebrity Cruises\nCelebrity Apex', 'Marella Cruises\nExplorer']));
});

test('single-offer parse flow remains separate from Multi Offer Import splitting', () => {
  assert.doesNotMatch(extractFunction('parseOffer'), /splitMultiOfferImport/);
  assert.match(extractFunction('parseOffer'), /parseOfferText\(raw,\{renderIntelligence:true\}\)/);
});

test('Multi Offer Import passes the same blocks as individual single-offer parses', () => {
  const context = createHarness();
  const offers = [
    'Celebrity Cruises\nCelebrity Apex\nItaly Cruise',
    'Royal Caribbean\nIcon of the Seas\nCaribbean Escape',
    'Marella Cruises\nExplorer\nCanary Islands',
    'P&O Cruises\nArvia\nSpain & France'
  ];
  const multiPaste = offers.map((offer, index) => `Offer ${index + 1}\n${offer}`).join('\n\n');
  const parseOfferText = block => ({ parsed: { raw: block }, score: 100, confidence: 'high' });

  assert.equal(
    JSON.stringify(context.splitMultiOfferImport(multiPaste).map(block => parseOfferText(block).parsed)),
    JSON.stringify(offers.map(block => parseOfferText(block).parsed))
  );
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

test('Multi Offer Import manual clear removes stale result rows and imported offers', () => {
  const result = { innerHTML: 'Offer 1 Loaded', className: 'parse-result high' };
  const field = { value: '' };
  const calls = [];
  const tabs = Array.from({ length: 4 }, () => ({ classList: { toggle(name, state) { calls.push(['tab', name, state]); } } }));
  const context = {
    Number,
    offers: [{ name: 'Imported 1' }, { name: 'Imported 2' }, { name: 'Sheet offer' }, {}],
    cur: 0,
    activeMultiOfferImportIndexes: [0, 1],
    isOfferLoaded(offer) { return !!(offer && offer.name); },
    loadOfferToEditor(index) { calls.push(['loadOfferToEditor', index]); },
    renderOfferIndex(index) { calls.push(['renderOfferIndex', index]); },
    updateAllStatus() { calls.push(['updateAllStatus']); },
    queueAutosave() { calls.push(['queueAutosave']); },
    recordCampaignHistoryAfterAsyncChange(label) { calls.push(['history', label]); },
    document: {
      getElementById(id) {
        if (id === 'multi-offer-result') return result;
        if (id === 'multi-offer-paste') return field;
        return null;
      },
      querySelectorAll(selector) {
        assert.equal(selector, '.otab');
        return tabs;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('setMultiOfferStatus'),
    extractFunction('refreshOfferWorkspaceAfterEmptyPaste'),
    extractFunction('resetMultiImportedOffersFromEmptyPaste'),
    extractFunction('handleMultiOfferInput')
  ].join('\n'), context);
  context.handleMultiOfferInput({ inputType: 'deleteContentBackward' });

  assert.equal(result.innerHTML, '');
  assert.equal(result.className, 'parse-result ');
  assert.deepEqual(JSON.parse(JSON.stringify(context.offers)), [{}, {}, { name: 'Sheet offer' }, {}]);
  assert.equal(context.cur, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(context.activeMultiOfferImportIndexes)), []);
  assert.ok(calls.some(call => call[0] === 'updateAllStatus'));
  assert.ok(calls.some(call => call[0] === 'history' && call[1] === 'Multi offer import cleared'));
});

test('Multi Offer Import result rows are clickable navigation shortcuts without buttons', () => {
  const performMultiOfferImport = extractFunction('performMultiOfferImport');
  assert.match(performMultiOfferImport, /class="multi-offer-status-row"/);
  assert.match(performMultiOfferImport, /title="Jump to Offer"/);
  assert.match(performMultiOfferImport, /onclick="jumpToMultiOfferStatus\(\$\{index\}\)"/);
  assert.doesNotMatch(performMultiOfferImport, /<button class="abtn btn-compact" type="button" onclick="cur=\$\{index\}/);
  assert.match(html, /\.multi-offer-status-row\{[^}]*cursor:pointer;/);
});

test('jumpToMultiOfferStatus reuses tab selection, switches to Single view, opens Offer Details, and scrolls it into view', () => {
  const calls = [];
  const offerDetailsHeader = {
    classList: {
      contains(value) { return value === 'collapsed'; },
      toggle(value, state) { calls.push(['toggle-header', value, state]); }
    },
    nextElementSibling: {
      classList: {
        contains(value) { return value === 'section-body'; },
        toggle(value, state) { calls.push(['toggle-body', value, state]); }
      }
    }
  };
  const offerDetailsSection = {
    querySelector(selector) {
      assert.equal(selector, '.section-hdr');
      return offerDetailsHeader;
    },
    scrollIntoView(options) { calls.push(['scroll', options.block]); }
  };
  const context = {
    Number,
    calls,
    sv(index) { calls.push(['sv', index]); },
    setView(mode) { calls.push(['setView', mode]); },
    document: {
      querySelector(selector) {
        assert.equal(selector, '.section[data-section-key="offer-details"]');
        return offerDetailsSection;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('setSectionCollapsedByHeader'),
    extractFunction('openOfferDetailsSection'),
    extractFunction('jumpToMultiOfferStatus')
  ].join('\n'), context);

  assert.equal(context.jumpToMultiOfferStatus(2), true);
  assert.deepEqual(calls, [
    ['sv', 2],
    ['setView', 'single'],
    ['toggle-header', 'collapsed', false],
    ['toggle-body', 'hidden', false],
    ['scroll', 'start']
  ]);
});


test('Multi Offer Import clamps displayed confidence scores to 100', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractFunction('clampParseConfidenceScore'), context);

  assert.equal(context.clampParseConfidenceScore(110), 100);
  assert.equal(context.clampParseConfidenceScore(105), 100);
  assert.equal(context.clampParseConfidenceScore(98), 98);
});

test('Multi Offer Import status rows use the clamped confidence score for display', () => {
  const performMultiOfferImport = extractFunction('performMultiOfferImport');
  assert.match(performMultiOfferImport, /Confidence \$\{clampParseConfidenceScore\(result\.score\)\}/);
  assert.doesNotMatch(performMultiOfferImport, /Confidence \$\{result\.score\}/);
});

test('Multi Offer Import clears stale hero data on imported slots', () => {
  assert.match(extractFunction('applyParsedOfferToSlot'), /clearHeroImageDataFromOffer\(index\)/);
});
