import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const openBrace = html.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}') depth--;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function classList() {
  const classes = new Set();
  return {
    contains: value => classes.has(value),
    toggle(value, enabled) {
      if (enabled) classes.add(value);
      else classes.delete(value);
    }
  };
}

function createHarness() {
  const wrap = { classList: classList(), style: {} };
  const pane = { classList: classList(), style: {} };
  const context = {
    document: {
      querySelector(selector) {
        if (selector === '.preview-wrap') return wrap;
        if (selector === '.preview-pane') return pane;
        return null;
      }
    }
  };
  vm.runInNewContext([
    extractFunction('setPreviewWrapMode'),
    extractFunction('setSinglePreviewCanvasHeight')
  ].join('\n'), context);
  return { ...context, wrap, pane };
}

test('Single preview canvas uses the scaled card height plus normal padding at multiple zoom levels', () => {
  const { wrap, pane, setPreviewWrapMode, setSinglePreviewCanvasHeight } = createHarness();
  setPreviewWrapMode('single');

  assert.equal(wrap.classList.contains('single-preview'), true);
  assert.equal(pane.classList.contains('single-preview-pane'), true);

  for (const [scale, expectedHeight] of [[0.3, 324], [0.75, 774], [1.2, 1224]]) {
    setSinglePreviewCanvasHeight(1000, scale);
    assert.equal(wrap.style.height, `${expectedHeight}px`);
    assert.equal(wrap.style.flexBasis, `${expectedHeight}px`);
    assert.equal(wrap.style.maxHeight, '100%');
  }
});

test('Email and All 4 remove every Single-only preview canvas constraint', () => {
  for (const mode of ['email', 'all']) {
    const { wrap, pane, setPreviewWrapMode, setSinglePreviewCanvasHeight } = createHarness();
    setPreviewWrapMode('single');
    setSinglePreviewCanvasHeight(1000, 0.75);
    setPreviewWrapMode(mode);

    assert.equal(wrap.classList.contains('single-preview'), false);
    assert.equal(pane.classList.contains('single-preview-pane'), false);
    assert.equal(wrap.style.height, '');
    assert.equal(wrap.style.flexBasis, '');
    assert.equal(wrap.style.maxHeight, '');
  }
});
