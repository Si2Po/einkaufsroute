'use strict';
// Gruppen in der Oberfläche: Auswahlfelder, Gruppen-Hinweise, Geschäft in andere Gruppe verschieben.

// ---------- Gruppen in der Oberfläche ----------
// Gruppen sind „Teilen-Kreise“: man sieht immer alles, jede Liste/jedes Geschäft/Essen gehört einer Gruppe.
// Hinweise und Auswahlfelder erscheinen nur, wenn man angemeldet ist und mehr als eine Gruppe hat.
const groupsOn = () => typeof sync !== 'undefined' && !!sync.sess && sync.groups.length > 1;
const gName = (g) => (typeof groupName === 'function' ? groupName(g) : '');
// Wohin Neues kommt: zuletzt benutzte Gruppe, sonst die der Stichwörter, sonst „Persönlich“
const defaultGroup = () => {
  if (typeof sync === 'undefined' || !sync.groups.length) return undefined;
  return sync.groups.some((x) => x.id === S.lastGroup) ? S.lastGroup : (S.catGroup || personalGroup());
};
function groupSelect(id, cur, label = 'Gruppe', attrs = '') {
  if (!groupsOn()) return '';
  return `<label class="srow"><span class="pl gpl">${ICON_GROUP}${label}</span><select id="${id}" aria-label="${label}"${attrs}>${sync.groups.map((x) => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
}
// Zwei Personen, Linien wie die anderen Symbole
const ICON_GROUP = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M15.6 5.6a3 3 0 0 1 0 5.8M17.4 14.6c1.9.6 3.2 2.3 3.6 4.9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
// Kleiner Hinweis in der Unterzeile: „👥 Einkauf · …“ (schlichter Text, bündig mit dem Rest)
const groupTag = (g, sep = ' · ') => (groupsOn() && g ? `<span class="gtag">${ICON_GROUP}${esc(gName(g))}</span>${sep}` : '');
// Unauffällige Gruppen-Auswahl (Essen): nur Symbol + Auswahl, ohne Kasten
function groupLine(id, cur, attrs = '') {
  if (!groupsOn()) return '';
  return `<label class="gline">${ICON_GROUP}<select id="${id}" aria-label="Gruppe"${attrs}>${sync.groups.map((x) => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
}
// Gruppe wechseln (Liste, Geschäft, Essen, Stichwörter)
document.addEventListener('change', (e) => {
  const t = e.target, v = t.value;
  if (!v) return;
  if (t.id === 'leGroup') {
    const l = S.lists.find((x) => x.id === t.dataset.id);
    if (l && l.g !== v) { l.g = v; S.lastGroup = v; commit(); toast(`„${l.name}“ ist jetzt in „${gName(v)}“`); }
  } else if (t.id === 'stGroup') {
    const st = S.stores.find((x) => x.id === t.dataset.id);
    if (st && st.g !== v) { st.g = v; commit(); closeSheet(); toast(`„${st.name}“ ist jetzt in „${gName(v)}“`); }
  } else if (t.id === 'meGroup') {
    const m = mealById(t.dataset.id);
    if (m && m.g !== v) { m.g = v; S.lastGroup = v; save(); render(); toast(`„${m.name}“ ist jetzt in „${gName(v)}“`); }
  } else if (t.id === 'catGroupSel') {
    if (typeof setCatGroup === 'function') { setCatGroup(v); commit(); catListPage(); toast(`Kategorien und Stichwörter von „${gName(v)}“`); }
  }
});
// Geschäft für eine Liste gewählt, das in einer anderen Gruppe liegt: einmal fragen, ob es mitkommt
function offerStoreMove() {
  const l = curList(), st = curStore();
  if (!groupsOn() || !l || !st || !l.g || !st.g || l.g === st.g) return false;
  openSheet(`<div class="sheettitle">Geschäft verschieben?</div>
    <p class="sheetnote" style="margin:0 4px 10px">„${esc(st.name)}“ liegt in „${esc(gName(st.g))}“. Damit alle in „${esc(gName(l.g))}“ die Liste danach sortieren können, kann das Geschäft in diese Gruppe umziehen. Du siehst es danach weiterhin.</p>
    <div class="actions"><button type="button" class="btn ghost" data-act="closedlg">Nicht jetzt</button><button type="button" class="btn" style="flex:1" data-act="movestore" data-id="${st.id}" data-g="${l.g}">In „${esc(gName(l.g))}“ verschieben</button></div>`);
  return true;
}
