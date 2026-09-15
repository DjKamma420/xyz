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

test('05 diagnostic codes and safe parser stages remain visible in the UI',async()=>{
  const cases=[
    [{code:'LOGIN_FEHLER'},'LOGIN_FEHLER'],
    [{code:'PARSER_FEHLER',stage:'form-discovery'},'PARSER_FEHLER (Formularsuche)'],
    [{code:'PARSER_FEHLER',stage:'form-validation'},'PARSER_FEHLER (Formularprüfung)'],
    [{code:'PARSER_FEHLER',stage:'table-parser'},'PARSER_FEHLER (Tabellenparser)'],
    [{code:'HTTP_FEHLER',status:503},'HTTP_FEHLER (HTTP 503)'],
    [{code:'TIMEOUT'},'TIMEOUT']
  ];
  for(const [error,expected] of cases){
    const h=harness({anmelden:async()=>{throw {...error,message:'<html>private response</html>'};}});
    await Promise.resolve();await h.elements.portalVerbinden.onclick();
    assert.ok(h.elements.portalStatus.textContent.startsWith(expected));
    assert.ok(!h.elements.portalStatus.textContent.includes('private response'));
  }
});
test('06 untrusted error details are never copied into the UI',async()=>{
  for(const error of [{code:'PARSER_FEHLER',stage:'<html>private response</html>'},{code:'UNKNOWN'},{code:'HTTP_FEHLER',status:'<html>private response</html>'}]){
    const h=harness({anmelden:async()=>{throw {...error,message:'<html>private response</html>'};}});
    await Promise.resolve();await h.elements.portalVerbinden.onclick();
    assert.ok(!h.elements.portalStatus.textContent.includes('private response'));
  }
});

test('07 login diagnostics show the failing request, status and safe destination',async()=>{
  for(const [requestStage,label] of [['login-submit','Anmeldung senden'],['day-fetch','Tagesplan abrufen']]){
    const h=harness({anmelden:async()=>{throw {code:'LOGIN_FEHLER',requestStage,status:200,responsePage:'login',loginReason:'login-form'};}});
    await Promise.resolve();await h.elements.portalVerbinden.onclick();
    const message=h.elements.portalStatus.textContent;
    assert.match(message,/LOGIN_FEHLER/);assert.ok(message.includes(label));
    assert.match(message,/HTTP 200/);assert.match(message,/Ziel: Loginseite/);assert.match(message,/Loginformular/);
  }
  const h=harness({anmelden:async()=>{throw {code:'LOGIN_FEHLER',requestStage:'<html>private</html>',status:'private',responsePage:'private',message:'private'};}});
  await Promise.resolve();await h.elements.portalVerbinden.onclick();
  assert.ok(!h.elements.portalStatus.textContent.includes('private'));
});
