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

function createHarness(keys = ['csv-import', 'campaign-presets', 'paste-raw-offer', 'operator-logo', 'hero-image', 'offer-details', 'summary-tools', 'utm-link', 'standard-utms']) {
  const autosave = { queued: 0 };
  const sections = keys.map((key, index) => {
    const body = { classList: createClassList(index === 0 ? ['section-body'] : ['section-body', 'hidden']) };
    const hdr = { classList: createClassList(index === 0 ? [] : ['collapsed']), nextElementSibling: body };
    return { dataset: { sectionKey: key }, hdr, querySelector: selector => selector === '.section-hdr' ? hdr : null };
  });
  const context = {
    builderMode: 'standard',
    preProductionSectionState: null,
    queueAutosave() { autosave.queued += 1; },
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
    extract(/function captureStandardSectionState\(\)\{[\s\S]*?\n\}/, 'captureStandardSectionState')
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
  assert.equal(sections.length, 9);
  assert.deepEqual(sections.filter(([, , collapsed]) => !collapsed).map(([, key]) => key), ['csv-import']);
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
