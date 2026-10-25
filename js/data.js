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
  { id: 'dmg',    label: v => `+${v}% damage`,     roll: () => U.randi(10, 30) },
  { id: 'rate',   label: v => `+${v}% fire rate`,  roll: () => U.randi(8, 25) },
  { id: 'crit',   label: v => `+${v}% crit chance`, roll: () => U.randi(5, 15) },
  { id: 'pierce', label: v => `+${v} pierce`,      roll: () => 1 },
  { id: 'multi',  label: v => `+${v} projectile`,  roll: () => 1 },
  { id: 'leech',  label: v => `${v}% lifesteal`,   roll: () => U.randi(1, 4) },
  { id: 'range',  label: v => `+${v}% range`,      roll: () => U.randi(10, 30) },
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
  boss:    { name: 'Warlord', hp: 650, speed: 70,  dmg: 26, r: 38, color: '#ff2f6b', xp: 140, gold: [40, 80], minLvl: 99, w: 0, ranged: { rate: .9, speed: 300, range: 520, burst: 10 } },
};

const BIOMES = {
  grass:  { name: 'Meadows',    c: [63, 107, 58],  dens: .05,  obs: 'tree' },
  forest: { name: 'Deepwood',   c: [40, 80, 44],   dens: .17,  obs: 'tree' },
  swamp:  { name: 'Marsh',      c: [56, 82, 72],   dens: .08,  obs: 'tree' },
  desert: { name: 'Dunes',      c: [181, 154, 90], dens: .035, obs: 'rock' },
  waste:  { name: 'Wasteland',  c: [107, 90, 74],  dens: .05,  obs: 'rock' },
  snow:   { name: 'Frostlands', c: [196, 208, 218], dens: .06, obs: 'rock' },
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
  { id: 'market',   icon: '🏪', name: 'Market',   desc: l => `${Math.min(8, 3 + l)} weapons in shop, better rarity` },
  { id: 'vault',    icon: '🏦', name: 'Vault',    desc: l => `Keep ${Math.min(80, l * 12)}% of carried loot on death` },
  { id: 'clinic',   icon: '🏥', name: 'Clinic',   desc: l => `+${l * 15} max HP${l ? ', rapid heal at base' : ''}` },
  { id: 'armory',   icon: '🛡️', name: 'Armory',   desc: l => `Bag ${4 + l} slots, stash ${6 + l * 4} slots` },
  { id: 'workshop', icon: '🔧', name: 'Workshop', desc: l => `Upgrade weapons up to +${l * 2}` },
  { id: 'turrets',  icon: '🗼', name: 'Turrets',  desc: l => `${l} defense turret${l === 1 ? '' : 's'} guard the base` },
  { id: 'radar',    icon: '📡', name: 'Radar',    desc: l => l ? `Minimap range x${(1 + Math.min(l, 6) * .4).toFixed(1)}, shows outposts` : 'Reveal outposts on minimap' },
  { id: 'garden',   icon: '🌾', name: 'Farm',     desc: l => `+${l * 3} gold every 10s` },
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
  let t = TIERS[0]; for (const x of TIERS) if (z >= x.from) t = x;
  if (z >= 25) { const depth = Math.floor((z - 20) / 5); return { ...t, name: `The Abyss ${'I'.repeat(Math.min(depth, 3))}${depth > 3 ? '+' + (depth - 3) : ''}`, elite: Math.min(.35, .18 + depth * .03) }; }
  return t;
};
const recLevel = z => Math.max(1, Math.round(z * 2.2 - 1));
const zoneOf = (x, y) => 1 + Math.floor(Math.max(0, Math.hypot(x, y) - HOME_R) / 850);
