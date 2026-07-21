import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFunction(name) { const start=html.indexOf(`function ${name}(`); assert.notEqual(start,-1,`Could not find ${name}`); const open=html.indexOf('{',start); let depth=0; for(let i=open;i<html.length;i++){ if(html[i]==='{') depth++; if(html[i]==='}') depth--; if(depth===0) return html.slice(start,i+1);} throw new Error(name); }
function extractConst(name) { const match=html.match(new RegExp(`const\\s+${name}\\s*=`)); assert.ok(match,`Could not find ${name}`); const start=match.index; const end=html.indexOf(';',start); return html.slice(start,end+1); }
function createContext(){ const context={console, document:{getElementById(){return null;}}, clampParseConfidenceScore:v=>Math.max(0,Math.min(100,Number(v)||0))}; vm.createContext(context); vm.runInContext([
  'function escapeRegExp(value){ return String(value||"").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"); }',
  extractConst('PACKAGE_OFFER_DETECTION_THRESHOLD'), extractConst('PACKAGE_OFFER_SIGNAL_WEIGHTS'), extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_BOARD_BASES'),
  extractFunction('isTrustedJet2DawsonQuote'), extractFunction('getPackageOperatorMatch'), extractFunction('detectPackageOffer'), extractFunction('normalisePackageOcrText'), extractFunction('titleCasePackageValue'), extractFunction('detectPackageBoardBasis'), extractFunction('extractPackageSharingBasis'), extractFunction('extractPackagePrices'), extractFunction('isUnsafePackageTitleLine'), extractFunction('cleanPackageParsedTitle'), extractFunction('parseJet2DawsonQuote'), extractFunction('parsePackageOfferText'), extractFunction('canApplyParsedPackageOffer')
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


const jet2DawsonSunset = `Dawson & Sanderson
Your holiday to...
Sunset Paradise Resort
Lassi, Kefalonia
Our Rating +++
TripAdvisor Traveller Rating
Based on 176 Reviews
Holiday summary
7 nights from 21 July 2026
Bed & Breakfast
2 x Adults
0 x Children
1 x Studio
2 x 10kg Hand Baggage
2 x 22kg Bag Allowance
Coach transfers included
Flight details
Going out
Newcastle NCL to Kefalonia EFL
06:00 12:00
Coming back
Kefalonia EFL to Newcastle NCL
Payable to your travel agent
£1,148
Price per person
£574
The total holiday cost is £1,172 including approximately £24 in tourist tax`;

const realTrelloJet2Ocr = `29/06/2026
DAWSON 8 @
ABTANo. Y1256 uc
Your holiday to... *%
. plus
Sunset Paradise Resort Our rating
Lassi, Kefalonia
TripAdvisor Traveller Rating
Based on 176 Reviews
Holiday summary Flight details Payable to your travel
agent
& 7 nights from 21st Jul 2026 A Going out
¥4 Bed and Breakfast Newcastle NCL to Kefalonia (EFL) £1 1 48
J
& 2 Adults Departs: Tue 21st Jul 2026 at 05:50
Sunset Paradise Resort Arrives: Tue 21st Jul 2026 at 11:40 Price per person payable to your
travel agent
&, 1 x Studio
+ 2 x 10kg Hand Baggage ¥ Coming back £574
+ 2 x 22kg Bag Allowance Kefalonia (EFL) to Newcastle NCL
+ Coach Transfers Departs: Tue 28th Jul 2026 at 12:30 Approximately 2 n tourist fo : pavabe at
Arrives: Tue 28th Jul 2026 at 14:20 | YOU "eh: Tol OIday CosLIS EL TE2.`;

test('Dawson & Sanderson Jet2 Sunset quotation is recognised without Jet2 logo and extracted into strict fields', () => {
  const { isTrustedJet2DawsonQuote, detectPackageOffer, parsePackageOfferText } = createContext();
  assert.equal(isTrustedJet2DawsonQuote(jet2DawsonSunset), true);
  const detection = detectPackageOffer(jet2DawsonSunset);
  assert.equal(detection.isPackage, true);
  assert.equal(detection.operatorKey, 'jet2');
  const parsed = parsePackageOfferText(jet2DawsonSunset, { detection }).parsed;
  assert.equal(parsed.operatorKey, 'jet2');
  assert.equal(parsed.name, 'Kefalonia, Greece');
  assert.equal(parsed.sourceLocation, 'Lassi, Kefalonia');
  assert.equal(parsed.ship, 'Sunset Paradise Resort');
  assert.equal(parsed.nights, '7');
  assert.equal(parsed.boardlbl, 'Bed & Breakfast');
  assert.equal(`${parsed.day} ${parsed.month}`, '21 July 2026');
  assert.equal(parsed.sailingFrom, 'Newcastle');
  assert.equal(parsed.roomType, 'Studio');
  assert.equal(parsed.adults, '2');
  assert.equal(parsed.children, '0');
  assert.equal(parsed.handLuggage, '2 x 10kg');
  assert.equal(parsed.holdLuggage, '2 x 22kg');
  assert.equal(parsed.transfers, 'Coach transfers included');
  assert.equal(parsed.price, '574pp');
  assert.equal(parsed.leadPrice, '574pp');
  assert.equal(parsed.totalPrice, '1148');
  assert.equal(parsed.localFeeAmount, '24');
  assert.equal(parsed.localFeeType, 'total');
  assert.equal(parsed.localFeeApproximate, 'true');
  assert.equal(parsed.localFeePerPerson, '12');
  assert.equal(parsed.displayTotalPerPerson, '586');
  assert.equal(parsed.incl, 'Luggage & Transfers Included');
  assert.equal(parsed.flightDisplay, 'Newcastle Flights');
  assert.equal(parsed.freeChildPlace || 'false', 'false');
  assert.doesNotMatch([parsed.name, parsed.ship, parsed.incl, parsed.basis].join(' '), /Our Rating|TripAdvisor|176 Reviews|Holiday summary|Flight details|Payable to your travel agent|Going out|Coming back|06:00|12:00/i);
});

test('Weak package fragments are not loadable package payloads', () => {
  const { detectPackageOffer, parsePackageOfferText, canApplyParsedPackageOffer } = createContext();
  assert.equal(detectPackageOffer('Hotel\nFlights\n7 Nights').isPackage, false);
  assert.equal(canApplyParsedPackageOffer(parsePackageOfferText('Hotel\nFlights\n7 Nights', {}).parsed), false);
});

test('real Trello preview Jet2 OCR fixture is recognised and extracted without cleaned transcription', () => {
  const { isTrustedJet2DawsonQuote, detectPackageOffer, parsePackageOfferText } = createContext();
  assert.equal(isTrustedJet2DawsonQuote(realTrelloJet2Ocr), true);
  const detection = detectPackageOffer(realTrelloJet2Ocr);
  assert.equal(detection.isPackage, true);
  assert.equal(detection.operatorKey, 'jet2');
  const result = parsePackageOfferText(realTrelloJet2Ocr, { detection });
  assert.equal(result.rawText, realTrelloJet2Ocr);
  const parsed = result.parsed;
  assert.equal(parsed.operatorKey, 'jet2');
  assert.equal(parsed.name, 'Kefalonia, Greece');
  assert.equal(parsed.sourceLocation, 'Lassi, Kefalonia');
  assert.equal(parsed.ship, 'Sunset Paradise Resort');
  assert.equal(parsed.nights, '7');
  assert.equal(parsed.boardlbl, 'Bed & Breakfast');
  assert.equal(`${parsed.day} ${parsed.month}`, '21st July 2026');
  assert.equal(parsed.sailingFrom, 'Newcastle');
  assert.equal(parsed.flightDisplay, 'Newcastle Flights');
  assert.equal(parsed.roomType, 'Studio');
  assert.equal(parsed.adults, '2');
  assert.equal(parsed.children, '0');
  assert.equal(parsed.handLuggage, '2 x 10kg');
  assert.equal(parsed.holdLuggage, '2 x 22kg');
  assert.equal(parsed.transfers, 'Coach transfers included');
  assert.equal(parsed.incl, 'Luggage & Transfers Included');
  assert.equal(parsed.inclusionsDisplay, 'Luggage & Transfers Included');
  assert.equal(parsed.price, '574pp');
  assert.equal(parsed.leadPrice, '574pp');
  assert.equal(parsed.totalPrice, '1148');
  assert.equal(parsed.localFeeAmount, '24');
  assert.equal(parsed.localFeeType, 'total');
  assert.equal(parsed.localFeeApproximate, 'true');
  assert.equal(parsed.localFeePerPerson, '12');
  assert.equal(parsed.displayTotalPerPerson, '586');
  assert.equal(parsed.freeChildPlace || 'false', 'false');
  assert.doesNotMatch([parsed.name, parsed.ship, parsed.incl, parsed.basis].join(' '), /Our Rating|TripAdvisor|176 Reviews|Hand Luggage Included|Coach Transfers/i);
});

test('real screenshot import state path carries Dawson Jet2 structure into active offer and final package render', () => {
  const context = {
    console,
    currentCampaignType: 'package',
    offers: [{}, {}, {}, {}],
    document: { getElementById(id){ return id === 'g-airport' ? { value: 'Newcastle' } : null; } },
    clearHeroImageDataFromOffer(){},
    applyAutoSailingFromToOffer(){},
    applyOperatorTopBarUspDefault(){},
    stripTransientPasteOfferFields(){},
    defaultTopBarUspForOperator(){ return ''; },
    normaliseCampaignType(value){ return value || 'package'; },
    clampParseConfidenceScore:v=>Math.max(0,Math.min(100,Number(v)||0))
  };
  vm.createContext(context);
  vm.runInContext([
    'function escapeRegExp(value){ return String(value||"").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"); }',
    extractFunction('escapeHtml'),
    extractConst('PACKAGE_OFFER_DETECTION_THRESHOLD'), extractConst('PACKAGE_OFFER_SIGNAL_WEIGHTS'),
    extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_BOARD_BASES'), extractConst('PACKAGE_FEATURES'), extractConst('PACKAGE_AIRPORTS'),
    'const PARSE_FIELD_MAP={operatorKey:"f-operator",tags:"f-tags",name:"f-name",ship:"f-ship",incl:"f-incl",price:"f-price",basis:"f-basis",board:"f-board",boardlbl:"f-boardlbl",day:"f-day",month:"f-month",nights:"f-nights",ports:"f-ports"};',
    extractFunction('getActiveRenderCampaignType'), extractFunction('isPackageOperator'), extractFunction('isPackageOffer'), extractFunction('packageDefaultCopyValue'), extractFunction('normalisePackageCopyOverrides'), extractFunction('packageCopyValue'), extractFunction('applyPackageCopyInputOverrides'), extractFunction('packageCopyEditorValue'),
    extractFunction('isTrustedJet2DawsonQuote'), extractFunction('getPackageOperatorMatch'), extractFunction('detectPackageOffer'), extractFunction('normaliseVisionExtractedText'), extractFunction('normalisePackageOcrText'), extractFunction('titleCasePackageValue'), extractFunction('detectPackageBoardBasis'), extractFunction('extractPackageSharingBasis'), extractFunction('extractPackagePrices'), extractFunction('isUnsafePackageTitleLine'), extractFunction('cleanPackageParsedTitle'), extractFunction('parseJet2DawsonQuote'), extractFunction('parsePackageOfferText'), extractFunction('parseScreenshotTextForActiveBuilder'), extractFunction('applyParsedOfferToSlot'),
    extractFunction('formatPackageOrdinalDate'), extractFunction('packageOfferFromData'), extractFunction('formatPackageMoney'), extractFunction('packageAirportLine'), extractFunction('packageResortFeeText'), extractFunction('renderPackagePriceBlock'), extractFunction('renderPackageCard')
  ].join('\n'), context);

  const result = vm.runInContext('parseScreenshotTextForActiveBuilder(raw)', Object.assign(context, { raw: realTrelloJet2Ocr }));
  assert.equal(result.parsed.operatorKey, 'jet2');
  assert.equal(result.parsed.ship, 'Sunset Paradise Resort');

  const loaded = vm.runInContext('applyParsedOfferToSlot(result, 0, raw)', Object.assign(context, { result, raw: realTrelloJet2Ocr }));
  assert.equal(loaded, true);
  const active = context.offers[0];
  assert.equal(active.operator, 'jet2');
  assert.equal(active.name, 'Kefalonia, Greece');
  assert.equal(active.ship, 'Sunset Paradise Resort');
  assert.equal(active.flightDisplay, 'Newcastle Flights');
  assert.equal(active.inclusionsDisplay, 'Luggage & Transfers Included');
  assert.equal(active.localFeePerPerson, '12');
  assert.equal(active.displayTotalPerPerson, '586');

  const htmlOutput = vm.runInContext('renderPackageCard(offers[0])', context);
  const visibleText = htmlOutput.replace(/<span class=\"pkg-pp\">pp<\/span>/g, 'pp').replace(/<[^>]+>/g, '');
  ['Kefalonia, Greece','Sunset Paradise Resort','21st July 2026','Newcastle Flights','Luggage &amp; Transfers Included','+£12pp Local Resort Fee','Total Price','Based on 2 Adults Sharing','assets/package-skins/jet2/header-couples.png','assets/package-skins/jet2/footer.png','assets/operator-logos/jet2-holidays-logo.png'].forEach(expected => assert.match(htmlOutput, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  ['£574pp','£586pp'].forEach(expected => assert.match(visibleText, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.doesNotMatch(htmlOutput, /Operator not detected|Our Rating|TripAdvisor|176 Reviews|Hand Luggage Included|Coach Transfers/);
});
