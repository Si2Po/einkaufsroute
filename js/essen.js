'use strict';
// Essen: Zutaten auf einen Tipp auf die Liste, Mengenrechner, Zufall, Favoriten, Bearbeiten.

// ---------- Essen: Zutaten auf einen Tipp auf die Liste, mit Mengenrechner und Zufall ----------
const DEFAULT_TAGS = ['Nudeln', 'Reis', 'schnell', 'viel Gemüse'];
Object.assign(ui, { mealTags: [], mealQ: '', mealId: null, mealPortions: 2, mealPick: new Set(), mealRandom: false, lastRandom: null, confirmMeal: false });
const meals = () => (S.meals = S.meals || []);
const mealById = (id) => meals().find((m) => m.id === id);
// Favoriten sind ein fester Tag „★“: steht immer vorne, Favoriten stehen in der Liste oben
const FAV = '★';
const isFav = (m) => m.tags.includes(FAV);
const plainTags = (m) => m.tags.filter((t) => t !== FAV);
const allTags = () => [FAV, ...[...new Set([...meals().flatMap((m) => m.tags), ...(S.customTags || [])])].filter((t) => t !== FAV).sort((a, b) => a.localeCompare(b, 'de'))];
const tagUsed = (t) => meals().some((m) => m.tags.includes(t));
function filteredMeals() {
  const q = fold(ui.mealQ.trim());
  return meals()
    .filter((m) => ui.mealTags.every((t) => m.tags.includes(t)) && (!q || fold(m.name).includes(q) || m.ing.some((i) => fold(i.name).includes(q))))
    .sort((a, b) => isFav(b) - isFav(a) || a.name.localeCompare(b.name, 'de')); // Favoriten oben, sonst A–Z
}
const fmtNum = (v) => String(v).replace('.', ',');
const fmtPortions = (p) => `${fmtNum(p)} ${p === 1 ? 'Person' : 'Personen'}`;
// "200g" -> "300g", "2" -> "3", "1,5l" -> "2,3l" (Menge hochrechnen; Text ohne Zahl bleibt)
function scaleQty(qty, f) {
  const m = String(qty || '').match(/^(\d+(?:[.,]\d+)?)(.*)$/);
  if (!m) return qty || '';
  let v = parseFloat(m[1].replace(',', '.')) * f;
  v = v >= 50 ? Math.round(v / 5) * 5 : v >= 10 ? Math.round(v) : Math.max(0.1, Math.round(v * 10) / 10);
  return fmtNum(v) + m[2];
}
function mealCard(m) {
  const sub = [plainTags(m).join(' · '),`${m.ing.length} ${m.ing.length === 1 ? 'Zutat' : 'Zutaten'}`].filter(Boolean).join(' · ');
  return `<li class="swp" data-mid="${m.id}"><button type="button" class="card mcard" data-act="m_open" data-id="${m.id}">${m.photo ? `<img class="mthumb" src="${m.photo}" alt="">` : ''}<span class="mt"><strong>${isFav(m) ? '<span class="favmark" aria-label="Favorit">★</span>' : ''}${esc(m.name)}</strong><small>${esc(sub)}</small></span></button></li>`;
}
function mealListHtml() {
  if (!meals().length) return '<p class="empty">Noch kein Essen. Lege eins an, dann kommen seine Zutaten mit einem Tipp auf die Liste.</p>';
  const list = filteredMeals();
  return list.length ? `<ul class="cards">${list.map(mealCard).join('')}</ul><p class="tip bedien">Tippen: auf die Liste · Gedrückt halten: bearbeiten</p>` : '<p class="empty">Nichts passt zu dieser Auswahl.</p>';
}
// Ein Tag zum Filtern. „★“ = nur Favoriten. Ein Tag ohne Essen wird mit „×“ angezeigt: Antippen entfernt ihn.
function filterChip(t) {
  const on = ui.mealTags.includes(t);
  let cls = 'chip' + (on ? ' on' : ''), extra = '', label = esc(t);
  if (t === FAV) {
    cls += ' favchip'; extra = ' aria-label="Nur Favoriten"';
  } else if (!tagUsed(t)) {
    cls += ' unused'; extra = ' title="Kein Essen mit diesem Tag: Tippen entfernt ihn"'; label += ' ×';
  }
  return `<button type="button" class="${cls}" data-act="m_tag" data-tag="${esc(t)}" aria-pressed="${on}"${extra}>${label}</button>`;
}
function viewMeals() {
  const tags = allTags();
  return `<div class="edhead"><h2>Essen</h2></div>
    ${meals().length ? `<input id="mealQ" type="search" class="notein catsearch" placeholder="Essen oder Zutat suchen" aria-label="Essen suchen" autocomplete="off" value="${esc(ui.mealQ)}">` : ''}
    <div class="chips mtags" role="group" aria-label="Tags">${tags.map(filterChip).join('')}${ui.ovTagInput
      ? '<form id="mOvTagForm" class="tagadd" autocomplete="off"><input id="mOvTagNew" autofocus placeholder="Neuer Tag" aria-label="Neuer Tag" enterkeyhint="done"><button type="submit" class="chipbtn" aria-label="Tag hinzufügen">✓</button></form>'
      : '<button type="button" class="chip tagplus" data-act="m_ovtagplus" aria-label="Neuen Tag anlegen">+</button>'}</div>
    <div class="actions mact">${meals().length ? '<button type="button" class="btn" data-act="m_random">Zufälliges Essen</button>' : ''}<button type="button" class="btn ghost" data-act="m_new">+ Neues Essen</button></div>
    <div id="mealList">${mealListHtml()}</div>`;
}
function startMeal(id, random) {
  const m = mealById(id);
  if (!m) return;
  ui.mealId = id; ui.mealRandom = !!random; ui.mealPortions = m.base || 2; ui.confirmMeal = false;
  ui.mealPick = new Set(m.ing.filter((i) => !i.basic).map((i) => i.id)); // Basis-Zutaten hast du meist da
  mealSheet();
}
// Basis-Zutaten stehen immer ganz unten (sonst in der eingegebenen Reihenfolge)
const ingSorted = (m) => [...m.ing.filter((i) => !i.basic), ...m.ing.filter((i) => i.basic)];
function mealSheet() {
  const m = mealById(ui.mealId);
  if (!m) return;
  const f = ui.mealPortions / (m.base || 2);
  const rows = ingSorted(m).map((i) => `<li><label class="mrow"><input type="checkbox" data-act="m_pick" data-id="${i.id}"${ui.mealPick.has(i.id) ? ' checked' : ''}><span class="mn">${esc(i.name)}${i.basic ? ' <small class="basic">Basis</small>' : ''}</span><span class="mq">${esc(scaleQty(i.qty, f))}</span></label></li>`).join('');
  openSheet(`<div class="sheettitle">${esc(m.name)}<button type="button" class="favbtn${isFav(m) ? ' on' : ''}" data-act="m_fav" aria-pressed="${isFav(m)}" aria-label="Favorit">${isFav(m) ? '★' : '☆'}</button></div>
    ${plainTags(m).length ? `<p class="sheetnote" style="margin:-4px 0 8px">${esc(plainTags(m).join(' · '))}</p>` : ''}
    ${m.photo ? `<img class="mphoto" src="${m.photo}" alt="">` : ''}
    <div class="mstep"><button type="button" class="stepbtn" data-act="m_pm" data-d="-0.5" aria-label="Weniger Personen"${ui.mealPortions <= 0.5 ? ' disabled' : ''}>${ICON_MINUS}</button><span class="mpers">${fmtPortions(ui.mealPortions)}</span><button type="button" class="stepbtn" data-act="m_pm" data-d="0.5" aria-label="Mehr Personen">${ICON_PLUS_S}</button></div>
    ${m.ing.length ? `<ul class="scrollbox mings">${rows}</ul>` : '<p class="sheetnote">Noch keine Zutaten. Tippe auf „Bearbeiten“.</p>'}
    <div class="actions mealacts">
      <button type="button" class="btn ghost" data-act="m_edit">Bearbeiten</button>
      ${ui.mealRandom ? `<button type="button" class="btn ghost diceBtn${ui.diceRoll ? ' roll' : ''}" data-act="m_random" aria-label="Nochmal würfeln">${ICON_DICE}</button>` : ''}
      <button type="button" class="btn" id="mAddBtn" data-act="m_tolist"${ui.mealPick.size ? '' : ' disabled'}>${mealBtnText()}</button>
    </div>
    ${m.steps ? `<details class="mmore"><summary>Kochanleitung</summary><div class="msteps">${esc(m.steps)}</div></details>` : ''}`);
  ui.diceRoll = false;
}
const mealBtnText = () => `Zu „${curList()?.name || 'Liste'}“ (${ui.mealPick.size})`;
// Würfel schräg von oben: drei sichtbare Seiten mit 1, 2 und 3 Augen
const ICON_DICE = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
  <path d="M12 2.8l8.2 4.6v9.2L12 21.2l-8.2-4.6V7.4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M12 2.8l8.2 4.6L12 12 3.8 7.4z" fill="currentColor" fill-opacity=".14"/>
  <path d="M12 12l8.2-4.6v9.2L12 21.2z" fill="currentColor" fill-opacity=".3"/>
  <path d="M3.8 7.4L12 12l8.2-4.6M12 12v9.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
  <ellipse cx="12" cy="7.4" rx="1.5" ry=".9" fill="currentColor"/>
  <circle cx="6.3" cy="11.2" r="1.1" fill="currentColor"/><circle cx="9.5" cy="17.2" r="1.1" fill="currentColor"/>
  <circle cx="14.4" cy="18" r="1.05" fill="currentColor"/><circle cx="16.1" cy="14.3" r="1.05" fill="currentColor"/><circle cx="17.8" cy="10.6" r="1.05" fill="currentColor"/>
</svg>`;
// Gedrückt halten auf einem Essen: Bearbeiten als eigene Seite
function openMealEdit(id) { ui.mealId = id; ui.confirmMeal = false; ui.mealTagInput = false; mealEditPage(); }
function mealEditPage() {
  const m = mealById(ui.mealId);
  if (!m) return;
  const tags = [...new Set([...allTags(), ...m.tags, ...DEFAULT_TAGS])];
  const ings = ingSorted(m).map((i) => `<li class="ming"><input class="mqty" data-ing="${i.id}" value="${esc(i.qty || '')}" placeholder="Menge" aria-label="Menge für ${esc(i.name)}" autocomplete="off" autocapitalize="off" enterkeyhint="done"><input class="mname" data-ingname="${i.id}" value="${esc(i.name)}" aria-label="Name der Zutat" autocomplete="off" enterkeyhint="done"><button type="button" class="chipbtn basicbtn${i.basic ? ' on' : ''}" data-act="m_basic" data-id="${i.id}" aria-pressed="${!!i.basic}">Basis</button><button type="button" class="chipbtn" data-act="m_deling" data-id="${i.id}" aria-label="${esc(i.name)} entfernen">×</button></li>`).join('');
  const mid = m.id;
  openPage('meal:' + mid, 'Essen bearbeiten', `
    <input id="mName" class="notein" value="${esc(m.name)}" aria-label="Name">
    <div class="label" style="margin:12px 0 4px">Tags</div>
    <div class="chips">${tags.map((t) => `<button type="button" class="chip${m.tags.includes(t) ? ' on' : ''}" data-act="m_edtag" data-tag="${esc(t)}" aria-pressed="${m.tags.includes(t)}">${esc(t)}</button>`).join('')}${ui.mealTagInput
      ? '<form id="mTagForm" class="tagadd" autocomplete="off"><input id="mTagNew" autofocus placeholder="Neuer Tag" aria-label="Neuer Tag" enterkeyhint="done"><button type="submit" class="chipbtn" aria-label="Tag hinzufügen">✓</button></form>'
      : '<button type="button" class="chip tagplus" data-act="m_tagplus" aria-label="Neuen Tag anlegen">+</button>'}</div>
    <div class="label" style="margin:12px 0 4px">Zutaten für <span class="mstep inl"><button type="button" class="stepbtn sm" data-act="m_base" data-d="-0.5" aria-label="Weniger"${(m.base || 2) <= 0.5 ? ' disabled' : ''}>${ICON_MINUS}</button><span class="mpers">${fmtPortions(m.base || 2)}</span><button type="button" class="stepbtn sm" data-act="m_base" data-d="0.5" aria-label="Mehr">${ICON_PLUS_S}</button></span></div>
    <p class="sheetnote" style="margin:0 0 6px">„Basis“ = hast du meist da, wird beim Hinzufügen nicht vorausgewählt.</p>
    ${m.ing.length ? `<ul class="scrollbox mings edit">${ings}</ul>` : ''}
    <form id="mIngForm" class="add" autocomplete="off" style="margin:8px 0 0"><input id="mIng" placeholder="Zutat, z. B. 200g Nudeln" aria-label="Zutat hinzufügen"><button type="submit" class="plus" aria-label="Hinzufügen">${ICON_PLUS}</button></form>
    <div id="mIngSugg" class="sugg inl" role="listbox" aria-label="Vorschläge" hidden></div>
    <details class="mmore"${m.photo || m.steps ? ' open' : ''}><summary>Foto und Kochanleitung (optional)</summary>
      ${m.photo ? `<img class="mphoto" src="${m.photo}" alt="">` : ''}
      <div class="bgrow"><label for="mPhoto" class="bgadd">${ICON_CAM}<span>${m.photo ? 'Foto ersetzen' : 'Foto hinzufügen'}</span></label><input type="file" id="mPhoto" accept="image/*" hidden>${m.photo ? '<button type="button" class="chipbtn" data-act="m_delphoto" aria-label="Foto entfernen">×</button>' : ''}</div>
      <textarea id="mSteps" class="notein" rows="5" placeholder="Kochanleitung" aria-label="Kochanleitung">${esc(m.steps || '')}</textarea>
    </details>
    ${groupLine('meGroup', m.g, ` data-id="${m.id}"`)}
    <div class="actions" style="margin-top:16px">
      <button type="button" class="btn danger" data-act="m_del">${ui.confirmMeal ? 'Wirklich löschen?' : 'Essen löschen'}</button>
    </div>`, () => { if (mealById(mid)) { ui.mealId = mid; mealEditPage(); } });
}
function addIngredients(id, text) {
  const m = mealById(id);
  const parts = text.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  if (!m || !parts.length) return false;
  parts.forEach((p) => { const { qty, name } = parseEntry(p); if (m.ing.some((i) => dupKey(i.name) === dupKey(name))) return; rememberName(name); m.ing.push({ id: uid(), name, qty, basic: false }); });
  return true;
}
// Vorschläge beim Tippen einer Zutat (Menge davor bleibt erhalten: "200g Nu" -> "200g Nudeln")
function updateIngSugg() {
  const box = $('#mIngSugg'), input = $('#mIng'), m = mealById(ui.mealId);
  if (!box || !input || !m) return;
  const q = parseEntry(input.value.split(',').pop()).name;
  const have = new Set(m.ing.map((i) => dupKey(i.name)));
  const list = suggestions(q).filter((x) => !have.has(dupKey(x.name)));
  if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
  const qf = fold(q);
  box.innerHTML = list.map((x) => {
    const hit = fold(x.name).startsWith(qf) ? `<b>${esc(x.name.slice(0, qf.length))}</b>${esc(x.name.slice(qf.length))}` : esc(x.name);
    return `<button type="button" class="sg" role="option" data-act="m_ingsugg" data-name="${esc(x.name)}"><span class="sgn">${hit}</span><span class="sgtag">${esc(CAT_BY_ID[x.cat]?.name || 'Sonstiges')}</span></button>`;
  }).join('');
  box.hidden = false;
}
function addCustomTag(text) {
  const t = text.trim();
  ui.ovTagInput = false;
  if (t && !allTags().some((x) => x.toLowerCase() === t.toLowerCase())) { (S.customTags = S.customTags || []).push(t); save(); }
  render();
}
document.addEventListener('focusout', (e) => { if (e.target.id === 'mOvTagNew' && ui.ovTagInput) addCustomTag(e.target.value); });
// Zutat umbenennen: leeres Feld beim Verlassen auf den alten Namen zurücksetzen, Enter schließt die Tastatur
document.addEventListener('focusout', (e) => { const t = e.target; if (t.dataset?.ingname && !t.value.trim()) { const i = mealById(ui.mealId)?.ing.find((x) => x.id === t.dataset.ingname); if (i) t.value = i.name; } });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target.dataset?.ingname || e.target.dataset?.ing)) { e.preventDefault(); e.target.blur(); } });
function addTagsTo(m, text) {
  const t = text.split(',').map((x) => x.trim()).filter((x) => x && !m.tags.some((y) => y.toLowerCase() === x.toLowerCase()));
  if (!t.length) return false;
  m.tags.push(...new Set(t));
  return true;
}
// Zutaten eines Essens auf die aktive Liste setzen; liefert Anzahl und die neuen Einträge
function addMealItems(m, portions, pick) {
  const f = portions / (m.base || 2);
  const fresh = [];
  let dup = 0;
  m.ing.filter((i) => pick.has(i.id)).forEach((i, n) => {
    // Jedes Essen bekommt seinen eigenen Eintrag mit eigener Menge; nur dasselbe Essen nicht zweimal
    if (S.items.some((x) => !x.done && dupKey(x.name) === dupKey(i.name) && x.meals?.includes(m.name))) { dup++; return; }
    rememberName(i.name);
    const it = { id: uid(), name: i.name, qty: scaleQty(i.qty, f), note: '', meals: [m.name], cat: guessCat(i.name), done: false, ts: Date.now() + n };
    S.items.push(it); fresh.push(it);
  });
  return { added: fresh.length, dup, fresh };
}
const addedMsg = (r) => `${r.added} ${r.added === 1 ? 'Zutat' : 'Zutaten'} auf der Liste${r.dup ? `, ${r.dup} schon drauf` : ''}`;
function mealToList() {
  const m = mealById(ui.mealId);
  if (!m) return;
  const r = addMealItems(m, ui.mealPortions, ui.mealPick);
  closeSheet(); save();
  toast(addedMsg(r));
  funMealAdded(m);
}
function randomMeal() {
  const pool = filteredMeals();
  if (!pool.length) { toast(meals().length ? 'Nichts passt zu dieser Auswahl' : 'Lege zuerst ein Essen an'); return; }
  funRolled();
  const opts = pool.length > 1 ? pool.filter((m) => m.id !== ui.lastRandom) : pool;
  const m = opts[Math.floor(Math.random() * opts.length)];
  ui.lastRandom = m.id;
  startMeal(m.id, true);
}
function newMealSheet() {
  openSheet(`<div class="sheettitle">Neues Essen</div>
    <form id="newMealForm" autocomplete="off">
      <input id="newMealName" autofocus class="notein" placeholder="Name, z. B. Spaghetti Bolognese" aria-label="Name des Essens" required>
      ${groupLine('nmGroup', defaultGroup())}
      <button type="submit" class="btn">Anlegen</button>
    </form>`);
}
// Klicks auf Essen-Elemente (Capture: die allgemeine Klick-Behandlung soll das Sheet nicht schließen)
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-act^="m_"]');
  if (!el) return;
  e.stopImmediatePropagation();
  if (Date.now() - (ui.swipedT || 0) < 350) return; // Klick nach dem Wischen
  const act = el.dataset.act, id = el.dataset.id, m = mealById(ui.mealId);
  switch (act) {
    case 'm_ovtagplus': ui.ovTagInput = true; render(); break;
    case 'm_tag': { const t = el.dataset.tag;
      if (t !== FAV && !tagUsed(t)) { S.customTags = (S.customTags || []).filter((x) => x !== t); ui.mealTags = ui.mealTags.filter((x) => x !== t); save(); render(); break; } // Tag ohne Essen: entfernen
 ui.mealTags = ui.mealTags.includes(t) ? ui.mealTags.filter((x) => x !== t) : [...ui.mealTags, t]; render(); break; }
    case 'm_new': newMealSheet(); break;
    case 'm_fav': if (m) { m.tags = isFav(m) ? plainTags(m) : [FAV, ...m.tags]; haptic(); save(); render(); mealSheet(); } break;
    case 'm_open': if (lpFired) { lpFired = false; break; } startMeal(id, false); break; // nicht nach langem Drücken
    case 'm_random': haptic(); ui.diceRoll = !!el.closest('#dlg'); randomMeal(); break; // im Sheet wackelt der Würfel
    case 'm_pick': ui.mealPick.has(id) ? ui.mealPick.delete(id) : ui.mealPick.add(id); { const b = $('#mAddBtn'); if (b) { b.textContent = mealBtnText(); b.disabled = !ui.mealPick.size; } } break;
    case 'm_pm': ui.mealPortions = Math.max(0.5, Math.min(50, ui.mealPortions + parseFloat(el.dataset.d))); mealSheet(); break;
    case 'm_tolist': mealToList(); break;
    case 'm_edit': ui.confirmMeal = false; ui.mealTagInput = false; mealEditPage(); break;
    case 'm_tagplus': ui.mealTagInput = true; mealEditPage(); break;
    case 'm_view': flushSheetInputs(); render(); startMeal(ui.mealId, false); break;
    case 'm_edtag': if (m) { const t = el.dataset.tag; m.tags = m.tags.includes(t) ? m.tags.filter((x) => x !== t) : [...m.tags, t]; save(); mealEditPage(); } break;
    case 'm_base': if (m) { m.base = Math.max(0.5, Math.min(50, (m.base || 2) + parseFloat(el.dataset.d))); save(); mealEditPage(); } break;
    case 'm_basic': { const i = m?.ing.find((x) => x.id === id); if (i) { i.basic = !i.basic; save(); mealEditPage(); } break; }
    case 'm_ingsugg': {
      const input = $('#mIng');
      if (!m || !input) break;
      const parts = input.value.split(',').map((x) => x.trim());
      const last = parseEntry(parts.pop());
      const txt = [...parts.filter(Boolean), `${last.qty ? last.qty + ' ' : ''}${el.dataset.name}`].join(',');
      if (addIngredients(m.id, txt)) { save(); mealEditPage(); $('#mIng')?.focus(); }
      break;
    }
    case 'm_deling': if (m) { m.ing = m.ing.filter((x) => x.id !== id); save(); mealEditPage(); } break;
    case 'm_delphoto': if (m) { m.photo = null; save(); mealEditPage(); } break;
    case 'm_del':
      if (!ui.confirmMeal) { ui.confirmMeal = true; mealEditPage(); break; }
      S.meals = meals().filter((x) => x !== m); ui.confirmMeal = false; popPages(1); commit(); break;
  }
}, true);
document.addEventListener('input', (e) => {
  const t = e.target, m = mealById(ui.mealId);
  if (t.id === 'mealQ') { ui.mealQ = t.value; const l = $('#mealList'); if (l) l.innerHTML = mealListHtml(); }
  else if (t.id === 'mIng') updateIngSugg();
  else if (t.dataset.ing && m) { const i = m.ing.find((x) => x.id === t.dataset.ing); if (i) { i.qty = t.value.trim(); save(); } }
  else if (t.dataset.ingname && m) { const i = m.ing.find((x) => x.id === t.dataset.ingname), v = t.value.trim(); if (i && v) { i.name = v; save(); } } // leer lassen = alter Name bleibt
  else if (t.id === 'mName' && m && t.value.trim()) { m.name = t.value.trim(); save(); }
  else if (t.id === 'mSteps' && m) { m.steps = t.value; save(); }
});
document.addEventListener('submit', (e) => {
  const f = e.target, m = mealById(ui.mealId);
  if (f.id === 'newMealForm') {
    e.preventDefault();
    const name = $('#newMealName').value.trim();
    if (!name) return;
    const nm = { id: uid(), name, tags: [...ui.mealTags], base: 2, ing: [], photo: null, steps: '', g: $('#nmGroup')?.value || defaultGroup() };
    if (nm.g) S.lastGroup = nm.g;
    meals().push(nm); ui.mealId = nm.id; ui.mealTagInput = false; save(); render(); mealEditPage();
  } else if (f.id === 'mOvTagForm') {
    e.preventDefault();
    addCustomTag($('#mOvTagNew').value);
  } else if (f.id === 'mIngForm') {
    e.preventDefault();
    if (m && addIngredients(m.id, $('#mIng').value)) { save(); mealEditPage(); $('#mIng')?.focus(); }
  } else if (f.id === 'mTagForm') {
    e.preventDefault();
    if (m) { addTagsTo(m, $('#mTagNew').value); ui.mealTagInput = false; save(); mealEditPage(); }
  }
}, true);
document.addEventListener('change', async (e) => {
  const t = e.target, m = mealById(ui.mealId);
  if (t.id === 'mPhoto' && t.files[0] && m) {
    try { m.photo = (await photoToDataUrl(t.files[0], 900)).url; save(); mealEditPage(); } catch (err) { /* Bild nicht lesbar */ }
  }
});

