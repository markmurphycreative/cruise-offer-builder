import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function createItineraryContext() {
  const context = {};
  vm.createContext(context);
  vm.runInContext([
    extractConstant('ITINERARY_SAFE_WIDTH'),
    extractConstant('ITINERARY_FONT'),
    extractConstant('ITINERARY_SEPARATOR'),
    extractConstant('VISIT_SECTION_BASE_HEIGHT'),
    extractConstant('VISIT_SECTION_NORMAL_LINES'),
    extractFunction('getVisitSectionMinHeight'),
    extractFunction('normaliseDestinationName'),
    extractFunction('cleanPortsDisplay'),
    extractConstant('RETURN_EMBARKATION_PORTS'),
    extractConstant('EMBARKATION_PORTS'),
    extractFunction('normalisePortIntelligenceName'),
    extractFunction('getDestinationComparisonValue'),
    extractFunction('removeDuplicateReturnToOriginDestination'),
    extractFunction('estimateItineraryTextWidth'),
    extractFunction('getItineraryMeasureText'),
    extractFunction('renderItineraryLine'),
    extractFunction('packItineraryLines'),
    extractFunction('getCleanItineraryPorts'),
    extractFunction('formatRenderedItineraryPort'),
    extractFunction('isEmbarkationPortForVisitRemoval'),
    extractFunction('getRenderedItineraryPorts'),
    extractFunction('cleanEmbarkationPortDisplay'),
    extractFunction('getEmbarkationPort'),
    extractFunction('chunkBullets')
  ].join('\n'), context);
  return context;
}

function extractConstant(name) {
  const match = html.match(new RegExp(`const ${name}=.*?;`));
  assert.ok(match, `Could not find ${name}`);
  return match[0];
}

function textFromRenderedLine(line) {
  return line
    .replace(/<\/?span[^>]*>/g, '')
    .replaceAll('&nbsp;', ' ')
    .replace(/\s*•\s*/g, ' • ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function renderedLines(rendered) {
  return rendered
    .split('</span> <span class="port-line">')
    .map((line, index, lines) => line
      .replace(index === 0 ? /^<span class="port-line">/ : /^/, '')
      .replace(index === lines.length - 1 ? /<\/span>$/ : /$/, '')
    )
    .filter(Boolean);
}

function itineraryMeasureStub(widths, separatorWidth = 30) {
  return text => String(text || '')
    .split(' • ')
    .reduce((total, destination, index) => total + (index ? separatorWidth : 0) + (widths[destination] ?? 100), 0);
}

test('offer detail text fields wrap long content without truncation or horizontal scrolling', () => {
  assert.match(
    html,
    /\.cc \.cname,\.cc \.incl,\.cc \.sname,\.cc \.price-block,\.cc \.pmain,\.cc \.pbasis\{max-width:100%;min-width:0;white-space:normal;word-wrap:break-word;overflow-wrap:break-word;\}/
  );
  assert.doesNotMatch(html, /\.cc \.(?:cname|incl|sname|pmain|pbasis)\{[^}]*text-overflow:ellipsis/);
  assert.doesNotMatch(html, /\.cc \.(?:cname|incl|sname|pmain|pbasis)\{[^}]*overflow-x:(?:auto|scroll)/);
});

test('preview and image exports continue to use the same wrapped card renderer', () => {
  assert.match(html, /out\.innerHTML=renderCardHTML\(data\|\|\{\}\);/);
  assert.match(html, /wrap\.innerHTML = renderCardHTML\(offerData\);/);
  assert.match(html, /html2canvas\(target, \{/);
});



test('short destinations pack efficiently by rendered width instead of fixed destination count', () => {
  const context = createItineraryContext();
  const measureText = itineraryMeasureStub({
    Corfu: 80,
    'Souda, Chania, Crete': 280,
    Rhodes: 90,
    Patmos: 100,
    'Heraklion, Crete': 230,
    'Katakolon, Olympia': 250
  });
  const rendered = context.chunkBullets(
    'Corfu • Souda, Chania, Crete • Rhodes • Patmos • Heraklion, Crete • Katakolon, Olympia',
    { safeWidth: 520, measureText }
  );
  const lines = renderedLines(rendered).map(textFromRenderedLine);

  assert.deepEqual(lines, [
    'Corfu • Souda, Chania, Crete • Rhodes',
    'Patmos • Heraklion, Crete',
    'Katakolon, Olympia'
  ]);
  assert.ok(lines[0].split(' • ').length > 2);
  for (const line of lines) assert.ok(measureText(line) <= 520, `${line} overflowed safe width`);
});

test('long destinations wrap according to rendered width without overflowing', () => {
  const context = createItineraryContext();
  const measureText = itineraryMeasureStub({
    'Southampton, England': 245,
    'Paris, Le Havre, France': 255,
    'Bilbao, Spain': 210,
    'La Coruna, Spain': 230,
    'Cherbourg, France': 240
  });
  const rendered = context.chunkBullets(
    'Southampton, England • Paris (Le Havre), France • Bilbao, Spain • La Coruna, Spain • Cherbourg, France',
    { safeWidth: 530, measureText }
  );
  const lines = renderedLines(rendered).map(textFromRenderedLine);

  assert.deepEqual(lines, [
    'Southampton, England • Paris, Le Havre, France',
    'Bilbao, Spain • La Coruna, Spain',
    'Cherbourg, France'
  ]);
  for (const line of lines) assert.ok(measureText(line) <= 530, `${line} overflowed safe width`);
});

test('final duplicate return-to-origin destination is removed for any matching embarkation port', () => {
  const context = createItineraryContext();

  const rendered = context.chunkBullets(' Corfu • Souda (for Chania), Crete • Rhodes • Patmos • Heraklion, Crete • Katakolon, Olympia • corfu ');
  const text = renderedLines(rendered).map(textFromRenderedLine).join(' • ');

  assert.equal(text, 'Corfu • Souda, Chania, Crete • Rhodes • Patmos • Heraklion, Crete • Katakolon, Olympia');
  assert.equal((text.match(/Corfu/gi) || []).length, 1);
});

test('recognised embarkation return port is removed only from the final rendered itinerary position', () => {
  const context = createItineraryContext();

  const rendered = context.chunkBullets('Southampton • Le Havre • Southampton • Bilbao • La Coruna • Vigo • Cherbourg • Southampton');
  const text = renderedLines(rendered).map(textFromRenderedLine).join(' • ');

  assert.equal(text, 'Le Havre • Southampton • Bilbao • La Coruna • Vigo • Cherbourg');
  assert.equal((text.match(/Southampton/g) || []).length, 1);
});


test("Las Palmas round-trip You\'ll Visit removes final duplicate embarkation port", () => {
  const context = createItineraryContext();

  const rendered = context.chunkBullets('Las Palmas, Gran Canaria • Arrecife • Agadir • Funchal • Santa Cruz • Las Palmas, Gran Canaria');
  const text = renderedLines(rendered).map(textFromRenderedLine).join(' • ');

  assert.equal(text, 'Arrecife • Agadir • Funchal • Santa Cruz');
  assert.doesNotMatch(text, /Las Palmas/);
});


test("permanent PMU: You'll Visit removes the embarkation port for UK and fly-cruise starts", () => {
  const context = createItineraryContext();
  const examples = [
    ['Port of Tyne • Amsterdam • Bergen', /Port of Tyne|Newcastle/],
    ['Southampton • Lisbon • Vigo', /Southampton/],
    ['Dover • Rotterdam • Hamburg', /Dover/],
    ['Barcelona • Marseille • Rome', /Barcelona/],
    ['Athens (Piraeus) • Mykonos • Santorini', /Athens|Piraeus/],
    ['Las Palmas • Arrecife • Funchal', /Las Palmas/]
  ];

  for (const [ports, forbidden] of examples) {
    const text = renderedLines(context.chunkBullets(ports)).map(textFromRenderedLine).join(' • ');
    assert.doesNotMatch(text, forbidden, `${ports} rendered embarkation in You'll Visit as ${text}`);
  }
});

test('different start and end destinations remain rendered', () => {
  const context = createItineraryContext();

  const rendered = context.chunkBullets('Southampton • Paris (Le Havre), France • Bilbao, Spain • Barcelona, Spain');
  const text = renderedLines(rendered).map(textFromRenderedLine).join(' • ');

  assert.equal(text, 'Paris, Le Havre, France • Bilbao, Spain • Barcelona, Spain');
  assert.match(rendered, /<span class="port-unit">Barcelona,&nbsp;Spain<\/span>/);
});

test('itinerary packing removes final duplicate return-to-origin ports while staying width based', () => {
  const context = createItineraryContext();
  const measureText = itineraryMeasureStub({
    Corfu: 80,
    'Souda, Chania, Crete': 280,
    Rhodes: 90,
    Patmos: 100,
    'Heraklion, Crete': 230,
    'Katakolon, Olympia': 250
  });

  const rendered = context.chunkBullets(
    'Corfu • Souda, Chania, Crete • Rhodes • Patmos • Heraklion, Crete • Katakolon, Olympia • Corfu',
    { safeWidth: 520, measureText }
  );
  const lines = renderedLines(rendered).map(textFromRenderedLine);

  assert.deepEqual(lines, [
    'Corfu • Souda, Chania, Crete • Rhodes',
    'Patmos • Heraklion, Crete',
    'Katakolon, Olympia'
  ]);
  assert.equal(lines.join(' • ').match(/Corfu/g).length, 1);
  for (const line of lines) assert.ok(measureText(line) <= 520, `${line} overflowed safe width`);
});

test('itinerary packing uses canvas rendered text measurement when available', () => {
  assert.match(html, /context\.font=ITINERARY_FONT;/);
  assert.match(html, /context\.measureText\(String\(text\|\|""\)\)\.width/);
  assert.match(html, /const safeWidth=\(options&&Number\(options\.safeWidth\)\)\|\|ITINERARY_SAFE_WIDTH;/);
});

test("You'll Visit ports text has safe horizontal containment without changing card dimensions", () => {
  assert.match(html, /const ITINERARY_SAFE_WIDTH=960;/);
  assert.match(
    html,
    /\.cc \.vpts\{width:100%;max-width:960px;margin-left:auto;margin-right:auto;min-width:0;font-size:40px;font-weight:300;color:rgba\(255,255,255,\.65\);line-height:1\.35;text-align:center;overflow-wrap:anywhere;word-break:break-word;\}/
  );
  assert.match(html, /\.cc\{width:1200px;/);
  assert.match(html, /\.cc \.header-block\{width:1200px;/);
  assert.match(html, /\.cc \.hero-wrap\{width:1200px;height:849px;/);
  assert.match(html, /\.cc \.ibar\{width:1200px;display:grid;grid-template-columns:400px 400px 400px;height:297px;/);
  assert.match(html, /\.cc \.tcbar\{width:1200px;height:123px;/);
});

test("You'll Visit section uses fixed stacked spacing and grows only for extra port lines", () => {
  assert.match(
    html,
    /\.cc \.vsec\{width:1200px;min-height:536px;height:auto;background:var\(--operator-bg,var\(--navy\)\);display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;padding:110px 80px;text-align:center;overflow:visible;position:relative;\}/
  );
  assert.match(html, /\.cc \.vtit\{width:100%;font-size:68px;font-weight:300;color:#fff;margin-bottom:26px;letter-spacing:\.03em;line-height:1\.1;text-align:center;\}/);
  assert.doesNotMatch(html, /\.cc \.vsec\{[^}]*(?:^|;)height:536px/);
  assert.doesNotMatch(html, /\.cc \.vsec\{[^}]*max-height:536px/);
  assert.doesNotMatch(html, /\.cc \.vpts\{[^}]*font-size:(?!40px)/);
  assert.match(html, /const VISIT_SECTION_BASE_HEIGHT=536;/);
  assert.match(html, /const VISIT_SECTION_NORMAL_LINES=4;/);
  assert.match(html, /function getVisitSectionMinHeight\(lineCount,lineHeight\)\{/);
  assert.match(html, /const extraLines=Math\.max\(0,safeLineCount-VISIT_SECTION_NORMAL_LINES\);/);
  assert.match(html, /return VISIT_SECTION_BASE_HEIGHT\+\(extraLines\*safeLineHeight\);/);
});


test("You'll Visit heading, ports, and long itinerary lines share the same centred axis", () => {
  assert.match(html, /\.cc \.visit-inner\{width:100%;max-width:960px;margin-left:auto;margin-right:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;\}/);
  assert.match(html, /\.cc \.vtit\{width:100%;[^}]*text-align:center;\}/);
  assert.match(html, /\.cc \.vpts\{width:100%;max-width:960px;margin-left:auto;margin-right:auto;[^}]*text-align:center;[^}]*\}/);
  assert.match(html, /\.cc \.port-line\{display:block;max-width:100%;margin-left:auto;margin-right:auto;text-align:center;white-space:normal;\}/);
  assert.match(html, /<div class="vsec"><div class="visit-inner">\$\{preCruiseHTML\}<div class="vtit">You'll Visit<\/div><div class="vpts">\$\{portsHTML\}<\/div><\/div><\/div>/);
});

test("You'll Visit section height preserves fixed top and bottom spacing for normal and long itineraries", () => {
  const context = createItineraryContext();

  assert.equal(context.getVisitSectionMinHeight(1, 54), 536);
  assert.equal(context.getVisitSectionMinHeight(4, 54), 536);
  assert.equal(context.getVisitSectionMinHeight(5, 54), 590);
  assert.equal(context.getVisitSectionMinHeight(7, 54), 698);
});

test("preview and export paths use matching You'll Visit section-height adjustment", () => {
  assert.match(html, /out\.innerHTML=renderCardHTML\(data\|\|\{\}\);\n  adjustVisitSectionHeights\(out\);/);
  assert.match(html, /wrap\.innerHTML = renderCardHTML\(offerData\);[\s\S]*?adjustVisitSectionHeights\(wrap\);[\s\S]*?html2canvas\(target, \{/);
  assert.match(html, /const minHeight=getVisitSectionMinHeight\(lineCount,lineHeight\);/);
  assert.match(html, /if\(minHeight>VISIT_SECTION_BASE_HEIGHT\) section\.style\.minHeight=`\$\{minHeight\}px`;/);
});


test('preview wrappers centre cards with auto horizontal margins instead of fixed offsets', () => {
  assert.match(
    html,
    /\.preview-wrap\{flex:1;overflow:auto;padding:12px;display:flex;justify-content:center;align-items:stretch;background:#dedad2;/
  );
  assert.match(html, /\.preview-scaler\{margin-block:auto;transform-origin:top center;\}/);
  assert.match(html, /\.preview-scaler\{margin-inline:auto;\}/);
  assert.match(html, /scaler\.style\.marginInline = 'auto';/);
});

test("single preview recentres after normal and long You'll Visit height adjustment", () => {
  const renderVisibleCard = extractFunction('renderVisibleCard');
  assert.match(renderVisibleCard, /out\.innerHTML = renderOfferWithOptionalCtaHTML\(visibleFieldsToData\(\), getCtaSettingsFromUI\(\)\);\n  adjustVisitSectionHeights\(out\);/);
  assert.match(renderVisibleCard, /scaler\.style\.marginInline = 'auto';[\s\S]*?scaler\.style\.height = Math\.ceil\(out\.offsetHeight \* scale\) \+ 'px';/);
  assert.doesNotMatch(renderVisibleCard, /scaler\.style\.(?:left|marginLeft|translate)/);
});

test("email and all-card previews adjust You'll Visit height before measuring centred scaler", () => {
  const renderPreviewMode = extractFunction('renderPreviewMode');
  assert.match(renderPreviewMode, /cardWrap\.innerHTML = renderOfferWithOptionalCtaHTML\(d, getCtaSettingsFromUI\(\)\);\n      adjustVisitSectionHeights\(cardWrap\);[\s\S]*?setScalerBox\(1200, out\.offsetHeight \|\| stackWrap\.offsetHeight, baseScale \* EMAIL_PREVIEW_SCALE\);/);
  assert.match(renderPreviewMode, /if\(getCtaSettingsFromUI\(\)\.enabled\) c\.innerHTML = renderOfferWithOptionalCtaHTML\(d \|\| \{\}, getCtaSettingsFromUI\(\)\);\n      adjustVisitSectionHeights\(c\);[\s\S]*?setScalerBox\(gridW, fullH, Math\.max\(0\.08, fitScale\)\);/);
});

test('export and preview centring use fixed 1200 card width without changing export dimensions', () => {
  assert.match(html, /scaler\.style\.width = '1200px';/);
  assert.match(html, /const exportWidth = 1200;/);
  assert.match(html, /width: exportWidth,/);
  assert.match(html, /windowWidth: exportWidth,/);
  assert.doesNotMatch(html, /const exportWidth = (?!1200)/);
});

test('normal port separators remain unchanged while malformed long ports can wrap', () => {
  const context = createItineraryContext();
  const normalRendered = context.chunkBullets('Barbados • Martinique • St Kitts • Tortola');
  const normalText = renderedLines(normalRendered).map(textFromRenderedLine).join(' • ');

  assert.equal(normalText, 'Barbados • Martinique • St Kitts • Tortola');
  assert.match(normalRendered, / <span class="port-separator">•<\/span> /);

  const malformedRendered = context.chunkBullets('AReallyLongMalformedDestinationNameWithNoSpacesOrSeparatorsThatCouldArriveFromPastedCSVOrAPIContent');
  assert.match(malformedRendered, /<span class="port-unit">AReallyLongMalformedDestinationNameWithNoSpacesOrSeparatorsThatCouldArriveFromPastedCSVOrAPIContent<\/span>/);
  assert.match(html, /\.cc \.port-unit\{display:inline-block;max-width:100%;white-space:normal;overflow-wrap:anywhere;word-break:break-word;\}/);
});

test('itinerary rendering keeps each required destination as one unbroken unit', () => {
  const context = createItineraryContext();

  const rendered = context.chunkBullets('Heraklion, Crete • Rhine Gorge • Bilbao, Spain • Cherbourg, France • Souda (for Chania), Crete', 3);

  for (const destination of [
    'Heraklion,&nbsp;Crete',
    'Rhine&nbsp;Gorge',
    'Bilbao,&nbsp;Spain',
    'Cherbourg,&nbsp;France',
    'Souda,&nbsp;Chania,&nbsp;Crete'
  ]) {
    assert.match(rendered, new RegExp(`<span class=\"port-unit\">${destination}</span>`));
  }
  assert.doesNotMatch(rendered, /<br>|Her\s+aklion|Rh\s+ine|Spai\s+n|Franc\s+e|,\s*<\/span>\s*<span class=\"port-unit/);
  assert.match(html, /\.cc \.vpts\{[^}]*overflow-wrap:anywhere;word-break:break-word;\}/);
  assert.match(html, /\.cc \.port-line\{display:block;max-width:100%;margin-left:auto;margin-right:auto;text-align:center;white-space:normal;\}/);
  assert.match(html, /\.cc \.port-unit\{display:inline-block;max-width:100%;white-space:normal;overflow-wrap:anywhere;word-break:break-word;\}/);
  assert.match(html, /\.cc \.port-separator\{display:inline-block;white-space:nowrap;\}/);
});

test('itinerary line groups never start or end with bullet separators when destinations wrap', () => {
  const context = createItineraryContext();

  const rendered = context.chunkBullets('Southampton • Paris (Le Havre), France • Bilbao, Spain • La Coruna, Spain • Vigo, Spain • Cherbourg, France • Southampton', { safeWidth: 520 });
  const lines = renderedLines(rendered);

  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.doesNotMatch(line, /^\s*<span class="port-separator">•<\/span>/);
    assert.doesNotMatch(line, /<span class="port-separator">•<\/span>\s*$/);
  }
  assert.doesNotMatch(rendered, /<span class="port-line">\s*<span class="port-separator">•<\/span>\s*<span class="port-unit">/);
});


test('white information panel narrows editorial copy, grows naturally, and centres the content group', () => {
  assert.match(
    html,
    /\.cc \.isec\{width:1200px;height:auto;min-height:0;overflow:visible;background:#fff;padding:70px 62px 92px;text-align:center;\}/
  );
  assert.match(html, /\.cc \.isec-content\{position:relative;top:0;\}/);
  assert.match(html, /<div class="isec"><div class="isec-content"><div class="cname">\$\{name\}<\/div>/);
  assert.match(
    html,
    /\.cc \.cname,\.cc \.incl,\.cc \.sname,\.cc \.pbasis\{max-width:1000px;margin-left:auto;margin-right:auto;\}/
  );
  assert.match(html, /\.cc \.price-block\{max-width:1000px;\}/);
  assert.doesNotMatch(html, /\.cc \.isec\{[^}]*(?:max-)?height:\d+px/);
});

test("Newcastle round-trip You'll Visit displays Port of Tyne once without final duplicate", () => {
  const context = createItineraryContext();
  const rendered = context.chunkBullets('Newcastle • Amsterdam • Bergen • Olden • Newcastle');
  const text = renderedLines(rendered).map(textFromRenderedLine).join(' • ');

  assert.equal(text, 'Amsterdam • Bergen • Olden');
  assert.doesNotMatch(text, /Port of Tyne|Newcastle/);
});

test('subtitle renders flights, transfers, and cabin as one compact grouped inclusion block', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext([
    extractConstant('CARD_INCLUSION_SEPARATOR'),
    extractConstant('CARD_INCLUSION_SAFE_WIDTH'),
    extractConstant('CARD_INCLUSION_FONT'),
    'const CARD_INCLUSION_CABIN_PHRASES=["Ocean View Cabin","Inside Stateroom","Oceanview Stateroom","Balcony Stateroom","Infinite Veranda","Concierge Class","Outside Cabin","Balcony Cabin","Inside Cabin","Junior Suite","AquaClass","Suite"];',
    'function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g, \"\\$&\");}',
    extractFunction('normaliseCardInclusionComponent'),
    extractFunction('classifyCardInclusionComponent'),
    extractFunction('makeCardInclusionComponent'),
    extractFunction('splitCardInclusionLineComponents'),
    extractFunction('normaliseFlightInclusionDisplay'),
    extractFunction('buildCardInclusionComponents'),
    extractFunction('orderCardInclusionComponents'),
    extractFunction('validateCardInclusionLines'),
    extractFunction('estimateCardInclusionTextWidth'),
    extractFunction('getCardInclusionMeasureText'),
    extractFunction('packCardInclusionComponents'),
    extractFunction('groupCardInclusionRenderLines'),
    extractFunction('renderCardInclusionLayout'),
    extractFunction('renderCardInclusion')
  ].join('\n'), context);

  const rendered = context.renderCardInclusion('Newcastle Flights\nTransfers Included\nInside Cabin');
  const text = rendered.replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ');

  assert.equal(text, 'Newcastle Flights - Transfers Included - Inside Cabin');
  assert.doesNotMatch(rendered, /<br>/);
  assert.match(rendered, /<span class="incl-line">/);
  assert.match(rendered, /<span class="incl-component cabin-phrase">Inside&nbsp;Cabin<\/span>/);
  assert.match(html, /\.cc \.incl\{[^}]*line-height:1\.22;[^}]*margin:0 auto 16px;[^}]*display:flex;flex-direction:column;gap:0;/);
});

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

test("card preview preserves every parsed destination without first-N port truncation", () => {
  const context = createItineraryContext();
  const ports = [
    'Buenos Aires', 'Montevideo', 'Port Stanley', 'Falkland Islands', 'Cape Horn', 'Chile', 'Ushuaia',
    'Strait of Magellan', 'Punta Arenas', 'Puerto Madryn', 'Punta Del Este'
  ];

  const renderedPorts = context.chunkBullets(ports.join(' • '));
  assert.equal(renderedPorts.replace(/<\/span> <span class="port-line">/g, '</span> • <span class="port-line">').replace(/<\/?span[^>]*>/g, '').replaceAll('&nbsp;', ' ').replace(/\s*•\s*/g, ' • ').replace(/\s{2,}/g, ' ').trim(), ports.join(' • '));
  assert.doesNotMatch(renderedPorts, /<br>/);
});
