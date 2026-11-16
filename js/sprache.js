'use strict';
// Sprache: Deutsch oder Englisch. Wird als Erstes geladen (nach js/en.js mit den englischen Texten).
// Die Sprache richtet sich nach dem Gerät (Deutsch bei deutschem Gerät, sonst Englisch) oder nach dem Schalter unter
// Einstellungen → Darstellung (ek_lang, gilt nur für dieses Gerät, wie die Darstellung).
//
// Im Code stehen die deutschen Texte, immer in T('…'). Der deutsche Text ist zugleich der Schlüssel für die Übersetzung
// in js/en.js. Fehlt dort ein Eintrag, erscheint der deutsche Text. Platzhalter: T('{n} Einträge', { n: 3 }).
// Neue Texte also: im Code auf Deutsch in T('…') schreiben und in js/en.js die englische Fassung ergänzen.
function langPref() {
  try { const l = localStorage.getItem('ek_lang'); return l === 'de' || l === 'en' ? l : 'auto'; } catch (_) { return 'auto'; }
}
// Sprache, die eine Einstellung ergibt ('auto' = nach dem Gerät: Deutsch bei deutschem Gerät, sonst Englisch)
function langFor(p) {
  if (p !== 'auto') return p;
  return /^de\b/i.test(navigator.language || 'de') ? 'de' : 'en';
}
const LANG = langFor(langPref());
const LOCALE = LANG === 'en' ? 'en' : 'de-DE'; // für Datum, Uhrzeit und Sortieren nach Alphabet
document.documentElement.lang = LANG;

function T(s, vars) {
  let out = LANG === 'en' && Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return out;
}
// Sprache umstellen: merken und neu laden (alle Ansichten bauen ihre Texte beim Start)
function setLang(l) {
  try { if (l === 'auto') localStorage.removeItem('ek_lang'); else localStorage.setItem('ek_lang', l); } catch (_) { /* privat: geht nicht */ }
  location.reload();
}
// Feste Beschriftung aus index.html (untere Leiste)
document.getElementById('tabbar')?.setAttribute('aria-label', T('Bereiche'));
