import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../../www/vplan.js';
const source=readFileSync(new URL('../../www/portal.js',import.meta.url),'utf8');

function harness(client){
  const data=new Map([['profilAktiv','1']]);
  const elements=Object.fromEntries(['portalVerbinden','portalSync','portalTrennen','portalStatus','portalUser','portalPass','portalMerken','plan'].map(id=>[id,{style:{},value:'test',checked:false}]));
  let box=null;
  const section={querySelector:()=>null,prepend:b=>{box=b;}};
  const context={
    XyzVPlan:{...globalThis.XyzVPlan,PortalClient:class{
      constructor(options){this.options=options;}
      gespeichert(){return Promise.resolve(false);}
      anmelden(args){return client.anmelden(args,this.options);}
      tagAbrufen(d){return client.tagAbrufen(d,this.options);}
      abmelden(){return client.abmelden(this.options);}
    }},
    Capacitor:{isNativePlatform:()=>true,Plugins:{VPlanBridge:{request(){}}}},
    localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    document:{readyState:'complete',getElementById:id=>id==='portalBox'?box:elements[id],querySelector:s=>s.includes('einstTeil')?section:null,createElement:()=>({style:{}}),addEventListener(){}},
    setTimeout(){},queueMicrotask
  };
  vm.runInNewContext(source,context);
  return {context,elements,data};
}

test('Profilwechsel während Login schreibt keinen Cache in neues Profil',async()=>{
  let resolveLogin;
  const h=harness({anmelden:()=>new Promise(resolve=>{resolveLogin=resolve;})});
  await Promise.resolve();
  const pending=h.elements.portalVerbinden.onclick();
  h.data.set('profilAktiv','2');
  resolveLogin({rows:[{slot:'1',fach:'Privat'}]});
  await pending;
  assert.equal(h.data.has('p2_vplanPortalCache'),false);
  assert.equal(h.data.has('p1_vplanPortalCache'),false);
  assert.equal(h.elements.portalVerbinden.disabled,false);
});
test('Profilwechsel während Tagesabruf verwirft die verspätete Antwort',async()=>{
  let resolveDay;
  const h=harness({tagAbrufen:()=>new Promise(resolve=>{resolveDay=resolve;})});
  await Promise.resolve();
  const pending=h.elements.portalSync.onclick();
  h.data.set('profilAktiv','2');resolveDay([{slot:'1',fach:'Privat'}]);await pending;
  assert.equal(h.data.has('p2_vplanPortalCache'),false);
  assert.equal(h.elements.portalSync.disabled,false);
});
test('Profilwechsel während Abmelden löscht keinen fremden Cache',async()=>{
  let resolveLogout;
  const h=harness({abmelden:()=>new Promise(resolve=>{resolveLogout=resolve;})});
  await Promise.resolve();
  h.data.set('p2_vplanPortalCache','keep');
  const pending=h.elements.portalTrennen.onclick();h.data.set('profilAktiv','2');resolveLogout();await pending;
  assert.equal(h.data.get('p2_vplanPortalCache'),'keep');
});
test('Portal-Tagescache wird auch ohne lokale Planquelle erkannt',async()=>{
  const h=harness({});await Promise.resolve();
  h.data.set('p1_vplanPortalCache',JSON.stringify({fassung:1,tage:{'2026-09-14':{rows:[]}}}));
  assert.equal(h.context.XyzPortal.hatTag('2026-09-14'),true);
  assert.equal(h.context.XyzPortal.hatTag('2026-09-15'),false);
});
