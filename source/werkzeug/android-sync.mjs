#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=path.join(root,'www');
const dst=path.join(root,'android','app','src','main','assets','public');
fs.rmSync(dst,{recursive:true,force:true});
fs.mkdirSync(dst,{recursive:true});
fs.cpSync(src,dst,{recursive:true});

// Der native Updater gehört nur in die APK. Die Web-PWA behält ihren bisherigen
// Service-Worker-Updater. Dadurch bekommt die Android-Fassung nach app.js eine
// kleine Brücke zum nativen APK-Installer, ohne die PWA-Logik zu vermischen.
const androidIndex=path.join(dst,'index.html');
let html=fs.readFileSync(androidIndex,'utf8');
const marker='<script src="app.js"></script>';
if(!html.includes(marker)) throw new Error('app.js-Scriptmarke im Android-Index fehlt.');
html=html.replace(marker, marker+'\n<script src="updater.js"></script>');
fs.writeFileSync(androidIndex,html);

const config=JSON.parse(fs.readFileSync(path.join(root,'capacitor.config.json'),'utf8'));
fs.writeFileSync(path.join(root,'android','app','src','main','assets','capacitor.config.json'),JSON.stringify(config,null,2)+'\n');
fs.writeFileSync(path.join(root,'android','app','src','main','assets','capacitor.plugins.json'),'[]\n');
console.log(`Android-Webassets synchronisiert: ${dst}`);
