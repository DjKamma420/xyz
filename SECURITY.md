# Sicherheit

## Grundregeln

- keine Zugangsdaten im Repository, in Issues oder Logs
- keine TLS-Ausnahmen
- kein CAPTCHA-, Login-, Rechte- oder Rate-Limit-Umgehen
- keine fremden Klassen oder Admin-Endpunkte auslesen
- Portaltexte immer als unsichere Daten behandeln
- kein rohes `innerHTML` mit Portalantworten
- kein eigener Proxyserver

## Virtueller Stundenplan

Die Integration automatisiert ausschließlich den legitimen Zugriff des jeweiligen Benutzers. Das konkrete Portalprotokoll wird erst anhand anonymisierter Netzwerkdaten implementiert.

Für Analysen ausschließlich anonymisierte HAR-Dateien, Requests, Responses oder Mockdaten verwenden. Echte Passwörter gehören nur in die lokale Loginmaske der App.
