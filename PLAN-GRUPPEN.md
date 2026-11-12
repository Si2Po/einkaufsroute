# Plan: Gruppen

Stand: 12.11.2026 · Status: **Entwurf, noch nicht umgesetzt**

## Ziel
Ein Konto kann in mehreren **Gruppen** sein. Jede Gruppe hat eigene Listen, Kategorien, Geschäfte, Essen und Mitglieder.
- **Persönlich**: gehört nur dir, entsteht automatisch, kann nicht geteilt oder verlassen werden.
- **Weitere Gruppen**: z. B. „Einkaufen“ (mit Partnerin/Partner geteilt) oder „Baumarkt-Projekt“, „Filme“.

## Was sich für dich ändert (Bedienung)
- **Liste wählen = Gruppe wählen.** Der zweite Tipp auf „Liste“ zeigt alle Listen, nach Gruppen sortiert
  (Überschrift je Gruppe). Wählst du eine Liste, wird ihre Gruppe aktiv.
- **Alles andere folgt der aktiven Gruppe**: Essen, Geschäfte, Kategorien, Stichwörter.
- **Einstellungen → Gruppen** (ersetzt „Konto und Haushalt“): Gruppen anlegen, umbenennen, Mitglieder sehen,
  einladen, beitreten, verlassen. Darunter das Konto (Anmelden/Abmelden) und „Daten sichern“.
- **Typ einer Gruppe**: „Einkaufen“ (mit Geschäften, Laufweg und Essen) oder „Einfache Listen“ (nur Listen und
  Kategorien). Bei „Einfache Listen“ werden Essen und Geschäfte ausgeblendet.
- **Beitreten ersetzt nichts mehr.** Heute werden beim Beitreten die eigenen Daten durch die des Haushalts ersetzt.
  Künftig kommt die neue Gruppe einfach dazu, deine anderen Gruppen bleiben unberührt.
- Ohne Konto gibt es nur „Persönlich“ (auf dem Gerät). Gruppen zum Teilen brauchen ein Konto.

## Was mit deinen heutigen Daten passiert (Umstellung)
- **Heutiger Haushalt, den du mit jemandem teilst** → wird die Gruppe **„Einkaufen“** (Typ Einkaufen).
  Alles bleibt drin, ihr seid weiter beide Mitglied.
- **Jede Person bekommt zusätzlich „Persönlich“** (anfangs leer, mit Standard-Kategorien).
- **Haushalt, in dem nur du bist** → wird direkt zu „Persönlich“.
- Vor der Umstellung legt die App automatisch eine Sicherung an (wie heute bei „Sicherung laden“).

## Datenbank (Supabase) – was ich vorbereite, du führst es einmal aus
Eine neue Datei `supabase/gruppen.sql` (nur Ergänzungen, nichts wird gelöscht):
1. Tabelle `households` bekommt zwei Spalten: `kind` (`personal` / `shopping` / `simple`) und den Namen nutzen wir schon.
2. Umstellung bestehender Haushalte (siehe oben) per SQL, inkl. „Persönlich“ für alle, die keins haben.
3. Neue Funktionen:
   - `create_group(name, kind)` – Gruppe anlegen (du bist Mitglied)
   - `create_invite(group)` – Einladung **für eine bestimmte Gruppe** (bei „Persönlich“ verboten)
   - `accept_invite(code)` – tritt der Gruppe bei, **ohne** etwas zu ersetzen
   - `leave_group(group)` – verlassen (bei „Persönlich“ verboten; letzte Person → Gruppe wird gelöscht)
   - `rename_group(group, name)`
4. Bei neuen Konten entsteht automatisch „Persönlich“ (statt „Mein Haushalt“).
Die Zugriffsregeln (wer was sehen darf) bleiben wie sie sind: Man sieht die Daten jeder Gruppe, in der man Mitglied ist.

## App (technisch, Kurzfassung)
- Pro Gruppe ein eigener Datenstand auf dem Gerät (IndexedDB `state:<gruppe>`), ein eigener Abgleich-Stand.
- Im Speicher ist immer nur die aktive Gruppe geladen (wie heute). Wechseln = speichern, andere Gruppe laden, neu zeichnen.
- Abgleich: aktive Gruppe wie heute alle 10 s; die anderen Gruppen seltener (beim Öffnen der Listenauswahl und jede Minute),
  damit offene Einträge und Listennamen dort aktuell sind.
- Eine kleine Übersicht (Gruppen, ihre Listen, Anzahl offen) wird für die Listenauswahl mitgeführt.

## Reihenfolge der Umsetzung
1. SQL-Datei schreiben und erklären → du führst sie in Supabase aus (vorher zeige ich dir, wie man eine Sicherung macht).
2. App: Datenstand pro Gruppe, Wechsel über die Listenauswahl (zuerst nur mit vorhandenen Gruppen).
3. App: Einstellungen → Gruppen (anlegen, einladen, beitreten, verlassen, umbenennen).
4. App: Gruppentyp „Einfache Listen“ (Essen/Geschäfte ausblenden).
5. Umstellung testen: zuerst lokal mit einem Test-Konto, dann bei euch.

## Offene Fragen an dich
- Passt „Liste wählen = Gruppe wählen“, oder lieber einen eigenen Gruppen-Schalter (z. B. oben in der Liste)?
- Name für die geteilte Gruppe nach der Umstellung: „Einkaufen“ oder „Haushalt“?
- Brauchen wir den Typ „Einfache Listen“ gleich, oder reicht erst einmal „Einkaufen“ für alle Gruppen?
