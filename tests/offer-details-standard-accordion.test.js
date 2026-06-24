import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractOfferDetailsSection() {
  const start = html.indexOf('<!-- ── 4. OFFER DETAILS ── -->');
  const end = html.indexOf('<!-- ── 6. MULTI OFFER IMPORT ── -->');
  assert.notEqual(start, -1, 'Expected Offer Details section to exist');
  assert.notEqual(end, -1, 'Expected Offer Details section boundary to exist');
  return html.slice(start, end);
}

const offerDetailsSection = extractOfferDetailsSection();

test('Offer Details remains a normal in-builder accordion without a detached launch action', () => {
  assert.match(offerDetailsSection, /<div class="section-hdr collapsed" onclick="toggleSec\(this\)">/);
  assert.match(offerDetailsSection, /<h3><svg class="section-icon"[\s\S]*?<\/svg>Offer Details<\/h3><span class="section-toggle">▾<\/span>/);
  assert.match(offerDetailsSection, /<div class="section-body hidden">/);
  assert.doesNotMatch(offerDetailsSection, /detached-offer-details-btn|openDetachedOfferDetailsWindow|Open Offer Details in new window/);
});

test('detached Offer Details code paths and styles are removed', () => {
  assert.doesNotMatch(html, /getDetachedOfferDetailsWindowHtml|getOfferDetailsHtml|getOfferDetailsRows|getOfferDetailsWindowTitle/);
  assert.doesNotMatch(html, /syncDetachedOfferDetailsWindow|detachedOfferDetailsWindow|openDetachedOfferDetailsWindow/);
  assert.doesNotMatch(html, /detached-offer|offer-details-detached|Detached Offer Details|detached Offer Details inspector/);
});
