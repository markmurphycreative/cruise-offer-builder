import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Import Review stores active OCR text per screenshot instead of concatenating results', () => {
  assert.match(html, /let pendingScreenshotImports=\[\];\s*let activeScreenshotImportIndex=0;/);
  assert.match(html, /sourceImage:file,text,reviewText:text,result:parsedResult,confidence,confidenceLabel:[\s\S]*?status:"ready",selected:true/);
  assert.match(html, /function setActiveScreenshotImport\(index\)\{[\s\S]*?activeScreenshotImportIndex=next;[\s\S]*?syncActiveScreenshotReviewText\(\);[\s\S]*?renderScreenshotImportReview\(\);/);
  assert.match(html, /function syncActiveScreenshotReviewText\(\)\{[\s\S]*?review\.value=normaliseVisionExtractedText\(getScreenshotImportReviewedText\(item\)\);/);
  assert.doesNotMatch(html, /pendingScreenshotImports\.map\([^)]*=>[^)]*\.text\)\.join\(/);
});

test('Import Review active row and checkbox selection remain independent', () => {
  assert.match(html, /\.screenshot-review-item\.active\{[^}]*border-color:rgba\(158,147,108,\.58\);[^}]*box-shadow:inset 3px 0 0 rgba\(158,147,108,\.72\);/);
  assert.match(html, /onclick="setActiveScreenshotImport\(\$\{index\}\)"/);
  assert.match(html, /onclick="event\.stopPropagation\(\)" onchange="pendingScreenshotImports\[\$\{index\}\]\.selected=this\.checked"/);
});

test('Import Review loading reparses each selected item from its own latest reviewed text', () => {
  assert.match(html, /pendingScreenshotImports\[activeScreenshotImportIndex\]\.reviewText=normaliseVisionExtractedText\(review\.value\|\|""\);/);
  assert.match(html, /selectedItems=pendingScreenshotImports\.filter\(item=>item&&item\.selected!==false&&item\.status!=="error"/);
  assert.match(html, /selectedItems\.forEach\(item=>\{ item\.reviewText=normaliseVisionExtractedText\(getScreenshotImportReviewedText\(item\)\); item\.result=parseScreenshotTextForActiveBuilder\(item\.reviewText\); \}\);/);
  assert.match(html, /bindings\.every\(binding=>\{[\s\S]*?findIndex\(offer=>offer&&offer\.offerId===binding\.offerId\)[\s\S]*?applyParsedOfferToSlot\(binding\.item\.result,targetIndex/);
  assert.match(html, /validatedItems\.forEach\(item=>\{ item\.result=null; \}\);/);
});

test('Missing operator imports warn without fabricating visible card copy', () => {
  assert.match(html, /function hasScreenshotImportMissingOperatorWarning\(item\)\{[\s\S]*?!String\(parsed\.operatorKey\|\|parsed\.operator\|\|""\)\.trim\(\);/);
  assert.match(html, /Operator not detected/);
  assert.doesNotMatch(html, /d\.line\|\|"CRUISE LINE"/);
  assert.match(html, /const rawLabel=skin\?\.logoLabel\|\|\(op\?op\.name:\(d\.line\|\|""\)\);/);
});
