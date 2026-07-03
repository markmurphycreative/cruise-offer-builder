import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const restrainedActionButtonSelectors = [
  '.parse-btn',
  '.export-btn',
  '.abtn',
  '.sb-actions .abtn',
  '.tbtn',
  '.modal-btn',
  '.session-restore-btn',
  '.summary-btn',
];

function cssRuleFor(selector) {
  const start = html.indexOf(`\n${selector}{`);
  assert.notEqual(start, -1, `Expected CSS rule for ${selector}`);
  const end = html.indexOf('}', start);
  assert.notEqual(end, -1, `Expected CSS rule for ${selector} to close`);
  return html.slice(start + 1, end + 1);
}

test('primary builder action buttons use restrained typography', () => {
  restrainedActionButtonSelectors.forEach(selector => {
    assert.match(cssRuleFor(selector), /font-weight:400;/, `${selector} should use font-weight:400`);
  });
  ['.vbtn', '.shortcuts-trigger'].forEach(selector => {
    assert.match(cssRuleFor(selector), /font-weight:300;/, `${selector} should use lighter toolbar typography`);
  });
});

test('named export and campaign prompt actions inherit restrained button weights', () => {
  assert.match(html, /<button class="export-btn secondary" onclick="exportCurrentJPG\(\)" id="exp-single-jpg-btn">[\s\S]*?<span aria-hidden="true">Card<\/span>/);
  assert.match(html, /<button class="export-btn secondary" onclick="exportAllJPG\(\)" id="exp-all-jpg-btn">[\s\S]*?<span aria-hidden="true">All Cards<\/span>/);
  assert.match(html, /<button class="export-btn primary" onclick="exportCampaignPack\(\)" id="exp-pack-btn">[\s\S]*?<span aria-hidden="true">Campaign<\/span>/);
  assert.match(html, /<div class="section" data-section-key="campaign-summary">/);
  assert.match(html, /<button class="abtn navy" type="button" style="width:100%;margin-bottom:6px;" onclick="generateAiCopyPrompt\(\)">Generate Prompt<\/button>/);
  assert.match(cssRuleFor('.export-btn'), /font-weight:400;/);
  assert.match(cssRuleFor('.abtn'), /font-weight:400;/);
});
