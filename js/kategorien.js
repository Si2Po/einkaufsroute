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
  const rows = CATS.map((c) => `<div class="catrow" data-key="${c.id}"><button type="button" class="sheetbtn" data-act="catdetail" data-id="${c.id}"><span>${esc(c.name)}</span><small>${c.id === 'sonst' && !c.kw.length ? 'Auffangbecken' : `${c.kw.length} Stichwörter`} ›</small></button></div>`).join('');
  const q = $('#catSearch')?.value || '';
  openPage('cats', 'Kategorien', `
    ${groupSelect('catGroupSel', S.catGroup, 'Stichwörter von')}
    <input id="catSearch" type="search" class="notein catsearch" value="${esc(q)}" placeholder="Produkt suchen: in welcher Kategorie?" aria-label="Stichwort suchen" autocomplete="off" autocapitalize="off" enterkeyhint="search">
    <div id="catRes" class="group" hidden></div>
    <p class="sheetnote" style="margin:4px 4px 0">In dieser Reihenfolge sortiert sich die Liste, wenn kein Geschäft gewählt ist. Lange drücken zum Sortieren.</p>
    ${ui.wiggle === 'cats' ? wiggleBar() : ''}
    <div class="group${ui.wiggle === 'cats' ? ' wiggle' : ''}" id="catRows">${rows}</div>
    ${missing.length ? `<div class="group"><button type="button" class="sheetbtn" data-act="restoredefaults">Fehlende Standard-Kategorien zurückholen <small>${missing.length}</small></button></div>` : ''}
    <button type="button" class="btn ghost" data-act="newcatsheet">+ Neue Kategorie</button>
    ${groupsOn() ? '<div class="group" style="margin-top:12px"><button type="button" class="sheetbtn" data-act="catimport"><span>Von anderer Gruppe übernehmen</span><small>›</small></button></div>' : ''}`, catListPage);
  if (q) updateCatSearch();
}

// ---------- Kategorien und Stichwörter aus einer anderen Gruppe übernehmen ----------
// Ziel ist immer die gerade gewählte Stichwortliste (S.cats, Gruppe S.catGroup). Die der anderen Gruppen liegen in S.gcats[g].
//   ergänzen: fehlende Kategorien und Stichwörter kommen dazu, Vorhandenes bleibt
//   ersetzen: genaue Kopie der anderen Gruppe (mit Rückfrage)
function catImportSheet() {
  const others = sync.groups.filter((x) => x.id !== S.catGroup);
  if (!others.length) { toast('Es gibt keine andere Gruppe.'); return; }
  if (!others.some((x) => x.id === ui.impFrom)) ui.impFrom = others[0].id;
  openSheet(`<div class="sheettitle">Kategorien übernehmen</div>
    <p class="sheetnote" style="margin:0 4px 8px">In „${esc(gName(S.catGroup))}“ übernehmen aus:</p>
    <label class="srow"><span class="pl gpl">${ICON_GROUP}Von</span><select id="impFrom" aria-label="Von Gruppe">${others.map((x) => `<option value="${x.id}"${x.id === ui.impFrom ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <div class="actions" style="margin-top:12px">
      <button type="button" class="btn" style="flex:1" data-act="catimp" data-mode="add">Ergänzen</button>
      <button type="button" class="btn danger" style="flex:1" data-act="catimp" data-mode="replace">${ui.confirmImp ? 'Wirklich ersetzen?' : 'Ersetzen'}</button>
    </div>
    <p class="sheetnote" style="margin:8px 4px 0"><b>Ergänzen:</b> Fehlende Kategorien und Stichwörter kommen dazu, alles Vorhandene bleibt.<br><b>Ersetzen:</b> Die Kategorien hier werden eine genaue Kopie, bisherige Stichwörter gehen verloren${S.catGroup === personalGroup() ? '' : ` – auch für alle anderen in „${esc(gName(S.catGroup))}“`}.</p>`);
}
document.addEventListener('change', (e) => { if (e.target.id === 'impFrom') { ui.impFrom = e.target.value; ui.confirmImp = false; } });
// Gibt true zurück, wenn das Sheet offen bleiben soll (Rückfrage beim Ersetzen)
function catImport(mode) {
  const from = ui.impFrom, src = (S.gcats || {})[from];
  if (!src || !src.length) { ui.confirmImp = false; toast(`In „${gName(from)}“ gibt es noch keine eigenen Kategorien.`); return false; }
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
  const msg = mode === 'replace' ? `Kategorien von „${gName(from)}“ übernommen` : (added ? `${added} Kategorien/Stichwörter ergänzt` : 'Nichts Neues zum Ergänzen');
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
      : 'Die App erkennt sie am Wortanfang. Änderst du bei einem Eintrag die Kategorie, landet sein Name automatisch hier. Mit Stern: „tk*“ = beginnt mit TK, „*saft“ = endet auf saft.'}</p>
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
