# Dark Return

Dark Return ist ein lokales Browser-RPG. Öffne das Projekt über VS Code Live Server oder eine veröffentlichte HTTPS-Adresse. Der Spielstand liegt in IndexedDB des jeweiligen Browsers und der Website-Adresse.

## Projektstruktur

- `index.html` enthält App-Shell, Navigation und globale Dialoge.
- `script.js` lädt und validiert die JSON-Konfigurationen und bindet die klassischen JavaScript-Dateien in Reihenfolge ein.
- `style.css` ist der CSS-Einstiegspunkt und lädt `css/main.css`; dort sind die Stylesheets nach Layout, Komponenten und Spielsystemen gebündelt.
- `data/config/` enthält Welt-, Klassen-, Gegenstands-, Quest-, Markt- und Eventdaten. `data/config/balance/` enthält getrennte Regeln für Kampf, Ausrüstung und Fortschritt.
- `js/config.js` stellt die geprüften Konfigurationen als Laufzeitkonstanten bereit.
- `js/state.js` enthält Spielzustand, IndexedDB, Normalisierung und Gegenstands-/Inventarfunktionen. `js/state-actions.js` verarbeitet Spielaktionen. `js/activity-log.js` rendert Aktivitätsprotokoll und Briefkasten.
- `js/character.js` berechnet Charakterwerte und verwaltet Ausrüstung. `js/combat.js` steuert Kampf und Wellenablauf; `js/battle-scene.js` rendert die Kampfszene.
- `js/views-*.js` rendert die einzelnen Seiten; `js/interactions.js` verarbeitet delegierte UI-Ereignisse.
- `Assets/Icons/` enthält die 61 verwendeten Icons samt Lizenz und Urheberliste. `manifest.json` dokumentiert ihre Nutzung und Prüfsummen; das vollständige Iconpack wird für das Spiel nicht benötigt.
- `Assets/Art/` enthält Illustrationen, Logo und Begleittiere. Unter `Assets/Art/battle/runtime/` liegen die im Kampf geladenen Figuren und Effekte.
- `.edge-smoke/` ist ein ignoriertes lokales Edge-Testprofil mit Browserdaten und Cache, kein Bestandteil des Spiels. Zum Entfernen muss eine eventuell damit laufende Edge-Testinstanz geschlossen sein.

## Spielsysteme

- Die Gruppe besteht aus einer Hauptklasse und einem gewählten Gefährten. Beide haben eigene Stufen, Ausrüstung und daraus berechnete Werte.
- Ausrüstung kann in Grenzgebieten als Kampfbeute erscheinen. Der Turm vergibt Seelen und kann Verzauberungsmaterialien liefern, aber keine Ausrüstung. Der Schwarzmarkt bietet Materialien und Luckyboxen.
- Die gewählte Turmbeute startet mit 1 % Basis-Chance. Jeder besiegte Turmboss erhöht sie dauerhaft um 0,1 Prozentpunkte, bis maximal 100 %; AFK-Bosssiege zählen mit. Der frühere Turmbeutesegen entfällt, vorhandene Exemplare werden zu Droprate-Power-ups umgewandelt.
- Die Seltenheits- und Beutechancen richten sich nach Gebiet und Deep-of-Dark-Stufe. Die konfigurierten Seltenheiten reichen von gewöhnlich bis legendär. Mystische Gegenstände und Aspekte sind derzeit nicht Teil des Spiels.
- Waffen besitzen Grundschaden, Rüstungsteile und Schilde Grundverteidigung. Affixe, Rüstungs- und Schmucksets stehen in den Konfigurationsdateien.
- Die Schmiede wertet Ausrüstung mit Aufwertungssteinen bis +10 auf. Sockelrituale öffnen Sockelplätze; passende Edelsteine werden im Inventar eingesetzt.
- Gestartete Schmiede- und Sockelaufträge werden im Spielstand gespeichert und beim Wiederöffnen anhand der vergangenen Zeit fortgesetzt. Ziel, Materialende oder manuelles Stoppen beenden den Auftrag; Ergebnisse stehen im Aktivitätenprotokoll. Verzauberung bleibt manuell.
- Die ersten Auftragsgruppen sind fest definiert. Danach werden wiederholbare Ziele aus dem Aufgabenpool zusammengestellt. Gegenstandsbelohnungen gehen bei vollem Inventar in den Briefkasten.
- Welt-Events wechseln gemäß Konfiguration alle 30 Minuten. Power-ups halten eine Stunde; weitere Aktivierungen desselben Typs verlängern die Dauer, erhöhen aber nicht den Bonuswert.

## Spielstand und Zeichencodierung

Der Spielstand kann in den Einstellungen exportiert und importiert oder dort gelöscht werden. Projektdateien werden als UTF-8 gespeichert. Beim Bearbeiten unter Windows PowerShell immer eine explizite Codierung verwenden; ANSI-Standardcodierungen beschädigen Umlaute und Symbole.
