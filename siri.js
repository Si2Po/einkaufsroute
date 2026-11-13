'use strict';
/* Siri-Eingang (Datenbank: supabase/siri.sql).
   Ein Siri-Kurzbefehl schickt das Gesagte mit einem persönlichen Siri-Schlüssel an die Datenbank (siri_add), auch bei
   gesperrtem iPhone. Dort liegt es im Eingangskorb der Gruppe. Beim Abgleich holt die App den Korb ab (siri_take),
   zerlegt den Text wie beim Tippen und setzt die Einträge auf die gewählte Liste. Das macht das Gerät aus der Gruppe,
   das gerade offen ist. Der Schlüssel liegt in der Datenbank nur als Prüfsumme; im Klartext merkt ihn sich nur das
   Gerät, auf dem er erzeugt wurde (localStorage), damit die Anleitung ihn noch einmal zeigen kann. */

const siri = { info: undefined, noSql: false, confirm: null };
const siriKey = () => { try { return localStorage.getItem('ek_siri_key') || ''; } catch (_) { return ''; } };
const setSiriKey = (k) => { try { if (k) localStorage.setItem('ek_siri_key', k); else localStorage.removeItem('ek_siri_key'); } catch (_) { /* privat */ } };
const notThere = (e) => e && (e.status === 404 || e.body?.code === 'PGRST202'); // siri.sql noch nicht ausgeführt

// Beim Abgleich (syncRun): Eingang abholen und eintragen. true = es kam etwas.
async function siriTake() {
  if (siri.noSql) return false;
  let rows;
  try { rows = await api('/rest/v1/rpc/siri_take', { method: 'POST', body: '{}' }); } catch (e) {
    if (notThere(e)) siri.noSql = true; // bis zum nächsten Start nicht erneut fragen
    return false; // Fehler hier sollen den übrigen Abgleich nicht stören
  }
  if (!Array.isArray(rows) || !rows.length) return false;
  const added = [];
  for (const r of rows) {
    // Ziel-Liste; gibt es sie hier nicht (mehr), die erste Einkaufsliste der Gruppe, sonst die offene
    const l = S.lists.find((x) => x.id === r.lid) || S.lists.find((x) => x.g === r.g && !isSimple(x)) || curList();
    const res = addText(String(r.t || ''), l);
    if (res) added.push(...res.added);
  }
  sync.dirty = true; sync.ver++; sync.again = true; // gleich noch ein Durchgang, der die neuen Einträge hochlädt
  if (added.length) toast(`Von Siri: ${added.join(', ')}`);
  return true;
}

// ---------- Einstellungsseite (Konto und Gruppen → Siri) ----------
async function siriLoad() {
  try {
    siri.info = await api('/rest/v1/rpc/siri_info', { method: 'POST', body: '{}' });
    siri.noSql = false;
    // Liste inzwischen in eine andere Gruppe verschoben: Ziel mitziehen, sonst sehen die anderen nichts
    const l = siri.info && S.lists.find((x) => x.id === siri.info.lid);
    if (l && l.g && l.g !== siri.info.g) { await siriSetList(l.id, true); return; }
  } catch (e) {
    if (notThere(e)) siri.noSql = true; else { siriPage('!' + niceError(e)); return; }
  }
  if (pageTop() === 'siri') siriPage();
}
async function siriSetList(lid, quiet) {
  const l = S.lists.find((x) => x.id === lid);
  if (!l || !l.g) return;
  await api('/rest/v1/rpc/siri_set_list', { method: 'POST', body: JSON.stringify({ g: l.g, lid }) });
  siri.info = { ...(siri.info || {}), g: l.g, lid };
  if (pageTop() === 'siri') siriPage(quiet ? '' : `Siri schreibt jetzt in „${l.name}“.`);
}
const siriCopy = (v, label) => `<div class="siricopy"><code class="sel">${esc(v)}</code><button type="button" class="link" data-act="siri_copy" data-v="${esc(v)}" aria-label="${label} kopieren">Kopieren</button></div>`;

function siriPage(msg) {
  const note = msg ? `<p class="sheetnote" role="status" style="color:var(--${msg.startsWith('!') ? 'warn' : 'accent'})">${esc(msg.replace(/^!/, ''))}</p>` : '';
  const intro = '<p class="sheetnote" style="margin:0 4px 12px">Sag „Hey Siri, Einkauf“ und dann, was fehlt. Das klappt auch bei gesperrtem iPhone. Die Einträge erscheinen auf der Liste, sobald jemand aus der Gruppe die App offen hat.</p>';
  let body;
  if (!sync.sess) body = '<p class="sheetnote">Für Siri musst du angemeldet sein.</p>';
  else if (siri.noSql) body = '<p class="sheetnote" style="color:var(--warn)">Die Datenbank kennt Siri noch nicht. Bitte zuerst die Datei <b>supabase/siri.sql</b> im SQL-Editor von Supabase ausführen.</p>';
  else if (siri.info === undefined) body = '<p class="sheetnote">Wird geladen …</p>';
  else {
    const info = siri.info, cur = info ? info.lid : S.listId;
    const lists = S.lists.filter((l) => l.g);
    const opts = lists.map((l) => `<option value="${l.id}"${l.id === cur ? ' selected' : ''}>${esc(l.name)}${groupsOn() ? ` (${esc(groupName(l.g))})` : ''}</option>`).join('');
    const pick = `<div class="group"><label class="srow"><span class="pl">Liste</span><select id="siriList" aria-label="Liste für Siri">${opts}</select></label></div>`;
    if (!info) {
      body = `${pick}<button type="button" class="btn" style="margin-top:12px;width:100%" data-act="siri_new">Siri einrichten</button>`;
    } else {
      const k = siriKey();
      const steps = k ? `
        <div class="sheettitle" style="margin-top:16px">Kurzbefehl einrichten</div>
        <div class="helpbody group" style="padding-top:12px"><ol>
          <li>Die App <b>Kurzbefehle</b> öffnen und mit <b>+</b> einen neuen Kurzbefehl anlegen.</li>
          <li>Aktion <b>„Nach Eingabe fragen“</b> hinzufügen. Als Frage z. B. „Was brauchst du?“ eintragen.</li>
          <li>Aktion <b>„Inhalte von URL abrufen“</b> hinzufügen. Als URL eintragen:${siriCopy(EK.url + '/rest/v1/rpc/siri_add', 'Adresse')}</li>
          <li>In dieser Aktion auf den kleinen Pfeil tippen, dann:
            <ul>
              <li><b>Methode:</b> POST</li>
              <li><b>Header:</b> neuer Header, Schlüssel <code>apikey</code>, als Text:${siriCopy(EK.key, 'App-Kennung')}</li>
              <li><b>Anfragetext:</b> JSON. Neues Feld → Text, Schlüssel <code>k</code>, als Text dein Siri-Schlüssel:${siriCopy(k, 'Siri-Schlüssel')}</li>
              <li>Noch ein neues Feld → Text, Schlüssel <code>t</code>, als Wert die Variable <b>„Bereitgestellte Eingabe“</b>.</li>
            </ul></li>
          <li>Aktion <b>„Ergebnis anzeigen“</b> hinzufügen. Siri sagt dann z. B. „Notiert: Milch und zwei Butter“.</li>
          <li>Den Kurzbefehl oben <b>„Einkauf“</b> nennen. So heißt auch der Siri-Befehl.</li>
        </ol></div>
        <p class="sheetnote" style="margin:8px 4px">Der Siri-Schlüssel ist wie ein Passwort nur zum Hinzufügen: Wer ihn hat, kann Text auf deine Liste setzen, aber nichts lesen oder löschen. Nicht weitergeben.</p>`
        : '<p class="sheetnote" style="margin:12px 4px">Siri ist eingerichtet. Den Schlüssel zeigt die App nur auf dem Gerät, auf dem er erzeugt wurde. Brauchst du ihn hier, erzeuge einen neuen. Dann musst du ihn auch im Kurzbefehl ersetzen.</p>';
      body = `${pick}${steps}
        <div class="actions" style="margin-top:16px">
          <button type="button" class="btn ghost" data-act="siri_new">${siri.confirm === 'new' ? 'Wirklich? Alter Schlüssel geht nicht mehr' : 'Neuer Schlüssel'}</button>
          <button type="button" class="btn danger" data-act="siri_off">${siri.confirm === 'off' ? 'Wirklich ausschalten?' : 'Siri ausschalten'}</button>
        </div>`;
    }
  }
  openPage('siri', 'Siri', intro + note + body, () => siriPage());
}

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'siriList' || !siri.info) return; // vor dem Einrichten gilt die Auswahl erst beim Tipp auf „Siri einrichten“
  try { await siriSetList(e.target.value); } catch (err) { siriPage('!' + niceError(err)); }
});
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act="siripage"], [data-act^="siri_"]');
  if (!el) return;
  e.stopImmediatePropagation();
  const act = el.dataset.act;
  if (act === 'siripage') { siri.confirm = null; siri.info = undefined; siriPage(); siriLoad(); return; }
  if (act === 'siri_copy') { toast((await copyText(el.dataset.v)) ? 'Kopiert' : 'Kopieren blockiert, bitte von Hand markieren'); return; }
  if (act === 'siri_new') {
    if (siri.info && siri.confirm !== 'new') { siri.confirm = 'new'; siriPage(); return; }
    siri.confirm = null;
    const l = S.lists.find((x) => x.id === $('#siriList')?.value);
    if (!l || !l.g) { siriPage('!Bitte eine Liste wählen.'); return; }
    try {
      const k = await api('/rest/v1/rpc/siri_new_key', { method: 'POST', body: JSON.stringify({ g: l.g, lid: l.id }) });
      setSiriKey(k);
      siri.info = { g: l.g, lid: l.id };
      siriPage('Siri-Schlüssel erzeugt. Richte jetzt den Kurzbefehl ein.');
    } catch (err) { siriPage('!' + niceError(err)); }
    return;
  }
  if (act === 'siri_off') {
    if (siri.confirm !== 'off') { siri.confirm = 'off'; siriPage(); return; }
    siri.confirm = null;
    try {
      await api('/rest/v1/rpc/siri_off', { method: 'POST', body: '{}' });
      setSiriKey(''); siri.info = null;
      siriPage('Siri ist ausgeschaltet. Den Kurzbefehl kannst du löschen.');
    } catch (err) { siriPage('!' + niceError(err)); }
  }
}, true);
