-- Gruppen verwalten (ab App-Version 0.8.1)
-- Einladen und Mitglieder entfernen darf nur, wer die Gruppe verwaltet: die Person, die sie angelegt hat.
-- Ist sie nicht mehr Mitglied (ausgetreten oder Konto gelöscht), verwaltet das Mitglied, das am längsten dabei ist.
-- Umbenennen dürfen weiterhin alle Mitglieder.
-- Kann gefahrlos mehrfach ausgeführt werden.

-- Wer verwaltet die Gruppe?
create or replace function public.group_owner(g uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select h.created_by from public.households h
      where h.id = g and exists (select 1 from public.household_members m where m.household_id = g and m.user_id = h.created_by)),
    (select m.user_id from public.household_members m where m.household_id = g order by m.created_at, m.user_id limit 1));
$$;

-- Meine Gruppen: zusätzlich, wer sie verwaltet (owner = E-Mail) und ob ich das bin (mine)
create or replace function public.my_groups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', h.id, 'name', h.name, 'kind', h.kind,
           'members', (select coalesce(jsonb_agg(u.email order by mm.created_at), '[]'::jsonb)
                         from public.household_members mm join auth.users u on u.id = mm.user_id
                        where mm.household_id = h.id),
           'owner', (select u.email from auth.users u where u.id = public.group_owner(h.id)),
           'mine', public.group_owner(h.id) = auth.uid())
         order by (h.kind = 'personal') desc, h.created_at), '[]'::jsonb)
    from public.households h
    join public.household_members m on m.household_id = h.id and m.user_id = auth.uid();
$$;

-- Einladung: nur wer die Gruppe verwaltet
create or replace function public.create_invite(g uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  if (select kind from public.households where id = g) = 'personal' then
    raise exception '„Persönlich“ kann nicht geteilt werden';
  end if;
  if public.group_owner(g) is distinct from auth.uid() then
    raise exception 'Einladen kann nur, wer die Gruppe verwaltet';
  end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.invites (code, household_id, created_by) values (c, g, auth.uid());
  return c;
end $$;

-- Alte Einladungs-Funktion (sehr alte App-Versionen): gibt es nicht mehr
create or replace function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Bitte die App aktualisieren.';
end $$;

-- Mitglied entfernen: nur wer die Gruppe verwaltet, nicht sich selbst (dafür „Gruppe verlassen“)
create or replace function public.remove_member(g uuid, mail text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if public.group_owner(g) is distinct from auth.uid() then raise exception 'Entfernen kann nur, wer die Gruppe verwaltet'; end if;
  select a.id into u from auth.users a join public.household_members m on m.user_id = a.id and m.household_id = g
   where lower(a.email) = lower(trim(mail));
  if u is null then raise exception 'Diese Person ist nicht in der Gruppe'; end if;
  if u = auth.uid() then raise exception 'Zum Austreten bitte „Gruppe verlassen“ nehmen'; end if;
  delete from public.household_members where household_id = g and user_id = u;
  delete from public.guest_links where household_id = g and created_by = u;   -- ihre Teilen-Links in dieser Gruppe gelten nicht mehr
end $$;

revoke execute on function public.group_owner(uuid), public.remove_member(uuid, text) from public, anon;
grant execute on function public.my_groups(), public.create_invite(uuid), public.remove_member(uuid, text) to authenticated;
