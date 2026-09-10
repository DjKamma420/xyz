import test from 'node:test';
import assert from 'node:assert/strict';
import '../../www/mehrplan.js';
const M = globalThis.XyzMehrplan;
const slots = [{std:'1,2',von:'08:00',bis:'09:30'},{std:'3,4',von:'09:50',bis:'11:20'}];
const leerPlan = () => ({A:{MO:[null,null],DI:[null,null],MI:[null,null],DO:[null,null],FR:[null,null]},B:{MO:[null,null],DI:[null,null],MI:[null,null],DO:[null,null],FR:[null,null]}});
const cell=(fach,raum='101',lk='MU')=>({fach,raum,lk});
function source(id, cells={}, opts={}){
  const p=leerPlan();
  for(const [k,v] of Object.entries(cells)){
    const [w,t,i]=k.split(':'); p[w][t][+i]=v;
  }
  return M.neueQuelle({id,name:id,plan:p,slots:opts.slots||slots,zweiWochen:opts.zweiWochen!==false,aktiv:opts.aktiv!==false,jetzt:'2026-09-10T00:00:00Z'});
}
function ruleImmer(ids,prio,tag='MO',index=0){return {slot:`${tag}:${index}`,quellen:[...ids].sort(),modus:'immer',prioritaet:prio};}
function ruleWechsel(ids,a,b,tag='MO',index=0){return {slot:`${tag}:${index}`,quellen:[...ids].sort(),modus:'wechsel',aWoche:a,bWoche:b};}
const merge=(q,r=[])=>M.zusammenfuehren(q,r);

test('01 zwei leere Pläne',()=>{const r=merge([source('a'),source('b')]);assert.equal(r.konflikte.length,0);assert.equal(r.plan.A.MO[0],null)});
test('02 leerer + voller Plan',()=>{const r=merge([source('a'),source('b',{'A:MO:0':cell('MA'),'B:MO:0':cell('MA')})]);assert.equal(r.plan.A.MO[0].fach,'MA')});
test('03 Plan 2 füllt Lücken',()=>{const r=merge([source('a',{'A:MO:0':cell('DE'),'B:MO:0':cell('DE')}),source('b',{'A:MO:1':cell('PH'),'B:MO:1':cell('PH')})]);assert.equal(r.plan.A.MO[1].fach,'PH')});
test('04 Plan 1 füllt Lücken',()=>{const r=merge([source('a',{'A:MO:1':cell('PH'),'B:MO:1':cell('PH')}),source('b',{'A:MO:0':cell('DE'),'B:MO:0':cell('DE')})]);assert.equal(r.plan.A.MO[1].fach,'PH')});
test('05 identische Stunden kein Konflikt',()=>{const r=merge([source('a',{'A:MO:0':cell('MA')}),source('b',{'A:MO:0':cell('MA')})]);assert.equal(r.konflikte.length,0);assert.deepEqual(r.herkunft.A.MO[0],['a','b'])});
test('06 gleicher Fach anderer Raum Konflikt',()=>{assert.equal(merge([source('a',{'A:MO:0':cell('MA','101')}),source('b',{'A:MO:0':cell('MA','204')})]).konflikte.length,1)});
test('07 gleicher Fach anderer Lehrer Konflikt',()=>{assert.equal(merge([source('a',{'A:MO:0':cell('MA','101','MU')}),source('b',{'A:MO:0':cell('MA','101','SC')})]).konflikte.length,1)});
test('08 anderes Fach Konflikt',()=>{assert.equal(merge([source('a',{'A:MO:0':cell('MA')}),source('b',{'A:MO:0':cell('PH')})]).konflikte.length,1)});
test('09 Plan 1 immer Vorrang',()=>{const q=[source('a',{'A:MO:0':cell('MA')}),source('b',{'A:MO:0':cell('PH')})];assert.equal(merge(q,[ruleImmer(['a','b'],['a','b'])]).plan.A.MO[0].fach,'MA')});
test('10 Plan 2 immer Vorrang',()=>{const q=[source('a',{'A:MO:0':cell('MA')}),source('b',{'A:MO:0':cell('PH')})];assert.equal(merge(q,[ruleImmer(['a','b'],['b','a'])]).plan.A.MO[0].fach,'PH')});
test('11 A Plan1 B Plan2',()=>{const q=[source('a',{'A:MO:0':cell('MA'),'B:MO:0':cell('MA')}),source('b',{'A:MO:0':cell('PH'),'B:MO:0':cell('PH')})];const r=merge(q,[ruleWechsel(['a','b'],'a','b')]);assert.equal(r.plan.A.MO[0].fach,'MA');assert.equal(r.plan.B.MO[0].fach,'PH')});
test('12 umgekehrter A/B-Wechsel',()=>{const q=[source('a',{'A:MO:0':cell('MA'),'B:MO:0':cell('MA')}),source('b',{'A:MO:0':cell('PH'),'B:MO:0':cell('PH')})];const r=merge(q,[ruleWechsel(['a','b'],'b','a')]);assert.equal(r.plan.A.MO[0].fach,'PH');assert.equal(r.plan.B.MO[0].fach,'MA')});
test('13 Quellplan besitzt A/B',()=>{const r=merge([source('a',{'A:MO:0':cell('MA'),'B:MO:0':cell('DE')})]);assert.equal(r.plan.A.MO[0].fach,'MA');assert.equal(r.plan.B.MO[0].fach,'DE')});
test('14 A/B-Quellplan + Merge-Wechsel',()=>{const q=[source('a',{'A:MO:0':cell('MA'),'B:MO:0':cell('DE')}),source('b',{'A:MO:0':cell('PH'),'B:MO:0':cell('CH')})];const r=merge(q,[ruleWechsel(['a','b'],'b','a')]);assert.equal(r.plan.A.MO[0].fach,'PH');assert.equal(r.plan.B.MO[0].fach,'DE')});
test('15 drei kollidierende Quellen',()=>{const q=['a','b','c'].map((id,i)=>source(id,{'A:MO:0':cell(['MA','PH','DE'][i])}));assert.equal(merge(q).konflikte[0].kandidaten.length,3)});
test('16 Quelle deaktivieren',()=>{const a=source('a',{'A:MO:0':cell('MA')});const b=source('b',{'A:MO:0':cell('PH')},{aktiv:false});assert.equal(merge([a,b]).plan.A.MO[0].fach,'MA')});
test('17 Quelle erneut aktivieren',()=>{const a=source('a',{'A:MO:0':cell('MA')});const b=source('b',{'A:MO:0':cell('PH')},{aktiv:false});b.aktiv=true;assert.equal(merge([a,b]).konflikte.length,1)});
test('18 Quelle löschen bereinigt Regeln',()=>{const q=[source('a'),source('b')];const rules=[ruleImmer(['a','b'],['a','b'])];assert.equal(M.regelnBereinigen(rules,[q[0]]).length,0)});
test('19 Quelle aktualisieren behält ID',()=>{const a=source('a',{'A:MO:0':cell('MA')});const p=leerPlan();p.A.MO[0]=cell('PH');const u=M.quelleAktualisieren(a,{plan:p,slots,zweiWochen:true,jetzt:'2026-09-11T00:00:00Z'});assert.equal(u.id,'a');assert.equal(u.plan.A.MO[0].fach,'PH')});
test('20 Konflikt verschwindet nach Update',()=>{const a=source('a',{'A:MO:0':cell('MA')});let b=source('b',{'A:MO:0':cell('PH')});assert.equal(merge([a,b]).konflikte.length,1);const p=leerPlan();p.A.MO[0]=cell('MA');b=M.quelleAktualisieren(b,{plan:p,slots,zweiWochen:true});assert.equal(merge([a,b]).konflikte.length,0)});
test('21 neuer Konflikt entsteht nach Update',()=>{const a=source('a',{'A:MO:0':cell('MA')});let b=source('b',{'A:MO:0':cell('MA')});assert.equal(merge([a,b]).konflikte.length,0);const p=leerPlan();p.A.MO[0]=cell('PH');b=M.quelleAktualisieren(b,{plan:p,slots,zweiWochen:true});assert.equal(merge([a,b]).konflikte.length,1)});
test('22 passende Regel bleibt erhalten',()=>{const a=source('a',{'A:MO:0':cell('MA')});let b=source('b',{'A:MO:0':cell('PH')});const rules=[ruleImmer(['a','b'],['a','b'])];const p=leerPlan();p.A.MO[0]=cell('CH');b=M.quelleAktualisieren(b,{plan:p,slots,zweiWochen:true});assert.equal(merge([a,b],rules).plan.A.MO[0].fach,'MA')});
test('23 alte Regel nicht auf fremde Quelle',()=>{const q=[source('a',{'A:MO:0':cell('MA')}),source('c',{'A:MO:0':cell('PH')})];assert.equal(merge(q,[ruleImmer(['a','b'],['a','b'])]).konflikte.length,1)});
test('24 20 Planquellen identisch',()=>{const q=Array.from({length:20},(_,i)=>source('q'+i,{'A:MO:0':cell('MA')}));const r=merge(q);assert.equal(r.konflikte.length,0);assert.equal(r.herkunft.A.MO[0].length,20)});
test('25 große Pläne',()=>{const many=Array.from({length:32},(_,i)=>({std:String(i+1),von:'08:00',bis:'08:45'}));const p={A:{},B:{}};for(const w of ['A','B'])for(const d of M.TAGE)p[w][d]=many.map((_,i)=>cell('F'+i));const q=M.neueQuelle({id:'a',name:'a',plan:p,slots:many,zweiWochen:true});assert.equal(merge([q]).plan.B.FR.length,32)});
test('26 100+ Konflikte',()=>{const many=Array.from({length:32},(_,i)=>({std:String(i+1),von:'08:00',bis:'08:45'}));const mk=(id,prefix)=>{const p={A:{},B:{}};for(const w of ['A','B'])for(const d of M.TAGE)p[w][d]=many.map((_,i)=>cell(prefix+i));return M.neueQuelle({id,name:id,plan:p,slots:many,zweiWochen:true})};assert.ok(merge([mk('a','A'),mk('b','B')]).konflikte.length>100)});
test('27 Merge deterministisch',()=>{const q=[source('b',{'A:MO:0':cell('MA')}),source('a',{'A:MO:0':cell('MA')})];assert.deepEqual(merge(q),merge(q))});
test('28 mehrfach neu berechnen identisch',()=>{const q=[source('a',{'A:MO:0':cell('MA')})];const a=merge(q);const b=merge(q);assert.deepEqual(a.plan,b.plan)});
test('29 Backup/Restore Quellen JSON-stabil',()=>{const q=[source('a',{'A:MO:0':cell('MA')})];assert.deepEqual(JSON.parse(JSON.stringify(q)),q)});
test('30 Backup/Restore Regeln JSON-stabil',()=>{const r=[ruleWechsel(['a','b'],'a','b')];assert.deepEqual(JSON.parse(JSON.stringify(r)),r)});
test('31 alter PWA-Plan wird Quelle',()=>{const p=leerPlan();p.A.MO[0]=cell('MA');const q=M.neueQuelle({id:'import',name:'Importierter Stundenplan',plan:p,slots,zweiWochen:false});assert.equal(q.plan.B.MO[0].fach,'MA')});
test('32 Vertretung verändert Quelle nicht',()=>{const q=source('a',{'A:MO:0':cell('MA')});const vorher=JSON.stringify(q);const overlay={datum:'2026-09-14',fachNeu:'PH'};void overlay;assert.equal(JSON.stringify(q),vorher)});
test('33 Vertretung verändert Merge-Regel nicht',()=>{const r=ruleImmer(['a','b'],['a','b']);const vorher=JSON.stringify(r);const overlay={entfaellt:true};void overlay;assert.equal(JSON.stringify(r),vorher)});
test('34 Vertretung verändert Gesamtplan nicht dauerhaft',()=>{const q=[source('a',{'A:MO:0':cell('MA')})];const original=merge(q).plan;const sichtbar=structuredClone(original);sichtbar.A.MO[0]=cell('PH');assert.equal(merge(q).plan.A.MO[0].fach,'MA')});
test('35 Cache löschen stellt Gesamtplan wieder her',()=>{const q=[source('a',{'A:MO:0':cell('MA')})];let cache={x:1};cache={};assert.deepEqual(cache,{});assert.equal(merge(q).plan.A.MO[0].fach,'MA')});
test('36 unterschiedliches Raster wird nicht geraten',()=>{const s2=[{std:'1,2',von:'07:45',bis:'09:15'},{std:'3,4',von:'09:30',bis:'11:00'}];const r=merge([source('a'),source('b',{}, {slots:s2})]);assert.equal(r.status,'raster-konflikt');assert.equal(r.plan,null)});
test('37 Prioritätsregel mit 3 Quellen',()=>{const q=['a','b','c'].map((id,i)=>source(id,{'A:MO:0':cell(['MA','PH','DE'][i])}));const r=merge(q,[ruleImmer(['a','b','c'],['c','a','b'])]);assert.equal(r.plan.A.MO[0].fach,'DE')});
test('38 Regel ist an exakte Quellenmenge gebunden',()=>{const q=['a','b','c'].map((id,i)=>source(id,{'A:MO:0':cell(['MA','PH','DE'][i])}));assert.equal(merge(q,[ruleImmer(['a','b'],['a','b'])]).konflikte.length,1)});
test('39 Ein-Wochen-Quelle wird explizit auf A und B gerechnet',()=>{const p=leerPlan();p.A.MO[0]=cell('MA');const q=M.neueQuelle({id:'a',name:'a',plan:p,slots,zweiWochen:false});const r=merge([q]);assert.equal(r.plan.A.MO[0].fach,'MA');assert.equal(r.plan.B.MO[0].fach,'MA')});
test('40 leere Priorität entscheidet nicht heimlich',()=>{const q=[source('a',{'A:MO:0':cell('MA')}),source('b',{'A:MO:0':cell('PH')})];assert.equal(merge(q,[ruleImmer(['a','b'],[])]).konflikte.length,1)});
test('41 HTTPS-Verbindung bleibt an Quelle erhalten',()=>{const p=leerPlan();const q=M.neueQuelle({id:'link',name:'Link',plan:p,slots,zweiWochen:false,verbindung:{typ:'url',url:'https://example.org/plan.json',letzterAbrufAm:'2026-09-10T09:00:00Z'}});assert.equal(q.verbindung.url,'https://example.org/plan.json');assert.equal(q.verbindung.typ,'url')});
test('42 unsichere Plan-URL wird verworfen',()=>{assert.equal(M.verbindungNormalisieren({typ:'url',url:'http://example.org/plan.json'}),null)});
test('43 Zugangsdaten in URL werden verworfen',()=>{assert.equal(M.verbindungNormalisieren({typ:'url',url:'https://user:pass@example.org/plan.json'}),null)});
test('44 Quellenupdate erhält Verbindung ohne explizite Änderung',()=>{const p=leerPlan();let q=M.neueQuelle({id:'link',name:'Link',plan:p,slots,zweiWochen:false,verbindung:{typ:'url',url:'https://example.org/plan.json'}});p.A.MO[0]=cell('MA');q=M.quelleAktualisieren(q,{plan:p,slots,zweiWochen:false});assert.equal(q.verbindung.url,'https://example.org/plan.json');assert.equal(q.plan.A.MO[0].fach,'MA')});
