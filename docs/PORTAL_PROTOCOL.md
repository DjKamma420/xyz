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
- `formName=stacks_in_368_page1`
- Sitzung über das vom Server gesetzte `PHPSESSID`-Cookie
- Weiterleitungen nach dem Login werden verfolgt

xyz 0.4.1 unterstützt **nur diesen direkten Formularweg auf `virtueller-stundenplan.org`**. Office 365 wird nicht nachgebaut oder geraten. Portal-Redirects werden nur über HTTPS und nur innerhalb derselben Domain verfolgt; eine Weiterleitung auf eine andere Domain wird abgebrochen.

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
- Session-Cookies verbleiben im nativen Cookie-Container und werden nicht an JavaScript zurückgegeben.
- Portal-Tagesdaten werden getrennt von Planquellen und Merge-Regeln als lokaler Cache gespeichert.
- Dieser Cache wird nicht in normalen xyz-Backups aufgenommen.
- Beim Trennen werden gespeicherte Portal-Zugangsdaten und der lokale Portal-Cache entfernt.
- Keine TLS-Ausnahmen, kein Zertifikats-Bypass und kein Umgehen von CAPTCHA oder Rate-Limits.

## Robustheit

Wenn die Tagesseite wieder auf eine Login-Seite oder einen Redirect zurückfällt, gilt die Sitzung als ungültig. Bei geänderter HTML-Struktur wird nichts geraten; der Parser meldet einen Fehler und behält den letzten gültigen lokalen Stand.

Referenz für die beobachtete Drittclient-Implementierung:
`https://github.com/LarvenStein/better-stundenplan`
