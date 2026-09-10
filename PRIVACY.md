# Datenschutz

## Local-First

Stundenplan, Einträge, Noten, Fehlzeiten, Profile, Planquellen und Merge-Regeln werden lokal auf dem Gerät gespeichert. Es gibt kein Benutzerkonto, keine Analytics, keine Werbung und keinen eigenen Backendserver.

## OpenHolidaysAPI

Die bestehende optionale Ferienfunktion kann `openholidaysapi.org` abfragen. Dabei werden die technisch nötigen Angaben wie Bundesland und Zeitraum an diesen Dienst übertragen.

## Virtueller Stundenplan

Nur wenn der Benutzer die Funktion ausdrücklich einrichtet, verbindet sich die Android-App direkt mit der konfigurierten Schul-/Portaladresse. Technisch können dabei Benutzername, Anmeldedaten, Sessioninformationen, notwendige Portalparameter und die IP-Adresse gegenüber dem Portalserver verarbeitet werden.

Empfänger ist ausschließlich der vom Benutzer konfigurierte Portalserver. Es gibt keinen eigenen Proxyserver.

Passwörter, Auth-Tokens und vergleichbare Geheimnisse werden nicht im normalen `localStorage`, nicht im normalen App-Backup und nicht in Produktionslogs gespeichert. Die Android-Implementierung verwendet dafür geschützten nativen Speicher auf Basis des Android Keystore.

Temporäre Vertretungsdaten und Netzwerkcaches gehören nicht zum regulären vollständigen Backup.

## Backups

Backups können persönliche Schul- und Leistungsdaten enthalten. Zugangsdaten, Auth-Tokens und Session-Cookies sind ausdrücklich ausgeschlossen.
