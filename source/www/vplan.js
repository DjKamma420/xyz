(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  root.XyzVPlan=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const MAX_TEXT=500;
  const MAX_RESPONSE=1024*1024;

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

  /**
   * Ordnet eine Portal-Stundenbezeichnung robust einem lokalen Raster zu.
   * Exakte Zahlenmengen gewinnen; eine einzelne Portalstunde darf nur dann
   * einem Block zugeordnet werden, wenn genau ein lokaler Slot sie enthält.
   * Uneindeutiges wird bewusst nicht geraten.
   */
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

  return {MAX_RESPONSE,text,datum,slotZahlen,mapSlot,normalisieren,identKey,inhaltKey,
    cacheAktualisieren,cacheFuerDatum,cacheAlterMinuten,mappeTag,VPlanClient,bridgeAusGlobal};
});
