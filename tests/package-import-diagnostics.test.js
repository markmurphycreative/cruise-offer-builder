import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Package Import Review exposes quiet per-entry and ordered aggregate diagnostic copies', () => {
  assert.match(html, />Copy diagnostics<\/button>/);
  assert.match(html, />Copy all diagnostics<\/button>/);
  assert.match(html, /all\?getOrderedScreenshotImports\(\)\.map\(entry=>entry\.item\)/);
  assert.match(html, /available\.map\(item=>item\.diagnostic\)/);
  assert.match(html, /item\.diagnostic\?'':' disabled'/);
});

test('diagnostics snapshot the recognition and parsed boundaries and copy without analysis', () => {
  assert.match(html, /importItem\.diagnostic=buildPackageImportDiagnostic\(importItem,result,parsedResult,parsedResult&&parsedResult\.detection,file,analysisTimestamp\)/);
  assert.match(html, /rawAnalysisResult:\{recognitionResponse:recognitionResult,rawExtractedText:rawText/);
  assert.match(html, /structuredImportReviewState:\{originalParsedDraft:parsed,currentReviewedDraft:parsed/);
  const copyStart=html.indexOf('async function copyPackageImportDiagnostic');
  const copyEnd=html.indexOf('\nfunction parseScreenshotTextForActiveBuilder',copyStart);
  const copyBody=html.slice(copyStart,copyEnd);
  assert.doesNotMatch(copyBody,/recognize\(|parsePackageOfferText|extractPackagePrices|detectPackageOffer/);
  assert.match(copyBody,/JSON\.stringify\(documentValue,null,2\)/);
});

test('diagnostic capture excludes source resources and secrets while retaining monetary evidence', () => {
  assert.match(html, /\[EXCLUDED BINARY OR TEMPORARY URL\]/);
  assert.match(html, /\[REDACTED SECRET\]/);
  assert.match(html, /originalRecognisedToken:match\[0\]/);
  assert.match(html, /previousLine:previous,nextLine:next/);
  assert.match(html, /reusedByAnotherRole/);
  assert.doesNotMatch(html, /importItem[^\n]+sourceImage:file/);
});

test('instrumentation leaves selection, validation, and structured handoff paths intact', () => {
  assert.match(html, /selectedItems=pendingScreenshotImports\.filter\(item=>item&&item\.selected!==false&&item\.status!=="error"/);
  assert.match(html, /const validationError=getPackageScreenshotValidationError\(draft\)/);
  assert.match(html, /const draft=cloneScreenshotImportDraft\(binding\.item\.draft\)/);
  assert.match(html, /applyParsedOfferToSlot\(committedResult,binding\.slot/);
  assert.match(html, /result\.detection=detection/);
});
