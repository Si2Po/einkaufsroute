-- Liste per Link teilen, ohne Konto (ab App-Version 0.8.0)
-- Wer den Link hat, sieht genau diese eine Liste (mit den Kategorien der Gruppe zum Sortieren), kann abhaken und
-- hinzufügen. Löschen, Bearbeiten und alles andere geht nicht. „Teilen beenden“ macht den Link sofort ungültig.
--
-- Sicherheit (wie beim Siri-Schlüssel):
-- * Die Tabelle guest_links ist von außen nicht erreichbar. Gäste kommen nur über die Funktionen unten an Daten.
-- * Der Schlüssel im Link wird nur als SHA-256-Prüfsumme gespeichert.
-- * Alles, was ein Gast schickt, wird geprüft (Länge, Zeichen, Anzahl) und als reiner Wert gespeichert.
-- Kann gefahrlos mehrfach ausgeführt werden.

create table if not exists public.guest_links (
  key_hash text primary key,
  household_id uuid not null references public.households on delete cascade,
  list_lid text not null,                 -- lokale ID der Liste in der App
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  unique (household_id, list_lid)
);
alter table public.guest_links enable row level security;
revoke all on public.guest_links from public, anon, authenticated;

-- Dokument-ID genau wie in der App (sync.js, docId): SHA-256 aus „Gruppe|Art|lokale ID“, als UUID geschrieben
create or replace function public.doc_uuid(g uuid, kind text, lid text) returns uuid
language plpgsql immutable set search_path = public as $$
declare b bytea := substring(sha256(convert_to(g::text || '|' || kind || '|' || lid, 'UTF8')) from 1 for 16);
begin
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 80);
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
  return encode(b, 'hex')::uuid;
end $$;

-- Link erzeugen (ersetzt einen alten Link derselben Liste). Gibt den Schlüssel zurück.
create or replace function public.guest_link(g uuid, lid text) returns text
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

-- Teilen beenden
create or replace function public.guest_link_off(lid text) returns void
language sql security definer set search_path = public as $$
  delete from public.guest_links where list_lid = lid and public.is_member(household_id);
$$;

-- Intern: Link prüfen und die Liste finden. Wurde die Liste in eine andere Gruppe verschoben, zieht der Link mit
-- (nur in Gruppen der Person, die den Link erzeugt hat). Ergebnis: Gruppe, Listen-Dokument, Sichtbarkeit, Listendaten.
create or replace function public.guest_resolve(t text, out hh uuid, out list_doc uuid, out vis uuid, out ldata jsonb, out lid text)
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

-- Gast: Liste lesen. null = Link ungültig.
create or replace function public.guest_get(t text) returns jsonb
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

-- Gast: abhaken / Haken entfernen
create or replace function public.guest_check(t text, iid text, done boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from public.guest_resolve(t);
  if g.hh is null then return false; end if;
  update public.docs set data = jsonb_set(data, '{done}', to_jsonb(coalesce(done, false)))
   where id = public.doc_uuid(g.hh, 'item', iid) and list_id = g.list_doc and kind = 'item' and not deleted;
  return found;
end $$;

-- Gast: Einträge hinzufügen. items = [{ id, name, qty, cat }], die App des Gastes hat den Text schon zerlegt und eingeordnet.
create or replace function public.guest_add(t text, items jsonb) returns integer
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

revoke execute on function public.doc_uuid(uuid, text, text), public.guest_link(uuid, text), public.guest_link_off(text),
  public.guest_resolve(text), public.guest_get(text), public.guest_check(text, text, boolean), public.guest_add(text, jsonb) from public, anon;
grant execute on function public.guest_link(uuid, text), public.guest_link_off(text) to authenticated;
grant execute on function public.guest_get(text), public.guest_check(text, text, boolean), public.guest_add(text, jsonb) to anon, authenticated;
