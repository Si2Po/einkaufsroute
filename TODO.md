# Einkaufsroute – Merkliste (noch nicht umgesetzt)

## Neu aufgenommen
- [ ] **Design anpassen:** Teil 1 erledigt (Farben neutraler, Darstellung Automatisch/Hell/Dunkel, schwebende Glas-Leiste, Glas-Sheets). Offen: Feinschliff nach iPhone-Test (z. B. Glas für Kopfzeilen, Schriftgrößen, Abstände)
- [x] **Animationen und Übergänge überarbeiten** (Einstellungs-Unterseiten als Seiten mit Zurück-Pfeil und Wisch vom linken Rand, Läden gleiten herein, Tabwechsel blendet weich; Sheets mit einheitlicher Kopfzeile „Fertig“/„Abbrechen“, Schließen behält Änderungen): Wechsel zwischen Bereichen und Öffnen von Details. In den Einstellungen passt das „›“ (deutet eine neue Seite an) nicht zum Bottom-Sheet, das von unten kommt und nach unten weggewischt wird. Vorschlag: Einstellungs-Unterpunkte als echte Seiten mit Einblenden von rechts, Zurück-Pfeil und Wisch-zurück; Sheets nur für Schnellaktionen (Listenwahl, Details eines Eintrags). Dazu sanfter Übergang beim Tabwechsel. **Wichtig: einheitliche Bedienung.** Jede Unterseite lässt sich gleich verlassen (Zurück-Pfeil und Wisch vom linken Rand), jedes Sheet gleich (Wisch nach unten, Fertig). Eine gemeinsame Seiten- und Sheet-Komponente statt Einzellösungen. „Bewegung reduzieren“ (prefers-reduced-motion) beachten.
- [x] **Einstellungen aufräumen:** „Daten sichern und übertragen" in „Konto und Haushalt" einordnen
- [x] **Stichwörter überarbeiten:** Obst & Gemüse in der Mehrzahl (Vorschläge), Erkennung über den Wortstamm (Einzahl wird weiter erkannt), gespeicherte Stichwörter werden einmalig umgestellt
- [x] **Oberer Rand auf dem iPhone:** Inhalt scrollt unter den Rand und wirkt verschwommen → mehr Abstand (safe-area-inset-top, Margin)
- [x] **Tastatur prüfen:** darf keine Eingabefelder verdecken. Teilweise muss man das Feld verlassen und neu antippen, bis sich alles richtig verschiebt.
- [x] **PWA-Icon** gestalten (Regale + Laufweg + Haken)
- [x] **Ziehen zum Aktualisieren:** (Liste = Abgleich, Einstellungen = nach Update suchen) In der Mitte der Liste nach unten wischen; ist man schon ganz oben und zieht weiter, startet ein Abgleich (wie „Pull to Refresh“ in iOS-Apps). Mit kleinem Kreis/Pfeil oben, der zeigt, dass gleich aktualisiert wird. Darf nicht mit dem Wischen auf Einträgen (links/rechts) oder dem Scrollen kollidieren.
- [x] **Drehen sperren (Darstellung):** verworfen. Ein Hinweis ist unerwünscht, Gegendrehen würde Gesten, Sheets und Tastatur kaputt machen. Stattdessen Querformat-Layout optimiert; Sperre bleibt Sache des Kontrollzentrums. Option „Nur Hochformat“. Achtung: Web-Apps auf dem iPhone können die Drehung nicht wirklich sperren (Safari unterstützt das nicht, auch nicht über das Manifest). Möglich: im Querformat einen Hinweis „Bitte Handy drehen“ zeigen oder den Inhalt per CSS zurückdrehen. Erst klären, ob das reicht; sonst bleibt die Sperre im Kontrollzentrum des iPhones.
- [x] **Vibrieren beim Würfeln:** umgesetzt (haptic(): Android vibrieren, iPhone Schalter-Trick; auch bei langem Drücken und Ziehen zum Aktualisieren). kurzes Haptik-Feedback bei „Zufälliges Essen“ / „Nochmal würfeln“. `navigator.vibrate` gibt es auf dem iPhone nicht. Seit iOS 18 löst Safari aber beim Umschalten eines Schalters (`<input type="checkbox" switch>`) ein Haptik-Klicken aus; das lässt sich als Trick nutzen (unsichtbarer Schalter, beim Tippen mit umschalten). Nur ein kurzes „Klick“, kein langes Vibrieren. Später evtl. auch fürs Abhaken.
- [x] **Standardreihenfolge „Kein Laden“** (erledigt: Kategorien per Griff sortieren, „Sonstiges“ bleibt unten) ansehen und ändern können (Reihenfolge der Kategorien, z. B. per Hoch/Runter in „Kategorien und Stichwörter“; die Reihenfolge wird schon mit dem Haushalt synchronisiert)

## Idee: Hilfe-Bereich in den Einstellungen
- [ ] Kurze Erklärung, wie man die Seite als App aufs iPhone holt (Safari → Teilen → „Zum Home-Bildschirm“, danach einmal neu anmelden, weil die App einen eigenen Speicher hat)
- [ ] Wie man Einträge bedient: Tippen, lang drücken, wischen; Liste wechseln (zweiter Tipp auf „Liste“); Läden und Zonen
- [ ] Konto und Gruppen: anmelden, einladen, beitreten, abgleichen, Sicherung
- [ ] Gruppen erklären: Man sieht immer alles aus allen eigenen Gruppen; die Gruppe regelt nur, **wer etwas mitsieht**. „Persönlich“ sieht nur man selbst (nicht teilbar). Das **Personen-Symbol** (zwei Köpfe, z. B. „👥 Einkauf“ bei Listen und Geschäften) zeigt, zu welcher Gruppe etwas gehört. Gruppe ändern: Liste/Geschäft bearbeiten → „Gruppe“; beim Essen ganz unten beim Personen-Symbol. Kategorien und Stichwörter: unter Kategorien „Stichwörter von“ wählen, wer dieselbe Gruppe wählt, lernt gemeinsam. Geschäft aus anderer Gruppe für eine Liste gewählt → App fragt, ob es mit umziehen soll.
- [ ] Wichtiges: Offline-Betrieb, was bei „Abmelden“ passiert, neue Version laden (App einmal schließen und neu öffnen). Versionsnummer anzeigen (steht bisher unten in den Einstellungen)
- [ ] Als eigene Unterseite mit der gemeinsamen Seiten-Komponente umsetzen; ggf. beim ersten Start kurze Einführung
- [ ] Schalter „Hinweise anzeigen“: blendet alle kleinen Bedienhinweise (z. B. „Tippen: … · Gedrückt halten: …“ unter Liste und Essen) überall ein oder aus. Heute verschwindet nur der Hinweis in der Liste nach einer Weile von selbst (S.tipSeen).

## Idee: Einkaufsverhalten lernen
- [ ] Beim Abhaken merkt sich die App Produkt + Datum (Kaufhistorie, im Haushalt geteilt)
- [ ] Aus den Abständen den typischen Rhythmus berechnen (z. B. Klopapier alle ~3 Wochen, Spülmaschinenpulver alle ~3 Monate)
- [ ] Wenn ein Produkt „fällig" ist, als Vorschlag anzeigen („Klopapier? zuletzt vor 3 Wochen") mit Tipp = auf die Liste, Wisch = „nicht jetzt"
- [ ] Nur Produkte vorschlagen, die mindestens 2–3 Mal gekauft wurden; Rhythmus manuell überschreibbar; Vorschläge abschaltbar

## Gruppen (0.7.0, Details in PLAN-GRUPPEN.md)
Erledigt (lokal, noch nicht hochgeladen): „Persönlich“ + weitere Gruppen, anlegen/umbenennen/einladen/beitreten/verlassen, Abgleich pro Gruppe, alles sichtbar mit Gruppen-Hinweis (Personen-Symbol), Listen/Geschäfte/Essen in andere Gruppe verschieben, Rückfrage beim Geschäft, Stichwörter pro Gruppe wählbar, Beitreten ersetzt nichts mehr. Private Listen = Listen in „Persönlich“.
- [ ] **Test mit echtem Konto** (lokal über `lokal-starten.cmd` anmelden), dann hochladen; zuerst eigenes iPhone, danach das Gerät der Partnerin
- [ ] Hilfe-Text zu Gruppen (siehe Hilfe-Bereich oben)
- [ ] Später: Gruppentyp „Einfache Listen“ (z. B. „Filme“: nur Listen, ohne Geschäfte/Route/Essen)
- [ ] Später: neue Gruppe mit Kategorien/Stichwörtern einer bestehenden Gruppe starten (heute bekommt eine neue Gruppe die Standard-Kategorien, sobald jemand sie unter „Stichwörter von“ wählt)
- [ ] Später: einzelne Liste per Link an Außenstehende teilen (Gäste, ohne Konto)

## Später / optional
- [ ] Aufräumen: Löschmarkierungen (deleted=true) in der Tabelle docs nach ca. 90 Tagen endgültig entfernen (z. B. geplante Datenbank-Funktion), und die lokale Liste „known“ in sync.js entsprechend kürzen. Frist wegen lange offline gewesener Geräte nicht zu kurz wählen. Fotos auf kleine Größe verkleinern, bevor sie hochgeladen werden.
- [ ] Impressum und Datenschutzerklärung, falls die App an Fremde weitergegeben wird
- [ ] Sprach-Eingabe mit KI-Kategorisierung
- [ ] Laden nach Standort vorschlagen
- [ ] Eigener Mailversand (SMTP) und Passwort-Reset, wenn andere Nutzer dazukommen
