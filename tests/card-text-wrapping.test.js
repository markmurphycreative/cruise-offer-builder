import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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


test('itinerary rendering keeps each required destination as one unbroken unit', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext([extractFunction('normaliseDestinationName'), extractFunction('cleanPortsDisplay'), extractFunction('chunkBullets')].join('\n'), context);

  const rendered = context.chunkBullets('Heraklion, Crete • Rhine Gorge • Bilbao, Spain • Cherbourg, France • Souda (for Chania), Crete', 3);

  for (const destination of [
    'Heraklion,&nbsp;Crete',
    'Rhine&nbsp;Gorge',
    'Bilbao,&nbsp;Spain',
    'Cherbourg,&nbsp;France',
    'Souda,&nbsp;Chania,&nbsp;Crete'
  ]) {
    assert.match(rendered, new RegExp(`<span class=\"port-unit\">(?:•&nbsp;)?${destination}</span>`));
  }
  assert.doesNotMatch(rendered, /<br>|Her\s+aklion|Rh\s+ine|Spai\s+n|Franc\s+e|,\s*<\/span>\s*<span/);
  assert.match(html, /\.cc \.vpts\{[^}]*overflow-wrap:normal;word-break:normal;\}/);
  assert.match(html, /\.cc \.port-unit\{display:inline-block;white-space:nowrap;\}/);
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
  const context = {};
  vm.createContext(context);
  vm.runInContext([extractFunction('cleanPortsDisplay'), extractFunction('chunkBullets')].join('\n'), context);
  const ports = [
    'Buenos Aires', 'Montevideo', 'Port Stanley', 'Falkland Islands', 'Cape Horn', 'Chile', 'Ushuaia',
    'Strait of Magellan', 'Punta Arenas', 'Puerto Madryn', 'Punta Del Este'
  ];

  assert.equal(context.chunkBullets(ports.join(' • '), 4).replace(/<\/?span[^>]*>/g, '').replaceAll('&nbsp;', ' ').replace(/ • /g, ' • '), ports.join(' • '));
  assert.doesNotMatch(context.chunkBullets(ports.join(' • '), 4), /<br>/);
});
