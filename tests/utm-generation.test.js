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
  const elements = {
    'g-date': { value: '16 May 2026', getAttribute: () => '' },
    'f-name': { value: editor.name ?? activeOffer.name ?? '' },
    'f-url': { value: editor.url ?? activeOffer.url ?? '' },
    'f-operator': { value: editor.operator ?? activeOffer.operator ?? '' },
    'utm-visible-output': { value: '' },
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


test('UTM Link renders generated output as a compact copyable card instead of a textarea', () => {
  assert.match(html, /<div class="std-utm-item utm-current-card">[\s\S]*?<strong>Generated UTM<\/strong><button class="abtn" id="utm-copy-btn" onclick="copyUtm\(\)"[\s\S]*?>Copy<\/button>[\s\S]*?<div id="utm-visible-output" class="utm-visible-output" role="status" aria-live="polite">/);
  assert.doesNotMatch(html, /<textarea id="utm-visible-output"/);
});

test('Standard UTMs keeps Copy All and the redundant Generate All button is not rendered', () => {
  const standardSection = html.match(/<div class="section" data-section-key="standard-utms">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)[0];
  assert.match(standardSection, /onclick="copyAllUtms\(\)">Copy All UTMs<\/button>/);
  assert.doesNotMatch(html, />Generate All UTMs<\/button>/);
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
