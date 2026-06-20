import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shortcuts = html.match(/\/\/ Lightweight global shortcuts:[\s\S]*?document\.addEventListener\('change',releaseSelectShortcutFocus\);/)?.[0];

test('visible app version is v3.4.2.1', () => {
  assert.match(html, /const APP_VERSION = \"v3\.4\.2\.1\";/);
});

function setup(){
  const calls=[];
  const modal={classList:{active:false,add(){this.active=true;},remove(){this.active=false;},contains(){return this.active;}}};
  const summaryModal={classList:{active:false,add(){this.active=true;},remove(){this.active=false;},contains(){return this.active;}}};
  const close={focus(){ document.activeElement=close; calls.push(['focus-close']); }};
  const ctaEnabled={checked:false};
  function makeSection(key, collapsed=true){
    const hdr={
      collapsed,
      classList:{contains(name){ return name === 'collapsed' && hdr.collapsed; }}
    };
    return {
      key,
      hdr,
      scrollIntoView(){ calls.push(['scroll',key]); },
      contains(target){ return target && target.sectionKey === key; },
      querySelector(selector){ return selector === '.section-hdr' ? hdr : null; }
    };
  }
  const sectionNodes={};
  for(const key of ['hero-image','offer-details','paste-raw-offer','cta-assets','utm-link','campaign-library','ai-copy','export-cards']) sectionNodes[key]=makeSection(key);
  const focusNodes={
    '#f-name':{focus(){ calls.push(['focus','f-name']); }},
    '#raw-paste':{focus(){ calls.push(['focus','raw-paste']); }},
    '#cta-enabled,#cta-text,#cta-phone':{focus(){ calls.push(['focus','cta-enabled']); }},
    '#ai-prompt-type,button[onclick="generateAiCopyPrompt()"]':{focus(){ calls.push(['focus','ai-prompt-type']); }}
  };
  const previousFocus={focus(){ document.activeElement=previousFocus; calls.push(['focus-previous']); }};
  const document={
    activeElement:previousFocus,
    getElementById(id){ return id === 'shortcuts-modal' ? modal : id === 'summary-modal' ? summaryModal : id === 'shortcuts-close' ? close : id === 'cta-enabled' ? ctaEnabled : null; },
    querySelector(selector){ const match=String(selector).match(/data-section-key="([^"]+)"/); if(match) return sectionNodes[match[1]]; if(selector === '#campaign-library-panel') return sectionNodes['campaign-library']; return focusNodes[selector] || null; },
    addEventListener(type,handler){ if(type === 'keydown') this.handler=handler; if(type === 'change') this.changeHandler=handler; }
  };
  const context={document,cur:0,offers:[{name:'One'},{name:'Two'},{name:'Three'},{name:'Four'}],isOfferLoaded:offer=>!!offer.name,sv:i=>{ context.cur=i; calls.push(['sv',i]); },setView:v=>calls.push(['view',v]),toggleSec:hdr=>{ hdr.collapsed=!hdr.collapsed; calls.push(['toggle',hdr.collapsed ? 'closed' : 'open']); },exportCurrentJPG:()=>calls.push(['jpg']),exportAllJPG:()=>calls.push(['zip']),refreshOffers:()=>calls.push(['refresh']),toggleLock:()=>calls.push(['lock']),moveOfferLeft:()=>calls.push(['move-left']),moveOfferRight:()=>calls.push(['move-right']),ctaSettingsChanged:()=>calls.push(['cta-changed',context.document.getElementById('cta-enabled').checked]),undoCampaignChange:()=>calls.push(['undo']),redoCampaignChange:()=>calls.push(['redo']),openSummary:()=>{ summaryModal.classList.add('active'); calls.push(['summary-open']); },closeModal:id=>{ if(id === 'summary-modal') summaryModal.classList.remove('active'); calls.push(['close-modal',id]); }};
  vm.runInNewContext(shortcuts,context);
  return {calls,context,document,modal,summaryModal,sectionNodes,previousFocus,close};
}
function fire(document,key,overrides={}){
  let prevented=false;
  document.handler({key,defaultPrevented:false,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,target:{closest:()=>null},preventDefault(){prevented=true;},...overrides});
  return prevented;
}
function formTarget(sectionKey){
  return {
    sectionKey,
    value:'',
    closest:selector=>selector === 'input,textarea,select,[contenteditable]'
  };
}
function typeKey(document,target,key){
  const prevented=fire(document,key,{target});
  if(!prevented && key.length === 1) target.value += key;
  return prevented;
}

test('the global keyboard shortcut listener is attached exactly once', () => {
  assert.equal((html.match(/document\.addEventListener\('keydown',handleKeyboardShortcut\);/g) || []).length, 1);
  assert.equal((html.match(/document\.addEventListener\('change',releaseSelectShortcutFocus\);/g) || []).length, 1);
});

test('shortcuts modal and small toolbar trigger list the supported keyboard shortcuts', () => {
  assert.match(html, /<button class="shortcuts-trigger"[^>]*onclick="openShortcutsModal\(\)"[^>]*>Shortcuts<\/button>/);
  assert.match(html, /id="shortcuts-modal"[\s\S]*?Keyboard Shortcuts[\s\S]*?<kbd>Cmd<\/kbd>\/<kbd>Ctrl<\/kbd> \+ <kbd>Z<\/kbd>[\s\S]*?<kbd>1<\/kbd>[\s\S]*?<kbd>Tab<\/kbd>[\s\S]*?<kbd>Cmd<\/kbd>\/<kbd>Ctrl<\/kbd> \+ <kbd>S<\/kbd>[\s\S]*?<kbd>R<\/kbd>[\s\S]*?<kbd>H<\/kbd>[\s\S]*?<kbd>O<\/kbd>[\s\S]*?<kbd>P<\/kbd>[\s\S]*?<kbd>C<\/kbd>[\s\S]*?<kbd>U<\/kbd>[\s\S]*?<kbd>L<\/kbd>[\s\S]*?<kbd>I<\/kbd>[\s\S]*?<kbd>X<\/kbd>[\s\S]*?<kbd>Shift<\/kbd> \+ <kbd>C<\/kbd>[\s\S]*?<kbd>←<\/kbd> \/ <kbd>→<\/kbd>[\s\S]*?<dt>Campaign Summary<\/dt><dd><kbd>M<\/kbd><\/dd>[\s\S]*?<kbd>\?<\/kbd>[\s\S]*?<kbd>Esc<\/kbd>/);
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
  assert.equal(fire(document,'k'), true); assert.deepEqual(calls.pop(), ['lock']);
  fire(document,'u'); assert.deepEqual(calls.splice(-2),[['toggle','open'],['scroll','utm-link']]);
  fire(document,'u'); assert.deepEqual(calls.splice(-1),[['toggle','closed']]);
  fire(document,'c'); assert.deepEqual(calls.splice(-3),[['toggle','open'],['scroll','cta-assets'],['focus','cta-enabled']]);
  fire(document,'c'); assert.deepEqual(calls.splice(-1),[['toggle','closed']]);
  fire(document,'C',{shiftKey:true}); assert.deepEqual(calls.pop(),['cta-changed',true]);
  fire(document,'C',{shiftKey:true}); assert.deepEqual(calls.pop(),['cta-changed',false]);
  fire(document,'ArrowLeft'); assert.deepEqual(calls.pop(),['move-left']);
  fire(document,'ArrowRight'); assert.deepEqual(calls.pop(),['move-right']);
  fire(document,'/',{shiftKey:true}); assert.equal(modal.classList.active,true); assert.deepEqual(calls.pop(),['focus-close']);
  assert.equal(fire(document,'Tab'),false); assert.deepEqual(calls,[]);
  assert.equal(fire(document,'Escape',{target:{closest:()=>true}}),true); assert.equal(modal.classList.active,false);
});


test('Campaign Summary shortcut toggles with M and closes with Escape', () => {
  const {calls,document,summaryModal}=setup();
  assert.equal(fire(document,'m'),true);
  assert.equal(summaryModal.classList.active,true);
  assert.deepEqual(calls.pop(),['summary-open']);

  assert.equal(fire(document,'M'),true);
  assert.equal(summaryModal.classList.active,false);
  assert.deepEqual(calls.pop(),['close-modal','summary-modal']);

  assert.equal(fire(document,'m'),true);
  assert.equal(summaryModal.classList.active,true);
  assert.deepEqual(calls.pop(),['summary-open']);
  assert.equal(fire(document,'Escape'),true);
  assert.equal(summaryModal.classList.active,false);
  assert.deepEqual(calls.pop(),['close-modal','summary-modal']);
});

test('Campaign Summary shortcut is ignored while typing in form fields', () => {
  for(const tag of ['input','textarea','select','[contenteditable]']){
    const {calls,document,summaryModal}=setup();
    const target={value:'',closest:selector=>selector.split(',').includes(tag)};
    assert.equal(typeKey(document,target,'m'),false);
    assert.equal(target.value,'m');
    assert.equal(summaryModal.classList.active,false);
    assert.deepEqual(calls,[]);

    summaryModal.classList.add('active');
    assert.equal(typeKey(document,target,'m'),false);
    assert.equal(summaryModal.classList.active,true);
    assert.deepEqual(calls,[]);
  }
});

test('section shortcuts toggle each sidebar section, scroll opened sections, and focus useful controls', () => {
  const {calls,document}=setup();
  const cases=[
    ['h','hero-image',null],
    ['o','offer-details','f-name'],
    ['p','paste-raw-offer','raw-paste'],
    ['c','cta-assets','cta-enabled'],
    ['u','utm-link',null],
    ['l','campaign-library',null],
    ['i','ai-copy','ai-prompt-type'],
    ['x','export-cards',null]
  ];
  for(const [key,section,focus] of cases){
    calls.length=0;
    assert.equal(fire(document,key),true);
    const expected=[['toggle','open'],['scroll',section]];
    if(focus) expected.push(['focus',focus]);
    assert.deepEqual(calls,expected);
    calls.length=0;
    assert.equal(fire(document,key.toUpperCase()),true);
    assert.deepEqual(calls,[['toggle','closed']]);
  }
});

test('focused section shortcuts collapse their own open section without typing into fields', () => {
  const {calls,document}=setup();
  assert.equal(fire(document,'o'),true);
  assert.deepEqual(calls.splice(-3),[['toggle','open'],['scroll','offer-details'],['focus','f-name']]);
  const offerInput=formTarget('offer-details');
  assert.equal(typeKey(document,offerInput,'o'),true);
  assert.deepEqual(calls.splice(-1),[['toggle','closed']]);
  assert.equal(offerInput.value,'');

  assert.equal(fire(document,'p'),true);
  assert.deepEqual(calls.splice(-3),[['toggle','open'],['scroll','paste-raw-offer'],['focus','raw-paste']]);
  const pasteTextarea=formTarget('paste-raw-offer');
  assert.equal(typeKey(document,pasteTextarea,'p'),true);
  assert.deepEqual(calls.splice(-1),[['toggle','closed']]);
  assert.equal(pasteTextarea.value,'');
});

test('normal typing and unrelated section shortcuts remain blocked inside form fields', () => {
  const {calls,document}=setup();
  fire(document,'o');
  calls.length=0;
  const offerInput=formTarget('offer-details');
  for(const key of 'Caribbean') assert.equal(typeKey(document,offerInput,key),false);
  assert.equal(offerInput.value,'Caribbean');
  assert.deepEqual(calls,[]);
  assert.equal(typeKey(document,offerInput,'h'),false);
  assert.equal(typeKey(document,offerInput,'u'),false);
  assert.equal(offerInput.value,'Caribbeanhu');
  assert.deepEqual(calls,[]);

  fire(document,'p');
  calls.length=0;
  const pasteTextarea=formTarget('paste-raw-offer');
  for(const key of 'Offer text') assert.equal(typeKey(document,pasteTextarea,key),false);
  assert.equal(pasteTextarea.value,'Offer text');
  assert.equal(typeKey(document,pasteTextarea,'u'),false);
  assert.equal(pasteTextarea.value,'Offer textu');
  assert.deepEqual(calls,[]);
});

test('all section shortcuts collapse their own open section when focus is inside that section', () => {
  const cases=[['h','hero-image'],['c','cta-assets'],['u','utm-link'],['l','campaign-library'],['i','ai-copy'],['x','export-cards']];
  for(const [key,section] of cases){
    const {calls,document}=setup();
    assert.equal(fire(document,key),true);
    calls.length=0;
    const target=formTarget(section);
    assert.equal(typeKey(document,target,key),true);
    assert.deepEqual(calls,[['toggle','closed']]);
    assert.equal(target.value,'');
  }
});

test('section shortcuts do not trigger while typing in form and contenteditable fields', () => {
  for(const target of [
    {closest:selector=>selector === 'input,textarea,select,[contenteditable]'},
    {closest:selector=>selector === 'input,textarea,select,[contenteditable]'},
    {closest:selector=>selector === 'input,textarea,select,[contenteditable]'},
    {closest:selector=>selector === 'input,textarea,select,[contenteditable]'}
  ]){
    const {calls,document}=setup();
    for(const key of ['h','o','p','c','u','l','i','x','k']) assert.equal(fire(document,key,{target}),false);
    assert.deepEqual(calls,[]);
  }
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
  const typingTarget={closest:selector=>selector === 'input,textarea,select,[contenteditable]'};
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


test('shortcuts do not trigger while typing in inputs or textareas', () => {
  for(const tag of ['input','textarea']){
    const {calls,document,modal}=setup();
    const target={value:'',closest:selector=>selector.split(',').includes(tag)};
    assert.equal(fire(document,'s',{target}),false);
    assert.equal(fire(document,'r',{target}),false);
    assert.equal(fire(document,'k',{target}),false);
    assert.equal(typeKey(document,target,'?'),false);
    assert.equal(target.value,'?');
    assert.equal(modal.classList.active,false);
    assert.deepEqual(calls,[]);
  }
});

test('shortcuts work after clicking sidebar buttons and changing offers', () => {
  const {calls,document}=setup();
  const buttonTarget={closest:()=>null};
  assert.equal(fire(document,'j',{target:buttonTarget}),false);
  assert.equal(fire(document,'Tab',{target:buttonTarget}),true);
  assert.deepEqual(calls.splice(-2),[['sv',1],['view','single']]);
  assert.equal(fire(document,'2',{target:buttonTarget}),true);
  assert.deepEqual(calls.splice(-2),[['sv',1],['view','single']]);
});

test('shortcuts help toggles with question mark, closes with Escape, and restores focus', () => {
  const {calls,document,modal,previousFocus}=setup();
  fire(document,'/',{shiftKey:true});
  assert.equal(modal.classList.active,true);
  assert.deepEqual(calls.pop(),['focus-close']);
  assert.equal(document.activeElement === previousFocus,false);
  assert.equal(fire(document,'?',{shiftKey:true,target:{closest:()=>true}}),true);
  assert.equal(modal.classList.active,false);
  assert.equal(calls.pop()[0],'focus-previous');

  fire(document,'/',{shiftKey:true});
  assert.equal(modal.classList.active,true);
  assert.equal(fire(document,'Escape'),true);
  assert.equal(modal.classList.active,false);
  assert.equal(calls.pop()[0],'focus-previous');
  assert.equal(fire(document,'r'),true);
  assert.deepEqual(calls.pop(),['refresh']);
});

test('Shortcuts button path reuses the existing modal and close controls', () => {
  const {calls,context,modal}=setup();
  context.openShortcutsModal();
  assert.equal(modal.classList.active,true);
  assert.deepEqual(calls.pop(),['focus-close']);
  context.closeShortcutsModal();
  assert.equal(modal.classList.active,false);
  assert.equal(calls.pop()[0],'focus-previous');
});

test('select changes release focus so global shortcuts can resume after dropdown interactions', () => {
  const {calls,document}=setup();
  let blurred=false;
  const selectTarget={matches:selector=>selector === 'select',blur(){ blurred=true; },closest:selector=>selector === 'input,textarea,select,[contenteditable]'};
  assert.equal(fire(document,'Tab',{target:selectTarget}),false);
  document.changeHandler({target:selectTarget});
  assert.equal(blurred,true);
  assert.equal(fire(document,'Tab',{target:{closest:()=>null}}),true);
  assert.deepEqual(calls.splice(-2),[['sv',1],['view','single']]);
});
