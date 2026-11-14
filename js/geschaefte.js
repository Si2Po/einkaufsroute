'use strict';
// Geschäfte: Übersicht, Grundriss (zeichnen und bedienen), Bereiche, Sheets zu Geschäft/Bereich/Kategorie-Zuordnung.

function viewStores() {
  const cards = S.stores.map((s) => `<li><button type="button" class="card" data-act="openstore" data-id="${s.id}">
      <span><strong>${esc(s.name)}</strong><small>${groupTag(s.g)}${s.zones.length} ${s.zones.length === 1 ? 'Bereich' : 'Bereiche'}${s.id === S.storeId ? ' · aktiv' : ''}</small></span>
      <span class="go">›</span></button></li>`).join('');
  return `${pageHead('Einstellungen', 'Geschäfte', 'data-act="tab" data-tab="settings"')}
    <div class="group" style="margin-bottom:10px"><label class="sheetbtn swrow"><span>In der Liste verwenden<small>Sortiert die Einkaufsliste nach dem Laufweg im Geschäft. Gilt nur für dieses Gerät.</small></span><input type="checkbox" switch id="storesSwitch"${storesOn() ? ' checked' : ''}></label></div>
    ${introCard('stores') || '<p class="hint">Lege für jeden Supermarkt einen Grundriss an. Die Liste sortiert sich dann nach dem Laufweg dort.</p>'}
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
    : `<p class="hint${st.zones.length ? ' bedien' : ''}">${S.showPlan ? (st.zones.length ? 'Antippen: bearbeiten · Gedrückt halten: im Plan Form ändern, in der Liste sortieren' : 'Lege Bereiche an, zeichne sie ein und wähle ihre Kategorien.') : (st.zones.length ? 'Reihenfolge = Laufweg. Lange drücken zum Sortieren.' : 'Lege Bereiche in der Reihenfolge deines Laufwegs an und wähle ihre Kategorien.')}</p><button type="button" class="btn small" data-act="addzone">+ Bereich</button>`;
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

function storesBack() {
  ui.wiggle = null;
  if (ui.editStoreId) { ui.editStoreId = null; ui.selZone = null; ui.drawing = false; }
  else ui.tab = 'settings';
  render(); window.scrollTo(0, 0);
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
function newStoreSheet() {
  openSheet(`<div class="sheettitle">Neues Geschäft</div>
    <form id="newStoreForm" autocomplete="off">
      <input id="newStoreName" autofocus class="notein" placeholder="Name, z. B. Rewe Hauptstraße" aria-label="Name des Geschäfts" required>
      ${S.stores.length ? `<label class="srow"><span class="pl">Vorlage</span><select id="nsTemplate" aria-label="Bereiche übernehmen von"><option value="">Leer beginnen</option>${S.stores.map((x) => `<option value="${x.id}">Kopie von ${esc(x.name)}</option>`).join('')}</select></label>` : ''}
      ${groupSelect('nsGroup', curList()?.g || defaultGroup())}
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
function editorSheet() {
  const st = editStore();
  openSheet(`<div class="sheettitle">${esc(st.name)}</div>
    ${S.storeId === st.id ? '' : `<button type="button" class="sheetbtn" data-act="usestore" data-id="${st.id}">In der Liste verwenden</button>`}
    ${groupSelect('stGroup', st.g, 'Gruppe', ` data-id="${st.id}"`)}
    <button type="button" class="sheetbtn danger" data-act="delstore">${ui.confirmDel ? 'Wirklich löschen?' : 'Geschäft löschen'}</button>`);
}
function zoneField(it) {
  const st = listStore();
  if (!st || !st.zones.length) return '';
  const pinned = pinIdx(st, it.name);
  return `<label class="srow"><span class="pl">Bereich</span><select id="eZone" aria-label="Bereich bei ${esc(st.name)}">
    <option value="">–</option>
    ${st.zones.map((z, i) => `<option value="${z.id}"${i === pinned ? ' selected' : ''}>${i + 1} · ${esc(z.name)}</option>`).join('')}
  </select></label>`;
}

// ---------- Plan bedienen: zeichnen, Kanten ziehen, schieben, zoomen ----------
let planAbort = null;
function bindPlan() {
  const svg = $('#planSvg');
  if (!svg) return;
  planAbort?.abort();
  planAbort = new AbortController();
  const NS = 'http://www.w3.org/2000/svg';
  const ptrs = new Map();
  let g = null, ghost = null;
  const rectPx = () => svg.getBoundingClientRect();
  const world = (cx, cy) => { const r = rectPx(), b = viewBox(); return { x: b.x + (cx - r.left) / r.width * b.w, y: b.y + (cy - r.top) / r.height * b.h }; };
  const snap = (v) => { const st = gridStep(ui.view.vw); return Math.round(v / st) * st; };
  const clearGhost = () => { ghost?.remove(); ghost = null; };
  const showGhost = (r) => {
    if (!r) { clearGhost(); return; }
    const sx = ui.view.vw / 340;
    if (!ghost) {
      ghost = document.createElementNS(NS, 'rect');
      ghost.setAttribute('fill', 'none');
      ghost.style.stroke = 'var(--accent)';
      svg.appendChild(ghost);
    }
    ghost.setAttribute('stroke-width', 3 * sx); ghost.setAttribute('stroke-dasharray', `${7 * sx} ${5 * sx}`);
    ghost.setAttribute('x', r.x); ghost.setAttribute('y', r.y); ghost.setAttribute('width', r.w); ghost.setAttribute('height', r.h);
  };
  // Zoomen, so dass der Plan-Punkt "anchor" unter dem Finger (mx,my) bleibt
  const setAnchored = (anchor, mx, my, vw) => {
    const r = rectPx(); vw = clamp(vw, 120, 40000);
    const vh = vw * VIEW_RATIO;
    ui.view.vw = vw;
    ui.view.cx = anchor.x - (mx - r.left) / r.width * vw + vw / 2;
    ui.view.cy = anchor.y - (my - r.top) / r.height * vh + vh / 2;
  };
  const mid = () => { const a = [...ptrs.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 }; };

  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { // zwei Finger: Ansicht verschieben und zoomen
      clearGhost();
      const m = mid();
      g = { mode: 'pinch', d0: m.d, vw0: ui.view.vw, anchor: world(m.x, m.y) };
      ui.justDrew = Date.now();
      return;
    }
    if (ptrs.size > 2) return;
    const st = editStore(), z = ui.drawing ? st?.zones.find((z) => z.id === ui.selZone) : null;
    if (!z) { g = { mode: 'pan', id: e.pointerId, sx: e.clientX, sy: e.clientY, cx0: ui.view.cx, cy0: ui.view.cy, moved: false }; return; }
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
    const p = world(e.clientX, e.clientY), kpx = ui.view.vw / rectPx().width;
    let tol = 22 * kpx;
    if (z.rect) tol = Math.max(9, Math.min(22, Math.min(z.rect.w, z.rect.h) / kpx * 0.3)) * kpx; // kleine Bereiche: schmalere Kantenzone, damit die Mitte zum Schieben bleibt
    let mode = 'draw', flags = {};
    if (z.rect) {
      const { x, y, w, h } = z.rect;
      const inY = p.y >= y - tol && p.y <= y + h + tol, inX = p.x >= x - tol && p.x <= x + w + tol;
      flags = { L: inY && Math.abs(p.x - x) <= tol, R: inY && Math.abs(p.x - (x + w)) <= tol, T: inX && Math.abs(p.y - y) <= tol, B: inX && Math.abs(p.y - (y + h)) <= tol };
      if (flags.L || flags.R || flags.T || flags.B) mode = 'resize';
      else if (p.x > x && p.x < x + w && p.y > y && p.y < y + h) mode = 'move';
    }
    g = { mode, flags, p0: p, r0: z.rect ? { ...z.rect } : null, draft: null, sx: e.clientX, sy: e.clientY, moved: false };
  });

  svg.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.mode === 'pinch') {
      if (ptrs.size < 2) return;
      const m = mid();
      setAnchored(g.anchor, m.x, m.y, g.vw0 * g.d0 / m.d);
      updatePlan();
      return;
    }
    if (g.mode === 'pan') {
      if (e.pointerId !== g.id) return;
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved) {
        if (Math.hypot(dx, dy) < 8) return;
        g.moved = true; // erst jetzt "greifen", damit ein einfaches Tippen einen Bereich auswählen kann
        try { svg.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
      }
      const k = ui.view.vw / rectPx().width;
      ui.view.cx = g.cx0 - dx * k; ui.view.cy = g.cy0 - dy * k;
      ui.justDrew = Date.now();
      updatePlan();
      return;
    }
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) g.moved = true;
    const p = world(e.clientX, e.clientY), step = gridStep(ui.view.vw);
    let r;
    if (g.mode === 'draw') r = normRect(snap(g.p0.x), snap(g.p0.y), snap(p.x), snap(p.y));
    else if (g.mode === 'move') r = { ...g.r0, x: snap(g.r0.x + p.x - g.p0.x), y: snap(g.r0.y + p.y - g.p0.y) };
    else {
      let l = g.r0.x, rt = g.r0.x + g.r0.w, t = g.r0.y, bt = g.r0.y + g.r0.h;
      const f = g.flags;
      if (f.L) l = snap(p.x); if (f.R) rt = snap(p.x); if (f.T) t = snap(p.y); if (f.B) bt = snap(p.y);
      r = normRect(l, t, rt, bt);
    }
    g.draft = r.w >= step && r.h >= step ? r : null;
    showGhost(g.draft);
  });

  const end = (e, cancel) => {
    ptrs.delete(e.pointerId);
    if (!g) return;
    if (g.mode === 'pinch') { if (ptrs.size < 2) g = null; return; }
    if (g.mode === 'pan') { if (e.pointerId === g.id) g = null; return; }
    const done = g; g = null; clearGhost();
    if (!cancel && done.mode === 'draw' && !done.moved) {
      // Tippen neben den bearbeiteten Bereich beendet das Bearbeiten: auf einen anderen Bereich = auswählen, ins Leere = nur beenden
      const hit = [...(editStore()?.zones || [])].reverse().find((z) => z.rect && done.p0.x >= z.rect.x && done.p0.x <= z.rect.x + z.rect.w && done.p0.y >= z.rect.y && done.p0.y <= z.rect.y + z.rect.h);
      if (hit) ui.selZone = hit.id;
      ui.drawing = false; ui.justDrew = Date.now(); render();
      return;
    }
    if (cancel || !done.draft) return;
    const z = editStore()?.zones.find((z) => z.id === ui.selZone);
    if (!z) return;
    z.rect = done.draft;
    ui.justDrew = Date.now();
    commit();
  };
  window.addEventListener('pointerup', (e) => end(e, false), { signal: planAbort.signal });
  window.addEventListener('pointercancel', (e) => end(e, true), { signal: planAbort.signal });

  svg.addEventListener('wheel', (e) => { // Mausrad (Computer)
    e.preventDefault();
    setAnchored(world(e.clientX, e.clientY), e.clientX, e.clientY, ui.view.vw * Math.exp(e.deltaY * 0.0015));
    updatePlan();
  }, { passive: false });
}


// Schalter „In der Liste verwenden“ (nur dieses Gerät)
document.addEventListener('change', (e) => {
  if (e.target.id !== 'storesSwitch') return;
  try { localStorage.setItem('ek_stores', e.target.checked ? 'on' : 'off'); } catch (_) { /* privat: gilt bis zum Schließen */ }
  render();
});
