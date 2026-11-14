'use strict';
// Adresse der Datenbank (Supabase) und der öffentliche Publishable-Key. Der darf im Code stehen;
// niemals den service_role-/Secret-Key hier eintragen. Wird von der App (index.html) und der Gast-Ansicht (gast.html) geladen.
// window.EK_CONFIG überschreibt das für lokale Tests (tools/synctest.html).
const EK = Object.assign({
  url: 'https://hshlepbjrqqfpvjcghmy.supabase.co',
  key: 'sb_publishable_yxlkJ_Na6A0s-3guPHAUYQ_j2y4JMpO'
}, window.EK_CONFIG || {});
