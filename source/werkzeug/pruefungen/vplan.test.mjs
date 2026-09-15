import test from "node:test";
import {readFileSync} from "node:fs";
const loginHtml=readFileSync(new URL("./fixtures/portal-login.html",import.meta.url),"utf8");
import assert from "node:assert/strict";
import "../../www/vplan.js";
const V=globalThis.XyzVPlan;
const fixture=name=>readFileSync(new URL(`./fixtures/${name}`,import.meta.url),"utf8");
const slots=[{std:"1,2",von:"08:00",bis:"09:30"},{std:"3/4",von:"09:45",bis:"11:15"},{std:"5",von:"11:30",bis:"12:15"}];
const e=(x={})=>({datum:"2026-09-14",slot:"1",art:"vertretung",fachAlt:"MA",...x});

test("01 exakter Block 1,2",()=>assert.equal(V.mapSlot("1,2",slots),0));
test("02 Slash-Block 3/4",()=>assert.equal(V.mapSlot("3/4",slots),1));
test("03 Einzelstunde in eindeutigem Block",()=>assert.equal(V.mapSlot("2",slots),0));
test("04 unbekannte Stunde",()=>assert.equal(V.mapSlot("9",slots),null));
test("05 fehlende Stunde",()=>assert.equal(V.mapSlot("",slots),null));
test("06 Mehrdeutigkeit wird nicht geraten",()=>assert.equal(V.mapSlot("1,2",[{std:"1,2,3"},{std:"1,2,4"}]),null));
test("07 normaler Unterrichtseintrag",()=>assert.equal(V.normalisieren(e()).fachAlt,"MA"));
test("08 Ausfall",()=>assert.equal(V.normalisieren(e({entfaellt:true})).entfaellt,true));
test("09 Raumänderung",()=>assert.equal(V.normalisieren(e({raumAlt:"101",raumNeu:"204"})).raumNeu,"204"));
test("10 Lehreränderung",()=>assert.equal(V.normalisieren(e({lehrerAlt:"MÜ",lehrerNeu:"SC"})).lehrerNeu,"SC"));
test("11 Fachänderung",()=>assert.equal(V.normalisieren(e({fachNeu:"PH"})).fachNeu,"PH"));
test("12 Kombination bleibt erhalten",()=>{const x=V.normalisieren(e({fachNeu:"PH",raumNeu:"204",lehrerNeu:"SC"}));assert.deepEqual([x.fachNeu,x.raumNeu,x.lehrerNeu],["PH","204","SC"])});
test("13 Zusatzunterricht",()=>assert.equal(V.normalisieren(e({art:"zusatz"})).art,"zusatz"));
test("14 ungültiges Datum verworfen",()=>assert.equal(V.normalisieren(e({datum:"14.09.2026"})),null));
test("15 mehrere Vertretungen am Tag",()=>assert.equal(V.mappeTag([e(),e({slot:"3",fachAlt:"PH"})],slots).overlay.length,2));
test("16 unbekannter Slot wird Tageshinweis",()=>assert.equal(V.mappeTag([e({slot:"99"})],slots).hinweise.length,1));
test("17 identischer Abruf dupliziert nicht",()=>assert.equal(V.cacheAktualisieren([e({remoteId:"a"})],[e({remoteId:"a"})]).length,1));
test("18 geänderte Vertretung ersetzt alten Stand",()=>{const c=V.cacheAktualisieren([e({remoteId:"a",raumNeu:"101"})],[e({remoteId:"a",raumNeu:"204"})]);assert.equal(c.length,1);assert.equal(c[0].raumNeu,"204")});
test("19 mehrere Änderungen gleicher Slot mit IDs",()=>assert.equal(V.cacheAktualisieren([], [e({remoteId:"a"}),e({remoteId:"b",art:"hinweis"})]).length,2));
test("20 Cache nach Datum",()=>assert.equal(V.cacheFuerDatum([e(),e({datum:"2026-09-15"})],"2026-09-14").length,1));
test("21 Cachealter",()=>assert.equal(V.cacheAlterMinuten([e({abgerufenAm:"2026-09-14T07:00:00Z"})],Date.parse("2026-09-14T07:42:00Z")),42));
test("22 Steuerzeichen entfernt",()=>assert.equal(V.text("MA\u0000<script>"),"MA<script>"));
test("23 HTML bleibt Textdaten und wird nicht interpretiert",()=>assert.equal(V.normalisieren(e({hinweis:"<img src=x onerror=alert(1)>"})).hinweis,"<img src=x onerror=alert(1)>"));
test("24 Client verweigert ohne native Brücke",async()=>{await assert.rejects(()=>new V.VPlanClient({bridge:null,adapter:{}}).abrufen(),x=>x.code==="BRIDGE_FEHLT")});
test("25 Client verweigert unbekanntes Portalprotokoll",async()=>{const bridge={request:async()=>({status:200,body:"x"})};await assert.rejects(()=>new V.VPlanClient({bridge}).abrufen(),x=>x.code==="PROTOKOLL_FEHLT")});
test("26 HTTP 401 wird Loginfehler",async()=>{const bridge={request:async()=>({status:401,body:""})},adapter={anfrage:async()=>({url:V.PORTAL_DAY}),parse:async()=>[]};await assert.rejects(()=>new V.VPlanClient({bridge,adapter}).abrufen(),x=>x.code==="LOGIN_FEHLER")});
test("27 HTTP Fehler bleibt HTTP Fehler",async()=>{const bridge={request:async()=>({status:503,body:""})},adapter={anfrage:async()=>({url:V.PORTAL_DAY}),parse:async()=>[]};await assert.rejects(()=>new V.VPlanClient({bridge,adapter}).abrufen(),x=>x.code==="HTTP_FEHLER"&&x.status===503)});
test("28 Parserfehler wird gekapselt",async()=>{const bridge={request:async()=>({status:200,body:"kaputt"})},adapter={anfrage:async()=>({url:V.PORTAL_DAY}),parse:async()=>{throw new Error("bad")}};await assert.rejects(()=>new V.VPlanClient({bridge,adapter}).abrufen(),x=>x.code==="PARSER_FEHLER")});
test("29 Parser muss Array liefern",async()=>{const bridge={request:async()=>({status:200,body:"{}"})},adapter={anfrage:async()=>({url:V.PORTAL_DAY}),parse:async()=>({})};await assert.rejects(()=>new V.VPlanClient({bridge,adapter}).abrufen(),x=>x.code==="PARSER_FEHLER")});
test("30 Erfolgsfall stempelt Abrufzeit",async()=>{const bridge={request:async()=>({status:200,body:"[]"})},adapter={anfrage:async()=>({url:V.PORTAL_DAY}),parse:async()=>[e()]};const r=await new V.VPlanClient({bridge,adapter}).abrufen();assert.ok(r[0].abgerufenAm)});
test("31 Secure Storage Setter nutzt Brücke",async()=>{let got;const bridge={request:async()=>({}),secureSet:async x=>(got=x,{ok:true})};await new V.VPlanClient({bridge,adapter:{}}).geheimnisSetzen("passwort","secret");assert.deepEqual(got,{key:"passwort",value:"secret"})});

const portalHtml=`<!doctype html><html><body>
<div data-title="Fach"><table id="editableTable"><tr><th>Std.</th><th>Fach</th></tr><tr><td>1</td><td>MA</td></tr><tr><td>2</td><td><b>PH</b></td></tr><tr><td>3/4</td><td>DE<br>GE</td></tr><tr><td>5</td><td>-</td></tr></table></div>
<div data-title="LK"><table id="editableTable"><tr><th>Std.</th><th>LK</th></tr><tr><td>1</td><td>AB</td></tr><tr><td>2</td><td><b>CD</b></td></tr><tr><td>3/4</td><td>EF<br>GH</td></tr><tr><td>5</td><td>-</td></tr></table></div>
<div data-title="Raum"><table id="editableTable"><tr><th>Std.</th><th>Raum</th></tr><tr><td>1</td><td>101</td></tr><tr><td>2</td><td><b>204</b></td></tr><tr><td>3/4</td><td>301<br>302</td></tr><tr><td>5</td><td>-</td></tr></table></div>
</body></html>`;

test("32 Login-Request nutzt belegte Portalparameter",()=>{const r=V.portalLoginRequest("a+b@example.org","p&x",V.portalLoginForm(loginHtml));assert.equal(r.url,V.PORTAL_LOGIN);assert.match(r.body,/MAIL=a%2Bb%40example\.org/);assert.match(r.body,/SCHUELERCODE=p%26x/);assert.match(r.body,/formAction=login/);assert.match(r.body,/formName=stacks_in_368$/)});
test("33 Portal-Datum wird deutsch übertragen",()=>assert.match(V.portalDayRequest("2026-09-14").url,/KlaBuDatum=14\.09\.2026/));
test("34 ungültiges Portal-Datum abgelehnt",()=>assert.throws(()=>V.portalDayRequest("14.09.2026"),x=>x.code==="DATUM_UNGUELTIG"));
test("35 login detection uses fields in the same form",()=>assert.equal(V.portalIstLoginHtml('<form><input name="MAIL"><input name="SCHUELERCODE"></form>'),true));
test("36 normale Planseite ist keine Loginseite",()=>assert.equal(V.portalIstLoginHtml(portalHtml),false));
test("37 HTML-Entities werden als Text gelesen",()=>assert.deepEqual(V.htmlWerte("MA &amp; PH<br>R&amp;D"),["MA & PH","R&D"]));
test("38 Pluspräfix wird entfernt",()=>assert.deepEqual(V.htmlWerte("+ MA<br>+ PH"),["MA","PH"]));
test("39 Fach/LK/Raum werden kombiniert",()=>{const r=V.parsePortalDayHtml(portalHtml);assert.equal(r[0].fach,"MA");assert.equal(r[0].lehrer,"AB");assert.equal(r[0].raum,"101")});
test("40 Fettdruck markiert Änderung",()=>{const r=V.parsePortalDayHtml(portalHtml);assert.equal(r[1].geaendert,true);assert.equal(r[1].fachMarkiert,"PH");assert.equal(r[1].raumMarkiert,"204")});
test("41 Mehrfachwerte bleiben sichtbar",()=>{const r=V.parsePortalDayHtml(portalHtml);assert.equal(r[2].fach,"DE / GE");assert.equal(r[2].raum,"301 / 302")});
test("42 Bindestrich wird leer",()=>{const r=V.parsePortalDayHtml(portalHtml);assert.equal(r[3].fach,"");assert.equal(r[3].lehrer,"");assert.equal(r[3].raum,"")});
test("43 Loginseite wird nicht als Plan geparst",()=>assert.throws(()=>V.parsePortalDayHtml('<form><input name="MAIL"><input name="SCHUELERCODE"></form>'),x=>x.code==="LOGIN_FEHLER"));
test("44 Seite ohne Tabellen wird abgelehnt",()=>assert.throws(()=>V.parsePortalDayHtml("<html>leer</html>"),x=>x.code==="PARSER_FEHLER"));
test("45 Einzelstunden landen im 90-Minuten-Block",()=>{const r=V.portalRowsZuSlots([{slot:"1",fach:"MA"},{slot:"2",fach:"MA"}],slots);assert.equal(r.gruppen[0].index,0);assert.equal(r.gruppen[0].effektiv.fach,"MA")});
test("46 verschiedene Einzelstunden werden transparent zusammengefasst",()=>{const r=V.portalRowsZuSlots([{slot:"1",fach:"MA"},{slot:"2",fach:"PH"}],slots);assert.equal(r.gruppen[0].effektiv.fach,"MA / PH")});
test("47 unbekannte Portalstunde wird Hinweis",()=>{const r=V.portalRowsZuSlots([{slot:"99",fach:"MA"}],slots);assert.equal(r.hinweise.length,1)});
test("48 PortalClient erkennt Redirect als Loginfehler",async()=>{const bridge={request:async req=>req.resetSession?{status:200,body:loginHtml}:req.method==="POST"?{status:302,body:""}:{status:302,body:""}};await assert.rejects(()=>new V.PortalClient({bridge}).anmelden({benutzer:"x",passwort:"y",datum:"2026-09-14"}),x=>x.code==="LOGIN_FEHLER")});
test("49 PortalClient speichert Zugangsdaten nur bei Merken",async()=>{const writes=[];const bridge={request:async req=>req.resetSession?{status:200,body:loginHtml}:req.method==="POST"?{status:200,body:""}:{status:200,body:portalHtml},secureSet:async x=>writes.push(x),secureRemove:async()=>{}};const r=await new V.PortalClient({bridge}).anmelden({benutzer:"user",passwort:"pw",merken:true,datum:"2026-09-14"});assert.equal(r.rows.length,4);assert.deepEqual(writes.map(x=>x.key),["portal.user","portal.password"])});
test("50 PortalClient entfernt gespeicherte Daten bei Merken aus",async()=>{const removed=[];const bridge={request:async req=>req.resetSession?{status:200,body:loginHtml}:req.method==="POST"?{status:200,body:""}:{status:200,body:portalHtml},secureRemove:async x=>removed.push(x.key)};await new V.PortalClient({bridge}).anmelden({benutzer:"user",passwort:"pw",merken:false,datum:"2026-09-14"});assert.deepEqual(removed,["portal.user","portal.password"])});
test("51 Portal-Zugangsdaten sind je Profil getrennt",async()=>{const writes=[];const bridge={request:async req=>req.resetSession?{status:200,body:loginHtml}:req.method==="POST"?{status:200,body:""}:{status:200,body:portalHtml},secureSet:async x=>writes.push(x),secureRemove:async()=>{}};await new V.PortalClient({bridge,secretScope:"profil-2"}).anmelden({benutzer:"user",passwort:"pw",merken:true,datum:"2026-09-14"});assert.deepEqual(writes.map(x=>x.key),["portal.user.profil-2","portal.password.profil-2"])});

test("52 aktuelle Live-Formularkennung statt alter Page-ID",()=>{
  assert.equal(V.portalLoginForm(loginHtml),"stacks_in_368");
  assert.equal(V.portalLoginForm(loginHtml.replaceAll("stacks_in_368","stacks_in_999")),"stacks_in_999");
});
test("53 fehlendes oder mehrdeutiges Formular wird abgelehnt",()=>{
  for(const html of ["<html>Wartung</html>",loginHtml+loginHtml.replaceAll("stacks_in_368","stacks_in_999"),loginHtml.replace('name="formName"','name="unknown"')])
    assert.throws(()=>V.portalLoginForm(html),e=>e.code==="PARSER_FEHLER");
});
test("54 fremde und unsichere Formularziele werden abgelehnt",()=>{
  for(const action of ["https://example.org/index.php","http://virtueller-stundenplan.org/index.php","https://user@virtueller-stundenplan.org/index.php","https://virtueller-stundenplan.org:444/index.php","/unknown.php"])
    assert.throws(()=>V.portalLoginForm(loginHtml.replace('action="/index.php"',`action="${action}"`)),e=>e.code==="PARSER_FEHLER");
});
test("55 Formularattribute mit Einzelquotes und HTML-Kommentaren",()=>{
  assert.equal(V.portalLoginForm(`<!-- ${loginHtml} -->`+loginHtml.replaceAll('"',"'")),"stacks_in_368");
});
test("56 Login lädt Formular vor POST und Tagesplan im selben Profil",async()=>{
  const calls=[];
  const bridge={request:async req=>{calls.push(req);return {status:200,body:req.resetSession?loginHtml:req.method==="POST"?"ok":portalHtml};},secureRemove:async()=>{}};
  await new V.PortalClient({bridge,secretScope:"2"}).anmelden({benutzer:"a+b@example.org",passwort:"p &ü",merken:false,datum:"2026-09-14"});
  assert.deepEqual(calls.map(x=>x.method),["GET","POST","GET"]);
  assert.deepEqual(calls.map(x=>x.sessionScope),["2","2","2"]);
  assert.equal(calls[0].resetSession,true);
  assert.equal(calls[0].body,undefined);
  assert.equal(new URLSearchParams(calls[1].body).get("formName"),"stacks_in_368");
  assert.equal(new URLSearchParams(calls[1].body).get("SCHUELERCODE"),"p &ü");
});
test("57 fehlerhafter Login darf keinen alten Tagesplan als Erfolg melden",async()=>{
  for(const response of [{status:200,body:loginHtml},{status:302,body:""},{status:400,body:""},{status:401,body:""},{status:403,body:""},{status:429,body:""},{status:503,body:""}]){
    const calls=[], writes=[];
    const bridge={request:async req=>{calls.push(req);return req.resetSession?{status:200,body:loginHtml}:response;},secureSet:async x=>writes.push(x)};
    await assert.rejects(()=>new V.PortalClient({bridge}).anmelden({benutzer:"x",passwort:"y",datum:"2026-09-14"}),e=>e.code===([400,429,503].includes(response.status)?"HTTP_FEHLER":"LOGIN_FEHLER"));
    assert.equal(calls.length,2);assert.equal(writes.length,0);
  }
});
test("58 unlesbares Loginformular verhindert Passwort-POST",async()=>{
  const calls=[];
  const bridge={request:async req=>{calls.push(req);return {status:200,body:"<html>Wartung</html>"};}};
  await assert.rejects(()=>new V.PortalClient({bridge}).anmelden({benutzer:"x",passwort:"y"}),e=>e.code==="PARSER_FEHLER");
  assert.equal(calls.length,1);assert.equal(calls[0].method,"GET");
});
test("59 Abmelden entfernt die native Sitzung und nur eigene Geheimnisse",async()=>{
  const calls=[];
  const bridge={clearSession:async x=>calls.push(x),secureRemove:async x=>calls.push(x)};
  await new V.PortalClient({bridge,secretScope:"p2"}).abmelden();
  assert.deepEqual(calls,[{sessionScope:"p2"},{key:"portal.user.p2"},{key:"portal.password.p2"}]);
});
test("60 Wiederherstellen verwendet erneut das aktuelle Formular",async()=>{
  const calls=[];
  const bridge={secureGet:async({key})=>({value:key.includes("password")?"pw":"user"}),secureSet:async()=>{},request:async req=>{
    calls.push(req);return {status:200,body:req.resetSession?loginHtml:req.method==="POST"?"ok":portalHtml};
  }};
  const r=await new V.PortalClient({bridge,secretScope:"p3"}).wiederherstellen("2026-09-14");
  assert.equal(r.angemeldet,true);assert.equal(calls[0].resetSession,true);assert.equal(calls[1].sessionScope,"p3");
});
test("61 ausschließlich exakte Portal-Origin",()=>{
  for(const url of [V.PORTAL_LOGIN,V.PORTAL_DAY,"https://virtueller-stundenplan.org:443/page2/"]) assert.equal(V.portalUrlErlaubt(url),true);
  for(const url of ["https://example.org/","http://virtueller-stundenplan.org/","https://virtueller-stundenplan.org.evil.org/","https://virtueller-stundenplan.org:444/","https://user@virtueller-stundenplan.org/"]) assert.equal(V.portalUrlErlaubt(url),false);
});
test("62 generischer Adapter kann keinen anderen Dienst aufrufen",async()=>{
  let requested=false;
  const bridge={request:async()=>{requested=true;}};
  const adapter={anfrage:async()=>({url:"https://example.org"}),parse:async()=>[]};
  await assert.rejects(()=>new V.VPlanClient({bridge,adapter}).abrufen(),e=>e.code==="PORTAL_URL_UNGUELTIG");
  assert.equal(requested,false);
});

test("63 embedded login form is detected without stack identifiers or action markers",()=>{
  const html=fixture("portal-login-page.html");
  assert.equal(V.portalLoginForm(html),"stacks_in_742");
  assert.equal(V.portalIstLoginHtml(html.replace(/<input name="form(?:Name|Action)"[^>]*>/g,"")),true);
});
test("64 identical responsive login forms allow the full login sequence",async()=>{
  const html=fixture("portal-login-duplicate.html"), calls=[];
  assert.equal(V.portalLoginForm(html),"stacks_in_742");
  const bridge={request:async req=>{calls.push(req);return {status:200,body:req.resetSession?html:portalHtml};}};
  const result=await new V.PortalClient({bridge}).anmelden({benutzer:"test",passwort:"test",merken:false,datum:"2026-09-14"});
  assert.equal(result.angemeldet,true);assert.equal(result.rows.length,4);
  assert.deepEqual(calls.map(x=>x.method),["GET","POST","GET"]);
  assert.equal(new URLSearchParams(calls[1].body).get("formName"),"stacks_in_742");
});
test("65 conflicting form names report form validation and prevent POST",async()=>{
  const calls=[], bridge={request:async req=>{calls.push(req);return {status:200,body:fixture("portal-login-conflict.html")};}};
  await assert.rejects(()=>new V.PortalClient({bridge}).anmelden({benutzer:"test",passwort:"test"}),e=>e.code==="PARSER_FEHLER"&&e.stage==="form-validation");
  assert.deepEqual(calls.map(x=>x.method),["GET"]);
});
test("66 timetable structure takes priority over an embedded login template",async()=>{
  const html=fixture("portal-day-with-login.html");
  assert.equal(V.portalIstLoginHtml(html),false);
  assert.deepEqual(V.parsePortalDayHtml(html).map(x=>[x.slot,x.fach,x.lehrer,x.raum]),[["1","MA","AB","101"],["2","PH","CD","204"]]);
  const bridge={request:async req=>({status:200,body:req.resetSession?fixture("portal-login-page.html"):html})};
  const result=await new V.PortalClient({bridge}).anmelden({benutzer:"test",passwort:"test",merken:false,datum:"2026-09-14"});
  assert.equal(result.rows.length,2);
});
test("67 login keywords, scripts, comments and fields in separate forms are insufficient",()=>{
  for(const html of [
    '<p>SCHUELERCODE formAction</p>',
    '<p>Anmeldung für Schülerinnen und Schüler</p>',
    '<form><input name="MAIL"></form><form><input name="SCHUELERCODE"><input name="formAction"></form>',
    `<!-- ${fixture("portal-login-page.html")} -->`,
    `<script>const template=${JSON.stringify(fixture("portal-login-page.html"))};</script>`
  ]) assert.equal(V.portalIstLoginHtml(html),false);
});
test("68 empty timetable structure takes priority but reports the table parser stage",()=>{
  const login=fixture("portal-login-page.html");
  for(const title of ["Fach","LK","Raum"]){
    const html=login.replace("</main>",`<div data-title=${title}><section><table id=editableTable></table></section></div></main>`);
    assert.equal(V.portalIstLoginHtml(html),false);
    assert.throws(()=>V.parsePortalDayHtml(html),e=>e.code==="PARSER_FEHLER"&&e.stage==="table-parser");
  }
  for(const table of ['<div data-title="Fach"></div><table id="editableTable"></table>','<section data-title="Fach"><table id="editableTable"></table></section>'])
    assert.equal(V.portalIstLoginHtml(login.replace("</main>",table+"</main>")),true);
});
test("69 missing login forms report form discovery without sending POST",async()=>{
  const calls=[], bridge={request:async req=>{calls.push(req);return {status:200,body:'<html><body>Keine Anmeldung</body></html>'};}};
  await assert.rejects(()=>new V.PortalClient({bridge}).anmelden({benutzer:"test",passwort:"test"}),e=>e.code==="PARSER_FEHLER"&&e.stage==="form-discovery");
  assert.deepEqual(calls.map(x=>x.method),["GET"]);
});
test("70 all existing form safety checks retain the form validation stage",()=>{
  const html=fixture("portal-login-page.html");
  const unsafe=[
    html.replace('method="post"','method="get"'),
    ...['http://virtueller-stundenplan.org/index.php','https://other.invalid/index.php','https://virtueller-stundenplan.org:444/index.php','https://user:pass@virtueller-stundenplan.org/index.php','/other.php','/index.php?x=1','/index.php#x'].map(action=>html.replace('action="/index.php"',`action="${action}"`)),
    html.replace('type="hidden" value="stacks_in_742"','type="text" value="stacks_in_742"'),
    html.replace('name="formName"','name="other"'),
    html.replace('</form>','<input type="hidden" name="formName" value="stacks_in_742"></form>'),
    html.replace('name="formAction"','name="other"'),
    html.replace('stacks_in_742','invalid')
  ];
  for(const page of unsafe) assert.throws(()=>V.portalLoginForm(page),e=>e.code==="PARSER_FEHLER"&&e.stage==="form-validation");
});
test("71 HTTP errors retain their status even when the response embeds a login form",async()=>{
  for(const status of [400,429,503]){
    const bridge={request:async req=>({status:req.resetSession?200:status,body:fixture("portal-login-page.html")})};
    const client=new V.PortalClient({bridge});
    await assert.rejects(()=>client.anmelden({benutzer:"test",passwort:"test"}),e=>e.code==="HTTP_FEHLER"&&e.status===status);
    await assert.rejects(()=>client.tagAbrufen("2026-09-14"),e=>e.code==="HTTP_FEHLER"&&e.status===status);
  }
});
