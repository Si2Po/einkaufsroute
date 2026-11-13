'use strict';
// Ansichten: Sortierung nach Laufweg, Liste, render(), untere Leiste, Einstellungen.

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
  list.forEach((g) => g.items.sort(byOrder));
  return list;
}

// ---------- Ansichten ----------
const ICON_DOTS = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>';
const ICON_GRAB = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

const MEAL_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 3v8M4.5 3v5.2a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.4 1.2-3.5 4-3.5 7.5 0 1.7.9 2.5 2 2.5h1.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
function rowHtml(i) {
  const pend = ui.pending.has(i.id), on = i.done || pend;
  return `<li class="row${on ? ' done' : ''}${pend ? ' pending' : ''}" role="checkbox" aria-checked="${on}" tabindex="0" data-act="toggle" data-id="${i.id}" data-key="${i.id}">
    <span class="chk" aria-hidden="true"></span>
    <span class="txt"><span class="nm">${esc(i.name)}</span>${i.note ? `<span class="nt">${esc(i.note)}</span>` : ''}${i.meals?.length ? `<span class="nt ml">${MEAL_ICON}${esc(i.meals.join(', '))}</span>` : ''}</span>
    ${i.photo ? `<img class="thumb" src="${i.photo}" alt="">` : ''}
    ${i.qty ? `<span class="qty">${esc(i.qty)}</span>` : ''}
  </li>`;
}

function listBody() {
  if (isSimple()) return simpleBody();
  const groups = buildGroups(listStore());
  const done = S.items.filter((i) => i.done);
  // Eine einzige Reihe (Köpfe + Einträge, Optik wie Karten je Gruppe), damit Einträge per Halten und Ziehen
  // umsortiert und in eine andere Kategorie / einen anderen Bereich gezogen werden können (WIGGLE.items).
  const body = groups.length
    ? `<ul class="srows${ui.wiggle === 'items' ? ' wiggle' : ''}" id="listRows">${groups.map((g) => (g.free
        ? `<li class="grp secli grpbtn" role="button" tabindex="0" data-act="assigncat" data-cat="${g.free}" data-key="§${g.key}"><span class="gname">${esc(g.label)}</span><span class="nozone">Bereich wählen ›</span><span class="cnt">${g.items.length}</span></li>`
        : `<li class="grp secli" data-key="§${g.key}"><span class="gname">${esc(g.label)}</span><span class="cnt">${g.items.length}</span></li>`)
        + g.items.map(rowHtml).join('')).join('')}</ul>${ui.wiggle === 'items' ? wiggleBar(true) : ''}`
    : `<p class="empty">${S.items.length ? 'Alles erledigt.' : 'Die Liste ist leer.'}</p>`;
  if (ui.wiggle === 'items' && groups.length) return body;
  return dueBar() + body + doneBlock(done) + listTip('verschieben'); // dueBar: „Vielleicht fällig“ (historie.js)
}
// „Erledigt (n)“ zum Aufklappen, darunter die abgehakten Einträge (Einkaufsliste und einfache Liste)
function doneBlock(done) {
  if (!done.length) return '';
  return `<div class="donehead"><button type="button" class="link donetoggle" data-act="showdone" aria-expanded="${ui.showDone}">Erledigt (${done.length}) ${ui.showDone ? '▴' : '▾'}</button>${ui.showDone ? '<button type="button" class="link clearbtn" data-act="cleardone">Erledigte entfernen</button>' : ''}</div>
       ${ui.showDone ? `<ul class="rows">${done.map(rowHtml).join('')}</ul>` : ''}`;
}
// Bedienhinweis unter der Liste, bis zum ersten Bearbeiten (S.tipSeen)
const listTip = (dragWord) => (S.items.length && !S.tipSeen ? `<p class="tip bedien">Tippen: abhaken · Gedrückt halten: bearbeiten · Halten und ziehen: ${dragWord}</p>` : '');
const pillName = () => curStore()?.name || 'Kein Geschäft';

const barHtml = () => `
      <button type="button" class="pill" data-act="storesheet" aria-haspopup="dialog" aria-label="Geschäft wählen"><span id="pillName">${esc(pillName())}</span></button>`;
function viewList() {
  return `<div class="bar"${isSimple() || !storesOn() ? ' hidden' : ''}>${barHtml()}    </div>
    <div class="addwrap">
      <form id="addForm" class="add" autocomplete="off">
        <input id="addName" placeholder="${esc(addPlaceholder())}" aria-label="Neuer Eintrag" enterkeyhint="done">
        <button type="submit" class="plus" aria-label="Hinzufügen">${ICON_PLUS}</button>
      </form>
      <div id="sugg" class="sugg" role="listbox" aria-label="Vorschläge" hidden></div>
    </div>
    <div id="listBody">${listBody()}</div>`;
}

function render() {
  const v = $('#view');
  if (ui.tab === 'list') {
    if ($('#addForm')) { $('#listBody').innerHTML = listBody(); const b = $('.bar'); b.innerHTML = barHtml(); b.hidden = isSimple() || !storesOn(); $('#addName').placeholder = addPlaceholder(); }
    else v.innerHTML = viewList();
  } else if (ui.tab === 'meals') {
    v.innerHTML = viewMeals();
  } else if (ui.tab === 'settings') {
    v.innerHTML = viewSettings();
  } else {
    v.innerHTML = ui.editStoreId ? viewEditor() : viewStores();
    if (ui.editStoreId) { if (S.showPlan) bindPlan(); else planAbort?.abort(); }
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
      ${row('accountsheet', 'Konto und Gruppen', typeof accountSub === 'function' ? accountSub() : 'Nicht angemeldet')}
      ${row('listspage', 'Listen', esc(S.lists.map((l) => l.name).join(', ')))}
      ${row('tab', 'Geschäfte und Grundrisse', storesOn() ? `${S.stores.length} ${S.stores.length === 1 ? 'Geschäft' : 'Geschäfte'}` : 'Aus – Liste nur nach Kategorien', ' data-tab="stores"')}
      ${row('swipesheet', 'Wischen', 'Aktionen für Einträge und Essen')}
      ${row('themepage', 'Darstellung', `${THEME_LABEL[themePref()]} · ${accentName()}`)}
      ${row('catlist', 'Kategorien und Stichwörter', `${CATS.length} Kategorien`)}
      ${row('helppage', 'Hilfe', 'So funktioniert die App · Hinweise')}
    </ul>
    ${appVersion ? `<p class="tip" data-act="vertap">Version ${esc(appVersion)}</p>` : ''}`;
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

