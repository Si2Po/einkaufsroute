-- Einkaufsroute – Gruppen (Ergänzung zu schema.sql)
-- Im Supabase SQL Editor komplett einfügen und Run drücken. Erwartet: „Success. No rows returned“.
-- Ergänzt nur, löscht keine Daten. Kann gefahrlos mehrmals ausgeführt werden.
-- Die bisherige App-Version funktioniert danach unverändert weiter (sie nutzt weiter profiles.household_id).
--
-- Begriffe: Eine „Gruppe“ ist technisch ein Eintrag in households.
--   kind = 'personal' → „Persönlich“: genau eine pro Person, kann nicht geteilt oder verlassen werden
--   kind = 'shopping' → normale Gruppe (z. B. „Einkauf“), kann geteilt werden
--   kind = 'simple'   → für später („Einfache Listen“ ohne Essen/Geschäfte)

-- ───────── 1. Art der Gruppe ─────────
alter table public.households add column if not exists kind text not null default 'shopping';
do $$ begin
  alter table public.households add constraint households_kind_check check (kind in ('personal', 'shopping', 'simple'));
exception when duplicate_object then null; end $$;

-- ───────── 2. Bestehende Haushalte umstellen ─────────
-- a) Geteilte Haushalte (mehr als ein Mitglied) werden die Gruppe „Einkauf“ (Name nur, wenn noch der Standardname drin steht)
update public.households h
   set kind = 'shopping',
       name = case when h.name in ('Mein Haushalt', '') then 'Einkauf' else h.name end
 where h.kind <> 'personal'
   and (select count(*) from public.household_members m where m.household_id = h.id) > 1;

-- b) Wer noch keine persönliche Gruppe hat: sein ältester Haushalt, in dem er allein ist, wird „Persönlich“
with single as (
  select m.user_id, h.id,
         row_number() over (partition by m.user_id order by h.created_at) as rn
    from public.households h
    join public.household_members m on m.household_id = h.id
   where h.kind <> 'personal'
     and (select count(*) from public.household_members x where x.household_id = h.id) = 1
     and not exists (select 1 from public.household_members m2 join public.households h2 on h2.id = m2.household_id
                      where m2.user_id = m.user_id and h2.kind = 'personal')
)
update public.households h set kind = 'personal', name = 'Persönlich'
  from single s where s.id = h.id and s.rn = 1;

-- c) Alle, die danach immer noch keine persönliche Gruppe haben, bekommen eine neue (leer)
do $$
declare u record; hid uuid;
begin
  for u in
    select a.id from auth.users a
     where not coalesce(a.is_anonymous, false)
       and not exists (select 1 from public.household_members m join public.households h on h.id = m.household_id
                        where m.user_id = a.id and h.kind = 'personal')
  loop
    insert into public.households (name, kind, created_by) values ('Persönlich', 'personal', u.id) returning id into hid;
    insert into public.household_members (household_id, user_id) values (hid, u.id);
  end loop;
end $$;

-- ───────── 3. Neue Konten bekommen „Persönlich“ ─────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if coalesce(new.is_anonymous, false) then return new; end if;  -- Gäste bekommen keine Gruppe
  insert into public.households (name, kind, created_by) values ('Persönlich', 'personal', new.id) returning id into hid;
  insert into public.household_members (household_id, user_id) values (hid, new.id);
  insert into public.profiles (user_id, household_id) values (new.id, hid);
  return new;
end $$;

-- ───────── 4. Gruppen nur noch über Funktionen ändern ─────────
-- Vorher durfte jedes Mitglied den Haushalt direkt ändern (auch die Art). Jetzt nur noch über rename_group.
drop policy if exists hh_update on public.households;

-- ───────── 5. Funktionen ─────────
-- Meine Gruppen mit Mitgliedern (E-Mail-Adressen), für die Einstellungen
create or replace function public.my_groups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', h.id, 'name', h.name, 'kind', h.kind,
           'members', (select coalesce(jsonb_agg(u.email order by mm.created_at), '[]'::jsonb)
                         from public.household_members mm join auth.users u on u.id = mm.user_id
                        where mm.household_id = h.id))
         order by (h.kind = 'personal') desc, h.created_at), '[]'::jsonb)
    from public.households h
    join public.household_members m on m.household_id = h.id and m.user_id = auth.uid();
$$;

-- Neue Gruppe anlegen (man ist sofort Mitglied)
create or replace function public.create_group(n text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if coalesce(trim(n), '') = '' then raise exception 'Bitte einen Namen eingeben'; end if;
  insert into public.households (name, kind, created_by) values (trim(n), 'shopping', auth.uid()) returning id into hid;
  insert into public.household_members (household_id, user_id) values (hid, auth.uid());
  return hid;
end $$;

-- Gruppe umbenennen (jedes Mitglied darf das)
create or replace function public.rename_group(g uuid, n text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  if coalesce(trim(n), '') = '' then raise exception 'Bitte einen Namen eingeben'; end if;
  update public.households set name = trim(n) where id = g;
end $$;

-- Einladung für eine bestimmte Gruppe (nicht für „Persönlich“)
create or replace function public.create_invite(g uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  if (select kind from public.households where id = g) = 'personal' then
    raise exception '„Persönlich“ kann nicht geteilt werden';
  end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.invites (code, household_id, created_by) values (c, g, auth.uid());
  return c;
end $$;

-- Alte Einladungs-Funktion (bisherige App-Version): ebenfalls nicht für „Persönlich“
create or replace function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare hid uuid; c text;
begin
  select household_id into hid from public.profiles where user_id = auth.uid();
  if hid is null or not public.is_member(hid) then raise exception 'Kein Haushalt'; end if;
  if (select kind from public.households where id = hid) = 'personal' then
    raise exception '„Persönlich“ kann nicht geteilt werden. Bitte die App aktualisieren.';
  end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.invites (code, household_id, created_by) values (c, hid, auth.uid());
  return c;
end $$;

-- Einladung annehmen: Mitglied werden. Für die bisherige App-Version wird die Gruppe auch „aktiv“ gesetzt.
create or replace function public.accept_invite(c text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select household_id into hid from public.invites where code = upper(trim(c)) and expires_at > now();
  if hid is null then raise exception 'Einladung ungültig oder abgelaufen'; end if;
  if (select kind from public.households where id = hid) = 'personal' then
    raise exception 'Diese Gruppe kann nicht geteilt werden';
  end if;
  insert into public.household_members (household_id, user_id) values (hid, auth.uid()) on conflict do nothing;
  insert into public.profiles (user_id, household_id) values (auth.uid(), hid)
    on conflict (user_id) do update set household_id = excluded.household_id;
  return hid;
end $$;

-- Gruppe verlassen (nicht „Persönlich“). Wer zuletzt geht, löscht die Gruppe samt Inhalt.
create or replace function public.leave_group(g uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  if (select kind from public.households where id = g) = 'personal' then
    raise exception '„Persönlich“ kann man nicht verlassen';
  end if;
  delete from public.household_members where household_id = g and user_id = auth.uid();
  update public.profiles set household_id = null where user_id = auth.uid() and household_id = g;
  if not exists (select 1 from public.household_members where household_id = g) then
    delete from public.households where id = g;
  end if;
end $$;

revoke execute on function public.my_groups(), public.create_group(text), public.rename_group(uuid, text),
  public.create_invite(uuid), public.create_invite(), public.accept_invite(text), public.leave_group(uuid) from public, anon;
grant execute on function public.my_groups(), public.create_group(text), public.rename_group(uuid, text),
  public.create_invite(uuid), public.create_invite(), public.accept_invite(text), public.leave_group(uuid) to authenticated;
