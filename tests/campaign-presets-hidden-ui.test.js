import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const presetSection = html.match(/<div class="section campaign-presets-hidden" data-section-key="campaign-presets">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0];

test('Campaign Presets stays in the source but is hidden from the sidebar UI', () => {
  assert.ok(presetSection, 'expected the hidden Campaign Presets sidebar section to remain in the source');
  assert.match(html, /\.campaign-presets-hidden\{display:none;\}/);
  assert.match(presetSection, />Campaign Presets<\/h3>/);
  assert.match(presetSection, /id="preset-name"/);
  assert.match(presetSection, /id="preset-select" onchange="updatePresetButtons\(\)"/);
  assert.match(presetSection, /onclick="saveCampaignPreset\(\)"/);
  assert.match(presetSection, /id="preset-load-btn" onclick="loadCampaignPreset\(\)"/);
  assert.match(presetSection, /id="preset-delete-btn" onclick="deleteCampaignPreset\(\)"/);
});
