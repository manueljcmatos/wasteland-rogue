'use strict';
// All game balance data lives here.

const TILE = 64;          // world tile size (px)
const CHUNK = 1400;       // outpost chunk size
const HOME_R = 380;       // radius of the safe home base

const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#b8c0c8', mult: 1.0,  affixes: 0, w: 60 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#5fd35f', mult: 1.15, affixes: 0, w: 25 },
  { id: 'rare',      name: 'Rare',      color: '#4aa8ff', mult: 1.35, affixes: 1, w: 10 },
  { id: 'epic',      name: 'Epic',      color: '#c070ff', mult: 1.6,  affixes: 2, w: 4 },
  { id: 'legendary', name: 'Legendary', color: '#ffa630', mult: 2.0,  affixes: 3, w: 1 },
];

const WEAPON_TYPES = {
  pistol:   { name: 'Pistol',   dmg: 10,  rate: 3,   speed: 750,  spread: .05,  bullets: 1, range: 520, pierce: 0, color: '#ffe680', size: 4,   price: 60 },
  smg:      { name: 'SMG',      dmg: 5.5, rate: 10,  speed: 800,  spread: .16,  bullets: 1, range: 460, pierce: 0, color: '#fff2a8', size: 3,   price: 140 },
  shotgun:  { name: 'Shotgun',  dmg: 7,   rate: 1.4, speed: 700,  spread: .42,  bullets: 6, range: 330, pierce: 0, color: '#ffb070', size: 3.5, price: 160 },
  rifle:    { name: 'Rifle',    dmg: 26,  rate: 1.8, speed: 1100, spread: .015, bullets: 1, range: 760, pierce: 1, color: '#a8f0ff', size: 4,   price: 220 },
  minigun:  { name: 'Minigun',  dmg: 4.5, rate: 16,  speed: 850,  spread: .22,  bullets: 1, range: 480, pierce: 0, color: '#ffd0d0', size: 3,   price: 320 },
  launcher: { name: 'Launcher', dmg: 38,  rate: .8,  speed: 520,  spread: .04,  bullets: 1, range: 560, pierce: 0, color: '#ff7a4a', size: 6,   price: 380, explode: 85 },
};

const AFFIXES = [
  { id: 'dmg',    label: v => t('+{v}% damage', { v }),     roll: () => U.randi(10, 30) },
  { id: 'rate',   label: v => t('+{v}% fire rate', { v }),  roll: () => U.randi(8, 25) },
  { id: 'crit',   label: v => t('+{v}% crit chance', { v }), roll: () => U.randi(5, 15) },
  { id: 'pierce', label: v => t('+{v} pierce', { v }),      roll: () => 1 },
  { id: 'multi',  label: v => t('+{v} projectile', { v }),  roll: () => 1 },
  { id: 'leech',  label: v => t('{v}% lifesteal', { v }),   roll: () => U.randi(1, 4) },
  { id: 'range',  label: v => t('+{v}% range', { v }),      roll: () => U.randi(10, 30) },
];
const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map(a => [a.id, a]));

const ENEMY_TYPES = {
  grunt:   { name: 'Raider',  hp: 30,  speed: 95,  dmg: 10, r: 16, color: '#d95b5b', xp: 6,   gold: [1, 4],   minLvl: 1,  w: 10 },
  runner:  { name: 'Stalker', hp: 16,  speed: 175, dmg: 7,  r: 12, color: '#e8a33c', xp: 5,   gold: [1, 3],   minLvl: 2,  w: 6 },
  spitter: { name: 'Spitter', hp: 26,  speed: 80,  dmg: 9,  r: 15, color: '#4fc98a', xp: 9,   gold: [2, 6],   minLvl: 2,  w: 5, ranged: { rate: .6, speed: 330, range: 420 } },
  brute:   { name: 'Brute',   hp: 120, speed: 65,  dmg: 22, r: 26, color: '#8c4fd1', xp: 18,  gold: [4, 10],  minLvl: 3,  w: 4 },
  bomber:  { name: 'Bomber',  hp: 20,  speed: 140, dmg: 30, r: 14, color: '#ff5a2a', xp: 8,   gold: [2, 5],   minLvl: 4,  w: 3, explode: 75 },
  sniper:  { name: 'Sniper',     hp: 40,  speed: 70,  dmg: 26, r: 15, color: '#64b5f6', xp: 14,  gold: [3, 8],   minLvl: 6,  w: 3, ranged: { rate: .35, speed: 680, range: 720 }, aimLine: true },
  juggernaut: { name: 'Juggernaut', hp: 420, speed: 52, dmg: 38, r: 32, color: '#5d4037', xp: 45, gold: [10, 22], minLvl: 8, w: 2 },
  charger: { name: 'Charger',    hp: 90,  speed: 110, dmg: 30, r: 20, color: '#00bfa5', xp: 22,  gold: [5, 12],  minLvl: 10, w: 3, charge: true },
  overlord: { name: 'Overlord', hp: 2600, speed: 62, dmg: 34, r: 50, color: '#7c4dff', xp: 600, gold: [120, 220], minLvl: 99, w: 0, ranged: { rate: 1.1, speed: 320, range: 560, burst: 16 } },
  boss:    { name: 'Warlord', hp: 650, speed: 70,  dmg: 26, r: 38, color: '#ff2f6b', xp: 140, gold: [40, 80], minLvl: 99, w: 0, ranged: { rate: .9, speed: 300, range: 520, burst: 10 } },
};

const BIOMES = {
  grass:  { name: 'Meadows',    c: [63, 107, 58],  dens: .05,  obs: 'tree' },
  forest: { name: 'Deepwood',   c: [40, 80, 44],   dens: .17,  obs: 'tree' },
  swamp:  { name: 'Marsh',      c: [56, 82, 72],   dens: .08,  obs: 'tree' },
  desert: { name: 'Dunes',      c: [181, 154, 90], dens: .035, obs: 'rock' },
  waste:  { name: 'Wasteland',  c: [107, 90, 74],  dens: .05,  obs: 'rock' },
  snow:   { name: 'Frostlands', c: [196, 208, 218], dens: .06, obs: 'pine' },
  ruins:  { name: 'Ruins',      c: [86, 90, 96],   dens: .13,  obs: 'rubble' },
};

// Run perks (roguelike, lost on death)
const PERKS = [
  { id: 'dmg',    icon: '💥', name: 'Hollow Points', desc: '+15% damage',            apply: m => m.dmg += .15 },
  { id: 'rate',   icon: '🔥', name: 'Hair Trigger',  desc: '+12% fire rate',         apply: m => m.rate += .12 },
  { id: 'hp',     icon: '❤️', name: 'Thick Skin',    desc: '+25 max HP',             apply: m => m.hp += 25 },
  { id: 'spd',    icon: '👟', name: 'Sprinter',      desc: '+8% move speed',         apply: m => m.spd += .08 },
  { id: 'crit',   icon: '🎯', name: 'Deadeye',       desc: '+8% crit chance',        apply: m => m.crit += .08 },
  { id: 'multi',  icon: '🔱', name: 'Split Shot',    desc: '+1 projectile',          apply: m => m.multi += 1, w: .35 },
  { id: 'pierce', icon: '🗡️', name: 'Penetrator',    desc: '+1 pierce',              apply: m => m.pierce += 1, w: .6 },
  { id: 'magnet', icon: '🧲', name: 'Magnetism',     desc: '+60% pickup range',      apply: m => m.magnet += .6 },
  { id: 'regen',  icon: '🩹', name: 'Nanobots',      desc: '+1 HP/s regeneration',   apply: m => m.regen += 1 },
  { id: 'leech',  icon: '🦇', name: 'Vampiric',      desc: '+2% lifesteal',          apply: m => m.leech += .02 },
  { id: 'gold',   icon: '💰', name: 'Greed',         desc: '+25% gold found',        apply: m => m.gold += .25 },
  { id: 'dash',   icon: '💨', name: 'Blink',         desc: '-20% dash cooldown',     apply: m => m.dashCd += .2 },
  { id: 'thorns', icon: '🌵', name: 'Spikes',        desc: 'Reflect 40% melee damage', apply: m => m.thorns += .4 },
];

// Permanent skills (bought with skill points from character levels)
const SKILLS = [
  { id: 'tough',   icon: '🛡️', name: 'Toughness',      desc: '+10% max HP' },
  { id: 'marks',   icon: '🎯', name: 'Marksman',       desc: '+8% damage' },
  { id: 'trigger', icon: '🔥', name: 'Trigger Finger', desc: '+6% fire rate' },
  { id: 'fleet',   icon: '👟', name: 'Fleet Foot',     desc: '+5% move speed' },
  { id: 'crit',    icon: '⚡', name: 'Critical Eye',   desc: '+4% crit chance' },
  { id: 'regen',   icon: '🩹', name: 'Second Wind',    desc: '+0.5 HP/s regeneration' },
  { id: 'dash',    icon: '💨', name: 'Dash Mastery',   desc: '-10% dash cooldown' },
  { id: 'scav',    icon: '⚙️', name: 'Scavenger',      desc: '+15% scrap found' },
  { id: 'haggle',  icon: '🤝', name: 'Haggler',        desc: '-6% shop prices, +6% sell value' },
  { id: 'lucky',   icon: '🍀', name: 'Lucky',          desc: 'Better weapon rarity' },
  { id: 'power',   icon: '♾️', name: 'Ascension',      desc: '+3% damage & +3% max HP (no limit)', infinite: true },
];
const SKILL_MAX = 5;
const skillMax = s => s.infinite ? Infinity : SKILL_MAX;

// Upgradable home buildings (persist forever)
const BUILDINGS = [
  { id: 'market',   icon: '🏪', name: 'Market',   desc: l => t('{n} weapons in shop, better rarity', { n: Math.min(8, 3 + l) }) },
  { id: 'vault',    icon: '🏦', name: 'Vault',    desc: l => t('Keep {n}% of carried loot on death', { n: Math.min(80, l * 12) }) },
  { id: 'clinic',   icon: '🏥', name: 'Clinic',   desc: l => t('+{n} max HP', { n: l * 15 }) + (l ? t(', rapid heal at base') : '') },
  { id: 'armory',   icon: '🛡️', name: 'Armory',   desc: l => t('Stash {n} slots', { n: l * 4 }) },
  { id: 'workshop', icon: '🔧', name: 'Workshop', desc: l => t('Upgrade weapons up to +{n}', { n: l * 2 }) },
  { id: 'turrets',  icon: '🗼', name: 'Turrets',  desc: l => l === 1 ? t('1 defense turret guards the base') : t('{n} defense turrets guard the base', { n: l }) },
  { id: 'radar',    icon: '📡', name: 'Radar',    desc: l => l ? t('Minimap range x{n}, shows outposts', { n: (1 + Math.min(l, 6) * .4).toFixed(1) }) : t('Reveal outposts on minimap') },
  { id: 'garden',   icon: '🌾', name: 'Farm',     desc: l => t('+{n} gold every 10s', { n: l * 3 }) },
];
const BUILD_MAX = 10;
const BUILD_POS = {
  market: [0, -230], vault: [-175, -130], clinic: [175, -130], armory: [-230, 50],
  workshop: [230, 50], radar: [-150, 210], garden: [150, 210], turrets: [0, 250],
};
const buildCost = l => ({ gold: Math.round(120 * Math.pow(2.3, l)), scrap: Math.round(15 * Math.pow(2.1, l)) });

const xpNeed = l => Math.floor(50 * Math.pow(l, 1.45));
const rankNeed = r => Math.floor(25 + r * 18 + r * r * 2);
// Danger tiers: every 5 zones the world gets a new name, look and more elites. Endless.
const TIERS = [
  { from: 1,  name: 'Outskirts', color: '#c5e1a5', tint: null,                  elite: .05 },
  { from: 5,  name: 'Badlands',  color: '#ffcc80', tint: 'rgba(140,70,0,.13)',   elite: .08 },
  { from: 10, name: 'Deadlands', color: '#ce93d8', tint: 'rgba(60,0,90,.2)',     elite: .11 },
  { from: 15, name: 'Inferno',   color: '#ff8a65', tint: 'rgba(170,25,0,.22)',   elite: .14 },
  { from: 20, name: 'The Abyss', color: '#90a4ae', tint: 'rgba(0,0,10,.36)',     elite: .18 },
];
const tierOf = z => {
  let tr = TIERS[0]; for (const x of TIERS) if (z >= x.from) tr = x;
  if (z >= 25) { const depth = Math.floor((z - 20) / 5); return { ...tr, name: `${t('The Abyss')} ${'I'.repeat(Math.min(depth, 3))}${depth > 3 ? '+' + (depth - 3) : ''}`, elite: Math.min(.35, .18 + depth * .03) }; }
  return { ...tr, name: t(tr.name) };
};
const recLevel = z => Math.max(1, Math.round(z * 2.2 - 1));
const zoneOf = (x, y) => 1 + Math.floor(Math.max(0, Math.hypot(x, y) - HOME_R) / 850);

// ---------- RPG layer: attributes, classes, armor, potions ----------
const ATTRS = [
  { id: 'str', short: 'STR', name: 'Strength',     icon: '💪', desc: '+1.5% damage, +2 max HP' },
  { id: 'dex', short: 'DEX', name: 'Dexterity',    icon: '🎯', desc: '+1% fire rate, +0.5% crit' },
  { id: 'agi', short: 'AGI', name: 'Agility',      icon: '🤸', desc: '+0.6% move speed, -0.8% dash cooldown' },
  { id: 'int', short: 'INT', name: 'Intelligence', icon: '🧠', desc: '+5 max mana, +0.15 mana/s, +3% ability power' },
  { id: 'vit', short: 'VIT', name: 'Vitality',     icon: '❤️', desc: '+8 max HP, +0.1 HP/s' },
];
const ATTR_PER_LEVEL = 3;

const CLASSES = [
  { id: 'soldier',  icon: '🪖', name: 'Soldier',      color: '#1e88e5', start: 'smg',
    desc: 'Balanced and sturdy. Good at everything.',
    base: { str: 6, dex: 5, agi: 4, int: 3, vit: 6 },
    ability: { id: 'grenade', icon: '💣', name: 'Grenade',  mana: 25, cd: 2.5, desc: 'Throw a grenade that explodes for heavy area damage.' } },
  { id: 'ranger',   icon: '🏹', name: 'Ranger',       color: '#43a047', start: 'rifle',
    desc: 'Dexterous marksman with deadly fire rate.',
    base: { str: 3, dex: 10, agi: 5, int: 3, vit: 4 },
    ability: { id: 'rapid', icon: '🔥', name: 'Rapid Fire', mana: 35, cd: 8, desc: 'Double fire rate and +1 pierce for 4 seconds.' } },
  { id: 'mage',     icon: '🔮', name: 'Technomancer', color: '#8e24aa', start: 'pistol',
    desc: 'Intelligence caster. Lives on mana.',
    base: { str: 2, dex: 4, agi: 4, int: 11, vit: 4 },
    ability: { id: 'chain', icon: '⚡', name: 'Chain Lightning', mana: 25, cd: 1.2, desc: 'Lightning jumps between up to 6 enemies.' } },
  { id: 'guardian', icon: '🛡️', name: 'Guardian',     color: '#78909c', start: 'shotgun',
    desc: 'Strong tank with huge health.',
    base: { str: 8, dex: 3, agi: 2, int: 2, vit: 10 },
    ability: { id: 'warcry', icon: '📯', name: 'War Cry', mana: 40, cd: 9, desc: 'Shockwave damages and knocks back enemies, heals 25% HP, 2s invulnerable.' } },
  { id: 'scout',    icon: '🗡️', name: 'Scout',        color: '#455a64', start: 'smg',
    desc: 'Fast and agile. Hit and run.',
    base: { str: 4, dex: 6, agi: 11, int: 3, vit: 3 },
    ability: { id: 'shadow', icon: '👤', name: 'Shadow Step', mana: 30, cd: 5, desc: 'Blink forward, 1s invulnerable, 100% crit and +40% speed for 3s.' } },
];
const CLASS_BY_ID = Object.fromEntries(CLASSES.map(c => [c.id, c]));

const ARMOR_SLOTS = {
  helmet: { name: 'Helmet', icon: '🪖', armor: 5,  price: 70 },
  chest:  { name: 'Armor',  icon: '🦺', armor: 10, price: 110 },
  pants:  { name: 'Pants',  icon: '👖', armor: 7,  price: 80 },
  boots:  { name: 'Boots',  icon: '🥾', armor: 4,  price: 70 },
};
const GEAR_SLOTS = ['helmet', 'chest', 'pants', 'boots'];
const ITEM_STATS = ['str', 'dex', 'agi', 'int', 'vit', 'spd']; // spd = % move speed

const INV_SIZE = 8, STACK = 10;
const POTIONS = {
  hp: { name: 'Health Potion', color: '#e53935', price: 30, desc: 'Restores 50% HP' },
  mp: { name: 'Mana Potion',   color: '#1e88e5', price: 30, desc: 'Restores 60% mana' },
};

const MAX_CHESTS = 10;
// Prices in Telegram Stars; must match PACKS in server/server.js
const GEM_PACKS = [
  { id: 'p100',  gems: 100,  stars: 75 },
  { id: 'p550',  gems: 550,  stars: 350, bonus: '+10%' },
  { id: 'p1200', gems: 1200, stars: 700, bonus: '+20%' },
];
