'use strict';
// Kategorien und Stichwörter: Übersicht, Suche, Kategorie anlegen und bearbeiten.

function addKeywords(catId, text) {
  const c = CAT_BY_ID[catId];
  const words = text.split(',').map((w) => w.trim().toLowerCase()).filter((w) => w && !c?.kw.includes(w));
  if (!c || !words.length) return false;
  c.kw.push(...new Set(words));
  return true;
}
const insertBeforeFallback = (cat) => { const i = CATS.findIndex((c) => c.id === 'sonst'); CATS.splice(i < 0 ? CATS.length : i, 0, cat); indexCats(); };
function catListPage() {
  const missing = DEFAULT_CATS.filter((d) => !CAT_BY_ID[d.id]);
  // Jede Zeile: antippen = bearbeiten, lange drücken = Wackelmodus zum Sortieren (gilt ohne Geschäft). „Sonstiges“ bleibt unten.
  const rows = CATS.map((c) => `<div class="catrow" data-key="${c.id}"><button type="button" class="sheetbtn" data-act="catdetail" data-id="${c.id}"><span>${esc(c.name)}</span><small>${c.id === 'sonst' && !c.kw.length ? T('Auffangbecken') : T('{n} Stichwörter', { n: c.kw.length })} ›</small></button></div>`).join('');
  const q = $('#catSearch')?.value || '';
  openPage('cats', T('Kategorien'), `
    ${groupSelect('catGroupSel', S.catGroup, T('Stichwörter von'))}
    <input id="catSearch" type="search" class="notein catsearch" value="${esc(q)}" placeholder="${T('Produkt suchen: in welcher Kategorie?')}" aria-label="${T('Stichwort suchen')}" autocomplete="off" autocapitalize="off" enterkeyhint="search">
    <div id="catRes" class="group" hidden></div>
    <p class="sheetnote" style="margin:4px 4px 0">${T('In dieser Reihenfolge sortiert sich die Liste, wenn kein Geschäft gewählt ist. Lange drücken zum Sortieren.')}</p>
    ${ui.wiggle === 'cats' ? wiggleBar() : ''}
    <div class="group${ui.wiggle === 'cats' ? ' wiggle' : ''}" id="catRows">${rows}</div>
    ${missing.length ? `<div class="group"><button type="button" class="sheetbtn" data-act="restoredefaults">${T('Fehlende Standard-Kategorien zurückholen')} <small>${missing.length}</small></button></div>` : ''}
    <button type="button" class="btn ghost" data-act="newcatsheet">${T('+ Neue Kategorie')}</button>
    ${groupsOn() ? `<div class="group" style="margin-top:12px"><button type="button" class="sheetbtn" data-act="catimport"><span>${T('Von anderer Gruppe übernehmen')}</span><small>›</small></button></div>` : ''}`, catListPage);
  if (q) updateCatSearch();
}

// ---------- Kategorien und Stichwörter aus einer anderen Gruppe übernehmen ----------
// Ziel ist immer die gerade gewählte Stichwortliste (S.cats, Gruppe S.catGroup). Die der anderen Gruppen liegen in S.gcats[g].
//   ergänzen: fehlende Kategorien und Stichwörter kommen dazu, Vorhandenes bleibt
//   ersetzen: genaue Kopie der anderen Gruppe (mit Rückfrage)
function catImportSheet() {
  const others = sync.groups.filter((x) => x.id !== S.catGroup);
  if (!others.length) { toast(T('Es gibt keine andere Gruppe.')); return; }
  if (!others.some((x) => x.id === ui.impFrom)) ui.impFrom = others[0].id;
  openSheet(`<div class="sheettitle">${T('Kategorien übernehmen')}</div>
    <p class="sheetnote" style="margin:0 4px 8px">${T('In „{name}“ übernehmen aus:', { name: esc(gName(S.catGroup)) })}</p>
    <label class="srow"><span class="pl gpl">${ICON_GROUP}${T('Von')}</span><select id="impFrom" aria-label="${T('Von Gruppe')}">${others.map((x) => `<option value="${x.id}"${x.id === ui.impFrom ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <div class="actions" style="margin-top:12px">
      <button type="button" class="btn" style="flex:1" data-act="catimp" data-mode="add">${T('Ergänzen')}</button>
      <button type="button" class="btn danger" style="flex:1" data-act="catimp" data-mode="replace">${T(ui.confirmImp ? 'Wirklich ersetzen?' : 'Ersetzen')}</button>
    </div>
    <p class="sheetnote" style="margin:8px 4px 0">${T('<b>Ergänzen:</b> Fehlende Kategorien und Stichwörter kommen dazu, alles Vorhandene bleibt.<br><b>Ersetzen:</b> Die Kategorien hier werden eine genaue Kopie, bisherige Stichwörter gehen verloren')}${S.catGroup === personalGroup() ? '' : T(' – auch für alle anderen in „{name}“', { name: esc(gName(S.catGroup)) })}.</p>`);
}
document.addEventListener('change', (e) => { if (e.target.id === 'impFrom') { ui.impFrom = e.target.value; ui.confirmImp = false; } });
// Gibt true zurück, wenn das Sheet offen bleiben soll (Rückfrage beim Ersetzen)
function catImport(mode) {
  const from = ui.impFrom, src = (S.gcats || {})[from];
  if (!src || !src.length) { ui.confirmImp = false; toast(T('In „{name}“ gibt es noch keine eigenen Kategorien.', { name: gName(from) })); return false; }
  if (mode === 'replace' && !ui.confirmImp) { ui.confirmImp = true; catImportSheet(); return true; }
  ui.confirmImp = false;
  const before = S.cats.map(cloneCat);
  let added = 0;
  if (mode === 'replace') {
    S.cats = src.map(cloneCat);
    if (!S.cats.some((c) => c.id === 'sonst')) S.cats.push(cloneCat(DEFAULT_CATS.find((d) => d.id === 'sonst')));
  } else {
    const have = new Set(S.cats.flatMap((c) => c.kw)); // ein Stichwort soll nur in einer Kategorie stehen
    for (const sc of src) {
      let c = S.cats.find((x) => x.id === sc.id);
      if (!c) { c = { id: sc.id, name: sc.name, kw: [] }; CATS = S.cats; insertBeforeFallback(c); added++; }
      sc.kw.forEach((k) => { if (!have.has(k)) { c.kw.push(k); have.add(k); added++; } });
    }
  }
  CATS = S.cats; indexCats();
  commit(); catListPage();
  const msg = mode === 'replace' ? T('Kategorien von „{name}“ übernommen', { name: gName(from) }) : (added ? T('{n} Kategorien/Stichwörter ergänzt', { n: added }) : T('Nichts Neues zum Ergänzen'));
  toast(msg, () => { S.cats = before; CATS = S.cats; indexCats(); commit(); catListPage(); });
  return false;
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
  hits.sort((a, b) => a.tier - b.tier || a.dist - b.dist || a.k.length - b.k.length || a.k.localeCompare(b.k, LOCALE));
  const exact = hits.some((h) => h.tier === 0);
  const row = (label, c, extra) => `<button type="button" class="sheetbtn" data-act="catdetail" data-id="${c.id}"><span>${label}</span><small${extra ? ' class="on"' : ''}>${esc(c.name)} ›</small></button>`;
  let html = '';
  if (!exact && qf.length >= 2 && (!hits.length || keywordGuess(q) !== 'sonst')) { const g = CAT_BY_ID[keywordGuess(q)]; if (g) html += row(`<i>${esc(q)}</i> <small class="muted">${T('landet in')}</small>`, g, true); }
  html += hits.slice(0, 12).map((h) => row(esc(h.k.charAt(0).toUpperCase() + h.k.slice(1)), h.c, false)).join('');
  res.innerHTML = html || `<p class="sheetnote">${T('Kein Stichwort gefunden.')}</p>`;
  res.hidden = false; rows.hidden = true;
}
function newCatSheet() {
  openSheet(`<div class="sheettitle">${T('Neue Kategorie')}</div>
    <form id="newCatForm" autocomplete="off">
      <input id="newCatName" autofocus class="notein" placeholder="${T('Name, z. B. Tierbedarf')}" aria-label="${T('Name der Kategorie')}" required>
      <button type="submit" class="btn">${T('Anlegen')}</button>
    </form>`);
}
function catDetailPage(id) {
  const c = CAT_BY_ID[id];
  if (!c) { backTo('cats', catListPage); return; }
  const def = DEFAULT_CATS.find((d) => d.id === id);
  const changed = def && (def.name !== c.name || JSON.stringify([...def.kw].sort()) !== JSON.stringify([...c.kw].sort()));
  const used = S.items.filter((i) => i.cat === id).length;
  openPage('cat:' + id, T('Kategorie'), `
    <label class="field"><span>Name</span><input id="catName" value="${esc(c.name)}" data-id="${id}"></label>
    <div class="label" style="margin:12px 0 4px">${T('Stichwörter')}</div>
    <p class="sheetnote" style="margin:0 0 6px">${id === 'sonst'
      ? T('Hier landet alles ohne Treffer. Ein Stichwort hier hält ein Wort in Sonstiges, auch wenn es sonst woanders passen würde.')
      : T('Die App erkennt sie am Wortanfang. Änderst du bei einem Eintrag die Kategorie, landet sein Name automatisch hier. Mit Stern: „tk*“ = beginnt mit TK, „*saft“ = endet auf saft.')}</p>
    ${c.kw.length ? `<div class="kwbox"><div class="chips">${c.kw.map((k) => `<button type="button" class="chip" data-act="delkw" data-id="${id}" data-kw="${esc(k)}" aria-label="${esc(T('{name} entfernen', { name: k }))}">${esc(k)} ×</button>`).join('')}</div></div>` : `<p class="sheetnote">${T('Noch keine Stichwörter.')}</p>`}
    <form id="kwForm" class="add" data-id="${id}" autocomplete="off" style="margin:8px 0 0">
      <input id="kwInput" placeholder="${T('Stichwort hinzufügen')}" aria-label="${T('Stichwort hinzufügen')}">
      <button type="submit" class="plus" aria-label="${T('Hinzufügen')}">${ICON_PLUS}</button>
    </form>
    ${id !== 'sonst' || changed ? `<div class="actions" style="margin-top:16px">
      ${id !== 'sonst' ? `<button type="button" class="btn danger" data-act="delcat" data-id="${id}">${ui.confirmCat ? T('Wirklich löschen? ({n} Einträge)', { n: used }) : T('Kategorie löschen')}</button>` : ''}
      ${changed ? `<button type="button" class="btn ghost" data-act="restorecat" data-id="${id}">${T('Auf Standard zurücksetzen')}</button>` : ''}
    </div>` : ''}`, () => catDetailPage(id));
}
