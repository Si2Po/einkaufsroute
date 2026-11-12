# Plan: Gruppen

Stand: 12.11.2026 · Status: **abgestimmt, Umsetzung läuft** (Schritt 1: SQL liegt in `supabase/gruppen.sql`)

## Grundidee
Gruppen sind **Teilen-Kreise**, keine Bereiche, zwischen denen man wechselt. Man sieht immer **alles**
aus allen eigenen Gruppen. Die Gruppe regelt nur, **wer etwas mitsieht**.
- **Persönlich**: gehört nur dir, entsteht automatisch, kann nicht geteilt oder verlassen werden.
- **Weitere Gruppen**: z. B. „Einkauf“ (mit Partnerin/Partner geteilt). Name jederzeit änderbar.
- Gruppen verwaltet man in den **Einstellungen**: anlegen, umbenennen, Mitglieder sehen, einladen, beitreten, austreten.

## Was gehört wozu?
- **Listen**: jede Liste gehört zu genau **einer** Gruppe. Alle Listen erscheinen zusammen (kleiner Hinweis „Einkauf“).
  In der Listenauswahl lässt sich eine Liste in eine andere Gruppe verschieben.
- **Geschäfte**: jedes gehört einer Gruppe; man sieht alle und kann jedes für jede Liste wählen.
  Liegt das gewählte Geschäft nicht in der Gruppe der Liste, fragt die App einmal:
  „Geschäft in die Gruppe der Liste verschieben, damit alle danach sortieren können?“ (optional, verschieben statt kopieren).
- **Essen**: wie Geschäfte – jedes gehört einer Gruppe, man sieht alle, Gruppe beim Bearbeiten änderbar.
- **Kategorien und Stichwörter**: gibt es pro Gruppe. In den Einstellungen wählt jede Person:
  „Kategorien und Stichwörter von: [Gruppe]“. Diese eine Stichwortliste nutzt die App für Einordnen, Sortieren
  und Lernen. Wählen mehrere Personen dieselbe Gruppe, lernen sie gemeinsam.
  Die Standard-Kategorien haben überall dieselbe Kennung, deshalb passt die Sortierung auch über Gruppen hinweg.
  Eigene Kategorien gibt es nur in der Gruppe, in der sie angelegt wurden.
- **Neues anlegen** (Liste, Geschäft, Essen): Feld „Gruppe“, vorausgewählt die zuletzt benutzte.
- **Beitreten ersetzt nichts mehr**: die neue Gruppe kommt einfach dazu.
- Ohne Konto gibt es nur „Persönlich“ auf dem Gerät.

## Umstellung bestehender Daten (macht `gruppen.sql`)
- Geteilter Haushalt (mehrere Mitglieder) → Gruppe **„Einkauf“** (alles bleibt drin, beide bleiben Mitglied).
- Haushalt, in dem jemand allein ist → wird **„Persönlich“**.
- Wer danach noch kein „Persönlich“ hat, bekommt ein neues (leer).
- Die bisherige App-Version läuft nach dem SQL unverändert weiter.

## Technik (App)
- Die App hält die Daten **aller** Gruppen gleichzeitig (jedes Ding merkt sich seine Gruppe) und gleicht jede Gruppe
  einzeln mit dem Server ab. Verschieben in eine andere Gruppe = dort neu anlegen, in der alten weich löschen.
- Die Dokument-Kennung bleibt „Gruppe + Art + lokale ID“, lokale IDs ändern sich nie.

## Reihenfolge
1. ✅ SQL (`supabase/gruppen.sql`) – vom Besitzer in Supabase auszuführen.
2. App: Abgleich für mehrere Gruppen, alles bekommt eine Gruppe, Anzeige über alle Gruppen.
3. App: Einstellungen → Gruppen (anlegen, umbenennen, einladen, beitreten, austreten) + Auswahl der Stichwortliste.
4. App: Gruppe bei Listen/Geschäften/Essen wählen und verschieben, Nachfrage beim Geschäft.
5. Test mit Test-Konto, dann bei euch.
6. Später: Gruppentyp „Einfache Listen“.
