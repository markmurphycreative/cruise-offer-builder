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
    extractFunction('normaliseDestinationName'),
    extractFunction('cleanPortsDisplay'),
    extractFunction('getDestinationComparisonValue'),
    extractFunction('removeDuplicateReturnToOriginDestination'),
    extractFunction('estimateItineraryTextWidth'),
    extractFunction('getItineraryMeasureText'),
    extractFunction('renderItineraryLine'),
    extractFunction('packItineraryLines'),
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

test('duplicate return-to-origin destination is removed after normalisation before rendering', () => {
  const context = createItineraryContext();

  const rendered = context.chunkBullets(' Corfu • Souda (for Chania), Crete • Rhodes • Patmos • Heraklion, Crete • Katakolon, Olympia • corfu ');
  const text = renderedLines(rendered).map(textFromRenderedLine).join(' • ');

  assert.equal(text, 'Corfu • Souda, Chania, Crete • Rhodes • Patmos • Heraklion, Crete • Katakolon, Olympia');
  assert.equal((text.match(/Corfu/gi) || []).length, 1);
});

test('different start and end destinations remain rendered', () => {
  const context = createItineraryContext();

  const rendered = context.chunkBullets('Southampton • Paris (Le Havre), France • Bilbao, Spain • Barcelona, Spain');
  const text = renderedLines(rendered).map(textFromRenderedLine).join(' • ');

  assert.equal(text, 'Southampton • Paris, Le Havre, France • Bilbao, Spain • Barcelona, Spain');
  assert.match(rendered, /<span class="port-unit">Barcelona,&nbsp;Spain<\/span>/);
});

test('itinerary packing remains width based after return-to-origin removal', () => {
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
  for (const line of lines) assert.ok(measureText(line) <= 520, `${line} overflowed safe width`);
});

test('itinerary packing uses canvas rendered text measurement when available', () => {
  assert.match(html, /context\.font=ITINERARY_FONT;/);
  assert.match(html, /context\.measureText\(String\(text\|\|""\)\)\.width/);
  assert.match(html, /const safeWidth=\(options&&Number\(options\.safeWidth\)\)\|\|ITINERARY_SAFE_WIDTH;/);
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
  assert.match(html, /\.cc \.port-line\{display:block;max-width:100%;white-space:normal;\}/);
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
    /\.cc \.isec\{width:1200px;height:auto;min-height:0;overflow:visible;background:#fff;padding:80px 62px 112px;text-align:center;\}/
  );
  assert.match(html, /\.cc \.isec-content\{position:relative;top:16px;\}/);
  assert.match(html, /<div class="isec"><div class="isec-content"><div class="cname">\$\{name\}<\/div>/);
  assert.match(
    html,
    /\.cc \.cname,\.cc \.incl,\.cc \.sname,\.cc \.pbasis\{max-width:1000px;margin-left:auto;margin-right:auto;\}/
  );
  assert.match(html, /\.cc \.price-block\{max-width:1000px;\}/);
  assert.doesNotMatch(html, /\.cc \.isec\{[^}]*(?:max-)?height:\d+px/);
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
