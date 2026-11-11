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
