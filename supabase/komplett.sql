-- Einkaufsroute – komplette Datenbank (Stand App-Version 0.8.1)
--
-- NUR FÜR EIN NEUES, LEERES Supabase-Projekt (z. B. Notfall oder Test-Projekt).
-- Für die bestehende Datenbank NICHT nötig: die ist über die einzelnen Schritte in supabase/schritte/ schon auf diesem Stand.
--
-- So geht's: Supabase → SQL Editor → New query → alles einfügen → Run. Erwartet: „Success. No rows returned“.
-- Danach: Authentication → Sign In / Providers → Email → „Confirm email“ ausschalten (die App verschickt keine Mails).
-- Dann in der App (config.js) Adresse und Publishable-Key des neuen Projekts eintragen.
--
-- Wird eine Änderung an der Datenbank nötig, kommt sie zweimal ins Projekt: als kleine Schritt-Datei für die bestehende
-- Datenbank (supabase/schritte/) UND hier hinein, damit diese Datei immer den aktuellen Gesamtstand zeigt.

-- ═════════ Tabellen ═════════

-- Gruppen (technisch „households“). kind: 'personal' = „Persönlich“ (eine pro Person, nicht teilbar), 'shopping' = normale Gruppe
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Einkauf',
  kind text not null default 'shopping' check (kind in ('personal', 'shopping', 'simple')),
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

-- Alle App-Daten als Dokumente. id = SHA-256 aus „Gruppe|Art|lokale ID“ als UUID (siehe doc_uuid unten und docId in sync.js).
create table public.docs (
  id uuid primary key,
  household_id uuid not null references public.households on delete cascade,
  kind text not null check (kind in ('settings', 'store', 'cat', 'list', 'item', 'meal', 'hist')),
  list_id uuid,                 -- bei Listen: die eigene id, bei Einträgen: die Liste
  visible_to uuid,              -- null = ganze Gruppe, sonst nur diese Person
  data jsonb not null default '{}',
  deleted boolean not null default false,   -- Löschen nur „weich“, damit der Abgleich es mitbekommt
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index docs_sync on public.docs (household_id, updated_at);
create index docs_list on public.docs (list_id);

-- Einladungen in eine Gruppe (7 Tage gültig)
create table public.invites (
  code text primary key,
  household_id uuid not null references public.households on delete cascade,
  created_by uuid,
  expires_at timestamptz not null default now() + interval '7 days'
);

-- Siri: persönlicher Schlüssel (nur als Prüfsumme) und Eingangskorb
create table public.siri_keys (
  user_id uuid primary key references auth.users on delete cascade,
  key_hash text not null unique,
  household_id uuid not null references public.households on delete cascade,
  list_lid text not null,
  created_at timestamptz not null default now()
);
create table public.siri_inbox (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  list_lid text not null,
  text text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index siri_inbox_hh on public.siri_inbox (household_id);

-- Liste per Link teilen (Schlüssel nur als Prüfsumme)
create table public.guest_links (
  key_hash text primary key,
  household_id uuid not null references public.households on delete cascade,
  list_lid text not null,
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  unique (household_id, list_lid)
);

-- ═════════ Hilfsfunktionen ═════════

create function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = hid and user_id = auth.uid());
$$;

-- Serverzeit als eindeutige Reihenfolge für den Abgleich
create function public.docs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- Jedes neue Konto bekommt „Persönlich“
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if coalesce(new.is_anonymous, false) then return new; end if;
  insert into public.households (name, kind, created_by) values ('Persönlich', 'personal', new.id) returning id into hid;
  insert into public.household_members (household_id, user_id) values (hid, new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prüfsumme für Siri- und Teilen-Schlüssel (sha256 ist eingebaut)
create function public.siri_hash(k text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(k, ''), 'UTF8')), 'hex');
$$;

-- Dokument-ID genau wie docId() in sync.js
create function public.doc_uuid(g uuid, kind text, lid text) returns uuid
language plpgsql immutable set search_path = public as $$
declare b bytea := substring(sha256(convert_to(g::text || '|' || kind || '|' || lid, 'UTF8')) from 1 for 16);
begin
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 80);
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
  return encode(b, 'hex')::uuid;
end $$;

-- ═════════ Zugriffsregeln (Row Level Security) ═════════
-- Tabellen ohne Policy sind von außen gar nicht erreichbar, nur über die Funktionen unten.

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.docs              enable row level security;
alter table public.invites           enable row level security;
alter table public.siri_keys         enable row level security;
alter table public.siri_inbox        enable row level security;
alter table public.guest_links       enable row level security;
revoke all on public.invites, public.siri_keys, public.siri_inbox, public.guest_links from public, anon, authenticated;

create policy hh_select on public.households for select using (public.is_member(id));
create policy mem_select on public.household_members for select using (user_id = auth.uid() or public.is_member(household_id));

create policy docs_select on public.docs for select
  using (public.is_member(household_id) and (visible_to is null or visible_to = auth.uid()));
create policy docs_insert on public.docs for insert
  with check (public.is_member(household_id) and (visible_to is null or visible_to = auth.uid()));
create policy docs_update on public.docs for update
  using (public.is_member(household_id) and (visible_to is null or visible_to = auth.uid()))
  with check (public.is_member(household_id) and (visible_to is null or visible_to = auth.uid()));

-- ═════════ Gruppen ═════════

-- Wer verwaltet die Gruppe (darf einladen und Mitglieder entfernen)? Wer sie angelegt hat; ist diese Person
-- nicht mehr Mitglied, das Mitglied, das am längsten dabei ist.
create function public.group_owner(g uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select h.created_by from public.households h
      where h.id = g and exists (select 1 from public.household_members m where m.household_id = g and m.user_id = h.created_by)),
    (select m.user_id from public.household_members m where m.household_id = g order by m.created_at, m.user_id limit 1));
$$;

-- Meine Gruppen mit Mitgliedern (E-Mail-Adressen), wer sie verwaltet (owner) und ob ich das bin (mine)
create function public.my_groups() returns jsonb
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

create function public.create_group(n text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if coalesce(trim(n), '') = '' then raise exception 'Bitte einen Namen eingeben'; end if;
  insert into public.households (name, kind, created_by) values (trim(n), 'shopping', auth.uid()) returning id into hid;
  insert into public.household_members (household_id, user_id) values (hid, auth.uid());
  return hid;
end $$;

create function public.rename_group(g uuid, n text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  if coalesce(trim(n), '') = '' then raise exception 'Bitte einen Namen eingeben'; end if;
  update public.households set name = trim(n) where id = g;
end $$;

create function public.create_invite(g uuid) returns text
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

-- Mitglied entfernen: nur wer die Gruppe verwaltet, nicht sich selbst (dafür „Gruppe verlassen“)
create function public.remove_member(g uuid, mail text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if public.group_owner(g) is distinct from auth.uid() then raise exception 'Entfernen kann nur, wer die Gruppe verwaltet'; end if;
  select a.id into u from auth.users a join public.household_members m on m.user_id = a.id and m.household_id = g
   where lower(a.email) = lower(trim(mail));
  if u is null then raise exception 'Diese Person ist nicht in der Gruppe'; end if;
  if u = auth.uid() then raise exception 'Zum Austreten bitte „Gruppe verlassen“ nehmen'; end if;
  delete from public.household_members where household_id = g and user_id = u;
  delete from public.guest_links where household_id = g and created_by = u;
end $$;

create function public.accept_invite(c text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select household_id into hid from public.invites where code = upper(trim(c)) and expires_at > now();
  if hid is null then raise exception 'Einladung ungültig oder abgelaufen'; end if;
  if (select kind from public.households where id = hid) = 'personal' then
    raise exception 'Diese Gruppe kann nicht geteilt werden';
  end if;
  insert into public.household_members (household_id, user_id) values (hid, auth.uid()) on conflict do nothing;
  return hid;
end $$;

-- Gruppe verlassen (nicht „Persönlich“). Wer zuletzt geht, löscht die Gruppe samt Inhalt.
create function public.leave_group(g uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  if (select kind from public.households where id = g) = 'personal' then
    raise exception '„Persönlich“ kann man nicht verlassen';
  end if;
  delete from public.household_members where household_id = g and user_id = auth.uid();
  if not exists (select 1 from public.household_members where household_id = g) then
    delete from public.households where id = g;
  end if;
end $$;

-- Eigenes Konto löschen: „Persönlich“ samt Inhalt, Mitgliedschaften (letztes Mitglied: Gruppe weg), Siri-Schlüssel, Teilen-Links
create function public.delete_account() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); g record;
begin
  if u is null then raise exception 'Nicht angemeldet'; end if;
  for g in select h.id, h.kind from public.households h join public.household_members m on m.household_id = h.id and m.user_id = u loop
    delete from public.household_members where household_id = g.id and user_id = u;
    if g.kind = 'personal' or not exists (select 1 from public.household_members where household_id = g.id) then
      delete from public.households where id = g.id;
    end if;
  end loop;
  delete from auth.users where id = u;
end $$;

-- ═════════ Aufräumen ═════════
-- Löschmarkierungen nach 90 Tagen und abgelaufene Einladungen entfernen. Die App ruft das einmal am Tag auf.
create function public.purge_deleted() returns integer
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

-- ═════════ Siri ═════════

create function public.siri_new_key(g uuid, lid text) returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if auth.uid() is null or not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  if coalesce(trim(lid), '') = '' then raise exception 'Bitte eine Liste wählen'; end if;
  k := replace(gen_random_uuid()::text, '-', '');
  insert into public.siri_keys (user_id, key_hash, household_id, list_lid)
    values (auth.uid(), public.siri_hash(k), g, lid)
    on conflict (user_id) do update set key_hash = excluded.key_hash, household_id = excluded.household_id,
      list_lid = excluded.list_lid, created_at = now();
  return k;
end $$;

create function public.siri_set_list(g uuid, lid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  update public.siri_keys set household_id = g, list_lid = lid where user_id = auth.uid();
end $$;

create function public.siri_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('g', household_id, 'lid', list_lid, 'created_at', created_at)
    from public.siri_keys where user_id = auth.uid();
$$;

create function public.siri_off() returns void
language sql security definer set search_path = public as $$
  delete from public.siri_keys where user_id = auth.uid();
$$;

-- Vom Kurzbefehl aufgerufen (ohne Anmeldung, nur mit Schlüssel). Gibt immer einen Satz für Siri zurück.
create function public.siri_add(k text, t text) returns text
language plpgsql security definer set search_path = public as $$
declare r public.siri_keys; txt text;
begin
  select * into r from public.siri_keys where key_hash = public.siri_hash(k);
  if r.user_id is null then return 'Der Siri-Schlüssel stimmt nicht. Bitte in der App unter Siri neu einrichten.'; end if;
  if not exists (select 1 from public.household_members m where m.household_id = r.household_id and m.user_id = r.user_id) then
    return 'Die Liste ist nicht mehr in deinen Gruppen. Bitte in der App unter Siri eine Liste wählen.';
  end if;
  txt := left(trim(coalesce(t, '')), 500);
  if txt = '' then return 'Ich habe nichts verstanden.'; end if;
  if (select count(*) from public.siri_inbox where created_by = r.user_id and created_at > now() - interval '10 minutes') >= 30 then
    return 'Das war gerade sehr viel auf einmal. Bitte später nochmal.';
  end if;
  if (select count(*) from public.siri_inbox where household_id = r.household_id) >= 200 then
    return 'Der Eingang ist voll. Öffne einmal die App.';
  end if;
  insert into public.siri_inbox (household_id, list_lid, text, created_by) values (r.household_id, r.list_lid, txt, r.user_id);
  return 'Notiert: ' || txt;
end $$;

-- Von der App beim Abgleich: Eingang aller eigenen Gruppen holen und leeren (in einem Schritt)
create function public.siri_take() returns jsonb
language sql security definer set search_path = public as $$
  with d as (
    delete from public.siri_inbox i
     where auth.uid() is not null and public.is_member(i.household_id)
    returning i.id, i.household_id, i.list_lid, i.text, i.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('g', household_id, 'lid', list_lid, 't', text, 'at', created_at) order by id), '[]'::jsonb) from d;
$$;

-- ═════════ Liste per Link teilen ═════════

create function public.guest_link(g uuid, lid text) returns text
language plpgsql security definer set search_path = public as $$
declare k text; vis uuid; ok boolean;
begin
  if auth.uid() is null or not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  select true, visible_to into ok, vis from public.docs
   where id = public.doc_uuid(g, 'list', lid) and kind = 'list' and not deleted;
  if ok is null then raise exception 'Die Liste ist noch nicht abgeglichen. Bitte kurz warten und nochmal versuchen.'; end if;
  if vis is not null and vis <> auth.uid() then raise exception 'Keine Berechtigung'; end if;
  k := replace(gen_random_uuid()::text, '-', '');
  delete from public.guest_links where list_lid = lid and created_by = auth.uid();
  insert into public.guest_links (key_hash, household_id, list_lid, created_by)
    values (public.siri_hash(k), g, lid, auth.uid())
    on conflict (household_id, list_lid) do update set key_hash = excluded.key_hash, created_by = excluded.created_by, created_at = now();
  return k;
end $$;

create function public.guest_link_off(lid text) returns void
language sql security definer set search_path = public as $$
  delete from public.guest_links where list_lid = lid and public.is_member(household_id);
$$;

-- Intern: Link prüfen und Liste finden (zieht mit, wenn die Liste in eine andere Gruppe verschoben wurde)
create function public.guest_resolve(t text, out hh uuid, out list_doc uuid, out vis uuid, out ldata jsonb, out lid text)
language plpgsql security definer set search_path = public as $$
declare r public.guest_links;
begin
  select * into r from public.guest_links where key_hash = public.siri_hash(t);
  if r.key_hash is null then return; end if;
  lid := r.list_lid;
  select d.household_id, d.id, d.visible_to, d.data into hh, list_doc, vis, ldata from public.docs d
   where d.id = public.doc_uuid(r.household_id, 'list', r.list_lid) and not d.deleted;
  if hh is null then
    select d.household_id, d.id, d.visible_to, d.data into hh, list_doc, vis, ldata from public.docs d
     where d.kind = 'list' and not d.deleted and d.data->>'id' = r.list_lid
       and exists (select 1 from public.household_members m where m.household_id = d.household_id and m.user_id = r.created_by)
     limit 1;
    if hh is not null then update public.guest_links set household_id = hh where key_hash = r.key_hash; end if;
  end if;
end $$;

create function public.guest_get(t text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from public.guest_resolve(t);
  if g.hh is null then return null; end if;
  return jsonb_build_object(
    'name', g.ldata->>'name', 'type', g.ldata->>'type', 'secs', coalesce(g.ldata->'secs', '[]'::jsonb),
    'keepDone', coalesce((g.ldata->>'keepDone')::boolean, false),
    'cats', (select coalesce(jsonb_agg(jsonb_build_object('id', d.data->>'id', 'name', d.data->>'name', 'kw', coalesce(d.data->'kw', '[]'::jsonb))
                      order by coalesce((d.data->>'_o')::int, 999)), '[]'::jsonb)
               from public.docs d where d.household_id = g.hh and d.kind = 'cat' and not d.deleted),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', d.data->>'id', 'name', d.data->>'name', 'qty', d.data->>'qty',
                      'note', d.data->>'note', 'cat', d.data->>'cat', 'done', coalesce((d.data->>'done')::boolean, false),
                      'sec', d.data->>'sec', 'ord', d.data->'ord', 'ts', d.data->'ts')), '[]'::jsonb)
               from public.docs d where d.list_id = g.list_doc and d.kind = 'item' and not d.deleted));
end $$;

create function public.guest_check(t text, iid text, done boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from public.guest_resolve(t);
  if g.hh is null then return false; end if;
  update public.docs set data = jsonb_set(data, '{done}', to_jsonb(coalesce(done, false)))
   where id = public.doc_uuid(g.hh, 'item', iid) and list_id = g.list_doc and kind = 'item' and not deleted;
  return found;
end $$;

create function public.guest_add(t text, items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare g record; e jsonb; n integer := 0; iid text; nm text; q text; c text; open_cnt integer;
begin
  select * into g from public.guest_resolve(t);
  if g.hh is null then return -1; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 30 then return 0; end if;
  select count(*) into open_cnt from public.docs where list_id = g.list_doc and kind = 'item' and not deleted;
  if open_cnt + jsonb_array_length(items) > 300 then return 0; end if;
  for e in select * from jsonb_array_elements(items) loop
    iid := e->>'id'; nm := left(trim(coalesce(e->>'name', '')), 80); q := left(trim(coalesce(e->>'qty', '')), 20); c := left(coalesce(e->>'cat', ''), 30);
    if iid !~ '^[a-z0-9]{4,20}$' or nm = '' or c !~ '^[A-Za-z0-9_-]*$' then continue; end if;
    insert into public.docs (id, household_id, kind, list_id, visible_to, data)
      values (public.doc_uuid(g.hh, 'item', iid), g.hh, 'item', g.list_doc, g.vis,
              jsonb_build_object('id', iid, 'name', nm, 'qty', q, 'note', '', 'cat', c, 'done', false,
                                 'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint + n, '_list', g.lid))
      on conflict (id) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ═════════ Wer darf welche Funktion aufrufen ═════════
-- Standard in Postgres: jeder. Deshalb erst allen wegnehmen, dann gezielt erlauben.

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_member(uuid) to authenticated;   -- wird in den Zugriffsregeln gebraucht
grant execute on function
  public.my_groups(), public.create_group(text), public.rename_group(uuid, text), public.create_invite(uuid),
  public.accept_invite(text), public.leave_group(uuid), public.remove_member(uuid, text), public.delete_account(), public.purge_deleted(),
  public.siri_new_key(uuid, text), public.siri_set_list(uuid, text), public.siri_info(), public.siri_off(), public.siri_take(),
  public.guest_link(uuid, text), public.guest_link_off(text)
  to authenticated;
-- Ohne Anmeldung (Siri-Kurzbefehl, Gast-Ansicht), jeweils nur mit gültigem Schlüssel wirksam
grant execute on function public.siri_add(text, text), public.guest_get(text), public.guest_check(text, text, boolean),
  public.guest_add(text, jsonb) to anon, authenticated;
