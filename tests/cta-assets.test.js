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

test('CTA asset controls are additive and default to disabled with Dawson & Sanderson call copy', () => {
  assert.match(html, /const CTA_DEFAULTS = \{enabled:false,text:"Click To Call Us For More Info",phone:"01912229701"\};/);
  assert.match(html, /id="cta-enabled" type="checkbox"/);
  assert.match(html, /id="cta-text"[^>]+placeholder="Click To Call Us For More Info"/);
  assert.match(html, /id="cta-phone"[^>]+placeholder="01912229701"/);
  assert.match(html, /id="cta-link-output">tel:01912229701<\/span>/);
});

test('CTA preview renders as a separate flush asset after the card and uses operator accent colour', () => {
  assert.match(extractFunction('renderOfferWithOptionalCtaHTML'), /return `<div class="cta-preview-group">\$\{card\}\$\{renderCtaHTML\(offerData \|\| \{\}, s\)\}<\/div>`;/);
  assert.match(extractFunction('renderCtaHTML'), /getOperatorAccentColor\(offerData\)/);
  assert.match(html, /\.cta-preview-asset\{width:1200px;height:220px;background:#fff;display:flex;align-items:center;justify-content:center/);
  assert.match(html, /\.cta-preview-button\{[^}]*color:#fff;[^}]*font-size:38px;[^}]*font-weight:700/);
});

test('CTA exports are separate JPG files and are only added when CTA is enabled', () => {
  assert.match(extractFunction('getCtaFilename'), /_cta\$1\./);
  assert.match(extractFunction('exportCurrentJPG'), /if\(cta\.enabled\)\{[\s\S]*renderCtaToImageBlob\(o,'image\/jpeg',0\.92\)[\s\S]*downloadBlob\(ctaBlob,ctaFilename\);/);
  assert.match(extractFunction('exportAllJPG'), /if\(cta\.enabled\)\{[\s\S]*zip\.file\(ctaFilename,ctaBlob\);/);
  assert.doesNotMatch(extractFunction('renderCardToImageBlob'), /renderCtaHTML|cta-preview/);
});

test('Campaign Pack records CTA settings and places CTA JPGs under assets/cards', () => {
  assert.match(extractFunction('buildCampaignFilePayload'), /ctaSettings:currentCtaSettings/);
  assert.match(extractFunction('buildCampaignFilePayload'), /ctaData:getCtaSummaryRows\(\)/);
  assert.match(extractFunction('exportCampaignPack'), /const ctaCardsFolder=cta\.enabled \? zip\.folder\('assets'\)\.folder\('cards'\) : null;/);
  assert.match(extractFunction('exportCampaignPack'), /CTA Link: \$\{cta\.enabled \? getCtaLink\(cta\) : 'N\/A'\}/);
});
