-- Neues Passwort für ein Konto setzen (Notfall, wenn jemand sein Passwort vergessen hat).
-- Die App verschickt keine E-Mails, deshalb geht „Passwort vergessen“ nur über diesen Weg.
--
-- So geht's:
-- 1. Unten E-MAIL und NEUES-PASSWORT ersetzen (Passwort mindestens 6 Zeichen; die Anführungszeichen bleiben stehen).
-- 2. Supabase → SQL Editor → New query → alles einfügen → Run.
-- 3. Erwartet: „Success. 1 row affected“ (bei 0: E-Mail falsch geschrieben).
-- 4. Der Person das Passwort sagen. Sie meldet sich damit an und ändert es in der App
--    unter Einstellungen → Konto und Gruppen → Passwort ändern.
-- Diese Datei NICHT mit eingetragenem Passwort speichern oder hochladen, nur im SQL-Editor ausfüllen.
-- Nebenbei wird die E-Mail als bestätigt markiert (falls die Bestätigungsmail nie angekommen ist).

update auth.users
   set encrypted_password = extensions.crypt('NEUES-PASSWORT', extensions.gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       updated_at = now()
 where email = lower(trim('E-MAIL'));
