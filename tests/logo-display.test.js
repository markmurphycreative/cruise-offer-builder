import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not locate ${label}`);
  return match[0];
}

function renderHeader(offer) {
  const source = [
    extract(/function getOperatorSkin\(d\)\{[\s\S]*?\n\}/, 'getOperatorSkin'),
    extract(/function getHeaderHTML\(d\)\{[\s\S]*?\n\}/, 'getHeaderHTML')
  ].join('\n');
  const context = {
    OPERATOR_SKINS: { po: { background: '#123456', accentStrip: '#abcdef' } },
    OPERATOR_HEADERS: { po: { name: 'P&O Cruises', pngData: 'assets/operator-logos/po-cruises-logo.png', color: '#9e936c' } },
    OPERATOR_USP_PRESETS: { po: 'Preset USP' }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.getHeaderHTML(offer);
}

test('the operator section exposes the three logo display choices with operator logo first', () => {
  const select = html.match(/<select id="f-logo-display"[\s\S]*?<\/select>/)?.[0];
  assert.ok(select, 'Logo Display select should exist');
  assert.match(select, /<option value="operator">Operator Logo<\/option>[\s\S]*<option value="dands">Dawson &amp; Sanderson<\/option>[\s\S]*<option value="none">No Logo<\/option>/);
  assert.doesNotMatch(select, /selected/);
});

test('the visible autosave badge is hidden without removing autosave logic', () => {
  assert.match(html, /<span class="autosave-status" id="autosave-status" aria-live="polite" hidden>/);
  assert.match(html, /function queueAutosave\(\)/);
  assert.match(html, /setTimeout\(saveSessionNow, 420\)/);
});

test('logo display mode is saved and restored per offer with an operator-logo default', () => {
  assert.match(html, /offers\[cur\]\._logoDisplay=logoDisplay\.value\|\|["']operator["']/);
  assert.match(html, /logoDisplay\.value = o\._logoDisplay \|\| 'operator'/);
  assert.match(html, /base\._logoDisplay = logoDisplay\.value \|\| 'operator'/);
});

test('CSV-loaded cards explicitly default to operator logo', () => {
  assert.match(html, /const newOffer=\{[\s\S]*?_logoDisplay: "operator",[\s\S]*?name:/);
});

test('the Dawson & Sanderson PNG asset is available', () => {
  assert.equal(fs.existsSync(new URL('../assets/operator-logos/dawson-and-sanderson-logo.png', import.meta.url)), true);
});

test('Dawson & Sanderson and no-logo headers reuse the fixed PNG header structure', () => {
  assert.match(html, /const pngHeader=\(logoHTML\)=>`<div class="header-block operator-png-header"[\s\S]*?<div class="operator-png-logo-area">\$\{logoHTML\}<\/div><\/div>`/);
  assert.match(html, /if\(logoDisplay==="dands"\)\{[\s\S]*?assets\/operator-logos\/dawson-and-sanderson-logo\.png[\s\S]*?DAWSON &amp; SANDERSON/);
  assert.match(html, /if\(logoDisplay==="none"\) return pngHeader\(""\);/);
  assert.match(html, /return pngHeader\(`<img class="\$\{logoClass\}" src="\$\{op\.pngData\}" alt="\$\{op\.name\} logo">`\);/);
});

test('Dawson & Sanderson logo uses the operator-specific centered scaling approach', () => {
  assert.match(html, /\.cc \.operator-png-logo\.operator-png-logo--dands\{max-width:760px;max-height:250px;transform:scale\(\.75\);transform-origin:center center;\}/);
  assert.match(html, /<img class="operator-png-logo operator-png-logo--dands" src="assets\/operator-logos\/dawson-and-sanderson-logo\.png"/);
});

test('Single, Email and All 4 previews share the canonical card renderer used by exports', () => {
  assert.match(html, /function bc\(d\)\{ return renderCardHTML\(d\); \}/);
  assert.match(html, /out\.innerHTML = renderOfferWithOptionalCtaHTML\(visibleFieldsToData\(\), getCtaSettingsFromUI\(\)\);/);
  assert.match(html, /cardWrap\.innerHTML = renderOfferWithOptionalCtaHTML\(d, getCtaSettingsFromUI\(\)\);/);
  assert.match(html, /c\.innerHTML = bc\(d \|\| \{\}\);/);
  assert.match(html, /wrap\.innerHTML = renderCardHTML\(offerData\);/);
});

test('PNG and JPG exports use the same card renderer as previews', () => {
  assert.match(html, /wrap\.innerHTML = renderCardHTML\(offerData\);/);
  assert.match(html, /out\.innerHTML = renderOfferWithOptionalCtaHTML\(visibleFieldsToData\(\), getCtaSettingsFromUI\(\)\);/);
  assert.match(html, /renderCardToImageBlob\(o,'image\/jpeg',0\.92\)/);
  assert.match(html, /renderCardToBlob\(offerData\)/);
});


test('every generated USP strip uses the one shared 28px style without operator-specific sizing', () => {
  const uspRule = html.match(/\.cc \.operator-png-usp\{[^}]+\}/)?.[0];
  assert.ok(uspRule, 'shared USP strip rule should exist');
  assert.match(uspRule, /height:107px/);
  assert.match(uspRule, /font-size:28px/);
  assert.match(uspRule, /line-height:normal/);
  assert.equal((html.match(/\.cc \.operator-png-usp\{[^}]*font-size:28px/g) || []).length, 1, 'USP font size should have one shared declaration');
  const stylesheet = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
  assert.equal((stylesheet.match(/operator-png-usp[^,{]*\{/g) || []).length, 1, 'USP strip should not have operator-specific style overrides');

  const fallback = renderHeader({ operator: 'unknown', tags: 'All-inclusive · Cuisine · Overnight Port Stays · Adult Only Options' });
  assert.match(fallback, /<div class="operator-png-usp" style="background:[^;]+;">All-inclusive · Cuisine · Overnight Port Stays · Adult Only Options<\/div>/);
  const fallbackUsp = fallback.match(/<div class="operator-png-usp"[^>]*>/)?.[0];
  assert.ok(fallbackUsp, 'fallback USP strip should use the shared class');
  assert.doesNotMatch(fallbackUsp, /font-size:/);
});

test('header rendering preserves the USP strip and fixed card header dimensions in every logo mode', () => {
  const operator = renderHeader({ operator: 'po' });
  const dands = renderHeader({ operator: 'po', _logoDisplay: 'dands' });
  const none = renderHeader({ operator: 'po', _logoDisplay: 'none' });

  for (const header of [operator, dands, none]) {
    assert.match(header, /width:1200px;height:497px/);
    assert.match(header, /operator-png-usp/);
    assert.match(header, /Preset USP/);
  }
  assert.match(operator, /assets\/operator-logos\/po-cruises-logo\.png/);
  assert.match(dands, /assets\/operator-logos\/dawson-and-sanderson-logo\.png/);
  assert.match(dands, /DAWSON &amp; SANDERSON/);
  assert.doesNotMatch(none, /<img/);
  assert.match(none, /<div class="operator-png-logo-area"><\/div>/);
});


test('AmaWaterways uses the existing operator logo header system and brand palette', () => {
  const source = [
    extract(/const OPERATOR_USP_PRESETS = \{[\s\S]*?\n\};/, 'OPERATOR_USP_PRESETS'),
    extract(/const OPERATOR_SHIPS = \{[\s\S]*?\n\};/, 'OPERATOR_SHIPS'),
    extract(/const OPERATOR_HEADERS = \{[\s\S]*?\n\};/, 'OPERATOR_HEADERS'),
    extract(/const OPERATOR_SKINS = \{[\s\S]*?\n\};/, 'OPERATOR_SKINS'),
    extract(/function getOperatorSkin\(d\)\{[\s\S]*?\n\}/, 'getOperatorSkin'),
    extract(/function getHeaderHTML\(d\)\{[\s\S]*?\n\}/, 'getHeaderHTML')
  ].join('\n')
    .replace('const OPERATOR_USP_PRESETS', 'var OPERATOR_USP_PRESETS')
    .replace('const OPERATOR_SHIPS', 'var OPERATOR_SHIPS')
    .replace('const OPERATOR_HEADERS', 'var OPERATOR_HEADERS')
    .replace('const OPERATOR_SKINS', 'var OPERATOR_SKINS');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);

  const header = context.getHeaderHTML({ operator: 'amawaterways' });
  assert.equal(context.OPERATOR_HEADERS.amawaterways.pngData, 'assets/operator-logos/amawaterways-logo.png');
  assert.equal(context.OPERATOR_HEADERS.amawaterways.color, '#A75543');
  assert.deepEqual(
    {
      background: context.OPERATOR_SKINS.amawaterways.background,
      accentStrip: context.OPERATOR_SKINS.amawaterways.accentStrip,
      infoBar: context.OPERATOR_SKINS.amawaterways.infoBar,
      text: context.OPERATOR_SKINS.amawaterways.text
    },
    { background: '#07131f', accentStrip: '#A75543', infoBar: '#A75543', text: '#1a1a1a' }
  );
  assert.match(header, /<div class="operator-png-usp" style="background:#A75543;">Cuisine · Culture · Luxury · Wellness<\/div>/);
  assert.match(header, /background:#07131f/);
  assert.doesNotMatch(header, /background:#002D72/);
  assert.match(header, /<img class="operator-png-logo" src="assets\/operator-logos\/amawaterways-logo\.png" alt="AmaWaterways logo">/);
});
