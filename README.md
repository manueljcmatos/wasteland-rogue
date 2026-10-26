# ⚔️ Realms of Tyra

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
| Return to base (gold cost grows with distance, leaves a portal back) | 🏠 | H |
| World map | tap the minimap | M |
| Class ability | ✨ | F |
| Health / mana potion | ❤️ / 🔷 | Q / R (or 1 / 2) |
| Base menu | 🏠 (inside base) | E |
| Bag / Skills | 🎒 / ⭐ | B / K |

## Features

- **Shared world (multiplayer)**: in the Telegram app you see every player in the same realm moving in real time (WebSocket), with names, classes and levels, plus 💬 chat with speech bubbles. Combat and loot stay on each device.
- **Resources**: 🪵 wood (trees), 🪨 stone and ⛓️ iron (rocks, ruins, brutes), 💠 crystal (elites, Warlords, Overlords). Shoot obstacles or stand next to them to harvest. Building upgrades cost resources.
- **Trading post** (⚖️ Trader Oto): deposit gold and resources (daily caps), publish market offers, send direct offers to a player, accept/decline; everything escrowed on the server.
- **Visit other bases** (🌀 Gatekeeper Ilsa): teleport into another player's base and meet whoever is there.
- **Detailed item icons**: drawn weapons, armor (material changes with rarity), potions and resources, with rarity glow.

- **Return portal**: returning to base opens a 🌀 portal inside the base that takes you back to the exact spot you left (one use).
- **World map**: tap the minimap for a full map with danger tier rings, outposts, the Overlord and your portal.
- **Rotating realms** (Realm of the Mad God style): every 15 minutes (wall clock, the same for all players) the realm closes and a new procedurally generated map opens with a new name. You are pulled back to base safely and your loot is banked.
- **Realm Overlord**: clear 3 outposts in a realm to awaken a 👹 Overlord. Killing it drops top loot and 💎 gems, then the realm collapses.
- **NPCs at base**: 📜 Commander Vale (quests), 💎 Mystic Zara (gem shop), 🗝️ Keeper Bram (vault), 🔨 Smith Hilda (workshop).
- **Quests**: 3 active missions (kill, hunt a type, elites, outposts, reach a zone, collect gold, slay an Overlord) with gold, XP, gem and item rewards.
- **Two currencies**: 🪙 gold (earned in game) and 💎 gems (premium, bought with Telegram Stars or earned from quests and Overlords). Gems buy extra **vault chests** (+8 stash slots each), gold pouches and potion crates.

- **5 classes** to choose from, each with a mana ability:
  🪖 Soldier (Grenade), 🏹 Ranger (Rapid Fire), 🔮 Technomancer (Chain Lightning), 🛡️ Guardian (War Cry), 🗡️ Scout (Shadow Step). Change class anytime at base.
- **Attributes**: Strength, Dexterity, Agility, Intelligence, Vitality (+3 points per level) plus Speed from gear.
- **Equipment**: weapon, helmet, armor, pants and boots. Armor reduces damage taken; armor pieces roll bonus attributes.
- **Square inventory** with 8 slots; health and mana potions stack up to 10 per slot, with quick-use buttons.

- **Open world**: infinite procedurally generated map with 7 biomes (Meadows, Deepwood, Marsh, Dunes, Wasteland, Frostlands, Ruins), trees, rocks and rubble.
- **Endless zone levels**: danger scales with distance from your base, forever. Higher zones have tougher enemies (with no cap), more elites and better loot.
- **Danger tiers** every 5 zones: Outskirts → Badlands → Deadlands → Inferno → The Abyss (I, II, III, +N…), each with its own look. The HUD shows ⚠️ when a zone is above your recommended level.
- **Deep-zone enemies**: Snipers (zone 6+, telegraphed red aim line), Juggernauts (zone 8+), Chargers (zone 10+, wind up and charge).
- **Outposts**: fortified enemy camps guarded by a 👑 Warlord. Clear them for big loot.
- **Roguelike runs**: every death rerolls the world. You lose carried gold/scrap, the gear in your bag and run perks. Equipped items and potions are kept.
- **Run perks**: each run rank lets you pick 1 of 3 random perks (Split Shot, Vampiric, Nanobots…).
- **Character levels and skills**: permanent XP levels give skill points for a 10-skill tree (5 ranks each) plus ♾️ Ascension, a skill with no limit.
- **Loot**: 6 weapon types × 5 rarities (Common to Legendary) with random affixes (crit, pierce, multishot, lifesteal…).
- **Economy**: gold and scrap drops, weapon & armor shop, potions, selling, salvaging. Loot is only banked when you get home.
- **Upgradable home base** with 8 buildings (10 levels each):
  - 🏪 Market: bigger, better shop
  - 🏦 Vault: keep part of your carried loot on death
  - 🏥 Clinic: more max HP, fast healing at base
  - 🛡️ Armory: bigger stash
  - 🔧 Workshop: upgrade weapons and armor (+2 per Workshop level)
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
js/game.js      simulation loop and render loop
js/realm.js     rotating realms, Overlord, quests, NPCs
js/net.js       Telegram Mini App + server connection (Stars purchases, cloud save)
js/i18n.js      English / Portuguese translations
js/ton.js       TON Connect wallet linking (library loaded on demand)
js/mp.js        realtime presence and chat (WebSocket)
js/icons.js     detailed item and resource icons
config.js       deployment settings (server URL, bot username)
server/         backend (see server/README.md)
js/art.js       all visuals: baked sprites, ground textures, buildings, effects
js/ui.js        menus: base, shop, stash, workshop, bag, skills, perks
js/input.js     twin-stick touch + keyboard/mouse
js/save.js      persistence
js/audio.js     synthesized sound effects
```

## Telegram Mini App and payments

The game runs as a **Telegram Mini App**. Gems are sold with **Telegram Stars ⭐** (Telegram requires Stars for digital goods in Mini Apps). Stars can be withdrawn as TON through Fragment.

- `server/`: zero-dependency Node.js backend: Telegram auth, Stars invoices and webhook, server-side gems and vault chests, cloud saves, `/paysupport` and admin `/refund`. Setup guide (Portuguese): [server/README.md](server/README.md).
- `config.js`: set `serverUrl` and `botUsername` after deploying the server.
- **☢️ Shards** (talk to Oracle Nyx at base): points earned from Overlords, quests, outposts and new best zones, tracked and capped by the server, with a leaderboard. Players link a **TON wallet** with TON Connect. Shards are planned to convert to a TON token (Jetton) later; they cannot be bought.
- Outside Telegram the game still runs fully offline; gems can only be earned in play there.

## Languages

English and Portuguese (☰ menu → Language). Auto-detected from the Telegram or browser language.
