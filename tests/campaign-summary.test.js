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

test('campaign summary opens read-only and consumes existing status output', () => {
  const openSummary = extractFunction('openSummary');
  const renderer = extractFunction('getCampaignSummaryHtml');
  assert.doesNotMatch(openSummary, /\bsave\s*\(/);
  assert.match(openSummary, /content\.innerHTML=getCampaignSummaryHtml\(\);/);
  assert.match(renderer, /getCampaignHealthReviewHtml\(\)/);
  assert.match(renderer, /isOfferLoaded\(o\)/);
  assert.match(renderer, /Offer \$\{i\+1\} — Empty/);
});

test('campaign summary offer headers reuse available operator logos without changing no-logo fallbacks', () => {
  const logo = extractFunction('getSummaryOperatorLogoHtml');
  const renderer = extractFunction('getCampaignSummaryHtml');
  assert.match(logo, /hasOperatorLogo\(resolvedOffer\)/);
  assert.match(logo, /detectOperatorKey\(o\.operator\)\|\|o\.operator/);
  assert.match(logo, /o\._logoCustom\|\|op\.pngData\|\|op\.svgData/);
  assert.match(logo, /class="summary-offer-logo-wrap"/);
  assert.match(logo, /class="summary-offer-logo"/);
  assert.match(logo, /onerror="this\.parentElement\.remove\(\)"/);
  assert.match(renderer, /\$\{getSummaryOperatorLogoHtml\(o\)\}/);
  assert.match(renderer, /Offer \$\{i\+1\} — Empty/);
});

test('campaign summary offer headings are title case and visually aligned with builder hierarchy', () => {
  assert.match(html, /\.summary-grid\{display:grid;gap:6px;\}/);
  assert.match(html, /\.summary-offer-head\{display:flex;align-items:center;gap:10px;margin-bottom:4px;\}/);
  assert.match(html, /\.summary-offer-logo-wrap\{width:70px;height:40px;[^}]*border-radius:0;[^}]*background:var\(--navy\);/);
  assert.match(html, /\.summary-offer-logo\{display:block;max-width:62px;max-height:32px;width:auto;height:auto;object-fit:contain;/);
  assert.match(html, /\.summary-offer-logo\[src=\"assets\/operator-logos\/po-cruises-logo\.png\"\]\{transform:translateY\(2px\);\}/);
  assert.match(html, /\.summary-offer-title\{font-size:11px;font-weight:400;color:var\(--navy\);letter-spacing:\.04em;\}/);
  assert.doesNotMatch(html, /\.summary-offer-title\{[^}]*text-transform:uppercase/);
});

test('campaign summary reuses existing offer readiness status and presents full review fields', () => {
  const details = extractFunction('getSummaryOfferDetails');
  assert.match(details, /getOfferStatus\(i\)==="green"/);
  assert.match(details, /normaliseSubtitleSeparator\(o\.incl\)/);
  ['Operator', 'Ship', 'Price', 'Date', 'Duration', 'Board', 'USP', 'Ports', 'Inclusions', 'Price basis', 'Destination URL', 'Hero image', 'UTM', 'Export readiness'].forEach(label => {
    assert.match(details, new RegExp(`\\["${label}"`));
  });
});

test('copied campaign summary includes health and the same expanded offer details', () => {
  const summaryText = extractFunction('getSummaryText');
  assert.match(summaryText, /Campaign Health: \$\{getCampaignHealthReviewText\(\)\}/);
  assert.match(summaryText, /getSummaryOfferDetails\(o,i\)/);
  assert.match(summaryText, /Offer \$\{i\+1\} — Empty/);
});

test('campaign summary footer keeps only the Copy All UTMs workflow', () => {
  const modalStart = html.indexOf('<div class="modal-overlay" id="summary-modal"');
  const modalEnd = html.indexOf('</div>\n\n<script>', modalStart);
  assert.notEqual(modalStart, -1, 'Expected Campaign Summary modal to exist');
  assert.notEqual(modalEnd, -1, 'Expected Campaign Summary modal boundary to exist');
  const modal = html.slice(modalStart, modalEnd);
  assert.doesNotMatch(modal, /copySummary\(\)">Copy Campaign Summary/);
  assert.match(modal, /copyAllUtms\(\)">Copy All UTMs/);
  assert.doesNotMatch(modal, /closeModal\('summary-modal'\)">Close/);
  assert.doesNotMatch(modal, /Download Summary TXT|downloadSummaryTxt/);
  assert.doesNotMatch(html, /function downloadSummaryTxt\(/);
});

test('campaign summary supports a detached read-only browser window with manual refresh', () => {
  const modalStart = html.indexOf('<div class="modal-overlay" id="summary-modal"');
  const modalEnd = html.indexOf('</div>\n\n<script>', modalStart);
  const modal = html.slice(modalStart, modalEnd);
  assert.match(modal, /openDetachedSummaryWindow\(\)">[\s\S]*Open in New Window/);

  const detachedHtml = extractFunction('getDetachedSummaryWindowHtml');
  const openDetached = extractFunction('openDetachedSummaryWindow');
  assert.match(openDetached, /detachedSummaryWindow&&!detachedSummaryWindow\.closed/);
  assert.match(openDetached, /detachedSummaryWindow\.focus\(\);/);
  assert.match(openDetached, /window\.open\("","campaign-summary-detached",features\)/);
  assert.match(openDetached, /detachedSummaryWindow=detached/);
  assert.match(openDetached, /getDetachedSummaryWindowHtml\(getCampaignSummaryHtml\(\)\)/);
  assert.doesNotMatch(openDetached, /summary-content/);
  assert.match(openDetached, /closeSummaryModalAfterDetachedOpen\(\);/);
  assert.match(detachedHtml, /initialSummaryHtml/);
  assert.match(detachedHtml, /id="detached-summary-content">\$\{summaryHtml\}<\/main>/);
  assert.match(detachedHtml, /function refreshSummary\(\)/);
  assert.match(detachedHtml, /window\.opener\.getCampaignSummaryHtml\(\)/);
  assert.match(detachedHtml, /onclick=\"refreshSummary\(\)\">Refresh/);
  assert.match(detachedHtml, /onclick=\"copyAllUtmsFromOpener\(\)\">Copy All UTMs/);
  assert.doesNotMatch(detachedHtml, /localStorage/);
});

test('detached campaign summary can live-sync through the shared renderer without refocusing the window', () => {
  const syncDetached = extractFunction('syncDetachedSummaryWindow');
  const refreshAfterRestore = extractFunction('refreshAfterRestore');
  const refreshAfterOfferReorder = extractFunction('refreshAfterOfferReorder');
  const genUtm = extractFunction('genUtm');
  const genAllUtms = extractFunction('genAllUtms');
  const genStandardUtms = extractFunction('genStandardUtms');
  const setOfferLocked = extractFunction('setOfferLocked');

  assert.match(syncDetached, /if\(!detachedSummaryWindow\) return;/);
  assert.match(syncDetached, /if\(detachedSummaryWindow\.closed\)/);
  assert.match(syncDetached, /detachedSummaryWindow=null;/);
  assert.match(syncDetached, /getElementById\('detached-summary-content'\)/);
  assert.match(syncDetached, /content\.innerHTML=getCampaignSummaryHtml\(\);/);
  assert.doesNotMatch(syncDetached, /\.focus\(\)/);
  assert.doesNotMatch(syncDetached, /window\.open\(/);
  assert.match(refreshAfterRestore, /syncDetachedSummaryWindow\(\);/);
  assert.match(refreshAfterOfferReorder, /syncDetachedSummaryWindow\(\);/);
  assert.match(html, /function refreshOfferUi\(opts=\{\}\)\{[\s\S]*?syncDetachedSummaryWindow\(\);\s*\}/);
  assert.match(genUtm, /syncDetachedSummaryWindow\(\);/);
  assert.match(genAllUtms, /syncDetachedSummaryWindow\(\);/);
  assert.match(genStandardUtms, /syncDetachedSummaryWindow\(\);/);
  assert.match(setOfferLocked, /syncDetachedSummaryWindow\(\);/);
});

test('campaign summary modal supports header-only dragging without persisting position', () => {
  assert.match(html, /\.summary-head\{[^}]*cursor:grab;/);
  assert.match(html, /\.summary-head\.dragging\{cursor:grabbing;\}/);
  assert.match(html, /initDraggableModal\('summary-modal','\.summary-modal','\.summary-head'\)/);
  assert.match(extractFunction('openSummary'), /resetDraggableModalPosition\("summary-modal"\)/);
  assert.doesNotMatch(html, /localStorage\.setItem\([^)]*summary-modal|summary-modal[^\n]*localStorage/);
});

test('campaign summary header close button remains wired to close the modal', () => {
  const modalStart = html.indexOf('<div class="modal-overlay" id="summary-modal"');
  const modalEnd = html.indexOf('</div>\n\n<script>', modalStart);
  const modal = html.slice(modalStart, modalEnd);
  assert.match(modal, /<button class="summary-close" type="button" aria-label="Close summary" onclick="closeModal\('summary-modal'\)">×<\/button>/);

  const closeModal = extractFunction('closeModal');
  const classList = { removed: [], remove(value) { this.removed.push(value); } };
  const context = {
    document: { getElementById: id => id === 'summary-modal' ? { classList } : null },
    console: { warn() {} }
  };
  vm.createContext(context);
  vm.runInContext(closeModal, context);
  context.closeModal('summary-modal');
  assert.deepEqual(classList.removed, ['active']);
});

test('campaign pack export continues to generate summary/campaign-summary.txt', () => {
  const exportCampaignPack = extractFunction('exportCampaignPack');
  assert.match(exportCampaignPack, /const summaryFolder=zip\.folder\('summary'\)/);
  assert.match(exportCampaignPack, /summaryFolder\.file\('campaign-summary\.txt'/);
  assert.match(exportCampaignPack, /summaryFolder\.file\('utm_lookup\.csv', buildUtmLookupCsv\(utmLookupRows\)\)/);
});


function extractOperatorHeaders() {
  const headers = html.match(/const OPERATOR_HEADERS = \{[\s\S]*?\n\};/)?.[0];
  assert.ok(headers, 'Expected the existing operator header data to exist');
  return headers.replace('const OPERATOR_HEADERS =', 'OPERATOR_HEADERS =');
}

function renderSummaryLogo(operator) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractOperatorHeaders(), context);
  context.detectOperatorKey = value => Object.entries(context.OPERATOR_HEADERS)
    .find(([key, config]) => key === value || config.name === value)?.[0] || '';
  vm.runInContext([
    extractFunction('summaryDisplay'),
    extractFunction('summaryHtml'),
    extractFunction('hasOperatorLogo'),
    extractFunction('getSummaryOperatorLogoHtml')
  ].join('\n'), context);
  return context.getSummaryOperatorLogoHtml({ operator });
}

test('campaign summary renders existing logo assets for every supported loaded cruise operator', () => {
  const operators = [
    'Ambassador Cruise Line',
    'Norwegian Cruise Line',
    'Virgin Voyages',
    'P&O Cruises',
    'Marella Cruises',
    'Royal Caribbean',
    'Fred. Olsen Cruise Lines',
    'Cunard',
    'Celebrity Cruises',
    'MSC Cruises',
    'Princess Cruises'
  ];
  operators.forEach(operator => {
    const logo = renderSummaryLogo(operator);
    assert.match(logo, /class="summary-offer-logo-wrap"/);
    assert.match(logo, /<img class="summary-offer-logo" src="assets\/operator-logos\//);
    const src = logo.match(/src="([^"]+)"/)?.[1];
    assert.ok(src, `Expected ${operator} summary markup to include an asset path`);
    assert.equal(fs.existsSync(new URL(`../${src}`, import.meta.url)), true, `Expected ${operator} logo asset to exist`);
  });
});

test('campaign summary retains a title-only fallback when no operator logo is available', () => {
  assert.equal(renderSummaryLogo('Unknown Cruise Operator'), '');
});

test('campaign summary keeps white or light existing logo assets visible on a compact navy container', () => {
  assert.match(html, /\.summary-offer-logo-wrap\{[^}]*background:var\(--navy\);/);
  assert.match(renderSummaryLogo('P&O Cruises'), /^<span class="summary-offer-logo-wrap"><img class="summary-offer-logo"/);
});
