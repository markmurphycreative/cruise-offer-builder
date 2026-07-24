import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFunction(name) { const start=html.indexOf(`function ${name}(`); assert.notEqual(start,-1,`Could not find ${name}`); const open=html.indexOf('{',start); let depth=0; for(let i=open;i<html.length;i++){ if(html[i]==='{') depth++; if(html[i]==='}') depth--; if(depth===0) return html.slice(start,i+1);} throw new Error(name); }
function extractConst(name) { const match=html.match(new RegExp(`const\\s+${name}\\s*=`)); assert.ok(match,`Could not find ${name}`); const start=match.index; const end=html.indexOf(';',start); return html.slice(start,end+1); }
function createContext(){ const context={console, document:{getElementById(){return null;}}, clampParseConfidenceScore:v=>Math.max(0,Math.min(100,Number(v)||0))}; vm.createContext(context); vm.runInContext([
  'function escapeRegExp(value){ return String(value||"").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"); }',
  extractConst('PACKAGE_OFFER_DETECTION_THRESHOLD'), extractConst('PACKAGE_OFFER_SIGNAL_WEIGHTS'), extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_BOARD_BASES'), extractConst('JET2_APPROVED_INCLUSION_COPY'),
  extractFunction('isTrustedJet2DawsonQuote'), extractFunction('getPackageOperatorMatch'), extractFunction('detectPackageOffer'), extractFunction('normalisePackageOcrText'), extractFunction('titleCasePackageValue'), extractFunction('detectPackageBoardBasis'), extractFunction('extractPackageDepartureAirport'), extractFunction('extractPackageSharingBasis'), extractFunction('extractPackagePrices'), extractFunction('isUnsafePackageTitleLine'), extractFunction('cleanPackageParsedTitle'), extractFunction('sanitisePackageHotelCandidate'), extractFunction('extractHolidaySummaryAccommodation'), extractFunction('extractStructuredPackageAccommodation'), extractFunction('extractHolidayToAccommodation'), extractFunction('parseJet2DawsonQuote'), extractFunction('isJet2SourceInclusionCopy'), extractFunction('normaliseJet2PackageInclusionCopy'), extractFunction('parsePackageOfferText'), extractFunction('canApplyParsedPackageOffer')
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


test('package detector recognises imported Jet2-style package fields without explicit operator and strips booking-system title text', () => {
  const { detectPackageOffer, parsePackageOfferText } = createContext();
  const raw = `Servatur Caribe Apartments Departs: Wed 15th Jul 2026 At 16:45 Price Ort Payable To Your Travel Agent
Costa Adeje, Tenerife
7 Nights
Self Catering
15th July 2026
Hand Luggage Included
Coach Transfers
£570pp
Based on 2 Adults Sharing`;
  const detection = detectPackageOffer(raw);
  assert.equal(detection.isPackage, true);
  assert.equal(detection.operatorKey, '');
  const parsed = parsePackageOfferText(raw, { detection: { ...detection, operatorKey: 'jet2' } }).parsed;
  assert.equal(parsed.offerType, 'package');
  assert.equal(parsed.operatorKey, 'jet2');
  assert.equal(parsed.ship, 'Servatur Caribe Apartments');
  assert.equal(parsed.name, 'Costa Adeje, Tenerife');
  assert.equal(parsed.nights, '7');
  assert.equal(parsed.boardlbl, 'Self Catering');
  assert.equal(parsed.day, '15th');
  assert.equal(parsed.month, 'July 2026');
  assert.equal(parsed.incl, 'Luggage & Transfers Included');
  assert.equal(parsed.price, '570pp');
  assert.equal(parsed.basis, 'Based on 2 Adults Sharing');
  assert.doesNotMatch(parsed.ship, /Departs|Payable|Price/i);
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


const jet2WhiteCity = `Dawson & Sanderson
Your holiday to...
.. Plus
White City Beach Hotel
Nr Alanya, Antalya Area
Our rating ++++
TripAdvisor Traveller Rating
Based on 1234 Reviews
Holiday summary
7 nights from 7th July 2026
All Inclusive
2 Adults
0 x Children
1 x Standard room with Side Sea View
2 x 10kg Hand Baggage
2 x 22kg Bag Allowance
Coach Transfers
Flight details
Going out
Leeds Bradford LBA to Antalya AYT
Coming back
Antalya AYT to Leeds Bradford LBA
Payable to your travel agent
£1,406
Price per person payable to your travel agent
£703`;

const jet2Castillo = `DAWSON 8 @
Your holiday to... *%
. plus
Servatur Castillo De Sol Our rating
Puerto Rico, Gran Canaria
TripAdvisor Traveller Rating
Based on 631 Reviews
Holiday summary Flight details Payable to your travel agent
7 nights from 9th Jul 2026 Going out
Self Catering Leeds Bradford LBA to Gran Canaria LPA £1,030
2 Adults
1 x Apartment
2 x 10kg Hand Baggage
2 x 22kg Bag Allowance
Coach Transfers
Coming back
Gran Canaria LPA to Leeds Bradford LBA
Price per person
£515`;

const jet2Caribe = `Dawson & Sanderson
Your holiday to...
Servatur Caribe Apartments
Playa De Las Americas, Tenerife
Our rating +++
TripAdvisor Traveller Rating
Based on 812 Reviews
Holiday summary
7 nights from 15 July 2026
Self Catering
2 x Adults
0 x Children
1 x Apartment
2 x 10kg Hand Baggage
2 x 22kg Bag Allowance
Coach transfers included
Flight details
Going out
Leeds Bradford LBA to Tenerife TFS
Coming back
Tenerife TFS to Leeds Bradford LBA
Payable to your travel agent
£1,140
Price per person
£570`;

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
  assert.equal(parsed.name, 'Lassi, Kefalonia');
  assert.equal(parsed.sourceLocation, 'Lassi, Kefalonia');
  assert.equal(parsed.ship, 'Sunset Paradise Resort');
  assert.equal(parsed.nights, '7');
  assert.equal(parsed.boardlbl, 'Bed & Breakfast');
  assert.equal(`${parsed.day} ${parsed.month}`, '21 July 2026');
  assert.equal(parsed.sailingFrom, 'Newcastle');
  assert.equal(parsed.roomType, 'Studio');
  assert.equal(parsed.adults, '2');
  assert.equal(parsed.children, '0');
  assert.equal(parsed.handLuggage, '');
  assert.equal(parsed.holdLuggage, '');
  assert.equal(parsed.transfers, '');
  assert.equal(parsed.price, '574');
  assert.equal(parsed.leadPrice, '574');
  assert.equal(parsed.pricePerPerson, '574');
  assert.equal(parsed.totalPrice, '1148');
  assert.equal(parsed.bookingTotal, '1148');
  assert.equal(parsed.localFeeAmount, '24');
  assert.equal(parsed.localFeeType, 'total');
  assert.equal(parsed.localFeePerPerson, '12');
  assert.equal(parsed.resortFee, '12pp');
  assert.equal(parsed.localFeeApproximate, 'true');
  assert.equal(parsed.localFeeWording, 'Approximately £24 total tourist tax payable locally');
  assert.equal(parsed.incl, 'Luggage & Transfers Included');
  assert.equal(parsed.flightDisplay, 'Newcastle Flights');
  assert.equal(parsed.freeChildPlace || 'false', 'false');
  assert.doesNotMatch([parsed.name, parsed.ship, parsed.incl, parsed.basis].join(' '), /Our Rating|TripAdvisor|176 Reviews|Holiday summary|Flight details|Payable to your travel agent|Going out|Coming back|06:00|12:00/i);
});


test('additional Dawson Jet2 quotations parse hotel and destination without OCR noise', () => {
  const { isTrustedJet2DawsonQuote, detectPackageOffer, parsePackageOfferText } = createContext();
  [
    [jet2WhiteCity, 'White City Beach Hotel', 'Antalya, Turkey', 'Leeds Bradford', '703'],
    [jet2Castillo, 'Servatur Castillo De Sol', 'Puerto Rico, Gran Canaria', 'Leeds Bradford', '515'],
    [jet2Caribe, 'Servatur Caribe Apartments', 'Playa De Las Americas, Tenerife', 'Leeds Bradford', '570']
  ].forEach(([fixture, hotel, destination, airport, price]) => {
    assert.equal(isTrustedJet2DawsonQuote(fixture), true, hotel);
    assert.equal(detectPackageOffer(fixture).operatorKey, 'jet2', hotel);
    const parsed = parsePackageOfferText(fixture, {}).parsed;
    assert.equal(parsed.operatorKey, 'jet2');
    assert.equal(parsed.ship, hotel);
    assert.equal(parsed.name, destination);
    if(hotel === 'White City Beach Hotel') assert.equal(parsed.sourceLocation, 'Nr Alanya, Antalya Area');
    assert.equal(parsed.sailingFrom, airport);
    assert.equal(parsed.price, price);
    if(hotel === 'White City Beach Hotel'){
      assert.equal(parsed.boardlbl, 'All Inclusive');
      assert.equal(parsed.day, '7th');
      assert.equal(parsed.month, 'July 2026');
      assert.equal(parsed.flightDisplay, 'Leeds Bradford Flights');
      assert.equal(parsed.priceLabel, '');
      assert.equal(parsed.bookingTotal, '1406');
      assert.notEqual(parsed.ship, 'Plus');
      assert.notEqual(parsed.ship, '.. Plus');
    }
    assert.notEqual(parsed.price, parsed.bookingTotal || parsed.totalPrice, hotel);
    assert.doesNotMatch([parsed.ship, parsed.name, parsed.destination].join(' '), /Plus|Your holiday to|Our rating|TripAdvisor|Reviews|Holiday summary|Flight details|Payable|\. plus/i);
  });
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
  assert.equal(parsed.name, 'Lassi, Kefalonia');
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
  assert.equal(parsed.handLuggage, '');
  assert.equal(parsed.holdLuggage, '');
  assert.equal(parsed.transfers, '');
  assert.equal(parsed.incl, 'Luggage & Transfers Included');
  assert.equal(parsed.inclusionsDisplay, 'Luggage & Transfers Included');
  assert.equal(parsed.price, '574');
  assert.equal(parsed.leadPrice, '574');
  assert.equal(parsed.pricePerPerson, '574');
  assert.equal(parsed.totalPrice, '1148');
  assert.equal(parsed.bookingTotal, '1148');
  assert.equal(parsed.localFeeAmount, '24');
  assert.equal(parsed.localFeeType, 'total');
  assert.equal(parsed.localFeePerPerson, '12');
  assert.equal(parsed.resortFee, '12pp');
  assert.equal(parsed.localFeeApproximate, 'true');
  assert.equal(parsed.localFeeWording, 'Approximately £24 total tourist tax payable locally');
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
    extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_BOARD_BASES'), extractConst('PACKAGE_FEATURES'), extractConst('PACKAGE_AIRPORTS'), extractConst('JET2_APPROVED_INCLUSION_COPY'),
    'const PARSE_FIELD_MAP={operatorKey:"f-operator",tags:"f-tags",name:"f-name",ship:"f-ship",incl:"f-incl",price:"f-price",basis:"f-basis",board:"f-board",boardlbl:"f-boardlbl",day:"f-day",month:"f-month",nights:"f-nights",ports:"f-ports"};',
    extractFunction('getActiveRenderCampaignType'), extractFunction('normalisePackageOperatorKey'), extractFunction('isPackageOperator'), extractFunction('isPackageOffer'), extractFunction('packageOfferHasGenuineData'), extractFunction('packageDefaultCopyValue'), extractFunction('normalisePackageCopyOverrides'), extractFunction('packageCopyValue'), extractFunction('applyPackageCopyInputOverrides'), extractFunction('packageCopyEditorValue'),
    extractFunction('isTrustedJet2DawsonQuote'), extractFunction('getPackageOperatorMatch'), extractFunction('detectPackageOffer'), extractFunction('normaliseVisionExtractedText'), extractFunction('normalisePackageOcrText'), extractFunction('titleCasePackageValue'), extractFunction('detectPackageBoardBasis'), extractFunction('extractPackageDepartureAirport'), extractFunction('extractPackageSharingBasis'), extractFunction('extractPackagePrices'), extractFunction('isUnsafePackageTitleLine'), extractFunction('cleanPackageParsedTitle'), extractFunction('sanitisePackageHotelCandidate'), extractFunction('extractHolidaySummaryAccommodation'), extractFunction('extractStructuredPackageAccommodation'), extractFunction('extractHolidayToAccommodation'), extractFunction('parseJet2DawsonQuote'), extractFunction('isJet2SourceInclusionCopy'), extractFunction('normaliseJet2PackageInclusionCopy'), extractFunction('parsePackageOfferText'), extractFunction('parseScreenshotTextForActiveBuilder'), extractFunction('getBulkPackageImportFallbackOperator'), extractFunction('isUnsafeImportedPackageVisibleValue'), extractFunction('normaliseBulkImportedPackageOffer'), extractFunction('applyParsedOfferToSlot'),
    extractFunction('formatPackageOrdinalDate'), extractFunction('packageOfferFromData'), extractFunction('formatPackageMoney'), extractFunction('packageAirportLine'), extractFunction('packageResortFeeText'), extractFunction('renderPackagePriceBlock'), extractFunction('renderPackageOperatorLogo'), extractFunction('renderPackageCard')
  ].join('\n'), context);

  const result = vm.runInContext('parseScreenshotTextForActiveBuilder(raw)', Object.assign(context, { raw: realTrelloJet2Ocr }));
  assert.equal(result.parsed.operatorKey, 'jet2');
  assert.equal(result.parsed.ship, 'Sunset Paradise Resort');

  const loaded = vm.runInContext('applyParsedOfferToSlot(result, 0, raw)', Object.assign(context, { result, raw: realTrelloJet2Ocr }));
  assert.equal(loaded, true);
  const active = context.offers[0];
  assert.equal(active.operator, 'jet2');
  assert.equal(active.name, 'Lassi, Kefalonia');
  assert.equal(active.ship, 'Sunset Paradise Resort');
  assert.equal(active.flightDisplay, 'Newcastle Flights');
  assert.equal(active.inclusionsDisplay, 'Luggage & Transfers Included');
  assert.equal(active.localFeeAmount, '24');
  assert.equal(active.localFeeType, 'total');

  const htmlOutput = vm.runInContext('renderPackageCard(offers[0])', context);
  const visibleText = htmlOutput.replace(/<span class=\"pkg-pp\">pp<\/span>/g, 'pp').replace(/<[^>]+>/g, '');
  ['Lassi, Kefalonia','Sunset Paradise Resort','21st July 2026','Newcastle Flights','Luggage &amp; Transfers Included','+£12pp Local Resort Fee','Based on 2 Adults Sharing','assets/package-skins/jet2/header-couples.png','assets/package-skins/jet2/footer.png','assets/operator-logos/jet2-holidays-logo.png'].forEach(expected => assert.match(htmlOutput, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(htmlOutput, /pkg-skin-header/);
  assert.equal((htmlOutput.match(/assets\/operator-logos\/jet2-holidays-logo\.png/g) || []).length, 1);
  assert.match(visibleText, /£574pp/);
  assert.match(visibleText, /\+£12pp Local Resort Fee/);
  assert.match(visibleText, /£586pp/);
  assert.match(visibleText, /Total Price/);
  assert.doesNotMatch(htmlOutput, /Operator not detected|Our Rating|TripAdvisor|176 Reviews|Hand Luggage Included|Coach Transfers/);
});

test('live Package editor input IDs update authoritative offer and preview-rendered HTML', () => {
  function extractLastFunction(name) { const start=html.lastIndexOf(`function ${name}(`); assert.notEqual(start,-1,`Could not find last ${name}`); const open=html.indexOf('{',start); let depth=0; for(let i=open;i<html.length;i++){ if(html[i]==='{') depth++; if(html[i]==='}') depth--; if(depth===0) return html.slice(start,i+1);} throw new Error(name); }
  const fields = new Map();
  const makeField = value => ({ value, classList:{ toggle(){}, add(){}, remove(){} }, style:{}, innerHTML:'', dataset:{}, offsetHeight:100, scrollHeight:100, getBoundingClientRect(){ return {height:100}; } });
  ['offerType','operator','name','ship','sailingFrom','price','leadPrice','totalPrice','resortFee','ctaPrimary','ctaSecondary','adults','children','nights','board','boardlbl','day','month','incl','packagePerPersonSuffix'].forEach(id => fields.set(`f-${id}`, makeField('')));
  fields.get('f-offerType').value = 'package';
  fields.get('f-operator').value = 'jet2';
  fields.get('f-name').value = 'Kefalonia, Greece';
  fields.get('f-ship').value = 'Sunset Paradise Resort';
  fields.get('f-sailingFrom').value = 'Newcastle';
  fields.get('f-price').value = '574';
  fields.get('f-totalPrice').value = '586';
  fields.get('f-resortFee').value = '12';
  fields.get('f-ctaPrimary').value = 'Start your booking';
  fields.get('f-ctaSecondary').value = 'or visit us in store';
  fields.get('f-adults').value = '2';
  fields.get('f-children').value = '0';
  fields.get('f-nights').value = '7';
  fields.get('f-board').value = 'BB';
  fields.get('f-boardlbl').value = 'Bed & Breakfast';
  fields.get('f-incl').value = 'Luggage & Transfers Included';
  fields.get('f-packagePerPersonSuffix').value = 'pp';
  fields.set('card-output', makeField(''));
  fields.set('preview-scaler', makeField(''));
  const context = {
    console, window:{}, currentCampaignType:'package', offers:[{offerType:'package'}, {offerType:'package'}], cur:0, viewMode:'single', zoomPct:100, SINGLE_PREVIEW_SCALE:1, previewRenderGeneration:0,
    document:{ getElementById(id){ return fields.get(id) || null; }, querySelector(){ return null; }, querySelectorAll(){ return []; } },
    normaliseCampaignType(value){ return String(value||'package').toLowerCase(); }, stripTransientPasteOfferFields(o){ return o; }, getCtaSettingsFromUI(){ return {enabled:false}; }, normaliseCtaSettings(s){ return s || {enabled:false}; },
    renderEmptyPreviewIfNeeded(){ return false; }, updatePreviewTitle(){}, adjustVisitSectionHeights(){}, bindSinglePreviewHeroPickerTargets(){}, enhanceClickableHeroImagesAndPlaceholders(){}, enhanceHeroDropTarget(){}, scheduleHeroCropPositions(){}, setScalerBox(){}, schedulePreviewBoundsLayout(){},
    syncTopBarUspManualState(){}, autoBoardLabel(){}, saveRawPasteForOffer(){}, applyAutoSailingFromToOffer(){}, getAutoSailingFromForOffer(){ return ''; }, getAutoSailingFromForPorts(){ return ''; }, isOperatorValidForCampaign(){ return true; }, cobTraceSourceTag(o){ return o; }, cobTraceOfferSnapshot(){}, cobTraceInferSource(){ return 'test'; }, cobRenderTraceEnabled(){ return false; }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('escapeHtml'), extractFunction('isLivePackagePlainTextInput'), extractConst('FLDS'), extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_BOARD_BASES'), extractConst('PACKAGE_FEATURES'), extractConst('PACKAGE_AIRPORTS'), extractConst('JET2_APPROVED_INCLUSION_COPY'),
    extractFunction('getActiveRenderCampaignType'), extractFunction('normalisePackageOperatorKey'), extractFunction('isPackageOffer'), extractFunction('packageOfferHasGenuineData'), extractFunction('packageDefaultCopyValue'), extractFunction('normalisePackageCopyOverrides'), extractFunction('packageCopyValue'), extractFunction('applyPackageCopyInputOverrides'), extractFunction('packageCopyEditorValue'), extractConst('PACKAGE_EDITOR_FIELD_MAP'), extractFunction('packageCanonicalEditorField'), extractFunction('packageEditorValueForField'), extractFunction('syncPackageCanonicalFields'), extractFunction('applyPackageEditorFieldsToCanonical'), extractFunction('packageNumericValue'), extractFunction('packageCleanNumericString'), extractFunction('applyJet2PackageDefaults'), extractFunction('normalisePackagePricingFields'), extractFunction('formatPackageOrdinalDate'), extractFunction('packageOfferFromData'), extractFunction('formatPackageMoney'), extractFunction('packageAirportLine'), extractFunction('packageResortFeeText'), extractFunction('renderPackagePriceBlock'), extractFunction('renderPackageOperatorLogo'), extractFunction('renderPackageCard'), extractFunction('cleanCardFieldValue'), extractFunction('cleanCardFieldLines'), extractFunction('cleanCardFacingOfferData'), extractFunction('renderCardHTML'), 'function bc(d){ return renderCardHTML(d); }', extractFunction('renderOfferWithOptionalCtaHTML'), extractFunction('visibleFieldsToData'), extractFunction('commitVisibleFields'), extractFunction('renderVisibleCard')
  ].join('\n'), context);

  vm.runInContext('commitVisibleFields(); renderVisibleCard();', context);
  assert.equal(context.offers[0].operator, 'jet2');
  assert.equal(context.offers[0].ctaSecondary, 'or visit us in store');
  assert.match(fields.get('card-output').innerHTML, /or visit us in store/);
  assert.equal(context.offers[0].inclusions, 'Luggage & Transfers Included');
  assert.equal(context.offers[0].departureAirport, 'Newcastle');
  assert.match(fields.get('card-output').innerHTML, /assets\/operator-logos\/jet2-holidays-logo\.png/);
  assert.match(fields.get('card-output').innerHTML.replace(/<span class="pkg-pp">pp<\/span>/g, 'pp').replace(/<[^>]+>/g, ''), /£574pp[\s\S]*\+£12pp Local Resort Fee/);
  assert.match(fields.get('card-output').innerHTML.replace(/<span class="pkg-pp">pp<\/span>/g, 'pp').replace(/<[^>]+>/g, ''), /£586pp/);

  fields.get('f-price').value = '499';
  fields.get('f-totalPrice').value = '511';
  fields.get('f-resortFee').value = '15';
  fields.get('f-ctaSecondary').value = 'or call into your local store';
  fields.get('f-boardlbl').value = 'Half Board';
  fields.get('f-sailingFrom').value = 'Manchester';
  fields.get('f-incl').value = 'Luggage, transfers and meals included';
  vm.runInContext('commitVisibleFields(); renderVisibleCard();', context);
  const text = fields.get('card-output').innerHTML.replace(/<span class="pkg-pp">pp<\/span>/g, 'pp').replace(/<[^>]+>/g, '');
  assert.equal(context.offers[0].price, '499');
  assert.equal(context.offers[0].leadPrice, '499');
  assert.equal(context.offers[0].totalPrice, '499');
  assert.equal(context.offers[0].bookingTotal, '511');
  assert.equal(context.offers[0].resortFee, '15pp');
  assert.equal(context.offers[0].ctaSecondary, 'or call into your local store');
  assert.equal(context.offers[0].boardBasis, 'Half Board');
  assert.equal(context.offers[0].departureAirport, 'Manchester');
  assert.equal(context.offers[0].inclusions, 'Luggage, transfers and meals included');
  assert.match(text, /£499pp[\s\S]*\+£15pp Local Resort Fee/);
  assert.match(text, /£514pp/);
  assert.match(text, /Total Price/);
  assert.match(text, /or call into your local store/);
  assert.match(text, /Half Board/);
  fields.get('f-boardlbl').value = 'All Inclusive';
  vm.runInContext('commitVisibleFields(); renderVisibleCard();', context);
  assert.equal(context.offers[0].boardBasis, 'All Inclusive');
  assert.match(fields.get('card-output').innerHTML.replace(/<[^>]+>/g, ''), /All Inclusive/);
  assert.match(text, /Manchester Flights/);
  assert.match(text, /Luggage, transfers and meals included/);
});

test('real Jet2 Package live input and keyboard paths update model and rendered card', () => {
  function extractLastFunction(name) { const start=html.lastIndexOf(`function ${name}(`); assert.notEqual(start,-1,`Could not find last ${name}`); const open=html.indexOf('{',start); let depth=0; for(let i=open;i<html.length;i++){ if(html[i]==='{') depth++; if(html[i]==='}') depth--; if(depth===0) return html.slice(start,i+1);} throw new Error(name); }
  const fields = new Map();
  const listeners = {};
  const makeField = (value, id) => ({ id, value, style:{}, innerHTML:'', dataset:{}, classList:{ toggle(){}, add(){}, remove(){} }, offsetHeight:885, getBoundingClientRect(){ return {height:885}; }, matches(sel){ return /input/.test(sel); }, closest(sel){ return /input/.test(sel) ? this : null; }, addEventListener(type, fn){ listeners[id+':'+type]=fn; }, focus(){ context.document.activeElement=this; }, select(){ this.selectionStart=0; this.selectionEnd=this.value.length; } });
  ['offerType','operator','name','ship','sailingFrom','price','leadPrice','totalPrice','resortFee','priceLabel','basis','ctaPrimary','ctaSecondary','adults','children','nights','board','boardlbl','day','month','incl','packagePerPersonSuffix','packageResortFeeLabel','packageNightsLabel','packageFlightsLabel'].forEach(id => fields.set(`f-${id}`, makeField('', `f-${id}`)));
  Object.assign(fields.get('f-offerType'), {value:'package'});
  Object.assign(fields.get('f-operator'), {value:'jet2'});
  fields.get('f-name').value='Kefalonia, Greece'; fields.get('f-ship').value='Sunset Paradise Resort'; fields.get('f-sailingFrom').value='Newcastle'; fields.get('f-price').value='574'; fields.get('f-totalPrice').value='586'; fields.get('f-resortFee').value='12'; fields.get('f-adults').value='2'; fields.get('f-children').value='0'; fields.get('f-nights').value='7'; fields.get('f-board').value='BB'; fields.get('f-boardlbl').value='Bed & Breakfast'; fields.get('f-incl').value='Luggage & Transfers Included'; fields.get('f-ctaPrimary').value='Start your booking'; fields.get('f-ctaSecondary').value='or visit us in store'; fields.get('f-priceLabel').value='Total Price'; fields.get('f-basis').value='Based on 2 Adults Sharing';
  fields.set('card-output', makeField('', 'card-output')); fields.set('preview-scaler', makeField('', 'preview-scaler'));
  const context = { console, window:{}, currentCampaignType:'package', offers:[{offerType:'package', operator:'jet2'}], cur:0, viewMode:'single', zoomPct:100, SINGLE_PREVIEW_SCALE:1, previewRenderGeneration:0,
    document:{ activeElement:null, getElementById(id){ return fields.get(id) || null; }, querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(type, fn){ listeners['document:'+type]=fn; } },
    normaliseCampaignType(v){ return String(v||'package').toLowerCase(); }, stripTransientPasteOfferFields(o){ return o; }, getCtaSettingsFromUI(){ return {enabled:false}; }, normaliseCtaSettings(s){ return s||{enabled:false}; },
    renderEmptyPreviewIfNeeded(){ return false; }, updatePreviewTitle(){}, adjustVisitSectionHeights(){}, bindSinglePreviewHeroPickerTargets(){}, enhanceClickableHeroImagesAndPlaceholders(){}, enhanceHeroDropTarget(){}, scheduleHeroCropPositions(){}, setScalerBox(){}, schedulePreviewBoundsLayout(){}, syncTopBarUspManualState(){}, autoBoardLabel(){}, saveRawPasteForOffer(){}, isOperatorValidForCampaign(){ return true; }, cobTraceSourceTag(o){ return o; }, cobTraceOfferSnapshot(){}, cobTraceInferSource(){ return 'test'; }, cobRenderTraceEnabled(){ return false; }, queueAutosave(){}, genUtm(){}, genStandardUtms(){}, updateAllStatus(){}, checkPortsWarn(){}, runSpellQA(){}, updateExportFilenames(){}, isCloseWindowShortcut(){ return false; }, closeActiveBuilderModal(){ return false; }, isQuestionMarkShortcut(){ return false; }, isCampaignSummaryShortcut(){ return false; } };
  vm.createContext(context);
  vm.runInContext([extractFunction('escapeHtml'), extractFunction('isLivePackagePlainTextInput'), extractConst('FLDS'), extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_EDITOR_FIELD_MAP'), extractFunction('getActiveRenderCampaignType'), extractFunction('normalisePackageOperatorKey'), extractFunction('packageOfferHasGenuineData'), extractFunction('packageDefaultCopyValue'), extractFunction('normalisePackageCopyOverrides'), extractFunction('packageCopyValue'), extractFunction('applyPackageCopyInputOverrides'), extractFunction('packageCopyEditorValue'), extractFunction('packageCanonicalEditorField'), extractFunction('packageEditorValueForField'), extractFunction('syncPackageCanonicalFields'), extractFunction('applyPackageEditorFieldsToCanonical'), extractFunction('packageNumericValue'), extractFunction('packageCleanNumericString'), extractFunction('applyJet2PackageDefaults'), extractFunction('normalisePackagePricingFields'), extractFunction('formatPackageOrdinalDate'), extractFunction('packageOfferFromData'), extractFunction('formatPackageMoney'), extractFunction('packageAirportLine'), extractFunction('packageResortFeeText'), extractFunction('renderPackagePriceBlock'), extractFunction('renderPackageOperatorLogo'), extractFunction('renderPackageCard'), extractFunction('cleanCardFieldValue'), extractFunction('cleanCardFieldLines'), extractFunction('cleanCardFacingOfferData'), extractFunction('renderCardHTML'), 'function renderOfferWithOptionalCtaHTML(d){ return renderCardHTML(d); }', extractFunction('visibleFieldsToData'), extractFunction('commitVisibleFields'), extractFunction('renderVisibleCard'), extractLastFunction('up'), extractFunction('isEditableShortcutNode'), extractFunction('isShortcutBlockedTarget'), extractFunction('handleKeyboardShortcut')].join('\n'), context);
  vm.runInContext('up();', context);
  assert.equal(context.offers[0].ctaPrimary, 'Start your booking');
  assert.equal(context.offers[0].ctaSecondary, 'or visit us in store');
  assert.match(fields.get('card-output').innerHTML, /or visit us in store/);
  fields.get('f-boardlbl').value='Half Board'; vm.runInContext('up();', context); assert.equal(context.offers[0].boardBasis, 'Half Board'); assert.match(fields.get('card-output').innerHTML, /Half Board/);
  fields.get('f-boardlbl').value='All Inclusive'; vm.runInContext('up();', context); assert.equal(context.offers[0].boardBasis, 'All Inclusive'); assert.match(fields.get('card-output').innerHTML, /All Inclusive/);
  const cta = fields.get('f-ctaSecondary'); cta.focus(); cta.value='';
  function typeLiveCtaSecondary(text){
    cta.focus(); cta.value='';
    let expected='';
    for (const ch of text) {
      const keydown={key:ch, target:{closest(){ return null; }}, defaultPrevented:false, preventDefault(){ this.defaultPrevented=true; }, composedPath(){ return [{closest(){ return null; }}, cta]; }};
      context.handleKeyboardShortcut(keydown);
      assert.equal(keydown.defaultPrevented, false, `Space/character keydown must not be prevented for ${JSON.stringify(expected + ch)}`);
      const beforeinput={inputType: ch === ' ' ? 'insertText' : 'insertText', data:ch, target:cta, defaultPrevented:false, preventDefault(){ this.defaultPrevented=true; }, composedPath(){ return [cta]; }};
      assert.equal(beforeinput.defaultPrevented, false);
      cta.value += ch;
      expected += ch;
      const input={inputType:'insertText', data:ch, target:cta, defaultPrevented:false, preventDefault(){ this.defaultPrevented=true; }, composedPath(){ return [cta]; }};
      vm.runInContext('up();', context);
      assert.equal(input.defaultPrevented, false);
      assert.equal(cta.value, expected, `DOM CTA Secondary value after ${JSON.stringify(expected)}`);
      assert.equal(context.offers[0].ctaSecondary, expected, `model CTA Secondary value after ${JSON.stringify(expected)}`);
      assert.match(fields.get('card-output').innerHTML, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.equal(cta.value, text);
    assert.equal(context.offers[0].ctaSecondary, text);
    assert.match(fields.get('card-output').innerHTML, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  typeLiveCtaSecondary('or visit us in store');
  typeLiveCtaSecondary('or call into your local store');
  typeLiveCtaSecondary('book online or visit us in store');
});


test('Load Selected Imports route persists Jet2 package classification for operatorless package screenshots', () => {
  const fields = new Map();
  const makeField = value => ({ value, hidden:false, classList:{ toggle(){}, add(){}, remove(){} }, style:{}, innerHTML:'', textContent:'', dataset:{} });
  fields.set('f-operator', makeField(''));
  fields.set('vision-review-text', makeField(''));
  fields.set('screenshot-load-selected', makeField(''));
  fields.set('screenshot-import-review', makeField(''));
  fields.set('vision-review-panel', makeField(''));
  fields.set('offer-type-detection', makeField('Offer type not recognised'));
  fields.set('card-output', makeField(''));
  const context = {
    console, window:{}, currentCampaignType:'package', cur:0, offers:[
      {offerType:'package', operator:'jet2', name:'Approved Destination 1', ship:'Approved Hotel 1', price:'111', nights:'7'},
      {offerType:'package', operator:'jet2', name:'Approved Destination 2', ship:'Approved Hotel 2', price:'222', nights:'7'},
      {}, {}
    ], pendingScreenshotImports:[], activeScreenshotImportIndex:0,
    document:{ getElementById(id){ return fields.get(id) || null; }, querySelectorAll(){ return []; } },
    normaliseCampaignType(v){ return String(v||'package').toLowerCase(); }, isOfferLocked(){ return false; }, isOfferLoaded(o){ return !!(o && (o.offerType==='package' || o.name || o.ship || o.price)); },
    clearHeroImageDataFromOffer(){}, defaultTopBarUspForOperator(){ return ''; }, applyOperatorTopBarUspDefault(){},
    setVisionStatus(message,type){ context.lastVisionStatus={message,type}; }, load(i){ context.loadedIndex=i; }, refreshOfferUi(){}, recordCampaignHistoryAfterAsyncChange(){},
    formatPackageOrdinalDate(value){ return value; }, escapeHtml(value){ return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  };
  vm.createContext(context);
  vm.runInContext([
    'function escapeRegExp(value){ return String(value||"").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }',
    extractConst('PACKAGE_OFFER_DETECTION_THRESHOLD'), extractConst('PACKAGE_OFFER_SIGNAL_WEIGHTS'), extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_BOARD_BASES'), extractConst('PACKAGE_FEATURES'), extractConst('PACKAGE_AIRPORTS'), extractConst('JET2_APPROVED_INCLUSION_COPY'),
    'const PARSE_FIELD_MAP={operatorKey:"f-operator",tags:"f-tags",name:"f-name",ship:"f-ship",incl:"f-incl",price:"f-price",basis:"f-basis",board:"f-board",boardlbl:"f-boardlbl",day:"f-day",month:"f-month",nights:"f-nights",ports:"f-ports"}; const PERSISTED_PASTE_OFFER_KEY="_rawPastedOfferText"; const TRANSIENT_PASTE_OFFER_KEYS=["rawPaste","pasteText","parsedRaw"];',
    extractFunction('getOrderedScreenshotImports'), extractFunction('getPackageOperatorDisplayName'), extractFunction('getScreenshotImportTitle'), extractFunction('getScreenshotImportSummaryLines'), extractFunction('getScreenshotImportReviewedText'), extractFunction('getScreenshotImportOperatorStatus'), extractFunction('hasScreenshotImportMissingOperatorWarning'), extractFunction('renderScreenshotImportReview'), extractFunction('getAvailableScreenshotImportSlots'), extractFunction('getScreenshotCampaignCapacityMessage'),
    extractFunction('isTrustedJet2DawsonQuote'), extractFunction('getPackageOperatorMatch'), extractFunction('detectPackageOffer'), extractFunction('detectOfferType'), extractFunction('normaliseVisionExtractedText'), extractFunction('normalisePackageOcrText'), extractFunction('titleCasePackageValue'), extractFunction('detectPackageBoardBasis'), extractFunction('extractPackageDepartureAirport'), extractFunction('extractPackageSharingBasis'), extractFunction('extractPackagePrices'), extractFunction('isUnsafePackageTitleLine'), extractFunction('cleanPackageParsedTitle'), extractFunction('sanitisePackageHotelCandidate'), extractFunction('extractHolidaySummaryAccommodation'), extractFunction('extractStructuredPackageAccommodation'), extractFunction('extractHolidayToAccommodation'), extractFunction('parseJet2DawsonQuote'), extractFunction('isJet2SourceInclusionCopy'), extractFunction('normaliseJet2PackageInclusionCopy'), extractFunction('parsePackageOfferText'), extractFunction('parseScreenshotTextForActiveBuilder'),
    extractFunction('normalisePackageOperatorKey'), extractFunction('isPackageOperator'), extractFunction('packageOfferHasGenuineData'), extractFunction('packageDefaultCopyValue'), extractFunction('normalisePackageCopyOverrides'), extractFunction('packageCopyValue'), extractFunction('applyPackageCopyInputOverrides'), extractConst('PACKAGE_EDITOR_FIELD_MAP'), extractFunction('syncPackageCanonicalFields'), extractFunction('applyJet2PackageDefaults'), extractFunction('packageNumericValue'), extractFunction('packageCleanNumericString'), extractFunction('normalisePackagePricingFields'),
    extractFunction('getBulkPackageImportFallbackOperator'), extractFunction('isUnsafeImportedPackageVisibleValue'), extractFunction('normaliseBulkImportedPackageOffer'), extractFunction('stripTransientPasteOfferFields'), extractFunction('applyParsedOfferToSlot'), extractFunction('loadSelectedScreenshotImports'),
    extractFunction('formatPackageMoney'), extractFunction('packageAirportLine'), extractFunction('packageResortFeeText'), extractFunction('renderPackagePriceBlock'), extractFunction('renderPackageOperatorLogo'), extractFunction('formatPackageOrdinalDate'), extractFunction('packageOfferFromData'), extractFunction('renderPackageCard'), extractFunction('setOfferTypeDetection')
  ].join('\n'), context);

  const offer3 = `Dawson & Sanderson
Your holiday to...
Servatur Castillo De Sol
Puerto Rico, Gran Canaria
Our Rating +++
TripAdvisor Traveller Rating
Based on 631 Reviews
Holiday summary
Accommodation
Servatur Castillo De Sol
7 nights from 9th July 2026
Self Catering
2 Adults
1 × Apartment
2 x 10kg Hand Baggage
2 x 22kg Bag Allowance
Coach Transfers
Flight details
Going out
Manchester MAN to Gran Canaria LPA
Departs: Thu 9th Jul 2026 at 06:00
Coming back
Gran Canaria LPA to Manchester MAN
Payable To your travel agent
£1,030
Price per person
£515`;
  const offer4 = `Your Holiday To... 2 0 0 ¢\nServatur Caribe Apartments, Playa De Las Americas, Tenerife Departs: Wed 15th Jul 2026 At 16:45 Price Ort Payable To Your Travel Agent\n7 Nights\nSelf Catering\n15th July 2026\nHand Luggage Included\nCoach Transfers\n£570pp\nBased on 2 Adults Sharing`;
  fields.get('vision-review-text').value = offer3;
  context.pendingScreenshotImports = [offer3, offer4].map((text, uploadOrder) => ({ uploadOrder, text, reviewText:text, result: context.parseScreenshotTextForActiveBuilder(text), status:'ready', selected:true }));
  vm.runInContext('loadSelectedScreenshotImports()', context);

  assert.equal(context.offers[0].name, 'Approved Destination 1');
  assert.equal(context.offers[1].ship, 'Approved Hotel 2');
  for (const idx of [2, 3]) {
    assert.equal(context.offers[idx].offerType, 'package');
    assert.equal(context.offers[idx].operator, 'jet2');
    const card = context.renderPackageCard(context.offers[idx]);
    assert.match(card, /pc pkg-jet2 pkg-jet2-couples/);
    assert.match(card, /assets\/operator-logos\/jet2-holidays-logo\.png/);
    assert.doesNotMatch(card, /Operator not detected|Your Holiday To|Payable To|16:45|200¢|200 ¢|_rawPastedOfferText/);
  }
  assert.equal(context.offers[2].name, 'Puerto Rico, Gran Canaria');
  assert.equal(context.extractHolidaySummaryAccommodation(offer3.split(/\n+/).map(line => line.trim()).filter(Boolean)), 'Servatur Castillo De Sol');
  assert.equal(context.offers[2].ship, 'Servatur Castillo De Sol');
  assert.equal(context.offers[2].hotel, 'Servatur Castillo De Sol');
  assert.equal(context.offers[2].sailingFrom, 'Manchester');
  assert.equal(context.offers[2].departureAirport, 'Manchester');
  assert.equal(context.offers[2].incl, 'Luggage & Transfers Included');
  assert.equal(context.offers[2].inclusions, 'Luggage & Transfers Included');
  assert.equal(context.offers[2].inclusionsDisplay, 'Luggage & Transfers Included');
  assert.equal(context.offers[2].handLuggage || '', '');
  assert.equal(context.offers[2].transfers || '', '');
  assert.equal(context.offers[2].price, '515');
  assert.equal(context.offers[2].totalPrice, '1030');
  assert.doesNotMatch(context.offers[2].ship, /Your holiday to|Puerto Rico|Departs|06:00|£1,030|Payable|1 × Apartment|Self Catering|Adults/i);
  assert.equal(context.offers[3].ship, 'Servatur Caribe Apartments');
  assert.equal(context.offers[3].name, 'Playa De Las Americas, Tenerife');
  assert.equal(context.offers[3].sailingFrom || '', '');
  assert.equal(context.offers[3].departureAirport || '', '');
  assert.equal(context.pendingScreenshotImports[0].result.parsed.operatorKey, 'jet2');
  assert.equal(context.getScreenshotImportOperatorStatus(context.pendingScreenshotImports[1]), 'Jet2 assigned from campaign');
  assert.doesNotMatch(fields.get('screenshot-import-review').innerHTML, /Operator not detected|Offer type not recognised/);
  assert.match(fields.get('screenshot-import-review').innerHTML, /High confidence/);
  assert.equal(fields.get('offer-type-detection').textContent, 'Detected: Package');
  assert.doesNotMatch(fields.get('offer-type-detection').textContent, /Offer type not recognised/);
  assert.match(context.renderPackageCard(context.offers[2]), /Luggage &amp; Transfers Included/);
  assert.match(context.renderPackageCard(context.offers[3]), /Luggage &amp; Transfers Included/);
  assert.doesNotMatch(context.renderPackageCard(context.offers[2]), /Hand Luggage|Coach Transfers/);
  assert.doesNotMatch(context.renderPackageCard(context.offers[3]), /Hand Luggage|Coach Transfers/);


  const separateJet2 = {offerType:'package', operator:'jet2', handLuggage:'Cabin Luggage', transfers:'Transfers Included'};
  context.applyJet2PackageDefaults(separateJet2);
  assert.equal(separateJet2.incl, 'Luggage & Transfers Included');
  assert.equal(separateJet2.inclusions, 'Luggage & Transfers Included');
  assert.doesNotMatch([separateJet2.incl, separateJet2.handLuggage, separateJet2.transfers].join(' '), /Hand Luggage|Coach Transfers/);
  const manualJet2 = {offerType:'package', operator:'jet2', inclusions:'VIP lounge included', incl:'VIP lounge included'};
  context.applyJet2PackageDefaults(manualJet2);
  assert.equal(manualJet2.incl, 'VIP lounge included');
  const tuiOffer = {offerType:'package', operator:'tui', inclusions:'Hand Luggage Included · Coach Transfers', incl:'Hand Luggage Included · Coach Transfers'};
  context.syncPackageCanonicalFields(tuiOffer);
  assert.equal(tuiOffer.incl, 'Hand Luggage Included · Coach Transfers');

  const missing3 = context.parsePackageOfferText(`Puerto Rico, Gran Canaria\n7 Nights\nSelf Catering\n9th July 2026\nLeeds Bradford Flights\nHand Luggage Included\nCoach Transfers\n£1,030pp\nBased on 2 Adults Sharing`, {}).parsed;
  assert.equal(missing3.name, 'Puerto Rico, Gran Canaria');
  assert.equal(missing3.ship || '', '');
  const summaryPreferred = context.parsePackageOfferText(`Your holiday to...
Servatur Castillo De Sol
Puerto Rico, Gran Canaria
Holiday summary
Accommodation
Servatur Castillo De Sol
7 nights from 9th July 2026`, {}).parsed;
  assert.equal(summaryPreferred.ship, 'Servatur Castillo De Sol');
  assert.equal(summaryPreferred._holidaySummaryAccommodation, 'Servatur Castillo De Sol');
  const structuredOutsideSummary = context.parsePackageOfferText(`Your holiday to...
Puerto Rico, Gran Canaria
Accommodation
Servatur Castillo De Sol
Holiday summary
7 nights from 9th July 2026
Self Catering`, {}).parsed;
  assert.equal(structuredOutsideSummary.ship, 'Servatur Castillo De Sol');
  assert.equal(structuredOutsideSummary.name, 'Puerto Rico, Gran Canaria');
  assert.equal(context.extractStructuredPackageAccommodation(`Your holiday to...
Puerto Rico, Gran Canaria
Accommodation
Servatur Castillo De Sol
Holiday summary
7 nights from 9th July 2026
Self Catering`.split(/\n+/).map(line => line.trim()).filter(Boolean), {excludeHolidaySummary:true}), 'Servatur Castillo De Sol');
  const holidayToFallback = context.parsePackageOfferText(`Your holiday to...
Servatur Castillo De Sol
Puerto Rico, Gran Canaria
Holiday summary
7 nights from 9th July 2026
Self Catering`, {}).parsed;
  assert.equal(holidayToFallback.ship, 'Servatur Castillo De Sol');
  const noConfidentHotel = context.parsePackageOfferText(`Your holiday to...
Puerto Rico, Gran Canaria
Holiday summary
7 nights from 9th July 2026
Self Catering
1 × Apartment`, {}).parsed;
  assert.equal(noConfidentHotel.name, 'Puerto Rico, Gran Canaria');
  assert.equal(noConfidentHotel.ship || '', '');
  assert.doesNotMatch([summaryPreferred.ship, holidayToFallback.ship, noConfidentHotel.name].join(' '), /Your holiday to|1 × Apartment|Payable|Departs|£|\d{1,2}:\d{2}/i);
  const missing4 = context.parsePackageOfferText(`Your Holiday To... 2 0 0 ¢\nServatur Caribe Apartments Departs: Wed 15th Jul 2026 At 16:45 Price Ort Payable To Your Travel Agent\n7 Nights\nSelf Catering\n15th July 2026\nHand Luggage Included\nCoach Transfers\n£570pp\nBased on 2 Adults Sharing`, {}).parsed;
  assert.equal(missing4.ship, 'Servatur Caribe Apartments');
  assert.equal(missing4.name || '', '');
  assert.equal(missing4.sailingFrom || '', '');
  assert.doesNotMatch([missing4.name, missing4.ship].join(' '), /Your Holiday To|Payable To|16:45|£570|Departs|Price Ort|200/);
  const restored = JSON.parse(JSON.stringify({campaignType:context.currentCampaignType, offers:context.offers}));
  assert.equal(restored.offers[2].operator, 'jet2');
  assert.equal(restored.offers[2].ship, 'Servatur Castillo De Sol');
  assert.equal(restored.offers[2].hotel, 'Servatur Castillo De Sol');
  assert.equal(restored.offers[2].sailingFrom, 'Manchester');
  assert.equal(restored.offers[2].incl, 'Luggage & Transfers Included');
  assert.equal(restored.offers[2].operator, 'jet2');
  assert.equal(restored.offers[3].offerType, 'package');
  assert.equal(restored.offers[3].operator, 'jet2');
  assert.equal(restored.offers[3].name, 'Playa De Las Americas, Tenerife');
  assert.equal(restored.offers[3].ship, 'Servatur Caribe Apartments');
  assert.equal(restored.offers[3].sailingFrom || '', '');
  assert.equal(restored.offers[0].name, 'Approved Destination 1');
  assert.equal(restored.offers[1].ship, 'Approved Hotel 2');
});

test('Jet2 Dawson package import keeps airports and hotels offer-local with blank missing values', () => {
  const { parsePackageOfferText } = createContext();
  const fixtures = [
    { raw: jet2DawsonSunset, hotel: 'Sunset Paradise Resort', destination: 'Lassi, Kefalonia', airport: 'Newcastle' },
    { raw: jet2WhiteCity, hotel: 'White City Beach Hotel', destination: 'Antalya, Turkey', airport: 'Leeds Bradford' },
    { raw: jet2Castillo, hotel: 'Servatur Castillo De Sol', destination: 'Puerto Rico, Gran Canaria', airport: 'Leeds Bradford' },
    { raw: jet2Caribe, hotel: 'Servatur Caribe Apartments', destination: 'Playa De Las Americas, Tenerife', airport: 'Leeds Bradford' }
  ];
  const parsed = fixtures.map(item => parsePackageOfferText(item.raw, {}).parsed);
  parsed.forEach((offer, index) => {
    assert.equal(offer.name, fixtures[index].destination);
    assert.equal(offer.ship, fixtures[index].hotel);
    assert.equal(offer.departureAirport, fixtures[index].airport);
    assert.equal(offer.sailingFrom, fixtures[index].airport);
    assert.equal(offer.flightDisplay, `${fixtures[index].airport} Flights`);
    assert.equal(offer.incl, 'Luggage & Transfers Included');
    assert.doesNotMatch([offer.name, offer.ship, offer.departureAirport].join(' '), /Your holiday to|Payable To|Flight details|Going out|Coming back|Departs|Arrives|LBA|NCL|\(|\)|Price/i);
  });
  assert.equal(parsed[0].departureAirport, 'Newcastle');
  assert.notEqual(parsed[0].departureAirport, parsed[1].departureAirport);

  const noAirport = parsePackageOfferText(jet2DawsonSunset.replace(/\nGoing out\nNewcastle NCL to Kefalonia EFL[\s\S]*?Coming back\nKefalonia EFL to Newcastle NCL/, '\nGoing out\nComing back'), {}).parsed;
  assert.equal(noAirport.departureAirport || '', '');
  assert.equal(noAirport.sailingFrom || '', '');

  const noHotel = parsePackageOfferText(jet2Castillo.replace(/^Servatur Castillo De Sol Our rating\n/m, ''), {}).parsed;
  assert.equal(noHotel.name, 'Puerto Rico, Gran Canaria');
  assert.equal(noHotel.ship || '', '');
  assert.equal(noHotel.departureAirport, 'Leeds Bradford');
});
