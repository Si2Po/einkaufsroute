'use strict';
// Oberfläche (Grundgerüst): Sheets, Unterseiten, Zurück-Wischen, Tastatur, Hinweise (toast).

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
    // showModal() fokussiert das erste Feld oder den ersten Knopf. Auf dem iPhone ginge dann die Tastatur auf bzw. Safari zeigt
    // den Knopf als markiert an (z. B. den Stern im Essen). Nur Felder mit autofocus behalten den Fokus.
    const a = document.activeElement;
    if (a && d.contains(a) && !a.hasAttribute('autofocus')) a.blur();
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

