import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

function extractVersionBootstrap(source = html) {
  const match = source.match(/const APP_VERSION = "[^"]+";[\s\S]*?document\.querySelectorAll\("\[data-app-version\]"\)\.forEach\(label => \{ label\.textContent = APP_VERSION; \}\);/);
  assert.ok(match, 'Could not locate the APP_VERSION bootstrap');
  return match[0];
}

function runVersionBootstrap(source = html) {
  const labels = Array.from({ length: (source.match(/data-app-version(?=[ >])/g) || []).length }, () => ({ textContent: '' }));
  const context = {
    document: {
      title: '',
      querySelectorAll: selector => selector === '[data-app-version]' ? labels : []
    }
  };
  vm.createContext(context);
  vm.runInContext(extractVersionBootstrap(source).replace('const APP_VERSION', 'var APP_VERSION').replace('const APP_TITLE', 'var APP_TITLE'), context);
  return { context, labels };
}


test('static title and installed app metadata match the runtime browser/window title', () => {
  assert.match(html, /<title>em \| builder v4\.0<\/title>/);
  assert.match(html, /<meta name="application-name" content="em \| builder v4\.0">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="em v4\.0">/);
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  assert.equal(manifest.name, 'em | builder v4.0');
  assert.equal(manifest.short_name, 'em v4.0');
  assert.doesNotMatch(html, /Cruise Builder/);
  assert.doesNotMatch(JSON.stringify(manifest), /Cruise Builder/);
});

test('the application version is defined once and hydrates every displayed version label', () => {
  assert.equal((html.match(/const APP_VERSION = "v\d+\.\d+(?:\.\d+)?(?:\.\d+)?";/g) || []).length, 1);
  assert.equal((html.match(/data-app-version(?=[ >])/g) || []).length, 1);

  const { context, labels } = runVersionBootstrap();
  assert.equal(context.document.title, context.APP_TITLE);
  assert.deepEqual(labels.map(label => label.textContent), [context.APP_VERSION]);
});

test('changing only APP_VERSION updates the title and every version label', () => {
  const changedHtml = html.replace(/const APP_VERSION = "v\d+\.\d+(?:\.\d+)?(?:\.\d+)?";/, 'const APP_VERSION = "v9.9.9";');
  const { context, labels } = runVersionBootstrap(changedHtml);
  assert.equal(context.document.title, 'em | builder v9.9.9');
  assert.deepEqual(labels.map(label => label.textContent), ['v9.9.9']);
});

test('splash logo, navigation, and saved-session copy are centred by one splash composition', () => {
  assert.match(html, /\.splash\{[^}]*display:grid;[^}]*place-items:stretch;/);
  assert.match(html, /\.splash-inner\{[^}]*min-height:100vh;[^}]*display:grid;[^}]*grid-template-rows:minmax\(0,1fr\) auto;[^}]*justify-items:center;[^}]*align-items:center;/);
  assert.match(html, /\.splash-main\{[^}]*display:flex;[^}]*flex-direction:column;[^}]*align-items:center;[^}]*width:auto;[^}]*max-width:min\(320px,100%\);/);
  assert.match(html, /\.splash-lockup\{[^}]*display:flex;[^}]*flex-direction:column;[^}]*align-items:center;[^}]*width:fit-content;[^}]*max-width:100%;/);
  assert.match(html, /<div class="splash-main">[\s\S]*?<div class="splash-lockup">[\s\S]*?<img class="splash-icon"[\s\S]*?<div class="splash-actions">[\s\S]*?<button class="splash-btn gold" id="splash-open-builder-btn"[\s\S]*?New<\/button>[\s\S]*?<button class="splash-btn gold" id="splash-continue-session-btn"[\s\S]*?Continue<\/button>[\s\S]*?<button class="splash-btn secondary" id="splash-load-campaign-btn"[\s\S]*?Load<\/button>[\s\S]*?<footer id="splash-recent-session"/);
  assert.doesNotMatch(html, /\.splash-main\{[^}]*transform:/);
  assert.doesNotMatch(html, /\.splash-(?:actions|footer)\{[^}]*transform:translateX/);
  assert.match(html, /\.splash-icon\{[^}]*width:min\(208px,48vw\);[^}]*max-width:100%;[^}]*aspect-ratio:2094\/763;[^}]*object-fit:contain;[^}]*margin:0 0 30px;/);
  assert.doesNotMatch(html, /\.splash-(?:actions|footer|main|lockup|icon)\{[^}]*(?:margin-left|left):/);
  assert.doesNotMatch(html, /\.splash-footer\{[^}]*left:50%/);
});

test('splash New action expands into the minimalist campaign type menu', () => {
  assert.match(html, /<button class="splash-btn gold" id="splash-open-builder-btn" type="button" aria-expanded="false" aria-controls="splash-campaign-menu">New<\/button>/);
  assert.match(html, /<div class="splash-campaign-menu" id="splash-campaign-menu" role="menu" aria-label="Campaign type">[\s\S]*data-campaign-type="cruise">Cruise<\/button>[\s\S]*data-campaign-type="package">Package<\/button>[\s\S]*data-campaign-type="touring">Touring<\/button>[\s\S]*data-campaign-type="worldwide">Worldwide<\/button>/);
  assert.match(html, /\.splash-campaign-menu\{[^}]*display:flex;[^}]*flex-direction:column;[^}]*padding-top:5px;/);
  assert.match(html, /\.splash-campaign-option\{[^}]*border:0;[^}]*background:transparent;[^}]*padding:2px 0;[^}]*color:#fff;[^}]*letter-spacing:3px;[^}]*transition:color \.14s ease;/);
  assert.match(html, /\.splash-campaign-option:hover,\.splash-campaign-option:focus-visible\{[^}]*background:transparent;[^}]*color:#9e936c;[^}]*text-decoration:none;/);
  assert.match(html, /window\.openBuilderFromSplashCampaignType = function\(type,event\)/);
  assert.match(html, /let splashCampaignMenuCloseTimer=null;/);
  assert.match(html, /function scheduleSplashCampaignMenuClose\(\)\{[\s\S]*?setTimeout\(\(\)=>\{[\s\S]*?setSplashCampaignMenuOpen\(false\);[\s\S]*?\},130\);/);
  assert.match(html, /newWrap\.addEventListener\("mouseenter",clearSplashCampaignMenuCloseTimer\);/);
  assert.match(html, /newWrap\.addEventListener\("mouseleave",\(\)=>\{[\s\S]*?scheduleSplashCampaignMenuClose\(\);/);
  assert.match(html, /currentCampaignType=normaliseCampaignType\(normalised\);/);
});

test('splash saved session copy uses saved work wording', () => {
  assert.match(html, /name\.textContent="Saved work found";/);
  assert.doesNotMatch(html, /Previous work found/);
});
