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
// Zufälliges Essen gewürfelt. Ab 7× ohne Entscheidung kommen Sprüche (ROLL_LINES), bis ein Essen auf die Liste kommt.
function funRolled() {
  stats().rolls++;
  save();
  ui.rollStreak = (ui.rollStreak || 0) + 1;
  const line = ROLL_LINES[ui.rollStreak];
  if (line && funOn()) setTimeout(() => toast(line), 600);
}
// Würfeln ohne Entscheidung: die App wird langsam ungeduldig (Zahl = wie oft hintereinander gewürfelt)
const ROLL_LINES = {
  7: T('Kannst du dich nicht entscheiden? Bestell doch einfach eine Pizza. 🍕'),
  10: T('Wir sind hier nicht bei Kniffel. 🎲'),
  13: T('Ok … gibt es überhaupt etwas, das dir schmeckt?!'),
  16: T('Der Würfel braucht jetzt eine kurze Pause. 😮‍💨'),
  20: T('Nimm einfach das nächste. Versprochen, es wird lecker. 🙏'),
  25: '…',
};
function funMealAdded(m) {
  ui.rollStreak = 0;
  const st = stats();
  st.meals[m.name] = (st.meals[m.name] || 0) + 1;
  trimCounts(st.meals, 50);
  save();
}

// ---------- Leere Liste: Konfetti und ein Spruch ----------
const DONE_LINES = [
  T('Alles erledigt. Kühlschrank: voll. Mission: erfüllt. 🎉'),
  T('Liste leer! Zeit für einen Kaffee. ☕'),
  T('Geschafft! Du bist ein Einkaufsprofi. 🛒'),
  T('Nichts mehr drauf. Ab nach Hause! 🏠'),
  T('Erledigt! Wer braucht schon Lieferdienste? 🚲'),
  T('Leer gekauft. Respekt! 💪'),
];
function celebrate() {
  haptic();
  toast(pick(DONE_LINES));
  if (reduceMotion()) return; // wer weniger Bewegung möchte, bekommt nur den Spruch
  const cv = document.createElement('canvas'), dpr = window.devicePixelRatio || 1;
  cv.className = 'confetti';
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  document.body.append(cv);
  const ctx = cv.getContext('2d'), accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1F6BCF';
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
// Je Zeile: deutsche Wörter, Spruch, englische Wörter (gelten, wenn die App auf Englisch läuft).
const ITEM_COMMENTS = [
  [['bier'], T('Bier? Fußballabend oder Feierabend? 🍺'), ['beer$', 'beers$']],
  [['chips', 'flips'], T('Chips auf der Liste. Läuft heute ein guter Film? 🍿'), ['chips', 'crisps']],
  [['kuchen', 'torte'], T('Kuchen! Wer hat Geburtstag? 🎂'), ['cake']],
  [['schokolade', 'schoki'], T('Schokolade ist auch eine Art Gemüse. Irgendwie. 🍫'), ['chocolate']],
  [['wein', 'sekt', 'prosecco'], T('Prost! 🥂'), ['wine$', 'prosecco', 'bubbly']],
  [['klopapier', 'toilettenpapier'], T('Klopapier: der Klassiker. 🧻'), ['toilet', 'tp$']],
  [['kaffee'], T('Ohne Kaffee geht nix. ☕'), ['coffee']],
  [['brokkoli', 'spinat', 'grünkohl'], T('Sehr gesund. Deine Mama wäre stolz. 🥦'), ['broccoli', 'spinach', 'kale$']],
  [['knoblauch'], T('Knoblauch: Vampire, ihr seid gewarnt. 🧛'), ['garlic']],
  [['eis$', 'eiscreme', 'speiseeis'], T('Eis geht immer. Wirklich immer. 🍦'), ['icecream', 'gelato', 'popsicle']],
  [['pizza'], T('Pizza: die Lösung für fast alles. 🍕'), ['pizza']],
  [['bananen', 'banane'], T('Bananen: die Snack-Profis unter den Früchten. 🍌'), ['banana']],
  [['zitronen', 'limetten'], T('Wenn das Leben dir Zitronen gibt … 🍋'), ['lemon', 'limes$', 'lime$']],
  [['nudeln', 'spaghetti', 'pasta'], T('Pasta la vista! 🍝'), ['noodle', 'spaghetti', 'pasta']],
  [['katzenfutter'], T('Die wichtigste Person im Haushalt ist versorgt. 🐱'), ['catfood', 'kibble']],
  [['hundefutter'], T('Der beste Freund wird glücklich sein. 🐶'), ['dogfood']],
  [['windeln'], T('Großeinkauf für kleine Menschen. 👶'), ['diaper', 'nappies', 'nappy']],
  [['gummibär'], T('Gummibärchen zählen als Obst, oder? 🐻'), ['gummy', 'gummi']],
  [['käse'], T('Käse macht alles besser. 🧀'), ['cheese']],
  [['eier'], T('Was war zuerst da? Egal, Hauptsache auf der Liste. 🥚'), ['eggs$', 'egg$']],
  [['avocado'], T('Avocado: entweder steinhart oder schon braun. Viel Glück! 🥑'), ['avocado']],
  [['popcorn'], T('Popcorn! Kino zu Hause? 🎬'), ['popcorn']],
  [['grillkohle', 'würstchen', 'bratwurst'], T('Grillwetter? 🔥'), ['charcoal', 'sausage', 'bratwurst', 'hotdog']],
  [['kerze'], T('Romantischer Abend geplant? 🕯️'), ['candle']],
  [['chili'], T('Jetzt wird’s heiß! 🌶️'), ['chili', 'chilli']],
  [['kondom'], T('Safety first! 😉'), ['condom']],
  [['tee$', 'teebeutel'], T('Abwarten und Tee trinken. 🍵'), ['tea$', 'teabags']],
  [['doughnut', 'donut'], T('Hmmmm … Donuts 🤤'), ['doughnut', 'donut']],
  [['senf'], T('Jetzt gebe ich auch noch meinen Senf dazu. 😄'), ['mustard']],
  [['hefe'], T('Wird heute gebacken? 🥐'), ['yeast']],
  [['waschmittel'], T('Waschtag! 🧺'), ['detergent', 'laundry']],
  [['blumen'], T('Blumen? Wie aufmerksam! 💐'), ['flowers']],
  [['batterie'], T('Energie für alle Fälle. 🔋'), ['batteries', 'battery']],
  [['champagner', 'champus'], T('Gibt’s was zu feiern? 🍾'), ['champagne']],
  [['zahnpasta', 'zahncreme'], T('Für ein strahlendes Lächeln. 😁'), ['toothpaste']],
];
// Ein Wort passt, wenn es mit dem Schlüssel beginnt. Schlüssel mit „$“ am Ende müssen das ganze Wort sein
// („eis$“ passt auf „Eis“, aber nicht auf „Eisbergsalat“ oder „Eistee“).
function itemComment(name) {
  const words = name.toLowerCase().split(/[\s\-\/,]+/);
  const fits = (k) => (k.endsWith('$') ? words.includes(k.slice(0, -1)) : words.some((w) => w.startsWith(k)));
  const hit = ITEM_COMMENTS.find((c) => (LANG === 'en' ? c[2] : c[0]).some(fits));
  return hit ? hit[1] : '';
}

// ---------- Versteckte Statistik: 7× auf die Versionsnummer tippen ----------
let verTaps = 0, verTapT;
function funVersionTap() {
  clearTimeout(verTapT);
  verTapT = setTimeout(() => { verTaps = 0; }, 2500);
  verTaps++;
  if (verTaps >= 4 && verTaps < 7) toast(T('Noch {n} …', { n: 7 - verTaps }));
  if (verTaps === 7) {
    verTaps = 0;
    try { document.getElementById('toast')?.hidePopover(); } catch (_) { /* kein Hinweis offen */ }
    haptic(); ui.confirmStats = false; statsPage();
  }
}
function statsPage() {
  const st = stats();
  const since = new Date(st.since).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
  const rows = (list, unit) => (list.length
    ? `<div class="group">${list.map(([k, v], i) => `<div class="sheetbtn"><span>${i + 1}. ${esc(k)}</span><small>${v} ${unit}</small></div>`).join('')}</div>`
    : `<p class="sheetnote" style="margin:0 4px">${T('Noch nichts gezählt.')}</p>`);
  openPage('stats', T('Deine Statistik'), `
    <p class="sheetnote" style="margin:0 4px 10px">${T('Gezählt auf diesem Gerät seit {date}.', { date: since })}</p>
    <div class="statgrid">
      <div class="stat"><b>${st.checked}</b><span>${T('abgehakt')}</span></div>
      <div class="stat"><b>${st.rolls}</b><span>${T('mal gewürfelt')}</span></div>
      <div class="stat"><b>${Object.values(st.meals).reduce((a, b) => a + b, 0)}</b><span>${T('Essen auf der Liste')}</span></div>
    </div>
    <div class="sheettitle" style="margin-top:14px">${T('Am häufigsten gekauft')}</div>
    ${rows(topOf(st.prods, 5), '×')}
    <div class="sheettitle" style="margin-top:14px">${T('Lieblingsessen')}</div>
    ${rows(topOf(st.meals, 3), '×')}
    <div class="actions" style="margin-top:18px"><button type="button" class="btn danger" data-act="statsreset">${T(ui.confirmStats ? 'Wirklich zurücksetzen?' : 'Statistik zurücksetzen')}</button></div>`);
}
// Zurücksetzen mit Rückfrage (zweimal tippen), zählt danach wieder ab heute
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('[data-act="statsreset"]')) return;
  if (!ui.confirmStats) { ui.confirmStats = true; statsPage(); return; }
  ui.confirmStats = false;
  delete S.stats;
  save();
  statsPage();
  toast(T('Statistik zurückgesetzt'));
});
