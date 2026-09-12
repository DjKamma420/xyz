(function(root,factory){
  const api=factory(root);
  root.XyzUpdater=api;
  if(root.document && typeof root.setTimeout==="function") root.setTimeout(()=>api.init(),0);
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
  "use strict";

  function versionTeile(v){
    const m=String(v||"").match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/);
    return m ? [Number(m[1]),Number(m[2]),Number(m[3])] : null;
  }
  function versionVergleichen(a,b){
    const x=versionTeile(a), y=versionTeile(b);
    if(!x || !y) return 0;
    for(let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]<y[i]?-1:1;
    return 0;
  }
  function bridge(){
    const p=root?.Capacitor?.Plugins?.XyzUpdate;
    return p && typeof p.checkForUpdate==="function" ? p : null;
  }
  function textSetzen(info){
    const v=root.document?.getElementById("sVersion");
    if(v && info?.installedVersion) v.textContent=`android-${info.installedVersion}`;
    const w=root.document?.getElementById("wischText");
    if(w && info?.updateAvailable && info.latestVersion){
      w.textContent=`android-${info.installedVersion} · ${info.latestVersion} verfügbar — tippen zum Aktualisieren`;
      w.style.color="var(--akzent)";
      w.onclick=aktualisieren;
    }
  }
  function hinweis(t){
    if(typeof root.kurzHinweis==="function") root.kurzHinweis(t);
  }
  async function pruefen(){
    const p=bridge();
    if(!p) return null;
    const info=await p.checkForUpdate();
    textSetzen(info);
    return info;
  }
  async function privatImBrowser(p){
    await p.openPrivateDownload();
    hinweis("GitHub-Download im Browser geöffnet. Danach die heruntergeladene xyz.apk antippen.");
  }
  async function aktualisieren(){
    const p=bridge();
    if(!p) return false;
    try{
      const info=await pruefen();
      if(info && info.sourceAvailable===false){
        await privatImBrowser(p);
        return true;
      }
      if(!info?.updateAvailable){
        root.alert?.(`Du bist auf dem neuesten Stand${info?.installedVersion?` (${info.installedVersion})`:""}.`);
        return false;
      }
      hinweis(`xyz ${info.latestVersion} wird geladen …`);
      const r=await p.installLatest();
      if(r?.noUpdate) root.alert?.("Du bist bereits auf dem neuesten Stand.");
      return true;
    }catch(e){
      const code=e?.code || "";
      if(code==="INSTALL_PERMISSION_REQUIRED"){
        root.alert?.("Android hat die Berechtigung „Unbekannte Apps installieren“ geöffnet. Erlaube sie für xyz und tippe danach noch einmal auf „Nach Update suchen“.");
        return false;
      }
      if(code==="UPDATE_SOURCE_PRIVATE"){
        await privatImBrowser(p);
        return true;
      }
      root.alert?.("Update fehlgeschlagen: "+(e?.message || e || "unbekannter Fehler"));
      return false;
    }
  }
  function init(){
    const p=bridge();
    const b=root.document?.getElementById("sUpdate");
    if(!p || !b) return false;
    b.onclick=aktualisieren;
    try{ root.versionPruefen=pruefen; root.aktualisieren=aktualisieren; }catch(e){}
    pruefen().catch(()=>{});
    return true;
  }

  return {versionTeile,versionVergleichen,bridge,pruefen,aktualisieren,init};
});
