'use strict';
// Start der App. Wird als letzte App-Datei geladen (vor sync.js), damit beim Start alles andere schon bekannt ist.

// ---------- Start ----------
(async function init() {
  const saved = await loadState();
  S = saved || seed();
  if (saved) introSkipAll(); // wer die App schon benutzt, bekommt die Einführung nicht ungefragt (js/hilfe.js)
  S.cats = S.cats || DEFAULT_CATS.map(cloneCat); // ältere Daten bekommen die Standard-Kategorien
  CATS = S.cats; indexCats();
  S.recent = S.recent || [];
  S.meals = S.meals || [];
  S.customTags = S.customTags || [];
  if (!S.lists || !S.lists.length) { S.lists = [{ id: uid(), name: 'Einkaufsliste', items: S.items || [] }]; S.listId = S.lists[0].id; }
  if (!curList()) S.listId = S.lists[0].id;
  S.items = curList().items || [];
  if (curList().storeId !== undefined && S.stores.some((x) => x.id === curList().storeId)) S.storeId = curList().storeId;
  // Die frühere "gelernte Zuordnung" ist jetzt Teil der Stichwörter
  if (S.learn) {
    const names = S.learnNames || {};
    Object.keys(S.learn).forEach((k) => { if (CAT_BY_ID[S.learn[k]]) learnKeyword(names[k] || k, S.learn[k]); });
    delete S.learn; delete S.learnNames;
  }
  migrateKeywords();
  S.stores.forEach((st) => st.zones.forEach((z) => { z.prods = z.prods || {}; }));
  if (!S.stores.find((s) => s.id === S.storeId)) S.storeId = S.stores[0]?.id || null;
  save();
  render();
  addFromLink(); // Kurzbefehl / Siri: ?neu=…
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* z. B. in der Vorschau nicht möglich */ });
    // Neue Version übernommen: einmal neu laden, damit auch der neue Programmcode läuft.
    // Nicht mitten im Tippen oder bei offenem Sheet, dann erst beim nächsten Wechsel aus der App heraus.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return; // allererster Start: nichts Altes zu ersetzen
      const busy = () => dlg().open || pages.length || document.activeElement?.matches?.('input, textarea, select');
      if (!busy()) { location.reload(); return; }
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') location.reload(); });
    });
  } else if ('serviceWorker' in navigator && IS_LOCAL) {
    // Lokal (lokal-starten.cmd) ohne Service Worker, damit nach dem Neuladen immer die geänderten Dateien kommen
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }
})();

