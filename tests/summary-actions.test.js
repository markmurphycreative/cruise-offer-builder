import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractSummarySection() {
  const start = html.indexOf('<div class="section summary-section"');
  const end = html.indexOf('<div class="section campaign-library-section"', start);
  assert.notEqual(start, -1, 'Expected Summary section to exist');
  assert.notEqual(end, -1, 'Expected Summary section boundary to exist');
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

const summarySection = extractSummarySection();

test('summary actions no longer render redundant Save Project or Reset All buttons', () => {
  assert.doesNotMatch(summarySection, />Save Project<|saveProjectFile\(\)/);
  assert.doesNotMatch(summarySection, />Reset All<|resetAll\(\)/);
});

test('summary actions keep Open Summary and Reset Offer controls', () => {
  assert.match(summarySection, /<button class="abtn navy" id="open-summary-btn" onclick="openSummary\(\)">Open Summary<\/button>/);
  assert.match(summarySection, /<button class="abtn" onclick="resetOffer\(\)">Reset Offer<\/button>/);
});

test('Open Summary still opens the existing Campaign Summary modal', () => {
  assert.match(html, /<div class="modal-overlay" id="summary-modal"/);
  assert.match(html, /<h2 id="summary-title">Campaign Summary<\/h2>/);
  const openSummary = extractFunction('openSummary');
  assert.match(openSummary, /document\.getElementById\("summary-modal"\)/);
  assert.match(openSummary, /document\.getElementById\("summary-content"\)/);
  assert.match(openSummary, /content\.innerHTML=html;/);
  assert.match(openSummary, /modal\.classList\.add\("active"\);/);
});

test('Reset Offer still clears only the selected offer after confirmation', () => {
  const resetOffer = extractFunction('resetOffer');
  assert.match(resetOffer, /title:"Reset Offer\?"/);
  assert.match(resetOffer, /confirmLabel:"Reset Offer"/);
  assert.match(resetOffer, /offers\[cur\]=\{\}/);
  assert.doesNotMatch(resetOffer, /offers=\[\{\},\{\},\{\},\{\}\]/);
  assert.doesNotMatch(resetOffer, /lockedOffers=\[false,false,false,false\]/);
});

test('sticky Save Campaign remains wired to existing campaign save behaviour', () => {
  assert.match(html, /<div class="sb-actions">[\s\S]*<button class="abtn gold" type="button" onclick="saveCampaignFile\(\)">Save Campaign<\/button>/);
  const saveCampaignFile = extractFunction('saveCampaignFile');
  assert.match(saveCampaignFile, /const fileName=buildCampaignFilename\(\);/);
  assert.match(saveCampaignFile, /const payload=buildCampaignFilePayload\(\);/);
  assert.match(saveCampaignFile, /showSessionFeedback\("Campaign saved",false\);/);
  assert.match(saveCampaignFile, /addCampaignHistoryEntry\(buildCampaignHistoryEntryFromPayload\(payload, "saved"\)\);/);
});
