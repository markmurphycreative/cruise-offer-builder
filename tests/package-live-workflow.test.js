import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFunction(name) { const start=html.indexOf(`function ${name}(`); assert.notEqual(start,-1,`Could not find ${name}`); const open=html.indexOf('{',start); let depth=0; for(let i=open;i<html.length;i++){ if(html[i]==='{') depth++; if(html[i]==='}') depth--; if(depth===0) return html.slice(start,i+1);} throw new Error(name); }
function extractConst(name) { const match=html.match(new RegExp(`const\\s+${name}\\s*=`)); assert.ok(match,`Could not find ${name}`); const start=match.index; const end=html.indexOf(';',start); return html.slice(start,end+1); }
function createContext(){ const context={console, document:{getElementById(){return null;}}, clampParseConfidenceScore:v=>Math.max(0,Math.min(100,Number(v)||0))}; vm.createContext(context); vm.runInContext([
  'function escapeRegExp(value){ return String(value||"").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"); }',
  extractConst('PACKAGE_OFFER_DETECTION_THRESHOLD'), extractConst('PACKAGE_OFFER_SIGNAL_WEIGHTS'), extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_BOARD_BASES'),
  extractFunction('getPackageOperatorMatch'), extractFunction('detectPackageOffer'), extractFunction('normalisePackageOcrText'), extractFunction('titleCasePackageValue'), extractFunction('detectPackageBoardBasis'), extractFunction('extractPackageSharingBasis'), extractFunction('extractPackagePrices'), extractFunction('parsePackageOfferText'), extractFunction('canApplyParsedPackageOffer')
].join('\n'), context); return context; }

const tuiSanta = `Santa Eulalia, Ibiza\nHotel Tres Torres\n7 Nights\nBed & Breakfast\n25th July 2026\nNewcastle Flights\nLuggage & Transfers Included £7799\nN PP\notal Price\nAV TUI Based on 2 adults Sharir`;

test('TUI Santa Eulalia OCR package is detected and repaired without changing source', () => {
  const { detectPackageOffer, parsePackageOfferText } = createContext();
  const detection = detectPackageOffer(tuiSanta);
  assert.equal(detection.isPackage, true);
  assert.equal(detection.operatorKey, 'tui');
  const result = parsePackageOfferText(tuiSanta, { detection });
  assert.equal(result.rawText, tuiSanta);
  assert.equal(result.parsed.offerType, 'package');
  assert.equal(result.parsed.operatorKey, 'tui');
  assert.equal(result.parsed.name, 'Santa Eulalia, Ibiza');
  assert.equal(result.parsed.ship, 'Hotel Tres Torres');
  assert.equal(result.parsed.nights, '7');
  assert.equal(result.parsed.boardlbl, 'Bed & Breakfast');
  assert.equal(result.parsed.sailingFrom, 'Newcastle');
  assert.equal(result.parsed.totalPrice, '799pp');
  assert.equal(result.parsed.basis, 'Based on 2 Adults Sharing');
});

test('Package parser separates lead price, resort fee and total price', () => {
  const { parsePackageOfferText } = createContext();
  const result = parsePackageOfferText(`Sidari, Corfu\nHotel Mimosa\n7 Nights\nAll Inclusive\nManchester Flights\n£646pp\n+£10pp Local Resort Fee\n£656pp\nTotal Price\nBased on 2 Adults Sharing\nTUI`, {});
  assert.equal(result.parsed.price, '646pp');
  assert.equal(result.parsed.leadPrice, '646pp');
  assert.equal(result.parsed.resortFee, '10pp');
  assert.equal(result.parsed.totalPrice, '656pp');
});

test('Jet2 and easyJet variants detect operators and family/free-child evidence', () => {
  const { detectPackageOffer, parsePackageOfferText } = createContext();
  const jet2 = `Costa Adeje, Tenerife\nSunset Bay Club\n7 Nights\nSelf Catering\nLeeds Bradford Flights\nLuggage Included\nFree Child Place\n£499pp\nTotal Price\nBased on 2 Adults & 1 Child Sharing\nJet2 Holidays`;
  assert.equal(detectPackageOffer(jet2).operatorKey, 'jet2');
  const parsedJet2 = parsePackageOfferText(jet2, {}).parsed;
  assert.equal(parsedJet2.children, '1');
  assert.equal(parsedJet2.freeChildPlace, 'true');
  const easy = `Copenhagen, Denmark\nCity Hotel Nebo\n3 Nights\nRoom Only\nLondon Flights\nHand Luggage Included\n£299pp\nTotal Price\neasyJet holidays\nBased on 2 Adults Sharing`;
  assert.equal(detectPackageOffer(easy).operatorKey, 'easyjet');
});

test('Weak package fragments are not loadable package payloads', () => {
  const { detectPackageOffer, parsePackageOfferText, canApplyParsedPackageOffer } = createContext();
  assert.equal(detectPackageOffer('Hotel\nFlights\n7 Nights').isPackage, false);
  assert.equal(canApplyParsedPackageOffer(parsePackageOfferText('Hotel\nFlights\n7 Nights', {}).parsed), false);
});
