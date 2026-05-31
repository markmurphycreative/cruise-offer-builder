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
