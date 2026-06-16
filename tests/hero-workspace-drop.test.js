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

function createDropContext({ offers = [{}, {}, {}, {}], cur = 0, lockedHeroImages = [false, false, false, false] } = {}) {
  const calls = { refreshed: 0, thumb: [], sync: 0, history: [], status: [] };
  const context = {
    offers,
    cur,
    lockedHeroImages,
    setThumb: (type, src) => calls.thumb.push({ type, src }),
    syncHeroUi: () => { calls.sync += 1; },
    refreshOfferUi: () => { calls.refreshed += 1; },
    recordCampaignHistoryAfterAsyncChange: msg => calls.history.push(msg),
    document: { getElementById: () => null },
    console,
    clearTimeout: () => {},
    setTimeout: () => 0,
    FileReader: class {
      readAsDataURL(file) {
        this.onload({ target: { result: file.dataUrl } });
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('normaliseHeroLockArray'),
    extractFunction('isHeroImageLocked'),
    extractFunction('getFirstAcceptedHeroDropFile'),
    extractFunction('showHeroDropStatus'),
    extractFunction('applyHeroImageSourceToOffer'),
    extractFunction('readHeroDropFile'),
    extractFunction('clearHeroDragOver'),
    extractFunction('handleHeroWorkspaceDragOver'),
    extractFunction('handleHeroWorkspaceDrop')
  ].join('\n'), context);
  context.calls = calls;
  context.showHeroDropStatus = (message, isError) => calls.status.push({ message, isError });
  return context;
}

function dropEvent(files) {
  return {
    prevented: false,
    stopped: false,
    dataTransfer: { files },
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; }
  };
}

function image(type, dataUrl) {
  return { type, name: 'hero', dataUrl };
}

test('dropping an image in Single view updates the currently selected offer hero', () => {
  const context = createDropContext({ cur: 2 });
  const event = dropEvent([image('image/png', 'data:image/png;base64,single')]);

  assert.equal(context.handleHeroWorkspaceDrop(event, context.cur, null), true);

  assert.equal(context.offers[2]._img, 'data:image/png;base64,single');
  assert.equal(context.offers[0]._img, undefined);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.deepEqual(context.calls.thumb, [{ type: 'hero', src: 'data:image/png;base64,single' }]);
});

test('dropping an image onto card 1 in All 4 view updates only offer 1', () => {
  const context = createDropContext({ cur: 3 });
  context.handleHeroWorkspaceDrop(dropEvent([image('image/jpeg', 'data:image/jpeg;base64,one')]), 0, null);

  assert.equal(context.offers[0]._img, 'data:image/jpeg;base64,one');
  assert.deepEqual(context.offers.slice(1).map(o => o._img), [undefined, undefined, undefined]);
});

test('dropping an image onto card 2 in All 4 view updates only offer 2', () => {
  const context = createDropContext({ cur: 0 });
  context.handleHeroWorkspaceDrop(dropEvent([image('image/webp', 'data:image/webp;base64,two')]), 1, null);

  assert.equal(context.offers[1]._img, 'data:image/webp;base64,two');
  assert.equal(context.offers[0]._img, undefined);
  assert.equal(context.calls.thumb.length, 0, 'non-current card drops do not rewrite the visible panel thumbnail');
});

test('dropping an image in Email/stacked view updates the correct visible offer', () => {
  const context = createDropContext({ cur: 0 });
  context.handleHeroWorkspaceDrop(dropEvent([image('image/png', 'data:image/png;base64,email3')]), 3, null);

  assert.equal(context.offers[3]._img, 'data:image/png;base64,email3');
  assert.deepEqual(context.offers.slice(0, 3).map(o => o._img), [undefined, undefined, undefined]);
});

test('locked/protected hero images are not overwritten', () => {
  const context = createDropContext({ offers: [{ _img: 'existing' }, {}, {}, {}], lockedHeroImages: [true, false, false, false] });
  const event = dropEvent([image('image/png', 'data:image/png;base64,new')]);

  assert.equal(context.handleHeroWorkspaceDrop(event, 0, null), false);

  assert.equal(context.offers[0]._img, 'existing');
  assert.equal(event.prevented, true);
  assert.equal(context.calls.refreshed, 0);
});

test('non-image drops are ignored safely and browser default file-open behaviour is prevented', () => {
  const context = createDropContext();
  const event = dropEvent([{ type: 'text/plain', name: 'notes.txt', dataUrl: 'data:text/plain,notes' }]);

  assert.equal(context.handleHeroWorkspaceDrop(event, 0, null), false);

  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(context.offers[0]._img, undefined);
});

test('multiple dropped files use only the first valid image', () => {
  const context = createDropContext();
  context.handleHeroWorkspaceDrop(dropEvent([
    { type: 'application/pdf', name: 'brief.pdf', dataUrl: 'data:application/pdf;base64,no' },
    image('image/gif', 'data:image/gif;base64,first-valid'),
    image('image/png', 'data:image/png;base64,ignored')
  ]), 0, null);

  assert.equal(context.offers[0]._img, 'data:image/gif;base64,first-valid');
});

test('workspace drop support is bound to all preview modes and exports use the dropped hero path', () => {
  assert.match(extractFunction('renderSingleOffer'), /enhanceHeroDropTarget\(out, cur\)/);
  assert.match(extractFunction('renderPreviewMode'), /enhanceHeroDropTarget\(cardWrap, i\)/);
  assert.match(extractFunction('renderPreviewMode'), /enhanceHeroDropTarget\(c, index\)/);
  assert.match(extractFunction('renderCardToImageBlob'), /renderCardHTML\(offerData\)/);
  assert.match(html, /\.preview-hero-drop-target\.hero-drag-over/);
});
