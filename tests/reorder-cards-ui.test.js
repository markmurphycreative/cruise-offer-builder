import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not find ${label}`);
  return match[0];
}

test('Offer selector, Reorder Cards and scrolling section stack share the sidebar content edges', () => {
  assert.match(html, /\.sidebar\{--sidebar-content-inset:9px;--sidebar-scrollbar-width:3px;--sidebar-content-right-inset:calc\(var\(--sidebar-content-inset\) \+ var\(--sidebar-scrollbar-width\)\);/);
  assert.match(html, /\.offer-tabs\{[^}]*margin:5px var\(--sidebar-content-right-inset\) 0 var\(--sidebar-content-inset\);[^}]*border:1px solid var\(--border\);/);
  assert.match(html, /\.reorder-group\{[^}]*margin:5px var\(--sidebar-content-right-inset\) 0 var\(--sidebar-content-inset\);[^}]*border:1px solid var\(--border\);[^}]*border-radius:var\(--radius\);/);
  assert.match(html, /\.sb-body\{[^}]*scrollbar-gutter:stable;[^}]*padding:5px var\(--sidebar-content-inset\) 3px;/);
  assert.match(html, /\.sb-body::-webkit-scrollbar\{width:var\(--sidebar-scrollbar-width\);/);
});

test('Reorder Cards header matches compact panel styling and exposes a list icon', () => {
  const reorderGroup = extract(/<div class="reorder-group">[\s\S]*?\n  <\/div>/, 'Reorder Cards panel');
  assert.match(reorderGroup, /<div class="reorder-label"><h3><svg class="section-icon"[^>]*>[\s\S]*?<path d="M8 6h13"><\/path>[\s\S]*?<\/svg>Reorder Cards<\/h3><div class="reorder-actions"/);
  assert.match(html, /\.reorder-label\{[^}]*padding:5px 9px;[^}]*background:var\(--panel\);[^}]*cursor:default;[^}]*list-style:none;/);
  assert.match(html, /\.reorder-label h3\{[^}]*font-size:10px;[^}]*font-weight:400;[^}]*text-transform:uppercase;[^}]*letter-spacing:\.08em;[^}]*color:var\(--navy\);[^}]*gap:6px;/);
});

test('Reorder Cards presents compact accessible chevron controls without changing handlers', () => {
  const reorderGroup = extract(/<div class="reorder-group">[\s\S]*?\n  <\/div>/, 'Reorder Cards panel');
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
  assert.match(html, /\.section-icon\{[^}]*stroke:currentColor;stroke-width:2;[^}]*fill:none;/);
  assert.match(html, /<button class="abtn reorder-btn" id="move-left-btn"/);
  assert.match(html, /\.reorder-btn\.abtn:hover:not\(:disabled\)\{[^}]*color:var\(--navy\);/);
});

test('reorder logic, drag and drop refresh, and autosave path remain wired through existing functions', () => {
  assert.match(html, /function moveOfferLeft\(\)\{ moveOfferByStep\(-1\); \}/);
  assert.match(html, /function moveOfferRight\(\)\{ moveOfferByStep\(1\); \}/);
  assert.match(html, /function moveOfferByStep\(step\)\{[\s\S]*?moveOfferState\(fromIdx, toIdx\);[\s\S]*?refreshAfterOfferReorder\(\);/);
  assert.match(html, /tab\.addEventListener\('drop',[\s\S]*?moveOfferState\(dragFrom, idx\);[\s\S]*?refreshAfterOfferReorder\(\);/);
  assert.match(html, /function refreshAfterOfferReorder\(\)\{[\s\S]*?queueAutosave\(\);\s*\}/);
});
