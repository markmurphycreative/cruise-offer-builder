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
  assert.doesNotMatch(html, /Generated CTA Link/);
  assert.doesNotMatch(html, /id="cta-link-output"/);
});



test('CTA enable checkbox uses the app navy with a custom white tick while preserving its dimensions', () => {
  assert.match(html, /#cta-enabled:not\(:disabled\)\{[^}]*appearance:none;[^}]*width:13px;height:13px;[^}]*border:1px solid var\(--border\);/);
  assert.match(html, /#cta-enabled:not\(:disabled\):checked\{background:var\(--navy\);border-color:var\(--navy\);\}/);
  assert.match(html, /#cta-enabled:not\(:disabled\)::after\{[^}]*border:solid #fff;[^}]*border-width:0 1\.2px 1\.2px 0;[^}]*transform:translateY\(-0\.35px\) rotate\(45deg\) scale\(0\);/);
  assert.match(html, /#cta-enabled:not\(:disabled\):checked::after\{transform:translateY\(-0\.35px\) rotate\(45deg\) scale\(1\);\}/);
});

test('CTA preview renders as a separate flush asset after the card and uses operator accent colour', () => {
  assert.match(extractFunction('renderOfferWithOptionalCtaHTML'), /return `<div class="cta-preview-group">\$\{card\}\$\{renderCtaHTML\(offerData \|\| \{\}, s\)\}<\/div>`;/);
  assert.match(extractFunction('renderCtaHTML'), /getOperatorAccentColor\(offerData\)/);
  assert.match(html, /\.cta-preview-asset\{width:1200px;height:338px;background:#fff;position:relative/);
  assert.match(html, /\.cta-preview-button\{[^}]*left:73px;top:72px;width:1054px;height:197px/);
  assert.match(html, /\.cta-preview-button\{[^}]*color:#fff;[^}]*font-size:43px;[^}]*font-weight:300/);
});

test('CTA phone numbers are stored cleanly while generated links keep the tel prefix', () => {
  assert.match(extractFunction('normaliseCtaPhone'), /replace\(\/\^tel:\/i, \"\"\)/);
  assert.match(extractFunction('normaliseCtaSettings'), /phone: normaliseCtaPhone\(source\.phone\)/);
  assert.match(extractFunction('ctaSettingsChanged'), /if\(phoneEl && phoneEl\.value !== ctaSettings\.phone\) phoneEl\.value=ctaSettings\.phone;/);
  assert.match(extractFunction('getCtaLink'), /return 'tel:' \+ s\.phone;/);
});

test('CTA exports are separate JPG files and are only added when CTA is enabled', () => {
  assert.match(extractFunction('getCtaFilename'), /_cta\$1\./);
  assert.match(extractFunction('exportCurrentJPG'), /if\(cta\.enabled\)\{[\s\S]*renderCtaToImageBlob\(o,'image\/jpeg',0\.92\)[\s\S]*downloadBlob\(ctaBlob,ctaFilename\);/);
  assert.match(extractFunction('exportAllJPG'), /const zip=new JSZip\(\); const offerCardsFolder=zip\.folder\('offer-cards'\);/);
  assert.match(extractFunction('exportAllJPG'), /offerCardsFolder\.file\(filename,blob\);/);
  assert.match(extractFunction('exportAllJPG'), /if\(cta\.enabled\)\{[\s\S]*offerCardsFolder\.file\(ctaFilename,ctaBlob\);/);
  assert.doesNotMatch(extractFunction('renderCardToImageBlob'), /renderCtaHTML|cta-preview/);
});

test('Campaign Pack records CTA settings and places CTA JPGs under offer-cards', () => {
  assert.match(extractFunction('buildCampaignFilePayload'), /ctaSettings:currentCtaSettings/);
  assert.match(extractFunction('buildCampaignFilePayload'), /ctaData:getCtaSummaryRows\(\)/);
  assert.match(extractFunction('exportCampaignPack'), /const zip=new JSZip\(\); const cardsFolder=zip\.folder\('offer-cards'\); const utmFolder=zip\.folder\('utms'\); const summaryFolder=zip\.folder\('summary'\)/);
  assert.match(extractFunction('exportCampaignPack'), /cardsFolder\.file\(ctaFilename, ctaBlob\);/);
  assert.match(extractFunction('exportCampaignPack'), /CTA Link: \$\{cta\.enabled \? getCtaLink\(cta\) : 'N\/A'\}/);
});
