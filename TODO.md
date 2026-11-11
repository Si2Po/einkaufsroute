# Einkaufsroute – Merkliste (noch nicht umgesetzt)

## Neu aufgenommen
- [ ] **Design anpassen:** iOS-„Liquid Glass"-Optik, andere Farben, Dunkel-/Hellmodus (u. a.)
- [x] **Animationen und Übergänge überarbeiten** (Einstellungs-Unterseiten als Seiten mit Zurück-Pfeil und Wisch vom linken Rand, Läden gleiten herein, Tabwechsel blendet weich; Sheets mit einheitlicher Kopfzeile „Fertig“/„Abbrechen“, Schließen behält Änderungen): Wechsel zwischen Bereichen und Öffnen von Details. In den Einstellungen passt das „›“ (deutet eine neue Seite an) nicht zum Bottom-Sheet, das von unten kommt und nach unten weggewischt wird. Vorschlag: Einstellungs-Unterpunkte als echte Seiten mit Einblenden von rechts, Zurück-Pfeil und Wisch-zurück; Sheets nur für Schnellaktionen (Listenwahl, Details eines Eintrags). Dazu sanfter Übergang beim Tabwechsel. **Wichtig: einheitliche Bedienung.** Jede Unterseite lässt sich gleich verlassen (Zurück-Pfeil und Wisch vom linken Rand), jedes Sheet gleich (Wisch nach unten, Fertig). Eine gemeinsame Seiten- und Sheet-Komponente statt Einzellösungen. „Bewegung reduzieren“ (prefers-reduced-motion) beachten.
- [x] **Einstellungen aufräumen:** „Daten sichern und übertragen" in „Konto und Haushalt" einordnen
- [ ] **Stichwörter überarbeiten:** manche Wörter in Obst & Gemüse sollten im Plural stehen
- [x] **Oberer Rand auf dem iPhone:** Inhalt scrollt unter den Rand und wirkt verschwommen → mehr Abstand (safe-area-inset-top, Margin)
- [x] **Tastatur prüfen:** darf keine Eingabefelder verdecken. Teilweise muss man das Feld verlassen und neu antippen, bis sich alles richtig verschiebt.
- [x] **PWA-Icon** gestalten (Regale + Laufweg + Haken)
- [x] **Ziehen zum Aktualisieren:** (Liste = Abgleich, Einstellungen = nach Update suchen) In der Mitte der Liste nach unten wischen; ist man schon ganz oben und zieht weiter, startet ein Abgleich (wie „Pull to Refresh“ in iOS-Apps). Mit kleinem Kreis/Pfeil oben, der zeigt, dass gleich aktualisiert wird. Darf nicht mit dem Wischen auf Einträgen (links/rechts) oder dem Scrollen kollidieren.
- [ ] **Standardreihenfolge „Kein Laden“** ansehen und ändern können (Reihenfolge der Kategorien, z. B. per Hoch/Runter in „Kategorien und Stichwörter“; die Reihenfolge wird schon mit dem Haushalt synchronisiert)

## Idee: Hilfe-Bereich in den Einstellungen
- [ ] Kurze Erklärung, wie man die Seite als App aufs iPhone holt (Safari → Teilen → „Zum Home-Bildschirm“, danach einmal neu anmelden, weil die App einen eigenen Speicher hat)
- [ ] Wie man Einträge bedient: Tippen, lang drücken, wischen; Liste wechseln (zweiter Tipp auf „Liste“); Läden und Zonen
- [ ] Konto und Haushalt: einladen, beitreten, abgleichen, Sicherung
- [ ] Wichtiges: Offline-Betrieb, was bei „Abmelden“ passiert, neue Version laden (App einmal schließen und neu öffnen). Versionsnummer anzeigen (steht bisher unten in den Einstellungen)
- [ ] Als eigene Unterseite mit der gemeinsamen Seiten-Komponente umsetzen; ggf. beim ersten Start kurze Einführung
- [ ] Schalter „Hinweise anzeigen“: blendet alle kleinen Bedienhinweise (z. B. „Tippen: … · Gedrückt halten: …“ unter Liste und Essen) überall ein oder aus. Heute verschwindet nur der Hinweis in der Liste nach einer Weile von selbst (S.tipSeen).

## Idee: Einkaufsverhalten lernen
- [ ] Beim Abhaken merkt sich die App Produkt + Datum (Kaufhistorie, im Haushalt geteilt)
- [ ] Aus den Abständen den typischen Rhythmus berechnen (z. B. Klopapier alle ~3 Wochen, Spülmaschinenpulver alle ~3 Monate)
- [ ] Wenn ein Produkt „fällig" ist, als Vorschlag anzeigen („Klopapier? zuletzt vor 3 Wochen") mit Tipp = auf die Liste, Wisch = „nicht jetzt"
- [ ] Nur Produkte vorschlagen, die mindestens 2–3 Mal gekauft wurden; Rhythmus manuell überschreibbar; Vorschläge abschaltbar

## Großer Umbau: Gruppen (nächster Schritt nach dem Test der jetzigen Version)
Entscheidung: Mehrere Gruppen pro Konto. Eine Gruppe ist ein eigener Bereich mit eigenen Listen, Kategorien, Stichwörtern, Läden, Essen und Mitgliedern. Technisch ist eine Gruppe ein „household“ in der Datenbank.
- [ ] **„Persönlich“** entsteht automatisch mit dem Konto. Feste Gruppe: nicht verlassen, löschen, teilen, und niemand kann beitreten. Dort liegen auch Listen ohne Gruppe (z. B. Baumarkt). Der heutige Haushalt wird zu „Persönlich“.
- [ ] Weitere Gruppen anlegen (Name + Typ), z. B. „Einkaufen“ (mit Läden, Route, Essen) oder „Filme“ (nur Kategorien/Listen)
- [ ] Typ der Gruppe bestimmt, welche Bereiche es gibt (Läden/Route/Essen nur bei „Einkaufen“)
- [ ] Einladen, beitreten, verlassen pro Gruppe (nicht bei „Persönlich“)
- [ ] App hält mehrere Gruppen gleichzeitig und gleicht jede einzeln ab. Gruppenauswahl in der Oberfläche
- [ ] Datenbank: Funktion „Gruppe anlegen“, Einladung gilt für eine bestimmte Gruppe, „Persönlich“ ist geschützt (kein Einladen/Beitreten)
- [ ] Beim Beitritt gehen eigene Daten nicht verloren (andere Gruppen bleiben unberührt)
- [ ] Später: Liste in andere Gruppe verschieben, neue Gruppe aus Vorlage (Kategorien kopieren)
- Private Listen = Listen in „Persönlich“. Das Teilen einzelner Listen per Link für Außenstehende bleibt eine eigene Funktion.

## Aus dem Plan zum Teilen
- [ ] Private Listen im Haushalt („nur für mich")
- [ ] Einzelne Liste per Link an Außenstehende teilen (Gäste)

## Später / optional
- [ ] Aufräumen: Löschmarkierungen (deleted=true) in der Tabelle docs nach ca. 90 Tagen endgültig entfernen (z. B. geplante Datenbank-Funktion), und die lokale Liste „known“ in sync.js entsprechend kürzen. Frist wegen lange offline gewesener Geräte nicht zu kurz wählen. Fotos auf kleine Größe verkleinern, bevor sie hochgeladen werden.
- [ ] Impressum und Datenschutzerklärung, falls die App an Fremde weitergegeben wird
- [ ] Sprach-Eingabe mit KI-Kategorisierung
- [ ] Laden nach Standort vorschlagen
- [ ] Eigener Mailversand (SMTP) und Passwort-Reset, wenn andere Nutzer dazukommen
