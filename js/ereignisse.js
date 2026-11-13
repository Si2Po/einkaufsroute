'use strict';
// Ereignisse: Abhaken, langes Drücken, Wischen auf Einträgen, Hinzufügen, Klicks, Formulare, Änderungen.

// ---------- Ereignisse ----------
// Abhaken mit Verzögerung: Der Haken erscheint sofort, die Einträge wandern aber erst nach "Erledigt",
// wenn CHECK_DELAY lang nichts mehr angetippt wurde (so bleibt beim Abhaken mehrerer Dinge alles an seinem Platz).
// Tippst du einen angehakten Eintrag noch einmal an, ist das Abhaken rückgängig.
const CHECK_DELAY = 2500;
let pendT;
function finishAll() {
  clearTimeout(pendT);
  if (!ui.pending.size) return;
  const checked = [];
  ui.pending.forEach((_, id) => { const it = S.items.find((i) => i.id === id); if (it && !it.done) { it.done = true; checked.push(it); } });
  ui.pending.clear();
  commit();
  funChecked(checked);
  histChecked(checked);
}
const armPending = () => { clearTimeout(pendT); if (ui.pending.size) pendT = setTimeout(finishAll, CHECK_DELAY); };
function toggleItem(id) {
  const it = S.items.find((i) => i.id === id);
  if (!it) return;
  if (isSimple() && curList().keepDone) { // bleibt an seinem Platz stehen
    it.done = !it.done; commit();
    if (it.done) funChecked([it]);
    return;
  }
  if (it.done) { it.done = false; commit(); armPending(); return; }
  if (ui.pending.has(id)) ui.pending.delete(id); else ui.pending.set(id, true);
  armPending();
  render();
}
// App verlassen: angehakte Einträge sofort abschließen und speichern
document.addEventListener('visibilitychange', () => { if (document.hidden) finishAll(); });
window.addEventListener('pagehide', finishAll);

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
  if (e.target.closest?.('.wiggle')) return; // im Wackelmodus verschiebt Ziehen, langes Drücken zählt nicht
  const el = e.target.closest?.('.row, .zone, .zitem, .star, .mcard, .catrow, .secbtn');
  if (!el) return;
  const id = el.dataset.id;
  lpFired = false; lpStar = false;
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => {
    lpFired = true; lp = null;
    holdAfterLongPress();
    haptic();
    if (el.classList.contains('star')) { lpStar = true; starSheet(); }
    else if (el.classList.contains('row')) { if (el.closest('#listRows')) holdDrag(e, el); else openEdit(id); }
    else if (el.classList.contains('mcard')) openMealEdit(id);
    else if (el.classList.contains('secbtn')) sectionSheet(el.dataset.sec); // Abschnitt: umbenennen, verschieben, löschen
    else if (el.matches('.zitem, .catrow')) startWiggle(e, el); // Liste der Bereiche / Kategorien: sortieren
    else startRedraw(id); // Bereich im Grundriss: neu einzeichnen
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
  funMealAdded(m);
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
  if (!row || e.target.closest('#dlg') || e.target.closest('.wiggle') || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
  const dups = [], added = [];
  parts.forEach((p, n) => {
    const { qty, name } = parseEntry(p);
    const same = S.items.find((i) => !i.done && dupKey(i.name) === dupKey(name));
    if (same) { dups.push(same); return; } // steht schon auf der Liste (auch als Mehrzahl/Einzahl)
    const it = { id: uid(), name, qty, note: '', cat: guessCat(name), done: false, ts: Date.now() + n };
    if (isSimple()) { if (validSec(ui.addSec)) it.sec = ui.addSec; } // einfache Liste: in den gewählten Abschnitt, Wörter nicht für Einkaufs-Vorschläge merken
    else rememberName(name);
    S.items.push(it);
    added.push(name);
  });
  input.value = '';
  commit();
  updateSugg();
  if (dups.length) { flashItem(dups[0].id); toast(`${dups.map((d) => '„' + d.name + '“').join(', ')} steht schon auf der Liste`); }
  else funItemAdded(added);
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
  const list = isSimple() ? [] : suggestions(q); // Einkaufs-Vorschläge passen nicht zu Filmen, Packlisten usw.
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
      const gh = anim === 'push' || anim === 'pop' ? wrapGhost() : null; // Abbild der bisherigen Ansicht
      ui.wiggle = null;
      ui.tab = to; ui.drawing = false; ui.confirmDel = false; if (ui.tab !== 'stores') ui.editStoreId = null; render(); window.scrollTo(0, 0);
      if (anim) wrapAnim(anim, gh);
      break;
    }
    case 'toggle': toggleItem(id); break;
    case 'storesheet': storeSheet(); keep = true; break;
    case 'swipesheet': swipePage(); keep = true; break;
    case 'wiggleoff': endWiggle(); keep = true; break;
    case 'themepage': themePage(); keep = true; break;
    case 'helppage': helpPage(); keep = true; break;
    case 'duepage': duePage(); keep = true; break;
    case 'duenew': dueNewSheet(); keep = true; break;
    case 'dueedit': ui.confirmDueDel = false; dueEditSheet(el.dataset.g, el.dataset.key); keep = true; break;
    case 'dueauto': case 'duedel': keep = dueAction(act); break;
    case 'catimport': ui.confirmImp = false; catImportSheet(); keep = true; break;
    case 'catimp': keep = catImport(el.dataset.mode); break;
    case 'vertap': funVersionTap(); keep = true; break; // Versionsnummer: 7× tippen = Statistik
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
    case 'pickstore': S.storeId = id || null; commit(); if (offerStoreMove()) keep = true; break; // ggf. fragen, ob das Geschäft in die Gruppe der Liste umzieht
    case 'movestore': { const st = S.stores.find((x) => x.id === id); if (st) { st.g = el.dataset.g; commit(); toast(`„${st.name}“ ist jetzt in „${gName(st.g)}“`); } break; }
    case 'gostores': { const gh = wrapGhost(); ui.tab = 'stores'; ui.editStoreId = null; render(); window.scrollTo(0, 0); wrapAnim('push', gh); break; }
    case 'delitem': clearTimeout(ui.pending.get(id)); ui.pending.delete(id); S.items = S.items.filter((i) => i.id !== id); commit(); break;
    case 'closedlg': break;
    case 'showdone': ui.showDone = !ui.showDone; render(); break;
    case 'cleardone': S.items = S.items.filter((i) => !i.done); commit(); break;
    case 'resetdone': S.items.forEach((i) => { i.done = false; }); commit(); break;
    case 'secpick': { // Abschnitt antippen: Neues landet dort (nochmal antippen: wieder oben ohne Abschnitt)
      if (lpFired) { lpFired = false; break; }
      ui.addSec = ui.addSec === el.dataset.sec ? null : el.dataset.sec; render();
      if (ui.addSec) $('#addName')?.focus();
      break;
    }
    case 'newsec': newSecSheet(); keep = true; break;
    case 'secup': case 'secdown': moveSec(id, act === 'secup' ? -1 : 1); sectionSheet(id); keep = true; break;
    case 'secdel': {
      if (ui.confirmSec !== id) { ui.confirmSec = id; sectionSheet(id); keep = true; break; }
      const l = curList(); l.secs = (l.secs || []).filter((s) => s.id !== id);
      S.items.forEach((i) => { if (i.sec === id) delete i.sec; }); // Einträge bleiben, nur ohne Abschnitt
      if (ui.addSec === id) ui.addSec = null;
      commit(); break;
    }
    case 'sortitems': ui.wiggle = 'items'; closeSheet(); render(); keep = true; break;
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
    case 'openstore': { const gh = wrapGhost(); ui.wiggle = null; ui.editStoreId = id; ui.view = fitView(S.stores.find((x) => x.id === id)); ui.selZone = null; ui.drawing = false; ui.confirmDel = false; render(); window.scrollTo(0, 0); wrapAnim('push', gh); break; }
    case 'back': { const gh = wrapGhost(); ui.wiggle = null; ui.editStoreId = null; ui.drawing = false; ui.confirmDel = false; render(); window.scrollTo(0, 0); wrapAnim('pop', gh); break; }
    case 'usestore': S.storeId = id; commit(); if (offerStoreMove()) keep = true; break;
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
      if (ui.selZone === id) { ui.selZone = null; ui.drawing = false; render(); break; } // schon offen: Tippen schließt die Details
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
    const g = $('#nlGroup')?.value || defaultGroup();
    const l = { id: uid(), name, items: [], storeId: null, g }; // neue Listen starten ohne Geschäft
    if ($('#nlType')?.value === 'simple') l.type = 'simple';
    if (g) S.lastGroup = g;
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
    s.g = $('#nsGroup')?.value || curList()?.g || defaultGroup(); // Gruppe des neuen Geschäfts
    S.stores.push(s);
    S.storeId = s.id;
    ui.tab = 'stores'; ui.editStoreId = s.id; ui.selZone = null; ui.drawing = false; ui.view = fitView(s);
    closeSheet(); commit();
  } else if (f.id === 'editForm') {
    const it = S.items.find((i) => i.id === f.dataset.id);
    if (it) {
      const oldKey = normKey(it.name), oldName = it.name;
      it.name = $('#eName').value.trim() || it.name;
      const pinSel = $('#eZone'), pinStore = listStore();
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
      const secSel = $('#eSec');
      if (secSel) { if (secSel.value) it.sec = secSel.value; else delete it.sec; }
      const cat = $('#eCat') ? $('#eCat').value : f.dataset.cat; // einfache Liste: keine Kategorie-Auswahl
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

