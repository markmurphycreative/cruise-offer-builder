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
    setTimeout,
    clearTimeout,
    alert: () => {},
    confirm: () => true,
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
    extractFunction('normaliseHeroLibraryImage'),
    extractFunction('getHeroLibraryImages'),
    extractFunction('getHeroLibraryDefaultImage'),
    extractFunction('getHeroLibraryImageCount'),
    extractFunction('normaliseHeroLibraryCategory'),
    extractFunction('heroLibraryCategoryIdBase'),
    extractFunction('getHeroLibrary'),
    extractFunction('getSuggestableHeroLibrary'),
    extractFunction('saveHeroLibrary'),
    extractFunction('getHeroMemory'),
    extractFunction('saveHeroMemory'),
    extractFunction('normaliseHeroText'),
    extractFunction('escapeHeroRegExp'),
    extractFunction('parseHeroDestinationTags'),
    extractFunction('splitHeroDestinationTags'),
    extractFunction('getHeroCategoryTags'),
    extractFunction('getOfferHeroSuggestionText'),
    extractFunction('findHeroCategoryByName'),
    extractFunction('findSuggestableHeroCategoryByName'),
    extractFunction('getMatchedHeroKeywords'),
    extractFunction('scoreHeroDestinationTags'),
    extractFunction('scoreHeroCategoryImages'),
    extractFunction('withMatchedHeroImage'),
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
    extractFunction('syncHeroLibraryActiveCards'),
    extractFunction('useHeroLibraryCategory'),
    extractFunction('toggleHeroLibraryImages'),
    extractFunction('removeHeroLibraryImage'),
    extractFunction('renderHeroLibraryList'),
    extractFunction('updateHeroLibraryCategoryUx'),
    'var activeHeroLibraryCategoryId=""; var expandedHeroLibraryCategoryIds=new Set(); var pendingHeroLibraryImage=null; var pendingHeroLibraryReplaceImageId=""; var heroLibraryTagsFeedbackTimer=null; var heroLibraryTagsSaveTimer=null; var HERO_LIBRARY_TAGS_SAVE_DEBOUNCE_MS=700;',
    extractFunction('setHeroLibraryTagsFeedback'),
    extractFunction('isHeroLibraryTagsInputFocused'),
    extractFunction('scheduleActiveHeroLibraryTagsSave'),
    extractFunction('flushActiveHeroLibraryTagsSave'),
    extractFunction('saveActiveHeroLibraryTags'),
    extractFunction('savePendingHeroLibraryCategory'),
    extractFunction('getHeroImageSource'),
    extractFunction('renderHeroHTML')
  ].join('\n'), context);
  return { context, storage };
}

test('Image Library UI and v2.4.1 release version is present', () => {
  assert.match(html, /const APP_VERSION = "v2\.4\.1";/);
  assert.match(html, />Image Library<\/h3>/);
  assert.match(html, /<label>Category<\/label>/);
  assert.match(html, /Select a category below to add or manage images\./);
  assert.match(html, /id="hero-library-name"/);
  assert.match(html, />Destination Tags<\/label>/);
  assert.match(html, /id="hero-library-tags"/);
  assert.match(html, />Image Tags<\/label>/);
  assert.match(html, /id="hero-library-image-tags"/);
  assert.match(html, /id="hero-sidebar-suggestion"/);
  assert.match(html, /data-section-key="hero-library"/);
  assert.match(html, /No saved categories/);
  assert.match(html, /Use Create New Category to add this as a separate category before uploading an image\./);
  assert.match(html, />Rename Category<\/button>/);
  assert.match(html, />Create New Category<\/button>/);
  assert.doesNotMatch(html, /Upload a hero image first\./);
  assert.doesNotMatch(html, /Stored locally for future campaigns/);
  assert.doesNotMatch(html, /No Hero Categories saved/);
});



test('empty categories are stored with tags and can suggest categories without applying images', () => {
  const library = [{ id: 'na', name: 'North America', tags: ['New York', 'Boston', 'Miami', 'Quebec'], imageCount: 0, image: '', thumbnail: '', lastUsed: '' }];
  const { context } = createHarness({
    'cruiseHeroLibrary.v2': JSON.stringify(library),
    'cruiseHeroMemory.v2': JSON.stringify({ Quebec: 'North America' })
  });
  assert.equal(context.getHeroLibrary()[0].name, 'North America');
  assert.equal(context.getHeroLibrary()[0].imageCount, 0);
  const suggestion = context.getHeroSuggestionForOffer({ ports: 'New York • Boston • Quebec' });
  assert.equal(suggestion.category.name, 'North America');
  assert.equal(suggestion.image, null);
  assert.match(context.heroSuggestionHtml(suggestion, 0, true), /Matched Image:[\s\S]*Category fallback/);
  assert.match(context.heroSuggestionHtml(suggestion, 0, true), /disabled/);
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



test('destination-level image tags choose the best image inside the matched category', () => {
  const library = [{
    id: 'med', name: 'Mediterranean', image: 'data:image/png;base64,santorini', thumbnail: 'data:image/png;base64,santorini', tags: ['Santorini', 'Rhodes', 'Crete', 'Corfu'], lastUsed: '',
    images: [
      { id: 'santorini', name: 'Santorini image', image: 'data:image/png;base64,santorini', thumbnail: 'data:image/png;base64,santorini', tags: ['Santorini', 'Oia'] },
      { id: 'rhodes', name: 'Rhodes image', image: 'data:image/png;base64,rhodes', thumbnail: 'data:image/png;base64,rhodes', tags: ['Rhodes', 'Lindos'] },
      { id: 'crete', name: 'Crete image', image: 'data:image/png;base64,crete', thumbnail: 'data:image/png;base64,crete', tags: ['Crete', 'Heraklion'] }
    ]
  }];
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  const suggestion = context.getHeroSuggestionForOffer({ ports: 'Corfu • Rhodes • Crete • Katakolon' });
  assert.equal(suggestion.category.name, 'Mediterranean');
  assert.ok(['Rhodes image', 'Crete image'].includes(suggestion.image.name));
  assert.notEqual(suggestion.image.name, 'Santorini image');
  assert.equal(suggestion.imageMatchCount, 1);
  assert.match(context.heroSuggestionHtml(suggestion, 0, true), /Matched Image:/);
});

test('image-level tag ties prefer recently used image then saved order', () => {
  const library = [{
    id: 'med', name: 'Mediterranean', tags: ['Santorini', 'Rhodes'], image: 'data:image/png;base64,santorini', thumbnail: 'data:image/png;base64,santorini',
    images: [
      { id: 'santorini', name: 'Santorini', image: 'data:image/png;base64,santorini', thumbnail: 'data:image/png;base64,santorini', tags: ['Santorini'] },
      { id: 'rhodes', name: 'Rhodes', image: 'data:image/png;base64,rhodes', thumbnail: 'data:image/png;base64,rhodes', tags: ['Rhodes'], lastUsed: '2026-06-01T12:00:00.000Z' }
    ]
  }];
  let { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  assert.equal(context.getHeroSuggestionForOffer({ ports: 'Santorini • Rhodes' }).image.name, 'Rhodes');
  library[0].images[1].lastUsed = '';
  ({ context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) }));
  assert.equal(context.getHeroSuggestionForOffer({ ports: 'Santorini • Rhodes' }).image.name, 'Santorini');
});

test('destination tag parsing trims whitespace and ignores case-insensitive duplicates', () => {
  const { context } = createHarness();
  assert.equal(JSON.stringify(context.splitHeroDestinationTags(' Santorini, santorini, Mykonos , CRETE, crete ')), JSON.stringify(['Santorini', 'Mykonos', 'CRETE']));
});


test('saving destination tags reports and removes duplicate tags', () => {
  const library = [{ id: 'med', name: 'Mediterranean', image: 'data:image/png;base64,med', thumbnail: 'data:image/png;base64,med', tags: ['Santorini'], imageCount: 1, lastUsed: '' }];
  const tagsInput = { value: ' Santorini, santorini, Mykonos ', };
  const feedback = { textContent: '', className: '' };
  const { context, storage } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  context.activeHeroLibraryCategoryId = 'med';
  context.document = {
    activeElement: null,
    getElementById: id => id === 'hero-library-tags' ? tagsInput : (id === 'hero-library-tags-feedback' ? feedback : null)
  };

  assert.equal(context.saveActiveHeroLibraryTags(), true);
  assert.equal(feedback.textContent, 'Duplicate ignored: santorini');
  assert.equal(tagsInput.value, 'Santorini, Mykonos');
  assert.deepEqual(JSON.parse(storage.get('cruiseHeroLibrary.v2'))[0].tags, ['Santorini', 'Mykonos']);
});

test('saved category images can be removed with confirmation while keeping the category', () => {
  const library = [{ id: 'na', name: 'North America', image: 'data:image/png;base64,na', thumbnail: 'data:image/png;base64,na', tags: ['Alaska'], imageCount: 1, lastUsed: '' }];
  const { context, storage } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  context.confirm = message => { context.confirmMessage = message; return true; };

  assert.equal(context.removeHeroLibraryImage('na'), true);
  const saved = JSON.parse(storage.get('cruiseHeroLibrary.v2'))[0];
  assert.equal(context.confirmMessage, 'Remove this image from North America?');
  assert.equal(saved.name, 'North America');
  assert.equal(saved.image, '');
  assert.equal(saved.thumbnail, '');
  assert.equal(saved.imageCount, 0);
});

test('applying a suggested hero inserts the saved image without a picker and remembers matched keywords', () => {
  const library = [{ id: 'river', name: 'River Cruise', image: 'data:image/png;base64,river', thumbnail: 'data:image/png;base64,river', lastUsed: '' }];
  const { context, storage } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(library) });
  context.offers[0] = { ports: 'Rhine • Basel • Amsterdam', _rememberHeroSuggestion: true };
  context.applySuggestedHero(0, 'river');
  assert.equal(context.offers[0]._img, 'data:image/png;base64,river');
  assert.equal(context.offers[0]._imgSource, 'Hero Library: River Cruise / River Cruise');
  const memory = JSON.parse(storage.get('cruiseHeroMemory.v2')||'{}');
  assert.ok(Object.keys(memory).length > 0, JSON.stringify(memory));
  assert.equal(memory.Rhine || memory.Basel || memory.Amsterdam, 'River Cruise');
});

test('saved hero categories render compact cards with image-aware actions', () => {
  const list = [
    { id: 'med', name: 'Mediterranean', image: 'data:image/png;base64,med', thumbnail: 'data:image/png;base64,med', imageCount: 1, lastUsed: '' },
    { id: 'can', name: 'Canaries', image: '', thumbnail: '', imageCount: 0, lastUsed: '' }
  ];
  let htmlOut = '';
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(list) });
  context.document = { getElementById: id => id === 'hero-library-list' ? { set innerHTML(value){ htmlOut = value; }, get innerHTML(){ return htmlOut; } } : null };
  vm.runInContext(extractFunction('useHeroLibraryCategory') + '\n' + extractFunction('renderHeroLibraryList'), context);
  context.renderHeroLibraryList();
  assert.match(htmlOut, /<span class="hero-library-status-icon">✓<\/span><span class="hero-library-name">Mediterranean<\/span><span class="hero-library-item-count">1 Image<\/span>/);
  assert.match(htmlOut, /<button class="hero-library-card-action hero-library-add-image" type="button" onclick="addHeroLibraryImage\('med',event\)">Add Image<\/button><button class="hero-library-card-action hero-library-manage-images" type="button" aria-expanded="false" onclick="toggleHeroLibraryImages\('med',event\)">Manage Images<\/button>/);
  assert.doesNotMatch(htmlOut, /hero-library-image-row/);
  assert.match(htmlOut, /<span class="hero-library-status-icon">⚠<\/span><span class="hero-library-name">Canaries<\/span><span class="hero-library-item-count">0 Images<\/span>/);
  assert.match(htmlOut, /<button class="hero-library-card-action hero-library-add-image" type="button" onclick="addHeroLibraryImage\('can',event\)">Add Image<\/button>/);
  assert.doesNotMatch(htmlOut, /Last used|Not used yet|<img|>Use<|Rename|Delete/);
});

test('Manage Images toggles saved category image rows without making every category expanded', () => {
  const list = [{
    id: 'med', name: 'Mediterranean', image: 'data:image/png;base64,santorini', thumbnail: 'data:image/png;base64,santorini', imageCount: 3, lastUsed: '',
    images: [
      { id: 'santorini', name: 'Santorini image', image: 'data:image/png;base64,santorini', thumbnail: 'data:image/png;base64,santorini', tags: ['Santorini', 'Oia'] },
      { id: 'rhodes', name: 'Rhodes image', image: 'data:image/png;base64,rhodes', thumbnail: 'data:image/png;base64,rhodes', tags: ['Rhodes', 'Lindos'] },
      { id: 'crete', name: 'Crete image', image: 'data:image/png;base64,crete', thumbnail: 'data:image/png;base64,crete', tags: ['Crete', 'Chania'] }
    ]
  }];
  let htmlOut = '';
  const { context } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(list) });
  context.document = { getElementById: id => id === 'hero-library-list' ? { set innerHTML(value){ htmlOut = value; }, get innerHTML(){ return htmlOut; } } : null };
  context.renderHeroLibraryList();
  assert.doesNotMatch(htmlOut, /Santorini image|Rhodes image|Crete image/);
  assert.equal(context.toggleHeroLibraryImages('med'), true);
  assert.match(htmlOut, /aria-expanded="true"/);
  assert.match(htmlOut, /Santorini image[\s\S]*Rhodes image[\s\S]*Crete image/);
  assert.equal(context.toggleHeroLibraryImages('med'), true);
  assert.doesNotMatch(htmlOut, /Santorini image|Rhodes image|Crete image/);
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


test('editing destination tags auto-saves to the active image library category', async () => {
  const list = [
    { id: 'med', name: 'Mediterranean', image: 'data:image/jpeg;base64,med', thumbnail: 'data:image/jpeg;base64,med', tags: ['Santorini'], imageCount: 1, lastUsed: '' },
    { id: 'fjords', name: 'Norwegian Fjords', image: 'data:image/jpeg;base64,fjord', thumbnail: 'data:image/jpeg;base64,fjord', tags: ['Bergen'], imageCount: 1, lastUsed: '' }
  ];
  const elements = {
    'hero-library-name': { value: '' },
    'hero-library-tags': { value: '' },
    'hero-library-tags-feedback': { textContent: '', className: '' },
    'hero-library-list': { innerHTML: '' },
    'hero-library-category-status': { textContent: '', className: '', classList: { add(){} } },
    'hero-library-category-helper': { textContent: '' },
    'hero-library-category-action': { textContent: '', className: '', classList: { add(){} } }
  };
  const { context, storage } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(list) });
  context.document = { getElementById: id => elements[id] || null };
  context.selectHeroLibraryCategory('med');
  elements['hero-library-tags'].value = ' Santorini, santorini, Mykonos , Crete ';
  assert.equal(context.saveActiveHeroLibraryTags(), true);
  let saved = JSON.parse(storage.get('cruiseHeroLibrary.v2'));
  assert.deepEqual(saved.find(item => item.id === 'med').tags, ['Santorini', 'Mykonos', 'Crete']);
  assert.deepEqual(saved.find(item => item.id === 'fjords').tags, ['Bergen']);
  assert.equal(elements['hero-library-tags'].value, 'Santorini, Mykonos, Crete');
  assert.equal(elements['hero-library-tags-feedback'].textContent, 'Duplicate ignored: santorini');
  await new Promise(resolve => setTimeout(resolve, 1700));
  assert.equal(elements['hero-library-tags-feedback'].textContent, '✓ Tags saved');
  context.selectHeroLibraryCategory('fjords');
  context.selectHeroLibraryCategory('med');
  assert.equal(elements['hero-library-tags'].value, 'Santorini, Mykonos, Crete');
});

test('destination tag input debounces saves and preserves focused editing value', async () => {
  const list = [
    { id: 'med', name: 'Mediterranean', image: 'data:image/jpeg;base64,med', thumbnail: 'data:image/jpeg;base64,med', tags: ['Santorini'], imageCount: 1, lastUsed: '' }
  ];
  const elements = {
    'hero-library-name': { value: '' },
    'hero-library-tags': { value: '' },
    'hero-library-tags-feedback': { textContent: '', className: '' },
    'hero-library-list': { innerHTML: '' },
    'hero-library-category-status': { textContent: '', className: '', classList: { add(){} } },
    'hero-library-category-helper': { textContent: '' },
    'hero-library-category-action': { textContent: '', className: '', classList: { add(){} } }
  };
  let renderCount = 0;
  let refreshCount = 0;
  const { context, storage } = createHarness({ 'cruiseHeroLibrary.v2': JSON.stringify(list) });
  context.document = { getElementById: id => elements[id] || null, activeElement: null };
  context.renderHeroLibraryList = () => { renderCount++; };
  context.refreshOfferUi = () => { refreshCount++; };
  context.selectHeroLibraryCategory('med');
  renderCount = 0;
  elements['hero-library-tags'].value = ' Santorini, santorini, Mykonos , Crete ';
  context.document.activeElement = elements['hero-library-tags'];

  assert.equal(context.scheduleActiveHeroLibraryTagsSave(), true);
  assert.equal(elements['hero-library-tags-feedback'].textContent, 'Saving tags...');
  assert.deepEqual(JSON.parse(storage.get('cruiseHeroLibrary.v2'))[0].tags, ['Santorini']);
  await new Promise(resolve => setTimeout(resolve, 750));

  assert.deepEqual(JSON.parse(storage.get('cruiseHeroLibrary.v2'))[0].tags, ['Santorini', 'Mykonos', 'Crete']);
  assert.equal(elements['hero-library-tags'].value, ' Santorini, santorini, Mykonos , Crete ');
  assert.equal(renderCount, 0);
  assert.equal(refreshCount, 0);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(elements['hero-library-tags-feedback'].textContent, 'Duplicate ignored: santorini');

  context.document.activeElement = null;
  assert.equal(context.flushActiveHeroLibraryTagsSave(), true);
  assert.equal(elements['hero-library-tags'].value, 'Santorini, Mykonos, Crete');
  assert.equal(renderCount, 1);
  assert.equal(refreshCount, 1);
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


test('image library render uses active category id as the only active source of truth', () => {
  const list = [
    { id: 'caribbean', name: 'Caribbean', image: 'data:image/jpeg;base64,caribbean', thumbnail: 'data:image/jpeg;base64,caribbean', tags: ['Barbados'], imageCount: 1, lastUsed: '' },
    { id: 'med', name: 'Mediterranean', image: 'data:image/jpeg;base64,med', thumbnail: 'data:image/jpeg;base64,med', tags: ['Corfu', 'Rhodes', 'Crete'], imageCount: 1, lastUsed: '' },
    { id: 'na', name: 'North America', image: '', thumbnail: '', tags: ['New York'], imageCount: 0, lastUsed: '' },
    { id: 'scandi', name: 'Scandinavia & Iceland', image: '', thumbnail: '', tags: ['Reykjavik'], imageCount: 0, lastUsed: '' }
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
  context.document = { getElementById: id => elements[id] || null, querySelectorAll: () => [] };

  context.selectHeroLibraryCategory('caribbean');
  assert.equal((elements['hero-library-list'].innerHTML.match(/class="hero-library-card[^"]* active/g) || []).length, 1);
  assert.match(elements['hero-library-list'].innerHTML, /data-hero-category-id="caribbean"><button class="hero-library-item active"/);

  context.selectHeroLibraryCategory('med');
  assert.equal(context.activeHeroLibraryCategoryId, 'med');
  assert.equal((elements['hero-library-list'].innerHTML.match(/class="hero-library-card[^"]* active/g) || []).length, 1);
  assert.match(elements['hero-library-list'].innerHTML, /data-hero-category-id="med"><button class="hero-library-item active"/);
  assert.doesNotMatch(elements['hero-library-list'].innerHTML, /data-hero-category-id="caribbean"><button class="hero-library-item active"/);

  context.selectHeroLibraryCategory('na');
  assert.equal(context.activeHeroLibraryCategoryId, 'na');
  assert.equal((elements['hero-library-list'].innerHTML.match(/class="hero-library-card[^"]* active/g) || []).length, 1);
  assert.match(elements['hero-library-list'].innerHTML, /data-hero-category-id="na"><button class="hero-library-item empty active"/);
});

test('image library render normalises duplicate stored ids before applying active state', () => {
  const list = [
    { id: 'hero-duplicate', name: 'Caribbean', image: 'data:image/png;base64,caribbean', thumbnail: 'data:image/png;base64,caribbean', tags: ['Barbados'], imageCount: 1, lastUsed: '' },
    { id: 'hero-duplicate', name: 'Mediterranean', image: 'data:image/png;base64,med', thumbnail: 'data:image/png;base64,med', tags: ['Santorini'], imageCount: 1, lastUsed: '' },
    { id: 'hero-duplicate', name: 'North America', image: '', thumbnail: '', tags: ['New York'], imageCount: 0, lastUsed: '' }
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
  context.document = { getElementById: id => elements[id] || null, querySelectorAll: () => [] };

  assert.equal(JSON.stringify(context.getHeroLibrary().map(item => item.id)), JSON.stringify(['hero-duplicate', 'hero-duplicate-2', 'hero-duplicate-3']));

  context.selectHeroLibraryCategory('hero-duplicate');
  assert.equal((elements['hero-library-list'].innerHTML.match(/class="hero-library-card[^"]* active/g) || []).length, 1);
  assert.equal((elements['hero-library-list'].innerHTML.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(elements['hero-library-list'].innerHTML, /data-hero-category-id="hero-duplicate"><button class="hero-library-item active"/);

  context.selectHeroLibraryCategory('hero-duplicate-2');
  assert.equal(context.activeHeroLibraryCategoryId, 'hero-duplicate-2');
  assert.equal((elements['hero-library-list'].innerHTML.match(/class="hero-library-card[^"]* active/g) || []).length, 1);
  assert.equal((elements['hero-library-list'].innerHTML.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(elements['hero-library-list'].innerHTML, /data-hero-category-id="hero-duplicate-2"><button class="hero-library-item active"/);
  assert.doesNotMatch(elements['hero-library-list'].innerHTML, /data-hero-category-id="hero-duplicate"><button class="hero-library-item active"/);

  context.selectHeroLibraryCategory('hero-duplicate-3');
  assert.equal(context.activeHeroLibraryCategoryId, 'hero-duplicate-3');
  assert.equal((elements['hero-library-list'].innerHTML.match(/class="hero-library-card[^"]* active/g) || []).length, 1);
  assert.equal((elements['hero-library-list'].innerHTML.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(elements['hero-library-list'].innerHTML, /data-hero-category-id="hero-duplicate-3"><button class="hero-library-item empty active"/);
  assert.doesNotMatch(elements['hero-library-list'].innerHTML, /data-hero-category-id="hero-duplicate"><button class="hero-library-item active"/);
  assert.doesNotMatch(elements['hero-library-list'].innerHTML, /data-hero-category-id="hero-duplicate-2"><button class="hero-library-item active"/);
});

test('destination matches outrank stale hero memory for Greek Islands suggestions', () => {
  const library = [
    { id: 'caribbean', name: 'Caribbean', image: 'data:image/png;base64,caribbean', thumbnail: 'data:image/png;base64,caribbean', tags: ['Barbados', 'St Kitts'], lastUsed: '' },
    { id: 'med', name: 'Mediterranean', image: 'data:image/png;base64,med', thumbnail: 'data:image/png;base64,med', tags: ['Corfu', 'Rhodes', 'Crete'], lastUsed: '' }
  ];
  const { context } = createHarness({
    'cruiseHeroLibrary.v2': JSON.stringify(library),
    'cruiseHeroMemory.v2': JSON.stringify({ Crete: 'Caribbean', Corfu: 'Caribbean' })
  });

  assert.equal(context.getHeroSuggestionForOffer({ name: 'Marella Greek Islands', ports: 'Corfu • Rhodes • Crete' }).category.name, 'Mediterranean');
  assert.equal(context.getHeroSuggestionForOffer({ name: 'Virgin Greek Island Glow', ports: 'Santorini • Rhodes • Crete' }).category.name, 'Mediterranean');
  assert.equal(context.getHeroSuggestionForOffer({ ports: 'Barbados • Martinique • St Kitts' }).category.name, 'Caribbean');
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
