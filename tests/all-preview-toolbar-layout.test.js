import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

function extractFunction(name){
  const start = script.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  let depth = 0;
  let seen = false;
  for(let i = start; i < script.length; i++){
    if(script[i] === '{'){ depth++; seen = true; }
    if(script[i] === '}'){
      depth--;
      if(seen && depth === 0) return script.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const layoutSource = [
  'const ALL_PREVIEW_MAX_SCALE = 0.68;',
  'const ALL_PREVIEW_CARD_GAP = 64;',
  extractFunction('getAllPreviewGridMetrics'),
  extractFunction('calculateAllPreviewScale'),
  extractFunction('applyAllPreviewLayout'),
  extractFunction('getToolbarResponsiveState'),
  extractFunction('getToolbarOverflowActions')
].join('\n');

function createContext(){
  const context = { window: { getComputedStyle: () => ({ paddingLeft: '10px', paddingRight: '10px', paddingTop: '10px', paddingBottom: '10px' }) } };
  vm.createContext(context);
  vm.runInContext(layoutSource, context);
  return context;
}

test('All 4 stage dimensions equal scaled canvas dimensions with top-left canvas transform', () => {
  const ctx = createContext();
  const stage = { style: {}, dataset: {} };
  const canvas = { style: {}, dataset: {} };
  const metrics = ctx.getAllPreviewGridMetrics(4);
  const result = ctx.applyAllPreviewLayout(stage, canvas, metrics, { w: 1200, h: 900 });
  assert.equal(metrics.columns, 2);
  assert.equal(metrics.rows, 2);
  assert.equal(stage.style.width, `${Math.floor(metrics.canvasWidth * result.scale)}px`);
  assert.equal(stage.style.height, `${Math.floor(metrics.canvasHeight * result.scale)}px`);
  assert.equal(stage.style.margin, 'auto');
  assert.equal(stage.style.transform, 'none');
  assert.equal(canvas.style.width, `${metrics.canvasWidth}px`);
  assert.equal(canvas.style.height, `${metrics.canvasHeight}px`);
  assert.equal(canvas.style.transform, `scale(${result.scale})`);
  assert.equal(canvas.style.transformOrigin, 'top left');
});

test('All 4 metrics centre one, two and three offers with predictable rows and columns', () => {
  const ctx = createContext();
  assert.deepEqual({ columns: ctx.getAllPreviewGridMetrics(1).columns, rows: ctx.getAllPreviewGridMetrics(1).rows }, { columns: 1, rows: 1 });
  assert.deepEqual({ columns: ctx.getAllPreviewGridMetrics(2).columns, rows: ctx.getAllPreviewGridMetrics(2).rows }, { columns: 2, rows: 1 });
  assert.deepEqual({ columns: ctx.getAllPreviewGridMetrics(3).columns, rows: ctx.getAllPreviewGridMetrics(3).rows }, { columns: 2, rows: 2 });
});

test('All 4 uses one gutter in both directions without stretching intrinsically sized rows', () => {
  const ctx = createContext();
  const metrics = ctx.getAllPreviewGridMetrics(4);
  const jet2Card = { width: metrics.cardWidth, height: 885 };
  const positions = [
    { x: metrics.padding, y: metrics.padding },
    { x: metrics.padding + jet2Card.width + metrics.gap, y: metrics.padding },
    { x: metrics.padding, y: metrics.padding + jet2Card.height + metrics.gap },
    { x: metrics.padding + jet2Card.width + metrics.gap, y: metrics.padding + jet2Card.height + metrics.gap }
  ];

  assert.equal(positions[1].x - positions[0].x - jet2Card.width, metrics.gap);
  assert.equal(positions[2].y - positions[0].y - jet2Card.height, metrics.gap);
  assert.equal(positions[3].x - positions[2].x - jet2Card.width, metrics.gap);
  assert.deepEqual(positions.slice(0, 2).map(({ y }) => y), [metrics.padding, metrics.padding]);
  assert.deepEqual(positions.slice(2).map(({ y }) => y), [metrics.padding + jet2Card.height + metrics.gap, metrics.padding + jet2Card.height + metrics.gap]);
  assert.match(html, /\.all-preview-grid\{[^}]*align-items:start;align-content:start;/);
  assert.match(html, /\.all-preview-grid\{[^}]*gap:var\(--all-preview-card-gap\);/);
  assert.match(html, /grid\.style\.setProperty\('--all-preview-card-gap', metrics\.gap \+ 'px'\);/);
  assert.doesNotMatch(html, /grid\.style\.(?:rowGap|columnGap)/);
  assert.doesNotMatch(html, /grid\.style\.minHeight = metrics\.canvasHeight/);
  assert.match(html, /const naturalHeight = grid\.scrollHeight \|\| grid\.offsetHeight \|\| metrics\.canvasHeight;/);
});

test('All 4 scale is constrained by pane width, pane height and max scale independent of cur', () => {
  const ctx = createContext();
  const metrics = ctx.getAllPreviewGridMetrics(4);
  assert.equal(ctx.calculateAllPreviewScale(metrics.canvasWidth * 2, metrics.canvasHeight * 2, metrics.canvasWidth, metrics.canvasHeight, 0.68), 0.68);
  assert.equal(ctx.calculateAllPreviewScale(metrics.canvasWidth / 2, metrics.canvasHeight * 2, metrics.canvasWidth, metrics.canvasHeight, 0.68), 0.5);
  assert.equal(ctx.calculateAllPreviewScale(metrics.canvasWidth * 2, metrics.canvasHeight / 4, metrics.canvasWidth, metrics.canvasHeight, 0.68), 0.25);
  assert.doesNotMatch(extractFunction('getAllPreviewGridMetrics') + extractFunction('applyAllPreviewLayout'), /\bcur\b/);
});

test('toolbar responsive states expose the correct overflow actions without duplicating view modes', () => {
  const ctx = createContext();
  assert.equal(ctx.getToolbarResponsiveState(1000), 'toolbar-wide');
  assert.deepEqual(Array.from(ctx.getToolbarOverflowActions('toolbar-wide')), []);
  assert.equal(ctx.getToolbarResponsiveState(700), 'toolbar-medium');
  assert.deepEqual(Array.from(ctx.getToolbarOverflowActions('toolbar-medium')), ['new-campaign','shortcuts']);
  assert.equal(ctx.getToolbarResponsiveState(500), 'toolbar-compact');
  assert.deepEqual(Array.from(ctx.getToolbarOverflowActions('toolbar-compact')), ['new-campaign','shortcuts','reset','home']);
  assert.doesNotMatch(ctx.getToolbarOverflowActions('toolbar-compact').join(','), /single|email|all/i);
});

test('toolbar CSS preserves font sizes and closes overflow on Escape and outside click', () => {
  assert.match(html, /\.toolbar-overflow-menu button\{[^}]*font-size:9px;[^}]*font-weight:300;/);
  assert.match(html, /document\.addEventListener\('click',[\s\S]*?closeToolbarOverflowMenu\(\);[\s\S]*?\}\);/);
  assert.match(html, /document\.addEventListener\('keydown',[\s\S]*?event\.key === 'Escape'[\s\S]*?closeToolbarOverflowMenu\(true\);/);
  assert.match(html, /\.preview-toolbar\.toolbar-compact \.toolbar-group-actions,\.preview-toolbar\.toolbar-compact \.toolbar-group-utility\{display:none;\}/);
  assert.doesNotMatch(html, /\.vbtn\{[^}]*font-size:(?!9px)/);
});
