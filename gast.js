'use strict';
/* Gast-Ansicht (gast.html#SCHLÜSSEL): eine per Link geteilte Liste, ohne Konto.
   Benutzt aus js/grund.js nur Hilfsfunktionen (Text zerlegen, Kategorie erraten, esc) und fasst die gespeicherten
   Daten der App auf diesem Gerät nicht an. Alles läuft über die Funktionen in supabase/schritte/gast.sql.
   Einkaufsliste: nach den Kategorien der Gruppe sortiert. Einfache Liste: Abschnitte und eigene Reihenfolge. */

const G = { t: decodeURIComponent(location.hash.slice(1)).trim(), list: null, gone: false, offline: false, showDone: false, pending: new Map(), marked: new Set() }; // marked: angetippt, noch nicht gespeichert

async function rpc(fn, args) {
  const res = await fetch(`${EK.url}/rest/v1/rpc/${fn}`, {
    method: 'POST', keepalive: true, headers: { apikey: EK.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ t: G.t, ...args })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function load() {
  if (!G.t) { G.gone = true; draw(); return; }
  try {
    const d = await rpc('guest_get', {});
    G.offline = false;
    if (!d) { G.gone = true; G.list = null; draw(); return; }
    G.list = d;
    CATS = d.cats && d.cats.length ? d.cats.map(cloneCat) : DEFAULT_CATS.map(cloneCat); // Kategorien der Gruppe zum Sortieren und Einordnen
    indexCats();
    for (const [id, done] of G.pending) { const it = d.items.find((i) => i.id === id); if (it) it.done = done; } // eigene Klicks, die noch unterwegs sind
  } catch (_) { G.offline = true; }
  draw();
}

const rowHtml = (i) => { const on = i.done || G.marked.has(i.id); return `<li class="row${on ? ' done' : ''}" role="checkbox" aria-checked="${on}" tabindex="0" data-id="${esc(i.id)}">
    <span class="chk" aria-hidden="true"></span>
    <span class="txt"><span class="nm">${esc(i.name)}</span>${i.note ? `<span class="nt">${esc(i.note)}</span>` : ''}</span>
    ${i.qty ? `<span class="qty">${esc(i.qty)}</span>` : ''}
  </li>`; };
const head = (name, n) => `<li class="grp secli"><span class="gname">${esc(name)}</span><span class="cnt">${n}</span></li>`;

function body() {
  const l = G.list, simple = l.type === 'simple', keep = simple && l.keepDone;
  const items = [...l.items].sort(byOrder);
  const shown = items.filter((i) => keep || !i.done), done = items.filter((i) => i.done);
  let rows = '';
  if (simple) {
    const secs = Array.isArray(l.secs) ? l.secs : [], known = new Set(secs.map((s) => s.id));
    const of = (sid) => shown.filter((i) => (known.has(i.sec) ? i.sec : '') === sid);
    rows = of('').map(rowHtml).join('') + secs.map((s) => { const its = of(s.id); return its.length ? head(s.name, its.filter((i) => !i.done).length) + its.map(rowHtml).join('') : ''; }).join('');
  } else {
    const groups = new Map();
    for (const i of shown) { const c = CAT_BY_ID[i.cat] ? i.cat : 'sonst'; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(i); }
    rows = [...groups.entries()].sort((a, b) => (CAT_INDEX[a[0]] ?? 999) - (CAT_INDEX[b[0]] ?? 999))
      .map(([c, its]) => head(CAT_BY_ID[c]?.name || 'Sonstiges', its.length) + its.map(rowHtml).join('')).join('');
  }
  const list = rows ? `<ul class="srows">${rows}</ul>` : `<p class="empty">${l.items.length ? 'Alles erledigt.' : 'Die Liste ist leer.'}</p>`;
  const doneHtml = keep || !done.length ? '' : `<div class="donehead"><button type="button" class="link donetoggle" data-act="showdone" aria-expanded="${G.showDone}">Erledigt (${done.length}) ${G.showDone ? '▴' : '▾'}</button></div>
    ${G.showDone ? `<ul class="rows">${done.map(rowHtml).join('')}</ul>` : ''}`;
  return list + doneHtml;
}

function draw() {
  const v = document.getElementById('view');
  if (G.gone) {
    document.title = 'Geteilte Liste';
    v.innerHTML = '<div class="ghead"><h1>Geteilte Liste</h1></div><p class="empty">Dieser Link gilt nicht mehr. Frag nach einem neuen.</p>';
    return;
  }
  if (!G.list) { v.innerHTML = `<p class="empty">${G.offline ? 'Keine Verbindung. Bitte später nochmal versuchen.' : 'Liste wird geladen …'}</p>`; return; }
  document.title = G.list.name || 'Geteilte Liste';
  // Kopf und Eingabefeld nur einmal bauen: beim Nachladen bleibt so die Tastatur offen und Getipptes stehen
  if (!document.getElementById('gList')) {
    v.innerHTML = `<div class="ghead"><h1 id="gTitle"></h1><p id="gSub"></p></div>
      <div class="addwrap"><form id="gAdd" class="add" autocomplete="off">
        <input id="gName" aria-label="Neuer Eintrag" enterkeyhint="done">
        <button type="submit" class="plus" aria-label="Hinzufügen"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>
      </form></div>
      <p class="ghint">Mehreres auf einmal mit Komma oder „und“ trennen. Eine Zahl am Anfang wird zur Menge, z. B. „500g Pasta, 2 Gurken und Milch“.</p>
      <div id="gList"></div>
      <p class="gfoot">Geteilt mit der App <a href="./">Einkaufsroute</a> · <a href="ueber.html">Über diese App</a></p>`;
  }
  document.getElementById('gTitle').textContent = G.list.name || 'Liste';
  document.getElementById('gSub').innerHTML = `Geteilte Liste${G.offline ? ' · <b>keine Verbindung</b>' : ''}`;
  document.getElementById('gName').placeholder = G.list.type === 'simple' ? 'Neuer Eintrag' : 'Was fehlt noch?';
  document.getElementById('gList').innerHTML = body();
}

// Abhaken wie in der App: Der Haken erscheint sofort, die Einträge wandern aber erst nach „Erledigt“ (und werden erst dann
// gespeichert), wenn CHECK_DELAY lang nichts mehr angetippt wurde. Nochmal tippen nimmt den Haken zurück.
// Einfache Liste mit „bleibt stehen“ und Haken entfernen: sofort.
const CHECK_DELAY = 2500;
let markT;
const findItem = (id) => G.list?.items.find((i) => i.id === id);
function toggle(id) {
  const it = findItem(id);
  if (!it) return;
  if (it.done || (G.list.type === 'simple' && G.list.keepDone)) { setDone([id], !it.done); return; }
  if (G.marked.has(id)) G.marked.delete(id); else G.marked.add(id);
  clearTimeout(markT);
  if (G.marked.size) markT = setTimeout(flushMarked, CHECK_DELAY);
  draw();
}
function flushMarked() {
  clearTimeout(markT);
  if (!G.marked.size) return;
  const ids = [...G.marked];
  G.marked.clear();
  setDone(ids, true);
}
async function setDone(ids, done) {
  ids.forEach((id) => { const it = findItem(id); if (it) { it.done = done; G.pending.set(id, done); } });
  draw();
  await Promise.all(ids.map((id) => rpc('guest_check', { iid: id, done }).catch(() => { G.offline = true; })));
  ids.forEach((id) => G.pending.delete(id));
  load();
}

async function add(text) {
  const have = new Set(G.list.items.filter((i) => !i.done).map((i) => dupKey(i.name)));
  const items = splitSpoken(text).map(parseEntry).filter((p) => p.name && !have.has(dupKey(p.name)))
    .map((p) => ({ id: uid() + uid(), name: p.name, qty: p.qty, cat: G.list.type === 'simple' ? '' : keywordGuess(p.name) }));
  if (!items.length) return;
  G.list.items.push(...items.map((i, n) => ({ ...i, done: false, ts: Date.now() + n }))); draw(); // sofort zeigen
  try { await rpc('guest_add', { items }); } catch (_) { G.offline = true; }
  load();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="showdone"]')) { G.showDone = !G.showDone; draw(); return; }
  const row = e.target.closest('.row[data-id]');
  if (row) toggle(row.dataset.id);
});
document.addEventListener('keydown', (e) => {
  const row = e.target.closest?.('.row[data-id]');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(row.dataset.id); }
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'gAdd') return;
  e.preventDefault();
  const inp = document.getElementById('gName'), text = inp.value;
  inp.value = '';
  add(text);
});
// Änderungen der anderen: alle 10 Sekunden nachsehen, solange die Seite offen ist
setInterval(() => { if (document.visibilityState === 'visible') load(); }, 10000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); else flushMarked(); });
window.addEventListener('pagehide', flushMarked); // Seite verlassen: Angetipptes gleich speichern
window.addEventListener('hashchange', () => { G.t = decodeURIComponent(location.hash.slice(1)).trim(); G.gone = false; G.list = null; load(); });
load();
