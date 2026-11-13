'use strict';
// Kaufhistorie und „Vielleicht fällig“-Vorschläge über der Einkaufsliste.
// S.hist[g][key] = { id: key, name, t: [Zeitpunkte des Abhakens] } je Gruppe g (wird abgeglichen, Art „hist“, siehe sync.js).
//   key = dupKey(name): Einzahl/Mehrzahl zählen gleich. Ohne Konto liegt die Historie unter g = '' (nur auf dem Gerät).
// S.snooze[key] = bis wann ein Vorschlag nach „×“ ruht (nur auf diesem Gerät).
// Vorschlag, wenn: mindestens 3 Käufe, und seit dem letzten Kauf ist fast so viel Zeit vergangen wie sonst zwischen zwei Käufen.

const DAY = 864e5;
const HIST_KEEP = 12; // so viele Zeitpunkte je Produkt merken

// ---------- Schalter „Vorschläge“ (gilt nur für dieses Gerät) ----------
function dueOn() {
  try { return localStorage.getItem('ek_due') !== 'off'; } catch (_) { return true; }
}
document.addEventListener('change', (e) => {
  if (e.target.id !== 'dueSwitch') return;
  try { localStorage.setItem('ek_due', e.target.checked ? 'on' : 'off'); } catch (_) { /* privat */ }
  render();
});

// Zwei Stände desselben Produkts zusammenführen (z. B. zwei Geräte haben gleichzeitig gekauft)
function histMerge(a, b) {
  if (!a) return { id: b.id, name: b.name, t: [...(b.t || [])].slice(-HIST_KEEP) };
  const t = [...new Set([...(a.t || []), ...(b.t || [])])].sort((x, y) => x - y).slice(-HIST_KEEP);
  return { id: a.id, name: b.name || a.name, t };
}

// Einträge wurden abgehakt (nur Einkaufslisten): Kauf merken. Zweimal am selben Tag zählt einmal.
function histChecked(items) {
  if (!items.length || isSimple()) return;
  const g = curList()?.g || '', now = Date.now();
  S.hist = S.hist || {};
  const h = (S.hist[g] = S.hist[g] || {});
  for (const it of items) {
    const key = dupKey(it.name);
    if (!key) continue;
    const e = h[key] || { id: key, name: it.name.trim(), t: [] };
    if (!e.t.length || now - e.t[e.t.length - 1] > 12 * 3600e3) e.t = [...e.t, now].slice(-HIST_KEEP);
    e.name = it.name.trim();
    h[key] = e;
    if (S.snooze) delete S.snooze[key];
  }
  // nicht endlos wachsen: höchstens 400 Produkte je Gruppe, die am längsten nicht gekauften fliegen raus
  const keys = Object.keys(h);
  if (keys.length > 400) keys.sort((a, b) => h[a].t.at(-1) - h[b].t.at(-1)).slice(0, keys.length - 400).forEach((k) => delete h[k]);
  save();
}

// Üblicher Abstand zwischen zwei Käufen (Median, robust gegen einzelne Ausreißer)
function usualGap(t) {
  const gaps = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}
// Fällige Produkte für die aktuelle Liste (höchstens 3, die überfälligsten zuerst)
function dueItems() {
  const l = curList();
  if (!l || isSimple() || !dueOn()) return [];
  const g = l.g || '', now = Date.now(), snooze = S.snooze || {};
  const pool = { ...((S.hist || {})[''] || {}), ...((S.hist || {})[g] || {}) };
  const onList = new Set(S.items.filter((i) => !i.done).map((i) => dupKey(i.name)));
  const out = [];
  for (const e of Object.values(pool)) {
    if (!e.t || e.t.length < 3 || onList.has(e.id) || (snooze[e.id] || 0) > now) continue;
    const gap = usualGap(e.t), since = now - e.t[e.t.length - 1];
    if (gap < DAY) continue; // mehrmals am Tag gekauft: kein sinnvoller Rhythmus
    if (since >= gap * 0.85) out.push({ e, since, ratio: since / gap });
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, 3);
}
function agoText(ms) {
  const d = Math.round(ms / DAY);
  if (d < 1) return 'heute';
  if (d === 1) return 'vor 1 Tag';
  if (d < 14) return `vor ${d} Tagen`;
  if (d < 60) return `vor ${Math.round(d / 7)} Wochen`;
  return `vor ${Math.round(d / 30)} Monaten`;
}
// Leiste über der Einkaufsliste: antippen = auf die Liste, × = nicht jetzt
function dueBar() {
  if (ui.wiggle) return '';
  const due = dueItems();
  if (!due.length) return '';
  return `<div class="duebar"><span class="duelabel">Vielleicht fällig</span><div class="duechips">${due.map(({ e, since }) =>
    `<span class="duechip"><button type="button" class="dueadd" data-act="dueadd" data-key="${esc(e.id)}"><span>${esc(e.name)}</span><small>${agoText(since)}</small></button><button type="button" class="duex" data-act="duesnooze" data-key="${esc(e.id)}" aria-label="${esc(e.name)}: nicht jetzt">×</button></span>`).join('')}</div></div>`;
}
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-act="dueadd"], [data-act="duesnooze"]');
  if (!el) return;
  const key = el.dataset.key, g = curList()?.g || '';
  const ent = (S.hist?.[g] || {})[key] || (S.hist?.[''] || {})[key];
  if (!ent) return;
  if (el.dataset.act === 'dueadd') {
    S.items.push({ id: uid(), name: ent.name, qty: '', note: '', cat: guessCat(ent.name), done: false, ts: Date.now() });
    haptic();
  } else {
    // Ruhen lassen: etwa einen halben üblichen Abstand, mindestens 2 Tage
    S.snooze = S.snooze || {};
    S.snooze[key] = Date.now() + Math.max(2 * DAY, usualGap(ent.t) / 2);
  }
  commit();
});

// Lokal testen (nur auf localhost): erfundene ältere Käufe anlegen, damit sofort Vorschläge erscheinen.
// Sie liegen unter g = '' und werden deshalb nie abgeglichen. In der Browser-Konsole: testVorschlaege() / testVorschlaegeWeg()
if (IS_LOCAL) {
  window.testVorschlaege = () => {
    const n = Date.now(), ago = (d) => n - d * DAY;
    const fake = [['Klopapier', [70, 49, 28]], ['Kaffee', [22, 15, 8]], ['Spülmaschinentabs', [95, 63, 32]], ['Butter', [20, 10, 2]]];
    S.hist = S.hist || {}; S.hist[''] = S.hist[''] || {};
    fake.forEach(([name, days]) => { const key = dupKey(name); S.hist[''][key] = { id: key, name, t: days.map(ago), test: true }; if (S.snooze) delete S.snooze[key]; });
    commit();
    return 'Test-Käufe angelegt: Klopapier, Kaffee, Spülmaschinentabs sollten vorgeschlagen werden (Butter nicht, die ist noch nicht fällig).';
  };
  window.testVorschlaegeWeg = () => {
    Object.keys(S.hist?.[''] || {}).forEach((k) => { if (S.hist[''][k].test) delete S.hist[''][k]; });
    commit();
    return 'Test-Käufe entfernt.';
  };
}
