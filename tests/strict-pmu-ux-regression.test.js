import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('preview toolbar has restrained active mode styling and always-visible zoom reset control', () => {
  assert.match(html, /<div class="toolbar-group toolbar-group-zoom">\s*<input type="range" min="-100" max="100" value="0" oninput="setZoomFromSlider\(this\.value\)" id="zoom-slider" aria-label="Preview zoom adjustment">\s*<span class="pval" id="zoom-val" aria-live="polite" onclick="beginZoomInputEdit\(\)">0<\/span>/);
  assert.match(html, /<div class="toolbar-group toolbar-group-utility">[\s\S]*?<button class="zoom-reset" id="zoom-reset" type="button" onclick="resetPreviewZoom\(\)"[\s\S]*?<button class="vbtn utility-home" id="vb-home" onclick="returnHomeFromBuilder\(\)">[\s\S]*?<svg class="home-icon"/);
  assert.match(html, /<div class="toolbar-group view-btns">[\s\S]*?Single[\s\S]*?Email[\s\S]*?All 4/);
  assert.match(html, /<div class="toolbar-group toolbar-group-actions">[\s\S]*?New Campaign[\s\S]*?Shortcuts/);
  assert.match(html, /\.view-btns\{[^}]*border:0;[^}]*background:var\(--navy\);/);
  assert.match(html, /\.vbtn\.active\{color:#fff;font-weight:300;text-shadow:none;\}/);
  assert.match(html, /\.vbtn\.active::after\{opacity:1;transform:scaleX\(1\);\}/);
  assert.match(html, /\.zoom-input-wrap\{display:none;[^}]*background:transparent;[^}]*border:0;[^}]*border-radius:0;/);
  assert.match(html, /\.zoom-input-wrap\.editing\{display:inline-flex;\}/);
  assert.match(html, /\.zoom-reset\{display:inline-flex;[^}]*background:transparent;[^}]*color:#fff;[^}]*font-weight:300;/);
  assert.match(html, /\.zoom-reset\.visible\{display:inline-flex;\}/);
  assert.match(html, /function updatePreviewZoomControls\(\)\{[\s\S]*?if\(label\) label\.textContent=relative;[\s\S]*?if\(input && document\.activeElement !== input\) input\.value=relative;[\s\S]*?if\(reset\) reset\.classList\.add\("visible"\);[\s\S]*?\}/);
  assert.match(html, /function resetPreviewZoom\(\)\{[\s\S]*?setZoom\(getDefaultPreviewZoom\(\)\);[\s\S]*?wrap\.scrollTo\(\{top:0,behavior:'auto'\}\);[\s\S]*?\}/);
});

test('UTM current card selected state is visibly stronger than inactive cards', () => {
  assert.match(html, /\.utm-current-card\{--utm-operator-accent:var\(--gold\);--utm-operator-tint:rgba\(158,147,108,\.14\);\}/);
  assert.match(html, /\.utm-offer-card\.utm-current-card\{[^}]*border-color:rgba\(158,147,108,\.72\);[^}]*box-shadow:/);
  assert.match(html, /\.utm-offer-card\.utm-current-card \.utm-context-id strong,\.utm-offer-card\.utm-current-card \.utm-context-id span\{color:var\(--navy\);font-weight:800;\}/);
});

test('keyboard shortcut guard blocks standard editable controls and contenteditable states', () => {
  assert.match(html, /function isShortcutBlockedTarget\(target\)\{[\s\S]*?if\(target\.isContentEditable\) return true;[\s\S]*?target\.closest\('input,textarea,select,\[contenteditable\]'\)[\s\S]*?\[contenteditable="true"\][\s\S]*?\[contenteditable="plaintext-only"\]/);
});


test('New Campaign uses a floating editorial type menu without panel chrome', () => {
  assert.match(html, /<span class="new-campaign-wrap"><button class="toolbar-action new-campaign-trigger" id="new-campaign-trigger" type="button" onclick="toggleNewCampaignMenu\(event\)" aria-haspopup="menu" aria-expanded="false">New Campaign<\/button><\/span>/);
  assert.match(html, /<div class="new-campaign-menu" id="new-campaign-menu" role="menu" aria-labelledby="new-campaign-trigger" onmouseleave="closeNewCampaignMenu\(\)">\s*<button class="new-campaign-menu-item" type="button" role="menuitem" data-campaign-type="cruise" onclick="selectNewCampaignType\(event\)">Cruise<\/button>\s*<button class="new-campaign-menu-item" type="button" role="menuitem" data-campaign-type="package" onclick="selectNewCampaignType\(event\)">Package<\/button>\s*<button class="new-campaign-menu-item" type="button" role="menuitem" data-campaign-type="touring" onclick="selectNewCampaignType\(event\)">Touring<\/button>\s*<button class="new-campaign-menu-item" type="button" role="menuitem" data-campaign-type="worldwide" onclick="selectNewCampaignType\(event\)">Worldwide<\/button>/);
  assert.match(html, /\.preview-toolbar\{[^}]*overflow:visible;/);
  assert.match(html, /\.new-campaign-menu\{position:fixed;[^}]*background:transparent;[^}]*border:0;[^}]*border-radius:0;[^}]*box-shadow:none;/);
  assert.match(html, /\.new-campaign-menu-item\.over-header\{--new-campaign-item-color:var\(--text-inverse\);\}/);
  assert.match(html, /\.new-campaign-menu-item\.over-workspace\{--new-campaign-item-color:var\(--text\);\}/);
  assert.match(html, /\.new-campaign-menu-item:hover,\.new-campaign-menu-item:focus-visible\{color:#9e936c;outline:0;\}/);
  assert.match(html, /function positionNewCampaignMenu\(\)\{[\s\S]*?menu\.style\.left=`\$\{rect\.left\}px`;[\s\S]*?menu\.style\.top=`\$\{rect\.bottom \+ 20\}px`;[\s\S]*?item\.classList\.toggle\("over-header",midpoint<headerBottom\);[\s\S]*?item\.classList\.toggle\("over-workspace",midpoint>=headerBottom\);[\s\S]*?\}/);
  assert.match(html, /function selectNewCampaignType\(event\)\{[\s\S]*?newCampaign\(type\);[\s\S]*?\}/);
  assert.match(html, /function newCampaign\(type=currentCampaignType\)\{\s*const campaignType=normaliseCampaignType\(type\);\s*const startFresh=\(\)=>resetBuilderToFreshSession\(campaignType\);/);
});

test('responsive toolbar constrains controls inside the preview header', () => {
  assert.match(html, /\.preview-toolbar\{[^}]*flex-wrap:nowrap;[^}]*overflow:visible;[^}]*max-width:100%;[^}]*box-sizing:border-box;/);
  assert.match(html, /\.preview-title\{[^}]*flex:1 1 120px;[^}]*min-width:86px;/);
  assert.match(html, /\.toolbar-groups\{[^}]*flex:0 1 auto;[^}]*min-width:0;[^}]*max-width:100%;/);
  assert.match(html, /\.toolbar-group-zoom input\[type=range\]\{[^}]*width:clamp\(52px,7vw,86px\);/);
});

test('All 4 preview measures pane dimensions and fits centred grid after render and resize', () => {
  assert.match(html, /const ALL_PREVIEW_MAX_SCALE = 0\.68;/);
  assert.match(html, /function getAllPreviewGridMetrics\(offerCount\)\{[\s\S]*?columns = count <= 1 \? 1 : 2;[\s\S]*?rows = count <= 0 \? 1 : Math\.ceil\(count \/ columns\);[\s\S]*?canvasWidth:[\s\S]*?canvasHeight:/);
  assert.match(html, /function applyAllPreviewLayout\(stage, canvas, metrics, pane\)\{[\s\S]*?stage\.style\.width = Math\.floor\(metrics\.canvasWidth \* scale\) \+ 'px';[\s\S]*?stage\.style\.height = Math\.floor\(metrics\.canvasHeight \* scale\) \+ 'px';[\s\S]*?canvas\.style\.transformOrigin = 'top left';/);
  assert.match(html, /className = 'all-preview-stage'/);
  assert.match(html, /className = 'all-preview-canvas'/);
  assert.match(html, /grid\.style\.gridTemplateColumns = Array\(metrics\.columns\)\.fill\(metrics\.cardWidth \+ 'px'\)\.join\(' '\);/);
  assert.match(html, /loadedPreviewOffers\.length === 3 && loadedIndex === 2 \? 'grid-column:1 \/ -1;justify-self:center;'/);
  assert.match(html, /new ResizeObserver\(function\(\)\{ scheduleAllPreviewLayout\(\); \}\)/);
});

test('card-facing cleanup strips decorative emoji but preserves currency and punctuation', () => {
  assert.match(html, /function cleanCardFieldValue\(value\)\{/);
  assert.match(html, /\["name","subtitle","date","nights","ports","incl","sailingFrom","departurePort","ship","tags","board","boardlbl","basis","day","month","_poaDepartureAirport","flyingFrom"\]/);
  assert.match(html, /function renderCardHTML\(d\)\{\n  d=cleanCardFacingOfferData\(d\);/);
  assert.match(html, /[^\n]*£\$€/);
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const match = script.match(/function cleanCardFieldValue\(value\)\{[\s\S]*?\n\}/);
  assert.ok(match);
  const fn = new Function(`${match[0]}; return cleanCardFieldValue;`)();
  assert.equal(fn('🚢 12-Night Cruise'), '12-Night Cruise');
  assert.equal(fn('⚓ Departs Newcastle'), 'Departs Newcastle');
  assert.equal(fn('🌟 From £1,355 per person'), 'From £1,355 per person');
  assert.equal(fn('📍 Tromsø, Norway'), 'Tromsø, Norway');
  assert.equal(fn('✨ Save 10% & more'), 'Save 10% & more');
});
