'use strict';
// Weapon item generation and stat math.
let UID = 0;
const newUid = () => Date.now().toString(36) + (UID++).toString(36) + U.randi(0, 999);

function makeWeapon(type, rarity, level) {
  const r = RARITIES[rarity], pool = AFFIXES.slice(), affixes = [];
  for (let i = 0; i < r.affixes && pool.length; i++) {
    const a = pool.splice(U.randi(0, pool.length - 1), 1)[0];
    affixes.push({ id: a.id, v: a.roll() });
  }
  return { uid: newUid(), type, rarity, level: Math.max(1, level), upg: 0, affixes };
}

function rollRarity(luck) {
  const idx = U.weighted(RARITIES.map((r, i) => i), i => RARITIES[i].w * (i ? 1 + luck * i : 1));
  return idx;
}

function randomWeapon(level, luck, minRarity = 0) {
  return makeWeapon(U.pick(Object.keys(WEAPON_TYPES)), Math.max(minRarity, rollRarity(luck)), level);
}

const affixSum = (w, id) => w.affixes.reduce((s, a) => s + (a.id === id ? a.v : 0), 0);

function weaponStats(w) {
  const t = WEAPON_TYPES[w.type], r = RARITIES[w.rarity];
  const lv = 1 + 0.14 * (w.level - 1), up = 1 + 0.1 * w.upg;
  return {
    dmg: t.dmg * r.mult * lv * up * (1 + affixSum(w, 'dmg') / 100),
    rate: t.rate * (1 + affixSum(w, 'rate') / 100) * (1 + 0.03 * w.upg),
    speed: t.speed, spread: t.spread,
    bullets: t.bullets, multi: affixSum(w, 'multi'),
    range: t.range * (1 + affixSum(w, 'range') / 100),
    pierce: t.pierce + affixSum(w, 'pierce'),
    crit: affixSum(w, 'crit') / 100, leech: affixSum(w, 'leech') / 100,
    explode: t.explode || 0, color: t.color, size: t.size,
  };
}
const weaponDps = w => { const s = weaponStats(w); return s.dmg * s.rate * (s.bullets + s.multi); };
const weaponValue = w => Math.round(WEAPON_TYPES[w.type].price * Math.pow(RARITIES[w.rarity].mult, 2) * (1 + 0.18 * (w.level - 1)) * (1 + 0.15 * w.upg));
const weaponName = w => `${RARITIES[w.rarity].name} ${WEAPON_TYPES[w.type].name}${w.upg ? ' +' + w.upg : ''}`;
const upgradeCost = w => ({ gold: Math.round(40 * (w.upg + 1) * (1 + 0.1 * w.level)), scrap: Math.round(12 * Math.pow(w.upg + 1, 1.6)) });
const salvageValue = w => Math.round(4 * (w.rarity + 1) * (1 + 0.2 * (w.level - 1)) + w.upg * 6);
