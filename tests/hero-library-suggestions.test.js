import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name){
  const start = html.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  let depth = 0;
  let seen = false;
  for(let i = start; i < html.length; i++){
    if(html[i] === '{'){ depth++; seen = true; }
    if(html[i] === '}'){
      depth--;
      if(seen && depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function createHarness(seed = {}){
  const storage = new Map(Object.entries(seed));
  const context = {
    console,
    Date,
    alert: () => {},
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    offers: [{ ports: 'Santorini • Mykonos • Crete' }],
    cur: 0,
    document: { getElementById: () => null },
    refreshOfferUi: () => {},
    setThumb: () => {},
    syncHeroUi: () => {},
    recordCampaignHistoryAfterAsyncChange: () => {},
    renderHeroLibraryList: () => {}
  };
  vm.createContext(context);
  const constants = html.match(/const HERO_LIBRARY_KEY=[\s\S]*?const HERO_KEYWORD_RULES=[\s\S]*?\n};/)[0]
    .replaceAll('const ', 'var ');
  vm.runInContext([
    constants,
    extractFunction('escapeAttr'),
    extractFunction('safeReadJsonStorage'),
    extractFunction('safeWriteJsonStorage'),
    extractFunction('getHeroLibrary'),
    extractFunction('saveHeroLibrary'),
    extractFunction('getHeroMemory'),
    extractFunction('saveHeroMemory'),
    extractFunction('normaliseHeroText'),
    extractFunction('getOfferHeroSuggestionText'),
    extractFunction('findHeroCategoryByName'),
    extractFunction('getMatchedHeroKeywords'),
    extractFunction('getHeroSuggestionForOffer'),
    extractFunction('setHeroSuggestionRemember'),
    extractFunction('rememberHeroRelationship'),
    extractFunction('applySuggestedHero'),
    extractFunction('heroSuggestionHtml'),
    extractFunction('getHeroImageSource'),
    extractFunction('renderHeroHTML')
  ].join('\n'), context);
  return { context, storage };
}

test('Image Library UI and v2.2.2 release version are present', () => {
  assert.match(html, /const APP_VERSION = "v2\.2\.2";/);
  assert.match(html, />Image Library<\/h3>/);
  assert.match(html, /<label>Category<\/label>/);
  assert.match(html, /Add Hero Image/);
  assert.match(html, /id="hero-library-name"/);
  assert.match(html, /id="hero-sidebar-suggestion"/);
  assert.match(html, /data-section-key="hero-library"/);
  assert.match(html, /No saved categories/);
  assert.doesNotMatch(html, /Stored locally for future campaigns/);
  assert.doesNotMatch(html, /No Hero Categories saved/);
});

test('rules-based hero suggestions match itinerary keywords to stored local categories', () => {
  const library = [{ id: 'med', name: 'Mediterranean', image: 'data:image/png;base64,med', thumbnail: 'data:image/png;base64,med', lastUsed: '' }];
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  const suggestion = context.getHeroSuggestionForOffer({ ports: 'Santorini • Mykonos • Crete' });
  assert.equal(suggestion.category.name, 'Mediterranean');
  assert.equal(suggestion.keyword, 'Santorini');
  assert.equal(suggestion.source, 'rules');
});

test('applying a suggested hero inserts the saved image without a picker and remembers matched keywords', () => {
  const library = [{ id: 'river', name: 'River Cruise', image: 'data:image/png;base64,river', thumbnail: 'data:image/png;base64,river', lastUsed: '' }];
  const { context, storage } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  context.offers[0] = { ports: 'Rhine • Basel • Amsterdam', _rememberHeroSuggestion: true };
  context.applySuggestedHero(0, 'river');
  assert.equal(context.offers[0]._img, 'data:image/png;base64,river');
  assert.equal(context.offers[0]._imgSource, 'Hero Library: River Cruise');
  const memory = JSON.parse(storage.get('cruiseHeroMemory.v2')||'{}');
  assert.ok(Object.keys(memory).length > 0, JSON.stringify(memory));
  assert.equal(memory.Rhine || memory.Basel || memory.Amsterdam, 'River Cruise');
});

test('saved hero categories render as one-click category cards only', () => {
  const list = [
    { id: 'med', name: 'Mediterranean', image: 'data:image/png;base64,med', thumbnail: 'data:image/png;base64,med', lastUsed: '' },
    { id: 'can', name: 'Canaries', image: 'data:image/png;base64,can', thumbnail: 'data:image/png;base64,can', lastUsed: '' }
  ];
  let htmlOut = '';
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(list) });
  context.document = { getElementById: id => id === 'hero-library-list' ? { set innerHTML(value){ htmlOut = value; }, get innerHTML(){ return htmlOut; } } : null };
  vm.runInContext(extractFunction('useHeroLibraryCategory') + '\n' + extractFunction('renderHeroLibraryList'), context);
  context.renderHeroLibraryList();
  assert.match(htmlOut, /<button class="hero-library-item" type="button" onclick="useHeroLibraryCategory\('med'\)">Mediterranean<\/button>/);
  assert.match(htmlOut, /Canaries/);
  assert.doesNotMatch(htmlOut, /Last used|Not used yet|<img|>Use<|Rename|Delete/);
});

test('empty hero placeholders render an unobtrusive Apply suggestion panel when a match exists', () => {
  const library = [{ id: 'fjords', name: 'Norwegian Fjords', image: 'data:image/png;base64,fjord', thumbnail: 'data:image/png;base64,fjord', lastUsed: '' }];
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  const output = context.renderHeroHTML({ ports: 'Bergen • Olden • Geiranger' }, ['Hero', 'Placeholder']);
  assert.match(output, /Norwegian Fjords/);
  assert.match(output, /Suggested Hero/);
  assert.match(output, /applySuggestedHero\(0,'fjords'/);
});
