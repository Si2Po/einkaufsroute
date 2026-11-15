-- Siri antwortet auch auf Englisch (ab App-Version 0.9.0)
-- Der Kurzbefehl kann zusätzlich das Feld lang mitschicken („en“). Dann antwortet Siri auf Englisch („Noted: …“).
-- Ohne das Feld bleibt alles wie bisher auf Deutsch, bestehende Kurzbefehle laufen unverändert weiter.
--
-- Ersetzt nur die Funktion siri_add aus siri.sql (ein drittes, freiwilliges Feld), keine Tabelle und keine Daten.
-- Kann gefahrlos mehrfach ausgeführt werden. Ohne diesen Schritt geht Siri weiter auf Deutsch; ein englischer
-- Kurzbefehl mit dem Feld lang bekommt dann aber keine Antwort.

drop function if exists public.siri_add(text, text);

-- Vom Kurzbefehl aufgerufen (ohne Anmeldung, nur mit Schlüssel). Gibt immer einen Satz für Siri zurück.
create or replace function public.siri_add(k text, t text, lang text default 'de') returns text
language plpgsql security definer set search_path = public as $$
declare r public.siri_keys; txt text; en boolean := lower(coalesce(lang, '')) like 'en%';
begin
  select * into r from public.siri_keys where key_hash = public.siri_hash(k);
  if r.user_id is null then
    return case when en then 'The Siri key is not correct. Please set up Siri again in the app.'
                else 'Der Siri-Schlüssel stimmt nicht. Bitte in der App unter Siri neu einrichten.' end;
  end if;
  if not exists (select 1 from public.household_members m where m.household_id = r.household_id and m.user_id = r.user_id) then
    return case when en then 'The list is no longer in your groups. Please choose a list in the app under Siri.'
                else 'Die Liste ist nicht mehr in deinen Gruppen. Bitte in der App unter Siri eine Liste wählen.' end;
  end if;
  txt := left(trim(coalesce(t, '')), 500);
  if txt = '' then return case when en then 'I did not catch anything.' else 'Ich habe nichts verstanden.' end; end if;
  if (select count(*) from public.siri_inbox where created_by = r.user_id and created_at > now() - interval '10 minutes') >= 30 then
    return case when en then 'That was a lot at once. Please try again later.' else 'Das war gerade sehr viel auf einmal. Bitte später nochmal.' end;
  end if;
  if (select count(*) from public.siri_inbox where household_id = r.household_id) >= 200 then
    return case when en then 'The inbox is full. Please open the app once.' else 'Der Eingang ist voll. Öffne einmal die App.' end;
  end if;
  insert into public.siri_inbox (household_id, list_lid, text, created_by) values (r.household_id, r.list_lid, txt, r.user_id);
  return (case when en then 'Noted: ' else 'Notiert: ' end) || txt;
end $$;

revoke execute on function public.siri_add(text, text, text) from public;
grant execute on function public.siri_add(text, text, text) to anon, authenticated;
