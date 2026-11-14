'use strict';
/* Konto, Gruppen und Synchronisation (Supabase, nur über fetch – keine Bibliothek).

   Jeder Laden, jede Kategorie, Liste, jeder Eintrag und jedes Essen ist ein "Dokument" in der Tabelle docs.
   Die Dokument-ID wird aus Gruppe (household) + Art + lokaler ID berechnet. Dadurch müssen lokale IDs nicht umgeschrieben werden,
   und zwei Geräte, die dieselbe Standard-Kategorie haben, meinen automatisch dasselbe Dokument.
   Ablauf eines Durchgangs (für jede eigene Gruppe): erst eigene Änderungen hochladen (Vergleich über Hash), dann Änderungen der anderen holen.
   Gewinnt bei gleichzeitiger Änderung am selben Dokument: wer zuletzt hochlädt. Gelöschtes bleibt als Markierung (deleted) erhalten. */

const EK = Object.assign({
  url: 'https://hshlepbjrqqfpvjcghmy.supabase.co',
  key: 'sb_publishable_yxlkJ_Na6A0s-3guPHAUYQ_j2y4JMpO'
}, window.EK_CONFIG || {});

const sync = { sess: null, groups: [], gs: {}, legacyHid: null, status: 'out', last: 0, err: '', busy: false, again: false, dirty: false, ver: 0, quiet: false, joinCode: null, renderLater: false, ready: false };

// ---------- Speicher für Anmeldung und Abgleichstand ----------
async function kvGet(k) {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => rej(q.error); });
  } catch (_) { try { return JSON.parse(localStorage.getItem('ek_' + k) || 'null'); } catch (__) { return null; } }
}
async function kvSet(k, v) {
  try { const db = await openDb(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); }
  catch (_) { try { localStorage.setItem('ek_' + k, JSON.stringify(v)); } catch (__) { /* gesperrt */ } }
}
const persistSync = () => kvSet('sync', { sess: sync.sess, groups: sync.groups, gs: sync.gs, v: 2 });

// ---------- Hilfen ----------
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((q) => [q, x[q]])) : x));
function h53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const idCache = new Map();
async function docId(g, kind, lid) {
  const key = g + '|' + kind + '|' + lid; // g = Gruppe (household)
  if (idCache.has(key)) return idCache.get(key);
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b.slice(0, 16)].map((v) => v.toString(16).padStart(2, '0')).join('');
  const id = `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  idCache.set(key, id);
  return id;
}
const rowHash = (r) => h53(stable([r.kind, r.list_id, r.visible_to, r.data]));

// ---------- Netzwerk ----------
async function api(path, opt = {}, noRefresh = false) {
  const go = async () => {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
    try {
      const headers = { apikey: EK.key, 'Content-Type': 'application/json', ...(opt.headers || {}) };
      if (sync.sess) headers.Authorization = 'Bearer ' + sync.sess.access_token;
      return await fetch(EK.url + path, { ...opt, headers, signal: ctl.signal });
    } finally { clearTimeout(to); }
  };
  let res = await go();
  if (res.status === 401 && sync.sess && !noRefresh && await refreshSession()) res = await go();
  const txt = await res.text();
  let body = null;
  try { body = txt ? JSON.parse(txt) : null; } catch (_) { body = txt; }
  if (!res.ok) {
    const e = new Error((body && (body.msg || body.message || body.error_description || body.error)) || ('HTTP ' + res.status));
    e.status = res.status; e.body = body;
    throw e;
  }
  return body;
}
const niceError = (e) => {
  const m = String(e && e.message || e);
  if (/invalid login/i.test(m)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/already registered|already been registered/i.test(m)) return 'Diese E-Mail ist schon registriert – bitte anmelden.';
  if (/password.*(short|least|characters)/i.test(m)) return 'Das Passwort ist zu kurz (mindestens 6 Zeichen).';
  if (/valid email|invalid.*email|unable to validate email/i.test(m)) return 'Bitte eine gültige E-Mail-Adresse eingeben.';
  if (/email not confirmed/i.test(m)) return 'Die E-Mail ist noch nicht bestätigt.';
  if (/different from the old/i.test(m)) return 'Das neue Passwort muss anders sein als das alte.';
  if (/reauthenticat|recently signed in/i.test(m)) return 'Bitte einmal ab- und wieder anmelden, dann nochmal versuchen.';
  if (/rate limit|too many/i.test(m)) return 'Zu viele Versuche. Bitte kurz warten.';
  if (/ungültig oder abgelaufen/i.test(m)) return 'Die Einladung ist ungültig oder abgelaufen.';
  if (e instanceof TypeError || e.name === 'AbortError' || /failed to fetch|network|load failed/i.test(m)) return 'Keine Verbindung zum Server.';
  return m;
};
const isOffline = (e) => e instanceof TypeError || e.name === 'AbortError';

// ---------- Anmeldung ----------
function takeSession(r) {
  sync.sess = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (r.expires_in || 3600), user: { id: r.user.id, email: r.user.email } };
}
let refreshing = null;
function refreshSession() {
  if (!sync.sess) return Promise.resolve(false);
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const rt = sync.sess.refresh_token;
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
      const res = await fetch(EK.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: EK.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }), signal: ctl.signal });
      clearTimeout(to);
      if (res.status === 400 || res.status === 401 || res.status === 403) { sync.sess = null; sync.status = 'out'; sync.err = 'Bitte neu anmelden.'; persistSync(); return false; }
      if (!res.ok) return false;
      takeSession(await res.json()); persistSync(); return true;
    } catch (_) { return false; } finally { refreshing = null; }
  })();
  return refreshing;
}
async function authCall(kind, email, password) {
  const path = kind === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
  const saved = sync.sess; sync.sess = null;
  try {
    const r = await api(path, { method: 'POST', body: JSON.stringify({ email, password }) }, true);
    if (!r || !r.access_token) { sync.sess = saved; return { needsConfirm: true }; }
    takeSession(r);
    forgetGroups(); sync.err = '';
    persistSync();
    return { ok: true };
  } catch (e) { sync.sess = saved; throw e; }
}
// Anmelden/Abmelden: Gruppen-Zuordnung vergessen. Die Daten bleiben auf dem Gerät, gelten aber als „noch keiner Gruppe zugeordnet“.
function forgetGroups() {
  sync.groups = []; sync.gs = {}; sync.legacyHid = null;
  if (typeof S === 'undefined' || !S || !S.lists) return;
  for (const arr of [S.lists, S.stores, S.meals || []]) for (const x of arr) delete x.g;
  S.catGroup = null; S.gcats = {}; S.gset = {}; S.lastGroup = null;
}

// ---------- Gruppen ----------
// Eine Gruppe ist technisch ein „household“. Die App hält die Daten ALLER eigenen Gruppen gleichzeitig:
//   Listen, Geschäfte und Essen merken sich ihre Gruppe im Feld g.
//   Kategorien/Stichwörter: S.cats = die gewählte Stichwortliste (Gruppe S.catGroup); die der anderen Gruppen liegen in S.gcats[g].
//   Einstellungen (Tags, zuletzt getippt): aktive in S.customTags/S.recent, die der anderen Gruppen in S.gset[g].
// Pro Gruppe gibt es einen eigenen Abgleich-Stand: sync.gs[g] = { cursor, known }.
const gsOf = (g) => (sync.gs[g] = sync.gs[g] || { cursor: null, known: {} });
const personalGroup = () => sync.groups.find((x) => x.kind === 'personal')?.id || sync.groups[0]?.id || null;
const groupName = (g) => sync.groups.find((x) => x.id === g)?.name || '';
let groupsRun = 0;
async function refreshGroups(force) {
  if (!force && sync.groups.length && groupsRun++ % 6) return true; // nicht bei jedem Durchgang
  try {
    const list = await api('/rest/v1/rpc/my_groups', { method: 'POST', body: '{}' });
    if (Array.isArray(list) && list.length) { sync.groups = list; return true; }
  } catch (e) {
    // Nur wenn die Funktion in der Datenbank fehlt (404), auf den alten Weg ausweichen. Bei anderen Fehlern lieber abbrechen,
    // sonst würden Gruppen kurz „verschwinden“ und ihre Daten hier ausgeblendet.
    if (isOffline(e) || e.status !== 404) throw e;
    // Datenbank noch ohne Gruppen-Ergänzung: wie früher mit dem einen aktiven Haushalt weiterarbeiten
    const p = await api(`/rest/v1/profiles?select=household_id&user_id=eq.${sync.sess.user.id}`);
    const hid = p && p[0] && p[0].household_id;
    if (hid) { sync.groups = [{ id: hid, name: 'Haushalt', kind: 'shopping', members: [] }]; return true; }
  }
  throw new Error('Keine Gruppe gefunden');
}
// Gruppe der Stichwortliste wechseln (Einstellungen → Kategorien)
function setCatGroup(g) {
  if (!g || g === S.catGroup) return;
  S.gcats = S.gcats || {}; S.gset = S.gset || {};
  if (S.catGroup) { S.gcats[S.catGroup] = S.cats; S.gset[S.catGroup] = { customTags: S.customTags || [], recent: S.recent || [] }; }
  S.catGroup = g;
  S.cats = S.gcats[g] && S.gcats[g].length ? S.gcats[g] : DEFAULT_CATS.map(cloneCat);
  const st = S.gset[g] || {};
  S.customTags = st.customTags || []; S.recent = st.recent || [];
  delete S.gcats[g]; delete S.gset[g];
  CATS = S.cats; indexCats();
}
// Alles ohne Gruppe (neu angelegt, aus einer Sicherung, aus der Zeit vor den Gruppen) bekommt eine
function assignGroups(def) {
  if (!def) return false;
  let n = 0;
  for (const arr of [S.lists, S.stores, S.meals || []]) for (const x of arr) if (!x.g || !sync.groups.some((gr) => gr.id === x.g)) { x.g = def; n++; }
  if (!S.catGroup) { S.catGroup = def; n++; }
  return n > 0;
}
// Gruppe verlassen oder aufgelöst: ihre Daten verschwinden hier
function dropGone() {
  const ids = new Set(sync.groups.map((x) => x.id));
  const gone = (x) => x.g && !ids.has(x.g);
  const before = S.lists.length + S.stores.length + (S.meals || []).length;
  S.lists = S.lists.filter((x) => !gone(x)); S.stores = S.stores.filter((x) => !gone(x)); S.meals = (S.meals || []).filter((x) => !gone(x));
  Object.keys(sync.gs).forEach((g) => { if (!ids.has(g)) delete sync.gs[g]; });
  Object.keys(S.gcats || {}).forEach((g) => { if (!ids.has(g)) delete S.gcats[g]; });
  Object.keys(S.hist || {}).forEach((g) => { if (g && !ids.has(g)) delete S.hist[g]; }); // Kaufhistorie verlassener Gruppen
  Object.keys(S.gset || {}).forEach((g) => { if (!ids.has(g)) delete S.gset[g]; });
  if (S.catGroup && !ids.has(S.catGroup)) { const c = S.catGroup; S.catGroup = null; setCatGroup(personalGroup()); delete (S.gcats || {})[c]; }
  return before !== S.lists.length + S.stores.length + (S.meals || []).length;
}

// ---------- Lokale Daten -> Dokumente (je Gruppe) ----------
async function buildDocs() {
  const snap = snapshot();
  const uidv = sync.sess.user.id;
  const out = new Map(); // g -> Map(docId -> { row, kind, lid, h })
  const put = async (g, kind, lid, data, listLid, priv) => {
    if (!g) return;
    const id = await docId(g, kind, lid);
    const list_id = kind === 'list' ? id : (listLid ? await docId(g, 'list', listLid) : null);
    const row = { id, household_id: g, kind, list_id, visible_to: priv ? uidv : null, data, deleted: false };
    if (!out.has(g)) out.set(g, new Map());
    out.get(g).set(id, { row, kind, lid, h: rowHash(row) });
  };
  if (snap.catGroup) {
    await put(snap.catGroup, 'settings', 'main', { customTags: snap.customTags || [], recent: snap.recent || [] });
    for (const [i, c] of (snap.cats || []).entries()) await put(snap.catGroup, 'cat', c.id, { ...c, _o: i });
  }
  for (const [g, st] of Object.entries(snap.gset || {})) await put(g, 'settings', 'main', { customTags: st.customTags || [], recent: st.recent || [] });
  for (const [g, cats] of Object.entries(snap.gcats || {})) for (const [i, c] of cats.entries()) await put(g, 'cat', c.id, { ...c, _o: i });
  for (const [i, s] of (snap.stores || []).entries()) { const { g, ...rest } = s; await put(g, 'store', s.id, { ...rest, _o: i }); }
  for (const m of snap.meals || []) { const { g, ...rest } = m; await put(g, 'meal', m.id, rest); }
  for (const [i, l] of (snap.lists || []).entries()) {
    const { items, g, ...rest } = l;
    await put(g, 'list', l.id, { ...rest, _o: i }, null, l.private);
    for (const it of items || []) await put(g, 'item', it.id, { ...it, _list: l.id }, l.id, l.private);
  }
  // Kaufhistorie (ein Dokument je Produkt und Gruppe). Erst, wenn die Datenbank die Art „hist“ kennt (supabase/historie.sql).
  if (!sync.noHist) for (const [g, h] of Object.entries(snap.hist || {})) for (const e of Object.values(h)) await put(g, 'hist', e.id, e);
  return out;
}
const knownEntry = (d) => ({ h: d.h, lid: d.lid, kind: d.row.kind, l: d.row.list_id, v: d.row.visible_to });

// ---------- Aufräumen (supabase/aufraeumen.sql) ----------
// Gelöschtes bleibt auf dem Server als leere Markierung. Nach PURGE_DAYS räumt purge_deleted() sie weg.
// Lokal merkt sich „known“ zu jeder Löschung, wann sie bekannt wurde (t), und vergisst sie nach derselben Frist.
const PURGE_DAYS = 90; // DAY (ein Tag in ms) kommt aus js/historie.js
const delMark = (kind) => ({ del: 1, kind, t: Date.now() });
function tidyKnown(g) {
  const known = gsOf(g).known, old = Date.now() - (PURGE_DAYS + 10) * DAY;
  for (const [id, k] of Object.entries(known)) {
    if (!k.del) continue;
    if (!k.t) k.t = Date.now(); // Löschungen von vor diesem Update: ab jetzt zählen
    else if (k.t < old) delete known[id];
  }
}
// Länger als PURGE_DAYS nicht abgeglichen: Die Server-Markierungen für Löschungen aus dieser Zeit können schon weg sein.
// Dann einmal alle noch vorhandenen IDs holen; was hier bekannt, dort aber verschwunden ist, gilt als gelöscht.
async function catchUpRows(g) {
  const st = gsOf(g), last = st.at || (st.cursor ? Date.parse(st.cursor) : Date.now());
  if (Date.now() - last < (PURGE_DAYS - 7) * DAY) return [];
  const live = new Set();
  for (let off = 0; ; off += 1000) {
    const page = await api(`/rest/v1/docs?select=id&household_id=eq.${g}&deleted=is.false&order=id.asc&limit=1000&offset=${off}`);
    page.forEach((r) => live.add(r.id));
    if (page.length < 1000) break;
  }
  return Object.entries(st.known).filter(([id, k]) => !k.del && !live.has(id)).map(([id, k]) => ({ id, kind: k.kind, deleted: true, data: {} }));
}
// Höchstens einmal am Tag je Gerät die Datenbank aufräumen lassen. Fehlt aufraeumen.sql, passiert einfach nichts.
async function purgeDaily() {
  let last = 0;
  try { last = +localStorage.getItem('ek_purge') || 0; } catch (_) { /* privat */ }
  if (Date.now() - last < DAY) return;
  try { localStorage.setItem('ek_purge', String(Date.now())); } catch (_) { /* privat */ }
  try { await api('/rest/v1/rpc/purge_deleted', { method: 'POST', body: '{}' }); } catch (_) { /* nicht wichtig */ }
  Object.keys(sync.gs).forEach(tidyKnown);
}

async function pushChanges(g, cur) {
  const known = gsOf(g).known, rows = [];
  for (const [id, d] of cur) if (!known[id] || known[id].h !== d.h) rows.push({ row: d.row, k: knownEntry(d) });
  for (const [id, k] of Object.entries(known)) {
    if (!cur.has(id) && !k.del) rows.push({ row: { id, household_id: g, kind: k.kind, list_id: k.l, visible_to: k.v, data: {}, deleted: true }, k: delMark(k.kind) });
  }
  let batch = [], size = 0;
  const flush = async () => {
    if (!batch.length) return;
    await api('/rest/v1/docs?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch.map((b) => b.row)) });
    batch.forEach((b) => { known[b.row.id] = b.k; });
    batch = []; size = 0;
    persistSync();
  };
  const send = async (list) => {
    for (const r of list) {
      const s = JSON.stringify(r.row).length;
      if (batch.length && (size + s > 700000 || batch.length >= 100)) await flush();
      batch.push(r); size += s;
    }
    await flush();
  };
  // Kaufhistorie getrennt und zuletzt: Kennt die Datenbank „hist“ noch nicht (historie.sql nicht ausgeführt),
  // lehnt sie nur diese Zeilen ab, und der übrige Abgleich läuft normal weiter. Bis zum nächsten Start nicht erneut versuchen.
  await send(rows.filter((r) => r.row.kind !== 'hist'));
  try { await send(rows.filter((r) => r.row.kind === 'hist')); } catch (e) {
    batch = []; size = 0;
    if (isOffline(e) || e.status !== 400) throw e;
    sync.noHist = true;
  }
  return rows.length;
}

// ---------- Dokumente -> lokale Daten (je Gruppe) ----------
async function pullRows(g) {
  const cursor = gsOf(g).cursor, rows = [];
  for (let off = 0; ; off += 500) {
    const q = `/rest/v1/docs?select=*&household_id=eq.${g}` + (cursor ? `&updated_at=gte.${encodeURIComponent(cursor)}` : '') + `&order=updated_at.asc,id.asc&limit=500&offset=${off}`;
    const page = await api(q);
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}
const KIND_ORDER = ['settings', 'cat', 'store', 'list', 'meal', 'item', 'hist'];
function upsertIn(arr, ent) {
  const i = arr.findIndex((x) => x.id === ent.id);
  if (i >= 0) arr[i] = ent; else arr.push(ent);
}
const removeWhere = (arr, fn) => { const i = arr.findIndex(fn); if (i >= 0) arr.splice(i, 1); };

// rows: Zeilen der Gruppe g vom Server; pending: Dokument-IDs mit noch nicht hochgeladener lokaler Änderung
async function applyRows(rows, pending, g) {
  const touched = [], known = gsOf(g).known;
  snapshot();
  S.gcats = S.gcats || {}; S.gset = S.gset || {};
  const catArr = () => (g === S.catGroup ? S.cats : (S.gcats[g] = S.gcats[g] || []));
  const ord = { cat: new Map(), store: new Map(), list: new Map() };
  catArr().forEach((x, i) => ord.cat.set(x.id, i)); S.stores.forEach((x, i) => ord.store.set(x.id, i)); S.lists.forEach((x, i) => ord.list.set(x.id, i));
  const todo = [];
  for (const r of rows) {
    const k = known[r.id];
    if (!r.deleted && k && k.h === rowHash(r)) continue;     // haben wir schon
    if (r.deleted && (!k || k.del)) { if (!k) known[r.id] = delMark(r.kind); continue; }
    if (pending.has(r.id)) continue;                         // lokale Änderung gewinnt, wird gleich hochgeladen
    todo.push(r);
  }
  todo.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  for (const r of todo) {
    const d = r.data || {};
    const lid = d.id ?? (known[r.id] && known[r.id].lid);
    if (r.deleted) {
      const kl = known[r.id] && known[r.id].lid;
      const mine = (x) => x.id === kl && x.g === g; // nur, was hier noch in dieser Gruppe liegt (sonst wurde es verschoben)
      if (r.kind === 'cat') removeWhere(catArr(), (x) => x.id === kl);
      else if (r.kind === 'store') removeWhere(S.stores, mine);
      else if (r.kind === 'meal') removeWhere(S.meals, mine);
      else if (r.kind === 'list') removeWhere(S.lists, mine);
      else if (r.kind === 'item') S.lists.forEach((l) => { if (l.g === g) removeWhere(l.items, (x) => x.id === kl); });
      else if (r.kind === 'hist') { if (S.hist?.[g]) delete S.hist[g][kl]; }
      known[r.id] = delMark(r.kind); touched.push({ id: r.id, gone: true, g });
      continue;
    }
    const { _o, _list, ...ent } = d;
    if (r.kind === 'settings') {
      if (g === S.catGroup) { S.customTags = ent.customTags || []; S.recent = ent.recent || []; } else S.gset[g] = { customTags: ent.customTags || [], recent: ent.recent || [] };
    } else if (r.kind === 'cat') { upsertIn(catArr(), ent); ord.cat.set(ent.id, _o ?? 999); }
    else if (r.kind === 'store') { ent.g = g; upsertIn(S.stores, ent); ord.store.set(ent.id, _o ?? 999); }
    else if (r.kind === 'meal') { ent.g = g; upsertIn(S.meals, ent); }
    else if (r.kind === 'list') {
      const old = S.lists.find((l) => l.id === ent.id);
      ent.items = old ? old.items : []; ent.g = g;
      upsertIn(S.lists, ent); ord.list.set(ent.id, _o ?? 999);
    } else if (r.kind === 'item') {
      const l = S.lists.find((x) => x.id === _list);
      if (!l) continue;
      S.lists.forEach((o) => { if (o !== l) removeWhere(o.items, (x) => x.id === ent.id); });   // Eintrag in andere Liste verschoben
      upsertIn(l.items, ent);
    } else if (r.kind === 'hist') {
      // Zusammenführen statt ersetzen: haben zwei Geräte gleichzeitig gekauft, zählen beide Zeitpunkte
      S.hist = S.hist || {}; const h = (S.hist[g] = S.hist[g] || {});
      h[ent.id] = histMerge(h[ent.id], ent);
    }
    touched.push({ id: r.id, lid, g });
  }
  const sortBy = (arr, m) => arr.sort((a, b) => (m.get(a.id) ?? 999) - (m.get(b.id) ?? 999));
  sortBy(catArr(), ord.cat); sortBy(S.stores, ord.store); sortBy(S.lists, ord.list);
  S.items.sort((a, b) => a.ts - b.ts);
  return touched;
}
// Nach dem Anwenden: aktive Liste/Geschäft/Kategorien wieder zusammenbringen
function repairState() {
  if (!S.lists.length) S.lists = [{ id: uid(), name: 'Einkaufsliste', items: [], g: personalGroup() || undefined }];
  if (!S.lists.some((l) => l.id === S.listId)) S.listId = S.lists[0].id;
  const l = curList();
  S.items = l.items;
  if (l.storeId !== undefined && S.stores.some((x) => x.id === l.storeId)) S.storeId = l.storeId;
  if (!S.stores.some((x) => x.id === S.storeId)) S.storeId = S.stores[0]?.id || null;
  if (!S.cats.length) S.cats.push(...DEFAULT_CATS.map(cloneCat));
  CATS = S.cats; indexCats();
}

// ---------- Ein Durchgang (alle Gruppen) ----------
async function syncRun() {
  if (!sync.sess || !sync.ready) return;
  if (sync.busy) { sync.again = true; return; }
  sync.busy = true; sync.status = 'busy'; paintStatus();
  try {
    if (sync.sess.expires_at - Date.now() / 1000 < 90 && !(await refreshSession())) { if (!sync.sess) throw new Error('Bitte neu anmelden.'); }
    await refreshGroups(false);
    let changed = dropGone();
    const groups = sync.groups.map((x) => x.id);
    // Erster Abgleich einer Gruppe auf diesem Gerät: erst schauen, was der Server hat
    const firstRows = new Map();
    for (const g of groups) { const st = gsOf(g); if (st.cursor === null && !Object.keys(st.known).length) firstRows.set(g, await pullRows(g)); }
    if (firstRows.size) {
      const serverHas = [...firstRows.values()].some((rows) => rows.some((r) => !r.deleted));
      const unassigned = S.lists.some((x) => !x.g) || S.stores.some((x) => !x.g) || (S.meals || []).some((x) => !x.g);
      if (unassigned && serverHas && !sync.legacyHid) {
        // Neues Gerät / neue Anmeldung: Daten vom Server ersetzen die (unzugeordneten) Daten hier – Sicherung bleibt
        await kvSet('backup', { t: Date.now(), state: snapshot() });
        S.lists = S.lists.filter((x) => x.g); S.stores = S.stores.filter((x) => x.g); S.meals = (S.meals || []).filter((x) => x.g);
        if (!S.catGroup) { S.cats = []; S.customTags = []; S.recent = []; }
      }
      for (const [g, rows] of firstRows) {
        if (!rows.some((r) => !r.deleted)) { sync.dirty = true; continue; } // Server leer: unsere Daten hochladen
        if (!S.catGroup && rows.some((r) => r.kind === 'cat' && !r.deleted)) { S.catGroup = g; S.cats = S.cats.length ? S.cats : []; }
        await applyRows(rows, new Set(), g);
        const cur = (await buildDocs()).get(g) || new Map(), known = gsOf(g).known;
        for (const [id, d] of cur) known[id] = knownEntry(d);
        for (const r of rows) { if (r.deleted) known[r.id] = delMark(r.kind); if (!gsOf(g).cursor || r.updated_at > gsOf(g).cursor) gsOf(g).cursor = r.updated_at; }
        changed = true;
      }
      if (!S.catGroup) { if (S.cats.length) S.catGroup = personalGroup(); else setCatGroup(personalGroup()); } // eigene Kategorien vom Gerät behalten
      repairState();
    }
    sync.legacyHid = null;
    if (assignGroups(S.lastGroup && groups.includes(S.lastGroup) ? S.lastGroup : (S.catGroup || personalGroup()))) { sync.dirty = true; changed = true; }
    // Hochladen
    const v0 = sync.ver;
    if (sync.dirty) {
      const cur = await buildDocs();
      for (const g of groups) await pushChanges(g, cur.get(g) || new Map());
      if (sync.ver === v0) sync.dirty = false;
    }
    // Holen
    let touched = [];
    for (const g of groups) {
      const rows = [...await catchUpRows(g), ...await pullRows(g)];
      const pending = new Set();
      if (sync.ver !== v0 || sync.dirty) { const cur = (await buildDocs()).get(g) || new Map(), known = gsOf(g).known; for (const [id, d] of cur) { const k = known[id]; if (!k || k.h !== d.h) pending.add(id); } }
      touched = touched.concat(await applyRows(rows, pending, g));
      for (const r of rows) if (r.updated_at && (!gsOf(g).cursor || r.updated_at > gsOf(g).cursor)) gsOf(g).cursor = r.updated_at;
      gsOf(g).at = Date.now(); // zuletzt vollständig abgeglichen (für catchUpRows)
    }
    if (touched.length) {
      repairState();
      const cur2 = await buildDocs();
      for (const t of touched) { if (t.gone) continue; const d = cur2.get(t.g)?.get(t.id); if (d) gsOf(t.g).known[t.id] = knownEntry(d); }
      changed = true;
    }
    purgeDaily(); // läuft nebenher, Ergebnis egal
    if (await siriTake()) changed = true; // Siri-Eingang (siri.js): setzt sync.dirty, der nächste Durchgang lädt die Einträge hoch
    if (changed) { sync.quiet = true; save(); }
    persistSync();
    sync.status = 'ok'; sync.err = ''; sync.last = Date.now();
    if (changed) renderSoon();
  } catch (e) {
    groupsRun = 0; // nach einem Fehler beim nächsten Mal die Gruppenliste neu holen (z. B. Gruppe auf anderem Gerät verlassen)
    sync.status = isOffline(e) ? 'offline' : (sync.sess ? 'err' : 'out');
    sync.err = niceError(e);
    if (!isOffline(e)) console.warn('sync', e);
  } finally {
    sync.busy = false; paintStatus();
    if (sync.again) { sync.again = false; setTimeout(syncRun, 300); }
  }
}
function renderSoon() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('input, textarea, select') && !dlg().contains(a)) { sync.renderLater = true; return; }
  sync.renderLater = false;
  render();
  if (pageTop() === 'account' && sync.sess) accountPage(ui.accMsg);
}
document.addEventListener('focusout', () => { if (sync.renderLater) setTimeout(() => { if (sync.renderLater) renderSoon(); }, 250); });

// Von save() aufgerufen
window.syncHook = () => {
  if (sync.quiet) { sync.quiet = false; return; }
  sync.dirty = true; sync.ver++;
  if (!sync.sess) return;
  clearTimeout(syncHook.t);
  syncHook.t = setTimeout(syncRun, 1200);
};

// ---------- Oberfläche ----------
const STATUS_TXT = { ok: 'Synchronisiert', busy: 'Synchronisiere …', offline: 'Offline – wird nachgeholt', err: 'Fehler beim Abgleich', out: 'Nicht angemeldet' };
const accountSub = () => (sync.sess ? `${esc(sync.sess.user.email)} · ${STATUS_TXT[sync.status] || ''}` : 'Nicht angemeldet – Daten nur auf diesem Gerät');
function paintStatus() {
  if (ui.tab === 'settings' && !dlg().open) { const el = document.querySelector('[data-act="accountsheet"] small'); if (el) el.innerHTML = accountSub(); }
  if (pageTop() === 'account' && sync.sess && !document.activeElement?.matches?.('.page input')) accountPage(ui.accMsg);
}
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'gerade eben' : s < 90 ? `vor ${s} s` : `vor ${Math.round(s / 60)} min`; };

function accountPage(msg) {
  ui.accMsg = msg;
  const note = msg ? `<p class="sheetnote" role="status" style="color:var(--${msg.startsWith('!') ? 'warn' : 'accent'})">${esc(msg.replace(/^!/, ''))}</p>` : '';
  const dataRow = `<div class="sheettitle" style="margin-top:16px">Daten</div>
    <div class="group"><button type="button" class="sheetbtn" data-act="datasheet"><span>Daten sichern und übertragen</span><small>Datei oder Text ›</small></button></div>`;
  if (!sync.sess) {
    const mail = $('#accMail')?.value || '', pass = $('#accPass')?.value || ''; // beim Neuzeichnen nichts Getipptes verlieren
    openPage('account', 'Konto und Gruppen', `
      <p class="sheetnote">Mit einem Konto liegen deine Daten sicher online, laufen auf mehreren Geräten und lassen sich mit anderen teilen. Ohne Konto bleibt alles wie bisher nur auf diesem Gerät.</p>
      ${sync.joinCode ? '<p class="sheetnote" style="color:var(--accent)">Du hast eine Einladung bekommen. Melde dich an oder registriere dich, danach kannst du sie annehmen.</p>' : ''}
      <form id="accForm" autocomplete="on" style="display:grid;gap:10px;margin-top:8px">
        <label class="field"><span>E-Mail</span><input id="accMail" type="email" autocomplete="email" inputmode="email" autocapitalize="off" value="${esc(mail)}" required></label>
        <label class="field"><span>Passwort</span><input id="accPass" type="password" autocomplete="current-password" minlength="6" value="${esc(pass)}" required></label>
        ${note}
        <div class="actions"><button type="submit" class="btn" style="flex:1" value="login">Anmelden</button><button type="submit" class="btn ghost" style="flex:1" value="signup">Registrieren</button></div>
      </form>
      <details class="pwforgot"><summary>Passwort vergessen?</summary>
        <p class="sheetnote">Die App verschickt keine E-Mails. Wende dich an die Person, die die App betreut: Sie kann dir ein neues Passwort setzen. Damit meldest du dich an und änderst es danach unter Konto und Gruppen → Passwort ändern.</p>
      </details>
      ${dataRow}`, () => accountPage(ui.accMsg));
    return;
  }
  const gRows = sync.groups.map((g) => `<button type="button" class="sheetbtn" data-act="acc_group" data-id="${g.id}"><span class="gname">${ICON_GROUP}${esc(g.name)}</span><small>${g.kind === 'personal' ? 'nur du' : `${(g.members || []).length} ${(g.members || []).length === 1 ? 'Mitglied' : 'Mitglieder'}`} ›</small></button>`).join('');
  openPage('account', 'Konto und Gruppen', `
    <div class="group acct" style="padding:12px 14px">
      <strong style="overflow-wrap:anywhere">${esc(sync.sess.user.email)}</strong>
      <p class="sheetnote" style="margin:2px 0 0">${STATUS_TXT[sync.status] || ''}${sync.status === 'ok' && sync.last ? ' · ' + ago(sync.last) : ''}${sync.err && sync.status !== 'ok' ? '<br>' + esc(sync.err) : ''}</p>
    </div>
    ${note}
    <div class="sheettitle" style="margin-top:16px">Gruppen</div>
    <p class="sheetnote" style="margin:0 4px 8px">Was in einer Gruppe liegt, sehen alle ihre Mitglieder. Du selbst siehst immer alles aus allen deinen Gruppen.</p>
    ${gRows ? `<div class="group">${gRows}</div>` : '<p class="sheetnote">Gruppen werden geladen …</p>'}
    <div class="actions" style="margin-top:8px">
      <button type="button" class="btn ghost" data-act="acc_newgroup">+ Neue Gruppe</button>
      <button type="button" class="btn ghost" data-act="acc_joinsheet">Einladung annehmen</button>
    </div>
    <div class="sheettitle" style="margin-top:16px">Siri</div>
    <div class="group"><button type="button" class="sheetbtn" data-act="siripage"><span>Mit Siri hinzufügen</span><small>auch bei gesperrtem iPhone ›</small></button></div>
    ${dataRow}
    <div class="group" style="margin-top:16px"><button type="button" class="sheetbtn" data-act="acc_pwpage"><span>Passwort ändern</span><small>›</small></button></div>
    <div class="actions" style="margin-top:16px"><button type="button" class="btn ghost" data-act="acc_sync">Jetzt abgleichen</button><button type="button" class="btn danger" data-act="acc_logout">Abmelden</button></div>`, () => accountPage(ui.accMsg));
}
// Eine Gruppe: Name, Mitglieder, einladen, verlassen
function groupPage(id, msg) {
  const g = sync.groups.find((x) => x.id === id);
  if (!g) { backTo('account', () => accountPage()); return; }
  const personal = g.kind === 'personal', me = sync.sess?.user.email;
  const count = (arr) => arr.filter((x) => x.g === id).length;
  const what = [`${count(S.lists)} ${count(S.lists) === 1 ? 'Liste' : 'Listen'}`, `${count(S.stores)} ${count(S.stores) === 1 ? 'Geschäft' : 'Geschäfte'}`, `${count(S.meals || [])} Essen`].join(' · ');
  openPage('group:' + id, g.name, `
    ${personal ? '' : `<label class="field"><span>Name</span><input id="grpName" data-id="${id}" value="${esc(g.name)}" autocomplete="off"></label>`}
    <p class="sheetnote" style="margin:4px">${personal ? 'Nur für dich. Diese Gruppe kann nicht geteilt oder verlassen werden.' : 'Alle Mitglieder sehen, was in dieser Gruppe liegt.'} Darin: ${what}.</p>
    ${msg ? `<p class="sheetnote" role="status" style="color:var(--${msg.startsWith('!') ? 'warn' : 'accent'})">${esc(msg.replace(/^!/, ''))}</p>` : ''}
    <div class="sheettitle" style="margin-top:12px">Mitglieder</div>
    <div class="group">${(g.members || []).map((m) => `<div class="sheetbtn"><span style="overflow-wrap:anywhere">${esc(m)}</span>${m === me ? '<small>du</small>' : ''}</div>`).join('') || '<p class="sheetnote">–</p>'}</div>
    ${personal ? '' : `<div class="actions" style="margin-top:12px">
      <button type="button" class="btn" data-act="acc_invite" data-id="${id}">Person einladen</button>
      <button type="button" class="btn danger" data-act="acc_leave" data-id="${id}">${ui.confirmLeave === id ? 'Wirklich verlassen?' : 'Gruppe verlassen'}</button>
    </div>
    ${ui.confirmLeave === id ? `<p class="sheetnote" style="color:var(--warn);margin:6px 4px">Danach siehst du die Listen, Geschäfte und Essen dieser Gruppe nicht mehr.${(g.members || []).length <= 1 ? ' Du bist das letzte Mitglied: die Gruppe wird mit allem gelöscht.' : ''}</p>` : ''}`}`, () => groupPage(id));
}
function newGroupSheet(msg) {
  openSheet(`<div class="sheettitle">Neue Gruppe</div>
    <form id="newGroupForm" autocomplete="off">
      <input id="newGroupName" autofocus class="notein" placeholder="Name, z. B. Einkauf oder Familie" aria-label="Name der Gruppe" required>
      ${msg ? `<p class="sheetnote" style="color:var(--warn)">${esc(msg)}</p>` : ''}
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
function joinPage(code, msg) {
  // Einladung aus einem Link nur einmal anzeigen, auch wenn sie nicht angenommen wird (z. B. schon in der Gruppe).
  // Sonst erschiene sie bei jedem Start wieder. Der Code steht ja im Feld und lässt sich jederzeit von Hand eingeben.
  if (sync.sess && sync.joinCode) { sync.joinCode = null; try { localStorage.removeItem('ek_join'); } catch (_) { /* egal */ } }
  openPage('join', 'Einladung annehmen', `
    <form id="joinForm" autocomplete="off" style="display:grid;gap:10px">
      <label class="field"><span>Einladungscode</span><input id="joinCode" value="${esc(code || '')}" autocapitalize="characters" autocomplete="off" ${code ? '' : 'autofocus'} required></label>
      <p class="sheetnote">Die Gruppe kommt zu deinen dazu. Deine eigenen Listen, Geschäfte und Essen bleiben, wie sie sind.</p>
      ${msg ? `<p class="sheetnote" style="color:var(--warn)">${esc(msg)}</p>` : ''}
      <button type="submit" class="btn">Beitreten</button>
    </form>`);
}
// Passwort ändern (angemeldet, ohne E-Mail)
function pwPage(msg) {
  openPage('pw', 'Passwort ändern', `
    <form id="pwForm" autocomplete="on" style="display:grid;gap:10px">
      <input type="email" autocomplete="username" value="${esc(sync.sess?.user.email || '')}" hidden>
      <label class="field"><span>Neues Passwort</span><input id="pwNew" type="password" autocomplete="new-password" minlength="6" required autofocus></label>
      <label class="field"><span>Noch einmal</span><input id="pwNew2" type="password" autocomplete="new-password" minlength="6" required></label>
      ${msg ? `<p class="sheetnote" style="color:var(--warn)">${esc(msg.replace(/^!/, ''))}</p>` : ''}
      <button type="submit" class="btn">Passwort ändern</button>
    </form>`);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (_) { return false; }
}
async function createInvite(g) {
  try {
    const code = await api('/rest/v1/rpc/create_invite', { method: 'POST', body: JSON.stringify({ g }) });
    const link = location.origin + location.pathname + '#join=' + code;
    openPage('invite', 'Person einladen', `
      <p class="sheetnote" style="margin:0 4px 8px">Schick diesen Link an die Person. Er gilt 7 Tage. Sie öffnet ihn auf ihrem Handy, meldet sich an und ist danach in der Gruppe „${esc(groupName(g))}“.</p>
      <input class="notein" id="invLink" readonly value="${esc(link)}" aria-label="Einladungslink">
      <p class="sheetnote" style="margin:8px 4px">Oder der Code zum Eintippen: <strong>${esc(code)}</strong></p>
      <button type="button" class="btn" data-act="acc_share" data-link="${esc(link)}">${navigator.share ? 'Teilen' : 'Link kopieren'}</button>`);
  } catch (e) { accountPage('!' + niceError(e)); }
}
async function acceptInvite(code) {
  try {
    const hid = await api('/rest/v1/rpc/accept_invite', { method: 'POST', body: JSON.stringify({ c: code }) });
    sync.joinCode = null; try { localStorage.removeItem('ek_join'); } catch (_) { /* egal */ }
    S.lastGroup = hid; // Neues landet erst einmal in der neuen Gruppe
    await refreshGroups(true);
    await syncRun();
    render();
    accountPage(sync.status === 'ok' ? `Du bist jetzt in der Gruppe „${groupName(hid) || 'Neue Gruppe'}“.` : '!' + (sync.err || 'Abgleich später'));
  } catch (e) { joinPage(code, niceError(e)); }
}

// ---------- Sichern und übertragen (Datei oder Text) ----------
const exportJson = () => JSON.stringify({ app: 'einkaufsroute', v: 1, state: snapshot() });
function dataPage(msg) {
  openPage('data', 'Daten sichern', `
    <p class="sheetnote" style="margin:0 4px 8px">Alles (Listen, Geschäfte, Stichwörter, Essen, Fotos) als Sicherung. So nimmst du deine Daten auch auf ein anderes Gerät oder in eine neue Installation mit.</p>
    <div class="group">
      <button type="button" class="sheetbtn" data-act="acc_dlfile"><span>Als Datei speichern</span><small>.json</small></button>
      <button type="button" class="sheetbtn" data-act="acc_copydata"><span>Als Text kopieren</span><small>Zwischenablage</small></button>
      <button type="button" class="sheetbtn" data-act="acc_importsheet"><span>Sicherung laden</span><small>ersetzt die Daten hier ›</small></button>
    </div>
    ${msg ? `<p class="sheetnote" role="status" style="margin:8px 4px;color:var(--${msg.startsWith('!') ? 'warn' : 'accent'})">${esc(msg.replace(/^!/, ''))}</p>` : ''}
    <div id="dataTextBox"></div>`);
}
function importPage(msg) {
  openPage('import', 'Sicherung laden', `
    <p class="sheetnote" style="color:var(--warn);margin:0 4px 8px">Achtung: Die Daten auf diesem Gerät werden durch die Sicherung ersetzt. Eine Kopie der bisherigen Daten bleibt auf dem Gerät.</p>
    <label class="field"><span>Datei wählen</span><input id="impFile" type="file" accept=".json,application/json,text/plain"></label>
    <label class="field" style="margin-top:8px"><span>Oder Text einfügen</span><textarea id="impText" rows="4" class="notein" placeholder="Sicherung hier einfügen" style="width:100%;font-size:16px"></textarea></label>
    ${msg ? `<p class="sheetnote" role="status" style="margin:8px 4px;color:var(--warn)">${esc(msg)}</p>` : ''}
    <button type="button" class="btn" style="margin-top:10px" data-act="acc_doimport">Laden</button>`);
}
function importJson(txt) {
  let o; try { o = JSON.parse(txt); } catch (_) { throw new Error('Das ist keine gültige Sicherung.'); }
  const st = o && o.app === 'einkaufsroute' ? o.state : null;
  if (!st || !Array.isArray(st.stores) || !Array.isArray(st.lists)) throw new Error('Das ist keine Sicherung von Einkaufsroute.');
  kvSet('backup', { t: Date.now(), state: snapshot() });
  const keepListId = st.listId;
  S = { ...st, items: [], listId: keepListId };
  S.recent = S.recent || []; S.meals = S.meals || []; S.customTags = S.customTags || [];
  S.cats = S.cats || DEFAULT_CATS.map(cloneCat);
  S.stores.forEach((x) => x.zones.forEach((z) => { z.prods = z.prods || {}; }));
  repairState();
  save(); render();
}
document.addEventListener('change', (e) => {
  if (e.target.id !== 'impFile' || !e.target.files[0]) return;
  const r = new FileReader();
  r.onload = () => { const t = $('#impText'); if (t) t.value = String(r.result); };
  r.readAsText(e.target.files[0]);
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.id === 'accForm') {
    e.preventDefault(); e.stopImmediatePropagation();
    const kind = (e.submitter && e.submitter.value) || 'login';
    const btns = f.querySelectorAll('button'); btns.forEach((b) => { b.disabled = true; });
    try {
      const r = await authCall(kind, $('#accMail').value.trim(), $('#accPass').value);
      if (r.needsConfirm) { accountPage('Bestätigungsmail verschickt. Bitte bestätige die E-Mail und melde dich dann an.'); return; }
      sync.status = 'busy';
      await syncRun();
      render();
      if (sync.joinCode && sync.sess) { joinPage(sync.joinCode); return; }
      accountPage(sync.status === 'ok' ? 'Angemeldet.' : (sync.err ? '!' + sync.err : ''));
    } catch (err) { accountPage('!' + niceError(err)); }
  } else if (f.id === 'pwForm') {
    e.preventDefault(); e.stopImmediatePropagation();
    const p1 = $('#pwNew').value, p2 = $('#pwNew2').value;
    if (p1 !== p2) { pwPage('!Die beiden Passwörter sind nicht gleich.'); return; }
    f.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await api('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: p1 }) });
      accountPage('Passwort geändert. Auf anderen Geräten bleibst du angemeldet.');
    } catch (err) { pwPage('!' + niceError(err)); }
  } else if (f.id === 'joinForm') {
    e.preventDefault(); e.stopImmediatePropagation();
    const code = $('#joinCode').value.trim();
    f.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    acceptInvite(code);
  }
}, true);
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act^="acc_"], [data-act="accountsheet"], [data-act="datasheet"]');
  if (!el) return;
  e.stopImmediatePropagation();
  const act = el.dataset.act;
  if (act === 'accountsheet') { accountPage(); return; }
  if (act === 'datasheet' || act === 'acc_databack') { dataPage(); return; }
  if (act === 'acc_importsheet') { importPage(); return; }
  if (act === 'acc_doimport') {
    try { importJson($('#impText').value.trim()); dataPage('Sicherung geladen.'); } catch (err) { importPage(err.message); }
    return;
  }
  if (act === 'acc_dlfile') {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
      a.download = 'einkaufsroute-sicherung.json'; document.body.appendChild(a); a.click(); a.remove();
      dataPage('Datei wird gespeichert. Falls nichts passiert, nimm „Als Text kopieren“.');
    } catch (_) { dataPage('!Speichern nicht möglich. Nimm „Als Text kopieren“.'); }
    return;
  }
  if (act === 'acc_copydata') {
    const txt = exportJson();
    if (await copyText(txt)) { dataPage('In die Zwischenablage kopiert.'); return; }
    dataPage('!Kopieren wurde blockiert. Markiere den Text unten und kopiere ihn von Hand.');
    $('#dataTextBox').innerHTML = '<textarea id="dataText" readonly rows="5" class="notein" style="width:100%;font-size:16px;margin-top:8px"></textarea>';
    const t = $('#dataText'); t.value = txt; t.focus(); t.select();
    return;
  }
  if (act === 'acc_back') accountPage();
  else if (act === 'acc_invite') createInvite(el.dataset.id);
  else if (act === 'acc_group') { ui.confirmLeave = null; groupPage(el.dataset.id); }
  else if (act === 'acc_newgroup') newGroupSheet();
  else if (act === 'acc_leave') {
    const g = el.dataset.id;
    if (ui.confirmLeave !== g) { ui.confirmLeave = g; groupPage(g); return; }
    ui.confirmLeave = null;
    try { await api('/rest/v1/rpc/leave_group', { method: 'POST', body: JSON.stringify({ g }) }); await refreshGroups(true); await syncRun(); render(); accountPage('Gruppe verlassen.'); }
    catch (err) { groupPage(g, '!' + niceError(err)); }
  }
  else if (act === 'acc_joinsheet') joinPage('');
  else if (act === 'acc_pwpage') pwPage();
  else if (act === 'acc_sync') { sync.dirty = true; sync.ver++; await syncRun(); accountPage(sync.status === 'ok' ? 'Abgeglichen.' : '!' + sync.err); }
  else if (act === 'acc_share') {
    const link = el.dataset.link;
    if (navigator.share) { try { await navigator.share({ title: 'Einkaufsroute', text: 'Komm in meinen Haushalt bei Einkaufsroute:', url: link }); } catch (_) { /* abgebrochen */ } }
    else { const ok = await copyText(link); const i = $('#invLink'); if (i) { i.select(); } toast(ok ? 'Link kopiert' : 'Link markiert – bitte kopieren'); }
  } else if (act === 'acc_logout') {
    sync.sess = null; forgetGroups(); sync.status = 'out'; sync.err = '';
    save();
    await persistSync();
    accountPage('Abgemeldet. Deine Daten bleiben auf diesem Gerät.');
    render();
  }
}, true);

// ---------- Start ----------
(async function syncInit() {
  const saved = await kvGet('sync');
  if (saved && saved.sess) {
    sync.sess = saved.sess; sync.status = 'busy';
    sync.groups = saved.groups || []; sync.gs = saved.gs || {};
    // Stand aus der Zeit vor den Gruppen: der bisherige Haushalt wird zur Gruppe, sein Abgleich-Stand bleibt erhalten
    if (saved.hid && !saved.gs) { sync.legacyHid = saved.hid; sync.gs[saved.hid] = { cursor: saved.cursor ?? null, known: saved.known || {} }; }
  }
  const m = /^#join=([A-Za-z0-9]+)/.exec(location.hash);
  if (m) { sync.joinCode = m[1].toUpperCase(); try { localStorage.setItem('ek_join', sync.joinCode); } catch (_) { /* egal */ } history.replaceState(null, '', location.pathname + location.search); }
  else { try { sync.joinCode = localStorage.getItem('ek_join'); } catch (_) { /* egal */ } }
  // auf den Start der App warten (js/start.js) (S wird dort geladen)
  for (let i = 0; i < 200 && !(typeof S !== 'undefined' && S && S.lists); i++) await new Promise((r) => setTimeout(r, 50));
  if (sync.legacyHid) { // alle bisherigen Daten gehören zum bisherigen Haushalt (jetzt Gruppe „Einkauf“)
    for (const arr of [S.lists, S.stores, S.meals || []]) for (const x of arr) if (!x.g) x.g = sync.legacyHid;
    if (!S.catGroup) S.catGroup = sync.legacyHid;
    S.lastGroup = S.lastGroup || sync.legacyHid;
    sync.quiet = true; save(); persistSync();
  }
  sync.ready = true;
  if (typeof render === 'function' && ui.tab === 'settings') render();
  if (sync.sess) syncRun();
  if (sync.joinCode) { if (sync.sess) joinPage(sync.joinCode); else accountPage(); }
  setInterval(() => { if (document.visibilityState === 'visible' && sync.sess) syncRun(); }, 10000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncRun(); });
  window.addEventListener('online', () => syncRun());
})();

// ---------- Gruppe anlegen und umbenennen ----------
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'newGroupForm') return;
  e.preventDefault(); e.stopImmediatePropagation();
  const n = $('#newGroupName').value.trim();
  if (!n) return;
  try {
    const g = await api('/rest/v1/rpc/create_group', { method: 'POST', body: JSON.stringify({ n }) });
    closeSheet();
    await refreshGroups(true);
    await syncRun();
    accountPage(); groupPage(g, `Gruppe „${n}“ angelegt. Lade jetzt jemanden ein, oder verschiebe Listen hierher.`);
  } catch (err) { newGroupSheet(niceError(err)); }
}, true);
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'grpName') return;
  const g = e.target.dataset.id, n = e.target.value.trim(), old = groupName(g);
  if (!n || n === old) { e.target.value = old; return; }
  try {
    await api('/rest/v1/rpc/rename_group', { method: 'POST', body: JSON.stringify({ g, n }) });
    await refreshGroups(true);
    render(); groupPage(g, 'Umbenannt.');
  } catch (err) { e.target.value = old; groupPage(g, '!' + niceError(err)); }
});
