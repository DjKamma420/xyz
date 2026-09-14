(function(root){
  "use strict";
  const V=root.XyzVPlan;
  const native=!!(root.Capacitor?.isNativePlatform?.() || root.Capacitor?.Plugins?.VPlanBridge);
  if(!V || !native) return;
  const bridge=root.Capacitor?.Plugins?.VPlanBridge;
  if(!bridge?.request) return;
  const AUTO_MS=15*60*1000;
  let angemeldet=false, laeuft=false, observer=null, anwendenLaeuft=false;

  const zwei=n=>String(n).padStart(2,"0");
  const isoLocal=d=>`${d.getFullYear()}-${zwei(d.getMonth()+1)}-${zwei(d.getDate())}`;
  const plusTage=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
  const profilId=()=>{try{return localStorage.getItem("profilAktiv")||"1";}catch(e){return "1";}};
  const cacheKey=()=>`p${profilId()}_vplanPortalCache`;
  const metaKey=()=>`p${profilId()}_vplanPortalMeta`;
  const client=()=>new V.PortalClient({bridge,secretScope:profilId()});

  function cacheLesen(){
    try{
      const c=JSON.parse(localStorage.getItem(cacheKey())||"{}");
      if(!c||typeof c!=="object"||c.fassung!==1||!c.tage||typeof c.tage!=="object") return {fassung:1,tage:{}};
      return c;
    }catch(e){return {fassung:1,tage:{}};}
  }
  root.XyzPortal={hatTag:d=>!!cacheLesen().tage[d]};
  function cacheSchreiben(c){
    try{localStorage.setItem(cacheKey(),JSON.stringify(c));}catch(e){}
  }
  function tagSpeichern(d,rows){
    const c=cacheLesen();
    c.tage[d]={abgerufenAm:new Date().toISOString(),rows:(Array.isArray(rows)?rows:[]).map(V.portalRowNormalisieren).filter(Boolean)};
    const grenze=Date.now()-45*864e5;
    Object.keys(c.tage).forEach(k=>{const t=Date.parse(k+"T12:00:00");if(!Number.isFinite(t)||t<grenze) delete c.tage[k];});
    cacheSchreiben(c);
  }
  function cacheLeeren(){
    try{localStorage.removeItem(cacheKey());localStorage.removeItem(metaKey());}catch(e){}
  }
  function metaLesen(){try{return JSON.parse(localStorage.getItem(metaKey())||"{}");}catch(e){return {};}}
  function metaSchreiben(x){try{localStorage.setItem(metaKey(),JSON.stringify(x));}catch(e){}}

  function cfgSlots(){
    try{
      const c=JSON.parse(localStorage.getItem(`p${profilId()}_cfg`)||"{}");
      return Array.isArray(c.slots)?c.slots.filter(x=>x&&x.std):[];
    }catch(e){return [];}
  }
  function ausgewaehltesDatum(){
    const t=root.document.getElementById("titel")?.textContent||"";
    const m=t.match(/(\d{1,2})\.(\d{1,2})\./); if(!m) return null;
    const tag=+m[1],monat=+m[2]-1,heute=new Date();
    const kandidaten=[heute.getFullYear()-1,heute.getFullYear(),heute.getFullYear()+1].map(j=>new Date(j,monat,tag,12));
    kandidaten.sort((a,b)=>Math.abs(a-heute)-Math.abs(b-heute));
    return isoLocal(kandidaten[0]);
  }
  function portalMarker(block,text){
    let marker=block.querySelector("[data-portal-marker]");
    if(!marker){
      let box=block.querySelector(".marker");
      if(!box){box=root.document.createElement("div");box.className="marker";block.lastElementChild?.appendChild(box);}
      marker=root.document.createElement("span"); marker.className="einmalig"; marker.dataset.portalMarker="1"; box?.appendChild(marker);
    }
    if(marker) marker.textContent=text;
  }
  function portalBanner(d,tag,hinweise){
    const plan=root.document.getElementById("plan"); if(!plan) return;
    let b=root.document.getElementById("portalTagStand");
    if(!tag){if(b)b.remove();return;}
    if(!b){b=root.document.createElement("div");b.id="portalTagStand";b.className="detail";b.style.margin="10px 0 4px";plan.parentNode?.insertBefore(b,plan);}
    const zeit=tag.abgerufenAm?new Date(tag.abgerufenAm).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):"";
    b.textContent=`Virtueller Stundenplan · ${d}${zeit?` · Stand ${zeit}`:""}${hinweise?` · ${hinweise} nicht zugeordnet`:""}`;
  }
  function overlayAnwenden(){
    if(anwendenLaeuft) return;
    anwendenLaeuft=true;
    try{
      const d=ausgewaehltesDatum(), c=cacheLesen(), tag=d&&c.tage[d];
      if(!d||!tag){portalBanner(null,null,0);return;}
      if(!root.document.querySelector("#plan .block") && typeof root.zeichne==="function") root.zeichne();
      const slots=cfgSlots(); if(!slots.length) return;
      const m=V.portalRowsZuSlots(tag.rows,slots);
      for(const g of m.gruppen){
        const block=root.document.querySelector(`#plan .block[data-block="${g.index}"]`); if(!block) continue;
        const fach=block.querySelector(".fach"), detail=block.querySelector(".detail"), e=g.effektiv;
        const hat=!!(e.fach||e.lehrer||e.raum);
        if(!hat){
          if(fach && fach.textContent.trim().toLowerCase()!=="frei"){
            block.classList.add("ausfall");
            if(detail && !detail.textContent.includes("Portal:")) detail.textContent+= " · Portal: fällt aus";
            portalMarker(block,"Portal · Ausfall");
          }
          continue;
        }
        block.classList.remove("ausfall");
        if(fach){fach.textContent=e.fach||fach.textContent||"Unterricht";fach.classList.remove("leer");}
        if(detail){
          const s=slots[g.index]||{};
          const teile=[String(s.std||e.remoteSlots||"").replace(/,/g,"/"),e.raum||"—",e.lehrer].filter(Boolean);
          detail.textContent=teile.join(" · ")+" · Portal";
        }
        portalMarker(block,e.geaendert?"Portal · geändert":"Portal");
      }
      portalBanner(d,tag,m.hinweise.length);
    }finally{setTimeout(()=>{anwendenLaeuft=false;},0);}
  }

  function status(t,fehler=false){
    const el=root.document.getElementById("portalStatus"); if(!el)return;
    el.textContent=t||""; el.style.color=fehler?"var(--akzent)":"";
  }
  function busy(an){
    laeuft=an;
    ["portalVerbinden","portalSync","portalTrennen"].forEach(id=>{const b=root.document.getElementById(id);if(b)b.disabled=an;});
  }
  function fehlerText(e){
    if(e?.code==="LOGIN_FEHLER") return "Anmeldung fehlgeschlagen oder Sitzung abgelaufen.";
    if(e?.code==="PARSER_FEHLER") return "Die Portal-Seite hat eine unerwartete Struktur. Es wurden keine Daten übernommen.";
    if(e?.code==="TIMEOUT") return "Das Schulportal antwortet nicht rechtzeitig.";
    return String(e?.message||e||"Unbekannter Fehler").slice(0,240);
  }
  function tageNaechsteWoche(){
    const h=new Date(),r=[];
    for(let i=0;i<8&&r.length<5;i++){const d=plusTage(h,i),w=d.getDay();if(w>=1&&w<=5)r.push(isoLocal(d));}
    return r;
  }
  async function synchronisieren({inklHeuteRows=null}={}){
    if(laeuft)return;
    const profil=profilId(), c=client();
    busy(true);
    try{
      const tage=tageNaechsteWoche();
      for(const d of tage){
        if(inklHeuteRows&&d===isoLocal(new Date())){tagSpeichern(d,inklHeuteRows);continue;}
        try{const rows=await c.tagAbrufen(d);if(profil!==profilId())return;tagSpeichern(d,rows);}
        catch(e){
          if(e?.code==="LOGIN_FEHLER"&&await c.gespeichert()){
            const r=await c.wiederherstellen(d); if(profil!==profilId())return; angemeldet=!!r.angemeldet; tagSpeichern(d,r.rows); continue;
          }
          throw e;
        }
      }
      metaSchreiben({letzterAbrufAm:new Date().toISOString()});
      angemeldet=true; status("Verbunden · die nächsten Schultage wurden aktualisiert."); overlayAnwenden();
    }catch(e){if(profil===profilId())status(fehlerText(e),true);}
    finally{busy(false);}
  }
  async function verbinden(){
    if(laeuft)return;
    const user=root.document.getElementById("portalUser")?.value.trim()||"";
    const pass=root.document.getElementById("portalPass")?.value||"";
    const merken=!!root.document.getElementById("portalMerken")?.checked;
    if(!user||!pass){status("Benutzer/Mailadresse und Passwort eingeben.",true);return;}
    const profil=profilId(), c=client();
    busy(true); status("Anmeldung wird geprüft …");
    try{
      const heute=isoLocal(new Date());
      const r=await c.anmelden({benutzer:user,passwort:pass,merken,datum:heute});
      if(profil!==profilId())return;
      angemeldet=true; tagSpeichern(heute,r.rows);
      const p=root.document.getElementById("portalPass"); if(p)p.value="";
      status(merken?"Verbunden · Zugangsdaten sind geschützt auf diesem Gerät gespeichert.":"Verbunden · Zugangsdaten werden nach dieser Sitzung nicht gespeichert.");
      busy(false); await synchronisieren({inklHeuteRows:r.rows});
    }catch(e){if(profil===profilId())status(fehlerText(e),true);}finally{busy(false);}
  }
  async function trennen(){
    if(laeuft)return;
    const profil=profilId(), c=client();
    busy(true);
    try{await c.abmelden();if(profil!==profilId())return;angemeldet=false;cacheLeeren();if(typeof root.zeichne==="function")root.zeichne();status("Portal-Verbindung auf diesem Gerät getrennt.");overlayAnwenden();}
    catch(e){if(profil===profilId())status(fehlerText(e),true);} finally{busy(false);}
  }
  async function autoStart(){
    const profil=profilId(), c=client();
    try{
      const gespeichert=await c.gespeichert();
      if(profil!==profilId())return;
      if(!gespeichert){status("Nicht verbunden.");return;}
      status("Gespeicherte Anmeldung vorhanden.");
      const alt=Date.parse(metaLesen().letzterAbrufAm||"")||0;
      if(Date.now()-alt<AUTO_MS){overlayAnwenden();return;}
      busy(true);
      const heute=isoLocal(new Date()),r=await c.wiederherstellen(heute);
      if(profil!==profilId()){busy(false);return;}
      busy(false);
      if(!r.angemeldet){status("Anmeldung muss erneut eingegeben werden.",true);return;}
      angemeldet=true;tagSpeichern(heute,r.rows);await synchronisieren({inklHeuteRows:r.rows});
    }catch(e){busy(false);if(profil===profilId())status(fehlerText(e),true);}
  }

  function uiEinbauen(){
    if(root.document.getElementById("portalBox")) return true;
    const section=root.document.querySelector('.einstTeil[data-einst="stundenplaene"]'); if(!section)return false;
    const box=root.document.createElement("div"); box.id="portalBox"; box.className="karte"; box.style.cssText="padding:14px;margin:16px 0";
    box.innerHTML=`<div class="eyebrow">Virtueller Stundenplan</div>
      <p class="hinweis">Direkte Verbindung zu <b>virtueller-stundenplan.org</b>. Zugangsdaten gehen nur vom Gerät zum Schulportal. Office 365 wird nicht unterstützt.</p>
      <label><span>Benutzer / Mailadresse</span><input type="text" id="portalUser" maxlength="254" autocomplete="username" autocapitalize="none"></label>
      <label><span>Passwort</span><input type="password" id="portalPass" maxlength="2048" autocomplete="current-password"></label>
      <label style="display:flex;align-items:center;gap:10px;margin-top:10px"><input type="checkbox" id="portalMerken" checked style="width:18px;flex:none;margin:0"><span style="letter-spacing:0;text-transform:none;font-family:var(--sans);font-size:14px;color:var(--text)">Auf diesem Gerät angemeldet bleiben</span></label>
      <div class="chips"><button type="button" id="portalVerbinden" style="border-color:var(--akzent);color:var(--akzent)">Schulportal verbinden</button><button type="button" id="portalSync">Jetzt aktualisieren</button><button type="button" id="portalTrennen">Trennen</button></div>
      <p class="hinweis" id="portalStatus"></p>`;
    const ersterHinweis=section.querySelector("p.hinweis");
    if(ersterHinweis) ersterHinweis.insertAdjacentElement("afterend",box); else section.prepend(box);
    root.document.getElementById("portalVerbinden").onclick=verbinden;
    root.document.getElementById("portalSync").onclick=()=>synchronisieren();
    root.document.getElementById("portalTrennen").onclick=trennen;
    autoStart();
    return true;
  }
  function starten(){
    if(!uiEinbauen()){setTimeout(starten,100);return;}
    const plan=root.document.getElementById("plan");
    if(plan&&root.MutationObserver){observer=new MutationObserver(()=>{if(!anwendenLaeuft)queueMicrotask(overlayAnwenden);});observer.observe(plan,{childList:true,subtree:true});}
    root.document.addEventListener("visibilitychange",()=>{if(!root.document.hidden)overlayAnwenden();});
    setTimeout(overlayAnwenden,0);
  }
  if(root.document.readyState==="loading") root.document.addEventListener("DOMContentLoaded",starten,{once:true}); else starten();
})(typeof globalThis!=="undefined"?globalThis:this);
