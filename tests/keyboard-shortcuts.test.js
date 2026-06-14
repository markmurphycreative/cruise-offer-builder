import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shortcuts = html.match(/\/\/ Lightweight global shortcuts:[\s\S]*?document\.addEventListener\('keydown',handleKeyboardShortcut\);/)?.[0];

test('visible app version is v2.2.2', () => {
  assert.match(html, /const APP_VERSION = \"v2\.2\.2\";/);
});

function setup(){
  const calls=[];
  const modal={classList:{active:false,add(){this.active=true;},remove(){this.active=false;},contains(){return this.active;}}};
  const close={focus(){ calls.push(['focus-close']); }};
  const ctaEnabled={checked:false};
  function makeSection(key, collapsed=true){
    const hdr={
      collapsed,
      classList:{contains(name){ return name === 'collapsed' && hdr.collapsed; }}
    };
    return {
      hdr,
      scrollIntoView(){ calls.push(['scroll',key]); },
      querySelector(selector){ return selector === '.section-hdr' ? hdr : null; }
    };
  }
  const sectionNodes={
    'utm-link':makeSection('utm-link'),
    'cta-assets':makeSection('cta-assets')
  };
  const document={
    activeElement:null,
    getElementById(id){ return id === 'shortcuts-modal' ? modal : id === 'shortcuts-close' ? close : id === 'cta-enabled' ? ctaEnabled : null; },
    querySelector(selector){ const match=String(selector).match(/data-section-key=\"([^\"]+)\"/); return match ? sectionNodes[match[1]] : null; },
    addEventListener(type,handler){ this.handler=handler; }
  };
  const context={document,cur:0,offers:[{name:'One'},{name:'Two'},{name:'Three'},{name:'Four'}],isOfferLoaded:offer=>!!offer.name,sv:i=>{ context.cur=i; calls.push(['sv',i]); },setView:v=>calls.push(['view',v]),toggleSec:hdr=>{ hdr.collapsed=!hdr.collapsed; calls.push(['toggle',hdr.collapsed ? 'closed' : 'open']); },exportCurrentJPG:()=>calls.push(['jpg']),exportAllJPG:()=>calls.push(['zip']),refreshOffers:()=>calls.push(['refresh']),moveOfferLeft:()=>calls.push(['move-left']),moveOfferRight:()=>calls.push(['move-right']),ctaSettingsChanged:()=>calls.push(['cta-changed',context.document.getElementById('cta-enabled').checked]),undoCampaignChange:()=>calls.push(['undo']),redoCampaignChange:()=>calls.push(['redo'])};
  vm.runInNewContext(shortcuts,context);
  return {calls,context,document,modal,sectionNodes};
}
function fire(document,key,overrides={}){
  let prevented=false;
  document.handler({key,defaultPrevented:false,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,target:{closest:()=>null},preventDefault(){prevented=true;},...overrides});
  return prevented;
}

test('the global keyboard shortcut listener is attached exactly once', () => {
  assert.equal((html.match(/document\.addEventListener\('keydown',handleKeyboardShortcut\);/g) || []).length, 1);
});

test('shortcuts modal and small toolbar trigger list the supported keyboard shortcuts', () => {
  assert.match(html, /<button class="shortcuts-trigger"[^>]*onclick="openShortcutsModal\(\)"[^>]*>Shortcuts<\/button>/);
  assert.match(html, /id="shortcuts-modal"[\s\S]*?Keyboard Shortcuts[\s\S]*?<kbd>Cmd<\/kbd>\/<kbd>Ctrl<\/kbd> \+ <kbd>Z<\/kbd>[\s\S]*?<kbd>1<\/kbd>[\s\S]*?<kbd>Tab<\/kbd>[\s\S]*?<kbd>Cmd<\/kbd>\/<kbd>Ctrl<\/kbd> \+ <kbd>S<\/kbd>[\s\S]*?<kbd>R<\/kbd>[\s\S]*?<kbd>U<\/kbd>[\s\S]*?<kbd>C<\/kbd>[\s\S]*?<kbd>Shift<\/kbd> \+ <kbd>C<\/kbd>[\s\S]*?<kbd>←<\/kbd> \/ <kbd>→<\/kbd>[\s\S]*?<kbd>\?<\/kbd>[\s\S]*?<kbd>Esc<\/kbd>/);
});

test('card, view, undo, redo, export, refresh, UTM, CTA, help, and Escape shortcuts reuse existing actions', () => {
  const {calls,context,document,modal}=setup();
  for(const [key,index] of [['1',0],['2',1],['3',2],['4',3]]){ assert.equal(fire(document,key),true); assert.deepEqual(calls.splice(-2),[['sv',index],['view','single']]); }
  context.cur=3; fire(document,'Tab'); assert.deepEqual(calls.splice(-2),[['sv',0],['view','single']]);
  fire(document,'Tab',{shiftKey:true}); assert.deepEqual(calls.splice(-2),[['sv',3],['view','single']]);
  for(const [key,view] of [['s','single'],['E','email'],['a','all']]){ fire(document,key); assert.deepEqual(calls.pop(),['view',view]); }
  fire(document,'z',{ctrlKey:true}); assert.deepEqual(calls.pop(),['undo']);
  fire(document,'Z',{metaKey:true,shiftKey:true}); assert.deepEqual(calls.pop(),['redo']);
  fire(document,'s',{ctrlKey:true}); assert.deepEqual(calls.pop(),['jpg']);
  fire(document,'S',{metaKey:true,shiftKey:true}); assert.deepEqual(calls.pop(),['zip']);
  fire(document,'r'); assert.deepEqual(calls.pop(),['refresh']);
  fire(document,'u'); assert.deepEqual(calls.splice(-2),[['toggle','open'],['scroll','utm-link']]);
  fire(document,'u'); assert.deepEqual(calls.splice(-1),[['toggle','closed']]);
  fire(document,'c'); assert.deepEqual(calls.splice(-2),[['toggle','open'],['scroll','cta-assets']]);
  fire(document,'c'); assert.deepEqual(calls.splice(-1),[['scroll','cta-assets']]);
  fire(document,'C',{shiftKey:true}); assert.deepEqual(calls.pop(),['cta-changed',true]);
  fire(document,'C',{shiftKey:true}); assert.deepEqual(calls.pop(),['cta-changed',false]);
  fire(document,'ArrowLeft'); assert.deepEqual(calls.pop(),['move-left']);
  fire(document,'ArrowRight'); assert.deepEqual(calls.pop(),['move-right']);
  fire(document,'?',{shiftKey:true}); assert.equal(modal.classList.active,true); assert.deepEqual(calls.pop(),['focus-close']);
  assert.equal(fire(document,'Tab'),false); assert.deepEqual(calls,[]);
  assert.equal(fire(document,'Escape',{target:{closest:()=>true}}),true); assert.equal(modal.classList.active,false);
});

test('card navigation does not force Single view before any offers are loaded', () => {
  const {calls,context,document}=setup();
  context.offers=[{},{},{},{}];
  fire(document,'2');
  assert.deepEqual(calls,[['sv',1]]);
  fire(document,'Tab');
  assert.deepEqual(calls,[['sv',1],['sv',2]]);
});

test('typing targets and unrelated browser or editing commands retain native behavior', () => {
  const {calls,document}=setup();
  const typingTarget={closest:selector=>selector === 'input,textarea,select,button,[contenteditable]'};
  assert.equal(fire(document,'s',{target:typingTarget}),false);
  assert.equal(fire(document,'Tab',{target:typingTarget}),false);
  assert.equal(fire(document,'ArrowLeft',{target:typingTarget}),false);
  assert.equal(fire(document,'ArrowRight',{target:typingTarget}),false);
  assert.equal(fire(document,'C',{shiftKey:true,target:typingTarget}),false);
  assert.equal(fire(document,'z',{ctrlKey:true,target:typingTarget}),true);
  assert.equal(fire(document,'z',{ctrlKey:true,shiftKey:true,target:typingTarget}),true);
  assert.equal(fire(document,'c',{metaKey:true}),false);
  assert.equal(fire(document,'v',{ctrlKey:true}),false);
  assert.equal(fire(document,'r',{ctrlKey:true}),false);
  assert.deepEqual(calls,[['undo'],['redo']]);
});
