# Einkaufsroute – Hinweise für Claude

Einkaufsliste als iOS-taugliche PWA, die sich nach dem Laufweg durch einen Supermarkt sortiert. **Alle Texte in der App und alle Erklärungen auf Deutsch**, einfach und ohne Fachchinesisch. Zielgerät: iPhone (Safari/Home-Bildschirm), auch kleine Bildschirme wie das iPhone 13 mini.

## Technik
- Reines HTML/CSS/JavaScript, **kein Framework, kein Build-Schritt**. Soll so bleiben (läuft direkt auf GitHub Pages).
- `index.html` lädt `style.css`, die Programmdateien in `js/` (Reihenfolge wichtig), dann `config.js`, `sync.js`, `siri.js`, `teilen.js`. `sw.js` ist der Service Worker (Offline), `manifest.webmanifest` die PWA-Beschreibung.
- `js/`: Logik und Oberfläche, aufgeteilt nach Bereichen. Normale Skript-Dateien (keine Module), sie teilen sich den globalen Bereich:
  `grund.js` (Datenmodell im Kopfkommentar, Kategorien/Stichwörter, Vorschläge, gesprochene Eingabe `splitSpoken`, Speichern, Zustand) → `ansichten.js` (Sortierung, Liste, `render()`, Einstellungen) → `oberflaeche.js` (Grundgerüst: Sheets, Seiten, Tastatur, Hinweise) → `listen.js` (Listen verwalten, Eintrag-Sheet, Fotos) → `kategorien.js` → `geschaefte.js` (Übersicht, Grundriss zeichnen und bedienen, Bereiche) → `gesten.js` (Sheet-Wischen, Ziehen, Wackelmodus) → `ereignisse.js` (Abhaken, langes Drücken, Wischen, Hinzufügen `addText`, zentrale Klick-/Formular-Behandlung) → `essen.js` → `bedienung.js` (Aktualisieren, Darstellung, Haptik) → `listentypen.js` → `gruppen.js` → `hilfe.js` (Hilfe-Seite, Schalter „Hinweise anzeigen“: Bedienhinweise haben die Klasse `bedien`; Einführung `introCard` mit `ek_intro`; Seite „Über diese App“) → `spass.js` (Schalter 🎉: Konfetti bei leerer Liste, Kommentare, Sprüche ab 7× Würfeln; versteckte Statistik in `S.stats` nur auf dem Gerät, 7× auf die Versionsnummer tippen) → `historie.js` (Kaufhistorie `S.hist[g][key]` als Dokumente der Art `hist`, „Vielleicht fällig“ über der Einkaufsliste, Seite Einstellungen → Vorschläge mit Rhythmus `every` von Hand; ohne `historie.sql` lehnt der Server `hist` ab, dann `sync.noHist` bis zum Neustart) → `start.js` (Start, zuletzt).
  Was beim Laden sofort ausgeführt wird, darf nur Funktionen aus derselben oder einer früheren Datei aufrufen. Neue Dateien in `index.html`, `sw.js` (`FILES`), `tools/synctest.html` und `tools/errcheck.html` eintragen. Lokaler Ladetest: `tools/errcheck.html` sammelt Fehler beim Laden.
- `config.js`: Datenbank-Adresse und öffentlicher Schlüssel `EK`, auch für die Gast-Ansicht. `EK.hosts` = Web-Adressen, unter denen diese Datenbank benutzt wird (z. B. `si2po.github.io`, localhost); woanders ist `EK.off` gesetzt: `api()` wirft, Konto-Seite und Gast-Ansicht zeigen einen Hinweis, die App läuft nur auf dem Gerät. Neue eigene Domain = in `hosts` eintragen.
- `sync.js`: Konto (Passwort ändern, Benutzername, Konto löschen), Gruppen, Abgleich mit Supabase (nur über `fetch`, keine Bibliothek), Aufräumen, Sicherung als Datei/Text.
- `siri.js`: Siri-Eingang. Kurzbefehl ruft `siri_add` mit persönlichem Siri-Schlüssel auf (geht bei gesperrtem iPhone), Text landet in `siri_inbox` der Gruppe; `syncRun` holt ihn mit `siri_take` ab und trägt ihn per `addText(text, liste)` ein. Seite unter Konto und Gruppen → Siri. Ohne `siri.sql` → `siri.noSql`. Zusätzlich nimmt die App `?neu=…&liste=…` in der Adresse an (`addFromLink`).
- `teilen.js`: Liste per Link teilen (`shareBlock` in Liste bearbeiten, RPC `guest_link`/`guest_link_off`). Der Schlüssel steht als `l.share` in der Liste und wird mit abgeglichen. Gast-Ansicht: `gast.html` + `gast.js` (eigene Seite, nutzt nur `js/grund.js` + `config.js`, fasst lokale App-Daten nicht an; RPC `guest_get`, `guest_check`, `guest_add`, Schlüssel hinter dem `#`). Der Server rechnet Dokument-IDs mit `doc_uuid()` genau wie `docId()` in `sync.js`: beide immer gleich halten.
- `ueber.html`: „Über diese App“ (Hobbyprojekt, Datenschutz, Kontakt). Die Gast-Ansicht verlinkt die Datei direkt, die App zeigt ihre Abschnitte (`.abox`) als normale Unterseite (`aboutPage`). Bei neuen Datenorten oder Datenarten den Text dort anpassen.
- Lokal gespeichert wird in IndexedDB (Schlüssel `state`), Anmeldung und Abgleichstand unter `sync`, eine Sicherung unter `backup`. Neue Nutzer starten ohne Beispieldaten (`seed()`).

## Gruppen
- Eine **Gruppe** ist technisch ein `household`. Jede Person hat „Persönlich“ (`kind = 'personal'`, nicht teilbar) und beliebig viele weitere Gruppen.
- Gruppen sind „Teilen-Kreise“: Die App zeigt **immer alles** aus allen eigenen Gruppen. Listen, Geschäfte und Essen merken sich ihre Gruppe im Feld `g`.
- Kategorien/Stichwörter gibt es pro Gruppe. Aktiv ist die gewählte Stichwortliste: `S.cats` gehört zur Gruppe `S.catGroup`, die anderen liegen in `S.gcats[g]`, Einstellungen (Tags, zuletzt getippt) analog `S.customTags/S.recent` bzw. `S.gset[g]`.
- Neues landet in `S.lastGroup` (zuletzt benutzt), sonst `S.catGroup`, sonst „Persönlich“ (`defaultGroup()` in `js/gruppen.js`). Gruppen-Auswahlfelder und -Hinweise erscheinen nur bei Anmeldung und mehr als einer Gruppe (`groupsOn()`).
- Verwalter einer Gruppe = `group_owner(g)`: wer sie angelegt hat, sonst das älteste Mitglied. Nur der Verwalter lädt ein (`create_invite(g)`) und entfernt Mitglieder (`remove_member(g, mail)`); umbenennen dürfen alle.
- Benutzername optional: `user_metadata.name` beim Konto (PUT `/auth/v1/user`), Feld `accName` auf der Kontoseite; `my_groups` liefert `names` (E-Mail -> Name, sonst Teil vor dem @), Anzeige über `memberName()`. Angemeldet wird mit E-Mail.
- Datenbank-Funktionen: `my_groups` (mit `names`/`owner`/`mine`), `create_group`, `rename_group`, `create_invite(g)`, `remove_member`, `accept_invite`, `leave_group`, `delete_account`.

## Listen-Typen
- Pro Liste: `l.type = 'simple'` = einfache Liste (fehlt = Einkaufsliste). Einfache Liste: kein Geschäft, keine Kategorien/Vorschläge, Abschnitte `l.secs = [{id, name}]` (Eintrag: `it.sec`), eigene Reihenfolge `it.ord` (sonst `ts`), `l.keepDone` = Abgehakte bleiben stehen.
- Beide Listenarten zeigen ihre Einträge als eine Reihe `#listRows` (Köpfe `.secli` mit `data-key="§…"` + Zeilen), damit Halten-und-Ziehen (`holdDrag`, `WIGGLE.items`) ohne Umbau klappt. Einkaufsliste: `shopDrop()` lernt Kategorie bzw. festen Bereich. Essen-Favoriten = Tag `★` (`FAV`).
- Code in `js/listentypen.js` (`isSimple()`, `simpleBody()`). Abgleich braucht nichts Extra: neue Felder reisen im Listen-/Eintrag-Dokument mit.

## Abgleich (Kurzfassung)
- Jeder Laden, jede Kategorie, Liste, jeder Eintrag und jedes Essen ist ein Dokument in der Tabelle `docs` (Art `kind`), abgelegt in der Gruppe (`household_id`), zu der es gehört.
- Dokument-ID = SHA-256 aus Gruppe + Art + lokaler ID, als UUID formatiert. So müssen lokale IDs nie umgeschrieben werden. Verschieben in eine andere Gruppe = dort neues Dokument, im alten „weich“ gelöscht.
- Pro Gruppe ein eigener Abgleich-Stand `sync.gs[g] = { cursor, known, at }`. Durchgang (`syncRun`): Gruppenliste holen (`my_groups`), erst Änderungen aller Gruppen hochladen (Hash-Vergleich gegen `known`), dann je Gruppe Änderungen anderer holen. Bei gleichzeitiger Änderung gewinnt, wer zuletzt hochlädt. Gelöscht wird nur „weich“ (`deleted = true`); beim Anwenden einer Löschung wird nur entfernt, was hier noch in genau dieser Gruppe liegt.
- Aufräumen: `purge_deleted()` entfernt Löschmarkierungen nach 90 Tagen (App ruft es höchstens einmal am Tag auf), `known` vergisst Löschungen nach 100 Tagen, Geräte nach über 83 Tagen ohne Abgleich holen per `catchUpRows` einmal alle noch vorhandenen IDs.
- Der Server-Zeitstempel `updated_at` kommt von der Datenbank (Trigger). Abfrage mit `gte` auf den letzten Stand.
- Abfrage alle 10 s bei geöffneter App, beim Öffnen, bei Online. Kein Live-Push.
- Erster Abgleich einer Gruppe: Hat der Server dort schon Daten, werden sie übernommen. Neues Gerät/neue Anmeldung: noch keiner Gruppe zugeordnete Daten werden durch die vom Server ersetzt, falls der Server etwas hat (Sicherung unter `backup`), sonst landen sie in „Persönlich“.
- Stand von vor den Gruppen (`sync` mit `hid`, ohne `gs`): wird beim Start einmalig übernommen, alles gehört dann zur bisherigen Gruppe (`sync.legacyHid`).
- Lokal testen ohne echte Datenbank: `tools/synctest.html` (nachgebaute Datenbank, mehrere Geräte nachspielbar) mit `tools/shot.ps1` (unsichtbares Chrome, Bildschirmfotos). Beides nur lokal.

## Datenbank (Supabase)
- `supabase/komplett.sql` = ganze Datenbank auf aktuellem Stand (nur für neue, leere Projekte). `supabase/schritte/` = Änderungen an der bestehenden Datenbank in Ausführungsreihenfolge (Tabelle in `supabase/ANLEITUNG.md`). **Jede Schema-Änderung in beide:** neue kleine Schritt-Datei mit `create or replace`/`if not exists` UND dieselbe Änderung in `komplett.sql`; Zeile in der Tabelle der ANLEITUNG ergänzen.
- `supabase/passwort_setzen.sql`: Vorlage, um ein vergessenes Passwort neu zu setzen (die App verschickt keine Mails; „Confirm email“ ist aus).
- Änderungen am Schema laufen **nicht automatisch**: Das SQL muss im Supabase-SQL-Editor ausgeführt werden. Neue Änderungen deshalb als eigene, kleine SQL-Datei bereitstellen und erklären.
- In Funktionen mit `set search_path = public` keine Funktionen aus der Erweiterung `pgcrypto` benutzen (nicht gefunden). `gen_random_uuid()` und `sha256()` sind eingebaut.
- Zugriffsschutz über Row Level Security; Tabellen ohne Policy sind nur über Funktionen erreichbar. Der Schlüssel in `config.js` ist der öffentliche Publishable-Key und darf im Code stehen. **Niemals** `service_role`/Secret-Key oder Datenbank-Passwort einchecken.

## Beim Ändern beachten
- Bei jeder Veröffentlichung in `sw.js` die Version in `CACHE` erhöhen (Bündel: dritte Stelle, z. B. `v0.8.1` → `v0.8.2`; kleine Korrektur: vierte Stelle `v0.8.1.1`, darf sofort hochgeladen werden; größere Schritte nach Absprache). Neue Dateien in `FILES` aufnehmen, sonst zeigt das iPhone die alte Version. Die App liest die Nummer aus dem Cache-Namen und zeigt sie unten in den Einstellungen an; sie steht also nur in `sw.js`.
- Vor jeder neuen Version mit neuer dritter Stelle den Projekt-Skill `code-simplifier` über alle Änderungen seit dem letzten Durchlauf laufen lassen.
- Änderungen an Daten, die abgeglichen werden, müssen `save()` oder `commit()` aufrufen (löst den Abgleich aus).
- Neue Datenarten brauchen eine eigene `kind` (Check-Constraint `docs_kind_check`: in `komplett.sql` und als neuer Schritt) und Behandlung in `buildDocs` / `applyRows` in `sync.js`.
- Eingabefelder mit mindestens 16 px Schrift (sonst zoomt iOS). Bedienung muss mit einer Hand und im Laden funktionieren: einfach auf den ersten Blick, Erweitertes hinter langem Drücken, Wischen oder Menüs.
- Lokal ansehen: Doppelklick auf `lokal-starten.cmd` (PowerShell-Webserver `tools/server.ps1`, kein Python/Node nötig; beide stehen in `.gitignore`) → http://localhost:8080. Auf localhost ist der Service Worker abgeschaltet, Neuladen zeigt sofort den neuen Stand. Lokal hat die App eigene Daten; wer sich anmeldet, gleicht aber mit der echten Datenbank ab.
- Git: Änderungen lokal auf `main` committen, **erst hochladen (push), wenn es ausdrücklich gewünscht ist** (Push = Veröffentlichung auf GitHub Pages). Die Version in `sw.js` beim Bündel vor dem Push einmal erhöhen.

## Stand
Offene Ideen stehen in `TODO.md`.
