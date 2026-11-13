'use strict';
// Grundlagen: Datenmodell, Kategorien und Stichwörter, Vorschläge, Speichern, Startdaten, Zustand. Wird als Erstes geladen.
/* Einkaufsroute – Prototyp (Liste, Läden, Zonen-Editor, automatische Sortierung)
   Alles läuft im Browser. Daten liegen in IndexedDB auf dem Gerät.

   Datenmodell:
   S = { storeId, stores: [Store], cats: [{ id, name, kw: [Stichwörter] }], items: [Item], recent: ["Anzeigename", …] (zuletzt neu getippte Wörter für die Autovervollständigung) }
   Store = { id, name, bg (Foto als Data-URL oder null), h (Plan-Höhe bei Breite 1000), zones: [Zone], main: { kategorieId: zoneId } (Standard-Bereich, wenn eine Kategorie in mehreren Bereichen liegt) }
   Zone  = { id, name, cats: [Kategorie-IDs], prods: { produktname: Anzeigename }, rect: {x,y,w,h} oder null }
   Regel: ein festgelegtes Produkt (prods) gewinnt vor der Kategorie. Eine Kategorie darf in mehreren Zonen stehen;
   dann zählt die erste Zone in der Laufreihenfolge, solange kein Produkt festgelegt ist.   <- Reihenfolge im Array = Laufweg
   Item  = { id, name, qty, note, photo (Data-URL oder fehlt), cat, done, ts, sec?, ord? }
   List  = { id, name, items, storeId, g (Gruppe), type? ('simple' = einfache Liste), secs? [{ id, name }], keepDone? }
           Einfache Liste: ohne Geschäft/Kategorien, Reihenfolge nach it.ord (sonst ts), Abschnitt it.sec (siehe „Listen-Typen“ unten)
*/

// ---------- Kategorien und Stichwörter ----------
// Die Reihenfolge hier ist die Standardreihenfolge, wenn kein Laden gewählt ist.
const DEFAULT_CATS = [
  // Obst & Gemüse in der Form, in der man es meist kauft (Mehrzahl), damit die Vorschläge beim Tippen passen.
  // Die Einzahl wird trotzdem erkannt (siehe kwStem). „äpfel“ steht vor „apfel“, damit „Äpfel“ vorgeschlagen wird.
  { id: 'obst', name: 'Obst & Gemüse', kw: ['äpfel', 'apfel', 'bananen', 'birnen', 'tomaten', 'gurke', 'paprika', 'zwiebeln', 'knoblauch', 'salat', 'eisberg', 'karotten', 'möhren', 'kartoffeln', 'zitronen', 'orangen', 'mandarinen', 'beere', 'erdbeer', 'himbeer', 'erdbeeren', 'himbeeren', 'heidelbeeren', 'trauben', 'brokkoli', 'blumenkohl', 'zucchini', 'spinat', 'pilze', 'champignons', 'avocados', 'lauch', 'kohl', 'ingwer', 'petersilie', 'schnittlauch', 'gemüse', 'obst', 'mango', 'ananas', 'melone', 'pfirsiche', 'radieschen', 'sellerie', 'aubergine', 'rucola', 'kürbis', 'süßkartoffeln', 'frühlingszwiebeln', 'limetten'] },
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

// Wortstamm eines Stichworts für die Erkennung: Mehrzahl-Endungen fallen weg, damit „tomaten“ auch „Tomate“ erkennt,
// „zwiebeln“ auch „Zwiebel“, „pilze“ auch „Pilz“. Kurze Wörter (bis 4 Buchstaben) bleiben, wie sie sind.
const kwStem = (k) => (k.length >= 5 ? k.replace(/(en|n|e|s)$/, '') : k);
// Der längste passende Treffer am Wortanfang gewinnt ("paprikapulver" schlägt "paprika").
function keywordGuess(name) {
  const n = ' ' + name.toLowerCase();
  let best = null, bestLen = 0;
  for (const c of CATS) {
    for (const k of c.kw) {
      const s = kwStem(k);
      if (s.length > bestLen && new RegExp('[\\s\\-/,]' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(n)) {
        best = c.id; bestLen = s.length;
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
const ui = { tab: 'list', wiggle: null, editStoreId: null, selZone: null, drawing: false, showDone: false, confirmDel: false, justDrew: 0, sheetT: 0, pending: new Map(), confirmCat: false, confirmList: false };
const curList = () => (S.lists || []).find((l) => l.id === S.listId) || null;
const curStore = () => S.stores.find((s) => s.id === S.storeId) || null;
const editStore = () => S.stores.find((s) => s.id === ui.editStoreId) || null;
const commit = () => { save(); render(); };

