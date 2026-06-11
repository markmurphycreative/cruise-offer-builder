import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extract(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Could not find ${label}`);
  return match[0];
}

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    contains: name => classes.has(name),
    toggle(name, force) {
      if (force === undefined ? !classes.has(name) : force) classes.add(name);
      else classes.delete(name);
    }
  };
}

function createHarness(keys = ['csv-import', 'campaign-presets', 'paste-raw-offer', 'operator-logo', 'hero-image', 'offer-details', 'export-cards', 'summary-tools', 'utm-link', 'standard-utms']) {
  const autosave = { queued: 0 };
  const sections = keys.map((key, index) => {
    const body = { classList: createClassList(index === 0 ? ['section-body'] : ['section-body', 'hidden']) };
    const hdr = { classList: createClassList(index === 0 ? [] : ['collapsed']), nextElementSibling: body };
    return { dataset: { sectionKey: key }, hdr, querySelector: selector => selector === '.section-hdr' ? hdr : null };
  });
  const context = {
    queueAutosave() { autosave.queued += 1; },
    offers: [],
    isOfferLoaded: offer => !!(offer && (offer.name || offer.ship || offer.price || offer._img)),
    document: {
      querySelectorAll(selector) {
        if (selector === '.section[data-section-key]') return sections;
        if (selector === '.section[data-section-key] .section-hdr') return sections.map(section => section.hdr);
        return [];
      }
    }
  };
  const source = [
    extract(/function toggleSec\(hdr\)\{[\s\S]*?\n\}/, 'toggleSec'),
    extract(/function setSectionCollapsedByHeader\(hdr, collapsed\)\{[\s\S]*?\n\}/, 'setSectionCollapsedByHeader'),
    extract(/function getSectionCollapseState\(\)\{[\s\S]*?\n\}/, 'getSectionCollapseState'),
    extract(/function getOpenSectionKey\(\)\{[\s\S]*?\n\}/, 'getOpenSectionKey'),
    extract(/function applySectionCollapseState\(sectionState, preferredOpenKey\)\{[\s\S]*?\n\}/, 'applySectionCollapseState'),
    extract(/function openCsvImportWhenNoOffersLoaded\(\)\{[\s\S]*?\n\}/, 'openCsvImportWhenNoOffersLoaded')
  ].join('\n');
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, sections, autosave };
}

function openKeys(sections) {
  return sections.filter(section => !section.hdr.classList.contains('collapsed')).map(section => section.dataset.sectionKey);
}

test('the default sidebar keeps CSV Import as the only expanded section', () => {
  const sections = [...html.matchAll(/<div class="section(?: [^"]*)?" data-section-key="([^"]+)">\s*<div class="section-hdr( collapsed)?"/g)];
  assert.equal(sections.length, 11);
  assert.deepEqual(sections.filter(([, , collapsed]) => !collapsed).map(([, key]) => key), ['csv-import']);
});

test('CSV Import alone receives the primary navy header treatment with white content and a gold chevron', () => {
  assert.match(html, /\.section\.csv-core-section \.section-hdr\{background:var\(--navy\);\}/);
  assert.match(html, /\.section\.csv-core-section \.section-hdr h3\{color:#fff;\}/);
  assert.match(html, /\.section\.csv-core-section \.section-toggle\{color:var\(--gold\);\}/);
  assert.doesNotMatch(html, /\.section:not\(\.csv-core-section\) \.section-hdr\{background:var\(--navy\);\}/);
});

test('the expanded sidebar header receives the subtle palette-based highlight without layout changes', () => {
  const rule = extract(/\.section-hdr:not\(\.collapsed\)\{[^}]+\}/, 'expanded sidebar header highlight');
  assert.match(rule, /background:rgba\(160,146,103,\.12\)/);
  assert.match(rule, /box-shadow:inset 2px 0 0 var\(--gold\)/);
  assert.doesNotMatch(rule, /(?:padding|margin|border(?:-width)?|height):/);
});

test('an empty builder opens CSV Import and collapses every other section without overriding loaded-offer state', () => {
  const { context, sections } = createHarness();
  context.toggleSec(sections[4].hdr);
  assert.deepEqual(openKeys(sections), ['hero-image']);
  assert.equal(context.openCsvImportWhenNoOffersLoaded(), true);
  assert.deepEqual(openKeys(sections), ['csv-import']);

  context.toggleSec(sections[4].hdr);
  context.offers = [{ name: 'Loaded cruise' }];
  assert.equal(context.openCsvImportWhenNoOffersLoaded(), false);
  assert.deepEqual(openKeys(sections), ['hero-image']);
});

test('session hydration and first-run startup apply the empty-builder CSV Import default', () => {
  assert.match(html, /function applySessionPayload\(data\)\{[\s\S]*?autosaveHydrating = false;\s*openCsvImportWhenNoOffersLoaded\(\);\s*refreshAfterRestore\(\);/);
  assert.match(html, /function initBuilderApp\(\)\{[\s\S]*?refreshOfferUi\(\{utm:true,spell:true,autosave:false\}\);\s*if\(!savedSessionAvailable\) openCsvImportWhenNoOffersLoaded\(\);/);
});

test('every sidebar section opens normally and closes the previously expanded section', () => {
  const { context, sections, autosave } = createHarness();
  for (const section of [...sections.slice(1), sections[0]]) {
    context.toggleSec(section.hdr);
    assert.deepEqual(openKeys(sections), [section.dataset.sectionKey]);
  }
  assert.equal(autosave.queued, sections.length);
});

test('clicking the currently expanded sidebar section collapses it without changing field objects', () => {
  const { context, sections } = createHarness();
  const bodiesBefore = sections.map(section => section.hdr.nextElementSibling);
  context.toggleSec(sections[0].hdr);
  assert.deepEqual(openKeys(sections), []);
  assert.deepEqual(sections.map(section => section.hdr.nextElementSibling), bodiesBefore);
});

test('restoring persisted sidebar state keeps its recorded last-open section only', () => {
  const { context, sections } = createHarness();
  context.applySectionCollapseState({ 'csv-import': false, 'hero-image': false, 'offer-details': true }, 'hero-image');
  assert.deepEqual(openKeys(sections), ['hero-image']);
  context.applySectionCollapseState({ 'csv-import': false, 'hero-image': false, 'offer-details': true });
  assert.deepEqual(openKeys(sections), ['hero-image']);
});


test('campaign library is collapsed in the shipped builder markup while saved campaigns are the default open nested list', () => {
  assert.match(html, /<div class="section campaign-library-section" id="campaign-library-panel">\s*<div class="section-hdr collapsed" onclick="toggleCampaignLibraryMain\(this\)">[\s\S]*?<\/div>\s*<div class="section-body hidden">[\s\S]*?data-campaign-category="pinned">\s*<div class="section-hdr collapsed"[\s\S]*?<h4>Pinned Campaigns<\/h4>[\s\S]*?<div class="section-body hidden">[\s\S]*?data-campaign-category="recent">\s*<div class="section-hdr"[\s\S]*?<h4>SAVED CAMPAIGNS <span class="count-badge count-badge--saved" id="saved-campaign-count">0<\/span><\/h4>[\s\S]*?<div class="section-body">/);
});

test('campaign library startup reset forces the parent closed without changing nested category state', () => {
  const parentBody = { classList: createClassList(['section-body']) };
  const parentHdr = { classList: createClassList([]), nextElementSibling: parentBody };
  const pinnedBody = { classList: createClassList(['section-body', 'hidden']) };
  const pinnedHdr = { classList: createClassList(['collapsed']), nextElementSibling: pinnedBody };
  const panel = { firstElementChild: parentHdr };
  const context = {
    document: { getElementById: id => (id === 'campaign-library-panel' ? panel : null) }
  };
  const source = [
    extract(/function setSectionCollapsedByHeader\(hdr, collapsed\)\{[\s\S]*?\n\}/, 'setSectionCollapsedByHeader'),
    extract(/function getCampaignLibraryHeader\(\)\{[\s\S]*?\n\}/, 'getCampaignLibraryHeader'),
    extract(/function setCampaignLibraryCollapsed\(collapsed=true\)\{[\s\S]*?\n\}/, 'setCampaignLibraryCollapsed'),
    extract(/function resetCampaignLibraryStartupState\(\)\{[\s\S]*?\n\}/, 'resetCampaignLibraryStartupState'),
    extract(/function toggleCampaignLibraryMain\(hdr\)\{[\s\S]*?\n\}/, 'toggleCampaignLibraryMain'),
    extract(/function toggleCampaignLibraryCategory\(hdr\)\{[\s\S]*?\n\}/, 'toggleCampaignLibraryCategory')
  ].join('\n');
  vm.createContext(context);
  vm.runInContext(source, context);

  context.resetCampaignLibraryStartupState();
  assert.equal(parentHdr.classList.contains('collapsed'), true);
  assert.equal(parentBody.classList.contains('hidden'), true);
  assert.equal(pinnedHdr.classList.contains('collapsed'), true);
  assert.equal(pinnedBody.classList.contains('hidden'), true);

  context.toggleCampaignLibraryMain(parentHdr);
  assert.equal(parentHdr.classList.contains('collapsed'), false);
  assert.equal(parentBody.classList.contains('hidden'), false);

  context.toggleCampaignLibraryCategory(pinnedHdr);
  assert.equal(pinnedHdr.classList.contains('collapsed'), false);
  assert.equal(pinnedBody.classList.contains('hidden'), false);
});

test('builder startup, splash dismissal, session restore, and campaign file restore all force campaign library collapsed', () => {
  assert.match(html, /function initStandaloneApp\(\)\{\s*resetCampaignLibraryStartupState\(\);[\s\S]*?initBuilderApp\(\);/);
  assert.match(html, /function initBuilderApp\(\)\{\s*\/\/[^\n]+\n\s*refreshPresetList\(\);\s*try\{\s*resetCampaignLibraryStartupState\(\);[\s\S]*?sv\(cur\);\s*initCampaignHistoryListeners\(\);\s*resetCampaignLibraryStartupState\(\);/);
  assert.match(html, /function dismissSplashAndShowBuilder\(mode="open"\)\{\s*markBuilderOpenState\(true,mode\);\s*resetCampaignLibraryStartupState\(\);/);
  assert.match(html, /function initStartScreenActions\(\)\{[\s\S]*?if\(shouldBypassSplashOnLoad\(\)\)\{\s*resetCampaignLibraryStartupState\(\);/);
  assert.match(html, /function applySessionPayload\(data\)\{[\s\S]*?applySectionCollapseState\(data\.sectionState, data\.openSectionKey\);[\s\S]*?if\(typeof resetCampaignLibraryStartupState==="function"\) resetCampaignLibraryStartupState\(\);\s*loadOfferToEditor\(cur\);/);
  assert.match(html, /function restoreCampaignFilePayload\(filePayload\)\{[\s\S]*?clearTimeout\(autosaveTimer\);\s*if\(typeof resetCampaignLibraryStartupState==="function"\) resetCampaignLibraryStartupState\(\);/);
});

test('accordion changes stay isolated from preview, upload, crop, logo, ordering, and UTM handlers', () => {
  const toggleSource = extract(/function toggleSec\(hdr\)\{[\s\S]*?\n\}/, 'toggleSec');
  assert.doesNotMatch(toggleSource, /(?:render|preview|upload|drop|crop|logo|offer|utm|gen)/i);
  assert.match(html, /openSectionKey:getOpenSectionKey\(\)/);
});

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

test('sidebar polish adds subtle spacing, compact active-offer context and professional empty states', () => {
  assert.match(html, /\.section\{margin-bottom:6px;border:1px solid var\(--border\);/);
  assert.match(html, /\.section-body\{padding:7px 9px;\}/);
  assert.match(html, /id="active-offer-label" aria-live="polite">Editing Offer 1 of 4/);
  assert.match(html, /function updateActiveOfferLabel\(\)\{[\s\S]*?label\.textContent=`Editing Offer \$\{cur\+1\} of 4`;/);
  assert.match(html, /<div class="empty-state" id="sheets-status" aria-live="polite"><strong>No CSV loaded<\/strong>Import a campaign CSV to begin\.<\/div>/);
  assert.match(html, /<div id="utm-visible-output" class="generated-utm-empty empty-state" role="status"><strong>No UTMs generated yet\.<\/strong>Add offer details and a landing page to generate tracking links\.<\/div>/);
});

test('saved campaign count badge and dashboard are refreshed from existing campaign history data', () => {
  assert.match(html, /<span class="count-badge" id="campaign-library-count">0<\/span>/);
  assert.match(html, /<div class="campaign-library-dashboard" id="campaign-library-dashboard" aria-live="polite"><\/div>/);
  assert.match(html, /function refreshCampaignHistoryUI\(\)\{[\s\S]*?renderCampaignLibraryDashboard\(buckets\);/);

  const history = [
    { id: 'one', title: 'One', savedAt: '2026-06-10T09:15:00.000Z', updatedAt: '2026-06-10T09:15:00.000Z', recentAt: '2026-06-10T09:15:00.000Z', pinned: true },
    { id: 'two', title: 'Two', savedAt: '2026-06-10T13:47:00.000Z', updatedAt: '2026-06-10T13:47:00.000Z', recentAt: '2026-06-10T13:47:00.000Z', pinned: false },
    { id: 'three', title: 'Three', savedAt: '2026-06-09T12:00:00.000Z', updatedAt: '2026-06-09T12:00:00.000Z', recentAt: '2026-06-09T12:00:00.000Z', pinned: false }
  ];
  const elements = {
    'campaign-library-count': { textContent: '' },
    'saved-campaign-count': { textContent: '' },
    'campaign-library-dashboard': { innerHTML: '' }
  };
  const context = {
    document: { getElementById: id => elements[id] || null },
    readCampaignHistory: () => history
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('campaignHistoryTime'),
    extractFunction('sortCampaignHistoryNewest'),
    extractFunction('escapeCampaignHistoryText'),
    extractFunction('campaignHistoryLastSaved'),
    extractFunction('renderCampaignLibraryDashboard')
  ].join('\n'), context);

  context.renderCampaignLibraryDashboard({ pinned: [history[0]], recent: history });
  assert.equal(elements['campaign-library-count'].textContent, '3');
  assert.equal(elements['saved-campaign-count'].textContent, '3');
  assert.match(elements['campaign-library-dashboard'].innerHTML, /<strong class="campaign-library-stat-value--saved">3<\/strong>Saved/);
  assert.match(elements['campaign-library-dashboard'].innerHTML, /<strong class="campaign-library-stat-value--pinned">1<\/strong>Pinned/);
  assert.match(elements['campaign-library-dashboard'].innerHTML, /<strong class="campaign-library-stat-value--last-saved">[^<]+<\/strong>Last saved/);
  assert.doesNotMatch(elements['campaign-library-dashboard'].innerHTML, /Recent/);
});


test('campaign library saved and pinned categories use distinct understated visual identities', () => {
  assert.match(html, /\.campaign-library-category\[data-campaign-category="recent"\]\{border-left:2px solid rgba\(42,122,74,\.46\);\}/);
  assert.match(html, /\.campaign-library-category\[data-campaign-category="recent"\] \.section-hdr\{background:rgba\(42,122,74,\.07\);\}/);
  assert.match(html, /\.campaign-library-category\[data-campaign-category="recent"\] \.section-hdr:not\(\.collapsed\)\{background:rgba\(42,122,74,\.10\);box-shadow:inset 2px 0 0 var\(--green\);\}/);
  assert.match(html, /\.campaign-library-category\[data-campaign-category="pinned"\] \.section-hdr:not\(\.collapsed\)\{background:rgba\(160,146,103,\.12\);box-shadow:inset 2px 0 0 var\(--gold\);\}/);
  assert.match(html, /\.count-badge--saved\{background:rgba\(42,122,74,\.12\);border-color:rgba\(42,122,74,\.34\);color:var\(--green\);\}/);
});
