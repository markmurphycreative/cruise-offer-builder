import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not find ${label}`);
  return match[0];
}

test('Offer selector, Arrange Cards and scrolling section stack share the sidebar content edges', () => {
  assert.match(html, /\.sidebar\{--sidebar-content-inset:9px;--sidebar-scrollbar-width:3px;--sidebar-content-right-inset:calc\(var\(--sidebar-content-inset\) \+ var\(--sidebar-scrollbar-width\)\);/);
  assert.match(html, /\.offer-tabs\{[^}]*margin:0 var\(--sidebar-content-right-inset\) 0 var\(--sidebar-content-inset\);[^}]*border:1px solid var\(--border\);/);
  assert.match(html, /\.reorder-group\{[^}]*margin:2px var\(--sidebar-content-right-inset\) 1px var\(--sidebar-content-inset\);[^}]*border:1px solid var\(--border\);[^}]*background:var\(--surface-subtle\);/);
  assert.match(html, /\.sb-body\{[^}]*scrollbar-gutter:stable;[^}]*padding:1px var\(--sidebar-content-inset\) 4px;/);
  assert.match(html, /\.sb-body::-webkit-scrollbar\{width:var\(--sidebar-scrollbar-width\);/);
  assert.match(html, /<div class="sidebar-section-label offer-status-label">Offer Status<\/div>/);
  assert.match(html, /<div class="sidebar-section-label">Import<\/div>/);
  assert.match(html, /<div class="sidebar-section-label">Assets<\/div>/);
  assert.match(html, /<div class="sidebar-section-label">Utilities<\/div>/);
  assert.match(html, /<div class="sidebar-section-label">Campaign Details<\/div>/);
  const order = [
    '>Campaign Details<',
    'offer-status-label">Offer Status',
    '>Import<',
    '>Assets<',
    '>Utilities<'
  ].map(marker => html.indexOf(marker));
  assert.deepEqual(order.every(index => index >= 0), true);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('Arrange Cards restores the persistent compact control instead of a modal trigger', () => {
  const reorderGroup = extract(/<div class="reorder-group" aria-label="Arrange Cards controls">[\s\S]*?\n  <\/div>/, 'Arrange Cards quick control');
  assert.match(reorderGroup, /<div class="reorder-title"><svg class="section-icon"[^>]*>[\s\S]*?<path d="M8 6h13"><\/path>[\s\S]*?<\/svg><span>Arrange Cards<\/span><\/div>/);
  assert.match(reorderGroup, /<div class="reorder-actions"/);
  assert.doesNotMatch(reorderGroup, /section-hdr|section-body|section-toggle|toggleSec|data-section-key="reorder-cards"/);
  assert.match(html, /<div class="offer-context-label empty-hidden" id="active-offer-label"[\s\S]*?<!-- ── REORDER CARDS ── -->[\s\S]*?<div class="sb-body">/);
  assert.match(html, /\.reorder-title\{[^}]*font-size:10px;[^}]*text-transform:none;[^}]*color:var\(--navy\);/);
});

test('Arrange Cards retains its original compact instant step controls', () => {
  const reorderGroup = extract(/<div class="reorder-group" aria-label="Arrange Cards controls">[\s\S]*?\n  <\/div>/, 'Arrange Cards quick control');
  assert.match(reorderGroup, /id="move-left-btn" onclick="moveOfferLeft\(\)" aria-label="Move card left" title="Move card left"><svg class="section-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"><\/polyline><\/svg><\/button>/);
  assert.match(reorderGroup, /id="move-right-btn" onclick="moveOfferRight\(\)" aria-label="Move card right" title="Move card right"><svg class="section-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"><\/polyline><\/svg><\/button>/);
  assert.doesNotMatch(reorderGroup, /[◀▶]/);
  assert.doesNotMatch(reorderGroup, /Move Left|Move Right/);
});

test('chevron controls retain shared sidebar button treatment and outlined icon weight', () => {
  const buttonRule = extract(/\.reorder-btn\{[^}]+\}/, 'compact reorder button rule');
  assert.match(buttonRule, /flex:0 0 20px/);
  const buttonVisualRule = extract(/\.reorder-btn\.abtn\{[^}]+\}/, 'compact reorder button visual rule');
  assert.match(buttonVisualRule, /width:20px/);
  assert.match(buttonVisualRule, /height:18px/);
  assert.match(buttonVisualRule, /display:flex;align-items:center;justify-content:center/);
  assert.match(buttonVisualRule, /color:rgba\(14,27,42,\.68\)/);
  assert.match(html, /\.reorder-btn \.section-icon\{width:12px;height:12px;stroke-width:2;\}/);
  assert.match(html, /\.section-icon\{[^}]*stroke:currentColor;stroke-width:1\.95;[^}]*fill:none;/);
  assert.match(html, /<button class="abtn reorder-btn" id="move-left-btn"/);
  assert.match(html, /\.reorder-btn\.abtn:hover:not\(:disabled\)\{[^}]*color:var\(--green\);[^}]*cursor:pointer/);
});

test('reorder logic, drag and drop refresh, and autosave path remain wired through existing functions', () => {
  assert.match(html, /function moveOfferLeft\(\)\{ moveOfferByStep\(-1\); \}/);
  assert.match(html, /function moveOfferRight\(\)\{ moveOfferByStep\(1\); \}/);
  assert.match(html, /function moveOfferByStep\(step\)\{[\s\S]*?moveOfferState\(fromIdx, toIdx\);/);
  assert.match(html, /tab\.addEventListener\('drop',[\s\S]*?moveOfferState\(dragFrom, idx\);/);
  assert.match(html, /function refreshAfterOfferReorder\(\)\{[\s\S]*?queueAutosave\(\{immediate:true\}\);/);
});

test('replacement confirmation modal is removed so the established instant workflow remains primary', () => {
  assert.doesNotMatch(html, /id="arrange-cards-modal"|openArrangeCardsModal|confirmArrangeCards|Confirm Order/);
  assert.match(html, /function moveOfferState\(fromIdx, toIdx\)\{[\s\S]*?offers\.splice\(fromIdx, 1\)[\s\S]*?lockedOffers\.splice\(fromIdx, 1\)[\s\S]*?(?:if\(typeof refreshAfterOfferReorder==="function"\) )?refreshAfterOfferReorder\(\);/);
});

test('authoritative reorder refreshes all tracking and persistence dependencies only after state moves', () => {
  assert.match(html, /function refreshAfterOfferReorder\(\)\{[\s\S]*?syncOfferSelector\(\)[\s\S]*?genUtm\(\)[\s\S]*?genAllUtms\(true\)[\s\S]*?genStandardUtms\(\)[\s\S]*?updateAllStatus\(\)[\s\S]*?updateExportFilenames\(\)[\s\S]*?renderPreviewMode\(true\)[\s\S]*?recordCampaignHistoryAfterAsyncChange[\s\S]*?queueAutosave\(\{immediate:true\}\)/);
  assert.doesNotMatch(html, /moveOfferState\(fromIdx, toIdx\);\s*refreshAfterOfferReorder/);
  assert.doesNotMatch(html, /moveOfferState\(dragFrom, idx\);\s*refreshAfterOfferReorder/);
});
