(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.XyzMehrplan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const TAGE = ['MO','DI','MI','DO','FR'];
  const WOCHEN = ['A','B'];

  const text = v => v == null ? '' : String(v).trim();
  const klonen = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const zelle = raw => {
    if(!raw || typeof raw !== 'object') return null;
    const fach = text(raw.fach).toUpperCase();
    if(!fach) return null;
    return {fach, raum:text(raw.raum), lk:text(raw.lk)};
  };
  const gleich = (a,b) => !!a && !!b && a.fach === b.fach && a.raum === b.raum && a.lk === b.lk;
  const slotKey = (tag,index) => `${tag}:${index}`;
  const quellenKey = ids => [...ids].sort().join('|');
  const regelKey = (tag,index,ids) => `${slotKey(tag,index)}|${quellenKey(ids)}`;

  function rasterNormalisieren(slots){
    if(!Array.isArray(slots)) return [];
    return slots.slice(0,32).map((s,i) => ({
      std:text(s && s.std) || String(i+1),
      von:text(s && s.von),
      bis:text(s && s.bis)
    }));
  }

  function planNormalisieren(plan, slots, zweiWochen){
    const out = {A:{}, B:{}};
    WOCHEN.forEach(w => TAGE.forEach(tag => {
      const basisWoche = (!zweiWochen && w === 'B') ? 'A' : w;
      const liste = plan && plan[basisWoche] && Array.isArray(plan[basisWoche][tag])
        ? plan[basisWoche][tag] : [];
      out[w][tag] = slots.map((_,i) => zelle(liste[i]));
    }));
    return out;
  }

  function quelleNormalisieren(raw){
    if(!raw || typeof raw !== 'object') return null;
    const id = text(raw.id);
    if(!id) return null;
    const rasterRaw = raw.raster && typeof raw.raster === 'object' ? raw.raster : raw;
    const slots = rasterNormalisieren(rasterRaw.slots || []);
    if(!slots.length) return null;
    const zweiWochen = !!rasterRaw.zweiWochen;
    return {
      id,
      name:text(raw.name) || id,
      aktiv:raw.aktiv !== false,
      hinzugefuegtAm:text(raw.hinzugefuegtAm),
      aktualisiertAm:text(raw.aktualisiertAm),
      raster:{slots, zweiWochen},
      plan:planNormalisieren(raw.plan || {}, slots, zweiWochen)
    };
  }

  function rasterSignatur(q){
    return JSON.stringify(q.raster.slots.map(s => [s.std,s.von,s.bis]));
  }

  function regelNormalisieren(r){
    if(!r || typeof r !== 'object') return null;
    const slot = text(r.slot);
    const quellen = Array.isArray(r.quellen) ? [...new Set(r.quellen.map(text).filter(Boolean))].sort() : [];
    if(!/^((MO|DI|MI|DO|FR):\d+)$/.test(slot) || quellen.length < 2) return null;
    if(r.modus === 'immer'){
      const p = Array.isArray(r.prioritaet) ? [...new Set(r.prioritaet.map(text).filter(Boolean))] : [];
      return {slot, quellen, modus:'immer', prioritaet:p};
    }
    if(r.modus === 'wechsel'){
      return {slot, quellen, modus:'wechsel', aWoche:text(r.aWoche), bWoche:text(r.bWoche)};
    }
    return null;
  }

  function findeRegel(regeln, tag, index, ids){
    const key = regelKey(tag,index,ids);
    return (Array.isArray(regeln) ? regeln : [])
      .map(regelNormalisieren).filter(Boolean)
      .find(r => `${r.slot}|${quellenKey(r.quellen)}` === key) || null;
  }

  function entscheideMitRegel(regel, woche, kandidaten){
    if(!regel) return null;
    const ids = new Set(kandidaten.map(k => k.quelle.id));
    let id = null;
    if(regel.modus === 'immer') id = regel.prioritaet.find(x => ids.has(x)) || null;
    else if(regel.modus === 'wechsel') id = woche === 'A' ? regel.aWoche : regel.bWoche;
    if(!id || !ids.has(id)) return null;
    return kandidaten.find(k => k.quelle.id === id) || null;
  }

  function leeresPlan(slots){
    const p = {A:{},B:{}};
    WOCHEN.forEach(w => TAGE.forEach(t => p[w][t] = slots.map(() => null)));
    return p;
  }
  function leereHerkunft(slots){
    const p = {A:{},B:{}};
    WOCHEN.forEach(w => TAGE.forEach(t => p[w][t] = slots.map(() => [])));
    return p;
  }

  function zusammenfuehren(quellenRaw, regelnRaw){
    const quellen = (Array.isArray(quellenRaw) ? quellenRaw : []).map(quelleNormalisieren).filter(Boolean);
    const aktive = quellen.filter(q => q.aktiv);
    if(!aktive.length){
      return {status:'leer', plan:leeresPlan([]), herkunft:leereHerkunft([]), konflikte:[], rasterKonflikt:null, zweiWochen:false};
    }
    const rasterGruppen = new Map();
    aktive.forEach(q => {
      const sig = rasterSignatur(q);
      if(!rasterGruppen.has(sig)) rasterGruppen.set(sig, []);
      rasterGruppen.get(sig).push(q);
    });
    if(rasterGruppen.size > 1){
      return {
        status:'raster-konflikt', plan:null, herkunft:null, konflikte:[],
        rasterKonflikt:[...rasterGruppen.values()].map(g => ({
          quellen:g.map(q => ({id:q.id,name:q.name})), slots:klonen(g[0].raster.slots)
        })),
        zweiWochen:aktive.some(q => q.raster.zweiWochen)
      };
    }

    const slots = aktive[0].raster.slots;
    const plan = leeresPlan(slots), herkunft = leereHerkunft(slots), konflikte = [];
    WOCHEN.forEach(woche => TAGE.forEach(tag => slots.forEach((_,index) => {
      const kandidaten = aktive.map(q => ({quelle:q, zelle:q.plan[woche][tag][index]})).filter(k => k.zelle);
      if(!kandidaten.length) return;
      const erste = kandidaten[0].zelle;
      if(kandidaten.every(k => gleich(erste,k.zelle))){
        plan[woche][tag][index] = klonen(erste);
        herkunft[woche][tag][index] = kandidaten.map(k => k.quelle.id).sort();
        return;
      }
      const ids = kandidaten.map(k => k.quelle.id).sort();
      const regel = findeRegel(regelnRaw, tag,index,ids);
      const gewaehlt = entscheideMitRegel(regel,woche,kandidaten);
      if(gewaehlt){
        plan[woche][tag][index] = klonen(gewaehlt.zelle);
        herkunft[woche][tag][index] = [gewaehlt.quelle.id];
        return;
      }
      konflikte.push({
        id:`${woche}:${tag}:${index}:${quellenKey(ids)}`,
        woche, tag, index, slot:slotKey(tag,index), quellen:ids,
        kandidaten:kandidaten.map(k => ({quelleId:k.quelle.id, quelleName:k.quelle.name, zelle:klonen(k.zelle)}))
      });
    })));
    const wechselRegel = (Array.isArray(regelnRaw) ? regelnRaw : []).some(r => r && r.modus === 'wechsel');
    return {
      status:konflikte.length ? 'konflikte' : 'ok', plan, herkunft, konflikte, rasterKonflikt:null,
      slots:klonen(slots), zweiWochen:aktive.some(q => q.raster.zweiWochen) || wechselRegel
    };
  }

  function regelSetzen(regelnRaw, regelRaw){
    const regel = regelNormalisieren(regelRaw);
    if(!regel) throw new Error('Ungültige Merge-Regel');
    const key = `${regel.slot}|${quellenKey(regel.quellen)}`;
    const rest = (Array.isArray(regelnRaw) ? regelnRaw : []).map(regelNormalisieren).filter(Boolean)
      .filter(r => `${r.slot}|${quellenKey(r.quellen)}` !== key);
    return [...rest, regel].sort((a,b) => (a.slot + quellenKey(a.quellen)).localeCompare(b.slot + quellenKey(b.quellen)));
  }

  function regelnBereinigen(regelnRaw, quellenRaw){
    const ids = new Set((Array.isArray(quellenRaw) ? quellenRaw : []).map(q => text(q && q.id)).filter(Boolean));
    return (Array.isArray(regelnRaw) ? regelnRaw : []).map(regelNormalisieren).filter(Boolean)
      .filter(r => r.quellen.every(id => ids.has(id)));
  }

  function neueQuelle({id,name,plan,slots,zweiWochen,aktiv=true,jetzt}){
    const stamp = text(jetzt) || new Date().toISOString();
    return quelleNormalisieren({
      id:id || `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,
      name:name || 'Stundenplan', aktiv,
      hinzugefuegtAm:stamp, aktualisiertAm:stamp,
      raster:{slots,zweiWochen}, plan
    });
  }

  function quelleAktualisieren(quelleRaw,{plan,slots,zweiWochen,jetzt}){
    const q = quelleNormalisieren(quelleRaw);
    if(!q) throw new Error('Ungültige Quelle');
    return quelleNormalisieren({...q, plan, raster:{slots,zweiWochen}, aktualisiertAm:text(jetzt)||new Date().toISOString()});
  }

  return {
    TAGE, WOCHEN, zelle, gleich, rasterNormalisieren, planNormalisieren, quelleNormalisieren,
    regelNormalisieren, regelKey, zusammenfuehren, regelSetzen, regelnBereinigen,
    neueQuelle, quelleAktualisieren
  };
});
