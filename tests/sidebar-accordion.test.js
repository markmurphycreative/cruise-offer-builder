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
    add: name => classes.add(name),
    remove: name => classes.delete(name),
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
  assert.equal(sections.length, 13);
  assert.deepEqual(sections.filter(([, , collapsed]) => !collapsed).map(([, key]) => key), ['csv-import']);
});

test('CSV Import alone receives the primary navy header treatment with white content and a gold chevron', () => {
  assert.match(html, /\.section\.csv-core-section \.section-hdr\{background:var\(--navy\);\}/);
  assert.match(html, /\.section\.csv-core-section \.section-hdr h3\{color:#fff;\}/);
  assert.match(html, /\.section\.csv-core-section \.section-toggle\{color:var\(--gold\);\}/);
  assert.doesNotMatch(html, /\.section:not\(\.csv-core-section\) \.section-hdr\{background:var\(--navy\);\}/);
});

test('the expanded sidebar header receives the primary navy accent without layout or background changes', () => {
  const rule = extract(/\.section-hdr:not\(\.collapsed\)\{[^}]+\}/, 'expanded sidebar header highlight');
  assert.match(rule, /box-shadow:inset 4px 0 0 var\(--navy\)/);
  assert.doesNotMatch(rule, /(?:background|padding|margin|border(?:-width)?|height):/);
});

test('the expanded sidebar header makes the icon more prominent and tints the icon and chevron gold', () => {
  assert.match(html, /\.section-hdr:not\(\.collapsed\) \.section-icon\{color:var\(--gold\);stroke-width:2\.25;\}/);
  assert.match(html, /\.section-hdr:not\(\.collapsed\) \.section-toggle\{color:var\(--gold\);\}/);
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


test('Manage Campaigns ships as a modal trigger with campaign lists moved out of nested sidebar accordions', () => {
  assert.match(html, /<div class="section campaign-library-section manage-campaigns-section" id="campaign-library-panel" data-section-key="manage-campaigns">\s*<div class="section-hdr collapsed" role="button" tabindex="0" onclick="openManageCampaignsModal\(\)"/);
  assert.match(html, /<h3><svg class="section-icon"[\s\S]*?<\/svg>Manage Campaigns<\/h3><svg class="manage-campaigns-launch-icon"[^>]+>[\s\S]*?<\/svg>/);
  assert.doesNotMatch(extract(/<div class="section campaign-library-section manage-campaigns-section"[\s\S]*?<\/div>\s*<\/div>/, 'Manage Campaigns sidebar row'), /section-toggle/);
  assert.match(html, /<div class="modal-overlay" id="manage-campaigns-modal"/);
  assert.match(html, /<h2 id="manage-campaigns-title">[\s\S]*?Manage Campaigns<\/h2>/);
  assert.match(html, /<section class="campaign-library-category" data-campaign-category="pinned">[\s\S]*?<h3>Pinned Campaigns<\/h3>[\s\S]*?<div id="pinned-campaign-list" class="campaign-history-list"><\/div>/);
  assert.match(html, /<section class="campaign-library-category" data-campaign-category="recent">[\s\S]*?<h3>Saved Campaigns<\/h3>[\s\S]*?<div id="recent-campaign-list" class="campaign-history-list"><\/div>/);
  assert.match(html, /<section class="campaign-library-category" data-campaign-category="backups">[\s\S]*?<h3>Campaign Backups<\/h3>[\s\S]*?<div id="backup-campaign-list" class="campaign-history-list"><\/div>/);
  assert.match(html, /<h3>Campaign Actions<\/h3>[\s\S]*?onclick="clearSavedSession\(\)">Clear Current Session<\/button>[\s\S]*?onclick="triggerLoadCampaignBackup\(\)">Load Campaign Backup<\/button>/);
  assert.doesNotMatch(html, /toggleCampaignLibraryCategory\(this\)/);
});


test('Manage Campaigns modal supports header-only dragging without persisting position', () => {
  assert.match(html, /\.manage-campaigns-head\{[^}]*cursor:default;/);
  assert.match(html, /\.manage-campaigns-head\.dragging\{cursor:default;\}/);
  assert.match(html, /initDraggableModal\('manage-campaigns-modal','\.manage-campaigns-modal','\.manage-campaigns-head'\)/);
  assert.match(extractFunction('openManageCampaignsModal'), /resetDraggableModalPosition\("manage-campaigns-modal"\)/);
  assert.doesNotMatch(html, /localStorage\.setItem\([^)]*manage-campaigns-modal|manage-campaigns-modal[^\n]*localStorage/);
});

test('Manage Campaigns modal opens and closes without mutating campaign state helpers', () => {
  const modal = { classList: createClassList([]) };
  let refreshed = 0;
  const context = {
    refreshCampaignHistoryUI() { refreshed += 1; },
    document: { getElementById: id => (id === 'manage-campaigns-modal' ? modal : null) }
  };
  const source = [
    extract(/function openManageCampaignsModal\(\)\{[\s\S]*?\n\}/, 'openManageCampaignsModal'),
    extract(/function closeManageCampaignsModal\(\)\{[\s\S]*?\n\}/, 'closeManageCampaignsModal')
  ].join('\n');
  vm.createContext(context);
  vm.runInContext(source, context);

  context.openManageCampaignsModal();
  assert.equal(refreshed, 1);
  assert.equal(modal.classList.contains('active'), true);
  context.closeManageCampaignsModal();
  assert.equal(modal.classList.contains('active'), false);
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
  assert.match(html, /<div id="sheets-status" aria-live="polite"><\/div>/);
  assert.match(html, /<div id="utm-visible-output" class="generated-utm-empty empty-state" role="status"><strong>No UTMs generated yet\.<\/strong>Add offer details and a landing page to generate tracking links\.<\/div>/);
});

test('campaign library removes dashboard count badges while refresh keeps lists current', () => {
  assert.doesNotMatch(html, /id="campaign-library-count"/);
  assert.match(html, /<div class="campaign-library-dashboard" id="campaign-library-dashboard" aria-live="polite"><\/div>/);
  assert.match(html, /function refreshCampaignHistoryUI\(\)\{[\s\S]*?renderCampaignLibraryDashboard\(buckets\);/);

  const elements = { 'campaign-library-dashboard': { innerHTML: 'stale' } };
  const context = { document: { getElementById: id => elements[id] || null }, readCampaignHistory: () => [] };
  vm.createContext(context);
  vm.runInContext(extractFunction('renderCampaignLibraryDashboard'), context);

  context.renderCampaignLibraryDashboard({ pinned: [], recent: [] });
  assert.equal(elements['campaign-library-dashboard'].innerHTML, '');
});


test('campaign library saved and pinned categories use understated visual identities', () => {
  assert.match(html, /\.campaign-library-category\[data-campaign-category="recent"\] \.section-hdr:not\(\.collapsed\),\.campaign-library-category\[data-campaign-category="pinned"\] \.section-hdr:not\(\.collapsed\)\{background:#fff;box-shadow:inset 2px 0 0 rgba\(160,146,103,\.34\);\}/);
  assert.doesNotMatch(html, /\.count-badge/);
});

