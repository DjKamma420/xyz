#!/usr/bin/env node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root = new URL('../www/', import.meta.url);
const path = f => new URL(f, root);
let fail=0;
const check=(n,fn)=>{try{const x=fn();console.log(`  ok    ${n}${x?' — '+x:''}`)}catch(e){fail++;console.error(`  FEHL  ${n} — ${e.message}`)}};
const read=f=>fs.readFileSync(path(f),'utf8');
check('JavaScript-Syntax',()=>{for(const f of ['app.js','mehrplan.js','vplan.js','portal.js','updater.js','sw.js'])execFileSync(process.execPath,['--check',path(f).pathname]);return 'app.js, mehrplan.js, vplan.js, portal.js, updater.js, sw.js'});
check('Manifest ist gültiges JSON',()=>{const m=JSON.parse(read('manifest.webmanifest'));if(!m.name||!Array.isArray(m.icons))throw Error('name oder icons fehlen');return m.name});
check('Service-Worker-Dateien vorhanden',()=>{const m=read('sw.js').match(/const DATEIEN = \[([^\]]+)\]/);if(!m)throw Error('DATEIEN fehlt');const files=[...m[1].matchAll(/"([^\"]+)"/g)].map(x=>x[1].replace(/^\.\//,'')).filter(x=>x&&x!=='./');const missing=files.filter(f=>!fs.existsSync(path(f)));if(missing.length)throw Error(missing.join(', '));return `${files.length} Dateien`});
check('DOM-Kennungen vollständig',()=>{const html=read('index.html'), js=read('app.js');const ids=new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map(m=>m[1]));const missing=new Set();for(const re of [/\$\("#([A-Za-z0-9_-]+)"\)/g,/getElementById\("([A-Za-z0-9_-]+)"\)/g])for(const m of js.matchAll(re))if(!ids.has(m[1])&&m[1]!=='fehlerkasten')missing.add(m[1]);if(missing.size)throw Error([...missing].join(', '));return `${ids.size} Kennungen`});
check('Manueller Planstift aus normaler UI entfernt',()=>{if(!/id="btnEdit"[^>]*class="[^"]*hidden/.test(read('index.html'))&&!/class="[^"]*hidden[^"]*"[^>]*id="btnEdit"/.test(read('index.html')))throw Error('btnEdit ist sichtbar');return 'hidden'});
check('Module vor app.js geladen',()=>{if(!/mehrplan\.js"><\/script>\s*<script src="vplan\.js"><\/script>\s*<script src="app\.js/.test(read('index.html')))throw Error('Reihenfolge falsch');return 'ok'});
check('Native Zusatzmodule werden nur nativ nachgeladen',()=>{const js=read('vplan.js');if(!js.includes('updater.js')||!js.includes('portal.js')||!js.includes('isNativePlatform'))throw Error('native Loader fehlt');return 'Updater + Portal'});
check('Portal speichert keine Passwörter im Webspeicher',()=>{const js=read('portal.js');if(/localStorage\.setItem\([^\n]*(pass|password|portalUser|portalPass)/i.test(js))throw Error('möglicher Zugangsdaten-Speicherpfad');return 'Keystore-Brücke'});
check('Android- und Paketversion stimmen überein',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  const gradle=fs.readFileSync(new URL('../android/app/build.gradle',import.meta.url),'utf8');
  const version=gradle.match(/versionName '([^']+)'/)?.[1];
  if(version!==pkg.version)throw Error(`Android ${version}, Paket ${pkg.version}`);
  return version;
});
console.log(fail?`\n${fail} Prüfung(en) fehlgeschlagen.`:'\nAlle Prüfungen bestanden.');
process.exit(fail?1:0);
