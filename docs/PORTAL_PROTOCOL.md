# Virtueller Stundenplan: Protokollstatus

Stand: September 2026. Die Integration ist **reverse-engineered und nicht offiziell dokumentiert**. Sie ist absichtlich ausschließlich an `virtueller-stundenplan.org` gebunden. Andere Schulportale oder Webseiten werden nicht unterstützt. Bei Abweichungen schlägt die Integration fehl, statt neue Parameter oder fremde Anbieter zu erraten.

## Beobachtete Anmeldung

Die öffentliche Startseite von `https://virtueller-stundenplan.org/` zeigt eine Anmeldung für Schülerinnen und Schüler mit **Benutzer/Mailadresse** und **Passwort** sowie einen separaten Office-365-Weg.

Ein existierender Open-Source-Client (`LarvenStein/better-stundenplan`) verwendet für die direkte Formularanmeldung:

- `POST https://virtueller-stundenplan.org/index.php`
- `Content-Type: application/x-www-form-urlencoded`
- `MAIL=<Benutzer oder Mailadresse>`
- `SCHUELERCODE=<Passwort>`
- `formAction=login`
- `formName` stammt aus dem versteckten Feld des aktuellen Formulars. Die ältere feste Kennung des Drittclients ist keine Grundlage für die Login-Erkennung.
- Sitzung über das vom Server gesetzte `PHPSESSID`-Cookie
- Weiterleitungen nach dem Login werden verfolgt

Die Korrektur auf Basis von 0.4.1 lädt vor jedem Login `/index.php` mit einer frischen, profilspezifischen Sitzung. Eine gemeinsame Formularanalyse sucht nach `MAIL` und `SCHUELERCODE` innerhalb desselben `<form>`; Kommentare und Skript-/Style-Inhalte zählen nicht als Formulare. Für die Anmeldung wird jedes gefundene Formular geprüft: `method=post`, HTTPS, exakt `virtueller-stundenplan.org`, Port leer oder 443, keine URL-Zugangsdaten, Pfad `/index.php`, keine Query und kein Fragment, genau ein verstecktes `formName`, dessen Wert dem Muster `^stacks_in_\d+(?:_page\d+)?$` entspricht, sowie ein verstecktes `formAction`.

Mehrere responsive Formularvarianten sind zulässig, wenn alle Prüfungen bestehen und sämtliche `formName`-Werte identisch sind. Kein passendes Formular, unterschiedliche Werte oder ein ungültiges Formular führen zu `PARSER_FEHLER`; es wird kein Passwort-POST gesendet. Nach dem POST müssen sowohl die HTTP-Antwort erfolgreich als auch ein Tagesplan lesbar sein.

xyz 0.4.2 unterstützt **nur diesen direkten Formularweg auf `virtueller-stundenplan.org`**. Office 365 wird nicht nachgebaut oder geraten. Portal-Redirects werden nur über HTTPS und nur innerhalb derselben Domain verfolgt; eine Weiterleitung auf eine andere Domain wird abgebrochen.

## Tagesplan

Der beobachtete Abruf eines Tagesplans ist:

```text
GET https://virtueller-stundenplan.org/page2/index.php?KlaBuDatum=TT.MM.JJJJ&HideChangesOff=1&CompactOff=1
```

Die Antwort ist HTML, kein JSON. Der Parser liest ausschließlich Text aus den Tabellen:

- `div[data-title=Fach] #editableTable`
- `div[data-title=LK] #editableTable`
- `div[data-title=Raum] #editableTable`

Pro Zeile werden Stundennummer und die zweite Tabellenzelle gelesen. `<br>`-getrennte Mehrfachwerte bleiben sichtbar. `<b>` wird nur als Änderungsmarkierung ausgewertet; fremdes HTML wird nie in die App-Oberfläche übernommen.

Der bekannte Wochenlink `/page-5/index.php?KlaBuDatum=...&RES=` wird **nicht** als Protokollgrundlage verwendet. Die Bedeutung von `RES` ist nicht ausreichend belegt und wird nicht geraten.

## Sicherheitsmodell in xyz

- Verbindung direkt vom Android-Gerät zu `virtueller-stundenplan.org` über HTTPS.
- Kein xyz-Server und kein eingebetteter GitHub- oder Portal-Token.
- Passwort und Benutzerkennung werden bei „angemeldet bleiben“ ausschließlich über `VPlanBridge.secureSet` im Android-Keystore-geschützten Speicher abgelegt.
- Zugangsdaten werden je xyz-Profil getrennt gespeichert.
- Session-Cookies werden je Profil getrennt gehalten, beim Abmelden verworfen und verbleiben im nativen Cookie-Container und werden nicht an JavaScript zurückgegeben.
- Portal-Tagesdaten werden getrennt von Planquellen und Merge-Regeln als lokaler Cache gespeichert.
- Dieser Cache wird nicht in normalen xyz-Backups aufgenommen.
- Beim Trennen werden gespeicherte Portal-Zugangsdaten und der lokale Portal-Cache entfernt.
- Keine TLS-Ausnahmen, kein Zertifikats-Bypass und kein Umgehen von CAPTCHA oder Rate-Limits.

## Robustheit

Die Planstruktur hat Vorrang vor dem Login-Template: Befindet sich `table#editableTable` innerhalb eines `div` mit `data-title=Fach`, `LK` oder `Raum`, gilt die Antwort nicht als Loginseite. Verschachtelte Wrapper und auch leere Tabellen werden dabei erkannt. Eine gleichnamige Tabelle außerhalb eines solchen Containers reicht nicht aus. Dieselbe Tabellenabgrenzung wird zum Lesen der Planzeilen verwendet.

Ohne Planstruktur gilt eine Seite nur dann als Loginseite, wenn ein Formular gemeinsam die Felder `MAIL` und `SCHUELERCODE` enthält. Einzelne Wörter, Überschriften oder feste Stack-Kennungen entscheiden nicht darüber. Eine echte Loginseite, HTTP 401/403 oder ein nicht aufgelöster Redirect führt zu `LOGIN_FEHLER`. Andere fehlerhafte HTTP-Statuswerte bleiben `HTTP_FEHLER`, auch wenn deren Fehlerseite ein Loginformular enthält. Bei einer unlesbaren Tabellenstruktur bleibt der letzte lokale Stand erhalten.

Im UI sind `LOGIN_FEHLER`, `PARSER_FEHLER`, `HTTP_FEHLER` mit numerischem HTTP-Status und `TIMEOUT` sichtbar. Parserfehler unterscheiden die Stufen **Formularsuche**, **Formularprüfung** und **Tabellenparser**; intern heißen sie `form-discovery`, `form-validation` und `table-parser`. Die Anzeige verwendet feste Meldungen und geprüfte Metadaten statt HTML-Inhalten, Zugangsdaten oder beliebigen Fehlermeldungen.

In 0.4.1 lassen sich die falsche Login-Erkennung einer Tagesseite mit Login-Template und die Ablehnung identischer Formular-Duplikate durch Fixtures reproduzieren. Eine Endlosschleife ist damit nicht nachgewiesen: Scheitert die erneute Anmeldung, beendet der vorhandene Fehlerpfad den Abruf.

Referenz für die beobachtete Drittclient-Implementierung:
[`authenticationProvider.dart` im Referenzprojekt Better Stundenplan](https://github.com/LarvenStein/better-stundenplan/blob/d095b06d1ebad13530c5b88d46e0cf57c9ff65d8/lib/providers/authenticationProvider.dart)

## Prüfung für 0.4.1 und Korrektur in 0.4.2

- Die vorhandene Fragment-Fixture aus dem öffentlichen Loginformular vom 14.09.2026 bleibt erhalten. Vier zusätzliche vollständige, synthetische Seiten enthalten ein eingebettetes Formular, identische responsive Duplikate, widersprüchliche Formularkennungen und eine Tagesseite mit zusätzlichem Login-Template. Alle Formularfelder sind leer; die Fixtures enthalten keine Kontodaten oder Cookies und sind keine aufgezeichneten authentifizierten Seiten.
- Die neuen VPlan-Tests 63–71 und UI-Tests 05–06 wurden vor der Implementierung ausgeführt und schlugen sämtlich fehl. Sie prüfen strukturelle Erkennung, identische und widersprüchliche Duplikate, Planvorrang, Abgrenzung von Tabellen, die drei Parserstufen, unveränderte Formular-Sicherheitsprüfungen, HTTP-Statusklassifizierung und sichere sichtbare Diagnosen. Bei bereits bestehender Ablehnung ungültiger Formulare war die fehlende Parserstufe das zuvor fehlschlagende Kriterium.
- Test 35 verwendet nur die beiden Formularfelder statt einer festen Stack-ID. Die bestehenden Tests für Loginseiten, mehrdeutige Formulare und HTTP-Fehler sind an die präzisierte Erkennung und Fehlerklassifizierung angepasst.
- JavaScript-Tests prüfen weiterhin Request-Reihenfolge, Wiederanmeldung und Profilbindung. `node source/werkzeug/pruefen.mjs` führt die statischen Prüfungen aus; `npm test --prefix source` führt die vollständige Testsuite aus.
- Native Java-Tests prüfen Cookie-Übernahme, Profiltrennung, HTTPS-/Hostgrenzen, Redirect-Methoden, Schleifen und Größenlimits über simulierte Verbindungen.
- CI prüft zusätzlich Android Lint, APK-Signatur, Manifest und Upgrade der bisherigen APK auf Android 35 mit Datenerhalt und App-Start.
- Ein erfolgreicher Login mit einem echten Schulkonto ist ohne bereitgestelltes Testkonto nicht überprüft.
