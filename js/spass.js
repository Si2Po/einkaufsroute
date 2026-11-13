'use strict';
// Kleine Späße (Schalter 🎉 in der Hilfe) und die versteckte Statistik (7× auf die Versionsnummer tippen).
// Grundregel: selten, nie im Weg, verändert keine Einträge. Die übrige App meldet nur Ereignisse:
//   funChecked(items), funItemAdded(names), funRolled(), funMealAdded(meal), funVersionTap()

// ---------- Schalter 🎉 (gilt nur für dieses Gerät) ----------
function funOn() {
  try { return localStorage.getItem('ek_fun') !== 'off'; } catch (_) { return true; }
}
document.addEventListener('change', (e) => {
  if (e.target.id !== 'funSwitch') return;
  try { localStorage.setItem('ek_fun', e.target.checked ? 'on' : 'off'); } catch (_) { /* privat */ }
});
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- Statistik (nur auf diesem Gerät, in S.stats; zählt ab dem ersten Start dieser Version) ----------
function stats() {
  S.stats = S.stats || { since: Date.now(), checked: 0, prods: {}, rolls: 0, meals: {} };
  return S.stats;
}
// Nicht unendlich wachsen lassen: nur die häufigsten 150 Produkte behalten
function trimCounts(map, keep = 150) {
  const keys = Object.keys(map);
  if (keys.length <= keep * 1.2) return;
  keys.sort((a, b) => map[b] - map[a]).slice(keep).forEach((k) => delete map[k]);
}
const topOf = (map, n) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);

// ---------- Ereignisse aus der App ----------
// Einträge wurden abgehakt (endgültig). Ist die Liste danach leer: feiern.
function funChecked(items) {
  if (!items.length) return;
  const st = stats();
  st.checked += items.length;
  items.forEach((i) => { const k = i.name.trim(); st.prods[k] = (st.prods[k] || 0) + 1; });
  trimCounts(st.prods);
  save();
  const open = S.items.some((i) => !i.done);
  if (!open && !document.hidden && funOn()) celebrate(); // letzter Eintrag erledigt: immer Konfetti
}
// Neue Einträge: sehr selten ein kleiner Kommentar (höchstens einmal am Tag)
function funItemAdded(names) {
  if (!funOn() || document.hidden) return;
  const today = new Date().toDateString();
  try { if (localStorage.getItem('ek_fun_day') === today) return; } catch (_) { return; }
  for (const n of names) {
    const c = itemComment(n);
    if (c && chance(0.3)) {
      try { localStorage.setItem('ek_fun_day', today); } catch (_) { /* privat */ }
      setTimeout(() => toast(c), 900); // erst nach dem Hinzufügen, damit es nicht mit anderen Hinweisen kollidiert
      return;
    }
  }
}
// Zufälliges Essen gewürfelt. Nach 7× ohne Entscheidung: Pizza-Vorschlag (einmal je Würfel-Runde).
function funRolled() {
  stats().rolls++;
  save();
  ui.rollStreak = (ui.rollStreak || 0) + 1;
  if (ui.rollStreak === 7 && funOn()) setTimeout(() => toast('Kannst du dich nicht entscheiden? Bestell doch einfach eine Pizza. 🍕'), 600);
}
function funMealAdded(m) {
  ui.rollStreak = 0;
  const st = stats();
  st.meals[m.name] = (st.meals[m.name] || 0) + 1;
  trimCounts(st.meals, 50);
  save();
}

// ---------- Leere Liste: Konfetti und ein Spruch ----------
const DONE_LINES = [
  'Alles erledigt. Kühlschrank: voll. Mission: erfüllt. 🎉',
  'Liste leer! Zeit für einen Kaffee. ☕',
  'Geschafft! Du bist ein Einkaufsprofi. 🛒',
  'Nichts mehr drauf. Ab nach Hause! 🏠',
  'Erledigt! Wer braucht schon Lieferdienste? 🚲',
  'Leer gekauft. Respekt! 💪',
];
function celebrate() {
  haptic();
  toast(pick(DONE_LINES));
  if (reduceMotion()) return; // wer weniger Bewegung möchte, bekommt nur den Spruch
  const cv = document.createElement('canvas'), dpr = window.devicePixelRatio || 1;
  cv.className = 'confetti';
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  document.body.append(cv);
  const ctx = cv.getContext('2d'), accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0E7A55';
  const colors = [accent, '#F4B400', '#E2557A', '#4DA3FF', '#7ED957'];
  const bits = Array.from({ length: 90 }, () => ({
    x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4,
    vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: pick(colors),
  }));
  const t0 = performance.now();
  const frame = (t) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    bits.forEach((b) => {
      b.x += b.vx; b.y += b.vy; b.vy += 0.05; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    });
    if (t - t0 < 2600) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

// ---------- Kommentare zu Einträgen (Wortanfang genügt, Groß/Klein egal) ----------
const ITEM_COMMENTS = [
  [['bier'], 'Bier? Fußballabend oder Feierabend? 🍺'],
  [['chips', 'flips'], 'Chips auf der Liste. Läuft heute ein guter Film? 🍿'],
  [['kuchen', 'torte'], 'Kuchen! Wer hat Geburtstag? 🎂'],
  [['schokolade', 'schoki'], 'Schokolade ist auch eine Art Gemüse. Irgendwie. 🍫'],
  [['wein', 'sekt', 'prosecco'], 'Prost! 🥂'],
  [['klopapier', 'toilettenpapier'], 'Klopapier: der Klassiker. 🧻'],
  [['kaffee'], 'Ohne Kaffee geht nix. ☕'],
  [['brokkoli', 'spinat', 'grünkohl'], 'Sehr gesund. Deine Mama wäre stolz. 🥦'],
  [['knoblauch'], 'Knoblauch: Vampire, ihr seid gewarnt. 🧛'],
  [['eis$', 'eiscreme', 'speiseeis'], 'Eis geht immer. Wirklich immer. 🍦'],
  [['pizza'], 'Pizza: die Lösung für fast alles. 🍕'],
  [['bananen', 'banane'], 'Bananen: die Snack-Profis unter den Früchten. 🍌'],
  [['zitronen', 'limetten'], 'Wenn das Leben dir Zitronen gibt … 🍋'],
  [['nudeln', 'spaghetti', 'pasta'], 'Pasta la vista! 🍝'],
  [['katzenfutter'], 'Die wichtigste Person im Haushalt ist versorgt. 🐱'],
  [['hundefutter'], 'Der beste Freund wird glücklich sein. 🐶'],
  [['windeln'], 'Großeinkauf für kleine Menschen. 👶'],
  [['gummibär'], 'Gummibärchen zählen als Obst, oder? 🐻'],
  [['käse'], 'Käse macht alles besser. 🧀'],
  [['eier'], 'Was war zuerst da? Egal, Hauptsache auf der Liste. 🥚'],
  [['avocado'], 'Avocado: entweder steinhart oder schon braun. Viel Glück! 🥑'],
  [['popcorn'], 'Popcorn! Kino zu Hause? 🎬'],
  [['grillkohle', 'würstchen', 'bratwurst'], 'Grillwetter? 🔥'],
  [['kerze'], 'Romantischer Abend geplant? 🕯️'],
  [['chili'], 'Jetzt wird’s heiß! 🌶️'],
  [['kondom'], 'Safety first! 😉'],
  [['tee$', 'teebeutel'], 'Abwarten und Tee trinken. 🍵'],
  [['doughnut', 'donut'], 'Hmmmm … Donuts 🤤'],
  [['senf'], 'Jetzt gebe ich auch noch meinen Senf dazu. 😄'],
  [['hefe'], 'Wird heute gebacken? 🥐'],
  [['waschmittel'], 'Waschtag! 🧺'],
  [['blumen'], 'Blumen? Wie aufmerksam! 💐'],
  [['batterie'], 'Energie für alle Fälle. 🔋'],
  [['champagner', 'champus'], 'Gibt’s was zu feiern? 🍾'],
  [['zahnpasta', 'zahncreme'], 'Für ein strahlendes Lächeln. 😁'],
];
// Ein Wort passt, wenn es mit dem Schlüssel beginnt. Schlüssel mit „$“ am Ende müssen das ganze Wort sein
// („eis$“ passt auf „Eis“, aber nicht auf „Eisbergsalat“ oder „Eistee“).
function itemComment(name) {
  const words = name.toLowerCase().split(/[\s\-\/,]+/);
  const fits = (k) => (k.endsWith('$') ? words.includes(k.slice(0, -1)) : words.some((w) => w.startsWith(k)));
  const hit = ITEM_COMMENTS.find(([keys]) => keys.some(fits));
  return hit ? hit[1] : '';
}

// ---------- Versteckte Statistik: 7× auf die Versionsnummer tippen ----------
let verTaps = 0, verTapT;
function funVersionTap() {
  clearTimeout(verTapT);
  verTapT = setTimeout(() => { verTaps = 0; }, 2500);
  verTaps++;
  if (verTaps >= 4 && verTaps < 7) toast(`Noch ${7 - verTaps} …`);
  if (verTaps === 7) {
    verTaps = 0;
    try { document.getElementById('toast')?.hidePopover(); } catch (_) { /* kein Hinweis offen */ }
    haptic(); ui.confirmStats = false; statsPage();
  }
}
function statsPage() {
  const st = stats();
  const since = new Date(st.since).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const rows = (list, unit) => (list.length
    ? `<div class="group">${list.map(([k, v], i) => `<div class="sheetbtn"><span>${i + 1}. ${esc(k)}</span><small>${v} ${unit}</small></div>`).join('')}</div>`
    : '<p class="sheetnote" style="margin:0 4px">Noch nichts gezählt.</p>');
  openPage('stats', 'Deine Statistik', `
    <p class="sheetnote" style="margin:0 4px 10px">Gezählt auf diesem Gerät seit ${since}.</p>
    <div class="statgrid">
      <div class="stat"><b>${st.checked}</b><span>abgehakt</span></div>
      <div class="stat"><b>${st.rolls}</b><span>mal gewürfelt</span></div>
      <div class="stat"><b>${Object.values(st.meals).reduce((a, b) => a + b, 0)}</b><span>Essen auf der Liste</span></div>
    </div>
    <div class="sheettitle" style="margin-top:14px">Am häufigsten gekauft</div>
    ${rows(topOf(st.prods, 5), '×')}
    <div class="sheettitle" style="margin-top:14px">Lieblingsessen</div>
    ${rows(topOf(st.meals, 3), '×')}
    <div class="actions" style="margin-top:18px"><button type="button" class="btn danger" data-act="statsreset">${ui.confirmStats ? 'Wirklich zurücksetzen?' : 'Statistik zurücksetzen'}</button></div>`);
}
// Zurücksetzen mit Rückfrage (zweimal tippen), zählt danach wieder ab heute
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('[data-act="statsreset"]')) return;
  if (!ui.confirmStats) { ui.confirmStats = true; statsPage(); return; }
  ui.confirmStats = false;
  delete S.stats;
  save();
  statsPage();
  toast('Statistik zurückgesetzt');
});
