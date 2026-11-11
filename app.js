'use strict';
/* Einkaufsroute – Prototyp (Liste, Läden, Zonen-Editor, automatische Sortierung)
   Alles läuft im Browser. Daten liegen in IndexedDB auf dem Gerät.

   Datenmodell:
   S = { storeId, stores: [Store], cats: [{ id, name, kw: [Stichwörter] }], items: [Item], recent: ["Anzeigename", …] (zuletzt neu getippte Wörter für die Autovervollständigung) }
   Store = { id, name, bg (Foto als Data-URL oder null), h (Plan-Höhe bei Breite 1000), zones: [Zone], main: { kategorieId: zoneId } (Standard-Bereich, wenn eine Kategorie in mehreren Bereichen liegt) }
   Zone  = { id, name, cats: [Kategorie-IDs], prods: { produktname: Anzeigename }, rect: {x,y,w,h} oder null }
   Regel: ein festgelegtes Produkt (prods) gewinnt vor der Kategorie. Eine Kategorie darf in mehreren Zonen stehen;
   dann zählt die erste Zone in der Laufreihenfolge, solange kein Produkt festgelegt ist.   <- Reihenfolge im Array = Laufweg
   Item  = { id, name, qty, note, photo (Data-URL oder fehlt), cat, done, ts }
*/

// ---------- Kategorien und Stichwörter ----------
// Die Reihenfolge hier ist die Standardreihenfolge, wenn kein Laden gewählt ist.
const DEFAULT_CATS = [
  { id: 'obst', name: 'Obst & Gemüse', kw: ['apfel', 'äpfel', 'banane', 'birne', 'tomate', 'gurke', 'paprika', 'zwiebel', 'knoblauch', 'salat', 'eisberg', 'karotte', 'möhre', 'kartoffel', 'zitrone', 'orange', 'mandarine', 'beere', 'erdbeer', 'himbeer', 'trauben', 'brokkoli', 'blumenkohl', 'zucchini', 'spinat', 'pilz', 'champignon', 'avocado', 'lauch', 'kohl', 'ingwer', 'petersilie', 'schnittlauch', 'gemüse', 'obst', 'mango', 'ananas', 'melone', 'pfirsich', 'radieschen', 'sellerie', 'aubergine', 'rucola', 'kürbis', 'süßkartoffel', 'frühlingszwiebel', 'limette'] },
  { id: 'brot', name: 'Brot & Backwaren', kw: ['brot', 'brötchen', 'semmel', 'toast', 'baguette', 'croissant', 'kuchen', 'laugen', 'brezel', 'tortilla', 'wrap', 'knäckebrot', 'fladenbrot'] },
  { id: 'milch', name: 'Milch & Käse', kw: ['milch', 'hafermilch', 'sojamilch', 'mandelmilch', 'käse', 'joghurt', 'quark', 'butter', 'sahne', 'eier', 'mozzarella', 'parmesan', 'skyr', 'frischkäse', 'margarine', 'schmand', 'crème', 'creme fraiche', 'gouda', 'feta', 'halloumi', 'tofu', 'pudding', 'kefir'] },
  { id: 'fleisch', name: 'Fleisch & Fisch', kw: ['fleisch', 'hähnchen', 'huhn', 'hack', 'wurst', 'schinken', 'salami', 'speck', 'lachs', 'fisch', 'garnelen', 'steak', 'schnitzel', 'bratwurst', 'würstchen', 'gyros', 'pute', 'rind', 'schwein', 'aufschnitt'] },
  { id: 'konserven', name: 'Nudeln, Reis & Dosen', kw: ['nudeln', 'spaghetti', 'penne', 'fusilli', 'reis', 'dose', 'tomatenmark', 'passierte', 'linsen', 'bohnen', 'kichererbsen', 'haferflocken', 'müsli', 'couscous', 'öl', 'olivenöl', 'essig', 'soße', 'sauce', 'ketchup', 'senf', 'mayo', 'thunfisch', 'mais', 'brühe', 'cornflakes', 'marmelade', 'honig', 'nutella', 'erdnussbutter', 'pesto', 'kokosmilch', 'suppe'] },
  { id: 'gewuerze', name: 'Backen & Gewürze', kw: ['salz', 'pfeffer', 'gewürz', 'zimt', 'curry', 'paprikapulver', 'oregano', 'backpulver', 'vanille', 'hefe', 'natron', 'muskat', 'kümmel', 'kurkuma', 'mehl', 'zucker', 'puderzucker', 'speisestärke', 'chili'] },
  { id: 'snacks', name: 'Süßes & Snacks', kw: ['schokolade', 'chips', 'kekse', 'keks', 'gummibär', 'süßigkeit', 'nüsse', 'riegel', 'bonbon', 'popcorn', 'salzstangen', 'eiscreme', 'lakritz', 'erdnüsse', 'cracker'] },
  { id: 'getraenke', name: 'Getränke', kw: ['wasser', 'saft', 'cola', 'bier', 'wein', 'limo', 'sprudel', 'tee', 'kaffee', 'schorle', 'fanta', 'sprite', 'mate', 'spezi', 'energy', 'sekt', 'gin', 'wodka', 'prosecco', 'kakao'] },
  { id: 'tk', name: 'Tiefkühl', kw: ['tiefkühl', 'tk-', 'pizza', 'eis', 'pommes', 'fischstäbchen', 'gefrorene', 'rahmspinat'] },
  { id: 'drogerie', name: 'Drogerie & Haushalt', kw: ['zahnpasta', 'zahnbürste', 'shampoo', 'duschgel', 'seife', 'deo', 'toilettenpapier', 'klopapier', 'taschentücher', 'spülmittel', 'waschmittel', 'müllbeutel', 'müllsack', 'küchenrolle', 'tampons', 'spülmaschinentabs', 'wattepads', 'rasierer', 'batterien', 'glühbirne', 'schwamm', 'backpapier', 'alufolie', 'frischhaltefolie', 'kerze'] },
  { id: 'sonst', name: 'Sonstiges', kw: [] }
];
// Die Kategorien liegen im Zustand (S.cats) und sind änderbar. DEFAULT_CATS sind die Werkseinstellungen.
const cloneCat = (c) => ({ id: c.id, name: c.name, kw: [...c.kw] });
let CATS = DEFAULT_CATS.map(cloneCat), CAT_BY_ID = {}, CAT_INDEX = {};
function indexCats() {
  CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]));
  CAT_INDEX = Object.fromEntries(CATS.map((c, i) => [c.id, i]));
}
indexCats();
const HUES = [150, 25, 205, 350, 45, 270, 175, 310];

const normKey = (n) => n.toLowerCase().replace(/\s+/g, ' ').trim();
// Schlüssel zum Erkennen von Doppelten: Einzahl und Mehrzahl zählen gleich (Tomate = Tomaten, Apfel = Äpfel, Nudel = Nudeln)
const STEM_SPECIAL = { eier: 'ei' };
function stemWord(w) {
  if (STEM_SPECIAL[w]) return STEM_SPECIAL[w];
  if (w.length >= 5) { if (w.endsWith('en')) return w.slice(0, -2); if (/[ne]$/.test(w)) return w.slice(0, -1); }
  return w;
}
const dupKey = (n) => fold(normKey(n)).split(/[\s\-]+/).map(stemWord).join(' ');
const pinIdx = (st, name) => { const d = dupKey(name); return st.zones.findIndex((z) => z.prods && Object.keys(z.prods).some((k) => dupKey(k) === d)); };

// Die Kategorie eines neuen Eintrags kommt nur aus den Stichwörtern der Kategorien.
function guessCat(name) { return keywordGuess(name); }

// Der längste passende Treffer am Wortanfang gewinnt ("paprikapulver" schlägt "paprika").
function keywordGuess(name) {
  const n = ' ' + name.toLowerCase();
  let best = null, bestLen = 0;
  for (const c of CATS) {
    for (const k of c.kw) {
      if (k.length > bestLen && new RegExp('[\\s\\-/,]' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(n)) {
        best = c.id; bestLen = k.length;
      }
    }
  }
  return best || 'sonst';
}

// Hat jemand von Hand eine Kategorie gewählt, wird der Name dort ein Stichwort (und verschwindet aus den anderen).
// Passt die Kategorie schon zur Stichwort-Vermutung, braucht es kein neues Stichwort.
function learnKeyword(name, catId) {
  const key = normKey(name);
  if (!key || !CAT_BY_ID[catId]) return;
  CATS.forEach((c) => { c.kw = c.kw.filter((k) => k !== key); });
  if (keywordGuess(name) !== catId) CAT_BY_ID[catId].kw.push(key);
}

// ---------- Autovervollständigung ----------
// Vorschläge kommen aus den Stichwörtern, den Einträgen auf der Liste und den zuletzt neu getippten Wörtern.
const STEMS = new Set(['erdbeer', 'himbeer', 'tk-', 'tiefkühl', 'gefrorene', 'passierte', 'gewürz', 'süßigkeit', 'gemüse', 'obst', 'beere', 'dose', 'crème', 'rind', 'schwein', 'laugen', 'gummibär']); // Wortanfänge, keine Produkte
const fold = (s) => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
// Abstand zwischen zwei Wörtern (Einfügen, Löschen, Ersetzen, Vertauschen zählt je 1)
function editDist(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
// Tippfehler-Verdacht: fast gleich wie ein bekanntes Wort, aber nicht identisch
const nearAny = (f, keys) => f.length >= 5 && keys.some((x) => x !== f && x[0] === f[0] && Math.abs(x.length - f.length) <= 1 && editDist(f, x) <= 1);
function poolEntries() {
  const kws = new Map();
  CATS.forEach((c) => c.kw.forEach((k) => {
    const f = fold(k);
    if (STEMS.has(k) || k.endsWith('-') || kws.has(f)) return;
    kws.set(f, { name: k.charAt(0).toUpperCase() + k.slice(1), key: f, src: 1 });
  }));
  const keys = [...kws.keys()], own = new Map();
  const addOwn = (n) => {
    const f = fold(normKey(n));
    if (f.length < 2 || kws.has(f) || own.has(f) || nearAny(f, keys)) return; // Tippfehler sollen nicht als Vorschlag zurückkommen
    own.set(f, { name: n, key: f, src: 0 });
  };
  S.items.forEach((i) => addOwn(i.name));
  (S.recent || []).forEach(addOwn);
  (S.meals || []).forEach((m) => m.ing.forEach((i) => addOwn(i.name)));
  return [...own.values(), ...kws.values()];
}
function suggestions(q) {
  const qf = fold(normKey(q));
  if (qf.length < 2) return [];
  const open = new Map(S.items.filter((i) => !i.done).map((i) => [dupKey(i.name), i.id]));
  const out = [];
  for (const p of poolEntries()) {
    const k = p.key;
    let tier = -1, dist = 0;
    if (k === qf) tier = -0.5; // vollständig getippt: bleibt als erster Vorschlag stehen (zeigt z. B. "auf der Liste")
    else if (k.startsWith(qf)) tier = 0;
    else if (k.split(/[\s\-]/).some((w, i) => i > 0 && w.startsWith(qf))) tier = 1;
    else if (qf.length >= 3 && k.includes(qf)) tier = 2;
    else if (qf.length >= 5 && k[0] === qf[0]) {
      dist = Math.min(editDist(qf, k), ...[-1, 0, 1].map((d) => editDist(qf, k.slice(0, qf.length + d))));
      if (dist <= (qf.length >= 8 ? 2 : 1)) tier = 3;
    }
    if (tier > -1) out.push({ ...p, tier, dist });
  }
  out.sort((a, b) => a.tier - b.tier || a.dist - b.dist || a.src - b.src || a.key.length - b.key.length || a.name.localeCompare(b.name, 'de'));
  return out.slice(0, 4).map((p) => ({ name: p.name, cat: keywordGuess(p.name), listed: open.get(dupKey(p.name)) || '' }));
}
// Neue Wörter merken. Tippfehler (fast gleich wie ein bekanntes Wort) landen nicht in der Merkliste.
function rememberName(name) {
  const f = fold(normKey(name));
  if (f.length < 2) return;
  S.recent = S.recent || [];
  const known = poolEntries().map((p) => p.key);
  if (known.includes(f)) {
    const i = S.recent.findIndex((n) => fold(normKey(n)) === f);
    if (i > 0) S.recent.unshift(...S.recent.splice(i, 1));
    return;
  }
  if (nearAny(f, known)) return;
  S.recent = [name, ...S.recent].slice(0, 100);
}

// "2 Milch", "500g Mehl", "3x Joghurt" -> Menge und Name trennen
function parseEntry(text) {
  const t = text.trim();
  const m = t.match(/^(\d+(?:[.,]\d+)?\s?(?:x|×|g|kg|l|ml|stk|stück|pck|pack|packung|packungen)?)\s+(.+)$/i);
  return m ? { qty: m[1].replace(/\s+/g, ''), name: m[2].trim() } : { qty: '', name: t };
}

// ---------- Hilfsfunktionen ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Speicher (IndexedDB, Fallback localStorage) ----------
const DB_NAME = 'einkaufsroute', KEY = 'state';
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function loadState() {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(KEY);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => rej(q.error);
    });
  } catch (e) {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; }
  }
}
// Die Einträge der aktiven Liste liegen im Betrieb in S.items und werden nur beim Speichern in ihre Liste zurückgelegt
function snapshot() {
  const l = curList();
  if (l) { l.items = S.items; l.storeId = S.storeId; }
  const snap = { ...S };
  delete snap.items;
  return snap;
}
let saveTimer;
function save() {
  if (window.syncHook) window.syncHook(); // Konto: Änderung zum Hochladen vormerken
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const db = await openDb();
      db.transaction('kv', 'readwrite').objectStore('kv').put(snapshot(), KEY);
    } catch (e) {
      try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (_) { /* Speicher gesperrt */ }
    }
  }, 120);
}

// ---------- Startdaten (Beispiel, damit die App nicht leer startet) ----------
function seed() {
  const defs = [
    ['Obst & Gemüse', ['obst'], [40, 40, 300, 190]],
    ['Brot & Backwaren', ['brot'], [350, 40, 190, 190]],
    ['Milch & Käse', ['milch'], [550, 40, 410, 120]],
    ['Fleisch & Fisch', ['fleisch'], [550, 170, 410, 100]],
    ['Nudeln, Reis & Dosen', ['konserven', 'gewuerze'], [40, 260, 250, 190]],
    ['Getränke', ['getraenke'], [300, 260, 240, 190]],
    ['Snacks', ['snacks'], [550, 280, 200, 170]],
    ['Tiefkühl', ['tk'], [760, 280, 200, 170]],
    ['Drogerie', ['drogerie'], [40, 470, 500, 130]]
  ];
  const zones = defs.map(([name, cats, r]) => ({ id: uid(), name, cats, prods: {}, rect: { x: r[0], y: r[1], w: r[2], h: r[3] } }));
  const store = { id: uid(), name: 'Beispiel-Markt', bg: null, h: 640, zones };
  const mk = (text, note = '') => {
    const p = parseEntry(text);
    return { id: uid(), name: p.name, qty: p.qty, note, cat: guessCat(p.name), done: false, ts: Date.now() + Math.random() };
  };
  return {
    v: 2, storeId: store.id, stores: [store], recent: [], meals: seedMeals(),
    items: [mk('Zahnpasta'), mk('2 Hafermilch'), mk('6 Äpfel', 'lieber säuerlich'), mk('Brot', 'Vollkorn'), mk('500g Spaghetti'), mk('2 Tiefkühlpizza'), mk('Bananen'), mk('Joghurt')]
  };
}

function seedMeals() {
  const ing = (t, basic = false) => { const p = parseEntry(t); return { id: uid(), name: p.name, qty: p.qty, basic }; };
  return [
    { id: uid(), name: 'Spaghetti Bolognese', tags: ['Nudeln'], base: 2, photo: null, steps: '',
      ing: [ing('250g Spaghetti'), ing('300g Hackfleisch'), ing('1 Zwiebel'), ing('400g Dosentomaten'), ing('Olivenöl', true), ing('Salz', true)] },
    { id: uid(), name: 'Gemüsepfanne mit Reis', tags: ['Reis', 'schnell', 'viel Gemüse'], base: 2, photo: null, steps: '',
      ing: [ing('200g Reis'), ing('2 Paprika'), ing('2 Zucchini'), ing('1 Zwiebel'), ing('Sojasauce', true), ing('Öl', true)] }
  ];
}

// ---------- Zustand ----------
let S;
const ui = { tab: 'list', editStoreId: null, selZone: null, drawing: false, showDone: false, confirmDel: false, justDrew: 0, sheetT: 0, pending: new Map(), confirmCat: false, confirmList: false };
const curList = () => (S.lists || []).find((l) => l.id === S.listId) || null;
const curStore = () => S.stores.find((s) => s.id === S.storeId) || null;
const editStore = () => S.stores.find((s) => s.id === ui.editStoreId) || null;
const commit = () => { save(); render(); };

// ---------- Sortierung: Item -> (festgelegtes Produkt | Kategorie) -> Zone im gewählten Laden -> Laufreihenfolge ----------
function zoneIndexFor(store, it) {
  const pinned = pinIdx(store, it.name);
  return pinned >= 0 ? pinned : defaultZoneIdx(store, it.cat);
}
// Welcher Bereich nimmt Produkte einer Kategorie ohne festen Bereich? Der als Standard gewählte, sonst der erste in der Route.
const sharedCats = (st, z) => z.cats.filter((c) => CAT_BY_ID[c] && st.zones.some((o) => o !== z && o.cats.includes(c)));
const isStdZone = (st, z) => { const sh = sharedCats(st, z); return sh.length > 0 && sh.every((c) => st.zones[defaultZoneIdx(st, c)] === z); };
function defaultZoneIdx(store, cat) {
  const m = store.main && store.main[cat];
  const mi = m ? store.zones.findIndex((z) => z.id === m && z.cats.includes(cat)) : -1;
  return mi >= 0 ? mi : store.zones.findIndex((z) => z.cats.includes(cat));
}
function buildGroups(store) {
  const groups = new Map();
  for (const it of S.items.filter((i) => !i.done)) {
    let g;
    if (store) {
      const zi = zoneIndexFor(store, it);
      g = zi >= 0
        ? { key: 'z' + zi, order: zi, label: store.zones[zi].name, num: zi + 1 }
        : { key: 'n' + it.cat, order: 999 + (CAT_INDEX[it.cat] ?? 99), label: CAT_BY_ID[it.cat]?.name || 'Sonstiges', num: null, free: it.cat };
    } else {
      const ci = CAT_INDEX[it.cat] ?? CAT_INDEX.sonst;
      g = { key: 'c' + ci, order: ci, label: CAT_BY_ID[it.cat]?.name || 'Sonstiges', num: null };
    }
    if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [] });
    groups.get(g.key).items.push(it);
  }
  const list = [...groups.values()].sort((a, b) => a.order - b.order);
  list.forEach((g) => g.items.sort((a, b) => (CAT_INDEX[a.cat] - CAT_INDEX[b.cat]) || (a.ts - b.ts)));
  return list;
}

// ---------- Ansichten ----------
const ICON_DOTS = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>';
const ICON_GRAB = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

const MEAL_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 3v8M4.5 3v5.2a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.4 1.2-3.5 4-3.5 7.5 0 1.7.9 2.5 2 2.5h1.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
function rowHtml(i) {
  const pend = ui.pending.has(i.id), on = i.done || pend;
  return `<li class="row${on ? ' done' : ''}${pend ? ' pending' : ''}" role="checkbox" aria-checked="${on}" tabindex="0" data-act="toggle" data-id="${i.id}">
    <span class="chk" aria-hidden="true"></span>
    <span class="txt"><span class="nm">${esc(i.name)}</span>${i.note ? `<span class="nt">${esc(i.note)}</span>` : ''}${i.meals?.length ? `<span class="nt ml">${MEAL_ICON}${esc(i.meals.join(', '))}</span>` : ''}</span>
    ${i.photo ? `<img class="thumb" src="${i.photo}" alt="">` : ''}
    ${i.qty ? `<span class="qty">${esc(i.qty)}</span>` : ''}
  </li>`;
}

function listBody() {
  const groups = buildGroups(curStore());
  const done = S.items.filter((i) => i.done);
  const body = groups.length
    ? groups.map((g) => (g.free
        ? `<button type="button" class="grp grpbtn" data-act="assigncat" data-cat="${g.free}"><span class="gname">${esc(g.label)}</span><span class="nozone">Bereich wählen ›</span><span class="cnt">${g.items.length}</span></button>`
        : `<div class="grp"><span class="gname">${esc(g.label)}</span><span class="cnt">${g.items.length}</span></div>`)
        + `<ul class="rows">${g.items.map(rowHtml).join('')}</ul>`).join('')
    : `<p class="empty">${S.items.length ? 'Alles erledigt.' : 'Die Liste ist leer.'}</p>`;
  const doneHtml = done.length
    ? `<div class="donehead"><button type="button" class="link donetoggle" data-act="showdone" aria-expanded="${ui.showDone}">Erledigt (${done.length}) ${ui.showDone ? '▴' : '▾'}</button>${ui.showDone ? '<button type="button" class="link clearbtn" data-act="cleardone">Erledigte entfernen</button>' : ''}</div>
       ${ui.showDone ? `<ul class="rows">${done.map(rowHtml).join('')}</ul>` : ''}`
    : '';
  const tip = S.items.length && !S.tipSeen ? '<p class="tip">Tippen: abhaken · Gedrückt halten: bearbeiten</p>' : '';
  return body + doneHtml + tip;
}
const pillName = () => curStore()?.name || 'Kein Geschäft';

const barHtml = () => `
      <button type="button" class="pill" data-act="storesheet" aria-haspopup="dialog" aria-label="Geschäft wählen"><span id="pillName">${esc(pillName())}</span></button>`;
function viewList() {
  return `<div class="bar">${barHtml()}    </div>
    <div class="addwrap">
      <form id="addForm" class="add" autocomplete="off">
        <input id="addName" placeholder="Was brauchst du?" aria-label="Neuer Eintrag" enterkeyhint="done">
        <button type="submit" class="plus" aria-label="Hinzufügen">${ICON_PLUS}</button>
      </form>
      <div id="sugg" class="sugg" role="listbox" aria-label="Vorschläge" hidden></div>
    </div>
    <div id="listBody">${listBody()}</div>`;
}

function viewStores() {
  const cards = S.stores.map((s) => `<li><button type="button" class="card" data-act="openstore" data-id="${s.id}">
      <span><strong>${esc(s.name)}</strong><small>${s.zones.length} ${s.zones.length === 1 ? 'Bereich' : 'Bereiche'}${s.id === S.storeId ? ' · aktiv' : ''}</small></span>
      <span class="go">›</span></button></li>`).join('');
  return `${pageHead('Einstellungen', 'Geschäfte', 'data-act="tab" data-tab="settings"')}
    <p class="hint">Lege für jeden Supermarkt einen Grundriss an. Die Liste sortiert sich dann nach dem Laufweg dort.</p>
    ${S.stores.length ? `<ul class="cards">${cards}</ul>` : ''}
    <button type="button" class="btn" style="margin-top:10px" data-act="newstoresheet">+ Neues Geschäft</button>`;
}

// ---------- Plan: endlose Fläche mit Raster ----------
// Der Plan ist ein Sichtfenster (ui.view = Mitte + Breite in Plan-Einheiten) auf eine unendliche Fläche.
// Bereiche liegen in Plan-Einheiten (x, y, w, h) und rasten auf das sichtbare Raster ein.
const VIEW_RATIO = 0.8; // Höhe / Breite des Fensters
const GRID_STEPS = [25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800];
const gridStep = (vw) => GRID_STEPS.find((s) => s >= vw * 14 / 340) || 12800; // Rasterlinien nie dichter als ca. 14 px
const viewBox = () => { const v = ui.view, h = v.vw * VIEW_RATIO; return { x: v.cx - v.vw / 2, y: v.cy - h / 2, w: v.vw, h }; };
const vbStr = () => { const b = viewBox(); return `${b.x} ${b.y} ${b.w} ${b.h}`; };
const normRect = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });

function fitView(st) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, w, h) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
  if (st.bg) add(0, 0, 1000, st.h || 640);
  st.zones.forEach((z) => { if (z.rect) add(z.rect.x, z.rect.y, z.rect.w, z.rect.h); });
  if (x0 === Infinity) { x0 = 0; y0 = 0; x1 = 1000; y1 = 640; }
  const bw = x1 - x0, bh = y1 - y0;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, vw: Math.max(400, bw * 1.12, bh * 1.12 / VIEW_RATIO) };
}

// Beschriftung eines Bereichs: überall gleiche Schriftgröße, die mit dem Zoom wächst; Namen brechen nach Pixelbreite um.
// Zuerst daneben (neben der Nummer), sonst darunter; reicht der Platz nicht, schrumpft die Schrift etwas, zuletzt wird gekürzt.
const _mc = document.createElement('canvas').getContext('2d'), _mw = new Map();
function textW(t, px) { // Breite von fettem Text in px, gemessen bei 100px und hochgerechnet
  let v = _mw.get(t);
  if (v === undefined) { _mc.font = `600 100px ${getComputedStyle(document.body).fontFamily}`; v = _mc.measureText(t).width / 100; _mw.set(t, v); }
  return v * px;
}
function wrapPx(text, maxW, px) { // null, wenn ein einzelnes Wort breiter als maxW ist
  const lines = [];
  let cur = '';
  for (const wd of text.split(/\s+/).filter(Boolean)) {
    if (textW(wd, px) > maxW) return null;
    const t = cur ? cur + ' ' + wd : wd;
    if (!cur || textW(t, px) <= maxW) cur = t; else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function zoneLabel(z, i, hue, w, h, sx) {
  const base = Math.max(10, Math.min(24, 11 * 1000 / (sx * 340))); // Schriftgröße in Bildschirm-Pixeln, wächst beim Hineinzoomen
  const wpx = w / sx, hpx = h / sx;
  let best = null;
  for (let fpx = base; fpx >= Math.max(8, base * 0.75) && !best; fpx -= 0.5) {
    const lh = fpx * 1.2, rad = fpx * 0.7, pad = 4;
    // A: Text neben der Nummer
    const la = wrapPx(z.name, wpx - pad * 3 - rad * 2, fpx);
    if (la && la.length * lh <= hpx - pad) best = { mode: 'A', lines: la, fpx, rad, pad, lh };
    else {
      // B: Text unter der Nummer, volle Breite
      const lb = wrapPx(z.name, wpx - pad * 2, fpx);
      if (lb && pad + rad * 2 + 2 + lb.length * lh <= hpx) best = { mode: 'B', lines: lb, fpx, rad, pad, lh };
    }
  }
  if (!best) { // zu klein: Nummer, plus so viel Text wie passt
    const fpx = Math.max(8, base * 0.75), lh = fpx * 1.2, rad = fpx * 0.7, pad = 4;
    const room = Math.floor((hpx - (pad + rad * 2 + 2)) / lh);
    let lines = [];
    if (room >= 1) {
      let t = z.name;
      while (t.length > 1 && textW(t + '…', fpx) > wpx - pad * 2) t = t.slice(0, -1);
      lines = [t.length < z.name.length ? t.trimEnd() + '…' : t];
    }
    best = { mode: 'B', lines, fpx, rad, pad, lh };
  }
  const { mode, lines, fpx, rad, pad, lh } = best, k = sx;
  const f = fpx * k, r = rad * k, p = pad * k, L = lh * k;
  const bx = p + r, by = p + r, tx = mode === 'A' ? p * 2 + r * 2 : p;
  const ty = mode === 'A' ? by + f * 0.35 : p + r * 2 + 2 * k + f * 0.9;
  const text = lines.length ? `<text x="${tx}" y="${ty}" class="zl" font-size="${f}" style="stroke-width:${f * 0.2}px">${lines.map((l, n) => `<tspan x="${tx}" dy="${n ? L : 0}">${esc(l)}</tspan>`).join('')}</text>` : '';
  return `<svg x="${z.rect.x}" y="${z.rect.y}" width="${w}" height="${h}"><circle cx="${bx}" cy="${by}" r="${r}" fill="hsl(${hue} 65% 30%)"/>
      <text x="${bx}" y="${by + f * 0.03}" class="num" font-size="${f * 0.8}">${i + 1}</text>${text}</svg>`;
}
function planInner(st) {
  const b = viewBox(), u = b.w / 1000, sx = b.w / 340, step = gridStep(b.w);
  const bg = st.bg ? `<image href="${st.bg}" x="0" y="0" width="1000" height="${st.h || 640}" preserveAspectRatio="none"/>` : '';
  const grid = `<defs><pattern id="grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M${step} 0H0V${step}" class="gridline" stroke-width="${(1.2 * sx).toFixed(2)}"/></pattern></defs>
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" class="floor"/>${bg}<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#grid)"/>`;
  const zones = st.zones.map((z, i) => {
    if (!z.rect) return '';
    const hue = HUES[i % HUES.length], sel = z.id === ui.selZone, { x, y, w, h } = z.rect;
    const sw = ((sel ? 3.5 : 2) * sx).toFixed(2), dash = sel ? ` stroke-dasharray="${(7 * sx).toFixed(1)} ${(5 * sx).toFixed(1)}"` : '';
    return `<g class="zone" data-act="selzone" data-id="${z.id}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(5 * sx).toFixed(1)}" fill="hsl(${hue} 65% 50% / .30)" stroke="hsl(${hue} 65% ${sel ? 28 : 38}%)" stroke-width="${sw}"${dash}/>
      ${zoneLabel(z, i, hue, w, h, sx)}</g>`;
  }).join('');
  let handles = '';
  const sz = ui.drawing ? st.zones.find((z) => z.id === ui.selZone) : null;
  if (sz?.rect) {
    // Griffe passen sich der Größe an: bei kleinen Bereichen kleiner, Seitengriffe nur wenn die Kante lang genug ist
    const { x, y, w, h } = sz.rect, wpx = w / sx, hpx = h / sx, rpx = Math.max(3, Math.min(9, Math.min(wpx, hpx) * 0.14)), r = rpx * sx;
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    if (wpx >= 64) pts.push([x + w / 2, y], [x + w / 2, y + h]);
    if (hpx >= 64) pts.push([x + w, y + h / 2], [x, y + h / 2]);
    handles = pts.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" class="handle" stroke-width="${(Math.min(2, rpx / 3) * sx).toFixed(2)}"/>`).join('');
  }
  return grid + zones + handles;
}

const ICON_FIT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function planHtml(st) {
  return `<div class="plan" id="plan"><svg id="planSvg" class="${ui.drawing ? 'drawing' : ''}" viewBox="${vbStr()}" role="img" aria-label="Grundriss von ${esc(st.name)}">${planInner(st)}</svg>
    <div class="zoombar"><button type="button" data-act="zoomin" aria-label="Vergrößern">+</button><button type="button" data-act="zoomout" aria-label="Verkleinern">−</button><button type="button" data-act="fit" aria-label="Alles anzeigen">${ICON_FIT}</button></div></div>`;
}
function updatePlan() {
  const st = editStore(), svg = $('#planSvg');
  if (!st || !svg) return;
  svg.setAttribute('viewBox', vbStr());
  svg.innerHTML = planInner(st);
}

function viewEditor() {
  const st = editStore();
  if (!st) { ui.editStoreId = null; return viewStores(); }
  const sel = st.zones.find((z) => z.id === ui.selZone);
  const selIdx = sel ? st.zones.indexOf(sel) : -1;
  const catNames = (z) => z.cats.filter((c) => CAT_BY_ID[c]).map((c) => {
    const shared = st.zones.some((o) => o !== z && o.cats.includes(c));
    return (shared && st.zones[defaultZoneIdx(st, c)] === z ? '★ ' : '') + CAT_BY_ID[c].name;
  }).join(', ') || 'keine Kategorie';
  const zlist = st.zones.map((z, i) => `<li class="zli" data-zid="${z.id}"><button type="button" class="zitem" data-act="selzone" data-id="${z.id}" aria-pressed="${z.id === ui.selZone}">
      <span class="badge">${i + 1}</span><span class="zn"><strong>${esc(z.name)}</strong><small>${esc(catNames(z))}${z.rect || !S.showPlan ? '' : ' · nicht eingezeichnet'}</small></span></button>
      <span class="grab" role="img" aria-label="Zum Sortieren ziehen">${ICON_GRAB}</span></li>${z.id === ui.selZone ? '<!--PANEL-->' : ''}`).join('');
  let panel = '';
  if (sel) {
    const sum = (arr) => (arr.length ? esc(arr.slice(0, 2).join(', ')) + (arr.length > 2 ? ` +${arr.length - 2}` : '') : '–');
    panel = `<div class="zpanel">
      <input id="zName" value="${esc(sel.name)}" aria-label="Name von Bereich ${selIdx + 1}">
      <div class="prowwrap"><button type="button" class="prow" data-act="catsheet"><span class="pl">Kategorien</span><span class="pv">${sum(sel.cats.map((c) => CAT_BY_ID[c]?.name).filter(Boolean))}</span></button>${sharedCats(st, sel).length ? `<button type="button" class="star${isStdZone(st, sel) ? ' on' : ''}" data-act="setstd" aria-pressed="${isStdZone(st, sel)}" aria-label="Standard-Bereich für seine Kategorien">${isStdZone(st, sel) ? '★' : '☆'}</button>` : ''}</div>
      <button type="button" class="prow" data-act="prodsheet"><span class="pl">Produkte</span><span class="pv">${sum(Object.values(sel.prods || {}))}</span></button>
      <div class="actions">
        <button type="button" class="btn ghost small" data-act="zup" aria-label="Früher in der Route"${selIdx === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" class="btn ghost small" data-act="zdown" aria-label="Später in der Route"${selIdx === st.zones.length - 1 ? ' disabled' : ''}>↓</button>
        ${S.showPlan ? `<button type="button" class="btn ghost small" data-act="zdraw" style="flex:1">${sel.rect ? 'Form ändern' : 'Einzeichnen'}</button>` : ''}
        <button type="button" class="btn danger small"${S.showPlan ? '' : ' style="flex:1"'} data-act="zdel">Löschen</button>
      </div></div>`;
  }
  if (!ui.view) ui.view = fitView(st);
  if (!S.showPlan) ui.drawing = false;
  const bar = ui.drawing && sel
    ? `<p class="hint live">Ziehen = neu · Kante/Ecke = anpassen · Mitte = schieben · Daneben tippen = fertig</p>`
    : `<p class="hint">${S.showPlan ? (st.zones.length ? 'Antippen: bearbeiten · Gedrückt halten: Form ändern' : 'Lege Bereiche an, zeichne sie ein und wähle ihre Kategorien.') : (st.zones.length ? 'Reihenfolge = Laufweg. Am Griff ziehen zum Sortieren.' : 'Lege Bereiche in der Reihenfolge deines Laufwegs an und wähle ihre Kategorien.')}</p><button type="button" class="btn small" data-act="addzone">+ Bereich</button>`;
  return `
    <div class="edhead">
      <button type="button" class="pageback" data-act="back" aria-label="Zurück zu Geschäfte">${ICON_BACK}<span>Geschäfte</span></button>
      <input id="storeName" value="${esc(st.name)}" aria-label="Name des Geschäfts">
      <button type="button" class="iconbtn" data-act="editormenu" aria-haspopup="dialog" aria-label="Menü">${ICON_DOTS}</button>
    </div>
    <button type="button" class="prow plantoggle${S.showPlan ? ' open' : ''}" data-act="togplan" aria-expanded="${!!S.showPlan}"><span class="pl">Grundriss</span><span class="pv">${S.showPlan ? 'Bereiche einzeichnen' : 'optional, zum Einzeichnen'}</span></button>
    ${S.showPlan ? `${planHtml(st)}
    <div class="bgrow">
      <label for="bgFile" class="bgadd" title="Foto oder Skizze als Vorlage hinter den Grundriss legen">${ICON_CAM}<span>${st.bg ? 'Grundrissskizze ersetzen' : 'Grundrissskizze hinzufügen'}</span></label><input type="file" id="bgFile" accept="image/*" hidden>
      ${st.bg ? '<button type="button" class="chipbtn" data-act="clearbg" aria-label="Skizze entfernen">×</button>' : ''}
    </div>` : ''}
    <div class="planbar">${bar}</div>
    <ul class="zlist">${zlist.replace('<!--PANEL-->', panel ? `<li class="zpanelli">${panel}</li>` : '')}</ul>`;
}

function render() {
  const v = $('#view');
  if (ui.tab === 'list') {
    if ($('#addForm')) { $('#listBody').innerHTML = listBody(); $('.bar').innerHTML = barHtml(); }
    else v.innerHTML = viewList();
  } else if (ui.tab === 'meals') {
    v.innerHTML = viewMeals();
  } else if (ui.tab === 'settings') {
    v.innerHTML = viewSettings();
  } else {
    v.innerHTML = ui.editStoreId ? viewEditor() : viewStores();
    if (ui.editStoreId) { if (S.showPlan) bindPlan(); else planAbort?.abort(); bindZoneDrag(); }
  }
  renderTabs();
  refreshTopPage();
}
// Untere Leiste: Liste | Essen | Einstellungen (Läden und ihr Editor gehören zu Einstellungen)
const TAB_ICONS = {
  list: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M3.8 6l1.2 1.2L7 5M3.8 12l1.2 1.2L7 11M3.8 18l1.2 1.2L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  meals: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M7 3v8M4.5 3v5.2a2.5 2.5 0 0 0 5 0V3M7 11v10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M17 21V3c-2.4 1.2-3.5 4-3.5 7.5 0 1.7.9 2.5 2 2.5h1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="15" cy="7" r="2.2" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="9" cy="17" r="2.2" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
};
function renderTabs() {
  const nav = $('#tabbar');
  if (!nav) return;
  const cur = ui.tab === 'stores' ? 'settings' : ui.tab;
  const listLabel = (S.lists.length > 1 ? curList().name : 'Liste') + (cur === 'list' ? ' ▾' : ''); // Name der aktiven Liste; zweiter Tipp öffnet die Auswahl
  nav.innerHTML = [['list', listLabel], ['meals', 'Essen'], ['settings', 'Einstellungen']].map(([t, label]) =>
    `<button type="button" data-act="tab" data-tab="${t}"${cur === t ? ' aria-current="page"' : ''}${t === 'list' ? ' aria-haspopup="dialog"' : ''}>${TAB_ICONS[t]}<span>${esc(label)}</span></button>`).join('');
}
function viewSettings() {
  if (!appVersion && !IS_LOCAL) setTimeout(loadVersion, 0); // Nummer noch leer: nochmal nachfragen
  const row = (act, title, sub, extra = '') => `<li><button type="button" class="card" data-act="${act}"${extra}><span><strong>${title}</strong><small>${sub}</small></span><span class="go">›</span></button></li>`;
  return `<div class="edhead"><h2>Einstellungen</h2></div>
    <ul class="cards">
      ${row('accountsheet', 'Konto und Haushalt', typeof accountSub === 'function' ? accountSub() : 'Nicht angemeldet')}
      ${row('listspage', 'Listen', esc(S.lists.map((l) => l.name).join(', ')))}
      ${row('tab', 'Geschäfte und Grundrisse', `${S.stores.length} ${S.stores.length === 1 ? 'Geschäft' : 'Geschäfte'}`, ' data-tab="stores"')}
      ${row('swipesheet', 'Wischen', 'Aktionen für Einträge und Essen')}
      ${row('themepage', 'Darstellung', `${THEME_LABEL[themePref()]} · ${accentName()}`)}
      ${row('catlist', 'Kategorien und Stichwörter', `${CATS.length} Kategorien`)}
    </ul>
    ${appVersion ? `<p class="tip">Version ${esc(appVersion)}</p>` : ''}`;
}
// Versionsnummer: steht nur an einer Stelle, im Namen des Caches in sw.js ("einkaufsroute-v0.6.1").
// Die App liest sie aus dem Cache, aus dem sie gerade läuft.
let appVersion = '';
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
if (IS_LOCAL) {
  // Lokal gibt es keinen Cache: Nummer direkt aus sw.js lesen
  fetch('sw.js').then((r) => r.text()).then((t) => {
    const m = t.match(/einkaufsroute-v([\w.]+)/);
    if (!m) return;
    appVersion = `${m[1]} · lokal`;
    // Uhrzeit der zuletzt gespeicherten Datei anhängen: so sieht man, ob das Neuladen schon den neuesten Stand hat
    const files = ['index.html', 'app.js', 'sync.js', 'style.css', 'sw.js'];
    return Promise.all(files.map((f) => fetch(f, { cache: 'no-store' }).then((r) => Date.parse(r.headers.get('Last-Modified')) || 0, () => 0)))
      .then((ts) => { const t = Math.max(...ts); if (t) appVersion += `, Stand ${new Date(t).toLocaleTimeString('de-DE')}`; });
  }).then(() => { if (ui.tab === 'settings') render(); }).catch(() => {});
} else {
  loadVersion();
}
// Online: den Service Worker fragen, der die App gerade ausliefert. Ersatzweise den Namen des Caches lesen.
function loadVersion() {
  const set = (name) => {
    const v = String(name || '').replace(/^einkaufsroute-v/, '');
    if (!v || v === appVersion) return;
    appVersion = v;
    if (ui.tab === 'settings' && !pages.length) render();
  };
  // 1. Weg: sw.js selbst lesen (liegt im Offline-Speicher in der Fassung der laufenden Version)
  fetch('sw.js').then((r) => r.text()).then((t) => set((t.match(/einkaufsroute-v[\w.]+/) || [])[0])).catch(() => {});
  // 2. und 3. Weg als Ersatz: Service Worker fragen, Namen des Caches lesen
  const sw = navigator.serviceWorker;
  if (sw) {
    if (!loadVersion.on) { loadVersion.on = true; sw.addEventListener('message', (e) => { if (e.data?.version) set(e.data.version); }); }
    sw.ready.then((reg) => (sw.controller || reg.active)?.postMessage('version')).catch(() => {});
  }
  window.caches?.keys().then((keys) => set(keys.filter((n) => n.startsWith('einkaufsroute-v')).pop())).catch(() => {});
}

// ---------- Sheets ----------
const dlg = () => $('#dlg');
function openSheet(html) {
  const d = dlg();
  d.innerHTML = html;
  // Einheitliche Kopfzeile: Titel links, rechts ein runder ✕-Knopf (schließt, Änderungen bleiben; bei Neu-Anlegen = Abbrechen). Schließen geht auch per Wisch nach unten.
  const title = d.querySelector(':scope > .sheettitle'), head = document.createElement('div');
  head.className = 'sheethead';
  const isNew = !!d.querySelector('form[id^="new"]');
  head.innerHTML = `<button type="button" class="sheetdone" data-act="closedlg" aria-label="${isNew ? 'Abbrechen' : 'Schließen'}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>`;
  if (title) head.prepend(title); else head.prepend(Object.assign(document.createElement('div'), { className: 'sheettitle' }));
  d.prepend(head);
  if (!d.open) {
    d.showModal(); ui.sheetT = Date.now();
    // showModal() fokussiert das erste Feld; auf dem iPhone würde dann die Tastatur aufgehen. Nur Felder mit autofocus behalten den Fokus.
    const a = document.activeElement;
    if (a && d.contains(a) && a.matches('input, textarea, select') && !a.hasAttribute('autofocus')) a.blur();
  }
  d.querySelector('[autofocus]')?.focus();
}

// ---------- Seiten (Unterseiten, die von rechts hereingleiten) ----------
// Einheitlich für alle Unterseiten: oben Zurück-Pfeil und Titel, verlassen mit dem Pfeil oder Wisch vom linken Rand.
// openPage(key, titel, html, neuZeichnen):
//   - key ist schon die oberste Seite: nur der Inhalt wird ersetzt (z. B. nach einer Änderung)
//   - key liegt weiter unten im Stapel: zurück bis dorthin
//   - sonst: neue Seite gleitet herein
// Sheets (von unten) bleiben für schnelle Aktionen: Liste wählen, Eintrag bearbeiten, Neues anlegen.
const pages = []; // [{ key, title, el, refresh }]
const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const pageTop = () => (pages.length ? pages[pages.length - 1].key : null);
const PAGE_EASE = 'cubic-bezier(.25, .8, .25, 1)';
const ICON_BACK = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const pageHead = (back, title, attrs = 'data-act="pageback"') => `<header class="pagehead">
    <button type="button" class="pageback" ${attrs} aria-label="Zurück zu ${esc(back)}">${ICON_BACK}<span>${esc(back)}</span></button>
    <h2 class="pagetitle">${esc(title)}</h2></header>`;
const rootTitle = () => ({ list: S.lists.length > 1 ? curList().name : 'Liste', meals: 'Essen', stores: 'Geschäfte' }[ui.tab] || 'Einstellungen');
function setPagesInert() {
  const n = pages.length;
  $('.wrap').inert = n > 0;
  pages.forEach((p, i) => { p.el.inert = i < n - 1; });
}
function openPage(key, title, html, refresh) {
  const i = pages.findIndex((p) => p.key === key);
  if (i > -1 && i < pages.length - 1) popPages(pages.length - 1 - i);
  const top = pages[pages.length - 1];
  if (top && top.key === key) {
    if (refresh) top.refresh = refresh;
    if (top.title !== title) { top.title = title; top.el.querySelector('.pagetitle').textContent = title; }
    top.el.querySelector('.pagebody').innerHTML = html;
    return;
  }
  if (dlg().open) closeSheet();
  const el = document.createElement('section');
  el.className = 'page'; el.setAttribute('aria-label', title);
  el.innerHTML = pageHead(top ? top.title : rootTitle(), title) + `<div class="pagebody">${html}</div>`;
  const under = top ? top.el : $('.wrap');
  $('#pages').append(el);
  pages.push({ key, title, el, refresh });
  setPagesInert();
  if (!reduceMotion() && el.animate) {
    const o = { duration: 320, easing: PAGE_EASE };
    el.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], o);
    under.animate([{ transform: 'none' }, { transform: 'translateX(-25%)' }], o);
  }
  el.querySelector('[autofocus]')?.focus({ preventScroll: true });
}
// n Seiten zurück. fromX: Seite ist schon so weit nach rechts gezogen (Wisch-zurück).
function popPages(n = 1, fromX = 0) {
  n = Math.min(n, pages.length);
  if (!n) return;
  flushSheetInputs(); // halb Getipptes (Stichwort, Listenname) nicht verlieren
  ui.confirmCat = false; ui.confirmList = false;
  const removed = pages.splice(pages.length - n, n), leaving = removed[removed.length - 1].el;
  removed.slice(0, -1).forEach((p) => p.el.remove());
  const top = pages[pages.length - 1], under = top ? top.el : $('.wrap');
  setPagesInert();
  under.style.transform = '';
  if (top) top.refresh?.(); else render();
  if (reduceMotion() || !leaving.animate) { leaving.remove(); return; }
  leaving.inert = true;
  const w = innerWidth, o = { duration: 280, easing: PAGE_EASE };
  leaving.style.transform = '';
  const a = leaving.animate([{ transform: `translateX(${fromX}px)` }, { transform: 'translateX(100%)' }], { ...o, fill: 'forwards' });
  a.finished.then(() => leaving.remove(), () => leaving.remove());
  under.animate([{ transform: `translateX(${-0.25 * (w - fromX)}px)` }, { transform: 'none' }], o);
}
function closeAllPages() {
  pages.splice(0).forEach((p) => p.el.remove());
  setPagesInert();
  $('.wrap').style.transform = '';
}
// Zurück zu einer bestimmten Seite, wenn es sie im Stapel gibt (sonst nur eine Seite zurück)
function backTo(key, fn) { if (pages.some((p) => p.key === key)) fn(); else popPages(1); }
// Oberste Seite neu zeichnen (nach Abgleich o. Ä.), aber nicht während dort jemand tippt
function refreshTopPage() {
  const p = pages[pages.length - 1], a = document.activeElement;
  if (!p || !p.refresh || (a && p.el.contains(a) && a.matches('input, textarea, select'))) return;
  p.refresh();
}
// Läden und ihr Editor liegen in der Hauptansicht, verhalten sich aber wie Seiten (gleiten herein, Zurück, Wisch-zurück)
function wrapAnim(kind) {
  const w = $('.wrap');
  if (reduceMotion() || !w.animate) return;
  if (kind === 'push') w.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 320, easing: PAGE_EASE });
  else if (kind === 'pop') w.animate([{ transform: 'translateX(-25%)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: PAGE_EASE });
  else w.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
}
function storesBack() {
  if (ui.editStoreId) { ui.editStoreId = null; ui.selZone = null; ui.drawing = false; }
  else ui.tab = 'settings';
  render(); window.scrollTo(0, 0);
}
// Wisch vom linken Rand: Seite folgt dem Finger, darunter sieht man die vorige
(function edgeBack() {
  let g = null;
  const target = () => {
    if (pages.length) return { el: pages[pages.length - 1].el, under: pages.length > 1 ? pages[pages.length - 2].el : $('.wrap') };
    return ui.tab === 'stores' ? { el: $('.wrap'), under: null } : null;
  };
  document.addEventListener('pointerdown', (e) => {
    g = null;
    if (!e.isPrimary || e.clientX > 24 || dlg().open || $('#viewer')?.open || e.target.closest?.('.plan')) return;
    const t = target();
    if (t) g = { ...t, id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, vx: 0, lt: e.timeStamp, lx: e.clientX, active: false };
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    e.stopPropagation(); // Wischen auf Einträgen nicht gleichzeitig auslösen
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > dx) { g = null; return; }
      if (dx < 10) return;
      g.active = true;
      try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
      if (document.activeElement?.matches?.('input, textarea, select')) document.activeElement.blur();
    }
    if (e.timeStamp > g.lt) { g.vx = (e.clientX - g.lx) / (e.timeStamp - g.lt); g.lt = e.timeStamp; g.lx = e.clientX; }
    g.dx = Math.max(0, dx);
    g.el.style.transform = `translateX(${g.dx}px)`;
    if (g.under) g.under.style.transform = `translateX(${-0.25 * (innerWidth - g.dx)}px)`;
  }, true);
  const end = (e, cancel) => {
    if (!g || e.pointerId !== g.id) return;
    const d = g; g = null;
    if (!d.active) return;
    ui.swipedT = Date.now();
    const w = innerWidth, go = !cancel && (d.dx > w * 0.35 || (d.vx > 0.4 && d.dx > 30));
    const o = { duration: 220, easing: PAGE_EASE };
    if (go && pages.length) { popPages(1, d.dx); return; }
    if (go) { // Läden-Ansicht
      const a = d.el.animate([{ transform: `translateX(${d.dx}px)` }, { transform: 'translateX(100%)' }], { ...o, fill: 'forwards' });
      d.el.style.transform = '';
      a.finished.then(() => { storesBack(); a.cancel(); wrapAnim('pop'); }, () => {});
      return;
    }
    d.el.style.transform = '';
    d.el.animate([{ transform: `translateX(${d.dx}px)` }, { transform: 'none' }], o);
    if (d.under) { d.under.style.transform = ''; d.under.animate([{ transform: `translateX(${-0.25 * (w - d.dx)}px)` }, { transform: 'translateX(-25%)' }], o); }
  };
  document.addEventListener('pointerup', (e) => end(e, false), true);
  document.addEventListener('pointercancel', (e) => end(e, true), true);
})();

// ---------- Tastatur auf dem iPhone ----------
// Safari macht bei offener Tastatur nicht die Seite kleiner, sondern nur den sichtbaren Ausschnitt (visualViewport).
// Ein Sheet am unteren Rand läge dann hinter der Tastatur. Deshalb messen wir die Tastatur und schieben das Sheet
// darüber (CSS-Variablen --kb und --vvh). Danach wird das aktive Feld im Sheet in den sichtbaren Bereich gerollt.
(function keyboardWatch() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let raf = 0, lastKb = 0;
  const showField = () => {
    const a = document.activeElement;
    if (a && a.matches?.('input, textarea, select') && a.closest('#dlg, .page')) a.scrollIntoView({ block: 'nearest' });
  };
  const update = () => {
    raf = 0;
    // Teil der Seite, der unten verdeckt ist (Tastatur). Kleine Werte (z. B. Safari-Leisten) zählen nicht.
    const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const kb = covered > 80 ? covered : 0;
    root.style.setProperty('--kb', `${kb}px`);
    root.style.setProperty('--vvt', `${kb ? Math.round(vv.offsetTop) : 0}px`);
    if (kb) root.style.setProperty('--vvh', `${Math.round(vv.height)}px`); else root.style.removeProperty('--vvh');
    root.classList.toggle('kb', kb > 0);
    if (kb && kb !== lastKb) setTimeout(showField, 280); // nach dem Hochschieben des Sheets
    lastKb = kb;
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
  vv.addEventListener('resize', queue);
  vv.addEventListener('scroll', queue);
  // Wechsel in ein anderes Feld, während die Tastatur schon offen ist
  document.addEventListener('focusin', (e) => {
    if (lastKb && e.target.matches?.('input, textarea, select') && e.target.closest('#dlg, .page')) setTimeout(showField, 50);
  });
  // Tastatur zu: Safari lässt die Seite manchmal verschoben stehen. Dann einmal zurechtrücken.
  document.addEventListener('focusout', () => setTimeout(() => {
    if (!document.activeElement?.matches?.('input, textarea, select')) { queue(); if (vv.offsetTop > 0) window.scrollTo(window.scrollX, window.scrollY); }
  }, 300));
  update();
})();
// Was im Feld eines Sheets getippt, aber noch nicht mit + bestätigt wurde, geht beim Schließen nicht verloren (Komma trennt mehrere)
let toastT;
// Kurze Meldung unten; popover liegt über dem offenen Sheet
function toast(msg, undoFn) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('popover', 'manual'); t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  if (undoFn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toastbtn'; b.textContent = 'Rückgängig';
    b.onclick = () => { clearTimeout(toastT); try { t.hidePopover(); } catch (e) {} undoFn(); };
    t.appendChild(b);
  }
  try { if (t.matches(':popover-open')) t.hidePopover(); t.showPopover(); } catch (e) { t.classList.add('fallback'); }
  clearTimeout(toastT);
  toastT = setTimeout(() => { try { t.hidePopover(); } catch (e) {} t.classList.remove('show'); }, undoFn ? 5000 : 2800);
}
function addPins(text) {
  const learned = {};
  const st = editStore(), z = selZoneOrNull();
  const names = text.split(',').map((w) => w.trim()).filter(Boolean);
  if (!st || !z || !names.length) return false;
  names.forEach((name) => {
    const k = normKey(name), d = dupKey(name); st.zones.forEach((o) => { if (o.prods) Object.keys(o.prods).forEach((x) => { if (dupKey(x) === d) delete o.prods[x]; }); }); z.prods[k] = name;
    // Ein unbekanntes Produkt wird Stichwort der ersten Kategorie des Bereichs; ist es schon irgendwo Stichwort, bleibt es dort
    const cats = z.cats.filter((c) => CAT_BY_ID[c]);
    if (cats.length && keywordGuess(name) === 'sonst' && !cats.includes('sonst')) { CAT_BY_ID[cats[0]].kw.push(k); (learned[cats[0]] = learned[cats[0]] || []).push(name); }
  });
  const msg = Object.entries(learned).map(([c, w]) => `${w.map((x) => '„' + x + '“').join(', ')} jetzt Stichwort bei ${CAT_BY_ID[c].name}`).join(' · ');
  if (msg) toast(msg);
  return true;
}
function addKeywords(catId, text) {
  const c = CAT_BY_ID[catId];
  const words = text.split(',').map((w) => w.trim().toLowerCase()).filter((w) => w && !c?.kw.includes(w));
  if (!c || !words.length) return false;
  c.kw.push(...new Set(words));
  return true;
}
function flushSheetInputs() {
  const mi = $('#mIng'), mt = $('#mTagNew'), mm = mealById(ui.mealId);
  if (mi && mm && mi.value.trim() && addIngredients(mm.id, mi.value)) { mi.value = ''; save(); }
  if (mt && mm && mt.value.trim() && addTagsTo(mm, mt.value)) { mt.value = ''; save(); }
  const pin = $('#pinName'), kw = $('#kwInput'), ln = $('#listName');
  if (ln) renameList(ln.value, ln.dataset.id);
  if (pin && pin.value.trim() && addPins(pin.value)) { pin.value = ''; commit(); }
  if (kw && kw.value.trim() && addKeywords($('#kwForm')?.dataset.id, kw.value)) { kw.value = ''; save(); }
}
// Schließen (Fertig, Wisch nach unten, Tipp daneben) behält immer die Änderungen
const closeSheet = () => {
  if (!dlg().open) return;
  flushSheetInputs();
  const ef = dlg().querySelector('#editForm');
  if (ef && ef.checkValidity()) ef.requestSubmit(); // Eintrag speichern (das Formular schließt das Sheet selbst)
  if (dlg().open) dlg().close();
};

function storeSheet() {
  openSheet(`<div class="sheettitle">Einkauf bei</div>
    <button type="button" class="sheetbtn${S.storeId ? '' : ' on'}" data-act="pickstore" data-id="">Kein Geschäft <small>Standardreihenfolge</small></button>
    ${S.stores.map((s) => `<button type="button" class="sheetbtn${s.id === S.storeId ? ' on' : ''}" data-act="pickstore" data-id="${s.id}">${esc(s.name)}</button>`).join('')}
    <button type="button" class="sheetbtn accent" data-act="newstoresheet">+ Neues Geschäft</button>
    <button type="button" class="sheetbtn accent" data-act="gostores">Geschäfte bearbeiten …</button>`);
}
function assignSheet(cat) {
  const st = curStore();
  openSheet(`<div class="sheettitle">Wo liegt „${esc(CAT_BY_ID[cat]?.name || cat)}“ bei ${esc(st.name)}?</div>
    ${st.zones.map((z, i) => `<button type="button" class="sheetbtn" data-act="putcat" data-id="${z.id}" data-cat="${cat}"><span><b>${i + 1}</b> &nbsp;${esc(z.name)}</span><small>${esc(z.cats.map((c) => CAT_BY_ID[c]?.name).filter(Boolean).join(', '))}</small></button>`).join('')}
    <button type="button" class="sheetbtn accent" data-act="newzonefor" data-cat="${cat}">Neuer Bereich am Ende der Route</button>`);
}
function selZoneOrNull() { const st = editStore(); return st ? st.zones.find((z) => z.id === ui.selZone) || null : null; }
function catSheet() {
  const st = editStore(), z = selZoneOrNull();
  if (!z) return;
  const idx = st.zones.indexOf(z);
  const chips = CATS.filter((c) => c.id !== 'sonst').map((c) => {
    const mine = z.cats.includes(c.id);
    const others = st.zones.map((o, i) => (i !== idx && o.cats.includes(c.id) ? i + 1 : 0)).filter(Boolean);
    const chip = `<button type="button" class="chip" data-act="togcat" data-cat="${c.id}" aria-pressed="${mine}">${esc(c.name)}${others.length ? `<small>(auch ${others.join(', ')})</small>` : ''}</button>`;
    return chip;
  }).join('');
  openSheet(`<div class="sheettitle">Kategorien · ${esc(z.name)}</div>
    <div class="chips big">${chips}</div>
    <p class="sheetnote" style="margin:10px 0">Eine Kategorie darf in mehreren Bereichen liegen, zum Beispiel bei zwei Kühltheken.</p>`);

}
function starSheet() {
  openSheet(`<div class="sheettitle">Standard-Bereich</div>
    <p class="sheetnote" style="margin:0 0 10px">Liegt eine Kategorie in mehreren Bereichen, zum Beispiel bei mehreren Kühltheken, landen Produkte dieser Kategorie ohne festen Bereich im Standard-Bereich.</p>
    <p class="sheetnote" style="margin:0 0 10px">★ = dieser Bereich ist der Standard. ☆ = tippen, um ihn dazu zu machen. Ohne Auswahl gilt der erste Bereich in der Laufreihenfolge.</p>`);
}
function prodSheet() {
  const z = selZoneOrNull();
  if (!z) return;
  const rows = Object.entries(z.prods || {}).map(([k, n]) => `<div class="prodrow"><span>${esc(n)}</span><button type="button" class="link" data-act="unpin" data-key="${esc(k)}" aria-label="${esc(n)} aus diesem Bereich lösen">Entfernen</button></div>`).join('');
  openSheet(`<div class="sheettitle">Produkte · ${esc(z.name)}</div>
    <p class="sheetnote" style="margin:0 0 6px">Diese Produkte liegen hier, egal welche Kategorie sie haben.</p>
    ${rows || '<p class="sheetnote" style="padding:6px 0">Noch keine festgelegt.</p>'}
    <form id="pinForm" class="add" autocomplete="off" style="margin:10px 0">
      <input id="pinName" placeholder="Produkt hinzufügen, z. B. Tofu" aria-label="Produkt hinzufügen">
      <button type="submit" class="plus" aria-label="Hinzufügen">${ICON_PLUS}</button>
    </form>
    <div id="pinSugg" class="sugg inl" role="listbox" aria-label="Vorschläge" hidden></div>`);
}
// Vorschläge unter dem Produktfeld: schon festgelegte fehlen, liegt ein Produkt in einem anderen Bereich, steht das dabei
function updatePinSugg() {
  const box = $('#pinSugg'), input = $('#pinName'), z = selZoneOrNull(), st = editStore();
  if (!box || !input || !z || !st) return;
  const q = input.value.split(',').pop().trim();
  const list = suggestions(q).filter((m) => !Object.keys(z.prods || {}).some((x) => dupKey(x) === dupKey(m.name)));
  if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
  const qf = fold(q);
  box.innerHTML = list.map((m) => {
    const other = st.zones.find((o) => o !== z && o.prods && Object.keys(o.prods).some((x) => dupKey(x) === dupKey(m.name)));
    const hit = fold(m.name).startsWith(qf) ? `<b>${esc(m.name.slice(0, qf.length))}</b>${esc(m.name.slice(qf.length))}` : esc(m.name);
    return `<button type="button" class="sg" role="option" data-act="pinsugg" data-name="${esc(m.name)}"><span class="sgn">${hit}</span><span class="sgtag${other ? ' on' : ''}">${other ? 'jetzt: ' + esc(other.name) : esc(CAT_BY_ID[m.cat]?.name || 'Sonstiges')}</span></button>`;
  }).join('');
  box.hidden = false;
}
const insertBeforeFallback = (cat) => { const i = CATS.findIndex((c) => c.id === 'sonst'); CATS.splice(i < 0 ? CATS.length : i, 0, cat); indexCats(); };
function catListPage() {
  const missing = DEFAULT_CATS.filter((d) => !CAT_BY_ID[d.id]);
  const rows = CATS.map((c) => `<button type="button" class="sheetbtn" data-act="catdetail" data-id="${c.id}"><span>${esc(c.name)}</span><small>${c.id === 'sonst' && !c.kw.length ? 'Auffangbecken' : `${c.kw.length} Stichwörter`} ›</small></button>`).join('');
  const q = $('#catSearch')?.value || '';
  openPage('cats', 'Kategorien', `
    <input id="catSearch" type="search" class="notein catsearch" value="${esc(q)}" placeholder="Produkt suchen: in welcher Kategorie?" aria-label="Stichwort suchen" autocomplete="off" autocapitalize="off" enterkeyhint="search">
    <div id="catRes" class="group" hidden></div>
    <div class="group" id="catRows">${rows}</div>
    ${missing.length ? `<div class="group"><button type="button" class="sheetbtn" data-act="restoredefaults">Fehlende Standard-Kategorien zurückholen <small>${missing.length}</small></button></div>` : ''}
    <button type="button" class="btn ghost" data-act="newcatsheet">+ Neue Kategorie</button>`, catListPage);
  if (q) updateCatSearch();
}
// Suche über alle Stichwörter: zeigt, in welcher Kategorie ein Produkt steckt (und wo ein neues Wort landen würde)
function updateCatSearch() {
  const input = $('#catSearch'), res = $('#catRes'), rows = $('#catRows');
  if (!input || !res || !rows) return;
  const q = input.value.trim(), qf = fold(normKey(q));
  if (qf.length < 1) { res.hidden = true; rows.hidden = false; return; }
  const hits = [];
  CATS.forEach((c) => c.kw.forEach((k) => {
    const f = fold(k);
    let tier = -1, dist = 0;
    if (f === qf) tier = 0;
    else if (f.startsWith(qf)) tier = 1;
    else if (f.split(/[\s\-]/).some((w, i) => i > 0 && w.startsWith(qf))) tier = 2;
    else if (qf.length >= 2 && f.includes(qf)) tier = 3;
    else if (qf.length >= 5 && f[0] === qf[0]) {
      dist = Math.min(editDist(qf, f), ...[-1, 0, 1].map((d) => editDist(qf, f.slice(0, qf.length + d))));
      if (dist <= (qf.length >= 8 ? 2 : 1)) tier = 4;
    }
    if (tier > -1) hits.push({ k, c, tier, dist });
  }));
  hits.sort((a, b) => a.tier - b.tier || a.dist - b.dist || a.k.length - b.k.length || a.k.localeCompare(b.k, 'de'));
  const exact = hits.some((h) => h.tier === 0);
  const row = (label, c, extra) => `<button type="button" class="sheetbtn" data-act="catdetail" data-id="${c.id}"><span>${label}</span><small${extra ? ' class="on"' : ''}>${esc(c.name)} ›</small></button>`;
  let html = '';
  if (!exact && qf.length >= 2 && (!hits.length || keywordGuess(q) !== 'sonst')) { const g = CAT_BY_ID[keywordGuess(q)]; if (g) html += row(`<i>${esc(q)}</i> <small class="muted">landet in</small>`, g, true); }
  html += hits.slice(0, 12).map((h) => row(esc(h.k.charAt(0).toUpperCase() + h.k.slice(1)), h.c, false)).join('');
  res.innerHTML = html || '<p class="sheetnote">Kein Stichwort gefunden.</p>';
  res.hidden = false; rows.hidden = true;
}
function newCatSheet() {
  openSheet(`<div class="sheettitle">Neue Kategorie</div>
    <form id="newCatForm" autocomplete="off">
      <input id="newCatName" autofocus class="notein" placeholder="Name, z. B. Tierbedarf" aria-label="Name der Kategorie" required>
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
function catDetailPage(id) {
  const c = CAT_BY_ID[id];
  if (!c) { backTo('cats', catListPage); return; }
  const def = DEFAULT_CATS.find((d) => d.id === id);
  const changed = def && (def.name !== c.name || JSON.stringify([...def.kw].sort()) !== JSON.stringify([...c.kw].sort()));
  const used = S.items.filter((i) => i.cat === id).length;
  openPage('cat:' + id, 'Kategorie', `
    <label class="field"><span>Name</span><input id="catName" value="${esc(c.name)}" data-id="${id}"></label>
    <div class="label" style="margin:12px 0 4px">Stichwörter</div>
    <p class="sheetnote" style="margin:0 0 6px">${id === 'sonst'
      ? 'Hier landet alles ohne Treffer. Ein Stichwort hier hält ein Wort in Sonstiges, auch wenn es sonst woanders passen würde.'
      : 'Die App erkennt sie am Wortanfang. Änderst du bei einem Eintrag die Kategorie, landet sein Name automatisch hier.'}</p>
    ${c.kw.length ? `<div class="kwbox"><div class="chips">${c.kw.map((k) => `<button type="button" class="chip" data-act="delkw" data-id="${id}" data-kw="${esc(k)}" aria-label="${esc(k)} entfernen">${esc(k)} ×</button>`).join('')}</div></div>` : '<p class="sheetnote">Noch keine Stichwörter.</p>'}
    <form id="kwForm" class="add" data-id="${id}" autocomplete="off" style="margin:8px 0 0">
      <input id="kwInput" placeholder="Stichwort hinzufügen" aria-label="Stichwort hinzufügen">
      <button type="submit" class="plus" aria-label="Hinzufügen">${ICON_PLUS}</button>
    </form>
    ${id !== 'sonst' || changed ? `<div class="actions" style="margin-top:16px">
      ${id !== 'sonst' ? `<button type="button" class="btn danger" data-act="delcat" data-id="${id}">${ui.confirmCat ? `Wirklich löschen? (${used} Einträge)` : 'Kategorie löschen'}</button>` : ''}
      ${changed ? `<button type="button" class="btn ghost" data-act="restorecat" data-id="${id}">Auf Standard zurücksetzen</button>` : ''}
    </div>` : ''}`, () => catDetailPage(id));
}
function newStoreSheet() {
  openSheet(`<div class="sheettitle">Neues Geschäft</div>
    <form id="newStoreForm" autocomplete="off">
      <input id="newStoreName" autofocus class="notein" placeholder="Name, z. B. Rewe Hauptstraße" aria-label="Name des Geschäfts" required>
      ${S.stores.length ? `<label class="srow"><span class="pl">Vorlage</span><select id="nsTemplate" aria-label="Bereiche übernehmen von"><option value="">Leer beginnen</option>${S.stores.map((x) => `<option value="${x.id}">Kopie von ${esc(x.name)}</option>`).join('')}</select></label>` : ''}
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
function listSheet() {
  openSheet(`<div class="sheettitle">Listen</div>
    <div class="scrollbox">${S.lists.map((l) => {
      const n = (l.id === S.listId ? S.items : l.items || []).filter((i) => !i.done).length;
      return `<button type="button" class="sheetbtn${l.id === S.listId ? ' on' : ''}" data-act="picklist" data-id="${l.id}"><span>${esc(l.name)}</span><small>${n} offen</small></button>`;
    }).join('')}</div>
    <div class="actions" style="margin-top:10px">
      <button type="button" class="btn ghost" data-act="newlistsheet">+ Neue Liste</button>
      <button type="button" class="btn ghost" data-act="editlist" data-id="${S.listId}">Bearbeiten</button>
    </div>`);
}
// Einstellungen → Listen: alle Listen, antippen = bearbeiten
function listsPage() {
  const rows = S.lists.map((l) => {
    const n = (l.id === S.listId ? S.items : l.items || []).filter((i) => !i.done).length;
    return `<button type="button" class="sheetbtn" data-act="editlist" data-id="${l.id}"><span>${esc(l.name)}</span><small>${l.id === S.listId ? 'aktiv · ' : ''}${n} offen ›</small></button>`;
  }).join('');
  openPage('lists', 'Listen', `<div class="group">${rows}</div>
    <p class="sheetnote">Welche Liste du gerade siehst, wählst du mit einem zweiten Tipp auf „Liste“ unten.</p>
    <button type="button" class="btn ghost" data-act="newlistsheet">+ Neue Liste</button>`, listsPage);
}
function newListSheet() {
  openSheet(`<div class="sheettitle">Neue Liste</div>
    <form id="newListForm" autocomplete="off">
      <input id="newListName" autofocus class="notein" placeholder="Name, z. B. Drogerie oder Party" aria-label="Name der Liste" required>
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
function listEditPage(id) {
  const l = S.lists.find((x) => x.id === id);
  if (!l) { backTo('lists', listsPage); return; }
  const n = (l.id === S.listId ? S.items : l.items || []).length;
  openPage('list:' + id, 'Liste bearbeiten', `
    <label class="field"><span>Name</span><input id="listName" data-id="${l.id}" value="${esc(l.name)}"></label>
    ${S.lists.length > 1 ? `<div class="actions" style="margin-top:16px"><button type="button" class="btn danger" data-act="dellist" data-id="${l.id}">${ui.confirmList === l.id ? `Wirklich löschen? (${n} Einträge)` : 'Liste löschen'}</button></div>` : ''}`, () => listEditPage(id));
}
// Name sofort übernehmen (beim Tippen), nicht erst beim Verlassen des Feldes
function renameList(v, id) {
  const l = id ? S.lists.find((x) => x.id === id) : curList(), n = v.trim();
  if (!l || !n || l.name === n) return;
  l.name = n; save();
  renderTabs();
}
function switchList(id) {
  const cur = curList(), next = S.lists.find((l) => l.id === id);
  if (!next || next === cur) return;
  finishAll(); // angehakte Einträge noch in ihrer Liste abschließen
  if (cur) { cur.items = S.items; cur.storeId = S.storeId; }
  S.listId = id; S.items = next.items || []; ui.showDone = false;
  // Jede Liste merkt sich ihren Laden (ohne eigenen Laden bleibt der aktuelle; ein gelöschter Laden wird zu "Kein Laden")
  if (next.storeId !== undefined) S.storeId = S.stores.some((x) => x.id === next.storeId) ? next.storeId : null;
}
function moreSheet() {
  const done = S.items.filter((i) => i.done).length;
  openSheet(`<div class="sheettitle">Menü</div>
    <button type="button" class="sheetbtn" data-act="listsheet">Listen <small>${S.lists.length > 1 ? esc(curList().name) : 'neue Liste anlegen'}</small></button>
    <button type="button" class="sheetbtn" data-act="tab" data-tab="meals">Essen <small>${(S.meals || []).length || 'Zutaten auf einen Tipp'}</small></button>
    <button type="button" class="sheetbtn" data-act="gostores">Geschäfte und Grundrisse</button>
    ${done ? `<button type="button" class="sheetbtn" data-act="cleardone">Erledigte entfernen <small>${done}</small></button>` : ''}
    <button type="button" class="sheetbtn" data-act="catlist">Kategorien <small>${CATS.length}</small></button>`);
}
function editorSheet() {
  const st = editStore();
  openSheet(`<div class="sheettitle">${esc(st.name)}</div>
    ${S.storeId === st.id ? '' : `<button type="button" class="sheetbtn" data-act="usestore" data-id="${st.id}">In der Liste verwenden</button>`}
    <button type="button" class="sheetbtn danger" data-act="delstore">${ui.confirmDel ? 'Wirklich löschen?' : 'Geschäft löschen'}</button>`);
}
function zoneField(it) {
  const st = curStore();
  if (!st || !st.zones.length) return '';
  const pinned = pinIdx(st, it.name);
  return `<label class="srow"><span class="pl">Bereich</span><select id="eZone" aria-label="Bereich bei ${esc(st.name)}">
    <option value="">–</option>
    ${st.zones.map((z, i) => `<option value="${z.id}"${i === pinned ? ' selected' : ''}>${i + 1} · ${esc(z.name)}</option>`).join('')}
  </select></label>`;
}
const ICON_CAM = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>';
const ICON_UP = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function photoBoxHtml(it) {
  return it.photo
    ? `<div class="photo"><img src="${it.photo}" alt="Foto zu ${esc(it.name)}" data-act="viewphoto"><div class="photoact"><label for="ePhoto" class="link">Ersetzen</label><button type="button" class="link" data-act="delphoto" data-id="${it.id}">Entfernen</button></div></div>`
    : '';
}
function updatePhotoUi(it) {
  const box = $('#photoBox'), cam = $('#camBtn');
  if (box) box.innerHTML = photoBoxHtml(it);
  if (cam) cam.hidden = !!it.photo;
}
function editSummary(it) {
  const st = curStore();
  let t = CAT_BY_ID[it.cat]?.name || 'Sonstiges';
  if (st) { const zi = pinIdx(st, it.name); if (zi >= 0) t += ` · ${st.zones[zi].name}`; } // Bereich nur, wenn von Hand festgelegt
  return t;
}
function openEdit(id) {
  const it = S.items.find((i) => i.id === id);
  if (!it) return;
  if (!S.tipSeen) { S.tipSeen = true; save(); $('#listBody') && ($('#listBody').innerHTML = listBody()); }
  openSheet(`<div class="sheettitle">Eintrag</div><form method="dialog" id="editForm" data-id="${it.id}" data-cat="${it.cat}">
    <div class="namerow">
      <input id="eName" class="nameinput" value="${esc(it.name)}" placeholder="Name" aria-label="Name" required>
      <input id="eQty" value="${esc(it.qty)}" placeholder="Menge" aria-label="Menge">
    </div>
    <div class="noterow">
      <input id="eNote" class="notein" value="${esc(it.note)}" placeholder="Notiz (optional)" aria-label="Notiz">
      <label class="camlabel" id="camBtn" for="ePhoto" aria-label="Foto aufnehmen oder wählen"${it.photo ? ' hidden' : ''}>${ICON_CAM}</label>
    </div>
    ${it.meals?.length ? `<p class="sheetnote ml" style="margin:2px 0 8px">${MEAL_ICON} Aus: ${esc(it.meals.join(', '))}</p>` : ''}
    <div id="photoBox">${photoBoxHtml(it)}</div>
    <input type="file" id="ePhoto" accept="image/*" hidden>
    <div class="more" inert><div class="moreinner">
      <label class="srow"><span class="pl">Kategorie</span><select id="eCat" aria-label="Kategorie">${CATS.map((c) => `<option value="${c.id}"${c.id === it.cat ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button type="button" class="srowgo" data-act="editcat" aria-label="Kategorie öffnen">›</button></label>
      ${zoneField(it)}
      <p id="learnNote" class="sheetnote" hidden>Der Name wird als Stichwort der neuen Kategorie gemerkt.</p>
    </div></div>
    <div class="actions">
      <button type="button" class="btn danger" data-act="delitem" data-id="${it.id}">Löschen</button>
      <button type="submit" hidden>Speichern</button>
    </div></form>`);
}

// ---------- Wisch-Gesten für Sheets ----------
// Überall auf dem Display: hoch = Details (Kategorie, Bereich) folgen dem Finger und blenden ein, runter = ausblenden, danach schließen.
// Ohne Detailbereich (andere Sheets): runter = schließen.
// Foto im Vollbild: Tippen, ✕ oder nach unten wischen schließt
function viewPhoto(src) {
  let v = $('#viewer');
  if (!v) {
    v = document.createElement('dialog');
    v.id = 'viewer'; v.className = 'viewer';
    document.body.append(v);
    let y0 = null;
    v.addEventListener('click', () => v.close());
    v.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
    v.addEventListener('pointerup', (e) => { if (y0 !== null && e.clientY - y0 > 80) { ui.sheetDragT = Date.now(); v.close(); } y0 = null; });
    v.addEventListener('close', () => { v.innerHTML = ''; });
  }
  v.innerHTML = `<img src="${src}" alt="Foto"><button type="button" class="vx" aria-label="Schließen">×</button>`;
  v.showModal();
}
function bindSheetGestures() {
  const d = dlg();
  let g = null, timer = 0;
  const closeAnimated = () => {
    d.style.transition = 'transform .18s ease'; d.style.transform = 'translateY(100%)';
    setTimeout(() => { closeSheet(); d.style.transition = ''; d.style.transform = ''; }, 180);
  };
  const parts = () => {
    const f = $('#editForm'), more = f?.querySelector('.more'), inner = f?.querySelector('.moreinner');
    return more && inner ? { f, more, inner, img: f.querySelector('.photo img') } : null;
  };
  // Maße: Höhe des Detailbereichs und – falls ein Foto da ist – wie viel höher es voll angezeigt wird
  const metrics = (m) => {
    let h0 = 0, delta = 0;
    if (m.img && m.img.naturalWidth) {
      const r = m.img.getBoundingClientRect(), nat = r.width * m.img.naturalHeight / m.img.naturalWidth, Hm = m.inner.offsetHeight;
      const base = d.scrollHeight - r.height - (m.f.classList.contains('expanded') ? Hm : 0); // Sheet ohne Foto und ohne Details
      const room = innerHeight - 24 - 8 - base - Hm; // so viel Platz bleibt für das Foto, damit nichts abgeschnitten wird
      const full = Math.max(Math.min(nat, room), Math.min(nat, 150));
      h0 = Math.min(nat, 150); delta = Math.max(0, full - h0);
      m.f.style.setProperty('--phfull', `${Math.round(full)}px`);
    }
    return { Hm: m.inner.offsetHeight, h0, delta };
  };
  // Zustand des Detailbereichs setzen: p = 0 (zu) … 1 (offen)
  const setP = (m, mt, p, animate) => {
    const t = animate ? '.22s ease' : 'none';
    m.more.style.transition = animate ? `height ${t}, margin-top ${t}` : 'none';
    m.inner.style.transition = animate ? `opacity ${t}` : 'none';
    m.more.style.height = `${p * mt.Hm}px`;
    if (m.img && mt.delta) { m.img.style.transition = animate ? `height ${t}` : 'none'; m.img.style.maxHeight = 'none'; m.img.style.height = `${mt.h0 + p * mt.delta}px`; }
    m.more.style.marginTop = `${-8 * (1 - p)}px`;
    m.inner.style.opacity = String(p);
  };
  const settle = (m, on) => {
    m.f.classList.toggle('expanded', on);
    m.more.inert = !on;
    ['height', 'marginTop', 'transition', 'opacity'].forEach((k) => { m.more.style[k] = ''; m.inner.style[k] = ''; });
    if (m.img) { m.img.style.height = ''; m.img.style.maxHeight = ''; m.img.style.transition = ''; }
  };
  d.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.scrollbox')) return; // Listen behalten ihr normales Scrollen
    const m = parts();
    if (m && timer) { clearTimeout(timer); timer = 0; if (d._fin) d._fin(); }
    const open = !!m && m.f.classList.contains('expanded');
    const mt = m ? metrics(m) : null, H = mt ? mt.Hm + mt.delta : 0;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, dy: 0, m, mt, open, H, p: open ? 1 : 0, ty: 0, t0: e.timeStamp, y0: e.clientY, vy: 0, lastT: e.timeStamp, lastY: e.clientY };
  });
  d.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(dx)) return;
      g.active = true;
      try { d.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
      d.style.transition = 'none';
      if (g.m) { g.m.more.inert = true; setP(g.m, g.mt, g.p, false); }
      if (document.activeElement?.matches?.('input, textarea, select')) document.activeElement.blur(); // Tastatur weg, damit das Sheet frei gleiten kann
    }
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) { g.vy = (e.clientY - g.lastY) / dt; g.lastT = e.timeStamp; g.lastY = e.clientY; }
    g.dy = dy;
    let p = g.open ? 1 : 0, ty = 0;
    if (g.m && g.H > 0) {
      const base = g.open ? 1 : 0;
      p = Math.min(1, Math.max(0, base - dy / g.H));       // hoch = mehr, runter = weniger
      if (g.open) ty = Math.max(0, dy - g.H);                // Rest nach dem Einklappen schiebt das Sheet nach unten
      else ty = dy > 0 ? dy : -Math.min(Math.max(-dy - g.H, 0), 30) / 3; // ganz oben: leichtes Gummiband
      setP(g.m, g.mt, p, false);
    } else {
      ty = dy > 0 ? dy : Math.max(dy, -30) / 3;
    }
    g.p = p; g.ty = ty;
    d.style.transform = ty ? `translateY(${ty}px)` : '';
  });
  const end = (e, cancel) => {
    if (!g || e.pointerId !== g.id) return;
    const done = g; g = null;
    if (!done.active) {
      // Tipp auf den Griff oben: Details ein-/ausblenden
      const m = parts(), r = d.getBoundingClientRect();
      if (!cancel && m && Math.abs(e.clientY - done.y) < 6 && Math.abs(e.clientX - done.x) < 6 && e.clientY >= r.top && e.clientY - r.top < 26 && !e.target.closest?.('button')) {
        ui.sheetDragT = Date.now();
        const to = !m.f.classList.contains('expanded'), mt = metrics(m);
        m.more.inert = true; setP(m, mt, to ? 0 : 1, false); void m.more.offsetHeight; setP(m, mt, to ? 1 : 0, true);
        d._fin = () => settle(m, to); timer = setTimeout(() => { timer = 0; d._fin(); }, 230);
      }
      return;
    }
    ui.sheetDragT = Date.now(); // der Klick nach dem Loslassen darf das Sheet nicht schließen
    const flickDown = done.vy > 0.5, flickUp = done.vy < -0.5;
    if (!cancel && done.ty > 70 || (!cancel && done.ty > 20 && flickDown)) {
      if (done.m) settle(done.m, false);
      closeAnimated();
      return;
    }
    d.style.transition = 'transform .2s ease'; d.style.transform = '';
    if (done.m) {
      const up = done.dy < 0;
      let on = done.open;
      if (!cancel) on = up ? (done.p > 0.25 || flickUp) : !(done.p < 0.75 || flickDown);
      setP(done.m, done.mt, on ? 1 : 0, true);
      d._fin = () => settle(done.m, on);
      timer = setTimeout(() => { timer = 0; d._fin(); }, 230);
    }
  };
  d.addEventListener('pointerup', (e) => end(e, false));
  d.addEventListener('pointercancel', (e) => end(e, true));
}

// ---------- Bereiche per Drag & Drop sortieren (Griff rechts in der Liste) ----------
function bindZoneDrag() {
  const list = $('.zlist');
  if (!list) return;
  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.grab');
    if (!handle) return;
    e.preventDefault();
    const li = handle.closest('li');
    const grabOffset = e.clientY - li.getBoundingClientRect().top;
    try { handle.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
    li.classList.add('dragging');
    const place = (y) => {
      li.style.transform = 'none';
      const others = [...list.children].filter((c) => c !== li && c.classList.contains('zli'));
      const next = others.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
      if (next) { if (li.nextElementSibling !== next) list.insertBefore(li, next); } else if (list.lastElementChild !== li) list.appendChild(li);
      li.style.transform = `translateY(${y - grabOffset - li.getBoundingClientRect().top}px)`;
    };
    const move = (ev) => {
      place(ev.clientY);
      if (ev.clientY < 90) window.scrollBy(0, -14); else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 14);
    };
    const stop = (ev, cancel) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancelFn);
      const st = editStore();
      if (!cancel && st) {
        const order = [...list.children].filter((c) => c.classList.contains('zli')).map((c) => c.dataset.zid);
        st.zones.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        ui.justDrew = Date.now();
        commit();
      } else render();
    };
    const up = (ev) => stop(ev, false), cancelFn = (ev) => stop(ev, true);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', cancelFn);
    place(e.clientY);
  });
}

// ---------- Plan bedienen: zeichnen, Kanten ziehen, schieben, zoomen ----------
let planAbort = null;
function bindPlan() {
  const svg = $('#planSvg');
  if (!svg) return;
  planAbort?.abort();
  planAbort = new AbortController();
  const NS = 'http://www.w3.org/2000/svg';
  const ptrs = new Map();
  let g = null, ghost = null;
  const rectPx = () => svg.getBoundingClientRect();
  const world = (cx, cy) => { const r = rectPx(), b = viewBox(); return { x: b.x + (cx - r.left) / r.width * b.w, y: b.y + (cy - r.top) / r.height * b.h }; };
  const snap = (v) => { const st = gridStep(ui.view.vw); return Math.round(v / st) * st; };
  const clearGhost = () => { ghost?.remove(); ghost = null; };
  const showGhost = (r) => {
    if (!r) { clearGhost(); return; }
    const sx = ui.view.vw / 340;
    if (!ghost) {
      ghost = document.createElementNS(NS, 'rect');
      ghost.setAttribute('fill', 'none');
      ghost.style.stroke = 'var(--accent)';
      svg.appendChild(ghost);
    }
    ghost.setAttribute('stroke-width', 3 * sx); ghost.setAttribute('stroke-dasharray', `${7 * sx} ${5 * sx}`);
    ghost.setAttribute('x', r.x); ghost.setAttribute('y', r.y); ghost.setAttribute('width', r.w); ghost.setAttribute('height', r.h);
  };
  // Zoomen, so dass der Plan-Punkt "anchor" unter dem Finger (mx,my) bleibt
  const setAnchored = (anchor, mx, my, vw) => {
    const r = rectPx(); vw = clamp(vw, 120, 40000);
    const vh = vw * VIEW_RATIO;
    ui.view.vw = vw;
    ui.view.cx = anchor.x - (mx - r.left) / r.width * vw + vw / 2;
    ui.view.cy = anchor.y - (my - r.top) / r.height * vh + vh / 2;
  };
  const mid = () => { const a = [...ptrs.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 }; };

  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { // zwei Finger: Ansicht verschieben und zoomen
      clearGhost();
      const m = mid();
      g = { mode: 'pinch', d0: m.d, vw0: ui.view.vw, anchor: world(m.x, m.y) };
      ui.justDrew = Date.now();
      return;
    }
    if (ptrs.size > 2) return;
    const st = editStore(), z = ui.drawing ? st?.zones.find((z) => z.id === ui.selZone) : null;
    if (!z) { g = { mode: 'pan', id: e.pointerId, sx: e.clientX, sy: e.clientY, cx0: ui.view.cx, cy0: ui.view.cy, moved: false }; return; }
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
    const p = world(e.clientX, e.clientY), kpx = ui.view.vw / rectPx().width;
    let tol = 22 * kpx;
    if (z.rect) tol = Math.max(9, Math.min(22, Math.min(z.rect.w, z.rect.h) / kpx * 0.3)) * kpx; // kleine Bereiche: schmalere Kantenzone, damit die Mitte zum Schieben bleibt
    let mode = 'draw', flags = {};
    if (z.rect) {
      const { x, y, w, h } = z.rect;
      const inY = p.y >= y - tol && p.y <= y + h + tol, inX = p.x >= x - tol && p.x <= x + w + tol;
      flags = { L: inY && Math.abs(p.x - x) <= tol, R: inY && Math.abs(p.x - (x + w)) <= tol, T: inX && Math.abs(p.y - y) <= tol, B: inX && Math.abs(p.y - (y + h)) <= tol };
      if (flags.L || flags.R || flags.T || flags.B) mode = 'resize';
      else if (p.x > x && p.x < x + w && p.y > y && p.y < y + h) mode = 'move';
    }
    g = { mode, flags, p0: p, r0: z.rect ? { ...z.rect } : null, draft: null, sx: e.clientX, sy: e.clientY, moved: false };
  });

  svg.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.mode === 'pinch') {
      if (ptrs.size < 2) return;
      const m = mid();
      setAnchored(g.anchor, m.x, m.y, g.vw0 * g.d0 / m.d);
      updatePlan();
      return;
    }
    if (g.mode === 'pan') {
      if (e.pointerId !== g.id) return;
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved) {
        if (Math.hypot(dx, dy) < 8) return;
        g.moved = true; // erst jetzt "greifen", damit ein einfaches Tippen einen Bereich auswählen kann
        try { svg.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
      }
      const k = ui.view.vw / rectPx().width;
      ui.view.cx = g.cx0 - dx * k; ui.view.cy = g.cy0 - dy * k;
      ui.justDrew = Date.now();
      updatePlan();
      return;
    }
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) g.moved = true;
    const p = world(e.clientX, e.clientY), step = gridStep(ui.view.vw);
    let r;
    if (g.mode === 'draw') r = normRect(snap(g.p0.x), snap(g.p0.y), snap(p.x), snap(p.y));
    else if (g.mode === 'move') r = { ...g.r0, x: snap(g.r0.x + p.x - g.p0.x), y: snap(g.r0.y + p.y - g.p0.y) };
    else {
      let l = g.r0.x, rt = g.r0.x + g.r0.w, t = g.r0.y, bt = g.r0.y + g.r0.h;
      const f = g.flags;
      if (f.L) l = snap(p.x); if (f.R) rt = snap(p.x); if (f.T) t = snap(p.y); if (f.B) bt = snap(p.y);
      r = normRect(l, t, rt, bt);
    }
    g.draft = r.w >= step && r.h >= step ? r : null;
    showGhost(g.draft);
  });

  const end = (e, cancel) => {
    ptrs.delete(e.pointerId);
    if (!g) return;
    if (g.mode === 'pinch') { if (ptrs.size < 2) g = null; return; }
    if (g.mode === 'pan') { if (e.pointerId === g.id) g = null; return; }
    const done = g; g = null; clearGhost();
    if (!cancel && done.mode === 'draw' && !done.moved) {
      // Tippen neben den bearbeiteten Bereich beendet das Bearbeiten: auf einen anderen Bereich = auswählen, ins Leere = nur beenden
      const hit = [...(editStore()?.zones || [])].reverse().find((z) => z.rect && done.p0.x >= z.rect.x && done.p0.x <= z.rect.x + z.rect.w && done.p0.y >= z.rect.y && done.p0.y <= z.rect.y + z.rect.h);
      if (hit) ui.selZone = hit.id;
      ui.drawing = false; ui.justDrew = Date.now(); render();
      return;
    }
    if (cancel || !done.draft) return;
    const z = editStore()?.zones.find((z) => z.id === ui.selZone);
    if (!z) return;
    z.rect = done.draft;
    ui.justDrew = Date.now();
    commit();
  };
  window.addEventListener('pointerup', (e) => end(e, false), { signal: planAbort.signal });
  window.addEventListener('pointercancel', (e) => end(e, true), { signal: planAbort.signal });

  svg.addEventListener('wheel', (e) => { // Mausrad (Computer)
    e.preventDefault();
    setAnchored(world(e.clientX, e.clientY), e.clientX, e.clientY, ui.view.vw * Math.exp(e.deltaY * 0.0015));
    updatePlan();
  }, { passive: false });
}

// Foto verkleinern, damit die Daten klein bleiben
function photoToDataUrl(file, max = 1400) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res({ url: c.toDataURL('image/jpeg', 0.72), w: c.width, h: c.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
}

// ---------- Ereignisse ----------
// Abhaken mit Verzögerung: Der Haken erscheint sofort, die Einträge wandern aber erst nach "Erledigt",
// wenn CHECK_DELAY lang nichts mehr angetippt wurde (so bleibt beim Abhaken mehrerer Dinge alles an seinem Platz).
// Tippst du einen angehakten Eintrag noch einmal an, ist das Abhaken rückgängig.
const CHECK_DELAY = 2500;
let pendT;
function finishAll() {
  clearTimeout(pendT);
  if (!ui.pending.size) return;
  ui.pending.forEach((_, id) => { const it = S.items.find((i) => i.id === id); if (it && !it.done) it.done = true; });
  ui.pending.clear();
  commit();
}
const armPending = () => { clearTimeout(pendT); if (ui.pending.size) pendT = setTimeout(finishAll, CHECK_DELAY); };
function toggleItem(id) {
  const it = S.items.find((i) => i.id === id);
  if (!it) return;
  if (it.done) { it.done = false; commit(); armPending(); return; }
  if (ui.pending.has(id)) ui.pending.delete(id); else ui.pending.set(id, true);
  armPending();
  render();
}
const flushPending = finishAll;
document.addEventListener('visibilitychange', () => { if (document.hidden) flushPending(); });
window.addEventListener('pagehide', flushPending);

let lp = null, lpFired = false, lpStar = false;
// Nach dem langen Drücken auf einen Stern erscheint der Erklärtext und verschiebt das Layout; der Klick beim Loslassen würde sonst etwas anderes treffen
document.addEventListener('click', (e) => { if (lpStar) { lpStar = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
// Gedrückt halten: auf einer Listenzeile = bearbeiten, auf einem Bereich (Plan oder Liste) = neu einzeichnen
function startRedraw(id) {
  ui.selZone = id; ui.drawing = !!S.showPlan; ui.justDrew = Date.now(); render();
  const plan = $('.plan'); if (plan) plan.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
document.addEventListener('pointerdown', (e) => {
  if (ui.drawing && e.target.closest?.('#planSvg')) return; // beim Zeichnen nicht als langes Drücken werten
  if (e.target.closest?.('.grab')) return;
  const el = e.target.closest?.('.row, .zone, .zitem, .star, .mcard');
  if (!el) return;
  const id = el.dataset.id;
  lpFired = false; lpStar = false;
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => {
    lpFired = true; lp = null;
    try { navigator.vibrate?.(15); } catch (_) { /* kein Haptik-Support */ }
    if (el.classList.contains('star')) { lpStar = true; starSheet(); } else if (el.classList.contains('row')) openEdit(id); else if (el.classList.contains('mcard')) openMealEdit(id); else startRedraw(id);
  }, 450) };
});
document.addEventListener('pointermove', (e) => {
  if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) { clearTimeout(lp.t); lp = null; }
});
['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => { if (lp) { clearTimeout(lp.t); lp = null; } }));

// ---------- Wischen auf Einträgen: Aktion pro Richtung in den Einstellungen ----------
const SW_ACTIONS = { delete: 'Löschen', details: 'Details', check: 'Abhaken', open: 'Öffnen', edit: 'Bearbeiten', tolist: 'Zur Liste', none: 'Keine Aktion' };
const SW_CHOICES = { item: ['delete', 'details', 'check', 'none'], meal: ['delete', 'open', 'edit', 'tolist', 'none'] };
// left = von rechts nach links wischen
const swipeCfg = (kind = 'item') => (kind === 'meal' ? { left: 'delete', right: 'tolist', ...(S.swipeM || {}) } : { left: 'delete', right: 'details', ...(S.swipe || {}) });
function deleteItemUndo(id) {
  const idx = S.items.findIndex((i) => i.id === id), lid = S.listId;
  if (idx < 0) return;
  const [it] = S.items.splice(idx, 1);
  ui.pending.delete(id); commit();
  toast(`„${it.name}“ gelöscht`, () => { if (S.listId !== lid) return; S.items.splice(Math.min(idx, S.items.length), 0, it); commit(); });
}
function deleteMealUndo(id) {
  const idx = meals().findIndex((m) => m.id === id);
  if (idx < 0) return;
  const [m] = S.meals.splice(idx, 1);
  commit();
  toast(`„${m.name}“ gelöscht`, () => { S.meals.splice(Math.min(idx, S.meals.length), 0, m); commit(); });
}
function mealSwipeToList(id) {
  const m = mealById(id);
  if (!m) return;
  const lid = S.listId, r = addMealItems(m, m.base || 2, new Set(m.ing.filter((i) => !i.basic).map((i) => i.id)));
  save();
  toast(`${m.name}: ${addedMsg(r)}`, r.added ? () => {
    if (S.listId !== lid) return;
    const ids = new Set(r.fresh.map((x) => x.id));
    S.items = S.items.filter((x) => !ids.has(x.id)); commit();
  } : undefined);
}
function runSwipe(kind, act, id) {
  if (kind === 'meal') {
    if (act === 'delete') deleteMealUndo(id); else if (act === 'open') startMeal(id, false); else if (act === 'edit') { ui.mealId = id; ui.confirmMeal = false; ui.mealTagInput = false; mealEditPage(); } else if (act === 'tolist') mealSwipeToList(id);
    return;
  }
  if (act === 'delete') deleteItemUndo(id);
  else if (act === 'details') openEdit(id);
  else if (act === 'check') toggleItem(id);
}
let sw = null;
document.addEventListener('pointerdown', (e) => {
  const row = e.target.closest?.('.row, .swp');
  if (!row || e.target.closest('#dlg') || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const kind = row.classList.contains('swp') ? 'meal' : 'item';
  sw = { row, kind, id: row.dataset.id || row.dataset.mid, x: e.clientX, y: e.clientY, active: false, pid: e.pointerId, th: Math.min(110, row.offsetWidth * 0.3) };
});
document.addEventListener('pointermove', (e) => {
  if (!sw || e.pointerId !== sw.pid) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; } // senkrecht: normales Scrollen
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    sw.active = true;
    if (lp) { clearTimeout(lp.t); lp = null; }
    try { sw.row.setPointerCapture(sw.pid); } catch (_) { /* nicht kritisch */ }
    sw.row.classList.add('swiping');
  }
  const dir = dx < 0 ? 'left' : 'right', act = swipeCfg(sw.kind)[dir];
  const shown = act === 'none' ? dx * 0.15 : dx; // ohne Aktion gibt es nur einen kleinen Widerstand
  sw.act = act; sw.armed = act !== 'none' && Math.abs(dx) >= sw.th;
  const r = sw.row;
  r.style.setProperty('--sx', shown + 'px');
  r.dataset.dir = dir; r.dataset.kind = act; r.dataset.sw = act === 'none' ? '' : SW_ACTIONS[act]; r.dataset.armed = sw.armed ? '1' : '';
});
function endSwipe(cancel) {
  if (!sw) return;
  const { row, id, active, armed, act, kind } = sw;
  sw = null;
  if (!active) return;
  ui.swipedT = Date.now();
  row.classList.remove('swiping'); row.style.removeProperty('--sx');
  delete row.dataset.armed;
  if (!cancel && armed) runSwipe(kind, act, id);
}
document.addEventListener('pointerup', () => endSwipe(false));
document.addEventListener('pointercancel', () => endSwipe(true));
function swipePage() {
  const sel = (id, kind, side, label) => {
    const v = swipeCfg(kind)[side];
    return `<label class="srow"><span class="pl">${label}</span><select id="${id}" aria-label="${label}">${SW_CHOICES[kind].map((k) => `<option value="${k}"${k === v ? ' selected' : ''}>${SW_ACTIONS[k]}</option>`).join('')}</select></label>`;
  };
  openPage('swipe', 'Wischen', `
    <div class="label" style="margin:0 0 4px">Einträge in der Liste</div>
    ${sel('swLeft', 'item', 'left', '← Nach links')}${sel('swRight', 'item', 'right', 'Nach rechts →')}
    <div class="label" style="margin:12px 0 4px">Essen</div>
    ${sel('swmLeft', 'meal', 'left', '← Nach links')}${sel('swmRight', 'meal', 'right', 'Nach rechts →')}
    <p class="sheetnote">„Zur Liste“ setzt die Zutaten (ohne Basis) für die Standard-Personenzahl auf die aktive Liste. Gelöscht oder hinzugefügt kannst du es kurz danach rückgängig machen.</p>`, swipePage);
}
document.addEventListener('change', (e) => {
  const t = e.target;
  const map = { swLeft: ['swipe', 'left'], swRight: ['swipe', 'right'], swmLeft: ['swipeM', 'left'], swmRight: ['swipeM', 'right'] }[t.id];
  if (!map) return;
  const kind = map[0] === 'swipeM' ? 'meal' : 'item';
  S[map[0]] = { ...swipeCfg(kind), [map[1]]: t.value };
  save(); render();
});
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest?.('.zone, .zitem')) { e.preventDefault(); return; }
  const row = e.target.closest?.('.row'), mc = e.target.closest?.('.mcard');
  if (row) { e.preventDefault(); if (!dlg().open) { lpFired = true; openEdit(row.dataset.id); } }
  else if (mc) { e.preventDefault(); lpFired = true; openMealEdit(mc.dataset.id); }
});
document.addEventListener('keydown', (e) => {
  const row = e.target.closest?.('.row');
  if (!row) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleItem(row.dataset.id); }
  else if (e.key === 'e') { e.preventDefault(); openEdit(row.dataset.id); }
});

// Eingabefeld oben: mehrere Einträge mit Komma trennen ("Milch, Brot, 2 Äpfel"). Das Feld bleibt bestehen, die Tastatur bleibt offen.
function addFromInput() {
  const input = $('#addName');
  const parts = input.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return;
  const dups = [];
  parts.forEach((p, n) => {
    const { qty, name } = parseEntry(p);
    const same = S.items.find((i) => !i.done && dupKey(i.name) === dupKey(name));
    if (same) { dups.push(same); return; } // steht schon auf der Liste (auch als Mehrzahl/Einzahl)
    rememberName(name);
    S.items.push({ id: uid(), name, qty, note: '', cat: guessCat(name), done: false, ts: Date.now() + n });
  });
  input.value = '';
  commit();
  updateSugg();
  if (dups.length) { flashItem(dups[0].id); toast(`${dups.map((d) => '„' + d.name + '“').join(', ')} steht schon auf der Liste`); }
}
function flashItem(id) {
  const row = $(`.row[data-id="${id}"]`);
  if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
}
function updateSugg() {
  const box = $('#sugg'), input = $('#addName');
  if (!box || !input) return;
  const last = input.value.split(/[,\n]/).pop();
  const q = parseEntry(last).name;
  const list = suggestions(q);
  if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
  const qf = fold(q.trim());
  box.innerHTML = list.map((m) => {
    const hit = fold(m.name).startsWith(qf) ? `<b>${esc(m.name.slice(0, qf.length))}</b>${esc(m.name.slice(qf.length))}` : esc(m.name);
    const tag = m.listed ? '<span class="sgtag on">auf der Liste</span>' : `<span class="sgtag">${esc(CAT_BY_ID[m.cat]?.name || 'Sonstiges')}</span>`;
    return `<button type="button" class="sg" role="option" data-act="sugg" data-name="${esc(m.name)}" data-listed="${m.listed}"><span class="sgn">${hit}</span>${tag}</button>`;
  }).join('');
  box.hidden = false;
}
// Tastatur offen lassen, wenn ein Vorschlag angetippt wird
document.addEventListener('mousedown', (e) => { if (e.target.closest?.('.sg')) e.preventDefault(); });
document.addEventListener('input', (e) => { if (e.target.id === 'listName') renameList(e.target.value, e.target.dataset.id); else if (e.target.id === 'addName') updateSugg(); else if (e.target.id === 'pinName') updatePinSugg(); else if (e.target.id === 'catSearch') updateCatSearch(); });
document.addEventListener('focusin', (e) => { if (e.target.id === 'addName') updateSugg(); });
document.addEventListener('focusout', (e) => { if (e.target.id === 'addName') setTimeout(() => { const b = $('#sugg'); if (b && document.activeElement?.id !== 'addName') b.hidden = true; }, 200); });

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'toggle' && (lpFired || Date.now() - (ui.swipedT || 0) < 350)) { lpFired = false; return; } // Klick nach langem Drücken oder Wischen ignorieren
  const st = editStore();
  const zi = st && ui.selZone ? st.zones.findIndex((z) => z.id === ui.selZone) : -1;
  let keep = false;
  switch (act) {
    case 'tab': {
      const to = el.dataset.tab, fromBar = !!el.closest('#tabbar'), cur = ui.tab === 'stores' ? 'settings' : ui.tab;
      if (fromBar && pages.length) { closeAllPages(); if (to === cur) { render(); break; } } // Tipp auf die Leiste: Unterseiten schließen
      else if (to === 'list' && ui.tab === 'list') { ui.confirmList = false; listSheet(); keep = true; break; } // zweiter Tipp auf "Liste": Listen zur Auswahl
      const anim = to === 'stores' ? 'push' : ui.tab === 'stores' && to === 'settings' && !fromBar ? 'pop' : to !== cur ? 'fade' : '';
      ui.tab = to; ui.drawing = false; ui.confirmDel = false; if (ui.tab !== 'stores') ui.editStoreId = null; render(); window.scrollTo(0, 0);
      if (anim) wrapAnim(anim);
      break;
    }
    case 'toggle': toggleItem(id); break;
    case 'storesheet': storeSheet(); keep = true; break;
    case 'swipesheet': swipePage(); keep = true; break;
    case 'themepage': themePage(); keep = true; break;
    case 'setaccent': try { localStorage.setItem('ek_accent', id); } catch (_) { /* privat: gilt nur bis zum Schließen */ } applyTheme(); themePage(); keep = true; break;
    case 'settheme': try { localStorage.setItem('ek_theme', id); } catch (_) { /* privat: gilt nur bis zum Schließen */ } applyTheme(); themePage(); keep = true; break;
    case 'listspage': listsPage(); keep = true; break;
    case 'pageback': popPages(1); keep = true; break;
    case 'listsheet': ui.confirmList = false; listSheet(); keep = true; break;
    case 'picklist': switchList(id); commit(); break;
    case 'newlistsheet': newListSheet(); keep = true; break;
    case 'editlist': ui.confirmList = false; listEditPage(id || S.listId); keep = true; break;
    case 'dellist': {
      const gone = S.lists.find((l) => l.id === id) || curList(), rest = S.lists.filter((l) => l !== gone);
      if (ui.confirmList !== gone.id) { ui.confirmList = gone.id; listEditPage(gone.id); keep = true; break; }
      if (!rest.length) { keep = true; break; }
      ui.confirmList = false;
      if (gone.id === S.listId) { S.lists = rest; S.listId = null; switchList(rest[0].id); S.listId = rest[0].id; S.items = rest[0].items || []; }
      else S.lists = rest;
      backTo('lists', listsPage); commit(); keep = true; break;
    }
    case 'moresheet': moreSheet(); keep = true; break;
    case 'editormenu': ui.confirmDel = false; editorSheet(); keep = true; break;
    case 'assigncat': assignSheet(el.dataset.cat); keep = true; break;
    case 'putcat': {
      const s2 = curStore(), c = el.dataset.cat;
      s2.zones.find((z) => z.id === id).cats.push(c); commit(); break;
    }
    case 'newzonefor': {
      const s2 = curStore(), c = el.dataset.cat;
      s2.zones.push({ id: uid(), name: CAT_BY_ID[c]?.name || 'Bereich', cats: [c], prods: {}, rect: null }); commit(); break;
    }
    case 'pickstore': S.storeId = id || null; commit(); break;
    case 'gostores': ui.tab = 'stores'; ui.editStoreId = null; render(); window.scrollTo(0, 0); wrapAnim('push'); break;
    case 'delitem': clearTimeout(ui.pending.get(id)); ui.pending.delete(id); S.items = S.items.filter((i) => i.id !== id); commit(); break;
    case 'closedlg': break;
    case 'showdone': ui.showDone = !ui.showDone; render(); break;
    case 'cleardone': S.items = S.items.filter((i) => !i.done); commit(); break;
    case 'catlist': flushSheetInputs(); ui.confirmCat = false; catListPage(); keep = true; break;
    case 'pinsugg': {
      const input = $('#pinName');
      const before = input ? input.value.split(',').slice(0, -1).map((x) => x.trim()).filter(Boolean) : [];
      if (addPins([...before, el.dataset.name].join(','))) { if (input) input.value = ''; commit(); prodSheet(); $('#pinName')?.focus(); }
      keep = true; break;
    }
    case 'viewphoto': viewPhoto(el.src); keep = true; break;
    case 'editcat': { const cid = $('#eCat')?.value; if (cid) { ui.confirmCat = false; catDetailPage(cid); } keep = true; break; }
    case 'catdetail': ui.confirmCat = false; catDetailPage(id); keep = true; break;
    case 'newcatsheet': newCatSheet(); keep = true; break;
    case 'delkw': { const c = CAT_BY_ID[id]; c.kw = c.kw.filter((k) => k !== el.dataset.kw); save(); catDetailPage(id); keep = true; break; }
    case 'restorecat': {
      const d = DEFAULT_CATS.find((x) => x.id === id), c = CAT_BY_ID[id];
      c.name = d.name; c.kw = [...d.kw]; save(); render(); catDetailPage(id); keep = true; break;
    }
    case 'restoredefaults':
      DEFAULT_CATS.filter((d) => !CAT_BY_ID[d.id]).forEach((d) => {
        // an der alten Position einfügen: vor der nächsten vorhandenen Standard-Kategorie
        const later = DEFAULT_CATS.slice(DEFAULT_CATS.indexOf(d) + 1).find((x) => CAT_BY_ID[x.id]);
        const at = later ? CATS.findIndex((c) => c.id === later.id) : CATS.length;
        CATS.splice(at, 0, cloneCat(d)); indexCats();
      });
      save(); catListPage(); keep = true; break;
    case 'delcat': {
      if (!ui.confirmCat) { ui.confirmCat = true; catDetailPage(id); keep = true; break; }
      S.items.forEach((i) => { if (i.cat === id) i.cat = 'sonst'; });
      S.stores.forEach((s2) => s2.zones.forEach((z) => { z.cats = z.cats.filter((x) => x !== id); }));
      CATS.splice(CATS.findIndex((c) => c.id === id), 1); indexCats();
      ui.confirmCat = false; commit(); backTo('cats', catListPage); keep = true; break;
    }
    case 'newstoresheet': newStoreSheet(); keep = true; break;
    case 'sugg': {
      const input = $('#addName');
      if (!input) break;
      const parts = input.value.split(/[,\n]/);
      const { qty } = parseEntry(parts.pop());
      const before = parts.map((x) => x.trim()).filter(Boolean);
      if (el.dataset.listed) {
        // steht schon auf der Liste: nichts doppelt anlegen, nur zeigen wo
        input.value = before.join(', ');
        if (before.length) addFromInput(); else { render(); updateSugg(); }
        flashItem(el.dataset.listed);
      } else {
        input.value = [...before, (qty ? qty + ' ' : '') + el.dataset.name].join(', ');
        addFromInput();
      }
      input.focus();
      keep = true; break;
    }
    case 'openstore': ui.editStoreId = id; ui.view = fitView(S.stores.find((x) => x.id === id)); ui.selZone = null; ui.drawing = false; ui.confirmDel = false; render(); window.scrollTo(0, 0); wrapAnim('push'); break;
    case 'back': ui.editStoreId = null; ui.drawing = false; ui.confirmDel = false; render(); window.scrollTo(0, 0); wrapAnim('pop'); break;
    case 'usestore': S.storeId = id; commit(); break;
    case 'delstore':
      if (!ui.confirmDel) { ui.confirmDel = true; editorSheet(); keep = true; break; }
      S.stores = S.stores.filter((s) => s.id !== st.id);
      if (S.storeId === st.id) S.storeId = null;
      ui.editStoreId = null; ui.confirmDel = false; commit(); break;
    case 'togplan': S.showPlan = !S.showPlan; ui.drawing = false; ui.view = fitView(st); commit(); break;
    case 'clearbg': st.bg = null; ui.view = fitView(st); commit(); break;
    case 'addzone': {
      const z = { id: uid(), name: 'Bereich ' + (st.zones.length + 1), cats: [], prods: {}, rect: null };
      st.zones.push(z); ui.selZone = z.id; ui.drawing = !!S.showPlan; commit(); break;
    }
    case 'selzone':
      if (lpFired) { lpFired = false; break; }
      if (Date.now() - ui.justDrew < 400) break;
      ui.selZone = id; commit(); $('.zpanelli')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
    case 'togcat': {
      const z = st.zones[zi], c = el.dataset.cat;
      if (z.cats.includes(c)) { z.cats = z.cats.filter((x) => x !== c); if (st.main && st.main[c] === z.id) delete st.main[c]; }
      else z.cats.push(c);
      commit(); catSheet(); keep = true; break;
    }
    case 'setstd': { if (lpFired) { lpFired = false; break; } const z = st.zones[zi]; if (z) { st.main = st.main || {}; sharedCats(st, z).forEach((c) => { st.main[c] = z.id; }); commit(); } break; }
    case 'zup': if (zi > 0) { [st.zones[zi - 1], st.zones[zi]] = [st.zones[zi], st.zones[zi - 1]]; commit(); } break;
    case 'zdown': if (zi >= 0 && zi < st.zones.length - 1) { [st.zones[zi + 1], st.zones[zi]] = [st.zones[zi], st.zones[zi + 1]]; commit(); } break;
    case 'zdraw': ui.drawing = !!S.showPlan; render(); break;
    case 'delphoto': {
      const it = S.items.find((i) => i.id === id);
      if (it) { it.photo = null; save(); render(); updatePhotoUi(it); }
      keep = true; break;
    }
    case 'catsheet': catSheet(); keep = true; break;
    case 'prodsheet': prodSheet(); keep = true; break;
    case 'unpin': { delete st.zones[zi].prods[el.dataset.key]; commit(); prodSheet(); keep = true; break; }
    case 'zdone': ui.drawing = false; render(); break;
    case 'zoomin': ui.view.vw = clamp(ui.view.vw * 0.7, 120, 40000); updatePlan(); break;
    case 'zoomout': ui.view.vw = clamp(ui.view.vw / 0.7, 120, 40000); updatePlan(); break;
    case 'fit': ui.view = fitView(st); updatePlan(); break;
    case 'zdel': st.zones.splice(zi, 1); ui.selZone = null; ui.drawing = false; commit(); break;
  }
  if (!keep && el.closest('#dlg')) closeSheet();
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.id === 'addForm') {
    e.preventDefault();
    addFromInput();
  } else if (f.id === 'newCatForm') {
    e.preventDefault();
    const name = $('#newCatName').value.trim();
    if (!name) return;
    const cat = { id: 'c' + uid(), name, kw: [] };
    insertBeforeFallback(cat);
    save(); catDetailPage(cat.id);
  } else if (f.id === 'kwForm') {
    e.preventDefault();
    const c = CAT_BY_ID[f.dataset.id];
    if (!addKeywords(c.id, $('#kwInput').value)) return;
    save(); catDetailPage(c.id);
    $('#kwInput')?.focus();
  } else if (f.id === 'pinForm') {
    e.preventDefault();
    if (!addPins($('#pinName').value)) return;
    commit(); prodSheet();
    $('#pinName')?.focus();
  } else if (f.id === 'newListForm') {
    e.preventDefault();
    const name = $('#newListName').value.trim();
    if (!name) return;
    const l = { id: uid(), name, items: [], storeId: null }; // neue Listen starten ohne Laden
    S.lists.push(l);
    switchList(l.id);
    closeSheet(); commit();
  } else if (f.id === 'newStoreForm') {
    e.preventDefault();
    const name = $('#newStoreName').value.trim();
    if (!name) return;
    const tpl = S.stores.find((x) => x.id === $('#nsTemplate')?.value);
    const idMap = {};
    const s = { id: uid(), name, bg: tpl?.bg || null, h: tpl?.h || 640,
      zones: tpl ? JSON.parse(JSON.stringify(tpl.zones)).map((z) => { const id = uid(); idMap[z.id] = id; return { ...z, id }; }) : [] };
    if (tpl?.main) s.main = Object.fromEntries(Object.entries(tpl.main).filter(([, zid]) => idMap[zid]).map(([c, zid]) => [c, idMap[zid]]));
    S.stores.push(s);
    S.storeId = s.id;
    ui.tab = 'stores'; ui.editStoreId = s.id; ui.selZone = null; ui.drawing = false; ui.view = fitView(s);
    closeSheet(); commit();
  } else if (f.id === 'editForm') {
    const it = S.items.find((i) => i.id === f.dataset.id);
    if (it) {
      const oldKey = normKey(it.name), oldName = it.name;
      it.name = $('#eName').value.trim() || it.name;
      const pinSel = $('#eZone'), pinStore = curStore();
      if (pinStore) {
        const newKey = normKey(it.name);
        const wanted = pinSel ? pinSel.value : null;
        if (wanted !== null) {
          pinStore.zones.forEach((z) => { if (z.prods) { delete z.prods[oldKey]; delete z.prods[newKey]; } });
          const target = pinStore.zones.find((z) => z.id === wanted);
          if (target) { target.prods = target.prods || {}; target.prods[newKey] = it.name; }
        }
      }
      it.qty = $('#eQty').value.trim();
      it.note = $('#eNote').value.trim();
      const cat = $('#eCat').value;
      if (cat !== f.dataset.cat) {
        // Von Hand geändert: der Name wird Stichwort der neuen Kategorie; gleiche offene Einträge ziehen mit
        learnKeyword(it.name, cat);
        const key = normKey(it.name);
        S.items.forEach((o) => { if (!o.done && normKey(o.name) === key) o.cat = cat; });
        it.cat = cat;
      } else if (it.name !== oldName && f.dataset.cat === keywordGuess(oldName)) {
        it.cat = keywordGuess(it.name); // automatisch eingeordnet und umbenannt (z. B. Tippfehler): neu einordnen
      }
    }
    commit();
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'ePhoto' && t.files[0]) {
    const it = S.items.find((i) => i.id === $('#editForm')?.dataset.id);
    if (it) {
      try {
        it.photo = (await photoToDataUrl(t.files[0], 900)).url;
        save(); render();
        updatePhotoUi(it);
      } catch (err) { /* Bild nicht lesbar: alles bleibt wie es war */ }
    }
  } else if (t.id === 'catName') {
    const c = CAT_BY_ID[t.dataset.id];
    if (c && t.value.trim()) { c.name = t.value.trim(); save(); render(); }
  } else if (t.id === 'eCat') { const n = $('#learnNote'); if (n) n.hidden = t.value === $('#editForm').dataset.cat; }
  else if (t.id === 'listName') { renameList(t.value, t.dataset.id); render(); }
  else if (t.id === 'storeName') { const st = editStore(); if (st && t.value.trim()) { st.name = t.value.trim(); commit(); } }
  else if (t.id === 'zName') {
    const st = editStore(), z = st?.zones.find((z) => z.id === ui.selZone);
    if (z && t.value.trim()) { z.name = t.value.trim(); commit(); }
  } else if (t.id === 'bgFile' && t.files[0]) {
    const st = editStore();
    try {
      const p = await photoToDataUrl(t.files[0]);
      st.bg = p.url; st.h = Math.round(1000 * p.h / p.w); ui.view = fitView(st);
      closeSheet(); commit();
    } catch (err) { closeSheet(); }
  }
});

// Tippen neben das Sheet schließt es (kurz nach dem Öffnen nicht, sonst schließt der Loslass-Klick es sofort)
dlg().addEventListener('click', (e) => { if (e.target === e.currentTarget && Date.now() - ui.sheetT > 500 && Date.now() - (ui.sheetDragT || 0) > 400) closeSheet(); });

bindSheetGestures();

// ---------- Essen: Zutaten auf einen Tipp auf die Liste, mit Mengenrechner und Zufall ----------
const DEFAULT_TAGS = ['Nudeln', 'Reis', 'schnell', 'viel Gemüse'];
Object.assign(ui, { mealTags: [], mealQ: '', mealId: null, mealPortions: 2, mealPick: new Set(), mealRandom: false, lastRandom: null, confirmMeal: false });
const meals = () => (S.meals = S.meals || []);
const mealById = (id) => meals().find((m) => m.id === id);
const allTags = () => [...new Set([...meals().flatMap((m) => m.tags), ...(S.customTags || [])])].sort((a, b) => a.localeCompare(b, 'de'));
const tagUsed = (t) => meals().some((m) => m.tags.includes(t));
function filteredMeals() {
  const q = fold(ui.mealQ.trim());
  return meals()
    .filter((m) => ui.mealTags.every((t) => m.tags.includes(t)) && (!q || fold(m.name).includes(q) || m.ing.some((i) => fold(i.name).includes(q))))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
const fmtNum = (v) => String(v).replace('.', ',');
const fmtPortions = (p) => `${fmtNum(p)} ${p === 1 ? 'Person' : 'Personen'}`;
// "200g" -> "300g", "2" -> "3", "1,5l" -> "2,3l" (Menge hochrechnen; Text ohne Zahl bleibt)
function scaleQty(qty, f) {
  const m = String(qty || '').match(/^(\d+(?:[.,]\d+)?)(.*)$/);
  if (!m) return qty || '';
  let v = parseFloat(m[1].replace(',', '.')) * f;
  v = v >= 50 ? Math.round(v / 5) * 5 : v >= 10 ? Math.round(v) : Math.max(0.1, Math.round(v * 10) / 10);
  return fmtNum(v) + m[2];
}
function mealCard(m) {
  const sub = [m.tags.join(' · '), `${m.ing.length} ${m.ing.length === 1 ? 'Zutat' : 'Zutaten'}`].filter(Boolean).join(' · ');
  return `<li class="swp" data-mid="${m.id}"><button type="button" class="card mcard" data-act="m_open" data-id="${m.id}">${m.photo ? `<img class="mthumb" src="${m.photo}" alt="">` : ''}<span class="mt"><strong>${esc(m.name)}</strong><small>${esc(sub)}</small></span></button></li>`;
}
function mealListHtml() {
  if (!meals().length) return '<p class="empty">Noch kein Essen. Lege eins an, dann kommen seine Zutaten mit einem Tipp auf die Liste.</p>';
  const list = filteredMeals();
  return list.length ? `<ul class="cards">${list.map(mealCard).join('')}</ul><p class="tip">Tippen: auf die Liste · Gedrückt halten: bearbeiten</p>` : '<p class="empty">Nichts passt zu dieser Auswahl.</p>';
}
function viewMeals() {
  const tags = allTags();
  return `<div class="edhead"><h2>Essen</h2></div>
    ${meals().length ? `<input id="mealQ" type="search" class="notein catsearch" placeholder="Essen oder Zutat suchen" aria-label="Essen suchen" autocomplete="off" value="${esc(ui.mealQ)}">` : ''}
    <div class="chips mtags" role="group" aria-label="Tags">${tags.map((t) => `<button type="button" class="chip${ui.mealTags.includes(t) ? ' on' : ''}${tagUsed(t) ? '' : ' unused'}" data-act="m_tag" data-tag="${esc(t)}" aria-pressed="${ui.mealTags.includes(t)}"${tagUsed(t) ? '' : ' title="Kein Essen mit diesem Tag: Tippen entfernt ihn"'}>${esc(t)}${tagUsed(t) ? '' : ' ×'}</button>`).join('')}${ui.ovTagInput
      ? '<form id="mOvTagForm" class="tagadd" autocomplete="off"><input id="mOvTagNew" autofocus placeholder="Neuer Tag" aria-label="Neuer Tag" enterkeyhint="done"><button type="submit" class="chipbtn" aria-label="Tag hinzufügen">✓</button></form>'
      : '<button type="button" class="chip tagplus" data-act="m_ovtagplus" aria-label="Neuen Tag anlegen">+</button>'}</div>
    <div class="actions mact">${meals().length ? '<button type="button" class="btn" data-act="m_random">Zufälliges Essen</button>' : ''}<button type="button" class="btn ghost" data-act="m_new">+ Neues Essen</button></div>
    <div id="mealList">${mealListHtml()}</div>`;
}
function startMeal(id, random) {
  const m = mealById(id);
  if (!m) return;
  ui.mealId = id; ui.mealRandom = !!random; ui.mealPortions = m.base || 2; ui.confirmMeal = false;
  ui.mealPick = new Set(m.ing.filter((i) => !i.basic).map((i) => i.id)); // Basis-Zutaten hast du meist da
  mealSheet();
}
// Basis-Zutaten stehen immer ganz unten (sonst in der eingegebenen Reihenfolge)
const ingSorted = (m) => [...m.ing.filter((i) => !i.basic), ...m.ing.filter((i) => i.basic)];
function mealSheet() {
  const m = mealById(ui.mealId);
  if (!m) return;
  const f = ui.mealPortions / (m.base || 2);
  const rows = ingSorted(m).map((i) => `<li><label class="mrow"><input type="checkbox" data-act="m_pick" data-id="${i.id}"${ui.mealPick.has(i.id) ? ' checked' : ''}><span class="mn">${esc(i.name)}${i.basic ? ' <small class="basic">Basis</small>' : ''}</span><span class="mq">${esc(scaleQty(i.qty, f))}</span></label></li>`).join('');
  openSheet(`<div class="sheettitle">${esc(m.name)}</div>
    ${m.tags.length ? `<p class="sheetnote" style="margin:-4px 0 8px">${esc(m.tags.join(' · '))}</p>` : ''}
    ${m.photo ? `<img class="mphoto" src="${m.photo}" alt="">` : ''}
    <div class="mstep"><button type="button" class="stepbtn" data-act="m_pm" data-d="-0.5" aria-label="Weniger Personen"${ui.mealPortions <= 0.5 ? ' disabled' : ''}>${ICON_MINUS}</button><span class="mpers">${fmtPortions(ui.mealPortions)}</span><button type="button" class="stepbtn" data-act="m_pm" data-d="0.5" aria-label="Mehr Personen">${ICON_PLUS_S}</button></div>
    ${m.ing.length ? `<ul class="scrollbox mings">${rows}</ul>` : '<p class="sheetnote">Noch keine Zutaten. Tippe auf „Bearbeiten“.</p>'}
    <button type="button" class="btn" id="mAddBtn" data-act="m_tolist"${ui.mealPick.size ? '' : ' disabled'} style="width:100%;margin-top:10px">${mealBtnText()}</button>
    ${m.steps ? `<details class="mmore"><summary>Kochanleitung</summary><div class="msteps">${esc(m.steps)}</div></details>` : ''}
    <div class="actions" style="margin-top:10px">
      <button type="button" class="btn ghost" data-act="m_edit">Bearbeiten</button>
      ${ui.mealRandom ? '<button type="button" class="btn ghost" data-act="m_random" style="flex:1">Nochmal würfeln</button>' : ''}
    </div>`);
}
const mealBtnText = () => `Zu „${curList()?.name || 'Liste'}“ hinzufügen (${ui.mealPick.size})`;
// Gedrückt halten auf einem Essen: Bearbeiten als eigene Seite
function openMealEdit(id) { ui.mealId = id; ui.confirmMeal = false; ui.mealTagInput = false; mealEditPage(); }
function mealEditPage() {
  const m = mealById(ui.mealId);
  if (!m) return;
  const tags = [...new Set([...allTags(), ...m.tags, ...DEFAULT_TAGS])];
  const ings = ingSorted(m).map((i) => `<li class="ming"><input class="mqty" data-ing="${i.id}" value="${esc(i.qty || '')}" placeholder="Menge" aria-label="Menge für ${esc(i.name)}" autocomplete="off" autocapitalize="off" enterkeyhint="done"><input class="mname" data-ingname="${i.id}" value="${esc(i.name)}" aria-label="Name der Zutat" autocomplete="off" enterkeyhint="done"><button type="button" class="chipbtn basicbtn${i.basic ? ' on' : ''}" data-act="m_basic" data-id="${i.id}" aria-pressed="${!!i.basic}">Basis</button><button type="button" class="chipbtn" data-act="m_deling" data-id="${i.id}" aria-label="${esc(i.name)} entfernen">×</button></li>`).join('');
  const mid = m.id;
  openPage('meal:' + mid, 'Essen bearbeiten', `
    <input id="mName" class="notein" value="${esc(m.name)}" aria-label="Name">
    <div class="label" style="margin:12px 0 4px">Tags</div>
    <div class="chips">${tags.map((t) => `<button type="button" class="chip${m.tags.includes(t) ? ' on' : ''}" data-act="m_edtag" data-tag="${esc(t)}" aria-pressed="${m.tags.includes(t)}">${esc(t)}</button>`).join('')}${ui.mealTagInput
      ? '<form id="mTagForm" class="tagadd" autocomplete="off"><input id="mTagNew" autofocus placeholder="Neuer Tag" aria-label="Neuer Tag" enterkeyhint="done"><button type="submit" class="chipbtn" aria-label="Tag hinzufügen">✓</button></form>'
      : '<button type="button" class="chip tagplus" data-act="m_tagplus" aria-label="Neuen Tag anlegen">+</button>'}</div>
    <div class="label" style="margin:12px 0 4px">Zutaten für <span class="mstep inl"><button type="button" class="stepbtn sm" data-act="m_base" data-d="-0.5" aria-label="Weniger"${(m.base || 2) <= 0.5 ? ' disabled' : ''}>${ICON_MINUS}</button><span class="mpers">${fmtPortions(m.base || 2)}</span><button type="button" class="stepbtn sm" data-act="m_base" data-d="0.5" aria-label="Mehr">${ICON_PLUS_S}</button></span></div>
    <p class="sheetnote" style="margin:0 0 6px">„Basis“ = hast du meist da, wird beim Hinzufügen nicht vorausgewählt.</p>
    ${m.ing.length ? `<ul class="scrollbox mings edit">${ings}</ul>` : ''}
    <form id="mIngForm" class="add" autocomplete="off" style="margin:8px 0 0"><input id="mIng" placeholder="Zutat, z. B. 200g Nudeln" aria-label="Zutat hinzufügen"><button type="submit" class="plus" aria-label="Hinzufügen">${ICON_PLUS}</button></form>
    <div id="mIngSugg" class="sugg inl" role="listbox" aria-label="Vorschläge" hidden></div>
    <details class="mmore"${m.photo || m.steps ? ' open' : ''}><summary>Foto und Kochanleitung (optional)</summary>
      ${m.photo ? `<img class="mphoto" src="${m.photo}" alt="">` : ''}
      <div class="bgrow"><label for="mPhoto" class="bgadd">${ICON_CAM}<span>${m.photo ? 'Foto ersetzen' : 'Foto hinzufügen'}</span></label><input type="file" id="mPhoto" accept="image/*" hidden>${m.photo ? '<button type="button" class="chipbtn" data-act="m_delphoto" aria-label="Foto entfernen">×</button>' : ''}</div>
      <textarea id="mSteps" class="notein" rows="5" placeholder="Kochanleitung" aria-label="Kochanleitung">${esc(m.steps || '')}</textarea>
    </details>
    <div class="actions" style="margin-top:16px">
      <button type="button" class="btn danger" data-act="m_del">${ui.confirmMeal ? 'Wirklich löschen?' : 'Essen löschen'}</button>
    </div>`, () => { if (mealById(mid)) { ui.mealId = mid; mealEditPage(); } });
}
function addIngredients(id, text) {
  const m = mealById(id);
  const parts = text.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  if (!m || !parts.length) return false;
  parts.forEach((p) => { const { qty, name } = parseEntry(p); if (m.ing.some((i) => dupKey(i.name) === dupKey(name))) return; rememberName(name); m.ing.push({ id: uid(), name, qty, basic: false }); });
  return true;
}
// Vorschläge beim Tippen einer Zutat (Menge davor bleibt erhalten: "200g Nu" -> "200g Nudeln")
function updateIngSugg() {
  const box = $('#mIngSugg'), input = $('#mIng'), m = mealById(ui.mealId);
  if (!box || !input || !m) return;
  const q = parseEntry(input.value.split(',').pop()).name;
  const have = new Set(m.ing.map((i) => dupKey(i.name)));
  const list = suggestions(q).filter((x) => !have.has(dupKey(x.name)));
  if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
  const qf = fold(q);
  box.innerHTML = list.map((x) => {
    const hit = fold(x.name).startsWith(qf) ? `<b>${esc(x.name.slice(0, qf.length))}</b>${esc(x.name.slice(qf.length))}` : esc(x.name);
    return `<button type="button" class="sg" role="option" data-act="m_ingsugg" data-name="${esc(x.name)}"><span class="sgn">${hit}</span><span class="sgtag">${esc(CAT_BY_ID[x.cat]?.name || 'Sonstiges')}</span></button>`;
  }).join('');
  box.hidden = false;
}
function addCustomTag(text) {
  const t = text.trim();
  ui.ovTagInput = false;
  if (t && !allTags().some((x) => x.toLowerCase() === t.toLowerCase())) { (S.customTags = S.customTags || []).push(t); save(); }
  render();
}
document.addEventListener('focusout', (e) => { if (e.target.id === 'mOvTagNew' && ui.ovTagInput) addCustomTag(e.target.value); });
// Zutat umbenennen: leeres Feld beim Verlassen auf den alten Namen zurücksetzen, Enter schließt die Tastatur
document.addEventListener('focusout', (e) => { const t = e.target; if (t.dataset?.ingname && !t.value.trim()) { const i = mealById(ui.mealId)?.ing.find((x) => x.id === t.dataset.ingname); if (i) t.value = i.name; } });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target.dataset?.ingname || e.target.dataset?.ing)) { e.preventDefault(); e.target.blur(); } });
function addTagsTo(m, text) {
  const t = text.split(',').map((x) => x.trim()).filter((x) => x && !m.tags.some((y) => y.toLowerCase() === x.toLowerCase()));
  if (!t.length) return false;
  m.tags.push(...new Set(t));
  return true;
}
// Zutaten eines Essens auf die aktive Liste setzen; liefert Anzahl und die neuen Einträge
function addMealItems(m, portions, pick) {
  const f = portions / (m.base || 2);
  const fresh = [];
  let dup = 0;
  m.ing.filter((i) => pick.has(i.id)).forEach((i, n) => {
    // Jedes Essen bekommt seinen eigenen Eintrag mit eigener Menge; nur dasselbe Essen nicht zweimal
    if (S.items.some((x) => !x.done && dupKey(x.name) === dupKey(i.name) && x.meals?.includes(m.name))) { dup++; return; }
    rememberName(i.name);
    const it = { id: uid(), name: i.name, qty: scaleQty(i.qty, f), note: '', meals: [m.name], cat: guessCat(i.name), done: false, ts: Date.now() + n };
    S.items.push(it); fresh.push(it);
  });
  return { added: fresh.length, dup, fresh };
}
const addedMsg = (r) => `${r.added} ${r.added === 1 ? 'Zutat' : 'Zutaten'} auf der Liste${r.dup ? `, ${r.dup} schon drauf` : ''}`;
function mealToList() {
  const m = mealById(ui.mealId);
  if (!m) return;
  const r = addMealItems(m, ui.mealPortions, ui.mealPick);
  closeSheet(); save();
  toast(addedMsg(r));
}
function randomMeal() {
  const pool = filteredMeals();
  if (!pool.length) { toast(meals().length ? 'Nichts passt zu dieser Auswahl' : 'Lege zuerst ein Essen an'); return; }
  const opts = pool.length > 1 ? pool.filter((m) => m.id !== ui.lastRandom) : pool;
  const m = opts[Math.floor(Math.random() * opts.length)];
  ui.lastRandom = m.id;
  startMeal(m.id, true);
}
function newMealSheet() {
  openSheet(`<div class="sheettitle">Neues Essen</div>
    <form id="newMealForm" autocomplete="off">
      <input id="newMealName" autofocus class="notein" placeholder="Name, z. B. Spaghetti Bolognese" aria-label="Name des Essens" required>
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
// Klicks auf Essen-Elemente (Capture: die allgemeine Klick-Behandlung soll das Sheet nicht schließen)
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-act^="m_"]');
  if (!el) return;
  e.stopImmediatePropagation();
  if (Date.now() - (ui.swipedT || 0) < 350) return; // Klick nach dem Wischen
  const act = el.dataset.act, id = el.dataset.id, m = mealById(ui.mealId);
  switch (act) {
    case 'm_ovtagplus': ui.ovTagInput = true; render(); break;
    case 'm_tag': { const t = el.dataset.tag;
      if (!tagUsed(t)) { S.customTags = (S.customTags || []).filter((x) => x !== t); ui.mealTags = ui.mealTags.filter((x) => x !== t); save(); render(); break; } // Tag ohne Essen: entfernen
 ui.mealTags = ui.mealTags.includes(t) ? ui.mealTags.filter((x) => x !== t) : [...ui.mealTags, t]; render(); break; }
    case 'm_new': newMealSheet(); break;
    case 'm_open': if (lpFired) { lpFired = false; break; } startMeal(id, false); break; // nicht nach langem Drücken
    case 'm_random': randomMeal(); break;
    case 'm_pick': ui.mealPick.has(id) ? ui.mealPick.delete(id) : ui.mealPick.add(id); { const b = $('#mAddBtn'); if (b) { b.textContent = mealBtnText(); b.disabled = !ui.mealPick.size; } } break;
    case 'm_pm': ui.mealPortions = Math.max(0.5, Math.min(50, ui.mealPortions + parseFloat(el.dataset.d))); mealSheet(); break;
    case 'm_tolist': mealToList(); break;
    case 'm_edit': ui.confirmMeal = false; ui.mealTagInput = false; mealEditPage(); break;
    case 'm_tagplus': ui.mealTagInput = true; mealEditPage(); break;
    case 'm_view': flushSheetInputs(); render(); startMeal(ui.mealId, false); break;
    case 'm_edtag': if (m) { const t = el.dataset.tag; m.tags = m.tags.includes(t) ? m.tags.filter((x) => x !== t) : [...m.tags, t]; save(); mealEditPage(); } break;
    case 'm_base': if (m) { m.base = Math.max(0.5, Math.min(50, (m.base || 2) + parseFloat(el.dataset.d))); save(); mealEditPage(); } break;
    case 'm_basic': { const i = m?.ing.find((x) => x.id === id); if (i) { i.basic = !i.basic; save(); mealEditPage(); } break; }
    case 'm_ingsugg': {
      const input = $('#mIng');
      if (!m || !input) break;
      const parts = input.value.split(',').map((x) => x.trim());
      const last = parseEntry(parts.pop());
      const txt = [...parts.filter(Boolean), `${last.qty ? last.qty + ' ' : ''}${el.dataset.name}`].join(',');
      if (addIngredients(m.id, txt)) { save(); mealEditPage(); $('#mIng')?.focus(); }
      break;
    }
    case 'm_deling': if (m) { m.ing = m.ing.filter((x) => x.id !== id); save(); mealEditPage(); } break;
    case 'm_delphoto': if (m) { m.photo = null; save(); mealEditPage(); } break;
    case 'm_del':
      if (!ui.confirmMeal) { ui.confirmMeal = true; mealEditPage(); break; }
      S.meals = meals().filter((x) => x !== m); ui.confirmMeal = false; popPages(1); commit(); break;
  }
}, true);
document.addEventListener('input', (e) => {
  const t = e.target, m = mealById(ui.mealId);
  if (t.id === 'mealQ') { ui.mealQ = t.value; const l = $('#mealList'); if (l) l.innerHTML = mealListHtml(); }
  else if (t.id === 'mIng') updateIngSugg();
  else if (t.dataset.ing && m) { const i = m.ing.find((x) => x.id === t.dataset.ing); if (i) { i.qty = t.value.trim(); save(); } }
  else if (t.dataset.ingname && m) { const i = m.ing.find((x) => x.id === t.dataset.ingname), v = t.value.trim(); if (i && v) { i.name = v; save(); } } // leer lassen = alter Name bleibt
  else if (t.id === 'mName' && m && t.value.trim()) { m.name = t.value.trim(); save(); }
  else if (t.id === 'mSteps' && m) { m.steps = t.value; save(); }
});
document.addEventListener('submit', (e) => {
  const f = e.target, m = mealById(ui.mealId);
  if (f.id === 'newMealForm') {
    e.preventDefault();
    const name = $('#newMealName').value.trim();
    if (!name) return;
    const nm = { id: uid(), name, tags: [...ui.mealTags], base: 2, ing: [], photo: null, steps: '' };
    meals().push(nm); ui.mealId = nm.id; ui.mealTagInput = false; save(); render(); mealEditPage();
  } else if (f.id === 'mOvTagForm') {
    e.preventDefault();
    addCustomTag($('#mOvTagNew').value);
  } else if (f.id === 'mIngForm') {
    e.preventDefault();
    if (m && addIngredients(m.id, $('#mIng').value)) { save(); mealEditPage(); $('#mIng')?.focus(); }
  } else if (f.id === 'mTagForm') {
    e.preventDefault();
    if (m) { addTagsTo(m, $('#mTagNew').value); ui.mealTagInput = false; save(); mealEditPage(); }
  }
}, true);
document.addEventListener('change', async (e) => {
  const t = e.target, m = mealById(ui.mealId);
  if (t.id === 'mPhoto' && t.files[0] && m) {
    try { m.photo = (await photoToDataUrl(t.files[0], 900)).url; save(); mealEditPage(); } catch (err) { /* Bild nicht lesbar */ }
  }
});

// ---------- Start ----------
(async function init() {
  S = (await loadState()) || seed();
  S.cats = S.cats || DEFAULT_CATS.map(cloneCat); // ältere Daten bekommen die Standard-Kategorien
  CATS = S.cats; indexCats();
  S.recent = S.recent || [];
  S.meals = S.meals || [];
  S.customTags = S.customTags || [];
  if (!S.lists || !S.lists.length) { S.lists = [{ id: uid(), name: 'Einkaufsliste', items: S.items || [] }]; S.listId = S.lists[0].id; }
  if (!curList()) S.listId = S.lists[0].id;
  S.items = curList().items || [];
  if (curList().storeId !== undefined && S.stores.some((x) => x.id === curList().storeId)) S.storeId = curList().storeId;
  // Die frühere "gelernte Zuordnung" ist jetzt Teil der Stichwörter
  if (S.learn) {
    const names = S.learnNames || {};
    Object.keys(S.learn).forEach((k) => { if (CAT_BY_ID[S.learn[k]]) learnKeyword(names[k] || k, S.learn[k]); });
    delete S.learn; delete S.learnNames;
  }
  S.stores.forEach((st) => st.zones.forEach((z) => { z.prods = z.prods || {}; }));
  if (!S.stores.find((s) => s.id === S.storeId)) S.storeId = S.stores[0]?.id || null;
  save();
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* z. B. in der Vorschau nicht möglich */ });
    // Neue Version übernommen: einmal neu laden, damit auch der neue Programmcode läuft.
    // Nicht mitten im Tippen oder bei offenem Sheet, dann erst beim nächsten Wechsel aus der App heraus.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return; // allererster Start: nichts Altes zu ersetzen
      const busy = () => dlg().open || pages.length || document.activeElement?.matches?.('input, textarea, select');
      if (!busy()) { location.reload(); return; }
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') location.reload(); });
    });
  } else if ('serviceWorker' in navigator && IS_LOCAL) {
    // Lokal (lokal-starten.cmd) ohne Service Worker, damit nach dem Neuladen immer die geänderten Dateien kommen
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }
})();

// ---------- Vorschläge mit der Tastatur (am PC) ----------
// Pfeil runter/hoch markiert einen Vorschlag, Enter übernimmt ihn, Esc blendet die Vorschläge aus.
const SUGG_BOX = { addName: '#sugg', mIng: '#mIngSugg', pinName: '#pinSugg' };
document.addEventListener('keydown', (e) => {
  const sel = SUGG_BOX[e.target.id];
  if (!sel || e.isComposing) return;
  const box = $(sel);
  const opts = box && !box.hidden ? [...box.querySelectorAll('.sg')] : [];
  if (!opts.length) return;
  const cur = opts.findIndex((o) => o.classList.contains('kb'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? (cur + 1) % opts.length : (cur <= 0 ? opts.length : cur) - 1;
    opts.forEach((o, i) => { o.classList.toggle('kb', i === next); o.setAttribute('aria-selected', String(i === next)); });
    opts[next].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && cur > -1) {
    e.preventDefault(); e.stopPropagation(); // nicht das Getippte, sondern den Vorschlag übernehmen
    opts[cur].click();
    e.target.focus();
  } else if (e.key === 'Escape') {
    box.hidden = true;
  }
}, true);

// ---------- Ziehen zum Aktualisieren ----------
// Ganz oben weiter nach unten ziehen: in der Liste = Abgleich mit dem Haushalt, in den Einstellungen = nach neuer Version suchen.
async function checkUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (!reg) { toast('Hier gibt es keine Updates (lokale Version)'); return; }
  try { await reg.update(); } catch (_) { toast('Keine Verbindung – später nochmal versuchen'); return; }
  if (reg.installing || reg.waiting) toast('Neue Version gefunden – wird geladen …'); // lädt danach von selbst neu (controllerchange)
  else toast(`Du hast die neueste Version (${appVersion})`);
}
async function syncNow() {
  if (typeof syncRun !== 'function' || !sync.sess) { toast('Nicht angemeldet – nichts abzugleichen'); return; }
  sync.dirty = true; sync.ver++;
  await syncRun();
  toast(sync.status === 'ok' ? 'Abgeglichen' : (sync.err || 'Abgleich später'));
}
(function pullToRefresh() {
  const PULL = 70; // so weit ziehen, bis es auslöst
  const ind = document.createElement('div');
  ind.id = 'pull'; ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v12M6.5 11.5L12 17l5.5-5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.body.append(ind);
  let y0 = null, d = 0, busy = false;
  const action = () => (dlg().open || pages.length ? null : ui.tab === 'settings' ? checkUpdate : ui.tab === 'list' ? syncNow : null);
  const hide = () => { ind.className = ''; ind.style.opacity = ''; ind.style.transform = ''; };
  document.addEventListener('touchstart', (e) => {
    y0 = null;
    if (busy || e.touches.length !== 1 || window.scrollY > 0 || !action() || e.target.closest?.('input, textarea, select, .plan')) return;
    y0 = e.touches[0].clientY; d = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    d = e.touches[0].clientY - y0;
    if (d <= 0 || window.scrollY > 0) { d = 0; hide(); return; }
    ind.className = d > PULL ? 'ready' : 'pulling';
    ind.style.opacity = String(Math.min(1, d / PULL));
    ind.style.transform = `translate(-50%, ${Math.min(d, PULL * 1.3) * 0.6}px) rotate(${d > PULL ? 180 : 0}deg)`;
  }, { passive: true });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    const fn = action();
    if (d <= PULL || !fn) { hide(); return; }
    busy = true; ind.className = 'spin'; ind.style.opacity = '1'; ind.style.transform = `translate(-50%, ${PULL * 0.6}px)`;
    try { navigator.vibrate?.(10); } catch (_) { /* egal */ }
    Promise.resolve().then(fn).catch(() => {}).finally(() => { busy = false; hide(); });
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', () => { y0 = null; hide(); });
})();

// ---------- Darstellung: Automatisch / Hell / Dunkel ----------
// Gilt nur für dieses Gerät (localStorage), wird nicht mit dem Haushalt abgeglichen. index.html setzt sie schon beim Laden.
const THEME_BG = { light: '#F2F4F3', dark: '#0D110F' }; // = --bg in style.css (Farbe der Statusleiste)
const THEME_LABEL = { auto: 'Automatisch (wie das Gerät)', light: 'Hell', dark: 'Dunkel' };
function themePref() { try { return localStorage.getItem('ek_theme') || 'auto'; } catch (_) { return 'auto'; } }
// Akzentfarben: Schlüssel → [Name, Farbe für die Auswahl]. Die eigentlichen Werte (hell/dunkel) stehen in style.css.
const ACCENTS = { gruen: ['Grün', '#0E7A55'], blau: ['Blau', '#1F6BCF'], lila: ['Lila', '#7A4FD0'], orange: ['Orange', '#C25A00'], pink: ['Pink', '#C2306B'] };
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function customAccentStored() { try { const c = JSON.parse(localStorage.getItem('ek_accent_c')); return c && c.l ? c : null; } catch (_) { return null; } }
function accentPref() {
  try { const a = localStorage.getItem('ek_accent'); return ACCENTS[a] || (a === 'custom' && customAccentStored()) ? a : 'gruen'; } catch (_) { return 'gruen'; }
}
const accentName = () => (accentPref() === 'custom' ? 'Eigene Farbe' : ACCENTS[accentPref()][0]);
// Eigene Farbe lesbar machen: im hellen Modus so weit abdunkeln, im dunklen so weit aufhellen, bis der Kontrast reicht (4,5 : 1)
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lumi = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrastOf = (a, b) => { const x = lumi(a), y = lumi(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mixRgb = (c, t, f) => c.map((v, i) => v + (t[i] - v) * f);
function customAccent(hex) {
  const c = hexRgb(hex), W = [255, 255, 255], DARK = [23, 28, 25]; // DARK = --surface im Dunkelmodus
  let l = c, d = c;
  for (let f = 0.05; contrastOf(l, W) < 4.5 && f <= 1; f += 0.05) l = mixRgb(c, [0, 0, 0], f);
  for (let f = 0.05; contrastOf(d, DARK) < 4.5 && f <= 1; f += 0.05) d = mixRgb(c, W, f);
  return { hex, l: rgbHex(l), d: rgbHex(d), od: contrastOf(d, [0, 0, 0]) >= contrastOf(d, W) ? '#0B0F0D' : '#FFFFFF' };
}
function applyTheme() {
  const p = themePref(), root = document.documentElement;
  if (p === 'auto') delete root.dataset.theme; else root.dataset.theme = p;
  const a = accentPref(), c = a === 'custom' ? customAccentStored() : null;
  if (a === 'gruen') delete root.dataset.accent; else root.dataset.accent = a;
  applyGlass(glassPref());
  ['l', 'd', 'od'].forEach((k) => { if (c) root.style.setProperty(`--cust-${k}`, c[k]); else root.style.removeProperty(`--cust-${k}`); });
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = THEME_BG[p === 'auto' ? (/dark/.test(m.media) ? 'dark' : 'light') : p]; });
}
function themePage() {
  const p = themePref();
  const opt = (v, label, sub) => `<button type="button" class="sheetbtn${p === v ? ' on' : ''}" data-act="settheme" data-id="${v}"><span>${label}${sub ? ` <small>${sub}</small>` : ''}</span></button>`;
  const a = accentPref(), cust = customAccentStored();
  const sw = Object.entries(ACCENTS).map(([k, [name, c]]) => `<button type="button" class="swatch" style="--c:${c}" data-act="setaccent" data-id="${k}" aria-pressed="${a === k}" aria-label="${name}">${a === k ? ICON_CHECK : ''}</button>`).join('')
    + `<label class="swatch custom${a === 'custom' ? ' on' : ''}" style="--c:${cust?.hex || '#888'}" aria-label="Eigene Farbe wählen">
        ${a === 'custom' ? `<span class="dot" style="background:${cust.hex}">${ICON_CHECK}</span>` : ''}
        <input type="color" id="accentPicker" value="${cust?.hex || '#0E7A55'}"></label>`;
  openPage('theme', 'Darstellung', `<div class="sheettitle">Hell oder dunkel</div>
    <div class="group">${opt('auto', 'Automatisch', 'wie das Gerät')}${opt('light', 'Hell')}${opt('dark', 'Dunkel')}</div>
    <div class="sheettitle" style="margin-top:12px">Akzentfarbe <small style="text-transform:none;letter-spacing:0;font-weight:600">· ${accentName()}</small></div>
    <div class="group swatches">${sw}</div>
    <div class="sheettitle" style="margin-top:12px">Glas</div>
    <div class="group glassrow"><span aria-hidden="true">Deckend</span><input type="range" id="glassRange" min="0" max="100" step="5" value="${glassPref()}" aria-label="Glas-Stärke"><span aria-hidden="true">Glas</span></div>
    `, themePage);
}
// Farbauswahl: beim Drehen sofort anwenden, beim Schließen die Seite neu zeichnen
function pickAccent(hex, done) {
  try { localStorage.setItem('ek_accent', 'custom'); localStorage.setItem('ek_accent_c', JSON.stringify(customAccent(hex))); } catch (_) { /* privat */ }
  applyTheme();
  if (done) themePage();
}
document.addEventListener('input', (e) => { if (e.target.id === 'accentPicker') pickAccent(e.target.value, false); });
document.addEventListener('change', (e) => { if (e.target.id === 'accentPicker') pickAccent(e.target.value, true); });
applyTheme();
// Glas-Stärke 0–100 %: 0 = fast deckend, 50 = Standard (frostig), 100 = fast durchsichtig (wenig Fläche, wenig Unschärfe)
function glassPref() { try { const g = parseInt(localStorage.getItem('ek_glass2'), 10); return g >= 0 && g <= 100 ? g : 50; } catch (_) { return 50; } }
function applyGlass(n) {
  const s = document.documentElement.style;
  // bis 50 gleichmäßig von „kaum“ zum Standard, darüber weiter bis ganz durchsichtig (t = 0…1)
  const lo = Math.min(n, 50) / 50, t = Math.max(0, n - 50) / 50;
  const step = (a, b, c) => (n <= 50 ? a + (b - a) * lo : b + (c - b) * t); // Wert bei 0 → 50 → 100
  s.setProperty('--bar-p', `${Math.round(step(90, 8, 3))}%`);        // Deckkraft der Leiste
  s.setProperty('--bar-blur', `${Math.round(step(20, 57, 25))}px`);  // Unschärfe: zum Ende hin wieder klarer
  s.setProperty('--sheet-p', `${Math.round(step(92, 10, 4))}%`);     // Deckkraft der Sheets
  s.setProperty('--sheet-blur', `${Math.round(step(24, 67, 29))}px`);
  s.setProperty('--field-p', `${Math.round(step(95, 32, 16))}%`);    // Eingabefelder, Knöpfe, Listen in Sheets
  s.setProperty('--dim', step(0.28, 0.065, 0.026).toFixed(3));       // Abdunkelung hinter dem Sheet
  s.setProperty('--sheen-p', `${Math.round(Math.min(1, n / 50) * 100)}%`); // Lichtreflex: bei 0 aus, ab 50 voll
}
document.addEventListener('input', (e) => {
  if (e.target.id !== 'glassRange') return;
  const g = +e.target.value;
  try { localStorage.setItem('ek_glass2', String(g)); } catch (_) { /* privat */ }
  applyGlass(g);
});
// Plus/Minus für die runden Knöpfe (Personen): gezeichnet statt Schriftzeichen, damit sie genau mittig sitzen
const ICON_MINUS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ICON_PLUS_S = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
