# Datenbank (Supabase)

In diesem Ordner:
- **`komplett.sql`**: die ganze Datenbank in einer Datei, auf dem aktuellen Stand. Nur für ein **neues, leeres** Projekt.
- **`schritte/`**: die einzelnen Änderungen in der Reihenfolge, in der sie an der bestehenden Datenbank ausgeführt wurden.
- **`passwort_setzen.sql`**: Vorlage, wenn jemand sein Passwort vergessen hat.

## A. Bestehende Datenbank (das echte Projekt)
Alle Schritte sind ausgeführt. Kommt eine neue Änderung dazu, steht sie unten in der Liste, und du führst nur diese aus:
1. Supabase → **SQL Editor** → „New query“.
2. Den kompletten Inhalt der Datei einfügen und **Run** drücken.
3. Erwartet: „Success. No rows returned“. Bei einer Fehlermeldung: Text kopieren und mir schicken.

| Schritt | Datei | Ab App-Version | Ausgeführt |
|---|---|---|---|
| 1 | `schritte/schema.sql` (Grundaufbau) | – | ja |
| 2 | `schritte/fix_invite.sql` (Korrektur) | – | ja |
| 3 | `schritte/gruppen.sql` (Gruppen) | 0.7.0 | ja (12.11.2026) |
| 4 | `schritte/historie.sql` (Kaufhistorie) | 0.7.5 | ja |
| 5 | `schritte/siri.sql` (Siri) | 0.7.8 | ja |
| 6 | `schritte/aufraeumen.sql` (Aufräumen) | 0.7.9 | ja |
| 7 | `schritte/gast.sql` (Liste per Link teilen) | 0.8.0 | ja |
| 8 | `schritte/konto_loeschen.sql` (Konto löschen) | 0.8.0 | ja |
| 9 | `schritte/gruppen_rechte.sql` (nur Verwalter lädt ein und entfernt, Benutzernamen) | 0.8.1 | noch offen |

Fehlt ein Schritt, läuft die App trotzdem; nur die jeweilige Funktion geht dann nicht und die App weist darauf hin.

## B. Neues Projekt aufsetzen (Notfall oder Test)
1. Auf **supabase.com** → „New project“: Name z. B. `einkaufsroute`, ein langes Datenbank-Passwort (gut aufheben, wird kaum gebraucht),
   Region **Central EU (Frankfurt)**, Plan Free. Ein paar Minuten warten.
2. **SQL Editor** → „New query“ → den kompletten Inhalt von **`komplett.sql`** einfügen → **Run**. Erwartet: „Success. No rows returned“.
3. **Authentication → Sign In / Providers → Email**: „Email“ an, **„Confirm email“ aus** → Save. (Die App verschickt keine Mails.)
4. **Project Settings → API Keys**: **Project URL** und **Publishable key** (`sb_publishable_…`) an mich schicken.
   Ich trage sie in `config.js` ein. Beide Werte sind dafür gedacht, in der App zu stehen.
   **Niemals schicken:** den `secret`-/`service_role`-Key und das Datenbank-Passwort.
5. In der App neu registrieren. Daten zurückholen: Einstellungen → Konto und Gruppen → Daten sichern und übertragen → Sicherung laden.
   Deshalb ab und zu eine Sicherung als Datei speichern.

## C. Passwort vergessen
`passwort_setzen.sql` öffnen, E-Mail und neues Passwort eintragen und im SQL-Editor ausführen (Anleitung oben in der Datei).
Die Person meldet sich damit an und ändert es in der App unter Einstellungen → Konto und Gruppen → Passwort ändern.
Die Datei danach **nicht** mit eingetragenem Passwort speichern.
