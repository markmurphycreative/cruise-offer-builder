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

function extractOfferDetailsSection() {
  const start = html.indexOf('<div class="section" data-section-key="offer-details">');
  const end = html.indexOf('<!-- ── CTA ASSETS ── -->', start);
  assert.notEqual(start, -1, 'Expected Offer Details section to exist');
  assert.notEqual(end, -1, 'Expected Offer Details section boundary to exist');
  return html.slice(start, end);
}

const offerDetailsSection = extractOfferDetailsSection();

test('Offer Details keeps accordion header behaviour while adding detached launch action', () => {
  assert.match(offerDetailsSection, /<div class="section-hdr collapsed" onclick="toggleSec\(this\)">/);
  assert.match(offerDetailsSection, /<h3><svg class="section-icon"[\s\S]*?<\/svg>Offer Details<\/h3>/);
  assert.match(offerDetailsSection, /class="detached-offer-details-btn"[^>]+role="button"[^>]+onclick="event\.stopPropagation\(\);openDetachedOfferDetailsWindow\(\);"/);
  assert.match(offerDetailsSection, /<svg class="manage-campaigns-launch-icon"[\s\S]*?<\/svg>/);
  assert.match(offerDetailsSection, /<span class="section-toggle">▾<\/span>/);
  assert.match(offerDetailsSection, /<div class="section-body hidden">/);
});

test('Offer Details detached window uses shared sizing, read-only renderer, and duplicate-window guard', () => {
  const renderer = extractFunction('getOfferDetailsHtml');
  const detachedHtml = extractFunction('getDetachedOfferDetailsWindowHtml');
  const openDetached = extractFunction('openDetachedOfferDetailsWindow');
  const syncDetached = extractFunction('syncDetachedOfferDetailsWindow');

  assert.match(renderer, /offers\[cur\]/);
  assert.match(renderer, /getOfferDetailsRows\(offer,cur\)/);
  assert.doesNotMatch(detachedHtml, /<input|<textarea|contenteditable|localStorage/);
  assert.match(detachedHtml, /detached-offer-head/);
  assert.match(detachedHtml, /border-bottom:3px solid var\(--gold\)/);
  assert.match(detachedHtml, /function refreshOfferDetails\(\)/);
  assert.match(detachedHtml, /window\.opener\.getOfferDetailsHtml\(\)/);
  assert.match(openDetached, /detachedOfferDetailsWindow&&!detachedOfferDetailsWindow\.closed/);
  assert.match(openDetached, /window\.open\("","offer-details-detached",features\)/);
  assert.match(openDetached, /popup=yes,width=920,height=760,resizable=yes,scrollbars=yes/);
  assert.match(openDetached, /detachedOfferDetailsWindow=detached/);
  assert.match(openDetached, /beforeunload/);
  assert.match(syncDetached, /if\(!detachedOfferDetailsWindow\) return;/);
  assert.match(syncDetached, /detachedOfferDetailsWindow=null;/);
  assert.match(syncDetached, /getElementById\('detached-offer-details-content'\)/);
  assert.match(syncDetached, /content\.innerHTML=getOfferDetailsHtml\(\);/);
  assert.match(syncDetached, /getOfferDetailsWindowTitle\(\)/);
});

test('Offer Details detached inspector is wrapped into existing refresh paths', () => {
  assert.match(html, /Keep the detached Offer Details inspector live-synced/);
  [
    'loadOfferToEditor',
    'load',
    'rv',
    'sv',
    'up',
    'processSheetCSV',
    'applySessionPayload',
    'restoreCampaignHistorySnapshot',
    'restoreCampaignFilePayload',
    'refreshAfterRestore',
    'refreshAfterOfferReorder',
    'setOfferLocked',
    'toggleHeroImageLock'
  ].forEach(fnName => {
    assert.match(html, new RegExp(`"${fnName}"`));
  });
});
