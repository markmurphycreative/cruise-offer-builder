import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Import Review stores active OCR text per screenshot instead of concatenating results', () => {
  assert.match(html, /let pendingScreenshotImports=\[\];\s*let activeScreenshotImportIndex=0;/);
  assert.match(html, /const importItem=\{importId:createScreenshotImportId\(\),intendedOfferId:createPackageOfferId\(\),intendedSlot:i[\s\S]*?fileName:file\.name[\s\S]*?Object\.assign\(importItem,\{text,reviewText:text,result:parsedResult,draft,validationStatus:/);
  assert.doesNotMatch(html, /sourceImage:file/);
  assert.match(html, /function setActiveScreenshotImport\(index\)\{[\s\S]*?activeScreenshotImportIndex=next;[\s\S]*?syncActiveScreenshotReviewText\(\);[\s\S]*?renderScreenshotImportReview\(\);/);
  assert.match(html, /function syncActiveScreenshotReviewText\(\)\{[\s\S]*?review\.value=normaliseVisionExtractedText\(getScreenshotImportReviewedText\(item\)\);/);
  assert.doesNotMatch(html, /pendingScreenshotImports\.map\([^)]*=>[^)]*\.text\)\.join\(/);
});

test('Import Review active row and checkbox selection remain independent', () => {
  assert.match(html, /\.screenshot-review-item\.active\{[^}]*border-color:rgba\(158,147,108,\.58\);[^}]*box-shadow:inset 3px 0 0 rgba\(158,147,108,\.72\);/);
  assert.match(html, /onclick="setActiveScreenshotImport\(\$\{index\}\)"/);
  assert.match(html, /onclick="event\.stopPropagation\(\)" onchange="pendingScreenshotImports\[\$\{index\}\]\.selected=this\.checked;updatePackageImportDiagnosticReviewState/);
});

test('Import Review updates structured drafts while editing and commits those drafts without reparsing', () => {
  assert.match(html, /function handleVisionReviewTextInput\(event\)\{[\s\S]*?updateScreenshotImportDraft\(pendingScreenshotImports\[activeScreenshotImportIndex\],value\)/);
  assert.match(html, /selectedItems=pendingScreenshotImports\.filter\(item=>item&&item\.selected!==false&&item\.status!=="error"/);
  const loadStart=html.indexOf('function loadSelectedScreenshotImports()');
  const loadEnd=html.indexOf('\nasync function extractOfferTextFromVisionFile',loadStart);
  const loadBody=html.slice(loadStart,loadEnd);
  assert.doesNotMatch(loadBody,/parseScreenshotTextForActiveBuilder|sourceImage|recognize\(/);
  assert.match(loadBody,/const draft=cloneScreenshotImportDraft\(binding\.item\.draft\)/);
  assert.match(loadBody,/applyParsedOfferToSlot\(committedResult,binding\.slot/);
  assert.match(loadBody,/pendingScreenshotImports=pendingScreenshotImports\.filter\(item=>!validatedItems\.includes\(item\)\)/);
});

test('Missing operator imports warn without fabricating visible card copy', () => {
  assert.match(html, /function hasScreenshotImportMissingOperatorWarning\(item\)\{[\s\S]*?!String\(parsed\.operatorKey\|\|parsed\.operator\|\|""\)\.trim\(\);/);
  assert.match(html, /Operator not detected/);
  assert.doesNotMatch(html, /d\.line\|\|"CRUISE LINE"/);
  assert.match(html, /const rawLabel=skin\?\.logoLabel\|\|\(op\?op\.name:\(d\.line\|\|""\)\);/);
});
