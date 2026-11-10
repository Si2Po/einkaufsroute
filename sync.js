'use strict';
/* Konto, Haushalt und Synchronisation (Supabase, nur über fetch – keine Bibliothek).

   Jeder Laden, jede Kategorie, Liste, jeder Eintrag und jedes Essen ist ein "Dokument" in der Tabelle docs.
   Die Dokument-ID wird aus Haushalt + Art + lokaler ID berechnet. Dadurch müssen lokale IDs nicht umgeschrieben werden,
   und zwei Geräte, die dieselbe Standard-Kategorie haben, meinen automatisch dasselbe Dokument.
   Ablauf eines Durchgangs: erst eigene Änderungen hochladen (Vergleich über Hash), dann Änderungen der anderen holen.
   Gewinnt bei gleichzeitiger Änderung am selben Dokument: wer zuletzt hochlädt. Gelöschtes bleibt als Markierung (deleted) erhalten. */

const EK = Object.assign({
  url: 'https://hshlepbjrqqfpvjcghmy.supabase.co',
  key: 'sb_publishable_yxlkJ_Na6A0s-3guPHAUYQ_j2y4JMpO'
}, window.EK_CONFIG || {});

const sync = { sess: null, hid: null, cursor: null, known: {}, status: 'out', last: 0, err: '', busy: false, again: false, dirty: false, ver: 0, quiet: false, joinCode: null, renderLater: false, ready: false };

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
const persistSync = () => kvSet('sync', { sess: sync.sess, hid: sync.hid, cursor: sync.cursor, known: sync.known });

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
async function docId(kind, lid) {
  const key = sync.hid + '|' + kind + '|' + lid;
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
    sync.hid = null; sync.known = {}; sync.cursor = null; sync.err = '';
    persistSync();
    return { ok: true };
  } catch (e) { sync.sess = saved; throw e; }
}
async function ensureHousehold() {
  const p = await api(`/rest/v1/profiles?select=household_id&user_id=eq.${sync.sess.user.id}`);
  const hid = p && p[0] && p[0].household_id;
  if (!hid) throw new Error('Kein Haushalt gefunden');
  if (hid !== sync.hid) { sync.hid = hid; sync.known = {}; sync.cursor = null; persistSync(); }
}

// ---------- Lokale Daten -> Dokumente ----------
async function buildDocs() {
  const snap = snapshot();
  const uidv = sync.sess.user.id;
  const out = new Map();
  const put = async (kind, lid, data, listLid, priv) => {
    const id = await docId(kind, lid);
    const list_id = kind === 'list' ? id : (listLid ? await docId('list', listLid) : null);
    const row = { id, household_id: sync.hid, kind, list_id, visible_to: priv ? uidv : null, data, deleted: false };
    out.set(id, { row, kind, lid, h: rowHash(row) });
  };
  await put('settings', 'main', { customTags: snap.customTags || [], recent: snap.recent || [] });
  for (const [i, c] of (snap.cats || []).entries()) await put('cat', c.id, { ...c, _o: i });
  for (const [i, s] of (snap.stores || []).entries()) await put('store', s.id, { ...s, _o: i });
  for (const m of snap.meals || []) await put('meal', m.id, m);
  for (const [i, l] of (snap.lists || []).entries()) {
    const { items, ...rest } = l;
    await put('list', l.id, { ...rest, _o: i }, null, l.private);
    for (const it of items || []) await put('item', it.id, { ...it, _list: l.id }, l.id, l.private);
  }
  return out;
}
const knownEntry = (d) => ({ h: d.h, lid: d.lid, kind: d.row.kind, l: d.row.list_id, v: d.row.visible_to });

async function pushChanges(cur) {
  const rows = [];
  for (const [id, d] of cur) if (!sync.known[id] || sync.known[id].h !== d.h) rows.push({ row: d.row, k: knownEntry(d) });
  for (const [id, k] of Object.entries(sync.known)) {
    if (!cur.has(id) && !k.del) rows.push({ row: { id, household_id: sync.hid, kind: k.kind, list_id: k.l, visible_to: k.v, data: {}, deleted: true }, k: { del: 1, kind: k.kind } });
  }
  let batch = [], size = 0;
  const flush = async () => {
    if (!batch.length) return;
    await api('/rest/v1/docs?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch.map((b) => b.row)) });
    batch.forEach((b) => { sync.known[b.row.id] = b.k; });
    batch = []; size = 0;
    persistSync();
  };
  for (const r of rows) {
    const s = JSON.stringify(r.row).length;
    if (batch.length && (size + s > 700000 || batch.length >= 100)) await flush();
    batch.push(r); size += s;
  }
  await flush();
  return rows.length;
}

// ---------- Dokumente -> lokale Daten ----------
async function pullRows() {
  const rows = [];
  for (let off = 0; ; off += 500) {
    const q = `/rest/v1/docs?select=*&household_id=eq.${sync.hid}` + (sync.cursor ? `&updated_at=gte.${encodeURIComponent(sync.cursor)}` : '') + `&order=updated_at.asc,id.asc&limit=500&offset=${off}`;
    const page = await api(q);
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}
const KIND_ORDER = ['settings', 'cat', 'store', 'list', 'meal', 'item'];
function upsertIn(arr, ent) {
  const i = arr.findIndex((x) => x.id === ent.id);
  if (i >= 0) arr[i] = ent; else arr.push(ent);
}
function removeFrom(arr, id) { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); }

// rows: Zeilen vom Server; pending: Menge der Dokument-IDs mit noch nicht hochgeladener lokaler Änderung
async function applyRows(rows, pending) {
  const touched = [];
  snapshot();
  const ord = { cat: new Map(), store: new Map(), list: new Map() };
  S.cats.forEach((x, i) => ord.cat.set(x.id, i)); S.stores.forEach((x, i) => ord.store.set(x.id, i)); S.lists.forEach((x, i) => ord.list.set(x.id, i));
  const todo = [];
  for (const r of rows) {
    const k = sync.known[r.id];
    if (!r.deleted && k && k.h === rowHash(r)) continue;     // haben wir schon
    if (r.deleted && (!k || k.del)) { if (!k) sync.known[r.id] = { del: 1, kind: r.kind }; continue; }
    if (pending.has(r.id)) continue;                         // lokale Änderung gewinnt, wird gleich hochgeladen
    todo.push(r);
  }
  todo.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  for (const r of todo) {
    const d = r.data || {};
    const lid = d.id ?? (sync.known[r.id] && sync.known[r.id].lid);
    if (r.deleted) {
      const kl = sync.known[r.id] && sync.known[r.id].lid;
      if (r.kind === 'cat') removeFrom(S.cats, kl);
      else if (r.kind === 'store') removeFrom(S.stores, kl);
      else if (r.kind === 'meal') removeFrom(S.meals, kl);
      else if (r.kind === 'list') removeFrom(S.lists, kl);
      else if (r.kind === 'item') S.lists.forEach((l) => removeFrom(l.items, kl));
      sync.known[r.id] = { del: 1, kind: r.kind }; touched.push({ id: r.id, gone: true });
      continue;
    }
    const { _o, _list, ...ent } = d;
    if (r.kind === 'settings') { S.customTags = ent.customTags || []; S.recent = ent.recent || []; }
    else if (r.kind === 'cat') { upsertIn(S.cats, ent); ord.cat.set(ent.id, _o ?? 999); }
    else if (r.kind === 'store') { upsertIn(S.stores, ent); ord.store.set(ent.id, _o ?? 999); }
    else if (r.kind === 'meal') upsertIn(S.meals, ent);
    else if (r.kind === 'list') {
      const old = S.lists.find((l) => l.id === ent.id);
      ent.items = old ? old.items : [];
      upsertIn(S.lists, ent); ord.list.set(ent.id, _o ?? 999);
    } else if (r.kind === 'item') {
      const l = S.lists.find((x) => x.id === _list);
      if (!l) continue;
      S.lists.forEach((o) => { if (o !== l) removeFrom(o.items, ent.id); });   // Eintrag in andere Liste verschoben
      upsertIn(l.items, ent);
    }
    touched.push({ id: r.id, lid });
  }
  const sortBy = (arr, m) => arr.sort((a, b) => (m.get(a.id) ?? 999) - (m.get(b.id) ?? 999));
  sortBy(S.cats, ord.cat); sortBy(S.stores, ord.store); sortBy(S.lists, ord.list);
  S.items.sort((a, b) => a.ts - b.ts);
  return touched;
}
// Nach dem Anwenden: aktive Liste/Laden/Kategorien wieder zusammenbringen
function repairState() {
  if (!S.lists.length) S.lists = [{ id: uid(), name: 'Einkaufsliste', items: [] }];
  if (!S.lists.some((l) => l.id === S.listId)) S.listId = S.lists[0].id;
  const l = curList();
  S.items = l.items;
  if (l.storeId !== undefined && S.stores.some((x) => x.id === l.storeId)) S.storeId = l.storeId;
  if (!S.stores.some((x) => x.id === S.storeId)) S.storeId = S.stores[0]?.id || null;
  if (!S.cats.length) S.cats.push(...DEFAULT_CATS.map(cloneCat));
  CATS = S.cats; indexCats();
}

// ---------- Ein Durchgang ----------
async function syncRun() {
  if (!sync.sess || !sync.ready) return;
  if (sync.busy) { sync.again = true; return; }
  sync.busy = true; sync.status = 'busy'; paintStatus();
  try {
    if (sync.sess.expires_at - Date.now() / 1000 < 90 && !(await refreshSession())) { if (!sync.sess) throw new Error('Bitte neu anmelden.'); }
    if (!sync.hid) await ensureHousehold();
    const first = sync.cursor === null && !Object.keys(sync.known).length;
    let changed = false;
    if (first) {
      const rows = await pullRows();
      if (rows.some((r) => !r.deleted)) await adoptServer(rows);   // Server hat Daten: sie ersetzen die lokalen
      else { sync.dirty = true; }
      changed = rows.length > 0;
    }
    const v0 = sync.ver;
    let cur = null;
    if (sync.dirty) { cur = await buildDocs(); await pushChanges(cur); if (sync.ver === v0) sync.dirty = false; }
    const rows = await pullRows();
    const pending = new Set();
    if (sync.ver !== v0 || sync.dirty) { cur = await buildDocs(); for (const [id, d] of cur) { const k = sync.known[id]; if (!k || k.h !== d.h) pending.add(id); } }
    const touched = await applyRows(rows, pending);
    if (touched.length) {
      repairState();
      const cur2 = await buildDocs();
      for (const t of touched) { if (t.gone) continue; const d = cur2.get(t.id); if (d) sync.known[t.id] = knownEntry(d); }
      sync.quiet = true; save();
      changed = true;
    }
    for (const r of rows) if (!sync.cursor || r.updated_at > sync.cursor) sync.cursor = r.updated_at;
    persistSync();
    sync.status = 'ok'; sync.err = ''; sync.last = Date.now();
    if (changed) renderSoon();
  } catch (e) {
    sync.status = isOffline(e) ? 'offline' : (sync.sess ? 'err' : 'out');
    sync.err = niceError(e);
    if (!isOffline(e)) console.warn('sync', e);
  } finally {
    sync.busy = false; paintStatus();
    if (sync.again) { sync.again = false; setTimeout(syncRun, 300); }
  }
}
// Erster Abgleich auf diesem Gerät, Server hat schon Daten: lokale Daten sichern und durch die vom Server ersetzen
async function adoptServer(rows) {
  await kvSet('backup', { t: Date.now(), state: snapshot() });
  const keep = { swipe: S.swipe, swipeM: S.swipeM, v: S.v };
  const listId = S.listId;
  S = { ...keep, storeId: null, stores: [], cats: [], lists: [], meals: [], recent: [], customTags: [], items: [], listId };
  const touched = await applyRows(rows, new Set());
  repairState();
  const cur = await buildDocs();
  sync.known = {};
  for (const [id, d] of cur) sync.known[id] = knownEntry(d);
  for (const r of rows) if (r.deleted) sync.known[r.id] = { del: 1, kind: r.kind };
  sync.dirty = false;
  sync.quiet = true; save();
  return touched;
}
function renderSoon() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('input, textarea, select') && !dlg().contains(a)) { sync.renderLater = true; return; }
  sync.renderLater = false;
  render();
  if (ui.acc && ui.accView === 'account' && sync.sess && dlg().open) accountSheet(ui.accMsg);
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
  if (ui.acc && ui.accView === 'account' && sync.sess && dlg().open && !document.activeElement?.matches?.('#dlg input')) accountSheet(ui.accMsg);
}
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'gerade eben' : s < 90 ? `vor ${s} s` : `vor ${Math.round(s / 60)} min`; };

function accountSheet(msg) {
  ui.acc = true; ui.accView = 'account'; ui.accMsg = msg;
  const note = msg ? `<p class="sheetnote" role="status" style="color:var(--${msg.startsWith('!') ? 'warn' : 'accent'})">${esc(msg.replace(/^!/, ''))}</p>` : '';
  if (!sync.sess) {
    openSheet(`<div class="sheettitle">Konto</div>
      <p class="sheetnote">Mit einem Konto liegen deine Daten sicher online, laufen auf mehreren Geräten und lassen sich mit anderen teilen. Ohne Konto bleibt alles wie bisher nur auf diesem Gerät.</p>
      ${sync.joinCode ? '<p class="sheetnote" style="color:var(--accent)">Du hast eine Einladung bekommen. Melde dich an oder registriere dich, danach kannst du sie annehmen.</p>' : ''}
      <form id="accForm" autocomplete="on" style="display:grid;gap:10px;margin-top:8px">
        <label class="field"><span>E-Mail</span><input id="accMail" type="email" autocomplete="email" inputmode="email" autocapitalize="off" required></label>
        <label class="field"><span>Passwort</span><input id="accPass" type="password" autocomplete="current-password" minlength="6" required></label>
        ${note}
        <div class="actions"><button type="submit" class="btn" style="flex:1" value="login">Anmelden</button><button type="submit" class="btn ghost" style="flex:1" value="signup">Registrieren</button></div>
      </form>`);
    return;
  }
  openSheet(`<div class="sheettitle">Konto</div>
    <p style="margin:0 4px"><strong>${esc(sync.sess.user.email)}</strong></p>
    <p class="sheetnote" style="margin:2px 4px 8px">${STATUS_TXT[sync.status] || ''}${sync.status === 'ok' && sync.last ? ' · ' + ago(sync.last) : ''}${sync.err && sync.status !== 'ok' ? '<br>' + esc(sync.err) : ''}</p>
    ${note}
    <div class="sheettitle" style="margin-top:8px">Haushalt</div>
    <p class="sheetnote" style="margin:0 4px 8px">Wer zu deinem Haushalt gehört, teilt Läden, Stichwörter, Essen und Listen.</p>
    <button type="button" class="sheetbtn" data-act="acc_invite"><span>Person einladen</span><small>Link erstellen</small></button>
    <button type="button" class="sheetbtn" data-act="acc_joinsheet"><span>Einladung annehmen</span><small>Code eingeben</small></button>
    <div class="actions" style="margin-top:12px"><button type="button" class="btn ghost" data-act="acc_sync">Jetzt abgleichen</button><button type="button" class="btn danger" data-act="acc_logout">Abmelden</button></div>`);
}
function joinSheet(code, msg) {
  ui.acc = true; ui.accView = 'other'; ui.accMsg = null;
  openSheet(`<div class="sheettitle">Einladung annehmen</div>
    <form id="joinForm" autocomplete="off" style="display:grid;gap:10px">
      <label class="field"><span>Einladungscode</span><input id="joinCode" value="${esc(code || '')}" autocapitalize="characters" autocomplete="off" ${code ? '' : 'autofocus'} required></label>
      <p class="sheetnote" style="color:var(--warn)">Achtung: Die Daten auf diesem Gerät (Läden, Listen, Essen) werden durch die Daten des Haushalts ersetzt. Eine Sicherung bleibt auf dem Gerät.</p>
      ${msg ? `<p class="sheetnote" style="color:var(--warn)">${esc(msg)}</p>` : ''}
      <div class="actions"><button type="submit" class="btn" style="flex:1">Beitreten</button><button type="button" class="btn ghost" data-act="acc_back">Zurück</button></div>
    </form>`);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (_) { return false; }
}
async function createInvite() {
  try {
    const code = await api('/rest/v1/rpc/create_invite', { method: 'POST', body: '{}' });
    const link = location.origin + location.pathname + '#join=' + code;
    ui.acc = true; ui.accView = 'other';
    openSheet(`<div class="sheettitle">Einladung</div>
      <p class="sheetnote" style="margin:0 4px 8px">Schick diesen Link an die Person. Er gilt 7 Tage. Sie öffnet ihn auf ihrem Handy, meldet sich an und ist danach im Haushalt.</p>
      <input class="notein" id="invLink" readonly value="${esc(link)}" aria-label="Einladungslink">
      <p class="sheetnote" style="margin:8px 4px">Oder der Code zum Eintippen: <strong>${esc(code)}</strong></p>
      <div class="actions" style="margin-top:8px">
        <button type="button" class="btn" style="flex:1" data-act="acc_share" data-link="${esc(link)}">${navigator.share ? 'Teilen' : 'Link kopieren'}</button>
        <button type="button" class="btn ghost" data-act="acc_back">Zurück</button></div>`);
  } catch (e) { accountSheet('!' + niceError(e)); }
}
async function acceptInvite(code) {
  try {
    const hid = await api('/rest/v1/rpc/accept_invite', { method: 'POST', body: JSON.stringify({ c: code }) });
    sync.joinCode = null; try { localStorage.removeItem('ek_join'); } catch (_) { /* egal */ }
    sync.hid = hid; sync.known = {}; sync.cursor = null; persistSync();
    await syncRun();
    render();
    accountSheet(sync.status === 'ok' ? 'Du bist jetzt im Haushalt.' : '!' + (sync.err || 'Abgleich später'));
  } catch (e) { joinSheet(code, niceError(e)); }
}

// ---------- Sichern und übertragen (Datei oder Text) ----------
const exportJson = () => JSON.stringify({ app: 'einkaufsroute', v: 1, state: snapshot() });
function dataSheet(msg) {
  ui.acc = true; ui.accView = 'other';
  openSheet(`<div class="sheettitle">Daten sichern und übertragen</div>
    <p class="sheetnote" style="margin:0 4px 8px">Alles (Listen, Läden, Stichwörter, Essen, Fotos) als Sicherung. So nimmst du deine Daten auch auf ein anderes Gerät oder in eine neue Installation mit.</p>
    <button type="button" class="sheetbtn" data-act="acc_dlfile"><span>Als Datei speichern</span><small>.json</small></button>
    <button type="button" class="sheetbtn" data-act="acc_copydata"><span>Als Text kopieren</span><small>Zwischenablage</small></button>
    <button type="button" class="sheetbtn" data-act="acc_importsheet"><span>Sicherung laden</span><small>ersetzt die Daten hier</small></button>
    ${msg ? `<p class="sheetnote" role="status" style="margin:8px 4px;color:var(--${msg.startsWith('!') ? 'warn' : 'accent'})">${esc(msg.replace(/^!/, ''))}</p>` : ''}
    <div id="dataTextBox"></div>`);
}
function importSheet(msg) {
  ui.acc = true; ui.accView = 'other';
  openSheet(`<div class="sheettitle">Sicherung laden</div>
    <p class="sheetnote" style="color:var(--warn);margin:0 4px 8px">Achtung: Die Daten auf diesem Gerät werden durch die Sicherung ersetzt. Eine Kopie der bisherigen Daten bleibt auf dem Gerät.</p>
    <label class="field"><span>Datei wählen</span><input id="impFile" type="file" accept=".json,application/json,text/plain"></label>
    <label class="field" style="margin-top:8px"><span>Oder Text einfügen</span><textarea id="impText" rows="4" class="notein" placeholder="Sicherung hier einfügen" style="width:100%;font-size:16px"></textarea></label>
    ${msg ? `<p class="sheetnote" role="status" style="margin:8px 4px;color:var(--warn)">${esc(msg)}</p>` : ''}
    <div class="actions" style="margin-top:10px"><button type="button" class="btn" style="flex:1" data-act="acc_doimport">Laden</button><button type="button" class="btn ghost" data-act="acc_databack">Zurück</button></div>`);
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
      if (r.needsConfirm) { accountSheet('Bestätigungsmail verschickt. Bitte bestätige die E-Mail und melde dich dann an.'); return; }
      sync.status = 'busy';
      await syncRun();
      render();
      if (sync.joinCode && sync.sess) { joinSheet(sync.joinCode); return; }
      accountSheet(sync.status === 'ok' ? 'Angemeldet.' : (sync.err ? '!' + sync.err : ''));
    } catch (err) { accountSheet('!' + niceError(err)); }
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
  if (act === 'accountsheet') { accountSheet(); return; }
  if (act === 'datasheet' || act === 'acc_databack') { dataSheet(); return; }
  if (act === 'acc_importsheet') { importSheet(); return; }
  if (act === 'acc_doimport') {
    try { importJson($('#impText').value.trim()); dataSheet('Sicherung geladen.'); } catch (err) { importSheet(err.message); }
    return;
  }
  if (act === 'acc_dlfile') {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
      a.download = 'einkaufsroute-sicherung.json'; document.body.appendChild(a); a.click(); a.remove();
      dataSheet('Datei wird gespeichert. Falls nichts passiert, nimm „Als Text kopieren“.');
    } catch (_) { dataSheet('!Speichern nicht möglich. Nimm „Als Text kopieren“.'); }
    return;
  }
  if (act === 'acc_copydata') {
    const txt = exportJson();
    if (await copyText(txt)) { dataSheet('In die Zwischenablage kopiert.'); return; }
    dataSheet('!Kopieren wurde blockiert. Markiere den Text unten und kopiere ihn von Hand.');
    $('#dataTextBox').innerHTML = '<textarea id="dataText" readonly rows="5" class="notein" style="width:100%;font-size:16px;margin-top:8px"></textarea>';
    const t = $('#dataText'); t.value = txt; t.focus(); t.select();
    return;
  }
  if (act === 'acc_back') accountSheet();
  else if (act === 'acc_invite') createInvite();
  else if (act === 'acc_joinsheet') joinSheet('');
  else if (act === 'acc_sync') { sync.dirty = true; sync.ver++; await syncRun(); accountSheet(sync.status === 'ok' ? 'Abgeglichen.' : '!' + sync.err); }
  else if (act === 'acc_share') {
    const link = el.dataset.link;
    if (navigator.share) { try { await navigator.share({ title: 'Einkaufsroute', text: 'Komm in meinen Haushalt bei Einkaufsroute:', url: link }); } catch (_) { /* abgebrochen */ } }
    else { const ok = await copyText(link); const i = $('#invLink'); if (i) { i.select(); } toast(ok ? 'Link kopiert' : 'Link markiert – bitte kopieren'); }
  } else if (act === 'acc_logout') {
    sync.sess = null; sync.hid = null; sync.known = {}; sync.cursor = null; sync.status = 'out'; sync.err = '';
    await persistSync();
    accountSheet('Abgemeldet. Deine Daten bleiben auf diesem Gerät.');
    render();
  }
}, true);
dlg().addEventListener('close', () => { ui.acc = false; });

// ---------- Start ----------
(async function syncInit() {
  const saved = await kvGet('sync');
  if (saved && saved.sess) { sync.sess = saved.sess; sync.hid = saved.hid || null; sync.cursor = saved.cursor ?? null; sync.known = saved.known || {}; sync.status = 'busy'; }
  const m = /^#join=([A-Za-z0-9]+)/.exec(location.hash);
  if (m) { sync.joinCode = m[1].toUpperCase(); try { localStorage.setItem('ek_join', sync.joinCode); } catch (_) { /* egal */ } history.replaceState(null, '', location.pathname + location.search); }
  else { try { sync.joinCode = localStorage.getItem('ek_join'); } catch (_) { /* egal */ } }
  // auf den Start von app.js warten (S wird dort geladen)
  for (let i = 0; i < 200 && !(typeof S !== 'undefined' && S && S.lists); i++) await new Promise((r) => setTimeout(r, 50));
  sync.ready = true;
  if (typeof render === 'function' && ui.tab === 'settings') render();
  if (sync.sess) syncRun();
  if (sync.joinCode) { if (sync.sess) joinSheet(sync.joinCode); else accountSheet(); }
  setInterval(() => { if (document.visibilityState === 'visible' && sync.sess) syncRun(); }, 10000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncRun(); });
  window.addEventListener('online', () => syncRun());
})();
