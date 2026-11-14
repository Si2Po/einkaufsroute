# Einkaufsroute

Eine Einkaufsliste fürs iPhone (als Web-App zum Home-Bildschirm hinzufügen), die sich nach dem Laufweg durch den Supermarkt sortiert.

- Einträge werden automatisch Kategorien zugeordnet und nach den Bereichen deines Geschäfts sortiert.
- Mehrere Listen, auch einfache Listen (z. B. Packlisten) mit Abschnitten.
- Essen mit Zutaten, die mit einem Tipp auf die Liste kommen.
- Gruppen zum gemeinsamen Einkaufen, Abgleich zwischen Geräten, funktioniert auch offline.
- Hinzufügen per Siri-Kurzbefehl (auch bei gesperrtem iPhone), Listen per Link mit Leuten ohne Konto teilen.
- Vorschläge für regelmäßig gekaufte Produkte.

Ein privates Hobbyprojekt, komplett mit [Claude Code](https://claude.com/claude-code) geschrieben. Nutzung ohne Gewähr.

## Selbst betreiben
Reines HTML/CSS/JavaScript ohne Build-Schritt. Kostenlos betreibbar mit **GitHub Pages** (App) und **Supabase** (Datenbank und Anmeldung):

1. Dieses Repository kopieren (Fork) und GitHub Pages für den Branch `main` einschalten.
2. Ein Supabase-Projekt anlegen und `supabase/komplett.sql` im SQL-Editor ausführen. Schritt für Schritt: [`supabase/ANLEITUNG.md`](supabase/ANLEITUNG.md), Teil B.
3. In `config.js` die Adresse (`url`) und den Publishable-Key (`key`) des eigenen Supabase-Projekts eintragen und unter `hosts` die eigene Web-Adresse (z. B. `name.github.io`). Läuft die App unter einer Adresse, die dort nicht steht, arbeitet sie nur auf dem Gerät.
4. Bei Änderungen die Versionsnummer in `sw.js` (`CACHE`) erhöhen, damit installierte Apps die neue Version laden.

Ohne Supabase läuft die App auch nur lokal auf dem Gerät (ohne Konto, Gruppen und Abgleich).
