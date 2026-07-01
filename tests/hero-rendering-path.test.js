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
    html.slice(html.indexOf('const EDITABLE_IMAGE_CONFIG='), html.indexOf('function getEditableImageViewport')),
    extractFunction('getEditableImageConfig'),
    extractFunction('renderEditableImageHTML'),
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


test('workspace hero placeholders and images are enhanced in preview only and reuse the existing hero input', () => {
  assert.match(html, /\.preview-pane \.hph\.clickable-hero-placeholder,\.preview-pane \.hero\.clickable-hero-image\{cursor:pointer;/);
  assert.match(html, /\.preview-pane \.hph\.clickable-hero-placeholder::after\{content:"ADD HERO IMAGE"/);
  assert.match(extractFunction('openHeroImagePickerForOffer'), /document\.querySelector\('#dz-hero input\[type="file"\]'\)/);
  assert.match(extractFunction('openHeroImagePickerForOffer'), /pendingHeroPickerOfferIndex=offerIndex/);
  assert.match(extractFunction('openHeroImagePickerForOffer'), /input\.click\(\)/);
  assert.match(extractFunction('bindHeroPickerTarget'), /openHeroImagePickerForOffer\(resolvedIndex\)/);
  assert.doesNotMatch(extractFunction('enhanceClickableHeroImages'), /viewMode/);
  assert.match(extractFunction('enhanceClickableHeroPlaceholders'), /bindHeroPickerTarget\(placeholder, offerIndex, \{replace:false\}\)/);
  assert.match(extractFunction('enhanceClickableHeroImages'), /bindHeroPickerTarget\(hero, offerIndex, \{replace:true\}\)/);
  assert.match(extractFunction('enhanceClickableHeroImagesAndPlaceholders'), /enhanceClickableHeroPlaceholders\(root, offerIndex\)/);
  assert.match(extractFunction('enhanceClickableHeroImagesAndPlaceholders'), /enhanceClickableHeroImages\(root, offerIndex\)/);
  assert.match(extractFunction('renderPreviewMode'), /enhanceClickableHeroImagesAndPlaceholders\(cardWrap, i\)/);
  assert.match(extractFunction('renderPreviewMode'), /enhanceClickableHeroImagesAndPlaceholders\(c, index\)/);
  assert.match(extractFunction('renderVisibleCard'), /enhanceClickableHeroImagesAndPlaceholders\(out, cur\)/);
  assert.doesNotMatch(extractFunction('renderHeroHTML'), /clickable-hero-placeholder|clickable-hero-image|onclick|input\.click/);
});


test('single and email preview render paths directly bind actual rendered hero elements', () => {
  const directBinder = extractFunction('bindRenderedHeroPickerTargets');
  assert.match(directBinder, /root\.querySelectorAll\("\.cc"\)/);
  assert.match(directBinder, /children\.find\(el=>el\.classList&&el\.classList\.contains\("hero-wrap"\)\)/);
  assert.match(directBinder, /heroWrap&&heroWrap\.querySelector\("img\.hero\[data-editable-image-type='hero'\],img\.hero"\)/);
  assert.match(directBinder, /bindHeroPickerTarget\(heroImg, offerIndex, \{replace:true\}\)/);
  assert.match(directBinder, /children\.find\(el=>el\.classList&&el\.classList\.contains\("hph"\)\)/);
  assert.match(directBinder, /bindHeroPickerTarget\(placeholder, offerIndex, \{replace:false\}\)/);

  assert.match(extractFunction('bindSinglePreviewHeroPickerTargets'), /bindRenderedHeroPickerTargets\(root, offerIndex\)/);
  assert.match(extractFunction('bindEmailPreviewHeroPickerTargets'), /bindRenderedHeroPickerTargets\(root, offerIndex\)/);
  assert.match(extractFunction('renderVisibleCard'), /bindSinglePreviewHeroPickerTargets\(out, cur\)/);
  assert.match(extractFunction('renderPreviewMode'), /bindEmailPreviewHeroPickerTargets\(cardWrap, i\)/);
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
  assert.match(loadEditor, /setThumb\('itinerary', o\._itineraryImg \|\| ''\)/);
  assert.match(loadEditor, /querySelector\('#dz-itinerary input\[type=\"file\"\]'\)/);
});


test('optional itinerary image renders between offer details and Youll Visit only when provided', () => {
  const { renderCardHTML } = createRenderContext();
  const cardWithoutItinerary = renderCardHTML({ operator: 'ncl', _img: 'data:image/jpeg;base64,hero' });
  const cardWithItinerary = renderCardHTML({ operator: 'ncl', _img: 'data:image/jpeg;base64,hero', _itineraryImg: 'data:image/png;base64,map' });

  assert.doesNotMatch(cardWithoutItinerary, /itinerary-wrap/);
  assert.match(cardWithItinerary, /<div class="route-map-section" style="background:#eef2e8;"><img class="itinerary-img" src="data:image\/png;base64,map"/);
  assert.ok(cardWithItinerary.indexOf('<div class="ibar">') < cardWithItinerary.indexOf('<div class="route-map-section"'));
  assert.ok(cardWithItinerary.indexOf('<div class="route-map-section"') < cardWithItinerary.indexOf('<div class="vsec">'));
});

test('route map editor controls enable from the active offer image on every switch', () => {
  const syncUi = extractFunction('syncEditableImageUi');
  assert.match(syncUi, /const src=String\(\(o&&o\[cfg\.imageKey\]\)\|\|""\)\.trim\(\)/);
  assert.match(syncUi, /const hasImg=!!src/);
  assert.match(syncUi, /querySelectorAll\("button,input,select,textarea"\)\.forEach\(control=>\{ control\.disabled=!hasImg\|\|locked; \}\)/);

  const loadEditor = extractFunction('loadOfferToEditor');
  assert.match(loadEditor, /setThumb\('itinerary', o\._itineraryImg \|\| ''\)/);
  assert.match(loadEditor, /syncItineraryUi\(\)/);

  assert.match(html, /function sv\(i\)\{[\s\S]*?cur=Number\(i\);[\s\S]*?loadOfferToEditor\(cur\);/);
});

test('route map upload resolves against the offer active when the file was selected', () => {
  const readFileSource = extractFunction('readFile');
  assert.match(readFileSource, /let targetOfferIndex=cur;/);
  assert.match(readFileSource, /if\(type==="hero"&&typeof pendingHeroPickerOfferIndex!=="undefined"&&Number\.isInteger\(pendingHeroPickerOfferIndex\)\) targetOfferIndex=pendingHeroPickerOfferIndex;/);
  assert.match(readFileSource, /normaliseRouteMapImageSource\(src\)\.then\(normalisedSrc=>applyRouteMapImageSourceToOffer\(normalisedSrc,targetOfferIndex\)\)/);
  const applyRouteMapSource = extractFunction('applyRouteMapImageSourceToOffer');
  assert.match(applyRouteMapSource, /offers\[offerIndex\]\._itineraryImg=src/);
  assert.match(applyRouteMapSource, /offers\[offerIndex\]\._itineraryFitMode="fill"/);
  assert.match(applyRouteMapSource, /if\(offerIndex===cur\)\{ setThumb\("itinerary",src\); syncItineraryUi\(\); \}/);
  assert.doesNotMatch(readFileSource, /offers\[cur\]\._itineraryImg=src/);
});
