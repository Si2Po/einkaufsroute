-- Zeitpunkt des Abhakens am Eintrag (ab App-Version 0.8.2)
-- Hakt ein Gast (Gast-Ansicht im Browser, Pebble-Uhr) etwas ab, merkt sich der Eintrag jetzt wann (Feld dt, Millisekunden
-- wie ts). Die App setzt dt beim eigenen Abhaken selbst. Damit steht in „Erledigt“ überall das zuletzt Abgehakte oben,
-- und die App trägt Käufe, die ein Gast abgehakt hat, in die Kaufhistorie für die Vorschläge nach.
--
-- Ändert nur zwei Funktionen aus gast.sql, keine Tabelle und keine Daten. Rechte bleiben, wie sie sind.
-- Kann gefahrlos mehrfach ausgeführt werden. Ohne diesen Schritt läuft alles weiter, nur ohne dt bei Gast-Haken.

-- Gast: Liste lesen. null = Link ungültig. Neu: dt je Eintrag.
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
                      'sec', d.data->>'sec', 'ord', d.data->'ord', 'ts', d.data->'ts', 'dt', d.data->'dt')), '[]'::jsonb)
               from public.docs d where d.list_id = g.list_doc and d.kind = 'item' and not d.deleted));
end $$;

-- Gast: abhaken / Haken entfernen. Neu: Abhaken setzt dt (jetzt), Haken entfernen löscht dt.
-- Ist der Eintrag schon abgehakt und hat einen Zeitpunkt, bleibt der stehen (doppelt geschickt = keine Änderung).
create or replace function public.guest_check(t text, iid text, done boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from public.guest_resolve(t);
  if g.hh is null then return false; end if;
  update public.docs set data = case
      when not coalesce(done, false) then jsonb_set(data, '{done}', 'false'::jsonb) - 'dt'::text
      when coalesce((data->>'done')::boolean, false) and data ? 'dt' then data
      else jsonb_set(jsonb_set(data, '{done}', 'true'::jsonb), '{dt}', to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint))
    end
   where id = public.doc_uuid(g.hh, 'item', iid) and list_id = g.list_doc and kind = 'item' and not deleted;
  return found;
end $$;
