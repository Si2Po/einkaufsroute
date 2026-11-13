'use strict';
// Bedienung und Darstellung: Vorschläge per Tastatur, Ziehen zum Aktualisieren, Hell/Dunkel, Farben, Glas, Haptik, Stichwort-Umstellung.

// ---------- Vorschläge mit der Tastatur (am PC) ----------
// Pfeil runter/hoch markiert einen Vorschlag, Enter übernimmt ihn, Esc blendet die Vorschläge aus.
const SUGG_BOX = { addName: '#sugg', mIng: '#mIngSugg', pinName: '#pinSugg' };
document.addEventListener('keydown', (e) => {
  const sel = SUGG_BOX[e.target.id];
  if (!sel || e.isComposing) return;
  const box = $(sel);
  const opts = box && !box.hidden ? [...box.querySelectorAll('.sg')] : [];
  if (!opts.length) return;
  const cur = opts.findIndex((o) => o.classList.contains('kb'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? (cur + 1) % opts.length : (cur <= 0 ? opts.length : cur) - 1;
    opts.forEach((o, i) => { o.classList.toggle('kb', i === next); o.setAttribute('aria-selected', String(i === next)); });
    opts[next].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && cur > -1) {
    e.preventDefault(); e.stopPropagation(); // nicht das Getippte, sondern den Vorschlag übernehmen
    opts[cur].click();
    e.target.focus();
  } else if (e.key === 'Escape') {
    box.hidden = true;
  }
}, true);

// ---------- Ziehen zum Aktualisieren ----------
// Ganz oben weiter nach unten ziehen: in der Liste = Abgleich mit dem Haushalt, in den Einstellungen = nach neuer Version suchen.
async function checkUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (!reg) { toast('Hier gibt es keine Updates (lokale Version)'); return; }
  try { await reg.update(); } catch (_) { toast('Keine Verbindung – später nochmal versuchen'); return; }
  if (reg.installing || reg.waiting) toast('Neue Version gefunden – wird geladen …'); // lädt danach von selbst neu (controllerchange)
  else toast(`Du hast die neueste Version (${appVersion})`);
}
async function syncNow() {
  if (typeof syncRun !== 'function' || !sync.sess) { toast('Nicht angemeldet – nichts abzugleichen'); return; }
  sync.dirty = true; sync.ver++;
  await syncRun();
  toast(sync.status === 'ok' ? 'Abgeglichen' : (sync.err || 'Abgleich später'));
}
(function pullToRefresh() {
  const PULL = 70; // so weit ziehen, bis es auslöst
  const ind = document.createElement('div');
  ind.id = 'pull'; ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v12M6.5 11.5L12 17l5.5-5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.body.append(ind);
  let y0 = null, d = 0, busy = false;
  const action = () => (dlg().open || pages.length ? null : ui.tab === 'settings' ? checkUpdate : ui.tab === 'list' ? syncNow : null);
  const hide = () => { ind.className = ''; ind.style.opacity = ''; ind.style.transform = ''; };
  document.addEventListener('touchstart', (e) => {
    y0 = null;
    if (busy || e.touches.length !== 1 || window.scrollY > 0 || !action() || e.target.closest?.('input, textarea, select, .plan')) return;
    y0 = e.touches[0].clientY; d = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    if (sortingNow || dragArmed || ui.wiggle) { y0 = null; d = 0; hide(); return; } // Halten/Ziehen zum Sortieren ist kein Aktualisieren
    d = e.touches[0].clientY - y0;
    if (d <= 0 || window.scrollY > 0) { d = 0; hide(); return; }
    ind.className = d > PULL ? 'ready' : 'pulling';
    ind.style.opacity = String(Math.min(1, d / PULL));
    ind.style.transform = `translate(-50%, ${Math.min(d, PULL * 1.3) * 0.6}px) rotate(${d > PULL ? 180 : 0}deg)`;
  }, { passive: true });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    if (sortingNow || dragArmed || ui.wiggle) { hide(); return; }
    const fn = action();
    if (d <= PULL || !fn) { hide(); return; }
    busy = true; ind.className = 'spin'; ind.style.opacity = '1'; ind.style.transform = `translate(-50%, ${PULL * 0.6}px)`;
    haptic();
    Promise.resolve().then(fn).catch(() => {}).finally(() => { busy = false; hide(); });
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', () => { y0 = null; hide(); });
})();

// ---------- Darstellung: Automatisch / Hell / Dunkel ----------
// Gilt nur für dieses Gerät (localStorage), wird nicht mit dem Haushalt abgeglichen. index.html setzt sie schon beim Laden.
const THEME_BG = { light: '#F2F4F3', dark: '#0D110F' }; // = --bg in style.css (Farbe der Statusleiste)
const THEME_LABEL = { auto: 'Automatisch (wie das Gerät)', light: 'Hell', dark: 'Dunkel' };
function themePref() { try { return localStorage.getItem('ek_theme') || 'auto'; } catch (_) { return 'auto'; } }
// Akzentfarben: Schlüssel → [Name, Farbe für die Auswahl]. Die eigentlichen Werte (hell/dunkel) stehen in style.css.
const ACCENTS = { gruen: ['Grün', '#0E7A55'], blau: ['Blau', '#1F6BCF'], lila: ['Lila', '#7A4FD0'], orange: ['Orange', '#C25A00'], pink: ['Pink', '#C2306B'] };
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function customAccentStored() { try { const c = JSON.parse(localStorage.getItem('ek_accent_c')); return c && c.l ? c : null; } catch (_) { return null; } }
function accentPref() {
  try { const a = localStorage.getItem('ek_accent'); return ACCENTS[a] || (a === 'custom' && customAccentStored()) ? a : 'gruen'; } catch (_) { return 'gruen'; }
}
const accentName = () => (accentPref() === 'custom' ? 'Eigene Farbe' : ACCENTS[accentPref()][0]);
// Eigene Farbe lesbar machen: im hellen Modus so weit abdunkeln, im dunklen so weit aufhellen, bis der Kontrast reicht (4,5 : 1)
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lumi = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrastOf = (a, b) => { const x = lumi(a), y = lumi(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mixRgb = (c, t, f) => c.map((v, i) => v + (t[i] - v) * f);
function customAccent(hex) {
  const c = hexRgb(hex), W = [255, 255, 255], DARK = [23, 28, 25]; // DARK = --surface im Dunkelmodus
  let l = c, d = c;
  for (let f = 0.05; contrastOf(l, W) < 4.5 && f <= 1; f += 0.05) l = mixRgb(c, [0, 0, 0], f);
  for (let f = 0.05; contrastOf(d, DARK) < 4.5 && f <= 1; f += 0.05) d = mixRgb(c, W, f);
  return { hex, l: rgbHex(l), d: rgbHex(d), od: contrastOf(d, [0, 0, 0]) >= contrastOf(d, W) ? '#0B0F0D' : '#FFFFFF' };
}
function applyTheme() {
  const p = themePref(), root = document.documentElement;
  if (p === 'auto') delete root.dataset.theme; else root.dataset.theme = p;
  const a = accentPref(), c = a === 'custom' ? customAccentStored() : null;
  if (a === 'gruen') delete root.dataset.accent; else root.dataset.accent = a;
  applyGlass(glassPref());
  ['l', 'd', 'od'].forEach((k) => { if (c) root.style.setProperty(`--cust-${k}`, c[k]); else root.style.removeProperty(`--cust-${k}`); });
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = THEME_BG[p === 'auto' ? (/dark/.test(m.media) ? 'dark' : 'light') : p]; });
}
function themePage() {
  const p = themePref();
  const opt = (v, label, sub) => `<button type="button" class="sheetbtn${p === v ? ' on' : ''}" data-act="settheme" data-id="${v}"><span>${label}${sub ? ` <small>${sub}</small>` : ''}</span></button>`;
  const a = accentPref(), cust = customAccentStored();
  const sw = Object.entries(ACCENTS).map(([k, [name, c]]) => `<button type="button" class="swatch" style="--c:${c}" data-act="setaccent" data-id="${k}" aria-pressed="${a === k}" aria-label="${name}">${a === k ? ICON_CHECK : ''}</button>`).join('')
    + `<label class="swatch custom${a === 'custom' ? ' on' : ''}" style="--c:${cust?.hex || '#888'}" aria-label="Eigene Farbe wählen">
        ${a === 'custom' ? `<span class="dot" style="background:${cust.hex}">${ICON_CHECK}</span>` : ''}
        <input type="color" id="accentPicker" value="${cust?.hex || '#0E7A55'}"></label>`;
  openPage('theme', 'Darstellung', `<div class="sheettitle">Hell oder dunkel</div>
    <div class="group">${opt('auto', 'Automatisch', 'wie das Gerät')}${opt('light', 'Hell')}${opt('dark', 'Dunkel')}</div>
    <div class="sheettitle" style="margin-top:12px">Akzentfarbe <small style="text-transform:none;letter-spacing:0;font-weight:600">· ${accentName()}</small></div>
    <div class="group swatches">${sw}</div>
    <div class="sheettitle" style="margin-top:12px">Glas</div>
    <div class="group glassrow"><span aria-hidden="true">Deckend</span><input type="range" id="glassRange" min="0" max="100" step="5" value="${glassPref()}" aria-label="Glas-Stärke"><span aria-hidden="true">Glas</span></div>
    `, themePage);
}
// Eigene Farbe: sofort anwenden und nur die Farbfelder auf der Seite anpassen. Die Seite wird dabei NICHT neu aufgebaut,
// sonst würde das Farbfeld ersetzt und iOS schließt den Farbwähler nach jeder Auswahl (Feinjustieren unmöglich).
function pickAccent(hex) {
  try { localStorage.setItem('ek_accent', 'custom'); localStorage.setItem('ek_accent_c', JSON.stringify(customAccent(hex))); } catch (_) { /* privat */ }
  applyTheme();
  showCustomPicked(hex);
}
function showCustomPicked(hex) {
  const page = pages.find((p) => p.key === 'theme')?.el;
  if (!page) return;
  page.querySelectorAll('.swatch[data-act="setaccent"]').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.innerHTML = ''; });
  const lab = page.querySelector('.swatch.custom');
  if (lab) {
    lab.classList.add('on');
    lab.style.setProperty('--c', hex);
    let dot = lab.querySelector('.dot');
    if (!dot) { dot = document.createElement('span'); dot.className = 'dot'; dot.innerHTML = ICON_CHECK; lab.prepend(dot); }
    dot.style.background = hex;
  }
  const name = page.querySelector('.sheettitle small');
  if (name) name.textContent = '· ' + accentName();
}
['input', 'change'].forEach((t) => document.addEventListener(t, (e) => { if (e.target.id === 'accentPicker') pickAccent(e.target.value); }));
applyTheme();
// Glas-Stärke 0–100 %: 0 = fast deckend, 50 = Standard (frostig), 100 = fast durchsichtig (wenig Fläche, wenig Unschärfe)
function glassPref() { try { const g = parseInt(localStorage.getItem('ek_glass2'), 10); return g >= 0 && g <= 100 ? g : 50; } catch (_) { return 50; } }
function applyGlass(n) {
  const s = document.documentElement.style;
  // bis 50 gleichmäßig von „kaum“ zum Standard, darüber weiter bis ganz durchsichtig (t = 0…1)
  const lo = Math.min(n, 50) / 50, t = Math.max(0, n - 50) / 50;
  const step = (a, b, c) => (n <= 50 ? a + (b - a) * lo : b + (c - b) * t); // Wert bei 0 → 50 → 100
  s.setProperty('--bar-p', `${Math.round(step(90, 8, 3))}%`);        // Deckkraft der Leiste
  s.setProperty('--bar-blur', `${Math.round(step(20, 57, 25))}px`);  // Unschärfe: zum Ende hin wieder klarer
  s.setProperty('--sheet-p', `${Math.round(step(92, 10, 4))}%`);     // Deckkraft der Sheets
  s.setProperty('--sheet-blur', `${Math.round(step(24, 67, 29))}px`);
  s.setProperty('--field-p', `${Math.round(step(95, 32, 16))}%`);    // Eingabefelder, Knöpfe, Listen in Sheets
  s.setProperty('--dim', step(0.28, 0.065, 0.026).toFixed(3));       // Abdunkelung hinter dem Sheet
  s.setProperty('--sheen-p', `${Math.round(Math.min(1, n / 50) * 100)}%`); // Lichtreflex: bei 0 aus, ab 50 voll
}
document.addEventListener('input', (e) => {
  if (e.target.id !== 'glassRange') return;
  const g = +e.target.value;
  try { localStorage.setItem('ek_glass2', String(g)); } catch (_) { /* privat */ }
  applyGlass(g);
});
// Plus/Minus für die runden Knöpfe (Personen): gezeichnet statt Schriftzeichen, damit sie genau mittig sitzen
const ICON_MINUS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ICON_PLUS_S = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
// Scrollbare Listen in Sheets: unten (und nach dem Scrollen oben) weich ausblenden, solange dort noch mehr kommt
function updateFade(sb) {
  sb.classList.toggle('more-b', sb.scrollHeight - sb.scrollTop - sb.clientHeight > 4);
  sb.classList.toggle('more-t', sb.scrollTop > 4);
}
document.addEventListener('scroll', (e) => { if (e.target.classList?.contains('scrollbox')) updateFade(e.target); }, true);
new MutationObserver(() => requestAnimationFrame(() => dlg().querySelectorAll('.scrollbox').forEach(updateFade)))
  .observe(dlg(), { childList: true, subtree: true });

// ---------- Nach langem Drücken: nichts versehentlich markieren ----------
// Langes Drücken öffnet ein Sheet oder eine Seite, während der Finger noch liegt. Bis zum Loslassen ist
// Markieren deshalb überall gesperrt (auch in Eingabefeldern), danach ist alles wieder normal.
function holdAfterLongPress() {
  const root = document.documentElement, ends = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'];
  root.classList.add('lphold');
  const off = () => {
    ends.forEach((t) => document.removeEventListener(t, off, true));
    setTimeout(() => { root.classList.remove('lphold'); try { window.getSelection()?.removeAllRanges(); } catch (_) { /* egal */ } }, 60);
  };
  ends.forEach((t) => document.addEventListener(t, off, true));
}
document.addEventListener('selectstart', (e) => { if (document.documentElement.classList.contains('lphold')) e.preventDefault(); }, true);

// ---------- Stichwörter in der Mehrzahl (Umstellung gespeicherter Kategorien) ----------
// Alte Standard-Stichwörter in Einzahl werden zur Mehrzahl (so, wie man es kauft). Eigene Stichwörter bleiben unberührt.
// Läuft bei jedem Start, ändert aber nur, was noch in der alten Form da ist.
const KW_PLURAL = { 'tomate': 'tomaten', 'zwiebel': 'zwiebeln', 'karotte': 'karotten', 'möhre': 'möhren', 'kartoffel': 'kartoffeln', 'zitrone': 'zitronen', 'orange': 'orangen', 'mandarine': 'mandarinen', 'banane': 'bananen', 'birne': 'birnen', 'champignon': 'champignons', 'pilz': 'pilze', 'avocado': 'avocados', 'limette': 'limetten', 'pfirsich': 'pfirsiche', 'süßkartoffel': 'süßkartoffeln', 'frühlingszwiebel': 'frühlingszwiebeln' };
function migrateKeywords() {
  let changed = false;
  const all = () => new Set(S.cats.flatMap((c) => c.kw));
  S.cats.forEach((c) => {
    const kw = c.kw.map((k) => { const p = KW_PLURAL[k]; if (p) { changed = true; return p; } return k; });
    c.kw = [...new Set(kw)];
    const a = c.kw.indexOf('apfel'), b = c.kw.indexOf('äpfel'); // „Äpfel“ soll als Vorschlag kommen, nicht „Apfel“
    if (a > -1 && b > a) { c.kw.splice(b, 1); c.kw.splice(a, 0, 'äpfel'); changed = true; }
  });
  const obst = S.cats.find((c) => c.id === 'obst'), have = all();
  if (obst) ['erdbeeren', 'himbeeren', 'heidelbeeren'].forEach((w) => { if (!have.has(w)) { obst.kw.push(w); changed = true; } });
  if (changed) indexCats();
  return changed;
}

// ---------- Haptik (kurzes Klicken) ----------
// Android: Vibration. iPhone: Web-Apps dürfen nicht vibrieren, aber seit iOS 18 klickt Safari spürbar,
// wenn ein Schalter (<input type="checkbox" switch>) umgeschaltet wird. Ein unsichtbarer Schalter macht das nach.
// Wirkt nur direkt nach einem Tipp (nicht zeitverzögert), sonst bleibt es einfach still.
function haptic() {
  try { if (navigator.vibrate && navigator.vibrate(12)) return; } catch (_) { /* weiter mit dem Schalter */ }
  let l = document.getElementById('hapticSwitch');
  if (!l) {
    l = document.createElement('label');
    l.id = 'hapticSwitch'; l.setAttribute('aria-hidden', 'true');
    l.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    l.innerHTML = '<input type="checkbox" switch tabindex="-1">';
  }
  const host = dlg().open ? dlg() : document.body; // bei offenem Sheet ist alles daneben gesperrt
  if (l.parentNode !== host) host.append(l);
  try { l.click(); } catch (_) { /* egal */ }
}


