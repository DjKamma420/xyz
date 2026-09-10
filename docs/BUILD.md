# xyz selbst bauen

Der vollständige Build liegt unter `source/`.

## Voraussetzungen

- Node.js 24.x (siehe `source/.nvmrc`)
- npm
- Java 21
- Android SDK mit API 36
- Gradle 8.14.3

## 1. Abhängigkeiten installieren

```bash
cd source
npm install --ignore-scripts
```

## 2. Prüfungen ausführen

```bash
npm run check
```

Dabei laufen die statischen Prüfungen sowie die automatisierten Mehrplan- und VPlan-Tests.

## 3. Web-App in das Android-Projekt synchronisieren

```bash
npm run android:sync
```

## 4. APK bauen

```bash
gradle -p android :app:assembleDebug
```

Ergebnis:

```text
source/android/app/build/outputs/apk/debug/app-debug.apk
```

## Komplettbefehl

```bash
cd source
npm install --ignore-scripts
npm run android:debug
```

## Automatischer GitHub-Build

`.github/workflows/pruefen.yml` führt denselben Ablauf in GitHub Actions aus. Nach erfolgreichem Test, APK-Prüfung und Android-Emulator-Smokecheck wird bei einem Push auf `main` die Datei `xyz.apk` im Repository-Root aktualisiert und zusätzlich im GitHub-Prerelease `v0.2.0-preview` veröffentlicht.

## Signierung

Die aktuelle APK ist debug-signiert und für direkte Tests/Installation gedacht. Vor einer Veröffentlichung im Play Store müssen eine endgültige Application-ID und eine dauerhafte Release-Signierung festgelegt werden.