# Einkaufsroute – Hinweise für Claude

Einkaufsliste als iOS-taugliche PWA, die sich nach dem Laufweg durch einen Supermarkt sortiert. Der Besitzer ist Anfänger und spricht Deutsch: **alle Texte in der App und alle Erklärungen auf Deutsch**, einfach und ohne Fachchinesisch. Hauptgerät: iPhone 13 mini (Safari/Home-Bildschirm).

## Technik
- Reines HTML/CSS/JavaScript, **kein Framework, kein Build-Schritt**. Soll so bleiben (läuft direkt auf GitHub Pages).
- `index.html` lädt `style.css`, `app.js`, `sync.js`. `sw.js` ist der Service Worker (Offline), `manifest.webmanifest` die PWA-Beschreibung.
- `app.js`: gesamte Logik und Oberfläche (Liste, Essen, Läden/Zonen-Editor, Einstellungen, Wischen, Sheets). Der Aufbau der Daten steht im Kommentar ganz oben.
- `sync.js`: Konto, Haushalt, Abgleich mit Supabase (nur über `fetch`, keine Bibliothek), Sicherung als Datei/Text.
- Lokal gespeichert wird in IndexedDB (Schlüssel `state`), Anmeldung und Abgleichstand unter `sync`, eine Sicherung unter `backup`.

## Abgleich (Kurzfassung)
- Jeder Laden, jede Kategorie, Liste, jeder Eintrag und jedes Essen ist ein Dokument in der Tabelle `docs` (Art `kind`).
- Dokument-ID = SHA-256 aus Haushalt + Art + lokaler ID, als UUID formatiert. So müssen lokale IDs nie umgeschrieben werden.
- Durchgang: erst Änderungen hochladen (Hash-Vergleich gegen `sync.known`), dann Änderungen anderer holen. Bei gleichzeitiger Änderung gewinnt, wer zuletzt hochlädt. Gelöscht wird nur „weich“ (`deleted = true`).
- Der Server-Zeitstempel `updated_at` kommt von der Datenbank (Trigger). Abfrage mit `gte` auf den letzten Stand.
- Abfrage alle 10 s bei geöffneter App, beim Öffnen, bei Online. Kein Live-Push.
- Beim ersten Abgleich eines Geräts gilt: Hat der Server schon Daten, ersetzen sie die lokalen (Sicherung bleibt unter `backup`).

## Datenbank (Supabase)
- Dateien in `supabase/`: `schema.sql` (komplett), `fix_invite.sql` (Korrektur), `ANLEITUNG.md`.
- Änderungen am Schema laufen **nicht automatisch**: Der Besitzer muss das SQL im Supabase-SQL-Editor ausführen. Neue Änderungen deshalb als eigene, kleine SQL-Datei mit `create or replace` bereitstellen und erklären.
- In Funktionen mit `set search_path = public` keine Funktionen aus der Erweiterung `pgcrypto` benutzen (nicht gefunden). `gen_random_uuid()` ist eingebaut.
- Zugriffsschutz über Row Level Security. Der Schlüssel in `sync.js` ist der öffentliche Publishable-Key und darf im Code stehen. **Niemals** `service_role`/Secret-Key oder Datenbank-Passwort einchecken.

## Beim Ändern beachten
- Bei jeder Veröffentlichung in `sw.js` die Version in `CACHE` erhöhen (`einkaufsroute-v0.6.1` → `v0.6.2`; größere Schritte nach Absprache `v0.7.0`). Neue Dateien in `FILES` aufnehmen. Sonst zeigt das iPhone die alte Version. Die App liest die Nummer aus dem Cache-Namen und zeigt sie unten in den Einstellungen an; sie steht also nur in `sw.js`.
- Änderungen an Daten, die abgeglichen werden, müssen `save()` oder `commit()` aufrufen (löst den Abgleich aus).
- Neue Datenarten brauchen eine eigene `kind` (Check-Constraint in `schema.sql`) und Behandlung in `buildDocs` / `applyRows` in `sync.js`.
- Eingabefelder mit mindestens 16 px Schrift (sonst zoomt iOS). Bedienung muss mit einer Hand und im Laden funktionieren: einfach auf den ersten Blick, Erweitertes hinter langem Drücken, Wischen oder Menüs.
- Lokal testen: Ordner mit einem kleinen Webserver ausliefern (z. B. `python -m http.server`) und auf `localhost` öffnen. Service Worker dort ggf. in den Browser-Werkzeugen abschalten oder die Cache-Version erhöhen.

## Stand und Pläne
Siehe `TODO.md` (Merkliste mit Reihenfolge der nächsten Schritte). Grober Plan: Alltagstauglichkeit (iPhone-Rand, Tastatur, Icon) → einheitliche Oberfläche (Seiten/Sheets, Übergänge, Design) → Gruppen → Weiteres.
