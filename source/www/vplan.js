(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  root.XyzVPlan=api;
  if(root.document){
    let native=false;
    try{ native=!!(root.Capacitor?.isNativePlatform?.() || root.Capacitor?.Plugins?.VPlanBridge); }catch(e){}
    if(native){
      ["updater.js","portal.js"].forEach(src=>{
        if(root.document.querySelector(`script[src$="${src}"]`)) return;
        const s=root.document.createElement("script");
        s.src=src; s.async=false; s.dataset.xyzNative="1";
        root.document.head.appendChild(s);
      });
    }
  }
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const MAX_TEXT=500;
  const MAX_RESPONSE=1024*1024;
  const PORTAL_LOGIN="https://virtueller-stundenplan.org/index.php";
  const PORTAL_DAY="https://virtueller-stundenplan.org/page2/index.php";
  const PORTAL_SECRET_USER="portal.user";
  const PORTAL_SECRET_PASSWORD="portal.password";

  function text(v,max=MAX_TEXT){
    if(v===null || v===undefined) return "";
    return String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,"").trim().slice(0,max);
  }
  function datum(v){
    const s=text(v,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }
  function bool(v){ return v===true; }
  function slotZahlen(v){
    const s=typeof v==="object" && v ? (v.std ?? v.slot ?? v.label ?? "") : v;
    const n=[...text(s,80).matchAll(/\d{1,2}/g)].map(m=>+m[0]).filter(x=>x>0 && x<100);
    return [...new Set(n)].sort((a,b)=>a-b);
  }
  function gleichesSet(a,b){ return a.length===b.length && a.every((x,i)=>x===b[i]); }

  function mapSlot(remoteSlot,slots){
    const rz=slotZahlen(remoteSlot);
    if(!rz.length || !Array.isArray(slots)) return null;
    const lokal=slots.map((s,index)=>({index,z:slotZahlen(s)})).filter(x=>x.z.length);
    const exakt=lokal.filter(x=>gleichesSet(x.z,rz));
    if(exakt.length===1) return exakt[0].index;
    if(exakt.length>1) return null;
    const enthalten=lokal.filter(x=>rz.every(n=>x.z.includes(n)));
    return enthalten.length===1 ? enthalten[0].index : null;
  }

  function normalisieren(raw){
    if(!raw || typeof raw!=="object" || Array.isArray(raw)) return null;
    const d=datum(raw.datum);
    if(!d) return null;
    const remoteId=text(raw.remoteId || raw.id,160);
    const slot=text(raw.slot,80);
    const art=text(raw.art || "vertretung",40).toLowerCase() || "vertretung";
    return {
      remoteId, datum:d, slot, art,
      fachAlt:text(raw.fachAlt,120), fachNeu:text(raw.fachNeu,120),
      lehrerAlt:text(raw.lehrerAlt,120), lehrerNeu:text(raw.lehrerNeu,120),
      raumAlt:text(raw.raumAlt,120), raumNeu:text(raw.raumNeu,120),
      entfaellt:bool(raw.entfaellt), hinweis:text(raw.hinweis,1000),
      quelleZeit:text(raw.quelleZeit,80), abgerufenAm:text(raw.abgerufenAm,80),
      rawSlot:text(raw.rawSlot || raw.slot,80)
    };
  }
  function inhaltKey(e){
    return [e.datum,e.slot,e.art,e.fachAlt,e.fachNeu,e.lehrerAlt,e.lehrerNeu,e.raumAlt,e.raumNeu,
      e.entfaellt?"1":"0",e.hinweis,e.quelleZeit].join("\u001f");
  }
  function identKey(e){
    if(e.remoteId) return `id:${e.remoteId}`;
    return ["fallback",e.datum,e.slot,e.art,e.fachAlt,e.lehrerAlt,e.raumAlt].join("\u001f");
  }
  function cacheAktualisieren(cacheRaw,neuRaw){
    const cache=Array.isArray(cacheRaw)?cacheRaw.map(normalisieren).filter(Boolean):[];
    const neu=Array.isArray(neuRaw)?neuRaw.map(normalisieren).filter(Boolean):[];
    const map=new Map(cache.map(e=>[identKey(e),e]));
    for(const e of neu){
      const k=identKey(e), alt=map.get(k);
      if(!alt || inhaltKey(alt)!==inhaltKey(e) || e.abgerufenAm) map.set(k,e);
    }
    return [...map.values()].sort((a,b)=>(a.datum+a.slot+a.art+identKey(a)).localeCompare(b.datum+b.slot+b.art+identKey(b)));
  }
  function cacheFuerDatum(cacheRaw,d){
    return (Array.isArray(cacheRaw)?cacheRaw:[]).map(normalisieren).filter(e=>e && e.datum===d);
  }
  function cacheAlterMinuten(cacheRaw,jetzt=Date.now()){
    const zeiten=(Array.isArray(cacheRaw)?cacheRaw:[]).map(e=>Date.parse(e?.abgerufenAm||"")).filter(Number.isFinite);
    if(!zeiten.length) return null;
    return Math.max(0,Math.floor((jetzt-Math.max(...zeiten))/60000));
  }

  function mappeTag(eintraegeRaw,slots){
    const overlay=[], hinweise=[];
    for(const raw of Array.isArray(eintraegeRaw)?eintraegeRaw:[]){
      const e=normalisieren(raw); if(!e) continue;
      const index=mapSlot(e.slot,slots);
      if(index===null) hinweise.push({...e,grund:"slot-uneindeutig"});
      else overlay.push({...e,index});
    }
    return {overlay,hinweise};
  }

  function formEncode(obj){
    return Object.entries(obj).map(([k,v])=>
      encodeURIComponent(k)+"="+encodeURIComponent(String(v??"")).replace(/%20/g,"+")).join("&");
  }
  function portalUrlErlaubt(value){
    try{
      const u=new URL(value);
      return u.protocol==="https:" && u.hostname==="virtueller-stundenplan.org"
        && (!u.port||u.port==="443") && !u.username && !u.password;
    }catch(e){return false;}
  }
  function portalParserError(stage){
    return Object.assign(new Error("Unexpected portal HTML structure."),{code:"PARSER_FEHLER",stage});
  }
  function portalResponsePage(value){
    if(!portalUrlErlaubt(value)) return "unknown";
    const path=new URL(value).pathname;
    if(["/","/index.php"].includes(path)) return "login";
    if(["/page2/","/page2/index.php"].includes(path)) return "day";
    return "other";
  }
  function portalHtmlSource(html){
    return String(html||"").replace(/<!--[\s\S]*?-->/g,"")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,"");
  }
  function portalAttributes(tag){
    return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
      .map(m=>[m[1].toLowerCase(),htmlDecode(m[2]??m[3]??m[4])]));
  }
  function portalLoginForms(html){
    const forms=[];
    for(const match of portalHtmlSource(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)){
      const fields=[...match[2].matchAll(/<input\b[^>]*>/gi)].map(x=>portalAttributes(x[0]));
      if(!fields.some(x=>x.name==="MAIL") || !fields.some(x=>x.name==="SCHUELERCODE")) continue;
      forms.push({attributes:portalAttributes(match[1]),fields});
    }
    return forms;
  }
  function portalLoginForm(html){
    const forms=portalLoginForms(html), namesFound=new Set();
    if(!forms.length) throw portalParserError("form-discovery");
    for(const {attributes:form,fields} of forms){
      let action; try{action=new URL(form.action||"",PORTAL_LOGIN);}catch(e){throw portalParserError("form-validation");}
      if(form.method?.toLowerCase()!=="post" || !portalUrlErlaubt(action.href) || action.pathname!=="/index.php" || action.search || action.hash) throw portalParserError("form-validation");
      const names=fields.filter(x=>x.name==="formName" && x.type?.toLowerCase()==="hidden");
      if(names.length!==1 || !/^stacks_in_\d+(?:_page\d+)?$/.test(names[0].value||"")) throw portalParserError("form-validation");
      if(!fields.some(x=>x.name==="formAction" && x.type?.toLowerCase()==="hidden")) throw portalParserError("form-validation");
      namesFound.add(names[0].value);
    }
    if(namesFound.size!==1) throw portalParserError("form-validation");
    return [...namesFound][0];
  }
  function portalLoginRequest(benutzer,passwort,formName){
    const user=text(benutzer,254), pass=String(passwort??"");
    if(!user || !pass || pass.length>2048) throw Object.assign(new Error("Benutzer und Passwort fehlen."),{code:"LOGIN_DATEN_FEHLEN"});
    if(!/^stacks_in_\d+(?:_page\d+)?$/.test(formName||"")) throw portalParserError("form-validation");
    return {
      url:PORTAL_LOGIN, method:"POST", timeoutMs:15000, maxBytes:MAX_RESPONSE,
      headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"text/html,*/*"},
      body:formEncode({MAIL:user,SCHUELERCODE:pass,formAction:"login",formName})
    };
  }
  function portalDayRequest(d){
    const iso=datum(d); if(!iso) throw Object.assign(new Error("Ungültiges Portal-Datum."),{code:"DATUM_UNGUELTIG"});
    const deutsch=`${iso.slice(8,10)}.${iso.slice(5,7)}.${iso.slice(0,4)}`;
    return {url:`${PORTAL_DAY}?KlaBuDatum=${encodeURIComponent(deutsch)}&HideChangesOff=1&CompactOff=1`,
      method:"GET",timeoutMs:15000,maxBytes:MAX_RESPONSE,headers:{Accept:"text/html,*/*"}};
  }
  function portalIstLoginHtml(html){
    if(portalTableBlock(html)!==null) return false;
    return portalLoginForms(html).length>0;
  }
  function htmlDecode(s){
    return String(s||"")
      .replace(/&#x([0-9a-f]+);/gi,(_,n)=>{try{return String.fromCodePoint(parseInt(n,16));}catch(e){return "";}})
      .replace(/&#(\d+);/g,(_,n)=>{try{return String.fromCodePoint(parseInt(n,10));}catch(e){return "";}})
      .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<")
      .replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");
  }
  function htmlWerte(fragment){
    const roh=htmlDecode(String(fragment||"")
      .replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/p\s*>/gi,"\n").replace(/<[^>]*>/g," "));
    return [...new Set(roh.split(/\n+/).map(x=>x.replace(/\s+/g," ").trim().replace(/^\+\s*/,""))
      .filter(x=>x && x!=="-"))];
  }
  function htmlFettWerte(fragment){
    const raus=[]; let m; const re=/<b\b[^>]*>([\s\S]*?)<\/b\s*>/gi;
    while((m=re.exec(String(fragment||"")))) raus.push(...htmlWerte(m[1]));
    return [...new Set(raus)];
  }
  function portalTableBlock(html,title=null){
    const source=portalHtmlSource(html), divs=[];
    let start=null, depth=0;
    // Require table ancestry, including nested wrappers, rather than nearby keywords.
    for(const match of source.matchAll(/<(\/?)(div|table)\b[^>]*>/gi)){
      const closing=!!match[1], tag=match[2].toLowerCase();
      if(tag==="div"){
        if(closing) divs.pop(); else divs.push(portalAttributes(match[0])["data-title"]);
      }else if(!closing){
        if(start!==null) depth++;
        else if(portalAttributes(match[0]).id==="editableTable"
          && divs.some(value=>title===null?["Fach","LK","Raum"].includes(value):value===title)){
          start=match.index+match[0].length;depth=1;
        }
      }else if(start!==null && --depth===0) return source.slice(start,match.index);
    }
    return null;
  }
  function portalTabelle(html,titel){
    const block=portalTableBlock(html,titel);
    if(block===null) return [];
    const raus=[]; let row;
    const rowRe=/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
    while((row=rowRe.exec(block))){
      const cells=[]; let cell; const cellRe=/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi;
      while((cell=cellRe.exec(row[1]))) cells.push(cell[1]);
      if(cells.length<2) continue;
      const slot=htmlWerte(cells[0]).join(" / ");
      if(!slotZahlen(slot).length) continue;
      raus.push({slot,werte:htmlWerte(cells[1]),fett:htmlFettWerte(cells[1])});
    }
    return raus;
  }
  function portalRowNormalisieren(raw){
    if(!raw || typeof raw!=="object") return null;
    const slot=text(raw.slot,80); if(!slotZahlen(slot).length) return null;
    const sauber=v=>text(v,180).replace(/^\+\s*/,"");
    return {slot,fach:sauber(raw.fach),lehrer:sauber(raw.lehrer),raum:sauber(raw.raum),
      geaendert:!!raw.geaendert,fachMarkiert:sauber(raw.fachMarkiert),
      lehrerMarkiert:sauber(raw.lehrerMarkiert),raumMarkiert:sauber(raw.raumMarkiert)};
  }
  function parsePortalDayHtml(html){
    if(portalIstLoginHtml(html)) throw Object.assign(new Error("Portal zeigt die Login-Seite."),{code:"LOGIN_FEHLER"});
    const fach=portalTabelle(html,"Fach"), lk=portalTabelle(html,"LK"), raum=portalTabelle(html,"Raum");
    const key=x=>slotZahlen(x.slot).join(",");
    const maps=[fach,lk,raum].map(list=>new Map(list.map(x=>[key(x),x])));
    const reihe=[];
    for(const list of [fach,lk,raum]) for(const x of list){ const k=key(x); if(k&&!reihe.includes(k)) reihe.push(k); }
    if(!reihe.length) throw portalParserError("table-parser");
    return reihe.map(k=>{
      const f=maps[0].get(k), l=maps[1].get(k), r=maps[2].get(k), basis=f||l||r;
      const join=x=>(x?.werte||[]).join(" / ");
      const fett=x=>(x?.fett||[]).join(" / ");
      return portalRowNormalisieren({slot:basis.slot,fach:join(f),lehrer:join(l),raum:join(r),
        geaendert:!!(f?.fett?.length||l?.fett?.length||r?.fett?.length),
        fachMarkiert:fett(f),lehrerMarkiert:fett(l),raumMarkiert:fett(r)});
    }).filter(Boolean);
  }
  function portalRowsZuSlots(rows,slots){
    const gruppen=new Map(), hinweise=[];
    for(const raw of Array.isArray(rows)?rows:[]){
      const row=portalRowNormalisieren(raw); if(!row) continue;
      const index=mapSlot(row.slot,slots);
      if(index===null){ hinweise.push({...row,grund:"slot-uneindeutig"}); continue; }
      if(!gruppen.has(index)) gruppen.set(index,[]);
      gruppen.get(index).push(row);
    }
    const kombi=list=>{
      const u=k=>[...new Set(list.map(x=>x[k]).filter(Boolean))].join(" / ");
      return {fach:u("fach"),lehrer:u("lehrer"),raum:u("raum"),geaendert:list.some(x=>x.geaendert),
        remoteSlots:list.map(x=>x.slot).join(" + ")};
    };
    return {gruppen:[...gruppen.entries()].sort((a,b)=>a[0]-b[0]).map(([index,rows])=>({index,rows,effektiv:kombi(rows)})),hinweise};
  }

  function bridgeAusGlobal(){
    const p=globalThis?.Capacitor?.Plugins?.VPlanBridge;
    return p && typeof p.request==="function" ? p : null;
  }
  class VPlanClient{
    constructor({bridge,adapter,maxResponseBytes=MAX_RESPONSE}={}){
      this.bridge=bridge || bridgeAusGlobal();
      this.adapter=adapter || null;
      this.maxResponseBytes=Math.min(Math.max(+maxResponseBytes||MAX_RESPONSE,1024),4*1024*1024);
    }
    async abrufen(ctx={}){
      if(!this.bridge) throw Object.assign(new Error("Native VPlan-Brücke nicht verfügbar."),{code:"BRIDGE_FEHLT"});
      if(!this.adapter || typeof this.adapter.anfrage!=="function" || typeof this.adapter.parse!=="function")
        throw Object.assign(new Error("Portal-Protokoll ist noch nicht konfiguriert."),{code:"PROTOKOLL_FEHLT"});
      const req=await this.adapter.anfrage(ctx);
      if(!portalUrlErlaubt(req?.url)) throw Object.assign(new Error("Nur virtueller-stundenplan.org wird unterstützt."),{code:"PORTAL_URL_UNGUELTIG"});
      const antwort=await this.bridge.request({...req,maxBytes:this.maxResponseBytes});
      if(!antwort || typeof antwort.status!=="number")
        throw Object.assign(new Error("Ungültige Antwort der Netzwerkbrücke."),{code:"ANTWORT_UNGUELTIG"});
      if(antwort.status===401 || antwort.status===403)
        throw Object.assign(new Error("Anmeldung beim Virtuellen Stundenplan fehlgeschlagen."),{code:"LOGIN_FEHLER",status:antwort.status});
      if(antwort.status<200 || antwort.status>=300)
        throw Object.assign(new Error(`Virtueller Stundenplan: HTTP ${antwort.status}.`),{code:"HTTP_FEHLER",status:antwort.status});
      let parsed;
      try{ parsed=await this.adapter.parse(antwort.body,antwort,ctx); }
      catch(err){ throw Object.assign(new Error("Die Antwort des Vertretungsplans konnte nicht gelesen werden."),{code:"PARSER_FEHLER",cause:err}); }
      if(!Array.isArray(parsed)) throw Object.assign(new Error("Parser lieferte kein Eintragsfeld."),{code:"PARSER_FEHLER"});
      const stamp=new Date().toISOString();
      return parsed.map(x=>normalisieren({...x,abgerufenAm:x?.abgerufenAm||stamp})).filter(Boolean);
    }
    async geheimnisSetzen(key,value){
      if(!this.bridge?.secureSet) throw Object.assign(new Error("Sicherer Speicher nicht verfügbar."),{code:"SECURE_STORAGE_FEHLT"});
      return this.bridge.secureSet({key:text(key,80),value:String(value??"")});
    }
    async geheimnisLesen(key){
      if(!this.bridge?.secureGet) throw Object.assign(new Error("Sicherer Speicher nicht verfügbar."),{code:"SECURE_STORAGE_FEHLT"});
      return this.bridge.secureGet({key:text(key,80)});
    }
    async geheimnisLoeschen(key){
      if(!this.bridge?.secureRemove) throw Object.assign(new Error("Sicherer Speicher nicht verfügbar."),{code:"SECURE_STORAGE_FEHLT"});
      return this.bridge.secureRemove({key:text(key,80)});
    }
  }

  class PortalClient{
    constructor({bridge,maxResponseBytes=MAX_RESPONSE,secretScope=""}={}){
      this.bridge=bridge || bridgeAusGlobal();
      this.maxResponseBytes=Math.min(Math.max(+maxResponseBytes||MAX_RESPONSE,1024),4*1024*1024);
      this.secretScope=text(secretScope,32).replace(/[^A-Za-z0-9._-]/g,"");
    }
    _secretKey(base){ return this.secretScope ? `${base}.${this.secretScope}` : base; }
    _bereit(){ if(!this.bridge?.request) throw Object.assign(new Error("Native Portal-Brücke nicht verfügbar."),{code:"BRIDGE_FEHLT"}); }
    async _request(request,requestStage,parse){
      let response;
      try{
        response=await this.bridge.request(request);
        return parse(response);
      }catch(error){
        // Keep only diagnostic categories; never copy HTML, URLs or bridge messages.
        const codes=["LOGIN_FEHLER","PARSER_FEHLER","HTTP_FEHLER","TIMEOUT","NETWORK_ERROR","ANTWORT_UNGUELTIG","PORTAL_URL_UNGUELTIG"];
        const failure=Object.assign(new Error("Portal request failed."),{
          code:codes.includes(error?.code)?error.code:"PORTAL_FEHLER",requestStage,
          responsePage:portalResponsePage(response?.url)
        });
        const status=response?.status??error?.status;
        if(Number.isInteger(status)&&status>=100&&status<=599) failure.status=status;
        if(["form-discovery","form-validation","table-parser"].includes(error?.stage)) failure.stage=error.stage;
        if(failure.code==="LOGIN_FEHLER"&&portalIstLoginHtml(response?.body)) failure.loginReason="login-form";
        throw failure;
      }
    }
    async _tag(d){
      this._bereit();
      return this._request({...portalDayRequest(d),maxBytes:this.maxResponseBytes,sessionScope:this.secretScope},"day-fetch",response=>{
        if(!response || typeof response.status!=="number") throw Object.assign(new Error("Invalid portal response."),{code:"ANTWORT_UNGUELTIG"});
        if(response.status===401 || response.status===403 || (response.status>=300&&response.status<400))
          throw Object.assign(new Error("Portal authentication failed."),{code:"LOGIN_FEHLER"});
        if(response.status<200 || response.status>=300) throw Object.assign(new Error("Portal HTTP error."),{code:"HTTP_FEHLER"});
        return parsePortalDayHtml(response.body);
      });
    }
    async anmelden({benutzer,passwort,merken=true,datum:tag}={}){
      this._bereit();
      const user=text(benutzer,254), pass=String(passwort??"");
      if(!user || !pass || pass.length>2048) throw Object.assign(new Error("Benutzer und Passwort fehlen."),{code:"LOGIN_DATEN_FEHLEN"});
      const formName=await this._request({url:PORTAL_LOGIN,method:"GET",timeoutMs:15000,maxBytes:this.maxResponseBytes,
        sessionScope:this.secretScope,resetSession:true,headers:{Accept:"text/html,*/*"}},"form-load",response=>{
        if(!response || typeof response.status!=="number" || response.status<200 || response.status>=300)
          throw Object.assign(new Error("Portal login form could not be loaded."),{code:"HTTP_FEHLER"});
        return portalLoginForm(response.body);
      });
      await this._request({...portalLoginRequest(user,pass,formName),maxBytes:this.maxResponseBytes,sessionScope:this.secretScope},"login-submit",response=>{
        if(!response || typeof response.status!=="number") throw Object.assign(new Error("Invalid portal response."),{code:"ANTWORT_UNGUELTIG"});
        if(response.status===401 || response.status===403 || (response.status>=300&&response.status<400))
          throw Object.assign(new Error("Portal authentication failed."),{code:"LOGIN_FEHLER"});
        if(response.status<200 || response.status>=300) throw Object.assign(new Error("Portal HTTP error."),{code:"HTTP_FEHLER"});
        if(portalIstLoginHtml(response.body)) throw Object.assign(new Error("Portal returned a login form."),{code:"LOGIN_FEHLER"});
      });
      const d=datum(tag)||new Date().toISOString().slice(0,10);
      const rows=await this._tag(d);
      if(merken){
        if(!this.bridge.secureSet) throw Object.assign(new Error("Sicherer Speicher nicht verfügbar."),{code:"SECURE_STORAGE_FEHLT"});
        await this.bridge.secureSet({key:this._secretKey(PORTAL_SECRET_USER),value:user});
        await this.bridge.secureSet({key:this._secretKey(PORTAL_SECRET_PASSWORD),value:pass});
      }else if(this.bridge.secureRemove){
        await this.bridge.secureRemove({key:this._secretKey(PORTAL_SECRET_USER)});
        await this.bridge.secureRemove({key:this._secretKey(PORTAL_SECRET_PASSWORD)});
      }
      return {angemeldet:true,gemerkt:!!merken,datum:d,rows};
    }
    async gespeichert(){
      if(!this.bridge?.secureGet) return false;
      try{
        const [u,p]=await Promise.all([this.bridge.secureGet({key:this._secretKey(PORTAL_SECRET_USER)}),this.bridge.secureGet({key:this._secretKey(PORTAL_SECRET_PASSWORD)})]);
        return !!(u?.value&&p?.value);
      }catch(e){ return false; }
    }
    async wiederherstellen(d){
      this._bereit();
      if(!this.bridge.secureGet) return {angemeldet:false,gemerkt:false};
      const [u,p]=await Promise.all([this.bridge.secureGet({key:this._secretKey(PORTAL_SECRET_USER)}),this.bridge.secureGet({key:this._secretKey(PORTAL_SECRET_PASSWORD)})]);
      if(!u?.value||!p?.value) return {angemeldet:false,gemerkt:false};
      return this.anmelden({benutzer:u.value,passwort:p.value,merken:true,datum:d});
    }
    async tagAbrufen(d){ return this._tag(d); }
    async abmelden(){
      if(this.bridge?.clearSession) await this.bridge.clearSession({sessionScope:this.secretScope});
      if(this.bridge?.secureRemove){
        await this.bridge.secureRemove({key:this._secretKey(PORTAL_SECRET_USER)});
        await this.bridge.secureRemove({key:this._secretKey(PORTAL_SECRET_PASSWORD)});
      }
      return {abgemeldet:true};
    }
  }

  return {MAX_RESPONSE,text,datum,slotZahlen,mapSlot,normalisieren,identKey,inhaltKey,
    cacheAktualisieren,cacheFuerDatum,cacheAlterMinuten,mappeTag,VPlanClient,bridgeAusGlobal,
    PORTAL_LOGIN,PORTAL_DAY,formEncode,portalUrlErlaubt,portalLoginForm,portalLoginRequest,portalDayRequest,portalIstLoginHtml,
    htmlWerte,htmlFettWerte,portalTabelle,portalRowNormalisieren,parsePortalDayHtml,portalRowsZuSlots,PortalClient};
});
