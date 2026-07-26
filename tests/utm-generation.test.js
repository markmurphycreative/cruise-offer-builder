import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractBlock(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not locate source block: ${startMarker}`);
  return html.slice(start, end);
}

function createUtmHarness({ offers, cur = 0, editor = {} } = {}) {
  offers ||= [{}, {}, {}, {}];
  const activeOffer = offers[cur] || {};
  const createStyle = () => ({ values: {}, setProperty(name, value) { this.values[name] = value; } });
  const elements = {
    'g-date': { value: '16 May 2026', getAttribute: () => '' },
    'f-name': { value: editor.name ?? activeOffer.name ?? '' },
    'f-url': { value: editor.url ?? activeOffer.url ?? '' },
    'f-operator': { value: editor.operator ?? activeOffer.operator ?? '' },
    'utm-visible-output': { value: '' },
    'utm-generated-list': { innerHTML: '' },
    'utm-panel-title': { textContent: 'Generated UTMs' },
    'utm-current-card': { style: createStyle() },
    'utm-context-id': { style: createStyle() },
    'utm-context-meta': { textContent: '' },
    'utm-context-title': { textContent: '' },
    'utm-out': { textContent: '', style: {} },
    'utm-copy-btn': { disabled: false, textContent: 'Copy Current UTM' }
  };
  const copied = [];
  const context = {
    console: { log() {} },
    document: { getElementById: id => elements[id] || null },
    navigator: { clipboard: { writeText(value) { copied.push(value); return Promise.resolve(); } } },
    alert() {},
    setTimeout() {},
    OPERATOR_HEADERS: {},
    offers,
    cur
  };
  vm.createContext(context);
  const config = extractBlock('const OPERATOR_CONFIG =', '\nfunction getOperatorLandingUrl')
    .replace('const OPERATOR_CONFIG', 'var OPERATOR_CONFIG');
  const utm = extractBlock('// CLEAN UTM MODULE', '\nconst STANDARD_UTM_LINKS =')
    .replace('const DANDS_OPERATOR_UTM', 'var DANDS_OPERATOR_UTM');
  vm.runInContext(`${config}\n${utm}`, context);
  return { context, elements, copied };
}

function utmContent(url) {
  return new URL(url).searchParams.get('utm_content');
}


test('UTM Link renders generated output as a stacked Generated UTMs panel instead of a textarea', () => {
  assert.match(html, /<div id="utm-current-card" class="generated-utm-panel utm-current-card">[\s\S]*?<strong id="utm-panel-title">Generated UTMs<\/strong>[\s\S]*?<div id="utm-generated-list" class="generated-utm-list" role="list" aria-live="polite">[\s\S]*?<div id="utm-visible-output" class="generated-utm-empty empty-state" role="status">/);
  assert.match(html, /\.generated-utm-list\{[^}]*display:grid;[^}]*gap:7px;/);
  assert.match(html, /\.utm-offer-card\{[^}]*background:var\(--panel\);[^}]*border:1px solid var\(--border\);[^}]*border-left:3px solid var\(--border\);/);
  assert.match(html, /\.utm-offer-card\.utm-current-card\{[^}]*background:var\(--utm-operator-tint\);[^}]*border-left-color:var\(--utm-operator-accent\);/);
  assert.match(html, /\.utm-visible-output\{[^}]*font-family:monospace;[^}]*color:var\(--navy\);/);
  assert.doesNotMatch(html, /<textarea id="utm-visible-output"/);
});


test('Generated UTM context identifier follows the active operator, card number and offer name without changing the URL', () => {
  const { context, elements } = createUtmHarness({
    cur: 2,
    offers: [{}, {}, { operator: 'msc', name: 'Mediterranean Explorer' }]
  });

  const url = context.genUtm();
  assert.equal(elements['utm-context-meta'].textContent, 'MSC Cruises • CARD 3');
  assert.equal(elements['utm-context-title'].textContent, 'Mediterranean Explorer');
  assert.match(url, /utm_content=160526_msc_mediterranean_explorer_card3/);
  assert.equal(elements['utm-visible-output'].value, url);
});

test('Generated UTMs panel displays every populated offer UTM with independent copy buttons and hides empty offers', () => {
  const { context, elements } = createUtmHarness({
    cur: 1,
    offers: [
      { operator: 'royal', name: 'Barcelona to Rome' },
      { operator: 'msc', name: 'Greek Isles' },
      {},
      { operator: 'cunard', name: 'Northern Lights' }
    ]
  });

  context.genUtm();
  const markup = elements['utm-generated-list'].innerHTML;
  assert.equal(elements['utm-panel-title'].textContent, 'Generated UTMs (3)');
  assert.match(markup, /<strong>Card 1<\/strong><span>Barcelona to Rome<\/span>/);
  assert.match(markup, /<strong>Card 2<\/strong><span>Greek Isles<\/span>/);
  assert.doesNotMatch(markup, /<strong>Card 3<\/strong>/);
  assert.match(markup, /<strong>Card 4<\/strong><span>Northern Lights<\/span>/);
  assert.match(markup, /copyUtm\(0, this\)/);
  assert.match(markup, /copyUtm\(1, this\)/);
  assert.match(markup, /copyUtm\(3, this\)/);
  assert.match(markup, /utm_content=160526_royal_caribbean_barcelona_to_rome_card1/);
  assert.match(markup, /utm_content=160526_msc_greek_isles_card2/);
  assert.match(markup, /utm_content=160526_cunard_northern_lights_card4/);
});

test('Generated UTM context identifier falls back safely when operator and offer name are missing', () => {
  const { context, elements } = createUtmHarness({ offers: [{}] });

  context.genUtm();
  assert.equal(elements['utm-context-meta'].textContent, 'CARD 1');
  assert.equal(elements['utm-context-title'].textContent, 'Untitled Offer');
  assert.equal(elements['utm-current-card'].style.values['--utm-operator-accent'], '#9e936c');
  assert.equal(elements['utm-current-card'].style.values['--utm-operator-tint'], 'rgba(158,147,108,0.04)');
  assert.equal(elements['utm-context-id'].style.values['--utm-accent'], '#9e936c');
  assert.equal(elements['utm-context-id'].style.values['--utm-accent-tint'], 'rgba(158,147,108,0.025)');
});

test('Generated UTM card applies the subtle configured operator colour mapping', () => {
  const expected = {
    celebrity: { accent: '#071f3d', tint: 'rgba(7,31,61,0.04)' },
    cunard: { accent: '#8b0000', tint: 'rgba(139,0,0,0.04)' },
    msc: { accent: '#003399', tint: 'rgba(0,51,153,0.04)' },
    princess: { accent: '#7fb6d9', tint: 'rgba(127,182,217,0.04)' },
    fred: { accent: '#9e936c', tint: 'rgba(158,147,108,0.04)' },
    marella: { accent: '#008c95', tint: 'rgba(0,140,149,0.04)' },
    royal: { accent: '#003087', tint: 'rgba(0,48,135,0.04)' },
    ambassador: { accent: '#6f1d46', tint: 'rgba(111,29,70,0.04)' }
  };

  for (const [operator, colours] of Object.entries(expected)) {
    const { context, elements } = createUtmHarness({
      offers: [{ operator, name: 'Premium Escape' }]
    });
    const url = context.genUtm();
    assert.equal(elements['utm-current-card'].style.values['--utm-operator-accent'], colours.accent, operator);
    assert.equal(elements['utm-current-card'].style.values['--utm-operator-tint'], colours.tint, operator);
    assert.match(url, new RegExp(`utm_content=160526_${context.OPERATOR_CONFIG[operator].utmSlug}_premium_escape_card1`));
  }
});

test('Generated UTM card colour updates instantly when the active offer changes without altering output or copy', async () => {
  const { context, elements, copied } = createUtmHarness({
    cur: 0,
    offers: [
      { operator: 'celebrity', name: 'Northern Lights' },
      { operator: 'cunard', name: 'Grand Voyage' },
      { operator: 'msc', name: 'Mediterranean Explorer' },
      { operator: 'princess', name: 'Greek Islands' }
    ]
  });
  const states = [
    { index: 0, operator: 'celebrity', name: 'Northern Lights', accent: '#071f3d', content: /utm_content=160526_celebrity_northern_lights_card1/ },
    { index: 1, operator: 'cunard', name: 'Grand Voyage', accent: '#8b0000', content: /utm_content=160526_cunard_grand_voyage_card2/ },
    { index: 2, operator: 'msc', name: 'Mediterranean Explorer', accent: '#003399', content: /utm_content=160526_msc_mediterranean_explorer_card3/ },
    { index: 3, operator: 'princess', name: 'Greek Islands', accent: '#7fb6d9', content: /utm_content=160526_princess_greek_islands_card4/ }
  ];
  const generated = [];

  for (const state of states) {
    context.cur = state.index;
    elements['f-operator'].value = state.operator;
    elements['f-name'].value = state.name;
    const url = context.genUtm();
    generated.push(url);
    assert.equal(elements['utm-current-card'].style.values['--utm-operator-accent'], state.accent);
    assert.match(elements['utm-visible-output'].value, state.content);
    assert.equal(elements['utm-visible-output'].value, url);
  }

  assert.equal(new Set(generated).size, states.length);
  context.copyUtm();
  await Promise.resolve();
  assert.equal(copied.at(-1), generated.at(-1));
  assert.match(copied.at(-1), /utm_content=160526_princess_greek_islands_card4/);
});


test('Copy All UTMs copies card labels and URLs in the spaced format without changing URL values or order', async () => {
  const offers = [
    { operator: 'royal', name: 'Barcelona to Rome' },
    { operator: 'msc', name: 'Greek Isles' },
    { operator: 'cunard', name: 'Northern Lights' },
    { operator: 'princess', name: 'Greek Islands' }
  ];
  const { context, copied } = createUtmHarness({ offers });

  const expectedUrls = [0, 1, 2, 3].map(index => context.buildUtmForOffer(index).url);
  context.copyAllUtms();
  await Promise.resolve();

  const expectedText = expectedUrls.map((url, index) => `Card ${index + 1}:\n${url}`).join('\n\n');
  assert.ok(copied.at(-1).startsWith(expectedText));
  assert.deepEqual(
    copied.at(-1).match(/https?:\/\/[^\n]+/g),
    expectedUrls
  );
  assert.match(copied.at(-1), /^Card 1:\nhttps:\/\//);
  assert.match(copied.at(-1), /\n\nCard 2:\nhttps:\/\//);
  assert.match(copied.at(-1), /\n\nCard 3:\nhttps:\/\//);
  assert.match(copied.at(-1), /\n\nCard 4:\nhttps:\/\//);
  assert.equal(new URL(expectedUrls[0]).searchParams.get('utm_content'), '160526_royal_caribbean_barcelona_to_rome_card1');
  assert.equal(new URL(expectedUrls[1]).searchParams.get('utm_content'), '160526_msc_greek_isles_card2');
  assert.equal(new URL(expectedUrls[2]).searchParams.get('utm_content'), '160526_cunard_northern_lights_card3');
  assert.equal(new URL(expectedUrls[3]).searchParams.get('utm_content'), '160526_princess_greek_islands_card4');
});

test('UTM Link is the only UTM section and contains the consolidated Copy All control', () => {
  assert.doesNotMatch(html, /data-section-key="standard-utms"/);
  const utmSection = html.match(/<div class="section" data-section-key="utm-link">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)[0];
  assert.match(html, /onclick="copyAllUtms\(\)">Copy All UTMs<\/button>/);
  assert.doesNotMatch(html, />Generate All UTMs<\/button>/);
});

test('campaign reset preserves the shared detailed Tracking Links renderer', () => {
  const resetStart = html.indexOf('function resetBuilderToBlankSession(type=currentCampaignType, options={}){');
  const resetEnd = html.indexOf('\nfunction ', resetStart + 1);
  assert.ok(resetStart >= 0 && resetEnd > resetStart, 'Could not locate new-campaign reset');
  const reset = html.slice(resetStart, resetEnd);
  const clearedIds = reset.match(/\[[^\]]+\]\.forEach\(id=>\{ const el=document\.getElementById\(id\); if\(el\) el\.innerHTML=""; \}\);/g) || [];
  assert.ok(clearedIds.length > 0, 'Expected transient output clearing');
  assert.doesNotMatch(clearedIds.join('\n'), /utm-generated-list/);
  assert.doesNotMatch(clearedIds.join('\n'), /utm-current-card/);
  assert.match(reset, /load\(0\);[\s\S]*?refreshAfterRestore\(\);/);
});

test('four-offer Package campaigns use the shared renderer and regenerate every position after reorder', () => {
  const offers = [
    { campaignType: 'package', offerType: 'package', operator: 'jet2', name: 'Majorca Family Escape' },
    { campaignType: 'package', offerType: 'package', operator: 'jet2', name: 'Tenerife Beach Break' },
    { campaignType: 'package', offerType: 'package', operator: 'jet2', name: 'Lanzarote Sunshine' },
    { campaignType: 'package', offerType: 'package', operator: 'jet2', name: 'Costa del Sol' }
  ];
  const { context, elements } = createUtmHarness({ offers });

  context.genAllUtms(true);
  const moved = context.offers.splice(3, 1)[0];
  context.offers.splice(0, 0, moved);
  context.cur = 1;
  elements['f-operator'].value = 'jet2';
  elements['f-name'].value = 'Majorca Family Escape';
  const regenerated = context.genAllUtms(true);

  assert.match(regenerated, /utm_content=160526_jet2holidays_costa_del_sol_card1/);
  assert.match(regenerated, /utm_content=160526_jet2holidays_majorca_family_escape_card2/);
  assert.match(regenerated, /utm_content=160526_jet2holidays_tenerife_beach_break_card3/);
  assert.match(regenerated, /utm_content=160526_jet2holidays_lanzarote_sunshine_card4/);
  assert.match(elements['utm-generated-list'].innerHTML, /Copy All UTMs/);
  assert.equal(context.offers[0].url, context.OPERATOR_CONFIG.jet2.url);
  assert.equal(new Set(context.offers.map(offer => offer._utm)).size, 4);
});

test('Generate Current UTM resolves every Norwegian alias to the norwegian UTM slug', () => {
  for (const operator of ['ncl', 'NCL', 'Norwegian Cruise Line', 'Norwegian']) {
    const { context } = createUtmHarness({
      offers: [{ operator, name: 'Baltic Capitals', url: 'https://www.dawsonandsanderson.co.uk/cruises' }]
    });
    assert.equal(utmContent(context.genUtm()), '160526_norwegian_baltic_capitals_card1');
  }
});

test('Princess Cruises continues to resolve to the princess UTM slug', () => {
  const { context } = createUtmHarness({
    offers: [{ operator: 'Princess Cruises', name: 'Baltic Capitals' }]
  });
  assert.equal(utmContent(context.buildUtmForOffer(0).url), '160526_princess_baltic_capitals_card1');
});

test('Generate All UTMs uses each card own operator and does not reuse stale operator state', () => {
  const { context } = createUtmHarness({
    cur: 0,
    editor: { operator: 'princess', name: 'Mediterranean Escape' },
    offers: [
      { operator: 'princess', name: 'Mediterranean Escape' },
      {
        operator: 'ncl',
        name: 'Baltic Capitals',
        url: 'https://www.dawsonandsanderson.co.uk/cruises',
        _utm: 'https://example.test/?utm_content=160526_princess_baltic_capitals_card2'
      }
    ]
  });
  const generated = context.genAllUtms(true);
  assert.match(generated, /utm_content=160526_princess_mediterranean_escape_card1/);
  assert.match(generated, /utm_content=160526_norwegian_baltic_capitals_card2/);
  assert.equal(utmContent(context.offers[1]._utm), '160526_norwegian_baltic_capitals_card2');
});

test('replacing Card 2 Norwegian with MSC rebuilds content from the current card operator', () => {
  const { context } = createUtmHarness({
    offers: [
      { operator: 'princess', name: 'Greek Islands' },
      {
        operator: 'msc',
        ship: 'MSC Virtuosa',
        name: 'Mediterranean Explorer',
        _utm: 'https://example.test/?utm_content=160526_norwegian_mediterranean_explorer_card2'
      }
    ]
  });
  const generated = context.genAllUtms(true);
  assert.match(generated, /utm_content=160526_msc_mediterranean_explorer_card2/);
  assert.doesNotMatch(generated, /norwegian|ncl/i);
  assert.equal(utmContent(context.offers[1]._utm), '160526_msc_mediterranean_explorer_card2');
});

test('manual operator replacement uses the active editor operator instead of cached offer state', () => {
  const { context } = createUtmHarness({
    cur: 1,
    editor: { operator: 'msc', name: 'Mediterranean Explorer' },
    offers: [
      { operator: 'princess', name: 'Greek Islands' },
      { operator: 'ncl', name: 'Old Norwegian Offer', _utm: 'https://example.test/?utm_content=160526_norwegian_old_norwegian_offer_card2' }
    ]
  });
  assert.equal(utmContent(context.buildUtmForOffer(1).url), '160526_msc_mediterranean_explorer_card2');
  assert.equal(utmContent(context.offers[1]._utm), '160526_msc_mediterranean_explorer_card2');
});

test('replacing Celebrity with Cunard and reordering cards rebuilds each visible card suffix', () => {
  const { context } = createUtmHarness({
    offers: [
      { operator: 'princess', name: 'Greek Islands' },
      { operator: 'msc', name: 'Mediterranean Explorer' },
      {
        operator: 'cunard',
        name: 'Northern Lights',
        _utm: 'https://example.test/?utm_content=160526_celebrity_northern_lights_card3'
      }
    ]
  });
  context.genAllUtms(true);
  assert.equal(utmContent(context.offers[2]._utm), '160526_cunard_northern_lights_card3');

  const moved = context.offers.splice(2, 1)[0];
  context.offers.splice(0, 0, moved);
  context.cur = 1; // The selected Greek Islands card shifts right when Card 3 moves before it.
  const reordered = context.genAllUtms(true);
  assert.match(reordered, /utm_content=160526_cunard_northern_lights_card1/);
  assert.match(reordered, /utm_content=160526_princess_greek_islands_card2/);
  assert.match(reordered, /utm_content=160526_msc_mediterranean_explorer_card3/);
  assert.doesNotMatch(reordered, /celebrity/);
});

test('failed generation clears a cached UTM instead of retaining a stale operator', () => {
  const { context } = createUtmHarness({
    offers: [{ operator: 'custom', name: 'Mystery Sailing', _utm: 'https://example.test/?utm_content=160526_norwegian_mystery_sailing_card1' }]
  });
  assert.equal(context.buildUtmForOffer(0).url, '');
  assert.equal(context.offers[0]._utm, '');
});

test('Campaign Pack export rebuilds offer UTMs instead of reusing cached stale values', () => {
  const exportStart = html.indexOf('async function exportCampaignPack()');
  const exportEnd = html.indexOf('\nfunction ', exportStart + 1);
  assert.ok(exportStart >= 0 && exportEnd > exportStart, 'Could not locate exportCampaignPack');
  const exportCampaignPack = html.slice(exportStart, exportEnd);
  assert.match(exportCampaignPack, /const cardUtm=\(buildUtmForOffer\(i\)\.url\|\|''\)\.replace/);
  assert.match(exportCampaignPack, /combinedRows\.push\(\{type:'offer',label:`Card \$\{i\+1\} UTM`,utm:cardUtm\}\)/);
  assert.doesNotMatch(exportCampaignPack, /o\._utm\|\|buildUtmForOffer/);

  const { context } = createUtmHarness({
    cur: 2,
    offers: [{}, {}, {
      operator: 'msc',
      ship: 'MSC Virtuosa',
      name: 'Mediterranean Explorer',
      _utm: 'https://example.test/?utm_content=160526_norwegian_mediterranean_explorer_card3'
    }]
  });
  assert.equal(utmContent(context.buildUtmForOffer(2).url), '160526_msc_mediterranean_explorer_card3');
});

test('Google Sheet refresh regenerates all imported offer UTMs before the active-card UTM', () => {
  assert.match(html, /processSheetCSV = function\(csv,status\)\{[\s\S]*?processSheetCSVStable\(csv,status\);[\s\S]*?genAllUtms\(true\);[\s\S]*?genUtm\(\);/);
});


test('visible Generated UTM panel rebuilds selected Card 3 after Norwegian is replaced with MSC', async () => {
  const { context, elements, copied } = createUtmHarness({
    cur: 2,
    offers: [
      { operator: 'princess', name: 'Greek Islands' },
      { operator: 'cunard', name: 'Northern Lights' },
      { operator: 'ncl', ship: 'Norwegian Prima', name: 'Mediterranean Explorer' }
    ]
  });

  context.genUtm();
  assert.match(elements['utm-visible-output'].value, /utm_content=160526_norwegian_mediterranean_explorer_card3/);

  Object.assign(context.offers[2], {
    operator: 'msc',
    ship: 'MSC Virtuosa',
    name: 'Mediterranean Explorer'
  });
  elements['f-operator'].value = 'msc';
  elements['f-name'].value = 'Mediterranean Explorer';

  context.genUtm();
  assert.match(elements['utm-visible-output'].value, /utm_content=160526_msc_mediterranean_explorer_card3/);
  assert.doesNotMatch(elements['utm-visible-output'].value, /norwegian|ncl/i);

  const all = context.genAllUtms(true);
  assert.match(all, /utm_content=160526_msc_mediterranean_explorer_card3/);
  assert.doesNotMatch(all, /norwegian|ncl/i);

  context.copyUtm();
  await Promise.resolve();
  assert.match(copied.at(-1), /utm_content=160526_msc_mediterranean_explorer_card3/);
  assert.doesNotMatch(copied.at(-1), /norwegian|ncl/i);
});

test('session-style restored MSC card regenerates instead of retaining a cached Norwegian UTM', () => {
  const { context, elements } = createUtmHarness({
    cur: 2,
    offers: [
      {},
      {},
      {
        operator: 'msc',
        ship: 'MSC Virtuosa',
        name: 'Mediterranean Explorer',
        _utm: 'https://example.test/?utm_content=160526_norwegian_mediterranean_explorer_card3'
      }
    ]
  });

  context.genUtm();
  context.genAllUtms(true);
  assert.match(elements['utm-visible-output'].value, /utm_content=160526_msc_mediterranean_explorer_card3/);
  assert.equal(utmContent(context.offers[2]._utm), '160526_msc_mediterranean_explorer_card3');
  assert.doesNotMatch(context.offers[2]._utm, /norwegian|ncl/i);
});

test('shared generic cruises landing page cannot preserve a previous operator when selection is unresolved', () => {
  const { context, elements } = createUtmHarness({
    offers: [{
      operator: '',
      name: 'Mediterranean Explorer',
      url: 'https://www.dawsonandsanderson.co.uk/cruises',
      _utm: 'https://example.test/?utm_content=160526_norwegian_mediterranean_explorer_card1'
    }]
  });

  assert.equal(context.genUtm(), '');
  assert.equal(context.offers[0]._utm, '');
  assert.match(elements['utm-visible-output'].value, /needs operator\/operator URL/);
  assert.doesNotMatch(elements['utm-visible-output'].value, /norwegian|ncl|msc|princess/i);
});
