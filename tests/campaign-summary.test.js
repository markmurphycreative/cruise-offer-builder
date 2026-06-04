import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} to exist`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('campaign summary opens read-only and consumes existing status output', () => {
  const openSummary = extractFunction('openSummary');
  assert.doesNotMatch(openSummary, /\bsave\s*\(/);
  assert.match(openSummary, /getCampaignHealthReviewHtml\(\)/);
  assert.match(openSummary, /isOfferLoaded\(o\)/);
  assert.match(openSummary, /Offer \$\{i\+1\} — Empty/);
});

test('campaign summary offer headers reuse available operator logos without changing no-logo fallbacks', () => {
  const logo = extractFunction('getSummaryOperatorLogoHtml');
  const openSummary = extractFunction('openSummary');
  assert.match(logo, /hasOperatorLogo\(resolvedOffer\)/);
  assert.match(logo, /detectOperatorKey\(o\.operator\)\|\|o\.operator/);
  assert.match(logo, /o\._logoCustom\|\|op\.pngData\|\|op\.svgData/);
  assert.match(logo, /class="summary-offer-logo-wrap"/);
  assert.match(logo, /class="summary-offer-logo"/);
  assert.match(logo, /onerror="this\.parentElement\.remove\(\)"/);
  assert.match(openSummary, /\$\{getSummaryOperatorLogoHtml\(o\)\}/);
  assert.match(openSummary, /Offer \$\{i\+1\} — Empty/);
});

test('campaign summary offer headings are compact and visually prominent', () => {
  assert.match(html, /\.summary-grid\{display:grid;gap:6px;\}/);
  assert.match(html, /\.summary-offer-head\{display:flex;align-items:center;gap:10px;margin-bottom:4px;\}/);
  assert.match(html, /\.summary-offer-logo-wrap\{width:70px;height:40px;[^}]*border-radius:0;[^}]*background:var\(--navy\);/);
  assert.match(html, /\.summary-offer-logo\{display:block;max-width:62px;max-height:32px;width:auto;height:auto;object-fit:contain;/);
  assert.match(html, /\.summary-offer-logo\[src=\"assets\/operator-logos\/po-cruises-logo\.png\"\]\{transform:translateY\(2px\);\}/);
  assert.match(html, /\.summary-offer-title\{font-size:11px;font-weight:800;/);
});

test('campaign summary reuses existing offer readiness status and presents full review fields', () => {
  const details = extractFunction('getSummaryOfferDetails');
  assert.match(details, /getOfferStatus\(i\)==="green"/);
  ['Operator', 'Ship', 'Price', 'Date', 'Duration', 'Board', 'USP', 'Ports', 'Inclusions', 'Price basis', 'Destination URL', 'Hero image', 'UTM', 'Export readiness'].forEach(label => {
    assert.match(details, new RegExp(`\\["${label}"`));
  });
});

test('copied campaign summary includes health and the same expanded offer details', () => {
  const summaryText = extractFunction('getSummaryText');
  assert.match(summaryText, /Campaign Health: \$\{getCampaignHealthReviewText\(\)\}/);
  assert.match(summaryText, /getSummaryOfferDetails\(o,i\)/);
  assert.match(summaryText, /Offer \$\{i\+1\} — Empty/);
});

test('campaign summary footer remains a review and copy surface without a direct TXT download', () => {
  const modalStart = html.indexOf('<div class="modal-overlay" id="summary-modal"');
  const modalEnd = html.indexOf('</div>\n\n<script>', modalStart);
  assert.notEqual(modalStart, -1, 'Expected Campaign Summary modal to exist');
  assert.notEqual(modalEnd, -1, 'Expected Campaign Summary modal boundary to exist');
  const modal = html.slice(modalStart, modalEnd);
  assert.match(modal, /copySummary\(\)">Copy Campaign Summary/);
  assert.match(modal, /copyAllUtms\(\)">Copy All UTMs/);
  assert.match(modal, /closeModal\('summary-modal'\)">Close/);
  assert.doesNotMatch(modal, /Download Summary TXT|downloadSummaryTxt/);
  assert.doesNotMatch(html, /function downloadSummaryTxt\(/);
});

test('campaign pack export continues to generate summary/campaign-summary.txt', () => {
  const exportCampaignPack = extractFunction('exportCampaignPack');
  assert.match(exportCampaignPack, /const summaryFolder=zip\.folder\('summary'\)/);
  assert.match(exportCampaignPack, /summaryFolder\.file\('campaign-summary\.txt'/);
  assert.match(exportCampaignPack, /summaryFolder\.file\('utm_lookup\.csv', buildUtmLookupCsv\(utmLookupRows\)\)/);
});


function extractOperatorHeaders() {
  const headers = html.match(/const OPERATOR_HEADERS = \{[\s\S]*?\n\};/)?.[0];
  assert.ok(headers, 'Expected the existing operator header data to exist');
  return headers.replace('const OPERATOR_HEADERS =', 'OPERATOR_HEADERS =');
}

function renderSummaryLogo(operator) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractOperatorHeaders(), context);
  context.detectOperatorKey = value => Object.entries(context.OPERATOR_HEADERS)
    .find(([key, config]) => key === value || config.name === value)?.[0] || '';
  vm.runInContext([
    extractFunction('summaryDisplay'),
    extractFunction('summaryHtml'),
    extractFunction('hasOperatorLogo'),
    extractFunction('getSummaryOperatorLogoHtml')
  ].join('\n'), context);
  return context.getSummaryOperatorLogoHtml({ operator });
}

test('campaign summary renders existing logo assets for every supported loaded cruise operator', () => {
  const operators = [
    'Ambassador Cruise Line',
    'Norwegian Cruise Line',
    'Virgin Voyages',
    'P&O Cruises',
    'Marella Cruises',
    'Royal Caribbean',
    'Fred. Olsen Cruise Lines',
    'Cunard',
    'Celebrity Cruises',
    'MSC Cruises',
    'Princess Cruises'
  ];
  operators.forEach(operator => {
    const logo = renderSummaryLogo(operator);
    assert.match(logo, /class="summary-offer-logo-wrap"/);
    assert.match(logo, /<img class="summary-offer-logo" src="assets\/operator-logos\//);
    const src = logo.match(/src="([^"]+)"/)?.[1];
    assert.ok(src, `Expected ${operator} summary markup to include an asset path`);
    assert.equal(fs.existsSync(new URL(`../${src}`, import.meta.url)), true, `Expected ${operator} logo asset to exist`);
  });
});

test('campaign summary retains a title-only fallback when no operator logo is available', () => {
  assert.equal(renderSummaryLogo('Unknown Cruise Operator'), '');
});

test('campaign summary keeps white or light existing logo assets visible on a compact navy container', () => {
  assert.match(html, /\.summary-offer-logo-wrap\{[^}]*background:var\(--navy\);/);
  assert.match(renderSummaryLogo('P&O Cruises'), /^<span class="summary-offer-logo-wrap"><img class="summary-offer-logo"/);
});
