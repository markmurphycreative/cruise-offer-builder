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
  assert.match(reorderGroup, /<summary class="reorder-label"><h3><svg class="section-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">[\s\S]*?<\/svg>Reorder Cards<\/h3><span class="section-toggle">▾<\/span><\/summary>/);
});


test('Offer selector and Reorder Cards share the sidebar section stack edges', () => {
  assert.match(html, /\.offer-tabs\{[^}]*margin:5px 9px 0;[^}]*border:1px solid var\(--border\);/);
  assert.match(html, /\.reorder-group\{[^}]*margin:4px 9px 0;[^}]*border:1px solid var\(--border\);[^}]*border-radius:var\(--radius\);/);
  assert.match(html, /\.sb-body\{[^}]*padding:5px 9px 3px;/);
});

test('Reorder Cards disclosure matches normal collapsed section header styling and exposes a list icon', () => {
  const reorderGroup = extract(/<details class="reorder-group"[\s\S]*?<\/details>/, 'Reorder Cards disclosure');
  assert.match(reorderGroup, /<summary class="reorder-label"><h3><svg class="section-icon"[^>]*>[\s\S]*?<path d="M8 6h13"><\/path>[\s\S]*?<\/svg>Reorder Cards<\/h3><span class="section-toggle">▾<\/span><\/summary>/);
  assert.match(html, /\.reorder-label\{[^}]*padding:5px 9px;[^}]*background:var\(--panel\);[^}]*cursor:pointer;[^}]*list-style:none;/);
  assert.match(html, /\.reorder-label h3\{[^}]*font-size:10px;[^}]*font-weight:700;[^}]*text-transform:uppercase;[^}]*letter-spacing:\.08em;[^}]*color:var\(--navy\);[^}]*gap:6px;/);
  assert.match(html, /\.reorder-group\[open\] \.reorder-label\{background:rgba\(160,146,103,\.12\);box-shadow:inset 2px 0 0 var\(--gold\);\}/);
});

test('Reorder Cards presents compact accessible chevron controls without changing handlers', () => {
  const reorderGroup = extract(/<details class="reorder-group"[\s\S]*?<\/details>/, 'Reorder Cards disclosure');
  assert.match(reorderGroup, /id="move-left-btn" onclick="moveOfferLeft\(\)" aria-label="Move card left" title="Move card left"><svg class="section-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"><\/polyline><\/svg><\/button>/);
  assert.match(reorderGroup, /id="move-right-btn" onclick="moveOfferRight\(\)" aria-label="Move card right" title="Move card right"><svg class="section-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"><\/polyline><\/svg><\/button>/);
  assert.doesNotMatch(reorderGroup, /[◀▶]/);
  assert.doesNotMatch(reorderGroup, /Move Left|Move Right/);
});

test('chevron controls retain shared sidebar button treatment and outlined icon weight', () => {
  const buttonRule = extract(/\.reorder-btn\{[^}]+\}/, 'compact reorder button rule');
  assert.match(buttonRule, /width:32px/);
  assert.match(buttonRule, /height:28px/);
  assert.match(buttonRule, /display:flex;align-items:center;justify-content:center/);
  assert.match(html, /\.reorder-btn \.section-icon\{width:16px;height:16px;\}/);
  assert.match(html, /\.section-icon\{[^}]*stroke:currentColor;stroke-width:2;[^}]*fill:none;/);
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
