# xyz

Android-Stundenplan auf Basis von StundenplanNothing.

## Direkt installieren

Die einfachste Variante ist **`xyz.apk`** direkt im Hauptverzeichnis des Repositorys. GitHub Actions baut die APK aus dem Quellcode, prüft Tests, Signatur und Manifest, installiert sie auf einem Android-Emulator und aktualisiert danach erst die fertige Datei in `main`.

Alternativ steht dieselbe APK unter **Releases → `preview`** bereit. Die installierte Android-App kann diesen Release über **„Nach Update suchen“** selbst prüfen, herunterladen und über den Android-Installer aktualisieren.

> Die aktuelle Fassung ist eine installierbare Preview mit fester Preview-Signatur. Sie verwendet weiterhin die provisorische Android-App-ID `com.djkamma420.xyz.dev` und ist noch kein Play-Store-Release.

## Stand 0.4.2

Zusätzlich zu mehreren deterministisch zusammengeführten Planquellen enthält 0.4.2 die direkte Android-Anbindung an **virtueller-stundenplan.org** mit korrigierter Login-Erkennung:

- Formularparameter aus der aktuellen Portalseite statt einer veralteten Kennung
- identische Formular-Duplikate sind zulässig; Tagespläne mit zusätzlichem Login-Template werden als Pläne erkannt
- sichtbare Fehlercodes mit Parserstufe und HTTP-Status
- ausschließlich virtueller-stundenplan.org als Online-Stundenplandienst; bisherige Linkquellen bleiben lokale Kopien
- persönlicher Benutzer-/Mail-Login mit Passwort direkt vom Gerät zum Schulportal
- geschützte lokale Speicherung über Android Keystore bei „angemeldet bleiben“
- getrennte Zugangsdaten und Cookie-Sitzungen je xyz-Profil
- Abruf der nächsten Schultage aus der persönlichen Portalansicht
- HTML-Parser für Fach, Lehrkraft und Raum
- temporäre Portal-Anzeige getrennt von Quellplänen und Merge-Regeln
- kein Office-365-Nachbau; unbekannte Protokollteile werden nicht geraten

Details und Grenzen stehen in [`docs/PORTAL_PROTOCOL.md`](PORTAL_PROTOCOL.md).

## Repository-Struktur

- `source/` – vollständiger Quellcode und Android-Projekt
- `source/www/` – PWA-Oberfläche und Android-Webmodule
- `source/android/` – Capacitor-/Android-Hülle
- `source/werkzeug/` – Prüfungen, Tests und Android-Synchronisierung
- `docs/` – Dokumentation
- `docs/legal/` – Lizenz, Datenschutz, Sicherheit und Upstream-Hinweise
- `.github/workflows/` – automatischer Test-, Build- und APK-Veröffentlichungsprozess
- `xyz.apk` – fertige installierbare Android-Anwendung

## Selbst bauen

Eine vollständige Anleitung steht in [`docs/BUILD.md`](BUILD.md).

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

Portal-Zugangsdaten gehören ausschließlich in die App und niemals in Repository, Issues oder Chat.

## Preview-Veröffentlichung

Version 0.4.2 verwendet Android-Versionscode 7. Ein einziger Workflow prüft und baut die APK, testet das Upgrade von der bisherigen Preview mit Datenerhalt und veröffentlicht genau dieses Artefakt nach erfolgreichem Main-Lauf. Das feste `preview`-Release, der Dateiname `xyz.apk`, der Preview-Schlüssel und die In-App-Updatequelle bleiben bestehen.
