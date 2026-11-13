'use strict';
// Gesten: Wischen in Sheets, Foto im Vollbild, Sortieren per Ziehen, Wackelmodus.

// ---------- Wisch-Gesten für Sheets ----------
// Überall auf dem Display: hoch = Details (Kategorie, Bereich) folgen dem Finger und blenden ein, runter = ausblenden, danach schließen.
// Ohne Detailbereich (andere Sheets): runter = schließen.
// Foto im Vollbild: Tippen, ✕ oder nach unten wischen schließt
function viewPhoto(src) {
  let v = $('#viewer');
  if (!v) {
    v = document.createElement('dialog');
    v.id = 'viewer'; v.className = 'viewer';
    document.body.append(v);
    let y0 = null;
    v.addEventListener('click', () => v.close());
    v.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
    v.addEventListener('pointerup', (e) => { if (y0 !== null && e.clientY - y0 > 80) { ui.sheetDragT = Date.now(); v.close(); } y0 = null; });
    v.addEventListener('close', () => { v.innerHTML = ''; });
  }
  v.innerHTML = `<img src="${src}" alt="Foto"><button type="button" class="vx" aria-label="Schließen">×</button>`;
  v.showModal();
}
function bindSheetGestures() {
  const d = dlg();
  let g = null, timer = 0;
  const closeAnimated = () => {
    d.style.transition = 'transform .18s ease'; d.style.transform = 'translateY(100%)';
    setTimeout(() => { closeSheet(); d.style.transition = ''; d.style.transform = ''; }, 180);
  };
  const parts = () => {
    const f = $('#editForm'), more = f?.querySelector('.more'), inner = f?.querySelector('.moreinner');
    return more && inner ? { f, more, inner, img: f.querySelector('.photo img') } : null;
  };
  // Maße: Höhe des Detailbereichs und – falls ein Foto da ist – wie viel höher es voll angezeigt wird
  const metrics = (m) => {
    let h0 = 0, delta = 0;
    if (m.img && m.img.naturalWidth) {
      const r = m.img.getBoundingClientRect(), nat = r.width * m.img.naturalHeight / m.img.naturalWidth, Hm = m.inner.offsetHeight;
      const base = d.scrollHeight - r.height - (m.f.classList.contains('expanded') ? Hm : 0); // Sheet ohne Foto und ohne Details
      const room = innerHeight - 24 - 8 - base - Hm; // so viel Platz bleibt für das Foto, damit nichts abgeschnitten wird
      const full = Math.max(Math.min(nat, room), Math.min(nat, 150));
      h0 = Math.min(nat, 150); delta = Math.max(0, full - h0);
      m.f.style.setProperty('--phfull', `${Math.round(full)}px`);
    }
    return { Hm: m.inner.offsetHeight, h0, delta };
  };
  // Zustand des Detailbereichs setzen: p = 0 (zu) … 1 (offen)
  const setP = (m, mt, p, animate) => {
    const t = animate ? '.22s ease' : 'none';
    m.more.style.transition = animate ? `height ${t}, margin-top ${t}` : 'none';
    m.inner.style.transition = animate ? `opacity ${t}` : 'none';
    m.more.style.height = `${p * mt.Hm}px`;
    if (m.img && mt.delta) { m.img.style.transition = animate ? `height ${t}` : 'none'; m.img.style.maxHeight = 'none'; m.img.style.height = `${mt.h0 + p * mt.delta}px`; }
    m.more.style.marginTop = `${-8 * (1 - p)}px`;
    m.inner.style.opacity = String(p);
  };
  const settle = (m, on) => {
    m.f.classList.toggle('expanded', on);
    m.more.inert = !on;
    ['height', 'marginTop', 'transition', 'opacity'].forEach((k) => { m.more.style[k] = ''; m.inner.style[k] = ''; });
    if (m.img) { m.img.style.height = ''; m.img.style.maxHeight = ''; m.img.style.transition = ''; }
  };
  d.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.scrollbox')) return; // Listen behalten ihr normales Scrollen
    const m = parts();
    if (m && timer) { clearTimeout(timer); timer = 0; if (d._fin) d._fin(); }
    const open = !!m && m.f.classList.contains('expanded');
    const mt = m ? metrics(m) : null, H = mt ? mt.Hm + mt.delta : 0;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, dy: 0, m, mt, open, H, p: open ? 1 : 0, ty: 0, t0: e.timeStamp, y0: e.clientY, vy: 0, lastT: e.timeStamp, lastY: e.clientY, grow: growInfo() };
  });
  d.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(dx)) return;
      g.active = true;
      try { d.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
      d.style.transition = 'none';
      if (g.m) { g.m.more.inert = true; setP(g.m, g.mt, g.p, false); }
      if (document.activeElement?.matches?.('input, textarea, select')) document.activeElement.blur(); // Tastatur weg, damit das Sheet frei gleiten kann
    }
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) { g.vy = (e.clientY - g.lastY) / dt; g.lastT = e.timeStamp; g.lastY = e.clientY; }
    g.dy = dy;
    let p = g.open ? 1 : 0, ty = 0;
    if (g.m && g.H > 0) {
      const base = g.open ? 1 : 0;
      p = Math.min(1, Math.max(0, base - dy / g.H));       // hoch = mehr, runter = weniger
      if (g.open) ty = Math.max(0, dy - g.H);                // Rest nach dem Einklappen schiebt das Sheet nach unten
      else ty = dy > 0 ? dy : -Math.min(Math.max(-dy - g.H, 0), 30) / 3; // ganz oben: leichtes Gummiband
      setP(g.m, g.mt, p, false);
    } else if (g.grow) {
      // Essen-Sheet: hoch = größer (bis „groß“), runter = erst kleiner, dann nach unten weg
      const { h0, hS, hT } = g.grow, want = h0 - dy;
      if (want >= hS) d.style.maxHeight = `${want > hT ? hT + Math.min(30, (want - hT) / 3) : want}px`;
      else { d.style.maxHeight = `${hS}px`; ty = hS - want; }
    } else {
      ty = dy > 0 ? dy : Math.max(dy, -30) / 3;
    }
    g.p = p; g.ty = ty;
    d.style.transform = ty ? `translateY(${ty}px)` : '';
  });
  const end = (e, cancel) => {
    if (!g || e.pointerId !== g.id) return;
    const done = g; g = null;
    if (!done.active) {
      // Tipp auf den Griff oben: Details ein-/ausblenden (Eintrag) bzw. groß/normal (Essen)
      const m = parts(), r = d.getBoundingClientRect();
      if (!cancel && done.grow && Math.abs(e.clientY - done.y) < 6 && e.clientY - r.top < 26 && !e.target.closest?.('button')) {
        ui.sheetDragT = Date.now();
        setTall(!d.classList.contains('tall'), done.grow);
        return;
      }
      if (!cancel && m && Math.abs(e.clientY - done.y) < 6 && Math.abs(e.clientX - done.x) < 6 && e.clientY >= r.top && e.clientY - r.top < 26 && !e.target.closest?.('button')) {
        ui.sheetDragT = Date.now();
        const to = !m.f.classList.contains('expanded'), mt = metrics(m);
        m.more.inert = true; setP(m, mt, to ? 0 : 1, false); void m.more.offsetHeight; setP(m, mt, to ? 1 : 0, true);
        d._fin = () => settle(m, to); timer = setTimeout(() => { timer = 0; d._fin(); }, 230);
      }
      return;
    }
    ui.sheetDragT = Date.now(); // der Klick nach dem Loslassen darf das Sheet nicht schließen
    const flickDown = done.vy > 0.5, flickUp = done.vy < -0.5;
    if (!cancel && done.ty > 70 || (!cancel && done.ty > 20 && flickDown)) {
      if (done.m) settle(done.m, false);
      closeAnimated();
      return;
    }
    if (done.grow) {
      // loslassen: auf „groß“ oder „normal“ einrasten (Schwung zählt mit)
      const h = parseFloat(d.style.maxHeight) || done.grow.h0, { hS, hT } = done.grow;
      const tall = cancel ? d.classList.contains('tall') : flickUp ? true : flickDown ? false : h > (hS + hT) / 2;
      d.style.transition = 'transform .2s ease'; d.style.transform = '';
      setTall(tall, done.grow);
      return;
    }
    d.style.transition = 'transform .2s ease'; d.style.transform = '';
    if (done.m) {
      const up = done.dy < 0;
      let on = done.open;
      if (!cancel) on = up ? (done.p > 0.25 || flickUp) : !(done.p < 0.75 || flickDown);
      setP(done.m, done.mt, on ? 1 : 0, true);
      d._fin = () => settle(done.m, on);
      timer = setTimeout(() => { timer = 0; d._fin(); }, 230);
    }
  };
  d.addEventListener('pointerup', (e) => end(e, false));
  d.addEventListener('pointercancel', (e) => end(e, true));
  // Essen-Sheet: zwei Höhen – normal (60 %) und groß (90 %). Nur wenn die Zutatenliste nicht ganz hineinpasst.
  function growInfo() {
    const list = d.querySelector(':scope > .mings');
    if (matchMedia('(orientation: landscape) and (max-height: 520px)').matches) return null; // quer: Sheet ist schon so hoch wie möglich
    if (!list || (!d.classList.contains('tall') && list.scrollHeight <= list.clientHeight + 2)) return null;
    const vvh = window.visualViewport?.height || innerHeight;
    const sat = Math.max(0, (document.getElementById('topcover')?.offsetHeight || 14) - 14); // Höhe der Statusleiste (#topcover ist 14px höher, siehe style.css)
    const room = vvh - sat - 20;
    const h0 = d.getBoundingClientRect().height;
    const hS = Math.min(innerHeight * 0.6, room), hT = Math.max(hS, Math.min(innerHeight * 0.9, room));
    return { h0, hS, hT: Math.min(hT, h0 + list.scrollHeight - list.clientHeight) }; // nicht größer als nötig
  }
  function setTall(on, gi) {
    const target = on ? gi.hT : gi.hS;
    d.style.transition = reduceMotion() ? 'none' : 'max-height .26s cubic-bezier(.25, .8, .25, 1), transform .2s ease';
    if (!d.style.maxHeight) d.style.maxHeight = `${gi.h0}px`;
    void d.offsetHeight;
    d.style.maxHeight = `${target}px`;
    setTimeout(() => {
      d.classList.toggle('tall', on);
      d.style.maxHeight = ''; d.style.transition = '';
      d.querySelectorAll('.scrollbox').forEach(updateFade);
    }, reduceMotion() ? 0 : 270);
  }
}

// ---------- Sortieren per Ziehen – gemeinsam für Bereiche und Kategorien ----------
// li folgt dem Finger, die anderen Zeilen (passend zu sel) rücken nach. done(neue Reihenfolge der data-key) oder done(null) bei Abbruch.
// scroller: was beim Ziehen an den Rand mitscrollt (window oder eine Seite).
let sortingNow = false;
// Während des Ziehens darf die Seite nicht scrollen (sonst bricht Safari das Ziehen ab)
document.addEventListener('touchmove', (e) => { if ((sortingNow || dragArmed) && e.cancelable) e.preventDefault(); }, { passive: false });
// Reihenfolge der sortierbaren Zeilen (ihre data-key), wie sie gerade im Bild stehen
const slotKeys = (list, sel) => [...list.children].filter((c) => c.matches(sel)).map((c) => c.dataset.key);
function sortDrag(e, handle, li, list, sel, scroller, done) {
  e.preventDefault();
  sortingNow = true;
  const grabOffset = e.clientY - li.getBoundingClientRect().top;
  try { handle.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
  li.classList.add('dragging');
  const place = (y) => {
    li.style.transform = 'none';
    const others = [...list.children].filter((c) => c !== li && c.matches(sel));
    const next = others.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    if (next) { if (li.nextElementSibling !== next) list.insertBefore(li, next); } else if (others.length && others[others.length - 1].nextElementSibling !== li) others[others.length - 1].after(li);
    li.style.transform = `translateY(${y - grabOffset - li.getBoundingClientRect().top}px)`;
  };
  const move = (ev) => {
    place(ev.clientY);
    const top = scroller === window ? 0 : scroller.getBoundingClientRect().top, bottom = scroller === window ? innerHeight : scroller.getBoundingClientRect().bottom;
    if (ev.clientY < top + 90) scroller.scrollBy(0, -14); else if (ev.clientY > bottom - 90) scroller.scrollBy(0, 14);
  };
  const stop = (cancel) => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', cancelFn);
    sortingNow = false;
    li.classList.remove('dragging'); li.style.transform = '';
    done(cancel ? null : slotKeys(list, sel));
  };
  const up = () => stop(false), cancelFn = () => stop(true);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', cancelFn);
  place(e.clientY);
}
// ---------- Wackelmodus (wie auf dem iPhone-Home-Bildschirm) ----------
// Lange drücken auf eine Zeile startet ihn. Danach greift kurzes Halten einer Zeile sie zum Verschieben (sofort wischen scrollt),
// Antippen öffnet nichts. „Fertig“ oder Verlassen der Seite beendet ihn.
//   cats  = Kategorien (Reihenfolge der Liste ohne Geschäft; „Sonstiges“ bleibt immer unten)
//   zones = Bereiche eines Geschäfts (Laufweg)
const WIGGLE = {
  cats: {
    list: '#catRows', row: '.catrow:not([data-key="sonst"])', scroller: (l) => l.closest('.page') || window,
    done(order) { CATS.sort((a, b) => (a.id === 'sonst') - (b.id === 'sonst') || order.indexOf(a.id) - order.indexOf(b.id)); indexCats(); commit(); catListPage(); },
  },
  zones: {
    list: '.zlist', row: '.zli', scroller: () => window,
    done(order) { const st = editStore(); if (!st) return; st.zones.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); ui.justDrew = Date.now(); commit(); },
  },
  // Einträge einer einfachen Liste: eigene Reihenfolge, auch in einen anderen Abschnitt ziehen.
  // Die Abschnitts-Köpfe (data-key „§id“) stehen mit in der Reihe und zählen als Plätze, werden aber nicht selbst gezogen.
  items: {
    list: '#listRows', row: '.row', slots: '.row, .secli', scroller: () => window,
    done(order) {
      if (!isSimple()) { shopDrop(order); return; }
      let sec = '', n = 0;
      for (const k of order) {
        if (k.startsWith('§')) { sec = k.slice(1); continue; }
        const it = S.items.find((i) => i.id === k);
        if (!it) continue;
        if (sec) it.sec = sec; else delete it.sec;
        it.ord = n++;
      }
      commit();
    },
  },
};
function wiggleBar(float) { return '<div class="wigglebar' + (float ? ' floatbar' : '') + '"><span>Ziehen zum Sortieren</span><button type="button" class="btn small" data-act="wiggleoff">Fertig</button></div>'; }
function dragRow(e, kind, row) {
  const w = WIGGLE[kind], list = row.closest(w.list), sel = w.slots || w.row;
  const before = slotKeys(list, sel).join();
  sortDrag(e, row, row, list, sel, w.scroller(list), (order) => { if (order && order.join() !== before) w.done(order); });
}
function startWiggle(e, el) {
  const kind = el.closest('#catRows') ? 'cats' : 'zones', w = WIGGLE[kind], row = el.closest(w.row);
  if (!row) return; // „Sonstiges“ lässt sich nicht verschieben
  ui.wiggle = kind;
  const list = row.closest(w.list);
  list.classList.add('wiggle');
  list.parentElement.querySelector('.zpanelli')?.remove(); // offenes Bereichs-Panel stört beim Sortieren
  if (!list.previousElementSibling?.classList.contains('wigglebar')) list.insertAdjacentHTML('beforebegin', wiggleBar());
  // Nur den Modus starten: verschoben wird erst, wenn danach eine Zeile kurz gehalten wird
}
function endWiggle() {
  if (!ui.wiggle) return;
  ui.wiggle = null;
  if (pageTop() === 'cats') catListPage(); else render();
}
// Im Wackelmodus: kurz halten (0,18 s, Finger ruhig) = Zeile greifen, sofort wischen = normal scrollen
let wHold = null;
document.addEventListener('pointerdown', (e) => {
  if (!ui.wiggle || !e.isPrimary) return;
  const row = e.target.closest?.(`.wiggle ${WIGGLE[ui.wiggle].row}`);
  if (!row) return;
  const kind = ui.wiggle;
  clearTimeout(wHold?.t);
  wHold = { id: e.pointerId, x: e.clientX, y: e.clientY, t: setTimeout(() => { wHold = null; if (ui.wiggle === kind) dragRow(e, kind, row); }, 180) };
}, true);
document.addEventListener('pointermove', (e) => {
  if (wHold && e.pointerId === wHold.id && Math.hypot(e.clientX - wHold.x, e.clientY - wHold.y) > 8) { clearTimeout(wHold.t); wHold = null; } // bewegt: scrollen
}, true);
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, (e) => { if (wHold && e.pointerId === wHold.id) { clearTimeout(wHold.t); wHold = null; } }, true));
// Im Wackelmodus öffnet Antippen einer Zeile nichts
document.addEventListener('click', (e) => { if (ui.wiggle && e.target.closest?.('.wiggle')) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

