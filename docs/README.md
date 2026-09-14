# xyz

Android-Stundenplan auf Basis von StundenplanNothing.

## Direkt installieren

Die einfachste Variante ist **`xyz.apk`** direkt im Hauptverzeichnis des Repositorys. GitHub Actions baut die APK aus dem Quellcode, prüft Tests, Signatur und Manifest, installiert sie auf einem Android-Emulator und aktualisiert danach erst die fertige Datei in `main`.

Alternativ steht dieselbe APK unter **Releases → `preview`** bereit. Die installierte Android-App kann diesen Release über **„Nach Update suchen“** selbst prüfen, herunterladen und über den Android-Installer aktualisieren.

> Die aktuelle Fassung ist eine installierbare Preview mit fester Preview-Signatur. Sie verwendet weiterhin die provisorische Android-App-ID `com.djkamma420.xyz.dev` und ist noch kein Play-Store-Release.

## Stand 0.4.0

Zusätzlich zu mehreren deterministisch zusammengeführten Planquellen enthält 0.4.0 die erste direkte Android-Anbindung an **virtueller-stundenplan.org**:

- persönlicher Benutzer-/Mail-Login mit Passwort direkt vom Gerät zum Schulportal
- geschützte lokale Speicherung über Android Keystore bei „angemeldet bleiben“
- getrennte Zugangsdaten je xyz-Profil
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
