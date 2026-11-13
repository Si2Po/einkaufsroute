# Supabase einrichten (ca. 10 Minuten)

## 1. Konto und Projekt
1. Auf **supabase.com** → „Start your project" → mit GitHub oder E-Mail registrieren.
2. „New project":
   - Name: `einkaufsroute`
   - Database Password: ein langes Passwort wählen und irgendwo speichern (brauchst du später kaum)
   - Region: **Central EU (Frankfurt)**
   - Plan: Free
3. Ein paar Minuten warten, bis das Projekt bereit ist.

## 2. Datenbank anlegen
1. Links im Menü **SQL Editor** → „New query".
2. Den kompletten Inhalt der Datei `schema.sql` einfügen und **Run** drücken.
3. Es muss „Success. No rows returned" erscheinen. Bei einer Fehlermeldung: Text kopieren und mir schicken.

## 3. Anmeldung per Code
Der Link-Login aus der Mail öffnet auf dem iPhone Safari statt der installierten App. Deshalb nutzen wir einen 6-stelligen Code, den man in der App eintippt.
1. **Authentication → Emails → Templates** (je nach Version auch „Email Templates") → **Magic Link**.
2. Im Text den Link ersetzen durch: `Dein Code: {{ .Token }}`
   (Betreff z. B. „Dein Einkaufsroute-Code"). Speichern.
3. Dasselbe beim Template **Confirm signup**, falls vorhanden.
4. **Authentication → Sign In / Providers**:
   - „Email" muss aktiv sein
   - **„Allow anonymous sign-ins" einschalten** (für Gäste, die nur einen Listen-Link öffnen)

Hinweis: Das eingebaute Mailsystem von Supabase verschickt nur wenige Mails pro Stunde. Für dich und deine Frau reicht das. Für eine spätere Weitergabe richten wir einen eigenen Mailversand ein (z. B. Resend, gratis).

## 4. Zugangsdaten für mich
**Project Settings → API** (oder „API Keys"):
- **Project URL** (sieht aus wie `https://abcdefgh.supabase.co`)
- **anon / publishable key** (langer Text, beginnt oft mit `eyJ…` oder `sb_publishable_…`)

Beides darfst du mir schicken, beide Werte sind dafür gedacht, in der App zu stehen. Der Schutz der Daten kommt aus den Zugriffsregeln in `schema.sql`.

**Niemals schicken:** den `service_role`- bzw. `secret`-Key und das Datenbank-Passwort.

## 5. Später (Hosting)
Ein kostenloses GitHub-Konto anlegen. Die Schritte für das Hosting bekommst du von mir, sobald die App fertig ist.

## 6. Gruppen nachrüsten (einmalig)
1. Vorher in der App sichern: Einstellungen → Konto und Haushalt → Daten sichern → „Als Datei speichern“.
2. Supabase → **SQL Editor** → „New query“.
3. Den kompletten Inhalt von `gruppen.sql` einfügen und **Run** drücken.
4. Erwartet: „Success. No rows returned“. Bei einer Fehlermeldung: Text kopieren und mir schicken.
5. Prüfen (optional): Links **Table Editor → households**. Euer gemeinsamer Haushalt heißt jetzt „Einkauf“,
   dazu gibt es für jede Person einen Eintrag „Persönlich“.
Die App funktioniert danach unverändert weiter; die Gruppen-Funktionen kommen mit dem nächsten App-Update.

## 7. Kaufhistorie nachrüsten (einmalig, ab App-Version 0.7.5)
1. Supabase → **SQL Editor** → „New query“.
2. Den kompletten Inhalt von `historie.sql` einfügen und **Run** drücken.
3. Erwartet: „Success. No rows returned“. Bei einer Fehlermeldung: Text kopieren und mir schicken.
Ohne diesen Schritt funktioniert die App normal weiter; die Kaufhistorie bleibt dann nur auf dem jeweiligen Gerät
und wird erst nach dem SQL mit der Gruppe geteilt (nach dem nächsten Start der App).
