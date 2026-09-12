import test from "node:test";
import assert from "node:assert/strict";
import "../../www/updater.js";
const U=globalThis.XyzUpdater;

test("Updater 01 liest normale Version",()=>assert.deepEqual(U.versionTeile("0.3.0"),[0,3,0]));
test("Updater 02 liest Android-Präfix",()=>assert.deepEqual(U.versionTeile("android-12.4.7"),[12,4,7]));
test("Updater 03 verwirft ungültige Version",()=>assert.equal(U.versionTeile("preview"),null));
test("Updater 04 erkennt gleiche Version",()=>assert.equal(U.versionVergleichen("0.3.0","0.3.0"),0));
test("Updater 05 erkennt Patch-Update",()=>assert.equal(U.versionVergleichen("0.3.0","0.3.1"),-1));
test("Updater 06 erkennt Minor-Update",()=>assert.equal(U.versionVergleichen("0.3.9","0.4.0"),-1));
test("Updater 07 erkennt Major-Update",()=>assert.equal(U.versionVergleichen("1.9.9","2.0.0"),-1));
test("Updater 08 erkennt neuere lokale Version",()=>assert.equal(U.versionVergleichen("2.0.0","1.9.9"),1));
test("Updater 09 Suffixe beeinflussen Semver nicht",()=>assert.equal(U.versionVergleichen("0.3.0-preview","xyz 0.3.0 Preview"),0));
test("Updater 10 ohne Native Bridge bleibt Webmodus unangetastet",()=>assert.equal(U.bridge(),null));
