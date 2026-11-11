-- Korrektur: ersetzt die zwei Funktionen, die bei Supabase einen Fehler gaben.
-- Im SQL Editor einfügen und Run drücken.

create or replace function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare hid uuid; c text;
begin
  select household_id into hid from public.profiles where user_id = auth.uid();
  if hid is null or not public.is_member(hid) then raise exception 'Kein Haushalt'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.invites (code, household_id, created_by) values (c, hid, auth.uid());
  return c;
end $$;

create or replace function public.create_share(lid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare hid uuid; vis uuid; t text;
begin
  select household_id, visible_to into hid, vis from public.docs where id = lid and kind = 'list';
  if hid is null or not public.is_member(hid) or (vis is not null and vis <> auth.uid()) then
    raise exception 'Liste nicht gefunden';
  end if;
  select token into t from public.list_shares where list_id = lid limit 1;
  if t is null then
    t := replace(gen_random_uuid()::text, '-', '');
    insert into public.list_shares (token, household_id, list_id, created_by) values (t, hid, lid, auth.uid());
  end if;
  return t;
end $$;

grant execute on function public.create_invite(), public.create_share(uuid) to authenticated;
