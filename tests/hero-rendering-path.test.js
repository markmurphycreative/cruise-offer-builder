import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not locate ${name}`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function createRenderContext(extra = {}) {
  const context = {
    OPERATOR_HERO_PLACEHOLDERS: { ncl: ['Norwegian Cruise Line', 'Hero Image'] },
    getOperatorSkinStyle: () => '',
    getHeaderHTML: () => '',
    document: {
      getElementById(id) {
        if (id === 'g-terms') return { value: 'T&Cs Apply' };
        return { value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} } };
      }
    },
    ...extra
  };
  vm.createContext(context);
  vm.runInContext([
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
    extractFunction('chunkBullets'),
    extractFunction('escapeAttr'),
    extractFunction('getHeroImageSource'),
    extractFunction('getItineraryImageSource'),
    extractFunction('renderItineraryImageHTML'),
    extractFunction('renderHeroHTML'),
    extractFunction('renderCardHTML')
  ].join('\n'), context);
  return context;
}

function renderedHero(htmlString) {
  const heroMatch = htmlString.match(/<img class="hero"[^>]+>/);
  assert.ok(heroMatch, `Expected rendered hero image in ${htmlString}`);
  return heroMatch[0];
}

test('uploading an image stores the hero source and renders a real hero image element', () => {
  let rendered = '';
  const context = createRenderContext({
    offers: [{ operator: 'ncl' }],
    cur: 0,
    syncHeroUi: () => {},
    refreshOfferUi: () => { rendered = context.renderCardHTML(context.offers[context.cur]); },
    queueAutosave: () => {},
    FileReader: class {
      readAsDataURL(file) {
        this.onload({ target: { result: file.dataUrl } });
      }
    }
  });
  vm.runInContext([
    extractFunction('setThumb'),
    extractFunction('readFile')
  ].join('\n'), context);

  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
  context.readFile({ type: 'image/png', name: 'hero.png', dataUrl }, 'hero');

  assert.equal(context.offers[0]._img, dataUrl);
  const hero = renderedHero(rendered);
  assert.match(hero, /src="data:image\/png;base64,iVBOR/);
  assert.match(hero, /data-hero-src="data:image\/png;base64,iVBOR/);
  assert.doesNotMatch(hero, /background-image/);
  assert.doesNotMatch(rendered, /<div class="hph"/);
});

test('placeholder panel is removed when a hero image source exists', () => {
  const { renderCardHTML } = createRenderContext();
  const emptyCard = renderCardHTML({ operator: 'ncl' });
  const heroCard = renderCardHTML({ operator: 'ncl', _img: 'data:image/jpeg;base64,hero' });

  assert.match(emptyCard, /<div class="hph"><span>Norwegian Cruise Line<\/span>/);
  assert.doesNotMatch(heroCard, /<div class="hph"/);
  assert.match(heroCard, /<div class="hero-wrap"/);
  assert.match(heroCard, /<img class="hero" src="data:image\/jpeg;base64,hero"/);
});


test('workspace hero placeholders are enhanced in preview only and reuse the existing hero input', () => {
  assert.match(html, /\.preview-pane \.hph\.clickable-hero-placeholder\{cursor:pointer;/);
  assert.match(html, /\.preview-pane \.hph\.clickable-hero-placeholder::after\{content:"ADD HERO IMAGE"/);
  assert.match(extractFunction('openHeroImagePickerForOffer'), /document\.querySelector\('#dz-hero input\[type="file"\]'\)/);
  assert.match(extractFunction('openHeroImagePickerForOffer'), /input\.click\(\)/);
  assert.match(extractFunction('enhanceClickableHeroPlaceholders'), /openHeroImagePickerForOffer\(resolvedIndex\)/);
  assert.match(extractFunction('renderPreviewMode'), /enhanceClickableHeroPlaceholders\(cardWrap, i\)/);
  assert.match(extractFunction('renderPreviewMode'), /enhanceClickableHeroPlaceholders\(c, index\)/);
  assert.doesNotMatch(extractFunction('renderHeroHTML'), /clickable-hero-placeholder|onclick|input\.click/);
});

test('preview and export use renderCardHTML as the same hero source path', () => {
  const renderOfferWithCta = extractFunction('renderOfferWithOptionalCtaHTML');
  const previewRenderer = extractFunction('renderVisibleCard');
  const exportRenderer = extractFunction('renderCardToImageBlob');

  assert.match(renderOfferWithCta, /const card=bc\(offerData \|\| \{\}\);/);
  assert.match(previewRenderer, /out\.innerHTML = renderOfferWithOptionalCtaHTML\(visibleFieldsToData\(\), getCtaSettingsFromUI\(\)\);/);
  assert.match(exportRenderer, /wrap\.innerHTML = renderCardHTML\(offerData\);/);
  assert.match(exportRenderer, /const imgs = Array\.from\(wrap\.querySelectorAll\('img'\)\);/);
  assert.doesNotMatch(exportRenderer, /heroBackgrounds|background-image/);
});

test('existing campaign offers containing hero images render with the saved hero source', () => {
  const { renderCardHTML } = createRenderContext();
  const savedOffer = {
    operator: 'ncl',
    name: 'Restored Campaign Offer',
    _img: 'data:image/png;base64,restoredHero',
    _cropZoom: 145,
    _cropX: 22,
    _cropY: 64,
    _cropPosVersion: 2,
    _heroFitMode: 'fit'
  };

  const rendered = renderCardHTML(savedOffer);
  const hero = renderedHero(rendered);

  assert.match(hero, /src="data:image\/png;base64,restoredHero"/);
  assert.match(hero, /data-hero-src="data:image\/png;base64,restoredHero"/);
  assert.match(hero, /data-crop-x="22"/);
  assert.match(hero, /data-crop-y="64"/);
  assert.match(hero, /data-crop-zoom="145"/);
  assert.match(hero, /data-fit-mode="fit"/);
  assert.match(rendered, /<div class="hero-wrap" style="background:#0e1b2a;">/);
  assert.doesNotMatch(rendered, /<div class="hph"/);
});


test('campaign save and load paths preserve hero image data', () => {
  const payloadBuilder = extractFunction('buildCampaignFilePayload');
  const restorePayload = extractFunction('restoreCampaignFilePayload');
  const loadEditor = extractFunction('loadOfferToEditor');

  assert.match(payloadBuilder, /offers:portableOffers/);
  assert.match(payloadBuilder, /heroImages:\{source:"state\.offers"/);
  assert.match(payloadBuilder, /\{_img="",_imgSource="",_imgNeedsReupload=false/);
  assert.match(restorePayload, /const restored=JSON\.parse\(JSON\.stringify\(state\)\)/);
  assert.match(restorePayload, /applySessionPayload\(restored\)/);
  assert.match(loadEditor, /setThumb\('hero', o\._img \|\| ''\)/);
});


test('optional itinerary image renders between offer details and Youll Visit only when provided', () => {
  const { renderCardHTML } = createRenderContext();
  const cardWithoutItinerary = renderCardHTML({ operator: 'ncl', _img: 'data:image/jpeg;base64,hero' });
  const cardWithItinerary = renderCardHTML({ operator: 'ncl', _img: 'data:image/jpeg;base64,hero', _itineraryImg: 'data:image/png;base64,map' });

  assert.doesNotMatch(cardWithoutItinerary, /itinerary-wrap/);
  assert.match(cardWithItinerary, /<div class="route-map-section"><div class="itinerary-wrap"><img class="itinerary-img" src="data:image\/png;base64,map"/);
  assert.ok(cardWithItinerary.indexOf('<div class="ibar">') < cardWithItinerary.indexOf('<div class="itinerary-wrap">'));
  assert.ok(cardWithItinerary.indexOf('<div class="itinerary-wrap">') < cardWithItinerary.indexOf('<div class="vsec">'));
});

test('route map upload resolves against the offer active when the file was selected', () => {
  const readFileSource = extractFunction('readFile');
  assert.match(readFileSource, /const targetOfferIndex=cur;/);
  assert.match(readFileSource, /offers\[targetOfferIndex\]\._itineraryImg=src/);
  assert.match(readFileSource, /if\(targetOfferIndex===cur\)\{ setThumb\("itinerary",src\); syncItineraryUi\(\); \}/);
  assert.doesNotMatch(readFileSource, /offers\[cur\]\._itineraryImg=src/);
});
