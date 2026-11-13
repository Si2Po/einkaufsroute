'use strict';
// Listen-Typen: einfache Liste (Abschnitte, eigene Reihenfolge), Halten und Ziehen in beiden Listenarten.

// ---------- Listen-Typen: Einkaufsliste (Standard) und einfache Liste ----------
// Einfache Liste (l.type = 'simple'): kein Geschäft, keine Kategorien, eigene Reihenfolge (it.ord) und Abschnitte
// (l.secs = [{ id, name }], Eintrag merkt sich it.sec). l.keepDone: Abgehakte bleiben an ihrem Platz stehen.
const isSimple = (l = curList()) => l?.type === 'simple';
const validSec = (id) => !!id && (curList()?.secs || []).some((s) => s.id === id);
const secName = (id) => (curList()?.secs || []).find((s) => s.id === id)?.name || '';
const addPlaceholder = () => (!isSimple() ? 'Was brauchst du?' : validSec(ui.addSec) ? `Zu „${secName(ui.addSec)}“ hinzufügen` : 'Neuer Eintrag');
function typeSelect(id, cur, attrs = '') {
  return `<label class="srow"><span class="pl">Art</span><select id="${id}" aria-label="Art der Liste"${attrs}><option value="">Einkaufsliste</option><option value="simple"${cur === 'simple' ? ' selected' : ''}>Einfache Liste</option></select></label>`;
}
function secField(it) {
  const secs = curList()?.secs || [];
  return `<label class="srow"><span class="pl">Abschnitt</span><select id="eSec" aria-label="Abschnitt"><option value="">–</option>${secs.map((s) => `<option value="${s.id}"${s.id === it.sec ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`;
}
function simpleBody() {
  const l = curList(), secs = l.secs || [], keep = !!l.keepDone;
  const known = new Set(secs.map((s) => s.id));
  const shown = S.items.filter((i) => keep || !i.done).sort((a, b) => (a.ord ?? a.ts) - (b.ord ?? b.ts));
  const of = (sid) => shown.filter((i) => (known.has(i.sec) ? i.sec : '') === sid);
  const done = S.items.filter((i) => i.done);
  const wig = ui.wiggle === 'items';
  // Immer eine einzige Reihe (Einträge + Abschnitts-Köpfe), damit beim Ziehen nichts umgebaut werden muss und Einträge
  // in andere Abschnitte wandern können. Die Optik (Karten je Abschnitt) kommt aus dem CSS (.srows).
  const head = (s) => {
    const on = ui.addSec === s.id, n = of(s.id).filter((i) => !i.done).length;
    return `<li class="grp secli secbtn${on ? ' on' : ''}" role="button" tabindex="0" data-act="secpick" data-sec="${s.id}" data-key="§${s.id}" aria-pressed="${on}"><span class="gname">${esc(s.name)}</span><span class="cnt">${n}</span></li>`;
  };
  const rows = of('').map(rowHtml).join('') + secs.map((s) => { const its = of(s.id); return head(s) + (its.length ? its.map(rowHtml).join('') : '<li class="secempty">Noch leer</li>'); }).join('');
  const body = rows ? `<ul class="srows${wig ? ' wiggle' : ''}" id="listRows">${rows}</ul>` : `<p class="empty">${S.items.length ? 'Alles erledigt.' : 'Die Liste ist leer.'}</p>`;
  if (wig) return body + wiggleBar(true); // „Fertig“ schwebt über der Tab-Leiste: oben verrutscht nichts, immer mit dem Daumen erreichbar
  let doneHtml = '';
  if (done.length && keep) doneHtml = `<div class="donehead"><button type="button" class="link" data-act="resetdone">Alle Haken entfernen</button><button type="button" class="link clearbtn" data-act="cleardone">Abgehakte löschen</button></div>`;
  else if (done.length) doneHtml = `<div class="donehead"><button type="button" class="link donetoggle" data-act="showdone" aria-expanded="${ui.showDone}">Erledigt (${done.length}) ${ui.showDone ? '▴' : '▾'}</button>${ui.showDone ? '<button type="button" class="link clearbtn" data-act="cleardone">Erledigte entfernen</button>' : ''}</div>
       ${ui.showDone ? `<ul class="rows">${done.map(rowHtml).join('')}</ul>` : ''}`;
  const tip = S.items.length && !S.tipSeen ? '<p class="tip">Tippen: abhaken · Gedrückt halten: bearbeiten · Halten und ziehen: sortieren</p>' : '';
  return body + doneHtml + `<button type="button" class="link addsec" data-act="newsec">+ Abschnitt</button>` + tip;
}
// Einfache Liste, Eintrag gedrückt halten: der Eintrag hebt sich leicht an.
//   loslassen ohne Bewegung = bearbeiten, Finger bewegen = Eintrag ziehen (danach bleibt der Wackelmodus an).
// Es wird nichts neu aufgebaut, der Eintrag bleibt genau unter dem Finger. Solange er angehoben ist, scrollt die Seite nicht.
let dragArmed = false;
function holdDrag(e, row) {
  const list = row.closest('#listRows'), id = row.dataset.id;
  if (!list) { openEdit(id); return; }
  const w = WIGGLE.items, x0 = e.clientX, y0 = e.clientY, pid = e.pointerId;
  sw = null; // kein Wischen auf dieser Zeile
  dragArmed = true;
  row.classList.add('lifted');
  // Schon beim Anheben zeigen, dass Ziehen sortiert (schwebende Leiste über der Tab-Leiste)
  if (!list.nextElementSibling?.classList.contains('floatbar')) list.insertAdjacentHTML('afterend', wiggleBar(true));
  const hint = list.nextElementSibling, dropHint = () => { if (!ui.wiggle) hint?.remove(); };
  const before = [...list.children].filter((c) => c.matches(w.slots)).map((c) => c.dataset.key).join();
  const off = () => { dragArmed = false; document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', cancel, true); };
  const mv = (ev) => {
    if (ev.pointerId !== pid || Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
    off();
    row.classList.remove('lifted');
    ui.wiggle = 'items'; list.classList.add('wiggle');
    sortDrag(ev, row, row, list, w.slots, w.scroller(list), (order) => {
      if (order && order.join() !== before) w.done(order); else render(); // zeigt den Wackelmodus mit „Fertig“
    });
  };
  const up = (ev) => { if (ev.pointerId !== pid) return; off(); row.classList.remove('lifted'); dropHint(); openEdit(id); };
  const cancel = (ev) => { if (ev.pointerId !== pid) return; off(); row.classList.remove('lifted'); dropHint(); };
  document.addEventListener('pointermove', mv, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', cancel, true);
}
// Einkaufsliste: Eintrag wurde gezogen. Reihenfolge merken (it.ord, bis der Eintrag weg ist). Landet er in einer anderen
// Gruppe, lernt die App das: mit Geschäft = fester Bereich in diesem Geschäft, sonst / ohne Bereich = andere Kategorie.
function shopDrop(order) {
  const st = curStore(), from = {}, to = {};
  buildGroups(st).forEach((g) => g.items.forEach((i) => { from[i.id] = g.key; }));
  let gk = '', n = 0;
  const pos = {};
  for (const k of order) { if (k.startsWith('§')) gk = k.slice(1); else { to[k] = gk; pos[k] = n++; } }
  const it = S.items.find((i) => to[i.id] && to[i.id] !== from[i.id]);
  // Vorher-Stand für „Rückgängig“
  const snap = { items: S.items.map((i) => ({ id: i.id, cat: i.cat, ord: i.ord })), kw: CATS.map((c) => [c.id, [...c.kw]]), prods: st ? st.zones.map((z) => (z.prods ? { ...z.prods } : null)) : null };
  S.items.forEach((i) => { if (pos[i.id] !== undefined) i.ord = pos[i.id]; });
  let msg = '';
  if (it) {
    const key = normKey(it.name), target = to[it.id];
    if (st) st.zones.forEach((z) => { if (z.prods) delete z.prods[key]; }); // alter fester Bereich gilt nicht mehr
    if (target[0] === 'z') { // Bereich in diesem Geschäft
      const zi = +target.slice(1), z = st.zones[zi];
      if (defaultZoneIdx(st, it.cat) !== zi) { z.prods = z.prods || {}; z.prods[key] = it.name; }
      msg = `„${it.name}“ → ${z.name} (merkt sich ${st.name})`;
    } else { // Kategorie: „c<Index>“ ohne Geschäft, „n<Kategorie>“ = Kategorie ohne Bereich in diesem Geschäft
      const cat = target[0] === 'c' ? CATS[+target.slice(1)]?.id : target.slice(1);
      if (cat && CAT_BY_ID[cat]) {
        learnKeyword(it.name, cat);
        S.items.forEach((o) => { if (!o.done && normKey(o.name) === key) o.cat = cat; });
        msg = `„${it.name}“ → ${CAT_BY_ID[cat].name}`;
      }
    }
  }
  commit();
  if (msg) {
    toast(msg, () => {
      snap.items.forEach((s) => { const i = S.items.find((x) => x.id === s.id); if (i) { i.cat = s.cat; if (s.ord === undefined) delete i.ord; else i.ord = s.ord; } });
      snap.kw.forEach(([id, kw]) => { if (CAT_BY_ID[id]) CAT_BY_ID[id].kw = kw; });
      if (st && snap.prods) st.zones.forEach((z, i) => { if (snap.prods[i]) z.prods = snap.prods[i]; else delete z.prods; });
      commit();
    });
  }
}
function newSecSheet() {
  openSheet(`<div class="sheettitle">Neuer Abschnitt</div>
    <form id="newSecForm" autocomplete="off">
      <input id="newSecName" autofocus class="notein" placeholder="Name, z. B. Kino, Streaming oder Kleidung" aria-label="Name des Abschnitts" required>
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
function sectionSheet(id) {
  const secs = curList()?.secs || [], i = secs.findIndex((s) => s.id === id);
  if (i < 0) return;
  if (ui.confirmSec && ui.confirmSec !== id) ui.confirmSec = null;
  openSheet(`<div class="sheettitle">Abschnitt</div>
    <input id="secNameIn" data-id="${id}" class="notein" style="margin-bottom:8px" value="${esc(secs[i].name)}" aria-label="Name des Abschnitts" autocomplete="off" enterkeyhint="done">
    ${i > 0 ? `<button type="button" class="sheetbtn" data-act="secup" data-id="${id}">Nach oben</button>` : ''}
    ${i < secs.length - 1 ? `<button type="button" class="sheetbtn" data-act="secdown" data-id="${id}">Nach unten</button>` : ''}
    <button type="button" class="sheetbtn" data-act="sortitems">Einträge sortieren</button>
    <button type="button" class="sheetbtn danger" data-act="secdel" data-id="${id}">${ui.confirmSec === id ? 'Wirklich löschen? (Einträge bleiben)' : 'Abschnitt löschen'}</button>`);
}
function moveSec(id, d) {
  const secs = curList()?.secs || [], i = secs.findIndex((s) => s.id === id), j = i + d;
  if (i < 0 || j < 0 || j >= secs.length) return;
  [secs[i], secs[j]] = [secs[j], secs[i]];
  commit();
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'newSecForm') return;
  e.preventDefault();
  const name = $('#newSecName').value.trim(), l = curList();
  if (!name || !l) return;
  const s = { id: uid(), name };
  l.secs = [...(l.secs || []), s];
  ui.addSec = s.id; // Neues kommt gleich in den neuen Abschnitt
  closeSheet(); commit();
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'secNameIn') return;
  const s = (curList()?.secs || []).find((x) => x.id === e.target.dataset.id), n = e.target.value.trim();
  if (s && n && s.name !== n) { s.name = n; save(); render(); }
});
document.addEventListener('change', (e) => {
  const t = e.target, l = S.lists.find((x) => x.id === t.dataset.id);
  if (!l) return;
  if (t.id === 'leType') {
    if (t.value === 'simple') l.type = 'simple'; else delete l.type; // Abschnitte und Reihenfolge bleiben gemerkt, falls man zurückwechselt
    if (l.id === S.listId) { ui.addSec = null; ui.wiggle = ui.wiggle === 'items' ? null : ui.wiggle; }
    commit(); listEditPage(l.id);
  } else if (t.id === 'leDone') {
    if (t.value === 'keep') l.keepDone = true; else delete l.keepDone;
    if (l.id === S.listId) finishAll();
    commit();
  }
});

