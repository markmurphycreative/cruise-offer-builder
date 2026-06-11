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
    extractFunction('cssUrl'),
    extractFunction('escapeAttr'),
    extractFunction('getHeroImageSource'),
    extractFunction('renderHeroHTML'),
    extractFunction('renderCardHTML')
  ].join('\n'), context);
  return context;
}

function renderedHero(htmlString) {
  const heroMatch = htmlString.match(/<div class="hero"[^>]+>/);
  assert.ok(heroMatch, `Expected rendered hero element in ${htmlString}`);
  return heroMatch[0];
}

test('uploading an image stores the hero source and renders a valid background-image hero element', () => {
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
  assert.match(hero, /data-hero-src="data:image\/png;base64,iVBOR/);
  assert.match(hero, /style="background-image:url\("data:image\/png;base64,iVBOR/);
  assert.doesNotMatch(rendered, /<div class="hph"/);
});

test('placeholder panel is removed when a hero image source exists', () => {
  const { renderCardHTML } = createRenderContext();
  const emptyCard = renderCardHTML({ operator: 'ncl' });
  const heroCard = renderCardHTML({ operator: 'ncl', _img: 'data:image/jpeg;base64,hero' });

  assert.match(emptyCard, /<div class="hph"><span>Norwegian Cruise Line<\/span>/);
  assert.doesNotMatch(heroCard, /<div class="hph"/);
  assert.match(heroCard, /<div class="hero-wrap"/);
});

test('preview and export use renderCardHTML as the same hero source path', () => {
  const renderOfferWithCta = extractFunction('renderOfferWithOptionalCtaHTML');
  const previewRenderer = extractFunction('renderVisibleCard');
  const exportRenderer = extractFunction('renderCardToImageBlob');

  assert.match(renderOfferWithCta, /const card=bc\(offerData \|\| \{\}\);/);
  assert.match(previewRenderer, /out\.innerHTML = renderOfferWithOptionalCtaHTML\(visibleFieldsToData\(\), getCtaSettingsFromUI\(\)\);/);
  assert.match(exportRenderer, /wrap\.innerHTML = renderCardHTML\(offerData\);/);
  assert.match(exportRenderer, /const heroBackgrounds = Array\.from\(wrap\.querySelectorAll\('\.hero-wrap \.hero\[data-hero-src\]'\)\);/);
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

  assert.match(hero, /data-hero-src="data:image\/png;base64,restoredHero"/);
  assert.match(hero, /data-crop-x="22"/);
  assert.match(hero, /data-crop-y="64"/);
  assert.match(hero, /data-crop-zoom="145"/);
  assert.match(hero, /data-fit-mode="fit"/);
  assert.match(rendered, /<div class="hero-wrap" style="background:#0e1b2a;">/);
  assert.doesNotMatch(rendered, /<div class="hph"/);
});
