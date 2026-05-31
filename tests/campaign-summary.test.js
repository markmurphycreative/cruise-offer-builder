import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

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
  assert.match(logo, /hasOperatorLogo\(o\)/);
  assert.match(logo, /o\._logoCustom\|\|op\.pngData\|\|op\.svgData/);
  assert.match(logo, /class="summary-offer-logo"/);
  assert.match(logo, /onerror="this\.remove\(\)"/);
  assert.match(openSummary, /\$\{getSummaryOperatorLogoHtml\(o\)\}/);
  assert.match(openSummary, /Offer \$\{i\+1\} — Empty/);
});

test('campaign summary offer headings are compact and visually prominent', () => {
  assert.match(html, /\.summary-grid\{display:grid;gap:6px;\}/);
  assert.match(html, /\.summary-offer-head\{display:flex;align-items:center;gap:7px;margin-bottom:4px;\}/);
  assert.match(html, /\.summary-offer-logo\{width:32px;height:20px;/);
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
});
