import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractSummaryAction() {
  const start = html.indexOf('<div class="summary-action">');
  const end = html.indexOf('<div class="section campaign-library-section"', start);
  assert.notEqual(start, -1, 'Expected Campaign Summary action to exist');
  assert.notEqual(end, -1, 'Expected Campaign Summary action boundary to exist');
  return html.slice(start, end);
}

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

const summaryAction = extractSummaryAction();

test('Summary accordion no longer renders', () => {
  assert.doesNotMatch(html, /<div class="section summary-section"/);
  assert.doesNotMatch(summaryAction, /<div class="section-hdr[^>]*onclick="toggleSec\(this\)"/);
  assert.doesNotMatch(summaryAction, /<h3>[\s\S]*Summary[\s\S]*<\/h3><span class="section-toggle">▾<\/span>/);
  assert.doesNotMatch(summaryAction, /section-body hidden/);
});

test('single Campaign Summary button renders in place of the Summary section', () => {
  assert.match(summaryAction, /^<div class="summary-action">\n\s*<button class="abtn navy" id="open-summary-btn" type="button" onclick="openSummary\(\)">Campaign Summary<\/button>\n\s*<\/div>\n\n\s*$/);
  assert.equal((summaryAction.match(/<button\b/g) || []).length, 1);
  assert.doesNotMatch(summaryAction, /Open Summary|Reset Offer|resetOffer\(\)/);
});

test('Campaign Summary button opens the existing Campaign Summary modal', () => {
  assert.match(html, /<div class="modal-overlay" id="summary-modal"/);
  assert.match(html, /<h2 id="summary-title">Campaign Summary<\/h2>/);
  const openSummary = extractFunction('openSummary');
  assert.match(openSummary, /document\.getElementById\("summary-modal"\)/);
  assert.match(openSummary, /document\.getElementById\("summary-content"\)/);
  assert.match(openSummary, /content\.innerHTML=html;/);
  assert.match(openSummary, /modal\.classList\.add\("active"\);/);
});

test('existing Campaign Summary functionality remains unchanged', () => {
  const modalStart = html.indexOf('<div class="modal-overlay" id="summary-modal"');
  const modalEnd = html.indexOf('<!-- Export Readiness Modal -->', modalStart);
  const modal = html.slice(modalStart, modalEnd);
  assert.match(modal, /copySummary\(\)">Copy Campaign Summary/);
  assert.match(modal, /copyAllUtms\(\)">Copy All UTMs/);
  const openSummary = extractFunction('openSummary');
  assert.match(openSummary, /getCampaignHealthReviewHtml\(\)/);
  assert.match(openSummary, /isOfferLoaded\(o\)/);
  assert.match(openSummary, /Offer \$\{i\+1\} — Empty/);
});

test('Reset Offer function remains available but is not rendered in the summary action', () => {
  const resetOffer = extractFunction('resetOffer');
  assert.match(resetOffer, /title:"Reset Offer\?"/);
  assert.doesNotMatch(summaryAction, /resetOffer\(\)/);
});

test('sticky Save Campaign remains wired to existing campaign save behaviour', () => {
  assert.match(html, /<div class="sb-actions">[\s\S]*<button class="abtn gold" type="button" onclick="saveCampaignFile\(\)">Save Campaign<\/button>/);
  const saveCampaignFile = extractFunction('saveCampaignFile');
  assert.match(saveCampaignFile, /const fileName=buildCampaignFilename\(\);/);
  assert.match(saveCampaignFile, /const payload=buildCampaignFilePayload\(\);/);
  assert.match(saveCampaignFile, /showSessionFeedback\("Campaign saved",false\);/);
  assert.match(saveCampaignFile, /addCampaignHistoryEntry\(buildCampaignHistoryEntryFromPayload\(payload, "saved"\)\);/);
});
