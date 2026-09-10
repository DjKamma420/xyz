# xyz

Android-Stundenplan auf Basis von StundenplanNothing.

## Direkt installieren

Die einfachste Variante ist die Datei **`xyz.apk`** direkt im Hauptverzeichnis des Repositorys. Sie wird von GitHub Actions aus dem Quellcode gebaut, geprüft, auf einem Android-Emulator installiert und erst danach in `main` aktualisiert.

Alternativ steht dieselbe APK unter **Releases → `v0.2.0-preview`** bereit.

> Die aktuelle Fassung ist eine installierbare Preview und debug-signiert. Sie verwendet noch die provisorische Android-App-ID `com.djkamma420.xyz.dev` und ist noch kein Play-Store-Release.

## Repository-Struktur

- `source/` – vollständiger Quellcode und Android-Projekt
- `source/www/` – PWA-Oberfläche
- `source/android/` – Capacitor-/Android-Hülle
- `source/werkzeug/` – Prüfungen, Tests und Android-Synchronisierung
- `docs/` – Dokumentation
- `docs/legal/` – Lizenz, Datenschutz, Sicherheit und Upstream-Hinweise
- `.github/workflows/` – automatischer Test-, Build- und APK-Veröffentlichungsprozess
- `xyz.apk` – fertige installierbare Android-Anwendung

## Selbst bauen

Eine vollständige Anleitung steht in [`docs/BUILD.md`](BUILD.md).

Kurzfassung:

```bash
cd source
npm install --ignore-scripts
npm run check
npm run android:sync
gradle -p android :app:assembleDebug
```

Die erzeugte APK liegt danach unter:

```text
source/android/app/build/outputs/apk/debug/app-debug.apk
```

## Stand v0.2.0

Enthalten sind unter anderem responsive Bildschirm-/Safe-Area-Anpassungen, mehrere Planquellen mit deterministischem Merge und die Verbindung kompatibler Stundenplanquellen über HTTPS-Links mit automatischer Aktualisierung.

Die schulportal-spezifische Login-Anbindung wird weiterhin nicht geraten: Dafür muss das tatsächliche Portalprotokoll bekannt sein. Zugangsdaten gehören ausschließlich in die App und nicht in Repository, Issues oder Chat.