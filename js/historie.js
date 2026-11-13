'use strict';
// Kaufhistorie und „Vielleicht fällig“-Vorschläge über der Einkaufsliste.
// S.hist[g][key] = { id: key, name, t: [Zeitpunkte des Abhakens] } je Gruppe g (wird abgeglichen, Art „hist“, siehe sync.js).
//   key = dupKey(name): Einzahl/Mehrzahl zählen gleich. Ohne Konto liegt die Historie unter g = '' (nur auf dem Gerät).
//   Zusätzlich (Einstellungen → Vorschläge): every = Rhythmus von Hand in ms (0 = automatisch), since = angelegt am
//   (eigene Vorschläge ohne Kauf zählen ab da).
// S.snooze[key] = bis wann ein Vorschlag nach „×“ ruht (nur auf diesem Gerät).
// Vorschlag, wenn: Rhythmus bekannt (von Hand, oder automatisch ab 3 Käufen) und seit dem letzten Kauf ist fast so viel
// Zeit vergangen wie sonst zwischen zwei Käufen.

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
// b ist der neuere Stand (vom Server): Name und Rhythmus kommen von dort, die Kaufzeitpunkte werden vereint.
function histMerge(a, b) {
  const t = [...new Set([...(a?.t || []), ...(b.t || [])])].sort((x, y) => x - y).slice(-HIST_KEEP);
  return { ...(a || {}), ...b, name: b.name || a?.name, t };
}
const lastTime = (e) => (e.t?.length ? e.t[e.t.length - 1] : e.since || 0);
// Rhythmus in ms: von Hand gesetzt, sonst aus den Käufen (ab 3 Käufen), sonst 0 = noch unbekannt
const rhythmOf = (e) => e.every || (e.t?.length >= 3 ? usualGap(e.t) : 0);

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
  if (keys.length > 400) keys.filter((k) => !h[k].every).sort((a, b) => lastTime(h[a]) - lastTime(h[b])).slice(0, keys.length - 400).forEach((k) => delete h[k]);
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
    if (onList.has(e.id) || (snooze[e.id] || 0) > now) continue;
    const gap = rhythmOf(e), since = now - lastTime(e);
    if (gap < DAY) continue; // unbekannt, oder mehrmals am Tag gekauft: kein sinnvoller Rhythmus
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
    `<span class="duechip"><button type="button" class="dueadd" data-act="dueadd" data-key="${esc(e.id)}"><span>${esc(e.name)}</span><small>${agoText(since)}</small></button><button type="button" class="duex" data-act="duesnooze" data-key="${esc(e.id)}" aria-label="${esc(e.name)}: nicht jetzt"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button></span>`).join('')}</div></div>`;
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
    S.snooze[key] = Date.now() + Math.max(2 * DAY, rhythmOf(ent) / 2);
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

// ---------- Einstellungen → Vorschläge: Schalter, erkannte Produkte, Rhythmus bearbeiten, eigene Vorschläge ----------
const UNITS = { d: ['Tage', DAY], w: ['Wochen', 7 * DAY], m: ['Monate', 30 * DAY] };
function rhythmText(ms) {
  const d = Math.round(ms / DAY);
  if (d < 14) return `alle ${d} ${d === 1 ? 'Tag' : 'Tage'}`;
  if (d < 60) return `alle ${Math.round(d / 7)} Wochen`;
  return `alle ${Math.round(d / 30)} ${Math.round(d / 30) === 1 ? 'Monat' : 'Monate'}`;
}
// Rhythmus in Zahl + Einheit zerlegen (für die Eingabe)
function rhythmParts(ms) {
  const d = Math.round(ms / DAY);
  if (d >= 60 && d % 30 === 0) return [d / 30, 'm'];
  if (d >= 14 && d % 7 === 0) return [d / 7, 'w'];
  return [Math.max(1, d), 'd'];
}
// Alle Einträge mit bekanntem Rhythmus, über alle eigenen Gruppen (und ohne Gruppe)
function knownRhythms() {
  const out = [];
  for (const [g, h] of Object.entries(S.hist || {})) {
    for (const e of Object.values(h)) if (rhythmOf(e) >= DAY) out.push({ g, e });
  }
  return out.sort((a, b) => a.e.name.localeCompare(b.e.name, 'de'));
}
const learningCount = () => Object.values(S.hist || {}).reduce((n, h) => n + Object.values(h).filter((e) => rhythmOf(e) < DAY).length, 0);
const dueSub = () => (dueOn() ? `${knownRhythms().length} erkannt` : 'Aus');

function duePage() {
  const rows = knownRhythms().map(({ g, e }) => `<button type="button" class="sheetbtn" data-act="dueedit" data-g="${esc(g)}" data-key="${esc(e.id)}"><span>${esc(e.name)}</span><small>${g ? groupTag(g) : ''}${rhythmText(rhythmOf(e))}${e.every ? ' (von dir)' : ''} ›</small></button>`).join('');
  const learning = learningCount();
  openPage('due', 'Vorschläge', `
    <div class="group"><label class="sheetbtn swrow"><span>„Vielleicht fällig“ anzeigen<small>Über der Einkaufsliste. Gilt nur für dieses Gerät.</small></span><input type="checkbox" switch id="dueSwitch"${dueOn() ? ' checked' : ''}></label></div>
    <div class="sheettitle" style="margin-top:14px">Erkannt</div>
    ${rows ? `<div class="group">${rows}</div>` : '<p class="sheetnote" style="margin:0 4px">Noch nichts. Ab drei Käufen eines Produkts erkennt die App den Rhythmus von selbst.</p>'}
    ${learning ? `<p class="sheetnote" style="margin:6px 4px 0">${learning} weitere ${learning === 1 ? 'Produkt wird' : 'Produkte werden'} noch gelernt.</p>` : ''}
    <button type="button" class="btn ghost" style="margin-top:12px" data-act="duenew">+ Eigener Vorschlag</button>`, duePage);
}
// Rhythmus eines Produkts bearbeiten: Zahl + Einheit, „automatisch“ (wenn genug Käufe), entfernen
function dueEditSheet(g, key) {
  const e = S.hist?.[g]?.[key];
  if (!e) return;
  const [num, unit] = rhythmParts(rhythmOf(e) || 7 * DAY);
  const auto = e.t?.length >= 3 ? usualGap(e.t) : 0;
  openSheet(`<div class="sheettitle">${esc(e.name)}</div>
    <form id="dueEditForm" data-g="${esc(g)}" data-key="${esc(key)}" autocomplete="off">
      <label class="srow"><span class="pl">Alle</span><input id="dueNum" type="number" inputmode="numeric" min="1" max="365" value="${num}" class="duenum" aria-label="Anzahl"><select id="dueUnit" aria-label="Einheit">${Object.entries(UNITS).map(([k, [name]]) => `<option value="${k}"${k === unit ? ' selected' : ''}>${name}</option>`).join('')}</select></label>
      <p class="sheetnote" style="margin:6px 4px">${e.t?.length ? `Zuletzt gekauft ${agoText(Date.now() - lastTime(e))}, insgesamt ${e.t.length}×.` : 'Noch nie abgehakt, zählt ab dem Anlegen.'}${auto ? ` Aus den Käufen erkannt: ${rhythmText(auto)}.` : ''}</p>
      <div class="actions" style="margin-top:8px">
        ${e.every && auto ? '<button type="button" class="btn ghost" data-act="dueauto">Automatisch</button>' : ''}
        <button type="button" class="btn danger" data-act="duedel">${ui.confirmDueDel ? 'Wirklich entfernen?' : 'Entfernen'}</button>
      </div>
    </form>`);
}
// Eigenen Vorschlag anlegen: Name, Rhythmus, Gruppe
function dueNewSheet() {
  openSheet(`<div class="sheettitle">Eigener Vorschlag</div>
    <form id="dueNewForm" autocomplete="off">
      <input id="dueNewName" autofocus class="notein" placeholder="Was, z. B. Klopapier" aria-label="Produkt" required>
      <label class="srow"><span class="pl">Alle</span><input id="dueNewNum" type="number" inputmode="numeric" min="1" max="365" value="2" class="duenum" aria-label="Anzahl"><select id="dueNewUnit" aria-label="Einheit">${Object.entries(UNITS).map(([k, [name]]) => `<option value="${k}"${k === 'w' ? ' selected' : ''}>${name}</option>`).join('')}</select></label>
      ${groupSelect('dueNewGroup', curList()?.g || defaultGroup())}
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
const readRhythm = (numId, unitId) => Math.max(1, Math.min(365, parseInt($(numId)?.value, 10) || 1)) * UNITS[$(unitId)?.value || 'd'][1];
// Rhythmus sofort übernehmen, wenn Zahl oder Einheit geändert werden
document.addEventListener('change', (e) => {
  if (e.target.id !== 'dueNum' && e.target.id !== 'dueUnit') return;
  const f = $('#dueEditForm'), ent = S.hist?.[f?.dataset.g]?.[f?.dataset.key];
  if (!ent) return;
  ent.every = readRhythm('#dueNum', '#dueUnit');
  save(); refreshTopPage(); render();
  dueEditSheet(f.dataset.g, f.dataset.key); // zeigt jetzt „Automatisch“ zum Zurücksetzen
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'dueEditForm') { e.preventDefault(); closeSheet(); return; }
  if (e.target.id !== 'dueNewForm') return;
  e.preventDefault();
  const name = $('#dueNewName').value.trim(), key = dupKey(name);
  if (!key) return;
  const g = $('#dueNewGroup')?.value || curList()?.g || '';
  S.hist = S.hist || {}; const h = (S.hist[g] = S.hist[g] || {});
  h[key] = { ...(h[key] || { id: key, t: [], since: Date.now() }), name, every: readRhythm('#dueNewNum', '#dueNewUnit') };
  closeSheet(); save(); duePage(); render();
  toast(`„${name}“: ${rhythmText(h[key].every)}`);
});
// Knöpfe im Rhythmus-Sheet (Rückgabe true = Sheet bleibt offen)
function dueAction(act) {
  const f = $('#dueEditForm'), g = f?.dataset.g, key = f?.dataset.key, ent = S.hist?.[g]?.[key];
  if (!ent) return false;
  if (act === 'dueauto') { ent.every = 0; save(); duePage(); render(); return false; }
  if (act === 'duedel') {
    if (!ui.confirmDueDel) { ui.confirmDueDel = true; dueEditSheet(g, key); return true; }
    ui.confirmDueDel = false;
    delete S.hist[g][key];
    save(); duePage(); render();
    toast(`„${ent.name}“ entfernt`);
  }
  return false;
}
