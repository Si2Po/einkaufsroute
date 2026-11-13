'use strict';
// Oberfläche: Sheets, Unterseiten, Zurück-Wischen, Tastatur, Hinweise (toast), Sheets für Listen/Geschäfte/Kategorien/Einträge.

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
  if (!d.open) d.classList.remove('tall'); // neues Sheet startet in normaler Höhe
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
  ui.wiggle = null;
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
// Geschäfte und ihr Editor liegen in der Hauptansicht, verhalten sich aber wie Seiten (gleiten herein, Zurück, Wisch-zurück).
// Damit man dabei wie bei echten Seiten die vorige Ansicht sieht, gibt es ein „Abbild“ (Ghost): eine stille Kopie der Ansicht.
function wrapGhost(html) {
  const gh = document.createElement('div');
  gh.className = 'wrapghost'; gh.setAttribute('aria-hidden', 'true'); gh.inert = true;
  const inner = html == null ? $('.wrap').cloneNode(true) : Object.assign(document.createElement('div'), { className: 'wrap', innerHTML: `<main>${html}</main>` });
  inner.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id')); // keine doppelten IDs
  inner.style.transform = ''; inner.classList.remove('slide');
  if (html == null) inner.style.marginTop = `${-window.scrollY}px`; // gleiche Scroll-Lage wie vorher
  gh.append(inner);
  document.body.append(gh);
  return gh;
}
// kind: 'push' (neue Ansicht gleitet von rechts über die alte), 'pop' (alte gleitet nach rechts weg), 'fade' (Tabwechsel)
function wrapAnim(kind, ghost, fromX = 0) {
  const w = $('.wrap');
  if (reduceMotion() || !w.animate) { ghost?.remove(); return; }
  const o = { duration: kind === 'pop' ? 280 : 320, easing: PAGE_EASE };
  if (kind === 'push') {
    w.classList.add('slide');
    if (ghost) ghost.animate([{ transform: 'none' }, { transform: 'translateX(-25%)' }], { ...o, fill: 'forwards' });
    w.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], o).finished
      .finally(() => { w.classList.remove('slide'); ghost?.remove(); });
  } else if (kind === 'pop') {
    if (ghost) {
      ghost.classList.add('top');
      ghost.animate([{ transform: `translateX(${fromX}px)` }, { transform: 'translateX(100%)' }], { ...o, fill: 'forwards' }).finished.finally(() => ghost.remove());
    }
    w.animate([{ transform: `translateX(${-0.25 * (innerWidth - fromX)}px)` }, { transform: 'none' }], o);
  } else w.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
}
function storesBack() {
  ui.wiggle = null;
  if (ui.editStoreId) { ui.editStoreId = null; ui.selZone = null; ui.drawing = false; }
  else ui.tab = 'settings';
  render(); window.scrollTo(0, 0);
}
// Wisch vom linken Rand: Seite folgt dem Finger, darunter sieht man die vorige
(function edgeBack() {
  let g = null;
  const target = () => {
    if (pages.length) return { el: pages[pages.length - 1].el, under: pages.length > 1 ? pages[pages.length - 2].el : $('.wrap') };
    return ui.tab === 'stores' ? { el: $('.wrap'), under: null, stores: true } : null;
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
      if (g.stores) { // vorige Ansicht als Abbild darunter legen (Geschäfte → Einstellungen, Editor → Geschäfte)
        g.under = wrapGhost(ui.editStoreId ? viewStores() : viewSettings());
        g.el.classList.add('slide');
      }
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
    if (go) { // Geschäfte-Ansicht: aktuelle Ansicht als Abbild nach rechts wegschieben, darunter liegt schon die vorige
      const top = wrapGhost();
      d.el.style.transform = ''; d.el.classList.remove('slide');
      d.under.remove();
      storesBack();
      wrapAnim('pop', top, d.dx);
      return;
    }
    d.el.style.transform = '';
    d.el.animate([{ transform: `translateX(${d.dx}px)` }, { transform: 'none' }], o).finished.finally(() => { if (d.stores) { d.el.classList.remove('slide'); d.under?.remove(); } });
    if (d.under) { d.under.style.transform = ''; d.under.animate([{ transform: `translateX(${-0.25 * (w - d.dx)}px)` }, { transform: 'translateX(-25%)' }], d.stores ? { ...o, fill: 'forwards' } : o); }
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
    ${S.stores.map((s) => `<button type="button" class="sheetbtn${s.id === S.storeId ? ' on' : ''}" data-act="pickstore" data-id="${s.id}"><span>${esc(s.name)}</span><small>${groupTag(s.g, '')}</small></button>`).join('')}
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
      ${groupSelect('nsGroup', curList()?.g || defaultGroup())}
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
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
function editorSheet() {
  const st = editStore();
  openSheet(`<div class="sheettitle">${esc(st.name)}</div>
    ${S.storeId === st.id ? '' : `<button type="button" class="sheetbtn" data-act="usestore" data-id="${st.id}">In der Liste verwenden</button>`}
    ${groupSelect('stGroup', st.g, 'Gruppe', ` data-id="${st.id}"`)}
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

