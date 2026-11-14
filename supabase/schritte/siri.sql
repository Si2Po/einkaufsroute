-- Siri-Eingang (ab App-Version 0.7.8)
-- Ein Siri-Kurzbefehl kann mit einem persönlichen Siri-Schlüssel Text in einen Eingangskorb legen,
-- auch bei gesperrtem iPhone. Die App holt den Korb beim Abgleich ab und setzt die Einträge auf die Liste.
--
-- Sicherheit:
-- * Die beiden Tabellen sind von außen nicht direkt erreichbar (Row Level Security ohne Freigaben).
--   Alles läuft über die Funktionen unten.
-- * Der Siri-Schlüssel wird nur als SHA-256-Prüfsumme gespeichert, nie im Klartext.
-- * Mit dem Schlüssel kann man nur Text in den Korb legen: nichts lesen, ändern oder löschen.
-- * Der Text wird als reiner Wert gespeichert (keine zusammengesetzten SQL-Befehle), höchstens 500 Zeichen,
--   und es gibt Obergrenzen gegen Überfluten.
-- Kann gefahrlos mehrfach ausgeführt werden.

create table if not exists public.siri_keys (
  user_id uuid primary key references auth.users on delete cascade,
  key_hash text not null unique,
  household_id uuid not null references public.households on delete cascade,
  list_lid text not null,               -- lokale ID der Ziel-Liste in der App
  created_at timestamptz not null default now()
);

create table if not exists public.siri_inbox (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  list_lid text not null,
  text text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists siri_inbox_hh on public.siri_inbox (household_id);

alter table public.siri_keys enable row level security;
alter table public.siri_inbox enable row level security;
revoke all on public.siri_keys, public.siri_inbox from public, anon, authenticated;

-- Prüfsumme eines Schlüssels (sha256 ist in Postgres eingebaut, keine Erweiterung nötig)
create or replace function public.siri_hash(k text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(k, ''), 'UTF8')), 'hex');
$$;

-- Neuen Siri-Schlüssel erzeugen (ersetzt einen alten). Wird nur dieses eine Mal im Klartext zurückgegeben.
create or replace function public.siri_new_key(g uuid, lid text) returns text
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

-- Ziel-Liste ändern, der Schlüssel bleibt gleich
create or replace function public.siri_set_list(g uuid, lid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_member(g) then raise exception 'Keine Berechtigung'; end if;
  update public.siri_keys set household_id = g, list_lid = lid where user_id = auth.uid();
end $$;

-- Eigene Siri-Einstellung (ohne Schlüssel): { g, lid, created_at } oder null
create or replace function public.siri_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('g', household_id, 'lid', list_lid, 'created_at', created_at)
    from public.siri_keys where user_id = auth.uid();
$$;

-- Siri ausschalten: Schlüssel löschen
create or replace function public.siri_off() returns void
language sql security definer set search_path = public as $$
  delete from public.siri_keys where user_id = auth.uid();
$$;

-- Vom Kurzbefehl aufgerufen (ohne Anmeldung, nur mit Schlüssel). Gibt immer einen Satz für Siri zurück.
create or replace function public.siri_add(k text, t text) returns text
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

-- Von der App beim Abgleich aufgerufen: holt und leert den Eingang aller eigenen Gruppen.
-- Löschen und Zurückgeben in einem Schritt, damit nicht zwei Geräte dasselbe eintragen.
create or replace function public.siri_take() returns jsonb
language sql security definer set search_path = public as $$
  with d as (
    delete from public.siri_inbox i
     where auth.uid() is not null and public.is_member(i.household_id)
    returning i.id, i.household_id, i.list_lid, i.text, i.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('g', household_id, 'lid', list_lid, 't', text, 'at', created_at) order by id), '[]'::jsonb) from d;
$$;

revoke execute on function public.siri_hash(text), public.siri_new_key(uuid, text), public.siri_set_list(uuid, text),
  public.siri_info(), public.siri_off(), public.siri_add(text, text), public.siri_take() from public, anon;
grant execute on function public.siri_new_key(uuid, text), public.siri_set_list(uuid, text),
  public.siri_info(), public.siri_off(), public.siri_take() to authenticated;
grant execute on function public.siri_add(text, text) to anon, authenticated;
