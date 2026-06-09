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

test('accordion changes stay isolated from preview, upload, crop, logo, ordering, and UTM handlers', () => {
  const toggleSource = extract(/function toggleSec\(hdr\)\{[\s\S]*?\n\}/, 'toggleSec');
  assert.doesNotMatch(toggleSource, /(?:render|preview|upload|drop|crop|logo|offer|utm|gen)/i);
  assert.match(html, /openSectionKey:getOpenSectionKey\(\)/);
});
