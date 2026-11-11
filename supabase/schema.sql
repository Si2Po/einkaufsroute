-- Einkaufsroute – Datenbank für Supabase
-- Einmal komplett im SQL Editor ausführen (Run).

-- ───────── Tabellen ─────────
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mein Haushalt',
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index on public.household_members (user_id);

-- welcher Haushalt ist bei einem Nutzer gerade aktiv
create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  household_id uuid references public.households on delete set null
);

-- alle App-Daten als Dokumente (Laden, Bereich, Liste, Eintrag, Essen, Einstellungen)
create table public.docs (
  id uuid primary key,
  household_id uuid not null references public.households on delete cascade,
  kind text not null check (kind in ('settings','store','cat','list','item','meal')),
  list_id uuid,                 -- bei Listen: die eigene id, bei Einträgen: die Liste
  visible_to uuid,              -- null = ganzer Haushalt, sonst nur diese Person (private Liste)
  data jsonb not null default '{}',
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index docs_sync on public.docs (household_id, updated_at);
create index docs_list on public.docs (list_id);

create table public.invites (
  code text primary key,
  household_id uuid not null references public.households on delete cascade,
  created_by uuid,
  expires_at timestamptz not null default now() + interval '7 days'
);

create table public.list_shares (
  token text primary key,
  household_id uuid not null references public.households on delete cascade,
  list_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.list_guests (
  list_id uuid not null,
  user_id uuid not null references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  primary key (list_id, user_id)
);

-- ───────── Hilfsfunktionen ─────────
create function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members
                 where household_id = hid and user_id = auth.uid());
$$;

create function public.guest_household(lid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.list_guests
  where list_id = lid and user_id = auth.uid();
$$;

create function public.docs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();       -- Serverzeit = eindeutige Reihenfolge für den Abgleich
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- Bei jeder Registrierung automatisch einen eigenen Haushalt anlegen
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if coalesce(new.is_anonymous, false) then return new; end if;  -- Gäste bekommen keinen Haushalt
  insert into public.households (created_by) values (new.id) returning id into hid;
  insert into public.household_members (household_id, user_id) values (hid, new.id);
  insert into public.profiles (user_id, household_id) values (new.id, hid);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── Zugriffsregeln (Row Level Security) ─────────
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.profiles          enable row level security;
alter table public.docs              enable row level security;
alter table public.invites           enable row level security;   -- nur über Funktionen
alter table public.list_shares       enable row level security;   -- nur über Funktionen
alter table public.list_guests       enable row level security;   -- nur über Funktionen

create policy hh_select on public.households for select using (public.is_member(id));
create policy hh_update on public.households for update using (public.is_member(id)) with check (public.is_member(id));

create policy mem_select on public.household_members for select
  using (user_id = auth.uid() or public.is_member(household_id));

create policy prof_select on public.profiles for select using (user_id = auth.uid());
create policy prof_update on public.profiles for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and (household_id is null or public.is_member(household_id)));

create policy docs_select on public.docs for select using (
  (public.is_member(household_id) and (visible_to is null or visible_to = auth.uid()))
  or (list_id is not null and public.guest_household(list_id) = household_id)
);
create policy docs_insert on public.docs for insert with check (
  (public.is_member(household_id) and (visible_to is null or visible_to = auth.uid()))
  or (kind = 'item' and list_id is not null and public.guest_household(list_id) = household_id)
);
create policy docs_update on public.docs for update
  using (
    (public.is_member(household_id) and (visible_to is null or visible_to = auth.uid()))
    or (kind = 'item' and list_id is not null and public.guest_household(list_id) = household_id)
  )
  with check (
    (public.is_member(household_id) and (visible_to is null or visible_to = auth.uid()))
    or (kind = 'item' and list_id is not null and public.guest_household(list_id) = household_id)
  );
-- Löschen läuft nur "weich" (deleted = true), damit der Abgleich es mitbekommt.

-- ───────── Funktionen für Einladung und Teilen ─────────
create function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare hid uuid; c text;
begin
  select household_id into hid from public.profiles where user_id = auth.uid();
  if hid is null or not public.is_member(hid) then raise exception 'Kein Haushalt'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.invites (code, household_id, created_by) values (c, hid, auth.uid());
  return c;
end $$;

create function public.accept_invite(c text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select household_id into hid from public.invites
   where code = upper(trim(c)) and expires_at > now();
  if hid is null then raise exception 'Einladung ungültig oder abgelaufen'; end if;
  insert into public.household_members (household_id, user_id) values (hid, auth.uid())
    on conflict do nothing;
  insert into public.profiles (user_id, household_id) values (auth.uid(), hid)
    on conflict (user_id) do update set household_id = excluded.household_id;
  return hid;
end $$;

create function public.create_share(lid uuid) returns text
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

create function public.join_share(t text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.list_shares;
begin
  select * into s from public.list_shares where token = t;
  if s.token is null then raise exception 'Link ungültig oder widerrufen'; end if;
  insert into public.list_guests (list_id, user_id, household_id) values (s.list_id, auth.uid(), s.household_id)
    on conflict do nothing;
  return jsonb_build_object('list_id', s.list_id, 'household_id', s.household_id);
end $$;

create function public.revoke_share(lid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select household_id into hid from public.docs where id = lid and kind = 'list';
  if hid is null or not public.is_member(hid) then raise exception 'Keine Berechtigung'; end if;
  delete from public.list_guests where list_id = lid;
  delete from public.list_shares where list_id = lid;
end $$;

revoke execute on function public.create_invite(), public.accept_invite(text), public.create_share(uuid),
  public.join_share(text), public.revoke_share(uuid) from public, anon;
grant execute on function public.create_invite(), public.accept_invite(text), public.create_share(uuid),
  public.join_share(text), public.revoke_share(uuid) to authenticated;

-- Live-Updates auf beiden Handys
alter publication supabase_realtime add table public.docs;
