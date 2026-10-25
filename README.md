# ☢️ Wasteland Rogue

An open-world **roguelike twin-stick shooter** built for mobile browsers (works on desktop too).
Pure HTML5 canvas + vanilla JavaScript: no build step, no dependencies.

## Play

- **Phone:** host the folder anywhere static (e.g. GitHub Pages) and open it in the browser. Use "Add to Home Screen" for full-screen play.
- **Local:** open `index.html` directly, or run `python3 -m http.server` in the folder and visit `http://localhost:8000`.

### Controls
| | Mobile | Desktop |
|---|---|---|
| Move | Drag left half of screen | WASD / arrows |
| Aim & shoot | Drag right half of screen (or auto-aim) | Hold mouse |
| Dash | 💨 | Space |
| Medkit | 💊 | Q |
| Base menu | 🏠 (inside base) | E |
| Bag / Skills | 🎒 / ⭐ | B / K |

## Features

- **Open world**: infinite procedurally generated map with 7 biomes (Meadows, Deepwood, Marsh, Dunes, Wasteland, Frostlands, Ruins), trees, rocks and rubble.
- **Endless zone levels**: danger scales with distance from your base, forever. Higher zones have tougher enemies (with no cap), more elites and better loot.
- **Danger tiers** every 5 zones: Outskirts → Badlands → Deadlands → Inferno → The Abyss (I, II, III, +N…), each with its own look. The HUD shows ⚠️ when a zone is above your recommended level.
- **Deep-zone enemies**: Snipers (zone 6+, telegraphed red aim line), Juggernauts (zone 8+), Chargers (zone 10+, wind up and charge).
- **Outposts**: fortified enemy camps guarded by a 👑 Warlord. Clear them for big loot.
- **Roguelike runs**: every death rerolls the world. You lose carried gold/scrap, your bag and run perks.
- **Run perks**: each run rank lets you pick 1 of 3 random perks (Split Shot, Vampiric, Nanobots…).
- **Character levels and skills**: permanent XP levels give skill points for a 10-skill tree (5 ranks each) plus ♾️ Ascension, a skill with no limit.
- **Loot**: 6 weapon types × 5 rarities (Common to Legendary) with random affixes (crit, pierce, multishot, lifesteal…).
- **Economy**: gold and scrap drops, weapon shop, selling, salvaging, medkits. Loot is only banked when you get home.
- **Upgradable home base** with 8 buildings (10 levels each):
  - 🏪 Market: bigger, better shop
  - 🏦 Vault: keep part of your carried loot on death
  - 🏥 Clinic: more max HP, fast healing at base
  - 🛡️ Armory: bigger bag and stash
  - 🔧 Workshop: upgrade weapons (+2 per Workshop level)
  - 🗼 Turrets: defend the base perimeter
  - 📡 Radar: larger minimap, reveals outposts
  - 🌾 Farm: passive gold income
- Progress auto-saves to `localStorage` every few seconds and when the app is closed. ☰ menu → **Save backup** gives a code you can copy and paste to restore progress on any device.

## Code layout

```
index.html      page + HUD markup
style.css       HUD and menu styling
js/data.js      all balance data (weapons, enemies, perks, skills, buildings)
js/items.js     weapon generation and stats
js/world.js     procedural world, biomes, obstacles, outposts
js/game.js      simulation loop and canvas rendering
js/ui.js        menus: base, shop, stash, workshop, bag, skills, perks
js/input.js     twin-stick touch + keyboard/mouse
js/save.js      persistence
js/audio.js     synthesized sound effects
```
