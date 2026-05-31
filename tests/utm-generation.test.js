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
  const elements = {
    'g-date': { value: '16 May 2026', getAttribute: () => '' },
    'f-name': { value: editor.name || '' },
    'f-url': { value: editor.url || '' },
    'f-operator': { value: editor.operator || '' }
  };
  const context = {
    console: { log() {} },
    document: { getElementById: id => elements[id] || null },
    offers: offers || [{}, {}, {}, {}],
    cur
  };
  vm.createContext(context);
  const config = extractBlock('const OPERATOR_CONFIG =', '\nfunction getOperatorLandingUrl')
    .replace('const OPERATOR_CONFIG', 'var OPERATOR_CONFIG');
  const utm = extractBlock('// CLEAN UTM MODULE', '\nconst STANDARD_UTM_LINKS =')
    .replace('const DANDS_OPERATOR_UTM', 'var DANDS_OPERATOR_UTM');
  vm.runInContext(`${config}\n${utm}`, context);
  return { context, elements };
}

function utmContent(url) {
  return new URL(url).searchParams.get('utm_content');
}

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

test('Campaign Pack export rebuilds offer UTMs instead of reusing cached stale values', () => {
  const exportStart = html.indexOf('async function exportCampaignPack()');
  const exportEnd = html.indexOf('\nfunction ', exportStart + 1);
  assert.ok(exportStart >= 0 && exportEnd > exportStart, 'Could not locate exportCampaignPack');
  const exportCampaignPack = html.slice(exportStart, exportEnd);
  assert.match(exportCampaignPack, /utm:\(buildUtmForOffer\(i\)\.url\|\|''\)\.replace/);
  assert.doesNotMatch(exportCampaignPack, /o\._utm\|\|buildUtmForOffer/);
});

test('Google Sheet refresh regenerates all imported offer UTMs before the active-card UTM', () => {
  assert.match(html, /processSheetCSV = function\(csv,status\)\{[\s\S]*?processSheetCSVStable\(csv,status\);[\s\S]*?genAllUtms\(true\);[\s\S]*?genUtm\(\);/);
});
