import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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

function createFilenameHarness(campaignName = '') {
  const campaign = { value: campaignName };
  const context = {
    document: { getElementById: id => (id === 'g-campaign' ? campaign : null) }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('getCampaignPackFolderName'),
    extractFunction('getCampaignPackFilename')
  ].join('\n'), context);
  return { campaign, context };
}

test('Campaign Pack folder naming preserves the exact Campaign Name value and appends CP', () => {
  const { context } = createFilenameHarness('2nd June 2026 - Tuesday - Cruise Worldwide Mixed (Mark)');
  assert.equal(context.getCampaignPackFolderName(), '2nd June 2026 - Tuesday - Cruise Worldwide Mixed (Mark) - CP');
  assert.equal(context.getCampaignPackFilename(), '2nd June 2026 - Tuesday - Cruise Worldwide Mixed (Mark) - CP.zip');
});

test('Campaign Pack folder naming preserves brackets, apostrophes and commas', () => {
  for (const campaignName of [
    'Cruise Worldwide [Mixed] (Mark)',
    "Cruise Worldwide - Mark's Picks",
    'Cruise Worldwide, Celebrity Cruises, Tuesday'
  ]) {
    const { context } = createFilenameHarness(campaignName);
    assert.equal(context.getCampaignPackFolderName(), `${campaignName} - CP`);
  }
});

test('Campaign Pack folder naming removes only filesystem-invalid characters without slugifying valid text', () => {
  const { context } = createFilenameHarness('Celebrity: Europe / Caribbean? <Mark>|June*2026" \\ Sale');
  assert.equal(context.getCampaignPackFolderName(), 'Celebrity Europe  Caribbean MarkJune2026  Sale - CP');
  assert.doesNotMatch(context.getCampaignPackFolderName(), /_/);
});

test('Campaign Pack folder naming falls back for an empty or filesystem-invalid Campaign Name', () => {
  assert.equal(createFilenameHarness('').context.getCampaignPackFolderName(), 'Untitled Campaign - CP');
  assert.equal(createFilenameHarness(':?*').context.getCampaignPackFolderName(), 'Untitled Campaign - CP');
});

test('Campaign Pack folder naming reads the live Campaign Name field whenever export naming is requested', () => {
  const { campaign, context } = createFilenameHarness('First Campaign');
  assert.equal(context.getCampaignPackFilename(), 'First Campaign - CP.zip');
  campaign.value = 'Updated Campaign (Mark)';
  assert.equal(context.getCampaignPackFilename(), 'Updated Campaign (Mark) - CP.zip');
});

test('Campaign Pack export keeps the existing archive structure and downloads using the generated filename', () => {
  const exportCampaignPack = extractFunction('exportCampaignPack');
  assert.match(exportCampaignPack, /const cardsFolder=zip\.folder\('cards'\); const utmFolder=zip\.folder\('utms'\); const summaryFolder=zip\.folder\('summary'\)/);
  assert.match(exportCampaignPack, /downloadBlob\(blob,getCampaignPackFilename\(\)\)/);
  assert.doesNotMatch(exportCampaignPack, /zip\.folder\(getCampaignPackFolderName\(\)\)/);
});
