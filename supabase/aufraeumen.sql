-- Aufräumen (ab App-Version 0.7.9)
-- Gelöschtes bleibt in der Tabelle docs zunächst als leere Markierung (deleted = true) stehen, damit andere Geräte
-- die Löschung mitbekommen. Nach 90 Tagen braucht die Markierung niemand mehr. Die App ruft diese Funktion
-- höchstens einmal am Tag auf; sie räumt nur in den eigenen Gruppen auf. Abgelaufene Einladungen fliegen auch raus.
-- Geräte, die länger als 90 Tage nicht abgeglichen haben, gleichen sich danach einmal vollständig ab (macht die App).
-- Kann gefahrlos mehrfach ausgeführt werden.

create or replace function public.purge_deleted() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then return 0; end if;
  delete from public.docs d
   where d.deleted and d.updated_at < now() - interval '90 days' and public.is_member(d.household_id);
  get diagnostics n = row_count;
  delete from public.invites where expires_at < now() - interval '1 day';
  return n;
end $$;

revoke execute on function public.purge_deleted() from public, anon;
grant execute on function public.purge_deleted() to authenticated;
