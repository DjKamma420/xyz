# xyz

> Vorläufiger Projektname. Die endgültige Produktbezeichnung und die öffentliche Android-Application-ID sind noch nicht festgelegt.

Android-Stundenplan auf Basis der lokalen PWA `DjKamma420/StundenplanNothing` v49. Das vorhandene HTML/CSS/JavaScript-Frontend bleibt erhalten und wird durch eine dünne Capacitor-Android-Hülle, Mehrplan-Zusammenführung und eine direkte Vertretungsplan-Schicht ergänzt.

## Stand

- Basis: `StundenplanNothing` v49, Commit `02b31320db8c48e1048f2f20de01329f59e347ae`
- Capacitor: 8.5.1
- Android: minSdk 24, target/compileSdk 36
- Java: 21 für Android
- Node: 24
- Gradle: 8.14.3
- Entwicklungs-ID: `com.djkamma420.xyz.dev`

Die Entwicklungs-ID ist **nicht** als endgültige Store-ID freigegeben.

## Architektur

```text
www/                         bestehendes PWA-Frontend + neue Weblogik
  app.js                     v49-Anwendungslogik, migriert auf Datenfassung 4
  mehrplan.js                Quellpläne, Merge-Regeln, deterministischer Gesamtplan
  vplan.js                   protokollneutrales Vertretungsmodell/Mapping/Cache

android/                     dünne native Android-Hülle
  .../MainActivity.java      Capacitor BridgeActivity
  .../VPlanPlugin.java       HTTPS-/Keystore-/Netzwerkbrücke

werkzeug/                    statische Prüfungen, Sync und Tests
```

Wahrheitsmodell:

```text
Planquellen + Merge-Regeln -> regulärer Gesamtplan A/B
                                   +
                         Vertretungs-Overlay pro Datum
                                   =
                         sichtbarer Tagesplan
```

Vertretungsdaten verändern weder Quellpläne noch Merge-Regeln dauerhaft.

## Entwicklung

```bash
npm install
npm run check
npm run android:sync
gradle -p android :app:assembleDebug
```

`npm run check` führt statische Prüfungen sowie Merge-/Vertretungsplan-Tests aus.

## Virtueller Stundenplan

Die allgemeine Client-, Mapping-, Cache- und native Netzwerkschicht ist vorbereitet. Ein konkreter Portaladapter wird erst implementiert, wenn die reale Portalinstanz anhand anonymisierter Netzwerkdaten analysiert wurde. Endpunkte, Loginfelder, Cookies oder HTML-Strukturen werden nicht geraten.

Zugangsdaten gehören ausschließlich in die App-Eingabemaske und werden nativ geschützt gespeichert. Sie gehören nicht in Issues, Quellcode, Backups oder Chatnachrichten.

## Datenschutz

Local-First. Keine Analytics, keine Werbung, kein eigenes Backend und kein Proxyserver. Details: [PRIVACY.md](PRIVACY.md).

## Ursprung

Siehe [UPSTREAM.md](UPSTREAM.md).

## Lizenz

MIT. Siehe [LICENSE](LICENSE) und [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
