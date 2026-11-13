'use strict';
// Listen und Einträge: Listen wählen, anlegen, bearbeiten, wechseln; Eintrag-Sheet mit Foto.

function listSheet() {
  openSheet(`<div class="sheettitle">Listen</div>
    <div class="scrollbox">${S.lists.map((l) => {
      return `<button type="button" class="sheetbtn${l.id === S.listId ? ' on' : ''}" data-act="picklist" data-id="${l.id}"><span>${esc(l.name)}</span><small>${groupTag(l.g)}${openCount(l)} offen</small></button>`;
    }).join('')}</div>
    <div class="actions" style="margin-top:10px">
      <button type="button" class="btn ghost" data-act="newlistsheet">+ Neue Liste</button>
      <button type="button" class="btn ghost" data-act="editlist" data-id="${S.listId}">Bearbeiten</button>
    </div>`);
}
// Einstellungen → Listen: alle Listen, antippen = bearbeiten
function listsPage() {
  const rows = S.lists.map((l) => {
    return `<button type="button" class="sheetbtn" data-act="editlist" data-id="${l.id}"><span>${esc(l.name)}</span><small>${groupTag(l.g)}${l.id === S.listId ? 'aktiv · ' : ''}${openCount(l)} offen ›</small></button>`;
  }).join('');
  openPage('lists', 'Listen', `<div class="group">${rows}</div>
    <p class="sheetnote">Welche Liste du gerade siehst, wählst du mit einem zweiten Tipp auf „Liste“ unten.</p>
    <button type="button" class="btn ghost" data-act="newlistsheet">+ Neue Liste</button>`, listsPage);
}
function newListSheet() {
  openSheet(`<div class="sheettitle">Neue Liste</div>
    <form id="newListForm" autocomplete="off">
      <input id="newListName" autofocus class="notein" placeholder="Name, z. B. Drogerie, Filme oder Urlaub" aria-label="Name der Liste" required>
      ${typeSelect('nlType', '')}
      ${groupSelect('nlGroup', defaultGroup())}
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
function listEditPage(id) {
  const l = S.lists.find((x) => x.id === id);
  if (!l) { backTo('lists', listsPage); return; }
  const n = listItems(l).length;
  openPage('list:' + id, 'Liste bearbeiten', `
    <label class="field"><span>Name</span><input id="listName" data-id="${l.id}" value="${esc(l.name)}"></label>
    ${typeSelect('leType', l.type || '', ` data-id="${l.id}"`)}
    ${l.type === 'simple' ? `<label class="srow"><span class="pl">Abgehakt</span><select id="leDone" data-id="${l.id}" aria-label="Abgehakte Einträge"><option value="">rutscht nach unten</option><option value="keep"${l.keepDone ? ' selected' : ''}>bleibt stehen</option></select></label>` : ''}
    <p class="sheetnote" style="margin:2px 4px 8px">${l.type === 'simple'
      ? 'Eigene Reihenfolge und Abschnitte, z. B. für Filme oder Packlisten. Abschnitt anlegen: unten in der Liste. Sortieren: Eintrag gedrückt halten und ziehen.'
      : 'Sortiert sich nach dem Laufweg im Geschäft und nach Kategorien.'}</p>
    ${groupSelect('leGroup', l.g, 'Gruppe', ` data-id="${l.id}"`)}
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
  S.listId = id; S.items = next.items || []; ui.showDone = false; ui.addSec = null;
  if (ui.wiggle === 'items') ui.wiggle = null;
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
    ${isSimple() ? (curList().secs?.length ? `<div class="more" inert><div class="moreinner">${secField(it)}</div></div>` : '') : `<div class="more" inert><div class="moreinner">
      <label class="srow"><span class="pl">Kategorie</span><select id="eCat" aria-label="Kategorie">${CATS.map((c) => `<option value="${c.id}"${c.id === it.cat ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button type="button" class="srowgo" data-act="editcat" aria-label="Kategorie öffnen">›</button></label>
      ${zoneField(it)}
      <p id="learnNote" class="sheetnote" hidden>Der Name wird als Stichwort der neuen Kategorie gemerkt.</p>
    </div></div>`}
    <div class="actions">
      <button type="button" class="btn danger" data-act="delitem" data-id="${it.id}">Löschen</button>
      <button type="submit" hidden>Speichern</button>
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
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
}

