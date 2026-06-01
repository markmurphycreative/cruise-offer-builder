import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not find ${label}`);
  return match[0];
}

test('Reorder Cards uses a native details disclosure that is collapsed by default', () => {
  const reorderGroup = extract(/<details class="reorder-group"[\s\S]*?<\/details>/, 'Reorder Cards disclosure');
  assert.doesNotMatch(reorderGroup, /<details class="reorder-group"[^>]*\sopen(?:\s|>)/);
  assert.match(reorderGroup, /<summary class="reorder-label">Reorder Cards<span class="section-toggle">▾<\/span><\/summary>/);
});

test('Reorder Cards presents compact accessible arrow controls without changing handlers', () => {
  const reorderGroup = extract(/<details class="reorder-group"[\s\S]*?<\/details>/, 'Reorder Cards disclosure');
  assert.match(reorderGroup, /id="move-left-btn" onclick="moveOfferLeft\(\)" aria-label="Move card left" title="Move card left">◀<\/button>/);
  assert.match(reorderGroup, /id="move-right-btn" onclick="moveOfferRight\(\)" aria-label="Move card right" title="Move card right">▶<\/button>/);
  assert.doesNotMatch(reorderGroup, /Move Left|Move Right/);
});

test('arrow controls retain the shared sidebar button treatment with compact dimensions and deliberate icon weight', () => {
  const buttonRule = extract(/\.reorder-btn\{[^}]+\}/, 'compact reorder button rule');
  assert.match(buttonRule, /width:32px/);
  assert.match(buttonRule, /height:28px/);
  assert.match(buttonRule, /font-size:18px/);
  assert.match(buttonRule, /font-weight:700/);
  assert.match(buttonRule, /display:flex;align-items:center;justify-content:center/);
  assert.match(html, /<button class="abtn reorder-btn" id="move-left-btn"/);
  assert.doesNotMatch(html, /\.abtn\.reorder-btn:hover/);
});

test('reorder logic, drag and drop refresh, and autosave path remain wired through existing functions', () => {
  assert.match(html, /function moveOfferLeft\(\)\{ moveOfferByStep\(-1\); \}/);
  assert.match(html, /function moveOfferRight\(\)\{ moveOfferByStep\(1\); \}/);
  assert.match(html, /function moveOfferByStep\(step\)\{[\s\S]*?moveOfferState\(fromIdx, toIdx\);[\s\S]*?refreshAfterOfferReorder\(\);/);
  assert.match(html, /tab\.addEventListener\('drop',[\s\S]*?moveOfferState\(dragFrom, idx\);[\s\S]*?refreshAfterOfferReorder\(\);/);
  assert.match(html, /function refreshAfterOfferReorder\(\)\{[\s\S]*?queueAutosave\(\);\s*\}/);
});
