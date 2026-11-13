-- Kaufhistorie (ab App-Version 0.7.5): neue Datenart „hist“ in der Tabelle docs erlauben.
-- Ein hist-Dokument je Produkt und Gruppe: { id, name, t: [Zeitpunkte, zu denen es abgehakt wurde] }.
-- Zugriff regeln die bestehenden Policies (Mitglieder der Gruppe), daran ändert sich nichts.
-- Kann gefahrlos mehrfach ausgeführt werden.

alter table public.docs drop constraint if exists docs_kind_check;
alter table public.docs add constraint docs_kind_check
  check (kind in ('settings', 'store', 'cat', 'list', 'item', 'meal', 'hist'));
