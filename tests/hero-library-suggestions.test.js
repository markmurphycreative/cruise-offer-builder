import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name){
  const start = html.indexOf(`function ${name}(`);
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
    renderHeroLibraryList: () => {},
    updateSidebarHeroSuggestion: () => {}
  };
  vm.createContext(context);
  const constants = html.match(/const HERO_LIBRARY_KEY=[\s\S]*?const HERO_KEYWORD_RULES=[\s\S]*?\n};/)[0]
    .replaceAll('const ', 'var ');
  vm.runInContext([
    constants,
    extractFunction('escapeAttr'),
    extractFunction('safeReadJsonStorage'),
    extractFunction('safeWriteJsonStorage'),
    extractFunction('getHeroLibraryImageCount'),
    extractFunction('normaliseHeroLibraryCategory'),
    extractFunction('getHeroLibrary'),
    extractFunction('getSuggestableHeroLibrary'),
    extractFunction('saveHeroLibrary'),
    extractFunction('getHeroMemory'),
    extractFunction('saveHeroMemory'),
    extractFunction('normaliseHeroText'),
    extractFunction('escapeHeroRegExp'),
    extractFunction('splitHeroDestinationTags'),
    extractFunction('getHeroCategoryTags'),
    extractFunction('getOfferHeroSuggestionText'),
    extractFunction('findHeroCategoryByName'),
    extractFunction('findSuggestableHeroCategoryByName'),
    extractFunction('getMatchedHeroKeywords'),
    extractFunction('scoreHeroDestinationTags'),
    extractFunction('getHeroSuggestionForOffer'),
    extractFunction('setHeroSuggestionRemember'),
    extractFunction('rememberHeroRelationship'),
    extractFunction('applySuggestedHero'),
    extractFunction('heroSuggestionHtml'),
    extractFunction('formatStorageBytes'),
    extractFunction('estimateDataUrlBytes'),
    extractFunction('getHeroLibraryCategoryInputName'),
    extractFunction('getHeroLibraryCategoryUxState'),
    extractFunction('getActiveHeroLibraryCategory'),
    extractFunction('selectHeroLibraryCategory'),
    extractFunction('useHeroLibraryCategory'),
    extractFunction('renderHeroLibraryList'),
    extractFunction('updateHeroLibraryCategoryUx'),
    extractFunction('savePendingHeroLibraryCategory'),
    extractFunction('getHeroImageSource'),
    extractFunction('renderHeroHTML')
  ].join('\n'), context);
  return { context, storage };
}

test('Image Library UI and v2.2.8 release version are present', () => {
  assert.match(html, /const APP_VERSION = "v2\.2\.8";/);
  assert.match(html, />Image Library<\/h3>/);
  assert.match(html, /<label>Category<\/label>/);
  assert.match(html, /Add Hero Image/);
  assert.match(html, /id="hero-library-name"/);
  assert.match(html, />Destination Tags<\/label>/);
  assert.match(html, /id="hero-library-tags"/);
  assert.match(html, /id="hero-sidebar-suggestion"/);
  assert.match(html, /data-section-key="hero-library"/);
  assert.match(html, /No saved categories/);
  assert.match(html, /No hero image assigned yet\. You can create the category now and add images later\./);
  assert.doesNotMatch(html, /Upload a hero image first\./);
  assert.doesNotMatch(html, /Stored locally for future campaigns/);
  assert.doesNotMatch(html, /No Hero Categories saved/);
});



test('empty categories are stored with tags and imageCount zero but never suggested', () => {
  const library = [{ id: 'na', name: 'North America', tags: ['New York', 'Boston', 'Miami', 'Quebec'], imageCount: 0, image: '', thumbnail: '', lastUsed: '' }];
  const { context } = createHarness({
    'cruiseHeroLibrary.v2': JSON.stringify(library),
    'cruiseHeroMemory.v2': JSON.stringify({ Quebec: 'North America' })
  });
  assert.equal(context.getHeroLibrary()[0].name, 'North America');
  assert.equal(context.getHeroLibrary()[0].imageCount, 0);
  assert.equal(context.getHeroSuggestionForOffer({ ports: 'New York • Boston • Quebec' }), null);
});

test('rules-based hero suggestions match itinerary keywords to stored local categories', () => {
  const library = [{ id: 'med', name: 'Mediterranean', image: 'data:image/png;base64,med', thumbnail: 'data:image/png;base64,med', lastUsed: '' }];
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  const suggestion = context.getHeroSuggestionForOffer({ ports: 'Santorini • Mykonos • Crete' });
  assert.equal(suggestion.category.name, 'Mediterranean');
  assert.equal(suggestion.keyword, 'Santorini');
  assert.equal(suggestion.source, 'rules');
});



test('destination tags score stored categories before keyword rules and show match counts', () => {
  const library = [
    { id: 'med', name: 'Mediterranean', image: 'data:image/png;base64,med', thumbnail: 'data:image/png;base64,med', tags: ['Corfu', 'Rhodes', 'Crete', 'Athens'], lastUsed: '' },
    { id: 'river', name: 'River Cruise', image: 'data:image/png;base64,river', thumbnail: 'data:image/png;base64,river', tags: ['Rhine'], lastUsed: '' }
  ];
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  const suggestion = context.getHeroSuggestionForOffer({ ports: 'Corfu • Rhodes • Crete • Katakolon' });
  assert.equal(suggestion.category.name, 'Mediterranean');
  assert.equal(suggestion.source, 'tags');
  assert.equal(suggestion.matchCount, 3);
  assert.equal(JSON.stringify(suggestion.matches), JSON.stringify(['Corfu', 'Rhodes', 'Crete']));
  assert.match(context.heroSuggestionHtml(suggestion, 0, true), /3 destination matches/);
});

test('destination tag ties use recently used category then stored order', () => {
  const library = [
    { id: 'first', name: 'First Saved', image: 'data:image/png;base64,first', thumbnail: 'data:image/png;base64,first', tags: ['Bergen'], lastUsed: '' },
    { id: 'recent', name: 'Recently Used', image: 'data:image/png;base64,recent', thumbnail: 'data:image/png;base64,recent', tags: ['Bergen'], lastUsed: '2026-06-01T12:00:00.000Z' }
  ];
  let { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  assert.equal(context.getHeroSuggestionForOffer({ ports: 'Bergen' }).category.name, 'Recently Used');
  const withoutRecent = library.map(item => ({ ...item, lastUsed: '' }));
  ({ context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(withoutRecent) }));
  assert.equal(context.getHeroSuggestionForOffer({ ports: 'Bergen' }).category.name, 'First Saved');
});

test('destination tag parsing trims whitespace and ignores case-insensitive duplicates', () => {
  const { context } = createHarness();
  assert.equal(JSON.stringify(context.splitHeroDestinationTags(' Santorini, santorini, Mykonos , CRETE, crete ')), JSON.stringify(['Santorini', 'Mykonos', 'CRETE']));
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
  assert.match(htmlOut, /<button class="hero-library-item" type="button" aria-pressed="false" onclick="useHeroLibraryCategory\('med'\)">✓ Mediterranean<span class="hero-library-item-count">1 Image<\/span><\/button>/);
  assert.match(htmlOut, /Canaries/);
  assert.doesNotMatch(htmlOut, /Last used|Not used yet|<img|>Use<|Rename|Delete/);
});



test('clicking a category card loads editor fields and marks it as active upload target', () => {
  const list = [
    { id: 'na', name: 'North America', image: '', thumbnail: '', tags: ['New York', 'Boston', 'Halifax'], imageCount: 0, lastUsed: '' },
    { id: 'med', name: 'Mediterranean', image: 'data:image/jpeg;base64,med', thumbnail: 'data:image/jpeg;base64,med', tags: ['Santorini'], imageCount: 1, lastUsed: '' }
  ];
  const elements = {
    'hero-library-name': { value: '' },
    'hero-library-tags': { value: '' },
    'hero-library-list': { innerHTML: '' },
    'hero-library-category-status': { textContent: '', className: '', classList: { add(){} } },
    'hero-library-category-helper': { textContent: '' },
    'hero-library-category-action': { textContent: '', className: '', classList: { add(){} } }
  };
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(list) });
  context.document = { getElementById: id => elements[id] || null };
  context.selectHeroLibraryCategory('na');
  assert.equal(elements['hero-library-name'].value, 'North America');
  assert.equal(elements['hero-library-tags'].value, 'New York, Boston, Halifax');
  assert.match(elements['hero-library-list'].innerHTML, /North America.*ACTIVE|active/);
  assert.equal(context.getActiveHeroLibraryCategory().name, 'North America');
});

test('saving an image after selecting an empty category attaches it to that active category', () => {
  const list = [{ id: 'na', name: 'North America', image: '', thumbnail: '', tags: ['New York', 'Boston'], imageCount: 0, lastUsed: '' }];
  const elements = {
    'hero-library-name': { value: '' },
    'hero-library-tags': { value: '' },
    'hero-library-list': { innerHTML: '' },
    'hero-library-category-status': { textContent: '', className: '', classList: { add(){} } },
    'hero-library-category-helper': { textContent: '' },
    'hero-library-category-action': { textContent: '', className: '', classList: { add(){} } }
  };
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(list) });
  context.document = { getElementById: id => elements[id] || null };
  context.selectHeroLibraryCategory('na');
  context.pendingHeroLibraryImage = { dataUrl: 'data:image/jpeg;base64,newyork' };
  assert.equal(context.savePendingHeroLibraryCategory(), true);
  const saved = context.getHeroLibrary()[0];
  assert.equal(saved.id, 'na');
  assert.equal(saved.name, 'North America');
  assert.equal(saved.image, 'data:image/jpeg;base64,newyork');
  assert.equal(saved.imageCount, 1);
  assert.equal(elements['hero-library-name'].value, 'North America');
});

test('empty hero placeholders render a centered primary suggestion takeover when a match exists', () => {
  const library = [{ id: 'fjords', name: 'Norwegian Fjords', image: 'data:image/png;base64,fjord', thumbnail: 'data:image/png;base64,fjord', lastUsed: '' }];
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  const output = context.renderHeroHTML({ ports: 'Bergen • Olden • Geiranger' }, ['Hero', 'Placeholder']);
  assert.match(output, /Norwegian Fjords/);
  assert.match(output, /Suggested Hero/);
  assert.match(output, /Apply Hero Image/);
  assert.match(output, /hero-suggestion-takeover/);
  assert.match(output, /applySuggestedHero\(0,'fjords'/);
  assert.doesNotMatch(output, /<span>Hero<\/span>|<span>Placeholder<\/span>/);
});


test('hero library upload path optimises and stores JPEG data only', () => {
  assert.match(html, /const HERO_LIBRARY_MAX_EDGE=1600;/);
  assert.match(html, /const HERO_LIBRARY_JPEG_QUALITY=0\.80;/);
  assert.match(html, /canvas\.toDataURL\("image\/jpeg",HERO_LIBRARY_JPEG_QUALITY\)/);
  assert.match(html, /function saveHeroLibraryFile\(file,inputEl\)/);
  assert.match(html, /showHeroLibraryStorageFeedback\(optimised\.originalBytes,optimised\.storedBytes\)/);
  assert.match(html, /id="hero-library-storage-feedback"/);
  assert.match(html, /✓ Image optimised for library storage/);
});

test('storage feedback formats original and optimised byte counts', () => {
  const { context } = createHarness();
  assert.equal(context.formatStorageBytes(12.1 * 1024 * 1024), '12.1 MB');
  assert.equal(context.formatStorageBytes(320 * 1024), '320 KB');
  assert.equal(context.estimateDataUrlBytes('data:image/jpeg;base64,QUJDRA=='), 4);
});
