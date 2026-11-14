-- Konto löschen (ab App-Version 0.8.0)
-- Die angemeldete Person löscht ihr eigenes Konto: „Persönlich“ mit allem Inhalt, ihre Mitgliedschaften,
-- ihren Siri-Schlüssel und ihre Teilen-Links. Gemeinsame Gruppen bleiben für die anderen bestehen;
-- war sie das letzte Mitglied, wird die Gruppe samt Inhalt gelöscht.
-- Kann gefahrlos mehrfach ausgeführt werden.

create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); g record;
begin
  if u is null then raise exception 'Nicht angemeldet'; end if;
  for g in select h.id, h.kind from public.households h join public.household_members m on m.household_id = h.id and m.user_id = u loop
    delete from public.household_members where household_id = g.id and user_id = u;
    if g.kind = 'personal' or not exists (select 1 from public.household_members where household_id = g.id) then
      delete from public.households where id = g.id;   -- löscht auch alle Dokumente, Einladungen usw. dieser Gruppe
    end if;
  end loop;
  delete from auth.users where id = u;                   -- Siri-Schlüssel und Teilen-Links verschwinden mit
end $$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
