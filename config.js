'use strict';
// Datenbank (Supabase): Adresse und öffentlicher Publishable-Key. Der darf im Code stehen (die Sicherheit kommt aus den
// Zugriffsregeln der Datenbank); niemals den service_role-/Secret-Key hier eintragen.
// hosts: Nur unter diesen Adressen benutzt die App diese Datenbank. Eine Kopie des Projekts, die woanders läuft, arbeitet
// sonst nur auf dem Gerät (ohne Konto und Abgleich), statt versehentlich diese Datenbank mitzubenutzen.
// Wer die App selbst betreibt: eigene url, key und hosts eintragen (siehe README.md).
// Wird von der App (index.html) und der Gast-Ansicht (gast.html) geladen. window.EK_CONFIG überschreibt das für lokale Tests.
const EK = Object.assign({
  url: 'https://hshlepbjrqqfpvjcghmy.supabase.co',
  key: 'sb_publishable_yxlkJ_Na6A0s-3guPHAUYQ_j2y4JMpO',
  hosts: ['si2po.github.io', 'localhost', '127.0.0.1']
}, window.EK_CONFIG || {});
EK.off = !EK.hosts.includes(location.hostname); // true = keine Datenbank für diese Adresse
