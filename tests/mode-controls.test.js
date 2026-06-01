import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('removed Production Mode leaves no user-facing selector or placeholder spacing', () => {
  assert.doesNotMatch(html, /Production Mode|builder-mode-toggle|mode-production-btn|mode-standard-btn|mode-note/);
  assert.doesNotMatch(html, /\.mode-(?:toggle|note|btn)/);
});

test('retired Production Mode state is not persisted, restored, or used to hide controls', () => {
  assert.doesNotMatch(html, /builderMode|setBuilderMode|BUILDER_MODE_STORAGE_KEY|preProductionSectionState|data-production-optional/);
});
