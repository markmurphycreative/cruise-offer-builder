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
  assert.equal(parsed.handLuggage, '2 x 10kg');
  assert.equal(parsed.holdLuggage, '2 x 22kg');
  assert.equal(parsed.transfers, 'Coach transfers included');
  assert.equal(parsed.price, '574');
  assert.equal(parsed.leadPrice, '574');
  assert.equal(parsed.pricePerPerson, '574');
  assert.equal(parsed.totalPrice, '1148');
  assert.equal(parsed.localFeeAmount, '24');
  assert.equal(parsed.localFeeType, 'total');
  assert.equal(parsed.localFeeApproximate, 'true');
  assert.equal(parsed.localFeeWording, 'Approximately £24 total tourist tax payable locally');
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
  assert.equal(parsed.handLuggage, '2 x 10kg');
  assert.equal(parsed.holdLuggage, '2 x 22kg');
  assert.equal(parsed.transfers, 'Coach transfers included');
  assert.equal(parsed.incl, 'Luggage & Transfers Included');
  assert.equal(parsed.inclusionsDisplay, 'Luggage & Transfers Included');
  assert.equal(parsed.price, '574');
  assert.equal(parsed.leadPrice, '574');
  assert.equal(parsed.pricePerPerson, '574');
  assert.equal(parsed.totalPrice, '1148');
  assert.equal(parsed.localFeeAmount, '24');
  assert.equal(parsed.localFeeType, 'total');
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
    extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_BOARD_BASES'), extractConst('PACKAGE_FEATURES'), extractConst('PACKAGE_AIRPORTS'),
    'const PARSE_FIELD_MAP={operatorKey:"f-operator",tags:"f-tags",name:"f-name",ship:"f-ship",incl:"f-incl",price:"f-price",basis:"f-basis",board:"f-board",boardlbl:"f-boardlbl",day:"f-day",month:"f-month",nights:"f-nights",ports:"f-ports"};',
    extractFunction('getActiveRenderCampaignType'), extractFunction('normalisePackageOperatorKey'), extractFunction('isPackageOperator'), extractFunction('isPackageOffer'), extractFunction('packageOfferHasGenuineData'), extractFunction('packageDefaultCopyValue'), extractFunction('normalisePackageCopyOverrides'), extractFunction('packageCopyValue'), extractFunction('applyPackageCopyInputOverrides'), extractFunction('packageCopyEditorValue'),
    extractFunction('isTrustedJet2DawsonQuote'), extractFunction('getPackageOperatorMatch'), extractFunction('detectPackageOffer'), extractFunction('normaliseVisionExtractedText'), extractFunction('normalisePackageOcrText'), extractFunction('titleCasePackageValue'), extractFunction('detectPackageBoardBasis'), extractFunction('extractPackageSharingBasis'), extractFunction('extractPackagePrices'), extractFunction('isUnsafePackageTitleLine'), extractFunction('cleanPackageParsedTitle'), extractFunction('parseJet2DawsonQuote'), extractFunction('parsePackageOfferText'), extractFunction('parseScreenshotTextForActiveBuilder'), extractFunction('applyParsedOfferToSlot'),
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
  ['Lassi, Kefalonia','Sunset Paradise Resort','21st July 2026','Newcastle Flights','Luggage &amp; Transfers Included','+£12pp Local Resort Fee','£586','Based on 2 Adults Sharing','assets/package-skins/jet2/header-couples.png','assets/package-skins/jet2/footer.png','assets/operator-logos/jet2-holidays-logo.png'].forEach(expected => assert.match(htmlOutput, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
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
  ['offerType','operator','name','ship','sailingFrom','price','leadPrice','totalPrice','resortFee','ctaPrimary','ctaSecondary','adults','children','nights','boardlbl','day','month','incl','packagePerPersonSuffix'].forEach(id => fields.set(`f-${id}`, makeField('')));
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
    extractFunction('escapeHtml'), extractConst('FLDS'), extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_BOARD_BASES'), extractConst('PACKAGE_FEATURES'), extractConst('PACKAGE_AIRPORTS'),
    extractFunction('getActiveRenderCampaignType'), extractFunction('normalisePackageOperatorKey'), extractFunction('isPackageOffer'), extractFunction('packageOfferHasGenuineData'), extractFunction('packageDefaultCopyValue'), extractFunction('normalisePackageCopyOverrides'), extractFunction('packageCopyValue'), extractFunction('applyPackageCopyInputOverrides'), extractFunction('packageCopyEditorValue'), extractConst('PACKAGE_EDITOR_FIELD_MAP'), extractFunction('packageCanonicalEditorField'), extractFunction('packageEditorValueForField'), extractFunction('syncPackageCanonicalFields'), extractFunction('applyPackageEditorFieldsToCanonical'), extractFunction('packageNumericValue'), extractFunction('packageCleanNumericString'), extractFunction('applyJet2PackageDefaults'), extractFunction('normalisePackagePricingFields'), extractFunction('formatPackageOrdinalDate'), extractFunction('packageOfferFromData'), extractFunction('formatPackageMoney'), extractFunction('packageAirportLine'), extractFunction('packageResortFeeText'), extractFunction('renderPackagePriceBlock'), extractFunction('renderPackageOperatorLogo'), extractFunction('renderPackageCard'), extractFunction('cleanCardFieldValue'), extractFunction('cleanCardFieldLines'), extractFunction('cleanCardFacingOfferData'), extractFunction('renderCardHTML'), 'function bc(d){ return renderCardHTML(d); }', extractFunction('renderOfferWithOptionalCtaHTML'), extractFunction('visibleFieldsToData'), extractFunction('commitVisibleFields'), extractFunction('renderVisibleCard')
  ].join('\n'), context);

  vm.runInContext('commitVisibleFields(); renderVisibleCard();', context);
  assert.equal(context.offers[0].operator, 'jet2');
  assert.equal(context.offers[0].ctaSecondary, 'or visit us in store');
  assert.match(fields.get('card-output').innerHTML, /or visit us in store/);
  assert.equal(context.offers[0].inclusions, 'Luggage & Transfers Included');
  assert.equal(context.offers[0].departureAirport, 'Newcastle');
  assert.match(fields.get('card-output').innerHTML, /assets\/operator-logos\/jet2-holidays-logo\.png/);
  assert.match(fields.get('card-output').innerHTML.replace(/<span class="pkg-pp">pp<\/span>/g, 'pp').replace(/<[^>]+>/g, ''), /£574pp[\s\S]*\+£12pp Local Resort Fee[\s\S]*£586pp/);

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
  assert.equal(context.offers[0].totalPrice, '514');
  assert.equal(context.offers[0].resortFee, '15pp');
  assert.equal(context.offers[0].ctaSecondary, 'or call into your local store');
  assert.equal(context.offers[0].boardBasis, 'Half Board');
  assert.equal(context.offers[0].departureAirport, 'Manchester');
  assert.equal(context.offers[0].inclusions, 'Luggage, transfers and meals included');
  assert.match(text, /£499pp[\s\S]*\+£15pp Local Resort Fee[\s\S]*£514pp[\s\S]*Total Price/);
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
  ['offerType','operator','name','ship','sailingFrom','price','leadPrice','totalPrice','resortFee','priceLabel','basis','ctaPrimary','ctaSecondary','adults','children','nights','boardlbl','day','month','incl','packagePerPersonSuffix','packageResortFeeLabel','packageNightsLabel','packageFlightsLabel'].forEach(id => fields.set(`f-${id}`, makeField('', `f-${id}`)));
  Object.assign(fields.get('f-offerType'), {value:'package'});
  Object.assign(fields.get('f-operator'), {value:'jet2'});
  fields.get('f-name').value='Kefalonia, Greece'; fields.get('f-ship').value='Sunset Paradise Resort'; fields.get('f-sailingFrom').value='Newcastle'; fields.get('f-price').value='574'; fields.get('f-totalPrice').value='586'; fields.get('f-resortFee').value='12'; fields.get('f-adults').value='2'; fields.get('f-children').value='0'; fields.get('f-nights').value='7'; fields.get('f-boardlbl').value='Bed & Breakfast'; fields.get('f-incl').value='Luggage & Transfers Included'; fields.get('f-ctaPrimary').value='Start your booking'; fields.get('f-ctaSecondary').value='or visit us in store'; fields.get('f-priceLabel').value='Total Price'; fields.get('f-basis').value='Based on 2 Adults Sharing';
  fields.set('card-output', makeField('', 'card-output')); fields.set('preview-scaler', makeField('', 'preview-scaler'));
  const context = { console, window:{}, currentCampaignType:'package', offers:[{offerType:'package', operator:'jet2'}], cur:0, viewMode:'single', zoomPct:100, SINGLE_PREVIEW_SCALE:1, previewRenderGeneration:0,
    document:{ activeElement:null, getElementById(id){ return fields.get(id) || null; }, querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(type, fn){ listeners['document:'+type]=fn; } },
    normaliseCampaignType(v){ return String(v||'package').toLowerCase(); }, stripTransientPasteOfferFields(o){ return o; }, getCtaSettingsFromUI(){ return {enabled:false}; }, normaliseCtaSettings(s){ return s||{enabled:false}; },
    renderEmptyPreviewIfNeeded(){ return false; }, updatePreviewTitle(){}, adjustVisitSectionHeights(){}, bindSinglePreviewHeroPickerTargets(){}, enhanceClickableHeroImagesAndPlaceholders(){}, enhanceHeroDropTarget(){}, scheduleHeroCropPositions(){}, setScalerBox(){}, schedulePreviewBoundsLayout(){}, syncTopBarUspManualState(){}, autoBoardLabel(){}, saveRawPasteForOffer(){}, isOperatorValidForCampaign(){ return true; }, cobTraceSourceTag(o){ return o; }, cobTraceOfferSnapshot(){}, cobTraceInferSource(){ return 'test'; }, cobRenderTraceEnabled(){ return false; }, queueAutosave(){}, genUtm(){}, genStandardUtms(){}, updateAllStatus(){}, checkPortsWarn(){}, runSpellQA(){}, updateExportFilenames(){}, isCloseWindowShortcut(){ return false; }, closeActiveBuilderModal(){ return false; }, isQuestionMarkShortcut(){ return false; }, isCampaignSummaryShortcut(){ return false; } };
  vm.createContext(context);
  vm.runInContext([extractFunction('escapeHtml'), extractConst('FLDS'), extractConst('PACKAGE_OPERATORS'), extractConst('PACKAGE_COPY_FIELDS'), extractConst('PACKAGE_EDITOR_FIELD_MAP'), extractFunction('getActiveRenderCampaignType'), extractFunction('normalisePackageOperatorKey'), extractFunction('packageOfferHasGenuineData'), extractFunction('packageDefaultCopyValue'), extractFunction('normalisePackageCopyOverrides'), extractFunction('packageCopyValue'), extractFunction('applyPackageCopyInputOverrides'), extractFunction('packageCopyEditorValue'), extractFunction('packageCanonicalEditorField'), extractFunction('packageEditorValueForField'), extractFunction('syncPackageCanonicalFields'), extractFunction('applyPackageEditorFieldsToCanonical'), extractFunction('packageNumericValue'), extractFunction('packageCleanNumericString'), extractFunction('applyJet2PackageDefaults'), extractFunction('normalisePackagePricingFields'), extractFunction('formatPackageOrdinalDate'), extractFunction('packageOfferFromData'), extractFunction('formatPackageMoney'), extractFunction('packageAirportLine'), extractFunction('packageResortFeeText'), extractFunction('renderPackagePriceBlock'), extractFunction('renderPackageOperatorLogo'), extractFunction('renderPackageCard'), extractFunction('cleanCardFieldValue'), extractFunction('cleanCardFieldLines'), extractFunction('cleanCardFacingOfferData'), extractFunction('renderCardHTML'), 'function renderOfferWithOptionalCtaHTML(d){ return renderCardHTML(d); }', extractFunction('visibleFieldsToData'), extractFunction('commitVisibleFields'), extractFunction('renderVisibleCard'), extractLastFunction('up'), extractFunction('isShortcutBlockedTarget'), extractFunction('handleKeyboardShortcut')].join('\n'), context);
  vm.runInContext('up();', context);
  assert.equal(context.offers[0].ctaPrimary, 'Start your booking');
  assert.equal(context.offers[0].ctaSecondary, 'or visit us in store');
  assert.match(fields.get('card-output').innerHTML, /or visit us in store/);
  fields.get('f-boardlbl').value='Half Board'; vm.runInContext('up();', context); assert.equal(context.offers[0].boardBasis, 'Half Board'); assert.match(fields.get('card-output').innerHTML, /Half Board/);
  fields.get('f-boardlbl').value='All Inclusive'; vm.runInContext('up();', context); assert.equal(context.offers[0].boardBasis, 'All Inclusive'); assert.match(fields.get('card-output').innerHTML, /All Inclusive/);
  const cta = fields.get('f-ctaSecondary'); cta.focus(); cta.value='';
  for (const ch of 'or visit us in store') { const evt={key:ch, target:cta, defaultPrevented:false, preventDefault(){ this.defaultPrevented=true; }, composedPath(){ return [cta]; }}; context.handleKeyboardShortcut(evt); assert.equal(evt.defaultPrevented, false); cta.value += ch; vm.runInContext('up();', context); }
  assert.equal(cta.value, 'or visit us in store'); assert.equal(context.offers[0].ctaSecondary, 'or visit us in store'); assert.match(fields.get('card-output').innerHTML, /Start your booking[\s\S]*or visit us in store/);
  cta.value='or call into your local store'; vm.runInContext('up();', context); assert.equal(context.offers[0].ctaSecondary, 'or call into your local store'); assert.match(fields.get('card-output').innerHTML, /or call into your local store/);
});
