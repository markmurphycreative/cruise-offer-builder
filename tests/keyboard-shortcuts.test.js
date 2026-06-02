import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shortcuts = html.match(/\/\/ Lightweight global shortcuts:[\s\S]*?document\.addEventListener\('keydown',handleKeyboardShortcut\);/)?.[0];

function setup(){
  const calls=[];
  const modal={classList:{active:false,add(){this.active=true;},remove(){this.active=false;},contains(){return this.active;}}};
  const close={focus(){ calls.push(['focus-close']); }};
  const document={
    activeElement:null,
    getElementById(id){ return id === 'shortcuts-modal' ? modal : id === 'shortcuts-close' ? close : null; },
    addEventListener(type,handler){ this.handler=handler; }
  };
  const context={document,cur:0,sv:i=>{ context.cur=i; calls.push(['sv',i]); },setView:v=>calls.push(['view',v]),exportCurrentJPG:()=>calls.push(['jpg']),exportAllJPG:()=>calls.push(['zip']),refreshOffers:()=>calls.push(['refresh'])};
  vm.runInNewContext(shortcuts,context);
  return {calls,context,document,modal};
}
function fire(document,key,overrides={}){
  let prevented=false;
  document.handler({key,defaultPrevented:false,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,target:{closest:()=>null},preventDefault(){prevented=true;},...overrides});
  return prevented;
}

test('shortcuts modal and small toolbar trigger list the supported keyboard shortcuts', () => {
  assert.match(html, /<button class="shortcuts-trigger"[^>]*onclick="openShortcutsModal\(\)"[^>]*>Shortcuts<\/button>/);
  assert.match(html, /id="shortcuts-modal"[\s\S]*?Keyboard Shortcuts[\s\S]*?<kbd>1<\/kbd>[\s\S]*?<kbd>Tab<\/kbd>[\s\S]*?<kbd>Cmd<\/kbd>\/<kbd>Ctrl<\/kbd> \+ <kbd>S<\/kbd>[\s\S]*?<kbd>R<\/kbd>[\s\S]*?<kbd>\?<\/kbd>[\s\S]*?<kbd>Esc<\/kbd>/);
});

test('card, view, export, refresh, help, and Escape shortcuts reuse existing actions', () => {
  const {calls,context,document,modal}=setup();
  for(const [key,index] of [['1',0],['2',1],['3',2],['4',3]]){ assert.equal(fire(document,key),true); assert.deepEqual(calls.pop(),['sv',index]); }
  context.cur=3; fire(document,'Tab'); assert.deepEqual(calls.pop(),['sv',0]);
  fire(document,'Tab',{shiftKey:true}); assert.deepEqual(calls.pop(),['sv',3]);
  for(const [key,view] of [['s','single'],['E','email'],['a','all']]){ fire(document,key); assert.deepEqual(calls.pop(),['view',view]); }
  fire(document,'s',{ctrlKey:true}); assert.deepEqual(calls.pop(),['jpg']);
  fire(document,'S',{metaKey:true,shiftKey:true}); assert.deepEqual(calls.pop(),['zip']);
  fire(document,'r'); assert.deepEqual(calls.pop(),['refresh']);
  fire(document,'?',{shiftKey:true}); assert.equal(modal.classList.active,true); assert.deepEqual(calls.pop(),['focus-close']);
  assert.equal(fire(document,'Tab'),false); assert.deepEqual(calls,[]);
  assert.equal(fire(document,'Escape',{target:{closest:()=>true}}),true); assert.equal(modal.classList.active,false);
});

test('typing targets and unrelated browser or editing commands retain native behavior', () => {
  const {calls,document}=setup();
  const typingTarget={closest:selector=>selector === 'input,textarea,select,button,[contenteditable]'};
  assert.equal(fire(document,'s',{target:typingTarget}),false);
  assert.equal(fire(document,'Tab',{target:typingTarget}),false);
  assert.equal(fire(document,'z',{ctrlKey:true,target:typingTarget}),false);
  assert.equal(fire(document,'z',{ctrlKey:true,shiftKey:true,target:typingTarget}),false);
  assert.equal(fire(document,'c',{metaKey:true}),false);
  assert.equal(fire(document,'v',{ctrlKey:true}),false);
  assert.equal(fire(document,'r',{ctrlKey:true}),false);
  assert.deepEqual(calls,[]);
});
