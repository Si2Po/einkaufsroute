'use strict';
// Hilfe: Erklärungen zum Aufklappen (Einstellungen → Hilfe) und der Schalter „Hinweise anzeigen“.

// ---------- Hinweise anzeigen (gilt nur für dieses Gerät, wie die Darstellung) ----------
// Aus: alle kleinen Bedienhinweise (Klasse „bedien“) verschwinden. Ein: sie erscheinen wieder,
// auch der Hinweis unter der Liste, der sonst nach dem ersten Bearbeiten von selbst verschwindet (S.tipSeen).
function tipsOn() {
  try { return localStorage.getItem('ek_tips') !== 'off'; } catch (_) { return true; }
}
function applyTips() {
  document.documentElement.classList.toggle('notips', !tipsOn());
}
applyTips();
document.addEventListener('change', (e) => {
  if (e.target.id !== 'tipsSwitch') return;
  const on = e.target.checked;
  try { localStorage.setItem('ek_tips', on ? 'on' : 'off'); } catch (_) { /* privat: gilt nur bis zum Schließen */ }
  if (on && S.tipSeen) { S.tipSeen = false; save(); }
  applyTips();
  render();
});

// ---------- Hilfe-Seite ----------
// Ein Thema zum Aufklappen. Inhalt: Absätze und Aufzählungen als HTML (feste Texte, keine Nutzerdaten).
const helpTopic = (title, html, icon = '') => `<details class="helpsec"><summary>${icon}<span>${title}</span></summary><div class="helpbody">${html}</div></details>`;
const ICON_SHARE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" class="inl"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 11v9h14v-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function helpPage() {
  const topics = [
    helpTopic('Die App aufs iPhone holen', `
      <ol>
        <li>Die Adresse der App in <b>Safari</b> öffnen.</li>
        <li>Unten auf <b>Teilen</b> ${ICON_SHARE} tippen.</li>
        <li><b>„Zum Home-Bildschirm“</b> wählen.</li>
      </ol>
      <p>Danach kannst du die App über das neue Symbol auf dem Home-Bildschirm öffnen.</p>
      <p>Sie hat dort einen eigenen Speicher. Wenn du dich anmeldest, werden deine Listen, Kategorien, Essen und Geschäfte synchronisiert.</p>`),
    helpTopic('Die Liste bedienen', `
      <ul>
        <li><b>Liste wählen oder anlegen:</b> unten ein zweites Mal auf ${TAB_ICONS.list} „Liste“ tippen.</li>
        <li><b>Hinzufügen:</b> oben eintippen und mit + bestätigen. Mehrere Dinge auf einmal gehen auch: einfach durch Komma trennen, z. B. „Milch, Brot, 2 Butter“. Eine Zahl am Anfang wird zur Menge.</li>
        <li><b>Gedrückt halten:</b> Eintrag bearbeiten (Name, Menge, Notiz, Foto). Im Sheet <b>nach oben wischen</b> zeigt Kategorie und Bereich.</li>
        <li><b>Halten und ziehen:</b> umsortieren, zum Beispiel nach Wichtigkeit. Ziehst du einen Eintrag zu einer anderen Kategorie oder einem anderen Bereich, merkt sich die App das. Mit „Rückgängig“ lässt es sich zurücknehmen.</li>
        <li><b>Wischen</b> nach links oder rechts: was dann passiert, stellst du unter Einstellungen → Wischen ein.</li>
        <li><b>Tippen:</b> abhaken. Der Eintrag rutscht kurz danach nach „Erledigt“. Nochmal tippen macht es rückgängig.</li>      </ul>`),
    helpTopic('Einkaufsliste und einfache Liste', `
      <p>Beim Anlegen (oder unter „Liste bearbeiten“) wählst du die <b>Art</b>:</p>
      <ul>
        <li><b>Einkaufsliste:</b> sortiert sich nach dem Laufweg im gewählten Geschäft und nach Kategorien.</li>
        <li><b>Einfache Liste:</b> für Filme, Packlisten, Ideen. Keine Kategorien, du bestimmst die Reihenfolge.
          Unten in der Liste legst du <b>Abschnitte</b> an. Abschnitt antippen: Neues kommt dorthin. Abschnitt gedrückt halten: umbenennen, verschieben, löschen.</li>
        <li>Bei einfachen Listen wählst du auch, ob Abgehaktes nach unten rutscht oder durchgestrichen stehen bleibt (praktisch für Packlisten).</li>
      </ul>`),
    helpTopic('Geschäfte und Grundriss', `
      <ul>
        <li>Lege für jedes Geschäft seine <b>Bereiche</b> in der Reihenfolge deines Laufwegs an und wähle, welche Kategorien dort liegen. Die Liste sortiert sich dann genau so.</li>
        <li>Der <b>Grundriss</b> ist optional: Bereiche einzeichnen hilft beim Wiederfinden, für die Sortierung reicht die Reihenfolge.</li>
        <li>Liegt ein Produkt woanders als seine Kategorie, ziehe es in der Liste in den richtigen Bereich (oder wähle im Eintrag den „Bereich“). Das gilt dann nur für dieses Geschäft.</li>
        <li>Liegt eine Kategorie in mehreren Bereichen, markiert der <b>★</b>, welcher Bereich hauptsächlich für diese Kategorie verwendet werden soll.</li>
      </ul>`),
    helpTopic('Kategorien und Stichwörter', `
      <ul>
        <li>Die App ordnet neue Einträge anhand von <b>Stichwörtern</b> einer Kategorie zu („Tomaten“ → Obst & Gemüse).</li>
        <li>Ordnest du einen Eintrag selbst um, <b>lernt</b> sie das für das nächste Mal.</li>
        <li>Unter Einstellungen → Kategorien siehst du alle Stichwörter, legst eigene Kategorien an und bestimmst die Reihenfolge, wenn kein Geschäft gewählt ist (gedrückt halten zum Sortieren).</li>
      </ul>`),
    helpTopic('Essen', `
      <ul>
        <li><b>Antippen:</b> Zutaten auswählen, Personenanzahl anpassen und mit einem Tipp auf die Liste setzen. Die Mengen rechnen sich mit.</li>
        <li><b>Basis</b>-Zutaten (z. B. Salz, Öl) hast du meist da: sie sind nicht vorausgewählt.</li>
        <li><b>Tags</b> sind kurze Merkmale wie „schnell“ oder „Nudeln“.<br>
          Du vergibst sie beim Bearbeiten eines Essens.<br>
          Tippst du oben auf einen Tag, siehst du nur Essen mit diesem Tag (bei mehreren nur die, die alle haben). Mit + legst du neue Tags an.</li>
        <li><b>★</b> ist der Tag für deine <b>Favoriten</b>. Favoriten stehen in der Übersicht immer oben.</li>
        <li><b>Zufälliges Essen</b> wählt eins aus, passend zu den gewählten Tags. Der Würfel würfelt neu.</li>
        <li><b>Gedrückt halten:</b> Essen bearbeiten (Zutaten, Tags, Foto, Kochanleitung).</li>
      </ul>`),
    helpTopic('Gruppen', `
      <ul>
        <li>Du siehst immer <b>alles</b> aus allen deinen Gruppen. Die Gruppe regelt nur, <b>wer etwas mitsieht</b>.</li>
        <li><b>Persönlich</b> siehst nur du. Weitere Gruppen (z. B. „Einkauf“) kannst du mit anderen teilen.</li>
        <li>Das Symbol ${ICON_GROUP} zeigt, zu welcher Gruppe eine Liste oder ein Geschäft gehört.</li>
        <li>Gruppe ändern: Liste oder Geschäft bearbeiten → „Gruppe“. Beim Essen ganz unten beim ${ICON_GROUP}.</li>
        <li>Wählst du für eine Liste ein Geschäft aus einer anderen Gruppe, fragt die App, ob es mit umziehen soll, damit alle danach sortieren können.</li>
        <li><b>Kategorien und Stichwörter</b> gehören zu einer Gruppe und werden mit ihr geteilt. Was die App dazulernt, lernt sie für alle in der Gruppe.<br>
          Unter Kategorien wählst du bei „Stichwörter von“, welche Gruppe deine Listen zum Einordnen verwenden.</li>
        <li>Unter Einstellungen → Konto und Gruppen kannst du neue Gruppen anlegen, andere Personen einladen, einer Gruppe beitreten oder sie wieder verlassen.</li>
      </ul>`, ICON_GROUP),
    helpTopic('Konto, Abgleich und Sicherung', `
      <ul>
        <li>Wenn du angemeldet bist, gleicht die App deine Daten automatisch ab: jedes Mal, wenn du sie öffnest, und danach alle paar Sekunden, solange sie geöffnet ist. Änderungen der anderen in deinen Gruppen siehst du so nach kurzer Zeit auch bei dir.</li>
        <li><b>Ohne Netz</b> kannst du die App ganz normal weiter benutzen, zum Beispiel im Laden ohne Empfang. Deine Änderungen werden abgeglichen, sobald du wieder Netz hast.</li>
        <li>Ändern zwei Personen gleichzeitig denselben Eintrag, bleibt die Änderung erhalten, die zuletzt abgeglichen wurde.</li>
        <li><b>Abmelden:</b> Wenn du dich abmeldest, bleiben deine Daten auf diesem Gerät erhalten. Sie werden dann nur nicht mehr abgeglichen.</li>
        <li><b>Sicherung:</b> Unter Einstellungen → Konto und Gruppen → Daten sichern und übertragen kannst du alles als Datei oder als Text sichern. So nimmst du deine Daten auch auf ein anderes Gerät mit.</li>
      </ul>`),
    helpTopic('Neue Version', `
      <p>Die App aktualisiert sich von selbst, sobald es eine neue Version gibt. Wenn du sofort nachsehen möchtest, öffne die Einstellungen und ziehe die Seite <b>ganz oben nach unten</b>. Welche Version du gerade hast, steht ganz unten in den Einstellungen.</p>`),
  ];
  openPage('help', 'Hilfe', `
    <div class="group"><label class="sheetbtn swrow"><span>Hinweise anzeigen<small>Kleine Bedienhinweise unter Listen und Essen</small></span><input type="checkbox" switch id="tipsSwitch"${tipsOn() ? ' checked' : ''}></label></div>
    <div class="helplist">${topics.join('')}</div>`); // ohne Neuaufbau beim Abgleich: aufgeklappte Themen bleiben offen
}
