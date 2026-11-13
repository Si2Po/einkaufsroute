# Einkaufsroute – Hinweise für Claude

Einkaufsliste als iOS-taugliche PWA, die sich nach dem Laufweg durch einen Supermarkt sortiert. Der Besitzer ist Anfänger und spricht Deutsch: **alle Texte in der App und alle Erklärungen auf Deutsch**, einfach und ohne Fachchinesisch. Hauptgerät: iPhone 13 mini (Safari/Home-Bildschirm).

## Technik
- Reines HTML/CSS/JavaScript, **kein Framework, kein Build-Schritt**. Soll so bleiben (läuft direkt auf GitHub Pages).
- `index.html` lädt `style.css`, die Programmdateien in `js/` (Reihenfolge wichtig) und `sync.js`. `sw.js` ist der Service Worker (Offline), `manifest.webmanifest` die PWA-Beschreibung.
- `js/`: Logik und Oberfläche, aufgeteilt nach Bereichen. Normale Skript-Dateien (keine Module), sie teilen sich den globalen Bereich:
  `grund.js` (Datenmodell im Kopfkommentar, Kategorien/Stichwörter, Vorschläge, Speichern, Zustand) → `ansichten.js` (Sortierung, Liste, `render()`, Einstellungen) → `oberflaeche.js` (Grundgerüst: Sheets, Seiten, Tastatur, Hinweise) → `listen.js` (Listen verwalten, Eintrag-Sheet, Fotos) → `kategorien.js` → `geschaefte.js` (Übersicht, Grundriss zeichnen und bedienen, Bereiche) → `gesten.js` (Sheet-Wischen, Ziehen, Wackelmodus) → `ereignisse.js` (Abhaken, langes Drücken, Wischen, zentrale Klick-/Formular-Behandlung) → `essen.js` → `bedienung.js` (Aktualisieren, Darstellung, Haptik) → `listentypen.js` → `gruppen.js` → `start.js` (Start, zuletzt).
  Was beim Laden sofort ausgeführt wird, darf nur Funktionen aus derselben oder einer früheren Datei aufrufen. Neue Dateien in `index.html`, `sw.js` (`FILES`) und `tools/synctest.html` eintragen. Lokaler Ladetest: `tools/errcheck.html` sammelt Fehler beim Laden.
- `sync.js`: Konto, Haushalt, Abgleich mit Supabase (nur über `fetch`, keine Bibliothek), Sicherung als Datei/Text.
- Lokal gespeichert wird in IndexedDB (Schlüssel `state`), Anmeldung und Abgleichstand unter `sync`, eine Sicherung unter `backup`.

## Gruppen (seit 0.7.0, Details in `PLAN-GRUPPEN.md`)
- Eine **Gruppe** ist technisch ein `household`. Jede Person hat „Persönlich“ (`kind = 'personal'`, nicht teilbar) und beliebig viele weitere Gruppen.
- Gruppen sind „Teilen-Kreise“: Die App zeigt **immer alles** aus allen eigenen Gruppen. Listen, Geschäfte und Essen merken sich ihre Gruppe im Feld `g`.
- Kategorien/Stichwörter gibt es pro Gruppe. Aktiv ist die gewählte Stichwortliste: `S.cats` gehört zur Gruppe `S.catGroup`, die anderen liegen in `S.gcats[g]`, Einstellungen (Tags, zuletzt getippt) analog `S.customTags/S.recent` bzw. `S.gset[g]`.
- Neues landet in `S.lastGroup` (zuletzt benutzt), sonst `S.catGroup`, sonst „Persönlich“ (`defaultGroup()` in `js/gruppen.js`). Gruppen-Auswahlfelder und -Hinweise erscheinen nur bei Anmeldung und mehr als einer Gruppe (`groupsOn()`).
- Datenbank-Funktionen: `my_groups`, `create_group`, `rename_group`, `create_invite(g)`, `accept_invite`, `leave_group` (alle in `supabase/gruppen.sql`).

## Listen-Typen (seit 0.7.1)
- Pro Liste: `l.type = 'simple'` = einfache Liste (fehlt = Einkaufsliste). Einfache Liste: kein Geschäft, keine Kategorien/Vorschläge, Abschnitte `l.secs = [{id, name}]` (Eintrag: `it.sec`), eigene Reihenfolge `it.ord` (sonst `ts`), `l.keepDone` = Abgehakte bleiben stehen.
- Beide Listenarten zeigen ihre Einträge als eine Reihe `#listRows` (Köpfe `.secli` mit `data-key="§…"` + Zeilen), damit Halten-und-Ziehen (`holdDrag`, `WIGGLE.items`) ohne Umbau klappt. Einkaufsliste: `shopDrop()` lernt Kategorie bzw. festen Bereich. Essen-Favoriten = Tag `★` (`FAV`).
- Code in `js/listentypen.js` (`isSimple()`, `simpleBody()`). Abgleich braucht nichts Extra: neue Felder reisen im Listen-/Eintrag-Dokument mit.

## Abgleich (Kurzfassung)
- Jeder Laden, jede Kategorie, Liste, jeder Eintrag und jedes Essen ist ein Dokument in der Tabelle `docs` (Art `kind`), abgelegt in der Gruppe (`household_id`), zu der es gehört.
- Dokument-ID = SHA-256 aus Gruppe + Art + lokaler ID, als UUID formatiert. So müssen lokale IDs nie umgeschrieben werden. Verschieben in eine andere Gruppe = dort neues Dokument, im alten „weich“ gelöscht.
- Pro Gruppe ein eigener Abgleich-Stand `sync.gs[g] = { cursor, known }`. Durchgang (`syncRun`): Gruppenliste holen (`my_groups`), erst Änderungen aller Gruppen hochladen (Hash-Vergleich gegen `known`), dann je Gruppe Änderungen anderer holen. Bei gleichzeitiger Änderung gewinnt, wer zuletzt hochlädt. Gelöscht wird nur „weich“ (`deleted = true`); beim Anwenden einer Löschung wird nur entfernt, was hier noch in genau dieser Gruppe liegt.
- Der Server-Zeitstempel `updated_at` kommt von der Datenbank (Trigger). Abfrage mit `gte` auf den letzten Stand.
- Abfrage alle 10 s bei geöffneter App, beim Öffnen, bei Online. Kein Live-Push.
- Erster Abgleich einer Gruppe: Hat der Server dort schon Daten, werden sie übernommen. Neues Gerät/neue Anmeldung: noch keiner Gruppe zugeordnete Daten werden durch die vom Server ersetzt, falls der Server etwas hat (Sicherung unter `backup`), sonst landen sie in „Persönlich“.
- Stand von vor den Gruppen (`sync` mit `hid`, ohne `gs`): wird beim Start einmalig übernommen, alles gehört dann zur bisherigen Gruppe (`sync.legacyHid`).
- Lokal testen ohne echte Datenbank: `tools/synctest.html` (nachgebaute Datenbank, mehrere Geräte nachspielbar) mit `tools/shot.ps1` (unsichtbares Chrome, Bildschirmfotos). Beides nur lokal.

## Datenbank (Supabase)
- Dateien in `supabase/`: `schema.sql` (Grundaufbau), `fix_invite.sql` (Korrektur), `gruppen.sql` (Gruppen, ausgeführt am 12.11.2026), `ANLEITUNG.md`.
- Änderungen am Schema laufen **nicht automatisch**: Der Besitzer muss das SQL im Supabase-SQL-Editor ausführen. Neue Änderungen deshalb als eigene, kleine SQL-Datei mit `create or replace` bereitstellen und erklären.
- In Funktionen mit `set search_path = public` keine Funktionen aus der Erweiterung `pgcrypto` benutzen (nicht gefunden). `gen_random_uuid()` ist eingebaut.
- Zugriffsschutz über Row Level Security. Der Schlüssel in `sync.js` ist der öffentliche Publishable-Key und darf im Code stehen. **Niemals** `service_role`/Secret-Key oder Datenbank-Passwort einchecken.

## Beim Ändern beachten
- Bei jeder Veröffentlichung in `sw.js` die Version in `CACHE` erhöhen (Bündel: `v0.6.5` → `v0.6.6`; kleine Korrektur: vierte Stelle `v0.6.5.1`, darf sofort gepusht werden; größere Schritte nach Absprache `v0.7.0`). Neue Dateien in `FILES` aufnehmen. Sonst zeigt das iPhone die alte Version. Die App liest die Nummer aus dem Cache-Namen und zeigt sie unten in den Einstellungen an; sie steht also nur in `sw.js`.
- Änderungen an Daten, die abgeglichen werden, müssen `save()` oder `commit()` aufrufen (löst den Abgleich aus).
- Neue Datenarten brauchen eine eigene `kind` (Check-Constraint in `schema.sql`) und Behandlung in `buildDocs` / `applyRows` in `sync.js`.
- Eingabefelder mit mindestens 16 px Schrift (sonst zoomt iOS). Bedienung muss mit einer Hand und im Laden funktionieren: einfach auf den ersten Blick, Erweitertes hinter langem Drücken, Wischen oder Menüs.
- Lokal ansehen: Doppelklick auf `lokal-starten.cmd` (PowerShell-Webserver `tools/server.ps1`, kein Python/Node nötig; beide stehen in `.gitignore` und werden nicht hochgeladen) → http://localhost:8080. Auf localhost ist der Service Worker abgeschaltet, Neuladen zeigt sofort den neuen Stand. Lokal hat die App eigene Daten; wer sich anmeldet, gleicht aber mit dem echten Haushalt ab.
- Git: Änderungen lokal auf `main` committen, **erst pushen, wenn der Besitzer es sagt** (Push = Veröffentlichung auf GitHub Pages). Die Version in `sw.js` beim Bündel vor dem Push einmal erhöhen.

## Stand und Pläne
Siehe `TODO.md` (Merkliste mit Reihenfolge der nächsten Schritte). Grober Plan: Alltagstauglichkeit (iPhone-Rand, Tastatur, Icon) → einheitliche Oberfläche (Seiten/Sheets, Übergänge, Design) → Gruppen → Weiteres.
