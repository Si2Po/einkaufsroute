'use strict';
// Ansichten: Sortierung nach Laufweg, Liste, Geschäfte, Grundriss, render(), untere Leiste, Einstellungen.

// ---------- Sortierung: Item -> (festgelegtes Produkt | Kategorie) -> Zone im gewählten Laden -> Laufreihenfolge ----------
function zoneIndexFor(store, it) {
  const pinned = pinIdx(store, it.name);
  return pinned >= 0 ? pinned : defaultZoneIdx(store, it.cat);
}
// Welcher Bereich nimmt Produkte einer Kategorie ohne festen Bereich? Der als Standard gewählte, sonst der erste in der Route.
const sharedCats = (st, z) => z.cats.filter((c) => CAT_BY_ID[c] && st.zones.some((o) => o !== z && o.cats.includes(c)));
const isStdZone = (st, z) => { const sh = sharedCats(st, z); return sh.length > 0 && sh.every((c) => st.zones[defaultZoneIdx(st, c)] === z); };
function defaultZoneIdx(store, cat) {
  const m = store.main && store.main[cat];
  const mi = m ? store.zones.findIndex((z) => z.id === m && z.cats.includes(cat)) : -1;
  return mi >= 0 ? mi : store.zones.findIndex((z) => z.cats.includes(cat));
}
function buildGroups(store) {
  const groups = new Map();
  for (const it of S.items.filter((i) => !i.done)) {
    let g;
    if (store) {
      const zi = zoneIndexFor(store, it);
      g = zi >= 0
        ? { key: 'z' + zi, order: zi, label: store.zones[zi].name, num: zi + 1 }
        : { key: 'n' + it.cat, order: 999 + (CAT_INDEX[it.cat] ?? 99), label: CAT_BY_ID[it.cat]?.name || 'Sonstiges', num: null, free: it.cat };
    } else {
      const ci = CAT_INDEX[it.cat] ?? CAT_INDEX.sonst;
      g = { key: 'c' + ci, order: ci, label: CAT_BY_ID[it.cat]?.name || 'Sonstiges', num: null };
    }
    if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [] });
    groups.get(g.key).items.push(it);
  }
  const list = [...groups.values()].sort((a, b) => a.order - b.order);
  list.forEach((g) => g.items.sort(byOrder));
  return list;
}

// ---------- Ansichten ----------
const ICON_DOTS = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>';
const ICON_GRAB = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

const MEAL_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 3v8M4.5 3v5.2a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.4 1.2-3.5 4-3.5 7.5 0 1.7.9 2.5 2 2.5h1.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
function rowHtml(i) {
  const pend = ui.pending.has(i.id), on = i.done || pend;
  return `<li class="row${on ? ' done' : ''}${pend ? ' pending' : ''}" role="checkbox" aria-checked="${on}" tabindex="0" data-act="toggle" data-id="${i.id}" data-key="${i.id}">
    <span class="chk" aria-hidden="true"></span>
    <span class="txt"><span class="nm">${esc(i.name)}</span>${i.note ? `<span class="nt">${esc(i.note)}</span>` : ''}${i.meals?.length ? `<span class="nt ml">${MEAL_ICON}${esc(i.meals.join(', '))}</span>` : ''}</span>
    ${i.photo ? `<img class="thumb" src="${i.photo}" alt="">` : ''}
    ${i.qty ? `<span class="qty">${esc(i.qty)}</span>` : ''}
  </li>`;
}

function listBody() {
  if (isSimple()) return simpleBody();
  const groups = buildGroups(curStore());
  const done = S.items.filter((i) => i.done);
  // Eine einzige Reihe (Köpfe + Einträge, Optik wie Karten je Gruppe), damit Einträge per Halten und Ziehen
  // umsortiert und in eine andere Kategorie / einen anderen Bereich gezogen werden können (WIGGLE.items).
  const body = groups.length
    ? `<ul class="srows${ui.wiggle === 'items' ? ' wiggle' : ''}" id="listRows">${groups.map((g) => (g.free
        ? `<li class="grp secli grpbtn" role="button" tabindex="0" data-act="assigncat" data-cat="${g.free}" data-key="§${g.key}"><span class="gname">${esc(g.label)}</span><span class="nozone">Bereich wählen ›</span><span class="cnt">${g.items.length}</span></li>`
        : `<li class="grp secli" data-key="§${g.key}"><span class="gname">${esc(g.label)}</span><span class="cnt">${g.items.length}</span></li>`)
        + g.items.map(rowHtml).join('')).join('')}</ul>${ui.wiggle === 'items' ? wiggleBar(true) : ''}`
    : `<p class="empty">${S.items.length ? 'Alles erledigt.' : 'Die Liste ist leer.'}</p>`;
  if (ui.wiggle === 'items' && groups.length) return body;
  return body + doneBlock(done) + listTip('verschieben');
}
// „Erledigt (n)“ zum Aufklappen, darunter die abgehakten Einträge (Einkaufsliste und einfache Liste)
function doneBlock(done) {
  if (!done.length) return '';
  return `<div class="donehead"><button type="button" class="link donetoggle" data-act="showdone" aria-expanded="${ui.showDone}">Erledigt (${done.length}) ${ui.showDone ? '▴' : '▾'}</button>${ui.showDone ? '<button type="button" class="link clearbtn" data-act="cleardone">Erledigte entfernen</button>' : ''}</div>
       ${ui.showDone ? `<ul class="rows">${done.map(rowHtml).join('')}</ul>` : ''}`;
}
// Bedienhinweis unter der Liste, bis zum ersten Bearbeiten (S.tipSeen)
const listTip = (dragWord) => (S.items.length && !S.tipSeen ? `<p class="tip">Tippen: abhaken · Gedrückt halten: bearbeiten · Halten und ziehen: ${dragWord}</p>` : '');
const pillName = () => curStore()?.name || 'Kein Geschäft';

const barHtml = () => `
      <button type="button" class="pill" data-act="storesheet" aria-haspopup="dialog" aria-label="Geschäft wählen"><span id="pillName">${esc(pillName())}</span></button>`;
function viewList() {
  return `<div class="bar"${isSimple() ? ' hidden' : ''}>${barHtml()}    </div>
    <div class="addwrap">
      <form id="addForm" class="add" autocomplete="off">
        <input id="addName" placeholder="${esc(addPlaceholder())}" aria-label="Neuer Eintrag" enterkeyhint="done">
        <button type="submit" class="plus" aria-label="Hinzufügen">${ICON_PLUS}</button>
      </form>
      <div id="sugg" class="sugg" role="listbox" aria-label="Vorschläge" hidden></div>
    </div>
    <div id="listBody">${listBody()}</div>`;
}

function viewStores() {
  const cards = S.stores.map((s) => `<li><button type="button" class="card" data-act="openstore" data-id="${s.id}">
      <span><strong>${esc(s.name)}</strong><small>${groupTag(s.g)}${s.zones.length} ${s.zones.length === 1 ? 'Bereich' : 'Bereiche'}${s.id === S.storeId ? ' · aktiv' : ''}</small></span>
      <span class="go">›</span></button></li>`).join('');
  return `${pageHead('Einstellungen', 'Geschäfte', 'data-act="tab" data-tab="settings"')}
    <p class="hint">Lege für jeden Supermarkt einen Grundriss an. Die Liste sortiert sich dann nach dem Laufweg dort.</p>
    ${S.stores.length ? `<ul class="cards">${cards}</ul>` : ''}
    <button type="button" class="btn" style="margin-top:10px" data-act="newstoresheet">+ Neues Geschäft</button>`;
}

// ---------- Plan: endlose Fläche mit Raster ----------
// Der Plan ist ein Sichtfenster (ui.view = Mitte + Breite in Plan-Einheiten) auf eine unendliche Fläche.
// Bereiche liegen in Plan-Einheiten (x, y, w, h) und rasten auf das sichtbare Raster ein.
const VIEW_RATIO = 0.8; // Höhe / Breite des Fensters
const GRID_STEPS = [25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800];
const gridStep = (vw) => GRID_STEPS.find((s) => s >= vw * 14 / 340) || 12800; // Rasterlinien nie dichter als ca. 14 px
const viewBox = () => { const v = ui.view, h = v.vw * VIEW_RATIO; return { x: v.cx - v.vw / 2, y: v.cy - h / 2, w: v.vw, h }; };
const vbStr = () => { const b = viewBox(); return `${b.x} ${b.y} ${b.w} ${b.h}`; };
const normRect = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });

function fitView(st) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, w, h) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
  if (st.bg) add(0, 0, 1000, st.h || 640);
  st.zones.forEach((z) => { if (z.rect) add(z.rect.x, z.rect.y, z.rect.w, z.rect.h); });
  if (x0 === Infinity) { x0 = 0; y0 = 0; x1 = 1000; y1 = 640; }
  const bw = x1 - x0, bh = y1 - y0;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, vw: Math.max(400, bw * 1.12, bh * 1.12 / VIEW_RATIO) };
}

// Beschriftung eines Bereichs: überall gleiche Schriftgröße, die mit dem Zoom wächst; Namen brechen nach Pixelbreite um.
// Zuerst daneben (neben der Nummer), sonst darunter; reicht der Platz nicht, schrumpft die Schrift etwas, zuletzt wird gekürzt.
const _mc = document.createElement('canvas').getContext('2d'), _mw = new Map();
function textW(t, px) { // Breite von fettem Text in px, gemessen bei 100px und hochgerechnet
  let v = _mw.get(t);
  if (v === undefined) { _mc.font = `600 100px ${getComputedStyle(document.body).fontFamily}`; v = _mc.measureText(t).width / 100; _mw.set(t, v); }
  return v * px;
}
function wrapPx(text, maxW, px) { // null, wenn ein einzelnes Wort breiter als maxW ist
  const lines = [];
  let cur = '';
  for (const wd of text.split(/\s+/).filter(Boolean)) {
    if (textW(wd, px) > maxW) return null;
    const t = cur ? cur + ' ' + wd : wd;
    if (!cur || textW(t, px) <= maxW) cur = t; else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function zoneLabel(z, i, hue, w, h, sx) {
  const base = Math.max(10, Math.min(24, 11 * 1000 / (sx * 340))); // Schriftgröße in Bildschirm-Pixeln, wächst beim Hineinzoomen
  const wpx = w / sx, hpx = h / sx;
  let best = null;
  for (let fpx = base; fpx >= Math.max(8, base * 0.75) && !best; fpx -= 0.5) {
    const lh = fpx * 1.2, rad = fpx * 0.7, pad = 4;
    // A: Text neben der Nummer
    const la = wrapPx(z.name, wpx - pad * 3 - rad * 2, fpx);
    if (la && la.length * lh <= hpx - pad) best = { mode: 'A', lines: la, fpx, rad, pad, lh };
    else {
      // B: Text unter der Nummer, volle Breite
      const lb = wrapPx(z.name, wpx - pad * 2, fpx);
      if (lb && pad + rad * 2 + 2 + lb.length * lh <= hpx) best = { mode: 'B', lines: lb, fpx, rad, pad, lh };
    }
  }
  if (!best) { // zu klein: Nummer, plus so viel Text wie passt
    const fpx = Math.max(8, base * 0.75), lh = fpx * 1.2, rad = fpx * 0.7, pad = 4;
    const room = Math.floor((hpx - (pad + rad * 2 + 2)) / lh);
    let lines = [];
    if (room >= 1) {
      let t = z.name;
      while (t.length > 1 && textW(t + '…', fpx) > wpx - pad * 2) t = t.slice(0, -1);
      lines = [t.length < z.name.length ? t.trimEnd() + '…' : t];
    }
    best = { mode: 'B', lines, fpx, rad, pad, lh };
  }
  const { mode, lines, fpx, rad, pad, lh } = best, k = sx;
  const f = fpx * k, r = rad * k, p = pad * k, L = lh * k;
  const bx = p + r, by = p + r, tx = mode === 'A' ? p * 2 + r * 2 : p;
  const ty = mode === 'A' ? by + f * 0.35 : p + r * 2 + 2 * k + f * 0.9;
  const text = lines.length ? `<text x="${tx}" y="${ty}" class="zl" font-size="${f}" style="stroke-width:${f * 0.2}px">${lines.map((l, n) => `<tspan x="${tx}" dy="${n ? L : 0}">${esc(l)}</tspan>`).join('')}</text>` : '';
  return `<svg x="${z.rect.x}" y="${z.rect.y}" width="${w}" height="${h}"><circle cx="${bx}" cy="${by}" r="${r}" fill="hsl(${hue} 65% 30%)"/>
      <text x="${bx}" y="${by + f * 0.03}" class="num" font-size="${f * 0.8}">${i + 1}</text>${text}</svg>`;
}
function planInner(st) {
  const b = viewBox(), u = b.w / 1000, sx = b.w / 340, step = gridStep(b.w);
  const bg = st.bg ? `<image href="${st.bg}" x="0" y="0" width="1000" height="${st.h || 640}" preserveAspectRatio="none"/>` : '';
  const grid = `<defs><pattern id="grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M${step} 0H0V${step}" class="gridline" stroke-width="${(1.2 * sx).toFixed(2)}"/></pattern></defs>
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" class="floor"/>${bg}<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#grid)"/>`;
  const zones = st.zones.map((z, i) => {
    if (!z.rect) return '';
    const hue = HUES[i % HUES.length], sel = z.id === ui.selZone, { x, y, w, h } = z.rect;
    const sw = ((sel ? 3.5 : 2) * sx).toFixed(2), dash = sel ? ` stroke-dasharray="${(7 * sx).toFixed(1)} ${(5 * sx).toFixed(1)}"` : '';
    return `<g class="zone" data-act="selzone" data-id="${z.id}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(5 * sx).toFixed(1)}" fill="hsl(${hue} 65% 50% / .30)" stroke="hsl(${hue} 65% ${sel ? 28 : 38}%)" stroke-width="${sw}"${dash}/>
      ${zoneLabel(z, i, hue, w, h, sx)}</g>`;
  }).join('');
  let handles = '';
  const sz = ui.drawing ? st.zones.find((z) => z.id === ui.selZone) : null;
  if (sz?.rect) {
    // Griffe passen sich der Größe an: bei kleinen Bereichen kleiner, Seitengriffe nur wenn die Kante lang genug ist
    const { x, y, w, h } = sz.rect, wpx = w / sx, hpx = h / sx, rpx = Math.max(3, Math.min(9, Math.min(wpx, hpx) * 0.14)), r = rpx * sx;
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    if (wpx >= 64) pts.push([x + w / 2, y], [x + w / 2, y + h]);
    if (hpx >= 64) pts.push([x + w, y + h / 2], [x, y + h / 2]);
    handles = pts.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" class="handle" stroke-width="${(Math.min(2, rpx / 3) * sx).toFixed(2)}"/>`).join('');
  }
  return grid + zones + handles;
}

const ICON_FIT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function planHtml(st) {
  return `<div class="plan" id="plan"><svg id="planSvg" class="${ui.drawing ? 'drawing' : ''}" viewBox="${vbStr()}" role="img" aria-label="Grundriss von ${esc(st.name)}">${planInner(st)}</svg>
    <div class="zoombar"><button type="button" data-act="zoomin" aria-label="Vergrößern">+</button><button type="button" data-act="zoomout" aria-label="Verkleinern">−</button><button type="button" data-act="fit" aria-label="Alles anzeigen">${ICON_FIT}</button></div></div>`;
}
function updatePlan() {
  const st = editStore(), svg = $('#planSvg');
  if (!st || !svg) return;
  svg.setAttribute('viewBox', vbStr());
  svg.innerHTML = planInner(st);
}

function viewEditor() {
  const st = editStore();
  if (!st) { ui.editStoreId = null; return viewStores(); }
  const sel = st.zones.find((z) => z.id === ui.selZone);
  const selIdx = sel ? st.zones.indexOf(sel) : -1;
  const catNames = (z) => z.cats.filter((c) => CAT_BY_ID[c]).map((c) => {
    const shared = st.zones.some((o) => o !== z && o.cats.includes(c));
    return (shared && st.zones[defaultZoneIdx(st, c)] === z ? '★ ' : '') + CAT_BY_ID[c].name;
  }).join(', ') || 'keine Kategorie';
  const zlist = st.zones.map((z, i) => `<li class="zli" data-zid="${z.id}" data-key="${z.id}"><button type="button" class="zitem" data-act="selzone" data-id="${z.id}" aria-pressed="${z.id === ui.selZone}">
      <span class="badge">${i + 1}</span><span class="zn"><strong>${esc(z.name)}</strong><small>${esc(catNames(z))}${z.rect || !S.showPlan ? '' : ' · nicht eingezeichnet'}</small></span></button>
      </li>${z.id === ui.selZone ? '<!--PANEL-->' : ''}`).join('');
  let panel = '';
  if (sel) {
    const sum = (arr) => (arr.length ? esc(arr.slice(0, 2).join(', ')) + (arr.length > 2 ? ` +${arr.length - 2}` : '') : '–');
    panel = `<div class="zpanel">
      <input id="zName" value="${esc(sel.name)}" aria-label="Name von Bereich ${selIdx + 1}">
      <div class="prowwrap"><button type="button" class="prow" data-act="catsheet"><span class="pl">Kategorien</span><span class="pv">${sum(sel.cats.map((c) => CAT_BY_ID[c]?.name).filter(Boolean))}</span></button>${sharedCats(st, sel).length ? `<button type="button" class="star${isStdZone(st, sel) ? ' on' : ''}" data-act="setstd" aria-pressed="${isStdZone(st, sel)}" aria-label="Standard-Bereich für seine Kategorien">${isStdZone(st, sel) ? '★' : '☆'}</button>` : ''}</div>
      <button type="button" class="prow" data-act="prodsheet"><span class="pl">Produkte</span><span class="pv">${sum(Object.values(sel.prods || {}))}</span></button>
      <div class="actions">
        <button type="button" class="btn ghost small" data-act="zup" aria-label="Früher in der Route"${selIdx === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" class="btn ghost small" data-act="zdown" aria-label="Später in der Route"${selIdx === st.zones.length - 1 ? ' disabled' : ''}>↓</button>
        ${S.showPlan ? `<button type="button" class="btn ghost small" data-act="zdraw" style="flex:1">${sel.rect ? 'Form ändern' : 'Einzeichnen'}</button>` : ''}
        <button type="button" class="btn danger small"${S.showPlan ? '' : ' style="flex:1"'} data-act="zdel">Löschen</button>
      </div></div>`;
  }
  if (!ui.view) ui.view = fitView(st);
  if (!S.showPlan) ui.drawing = false;
  const bar = ui.drawing && sel
    ? `<p class="hint live">Ziehen = neu · Kante/Ecke = anpassen · Mitte = schieben · Daneben tippen = fertig</p>`
    : `<p class="hint">${S.showPlan ? (st.zones.length ? 'Antippen: bearbeiten · Gedrückt halten: im Plan Form ändern, in der Liste sortieren' : 'Lege Bereiche an, zeichne sie ein und wähle ihre Kategorien.') : (st.zones.length ? 'Reihenfolge = Laufweg. Lange drücken zum Sortieren.' : 'Lege Bereiche in der Reihenfolge deines Laufwegs an und wähle ihre Kategorien.')}</p><button type="button" class="btn small" data-act="addzone">+ Bereich</button>`;
  return `
    <div class="edhead">
      <button type="button" class="pageback" data-act="back" aria-label="Zurück zu Geschäfte">${ICON_BACK}<span>Geschäfte</span></button>
      <input id="storeName" value="${esc(st.name)}" aria-label="Name des Geschäfts">
      <button type="button" class="iconbtn" data-act="editormenu" aria-haspopup="dialog" aria-label="Menü">${ICON_DOTS}</button>
    </div>
    <button type="button" class="prow plantoggle${S.showPlan ? ' open' : ''}" data-act="togplan" aria-expanded="${!!S.showPlan}"><span class="pl">Grundriss</span><span class="pv">${S.showPlan ? 'Bereiche einzeichnen' : 'optional, zum Einzeichnen'}</span></button>
    ${S.showPlan ? `${planHtml(st)}
    <div class="bgrow">
      <label for="bgFile" class="bgadd" title="Foto oder Skizze als Vorlage hinter den Grundriss legen">${ICON_CAM}<span>${st.bg ? 'Grundrissskizze ersetzen' : 'Grundrissskizze hinzufügen'}</span></label><input type="file" id="bgFile" accept="image/*" hidden>
      ${st.bg ? '<button type="button" class="chipbtn" data-act="clearbg" aria-label="Skizze entfernen">×</button>' : ''}
    </div>` : ''}
    <div class="planbar">${bar}</div>
    ${ui.wiggle === 'zones' ? wiggleBar() : ''}
    <ul class="zlist${ui.wiggle === 'zones' ? ' wiggle' : ''}">${zlist.replace('<!--PANEL-->', panel && ui.wiggle !== 'zones' ? `<li class="zpanelli">${panel}</li>` : '')}</ul>`;
}

function render() {
  const v = $('#view');
  if (ui.tab === 'list') {
    if ($('#addForm')) { $('#listBody').innerHTML = listBody(); const b = $('.bar'); b.innerHTML = barHtml(); b.hidden = isSimple(); $('#addName').placeholder = addPlaceholder(); }
    else v.innerHTML = viewList();
  } else if (ui.tab === 'meals') {
    v.innerHTML = viewMeals();
  } else if (ui.tab === 'settings') {
    v.innerHTML = viewSettings();
  } else {
    v.innerHTML = ui.editStoreId ? viewEditor() : viewStores();
    if (ui.editStoreId) { if (S.showPlan) bindPlan(); else planAbort?.abort(); }
  }
  renderTabs();
  refreshTopPage();
}
// Untere Leiste: Liste | Essen | Einstellungen (Läden und ihr Editor gehören zu Einstellungen)
const TAB_ICONS = {
  list: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M3.8 6l1.2 1.2L7 5M3.8 12l1.2 1.2L7 11M3.8 18l1.2 1.2L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  meals: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M7 3v8M4.5 3v5.2a2.5 2.5 0 0 0 5 0V3M7 11v10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M17 21V3c-2.4 1.2-3.5 4-3.5 7.5 0 1.7.9 2.5 2 2.5h1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="15" cy="7" r="2.2" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="9" cy="17" r="2.2" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
};
function renderTabs() {
  const nav = $('#tabbar');
  if (!nav) return;
  const cur = ui.tab === 'stores' ? 'settings' : ui.tab;
  const listLabel = (S.lists.length > 1 ? curList().name : 'Liste') + (cur === 'list' ? ' ▾' : ''); // Name der aktiven Liste; zweiter Tipp öffnet die Auswahl
  nav.innerHTML = [['list', listLabel], ['meals', 'Essen'], ['settings', 'Einstellungen']].map(([t, label]) =>
    `<button type="button" data-act="tab" data-tab="${t}"${cur === t ? ' aria-current="page"' : ''}${t === 'list' ? ' aria-haspopup="dialog"' : ''}>${TAB_ICONS[t]}<span>${esc(label)}</span></button>`).join('');
}
function viewSettings() {
  if (!appVersion && !IS_LOCAL) setTimeout(loadVersion, 0); // Nummer noch leer: nochmal nachfragen
  const row = (act, title, sub, extra = '') => `<li><button type="button" class="card" data-act="${act}"${extra}><span><strong>${title}</strong><small>${sub}</small></span><span class="go">›</span></button></li>`;
  return `<div class="edhead"><h2>Einstellungen</h2></div>
    <ul class="cards">
      ${row('accountsheet', 'Konto und Gruppen', typeof accountSub === 'function' ? accountSub() : 'Nicht angemeldet')}
      ${row('listspage', 'Listen', esc(S.lists.map((l) => l.name).join(', ')))}
      ${row('tab', 'Geschäfte und Grundrisse', `${S.stores.length} ${S.stores.length === 1 ? 'Geschäft' : 'Geschäfte'}`, ' data-tab="stores"')}
      ${row('swipesheet', 'Wischen', 'Aktionen für Einträge und Essen')}
      ${row('themepage', 'Darstellung', `${THEME_LABEL[themePref()]} · ${accentName()}`)}
      ${row('catlist', 'Kategorien und Stichwörter', `${CATS.length} Kategorien`)}
    </ul>
    ${appVersion ? `<p class="tip">Version ${esc(appVersion)}</p>` : ''}`;
}
// Versionsnummer: steht nur an einer Stelle, im Namen des Caches in sw.js ("einkaufsroute-v0.6.1").
// Die App liest sie aus dem Cache, aus dem sie gerade läuft.
let appVersion = '';
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
if (IS_LOCAL) {
  // Lokal gibt es keinen Cache: Nummer direkt aus sw.js lesen
  fetch('sw.js').then((r) => r.text()).then((t) => {
    const m = t.match(/einkaufsroute-v([\w.]+)/);
    if (!m) return;
    appVersion = `${m[1]} · lokal`;
    // Uhrzeit der zuletzt gespeicherten Datei anhängen: so sieht man, ob das Neuladen schon den neuesten Stand hat
    const files = ['index.html', 'app.js', 'sync.js', 'style.css', 'sw.js'];
    return Promise.all(files.map((f) => fetch(f, { cache: 'no-store' }).then((r) => Date.parse(r.headers.get('Last-Modified')) || 0, () => 0)))
      .then((ts) => { const t = Math.max(...ts); if (t) appVersion += `, Stand ${new Date(t).toLocaleTimeString('de-DE')}`; });
  }).then(() => { if (ui.tab === 'settings') render(); }).catch(() => {});
} else {
  loadVersion();
}
// Online: den Service Worker fragen, der die App gerade ausliefert. Ersatzweise den Namen des Caches lesen.
function loadVersion() {
  const set = (name) => {
    const v = String(name || '').replace(/^einkaufsroute-v/, '');
    if (!v || v === appVersion) return;
    appVersion = v;
    if (ui.tab === 'settings' && !pages.length) render();
  };
  // 1. Weg: sw.js selbst lesen (liegt im Offline-Speicher in der Fassung der laufenden Version)
  fetch('sw.js').then((r) => r.text()).then((t) => set((t.match(/einkaufsroute-v[\w.]+/) || [])[0])).catch(() => {});
  // 2. und 3. Weg als Ersatz: Service Worker fragen, Namen des Caches lesen
  const sw = navigator.serviceWorker;
  if (sw) {
    if (!loadVersion.on) { loadVersion.on = true; sw.addEventListener('message', (e) => { if (e.data?.version) set(e.data.version); }); }
    sw.ready.then((reg) => (sw.controller || reg.active)?.postMessage('version')).catch(() => {});
  }
  window.caches?.keys().then((keys) => set(keys.filter((n) => n.startsWith('einkaufsroute-v')).pop())).catch(() => {});
}

