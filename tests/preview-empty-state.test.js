import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not find ${name}`);
  const open = html.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function createClassList() {
  const classes = new Set();
  return {
    toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
    contains(name) { return classes.has(name); }
  };
}

function createHarness(offers) {
  const elements = {
    'preview-scaler': { classList: createClassList(), style: {} },
    'card-output': { classList: createClassList(), innerHTML: '' },
    'preview-title': { textContent: 'ALL 4 CARDS' }
  };
  const context = {
    offers,
    updatePreviewTitle: () => { elements['preview-title'].textContent = 'ALL 4 CARDS'; },
    document: { getElementById: id => elements[id] || null }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('isOfferLoaded'),
    extractFunction('renderEmptyPreviewIfNeeded')
  ].join('\n'), context);
  return { context, elements };
}

test('fresh previews use centred, subtle helper text in every view before rendering cards', () => {
  assert.match(html, /\.preview-scaler\.empty-preview\{[^}]*display:flex;[^}]*align-items:center;[^}]*justify-content:center;/);
  assert.match(html, /\.preview-empty-state\{[^}]*width:min\(475px,calc\(100% - 30px\)\);[^}]*text-align:center;[^}]*background:none;[^}]*border:none;[^}]*border-radius:0;[^}]*box-shadow:none;[^}]*font-family:'Montserrat',sans-serif;[^}]*color:var\(--navy\);/);
  assert.match(html, /\.preview-empty-state h2\{[^}]*padding:0;[^}]*background:none;[^}]*color:var\(--navy\);[^}]*font-family:'Montserrat',sans-serif;[^}]*font-size:16\.5px;[^}]*font-weight:400;/);
  assert.match(html, /\.preview-empty-state p\{[^}]*margin:14px 0 0;[^}]*padding:0;[^}]*background:none;[^}]*color:var\(--navy\);[^}]*font-family:'Montserrat',sans-serif;[^}]*font-size:9px;[^}]*font-weight:300;[^}]*line-height:1\.5;[^}]*opacity:\.72;/);
  assert.doesNotMatch(html, /\.preview-empty-state(?: h2| p)?\{[^}]*background:var\(--(?:navy|gold)\)/);
  assert.doesNotMatch(html, /preview-empty-rule/);
  assert.match(html, /<h2>Ready to Build<\/h2><p>Load a Google Sheet or CSV to generate your cruise cards instantly\.<\/p>/);

  const renderPreviewMode = extractFunction('renderPreviewMode');
  assert.ok(renderPreviewMode.indexOf('if(renderEmptyPreviewIfNeeded()) return;') < renderPreviewMode.indexOf("if(viewMode === 'email')"));
  assert.ok(renderPreviewMode.indexOf('if(renderEmptyPreviewIfNeeded()) return;') < renderPreviewMode.indexOf("if(viewMode === 'all')"));
  assert.match(extractFunction('renderVisibleCard'), /if\(renderEmptyPreviewIfNeeded\(\)\) return;/);

  const { context, elements } = createHarness([{}, {}, {}, {}]);
  assert.equal(context.renderEmptyPreviewIfNeeded(), true);
  assert.equal(elements['preview-title'].textContent, 'ALL 4 CARDS');
  assert.equal(elements['preview-scaler'].classList.contains('empty-preview'), true);
  assert.equal(elements['card-output'].classList.contains('empty-preview-output'), true);
  assert.match(elements['card-output'].innerHTML, /Ready to Build/);
});

test('loaded and session-restored offers bypass the empty state and keep normal preview rendering available', () => {
  const { context, elements } = createHarness([{ name: 'Caribbean Escape' }, {}, {}, {}]);
  elements['card-output'].innerHTML = '<div class="existing-card">Previously rendered card</div>';

  assert.equal(context.renderEmptyPreviewIfNeeded(), false);
  assert.equal(elements['preview-title'].textContent, 'ALL 4 CARDS');
  assert.equal(elements['preview-scaler'].classList.contains('empty-preview'), false);
  assert.equal(elements['card-output'].classList.contains('empty-preview-output'), false);
  assert.equal(elements['card-output'].innerHTML, '<div class="existing-card">Previously rendered card</div>');

  assert.match(extractFunction('renderEmptyPreviewIfNeeded'), /const showEmptyState = !offers\.some\(isOfferLoaded\);/);
  assert.match(extractFunction('refreshAfterRestore'), /renderPreviewMode\(true\);/);
  assert.match(extractFunction('renderPreviewMode'), /c\.innerHTML = bc\(d \|\| \{\}\);/);
  assert.match(extractFunction('renderVisibleCard'), /out\.innerHTML = renderCardHTML\(visibleFieldsToData\(\)\);/);
});
