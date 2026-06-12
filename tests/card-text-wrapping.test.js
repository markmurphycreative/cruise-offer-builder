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


test('itinerary rendering does not split comma-bearing destinations', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext([extractFunction('cleanPortsDisplay'), extractFunction('chunkBullets')].join('\n'), context);

  const rendered = context.chunkBullets('Bilbao, Spain • La Coruna, Spain • Cherbourg, France • Souda (for Chania), Crete', 3);

  assert.match(rendered, /Bilbao,&nbsp;Spain/);
  assert.match(rendered, /La&nbsp;Coruna,&nbsp;Spain/);
  assert.match(rendered, /Cherbourg,&nbsp;France/);
  assert.match(rendered, /Souda&nbsp;\(for&nbsp;Chania\),&nbsp;Crete/);
  assert.doesNotMatch(rendered, /Bilbao,?\s*<br>\s*Spain|La&nbsp;Coruna,?\s*<br>\s*Spain|Cherbourg,?\s*<br>\s*France/);
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

  assert.equal(context.chunkBullets(ports.join(' • '), 4).replaceAll('&nbsp;', ' '), ports.join(' • '));
  assert.doesNotMatch(context.chunkBullets(ports.join(' • '), 4), /<br>/);
});
