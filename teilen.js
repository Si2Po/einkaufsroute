'use strict';
/* Liste per Link teilen, ohne Konto (Datenbank: supabase/schritte/gast.sql, Gast-Ansicht: gast.html + gast.js).
   „Per Link teilen“ erzeugt einen Schlüssel (guest_link). Er steht in der Liste als l.share und reist mit dem
   Abgleich zu allen in der Gruppe, damit jeder den Link noch einmal verschicken kann. „Teilen beenden“
   (guest_link_off) macht ihn sofort ungültig. Gäste können nur abhaken und hinzufügen. */

const guestLink = (k) => location.origin + location.pathname.replace(/[^/]*$/, '') + 'gast.html#' + k;

// Abschnitt in „Liste bearbeiten“ (js/listen.js)
function shareBlock(l) {
  if (!sync.sess || !l.g) {
    return `<div class="sheettitle" style="margin-top:16px">Teilen</div><p class="sheetnote" style="margin:0 4px">Zum Teilen per Link musst du angemeldet sein (Einstellungen → Konto und Gruppen).</p>`;
  }
  const msg = ui.shareMsg ? `<p class="sheetnote" role="status" style="color:var(--${ui.shareMsg.startsWith('!') ? 'warn' : 'accent'})">${esc(ui.shareMsg.replace(/^!/, ''))}</p>` : '';
  if (!l.share) {
    return `<div class="sheettitle" style="margin-top:16px">Teilen</div>
      <p class="sheetnote" style="margin:0 4px 8px">Schick die Liste per Link an jemanden ohne Konto. Er kann sie im Browser ansehen, abhaken und etwas hinzufügen, aber nichts löschen.</p>
      ${msg}
      <button type="button" class="btn ghost" style="width:100%" data-act="sh_on" data-id="${l.id}">Per Link teilen</button>`;
  }
  return `<div class="sheettitle" style="margin-top:16px">Teilen</div>
    <p class="sheetnote" style="margin:0 4px 8px">Die Liste ist per Link geteilt. Wer den Link hat, kann sie ansehen, abhaken und etwas hinzufügen.</p>
    <div class="siricopy"><code class="sel">${esc(guestLink(l.share))}</code></div>
    ${msg}
    <div class="actions" style="margin-top:8px">
      <button type="button" class="btn" style="flex:1" data-act="sh_send" data-id="${l.id}">${navigator.share ? 'Link schicken' : 'Link kopieren'}</button>
      <button type="button" class="btn danger" style="flex:1" data-act="sh_off" data-id="${l.id}">${ui.confirmShare === l.id ? 'Wirklich beenden?' : 'Teilen beenden'}</button>
    </div>`;
}

async function sendGuestLink(l) {
  const url = guestLink(l.share);
  if (navigator.share) {
    try { await navigator.share({ title: l.name, text: `Meine Liste „${l.name}“:`, url }); } catch (_) { /* abgebrochen */ }
    return;
  }
  toast((await copyText(url)) ? 'Link kopiert' : 'Bitte den Link oben markieren und kopieren');
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act^="sh_"]');
  if (!el) return;
  e.stopImmediatePropagation();
  const l = S.lists.find((x) => x.id === el.dataset.id);
  if (!l) return;
  const act = el.dataset.act;
  const again = (msg) => { ui.shareMsg = msg || ''; if (pageTop() === 'list:' + l.id) listEditPage(l.id); ui.shareMsg = ''; };
  if (act === 'sh_on') {
    el.disabled = true;
    try {
      if (sync.dirty) await syncRun(); // neue Liste muss erst auf dem Server sein
      const k = await api('/rest/v1/rpc/guest_link', { method: 'POST', body: JSON.stringify({ g: l.g, lid: l.id }) });
      l.share = k; commit();
      again();
      sendGuestLink(l);
    } catch (err) {
      again('!' + (err.status === 404 ? 'Die Datenbank kennt das Teilen noch nicht (gast.sql fehlt).' : niceError(err)));
    }
  } else if (act === 'sh_send') {
    sendGuestLink(l);
  } else if (act === 'sh_off') {
    if (ui.confirmShare !== l.id) { ui.confirmShare = l.id; again(); return; }
    ui.confirmShare = null;
    try {
      await api('/rest/v1/rpc/guest_link_off', { method: 'POST', body: JSON.stringify({ lid: l.id }) });
      delete l.share; commit();
      again('Teilen beendet. Der alte Link geht nicht mehr.');
    } catch (err) { again('!' + niceError(err)); }
  }
}, true);
