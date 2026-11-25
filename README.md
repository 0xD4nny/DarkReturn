# Dark Return

Ein Dark-Fantasy-RPG für den Browser.

**[Jetzt spielen](https://0xd4nny.github.io/DarkReturn/)**

Regeln, Spielsysteme und Beutechancen sind im **Kodex** im Spiel beschrieben. Er ist über das Spielmenü erreichbar.

## Technik

Dark Return ist mit HTML, CSS und JavaScript umgesetzt und wird über GitHub Pages bereitgestellt.

Normale und mystische Aufwertungen sind gemeinsam in [data/config/balance/equipment.json](data/config/balance/equipment.json) konfiguriert. Für mystische Aufwertungen gibt es dort unter `balance.items.mythicUpgrades` eigene Werte: `damagePercentPerLevel` bestimmt den Schadensbonus pro Punkt, `maxUpgradeLevel` die Maximalstufe und `successChanceByLevel` die Erfolgschance je Ausgangsstufe (erster Eintrag: 0 → 1). Die Liste muss genau einen Eintrag pro möglicher Stufe enthalten.

## Assets und Lizenzen

Die verwendeten Icons stammen von [Game-icons.net](https://game-icons.net/). Die [Urhebernachweise](Assets/Icons/ASSET-CREDITS.md) und [Lizenzhinweise](Assets/Icons/license.txt) liegen bei den ausgewählten Icons.
