'use strict';
// Listen und Einträge: Listen wählen, anlegen, bearbeiten, wechseln; Eintrag-Sheet mit Foto.

function listSheet() {
  openSheet(`<div class="sheettitle">${T('Listen')}</div>
    <div class="scrollbox">${S.lists.map((l) => {
      return `<button type="button" class="sheetbtn${l.id === S.listId ? ' on' : ''}" data-act="picklist" data-id="${l.id}"><span>${esc(l.name)}</span><small>${groupTag(l.g)}${T('{n} offen', { n: openCount(l) })}</small></button>`;
    }).join('')}</div>
    <div class="actions" style="margin-top:10px">
      <button type="button" class="btn ghost" data-act="newlistsheet">${T('+ Neue Liste')}</button>
      <button type="button" class="btn ghost" data-act="editlist" data-id="${S.listId}">${T('Bearbeiten')}</button>
    </div>`);
}
// Einstellungen → Listen: alle Listen, antippen = bearbeiten
function listsPage() {
  const rows = S.lists.map((l) => {
    return `<button type="button" class="sheetbtn" data-act="editlist" data-id="${l.id}"><span>${esc(l.name)}</span><small>${groupTag(l.g)}${l.id === S.listId ? T('aktiv') + ' · ' : ''}${T('{n} offen', { n: openCount(l) })} ›</small></button>`;
  }).join('');
  openPage('lists', T('Listen'), `<div class="group">${rows}</div>
    <p class="sheetnote">${T('Welche Liste du gerade siehst, wählst du mit einem zweiten Tipp auf „Liste“ unten.')}</p>
    <button type="button" class="btn ghost" data-act="newlistsheet">${T('+ Neue Liste')}</button>`, listsPage);
}
function newListSheet() {
  openSheet(`<div class="sheettitle">${T('Neue Liste')}</div>
    <form id="newListForm" autocomplete="off">
      <input id="newListName" autofocus class="notein" placeholder="${T('Name, z. B. Drogerie, Filme oder Urlaub')}" aria-label="${T('Name der Liste')}" required>
      ${typeSelect('nlType', '')}
      ${groupSelect('nlGroup', defaultGroup())}
      <button type="submit" class="btn">${T('Anlegen')}</button>
    </form>`);
}
function listEditPage(id) {
  const l = S.lists.find((x) => x.id === id);
  if (!l) { backTo('lists', listsPage); return; }
  const n = listItems(l).length;
  openPage('list:' + id, T('Liste bearbeiten'), `
    <label class="field"><span>Name</span><input id="listName" data-id="${l.id}" value="${esc(l.name)}"></label>
    ${typeSelect('leType', l.type || '', ` data-id="${l.id}"`)}
    ${l.type === 'simple' ? `<label class="srow"><span class="pl">${T('Abgehakt')}</span><select id="leDone" data-id="${l.id}" aria-label="${T('Abgehakte Einträge')}"><option value="">${T('rutscht nach unten')}</option><option value="keep"${l.keepDone ? ' selected' : ''}>${T('bleibt stehen')}</option></select></label>` : ''}
    <p class="sheetnote" style="margin:2px 4px 8px">${l.type === 'simple'
      ? T('Eigene Reihenfolge und Abschnitte, z. B. für Filme oder Packlisten. Abschnitt anlegen: unten in der Liste. Sortieren: Eintrag gedrückt halten und ziehen.')
      : T('Sortiert sich nach dem Laufweg im Geschäft und nach Kategorien.')}</p>
    ${groupSelect('leGroup', l.g, T('Gruppe'), ` data-id="${l.id}"`)}
    ${shareBlock(l) /* teilen.js */}
    ${S.lists.length > 1 ? `<div class="actions" style="margin-top:16px"><button type="button" class="btn danger" data-act="dellist" data-id="${l.id}">${ui.confirmList === l.id ? T('Wirklich löschen? ({n} Einträge)', { n }) : T('Liste löschen')}</button></div>` : ''}`, () => listEditPage(id));
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
  S.listId = id; S.items = next.items || []; ui.showDone = false; ui.addSec = null;
  if (ui.wiggle === 'items') { ui.wiggle = null; ui.sel.clear(); }
  // Jede Liste merkt sich ihren Laden (ohne eigenen Laden bleibt der aktuelle; ein gelöschter Laden wird zu "Kein Laden")
  if (next.storeId !== undefined) S.storeId = S.stores.some((x) => x.id === next.storeId) ? next.storeId : null;
}
// ---------- Auswahl im Wackelmodus (Listeneinträge) ----------
// Im Wackelmodus wählt Antippen einen Eintrag aus (ui.sel, siehe gesten.js). „Aktionen“ in der schwebenden Leiste:
// auf eine andere Liste verschieben, zu einem Essen hinzufügen, als neues Essen anlegen, löschen. Danach endet der Wackelmodus.
// Dieselben Aktionen gibt es im Eintrag-Sheet für einen einzelnen Eintrag (itemActions, ohne „Löschen“: steht dort schon).
const selItems = () => S.items.filter((i) => ui.sel.has(i.id));
const selBarText = () => (ui.sel.size ? T('{n} ausgewählt', { n: ui.sel.size }) : T('Tippen: auswählen'));
// Kurzname für Überschrift und Hinweise: ein Eintrag mit Namen, sonst die Anzahl
const selLabel = (its) => (its.length === 1 ? T('„{x}“', { x: its[0].name }) : T('{n} Einträge', { n: its.length }));
function toggleSel(row) {
  const id = row.dataset.id;
  if (ui.sel.has(id)) ui.sel.delete(id); else ui.sel.add(id);
  row.classList.toggle('picked', ui.sel.has(id));
  haptic();
  const bar = $('.wigglebar.floatbar');
  if (!bar) return;
  bar.querySelector('.wbtxt').textContent = selBarText();
  bar.querySelector('#selActBtn').disabled = !ui.sel.size;
}
// Eintrag-Sheet → „Aktionen“: erst die Änderungen im Sheet speichern (schließt es), dann die Aktionen für diesen Eintrag
function itemActions(id) {
  const ef = $('#editForm');
  if (ef && ef.checkValidity()) ef.requestSubmit();
  ui.sel = new Set([id]);
  selActionsSheet(true);
}
function selActionsSheet(single = false) {
  const its = selItems();
  if (!its.length) return;
  const others = S.lists.filter((l) => l.id !== S.listId);
  openSheet(`<div class="sheettitle">${esc(selLabel(its))}</div>
    ${others.length ? `<button type="button" class="sheetbtn" data-act="selmove">${T('Auf andere Liste')} <small>›</small></button>` : ''}
    ${meals().length ? `<button type="button" class="sheetbtn" data-act="selmeal">${T('Zu Essen hinzufügen')} <small>›</small></button>` : ''}
    <button type="button" class="sheetbtn" data-act="selnewmeal">${T('Als neues Essen anlegen')} <small>›</small></button>
    ${single ? '' : `<button type="button" class="sheetbtn danger" data-act="seldel">${T('Löschen')}</button>`}`);
}
function selMoveSheet() {
  openSheet(`<div class="sheettitle">${T('Auf welche Liste?')}</div>
    <div class="scrollbox">${S.lists.filter((l) => l.id !== S.listId).map((l) => `<button type="button" class="sheetbtn" data-act="selmoveto" data-id="${l.id}"><span>${esc(l.name)}</span><small>${groupTag(l.g)}${T('{n} offen', { n: openCount(l) })}</small></button>`).join('')}</div>`);
}
function selMealSheet() {
  const list = [...meals()].sort((a, b) => a.name.localeCompare(b.name, LOCALE));
  openSheet(`<div class="sheettitle">${T('Zu welchem Essen?')}</div>
    <div class="scrollbox">${list.map((m) => `<button type="button" class="sheetbtn" data-act="selmealto" data-id="${m.id}"><span>${esc(m.name)}</span><small>${T('{n} Zutaten', { n: m.ing.length })}</small></button>`).join('')}</div>`);
}
function selNewMealSheet() {
  openSheet(`<div class="sheettitle">${T('Als neues Essen anlegen')}</div>
    <form id="selMealForm" autocomplete="off">
      <input id="selMealName" autofocus class="notein" placeholder="${T('Name, z. B. Spaghetti Bolognese')}" aria-label="${T('Name des Essens')}" required>
      ${groupLine('smGroup', defaultGroup())}
      <p class="sheetnote">${T('Zutaten: {names}', { names: esc(selItems().map((i) => i.name).join(', ')) })}</p>
      <button type="submit" class="btn">${T('Anlegen')}</button>
    </form>`);
}
// Nach einer Aktion: Wackelmodus beenden (leert auch die Auswahl); kam sie aus dem Eintrag-Sheet, nur die Auswahl leeren
const selDone = () => { closeSheet(); if (ui.wiggle) endWiggle(); else ui.sel.clear(); };
// Ausgewählte Einträge aus der offenen Liste nehmen (auch ein laufendes Abhaken abbrechen). before = alter Stand für „Rückgängig“.
function takeSel() {
  const its = selItems(), before = S.items.slice();
  S.items = S.items.filter((i) => !ui.sel.has(i.id));
  its.forEach((i) => { clearTimeout(ui.pending.get(i.id)); ui.pending.delete(i.id); });
  return { its, before };
}
// Ausgewählte Einträge auf eine andere Liste verschieben. Abschnitt und eigene Reihenfolge gehören zur alten Liste und fallen weg.
function moveSelTo(listId) {
  const to = S.lists.find((l) => l.id === listId), from = S.listId;
  if (!to || !selItems().length) return;
  const { its, before } = takeSel(), ids = new Set(its.map((i) => i.id));
  to.items = to.items || [];
  its.forEach((i) => { delete i.sec; delete i.ord; to.items.push(i); });
  selDone(); commit();
  toast(T('{n} → „{list}“', { n: selLabel(its), list: to.name }), () => {
    if (S.listId !== from) return;
    to.items = to.items.filter((i) => !ids.has(i.id));
    S.items = before; commit();
  });
}
// Als Zutaten übernehmen (Name und Menge; schon vorhandene Zutaten nicht doppelt). Die Einträge bleiben auf der Liste
// und zeigen das Essen an (wie „Zur Liste“ beim Essen).
function addSelToMeal(m, its = selItems()) {
  let n = 0;
  its.forEach((i) => {
    if (!m.ing.some((x) => dupKey(x.name) === dupKey(i.name))) { m.ing.push({ id: uid(), name: i.name, qty: i.qty || '', basic: false }); n++; }
    if (!(i.meals || []).includes(m.name)) i.meals = [...(i.meals || []), m.name];
  });
  return n;
}
// „Rückgängig“: Essen-Anzeige an den Einträgen wie vorher (snap = [[Eintrag, alte meals], …])
const mealsSnap = (its) => its.map((i) => [i, i.meals]);
const restoreMeals = (snap) => snap.forEach(([i, ml]) => { if (ml) i.meals = ml; else delete i.meals; });
function selToMeal(mealId) {
  const m = mealById(mealId), its = selItems();
  if (!m || !its.length) return;
  const ing = m.ing.slice(), snap = mealsSnap(its);
  const n = addSelToMeal(m, its);
  selDone(); commit();
  let msg = T('Steht schon alles bei „{name}“', { name: m.name });
  if (n === 1) msg = T('1 Zutat zu „{name}“ hinzugefügt', { name: m.name });
  else if (n > 1) msg = T('{n} Zutaten zu „{name}“ hinzugefügt', { n, name: m.name });
  toast(msg, () => { m.ing = ing; restoreMeals(snap); commit(); });
}
function newMealFromSel(name, g) {
  const its = selItems();
  if (!name || !its.length) return;
  const m = { id: uid(), name, tags: [], base: 2, ing: [], photo: null, steps: '', g: g || defaultGroup() };
  if (m.g) S.lastGroup = m.g;
  meals().push(m);
  const snap = mealsSnap(its);
  addSelToMeal(m, its);
  selDone(); commit();
  toast(T('Essen „{name}“ angelegt', { name }), () => { S.meals = meals().filter((x) => x !== m); restoreMeals(snap); commit(); });
}
function deleteSel() {
  const lid = S.listId;
  if (!selItems().length) return;
  const { its, before } = takeSel();
  selDone(); commit();
  toast(its.length === 1 ? T('„{name}“ gelöscht', { name: its[0].name }) : T('{n} Einträge gelöscht', { n: its.length }), () => { if (S.listId === lid) { S.items = before; commit(); } });
}
function moreSheet() {
  const done = S.items.filter((i) => i.done).length;
  openSheet(`<div class="sheettitle">${T('Menü')}</div>
    <button type="button" class="sheetbtn" data-act="listsheet">${T('Listen')} <small>${S.lists.length > 1 ? esc(curList().name) : T('neue Liste anlegen')}</small></button>
    <button type="button" class="sheetbtn" data-act="tab" data-tab="meals">${T('Essen')} <small>${(S.meals || []).length || T('Zutaten auf einen Tipp')}</small></button>
    <button type="button" class="sheetbtn" data-act="gostores">${T('Geschäfte und Grundrisse')}</button>
    ${done ? `<button type="button" class="sheetbtn" data-act="cleardone">${T('Erledigte entfernen')} <small>${done}</small></button>` : ''}
    <button type="button" class="sheetbtn" data-act="catlist">${T('Kategorien')} <small>${CATS.length}</small></button>`);
}
const ICON_CAM = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>';
const ICON_UP = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function photoBoxHtml(it) {
  return it.photo
    ? `<div class="photo"><img src="${it.photo}" alt="${esc(T('Foto zu {name}', { name: it.name }))}" data-act="viewphoto"><div class="photoact"><label for="ePhoto" class="link">${T('Ersetzen')}</label><button type="button" class="link" data-act="delphoto" data-id="${it.id}">${T('Entfernen')}</button></div></div>`
    : '';
}
function updatePhotoUi(it) {
  const box = $('#photoBox'), cam = $('#camBtn');
  if (box) box.innerHTML = photoBoxHtml(it);
  if (cam) cam.hidden = !!it.photo;
}
function openEdit(id) {
  const it = S.items.find((i) => i.id === id);
  if (!it) return;
  if (!S.tipSeen) { S.tipSeen = true; save(); $('#listBody') && ($('#listBody').innerHTML = listBody()); }
  openSheet(`<div class="sheettitle">${T('Eintrag')}</div><form method="dialog" id="editForm" data-id="${it.id}" data-cat="${it.cat}">
    <div class="namerow">
      <input id="eName" class="nameinput" value="${esc(it.name)}" placeholder="Name" aria-label="Name" required>
      <input id="eQty" value="${esc(it.qty)}" placeholder="${T('Menge')}" aria-label="${T('Menge')}">
    </div>
    <div class="noterow">
      <input id="eNote" class="notein" value="${esc(it.note)}" placeholder="${T('Notiz (optional)')}" aria-label="${T('Notiz')}">
      <label class="camlabel" id="camBtn" for="ePhoto" aria-label="${T('Foto aufnehmen oder wählen')}"${it.photo ? ' hidden' : ''}>${ICON_CAM}</label>
    </div>
    ${it.meals?.length ? `<p class="sheetnote ml" style="margin:2px 0 8px">${MEAL_ICON} ${T('Aus:')} ${esc(it.meals.join(', '))}</p>` : ''}
    <div id="photoBox">${photoBoxHtml(it)}</div>
    <input type="file" id="ePhoto" accept="image/*" hidden>
    ${isSimple() ? (curList().secs?.length ? `<div class="more" inert><div class="moreinner">${secField(it)}</div></div>` : '') : `<div class="more" inert><div class="moreinner">
      <label class="srow"><span class="pl">${T('Kategorie')}</span><select id="eCat" aria-label="${T('Kategorie')}">${CATS.map((c) => `<option value="${c.id}"${c.id === it.cat ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button type="button" class="srowgo" data-act="editcat" aria-label="${T('Kategorie öffnen')}">›</button></label>
      ${zoneField(it)}
      <p id="learnNote" class="sheetnote" hidden>${T('Der Name wird als Stichwort der neuen Kategorie gemerkt.')}</p>
    </div></div>`}
    <div class="actions">
      <button type="button" class="btn danger" style="flex:1" data-act="delitem" data-id="${it.id}">${T('Löschen')}</button>
      <button type="button" class="btn ghost" style="flex:1" data-act="itemactions" data-id="${it.id}">${T('Aktionen')}</button>
      <button type="submit" hidden>${T('Speichern')}</button>
    </div></form>`);
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
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(T('Bild nicht lesbar'))); };
    img.src = url;
  });
}

