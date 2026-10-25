'use strict';
// Realms (the map regenerates every so often, Realm of the Mad God style), the realm Overlord,
// quests from NPCs, and the NPCs that live in the base.

const REALM_LEN = 15 * 60;   // seconds of play before a realm closes
const REALM_WARN = 60;       // warning countdown
const REALM_A = ['Ashen', 'Crimson', 'Hollow', 'Frozen', 'Shattered', 'Cursed', 'Sunken', 'Burning', 'Silent', 'Feral', 'Rusted', 'Howling'];
const REALM_B = ['Wastes', 'Reach', 'Expanse', 'Badlands', 'Hollows', 'Frontier', 'Dominion', 'Barrens', 'Marches', 'Scar'];

const Realm = {
  make() {
    return { seed: U.randi(1, 1e9), name: `${U.pick(REALM_A)} ${U.pick(REALM_B)}`, time: 0, cleared: 0, boss: null, closing: -1 };
  },
  ensure() {
    const S = G.save;
    if (!S.realm) { S.realm = this.make(); S.realm.seed = S.seed; }
    S.seed = S.realm.seed;
    World.reset(S.seed);
  },
  timeLeft() { const R = G.save.realm; return R.closing >= 0 ? R.closing : Math.max(0, REALM_LEN - R.time); },

  update(dt) {
    const R = G.save.realm;
    R.time += dt;
    if (R.closing >= 0) {
      const before = Math.ceil(R.closing);
      R.closing -= dt;
      if (Math.ceil(R.closing) !== before && [30, 10, 5].includes(Math.ceil(R.closing)) && !G.atHome) toast(t('🌀 Realm closing in {s}s', { s: Math.ceil(R.closing) }), '#b388ff');
      if (R.closing <= 0) this.shift();
    } else if (REALM_LEN - R.time <= REALM_WARN) {
      this.startClosing(REALM_WARN, t('The realm is collapsing'));
    }
    this.updateBoss();
  },

  startClosing(sec, why) {
    const R = G.save.realm;
    if (R.closing >= 0 && R.closing <= sec) return;
    R.closing = sec;
    UI.banner(t('🌀 REALM CLOSING'), t('{why} · {s}s · you will be pulled back to base', { why, s: sec }));
  },

  // the old realm vanishes; a new one opens. Being pulled out is not death: carried loot is banked.
  shift() {
    const S = G.save, p = G.p, wasOut = !G.atHome;
    S.realm = this.make(); S.seed = S.realm.seed; World.reset(S.seed);
    S.run.cleared = [];
    G.enemies = []; G.ebullets = []; G.bullets = []; G.pickups = []; G.decals = []; G.active.clear();
    G.recallT = 0;
    if (wasOut) { p.x = 0; p.y = 60; G.atHome = false; } // next update runs enterHome() and banks loot
    UI.banner(`🌀 ${S.realm.name.toUpperCase()}`, t('A new realm has opened'));
    Sfx.play('level');
    persist();
  },

  onOutpostCleared() {
    const R = G.save.realm;
    R.cleared++;
    if (R.cleared === 3 && !R.boss) this.spawnBoss();
    else if (R.cleared < 3) toast(t('Outposts cleared in this realm: {n}/3', { n: R.cleared }), '#b388ff');
  },

  spawnBoss() {
    const R = G.save.realm, z = Math.max(3, G.save.stats.best - 1), a = Math.random() * 6.283;
    const d = HOME_R + 850 * (z - .5);
    let x = Math.cos(a) * d, y = Math.sin(a) * d;
    for (let i = 0; i < 20 && World.blocked(x, y); i++) { x += 40; y += 25; }
    R.boss = { x, y, spawned: false, killed: false };
    UI.banner(t('👹 THE OVERLORD AWAKENS'), t('Zone {z} · follow the purple arrow', { z: zoneOf(x, y) }));
    Sfx.play('boom');
  },

  updateBoss() {
    const R = G.save.realm, b = R.boss, p = G.p;
    if (!b || b.killed) return;
    const d2 = U.dist2(b.x, b.y, p.x, p.y);
    if (!b.spawned && d2 < 900 * 900) {
      const e = makeEnemy('overlord', b.x, b.y, zoneOf(b.x, b.y) + 3, 'overlord');
      e.hp = e.maxHp *= 1.5;
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; makeEnemy(U.pick(['brute', 'spitter', 'grunt', 'runner']), b.x + Math.cos(a) * 150, b.y + Math.sin(a) * 150, zoneOf(b.x, b.y) + 1, 'overlord'); }
      b.spawned = true;
      UI.banner(t('👹 OVERLORD'), t('Defeat it to collapse the realm and claim its treasure'));
    } else if (b.spawned && d2 > 2600 * 2600) {
      // walked away: the Overlord waits at its lair at full health
      G.enemies = G.enemies.filter(e => e.outpost !== 'overlord');
      b.spawned = false;
    }
  },

  onBossKilled(e) {
    const S = G.save, R = S.realm;
    R.boss.killed = true; S.stats.bosses++;
    for (const g of G.enemies) if (g.outpost === 'overlord') g.outpost = null;
    const gems = U.randi(8, 15);
    Net.earn(gems, 'overlord');
    UI.banner(t('👹 OVERLORD SLAIN'), t('+💎{g} · the realm will collapse soon', { g: gems }));
    for (let i = 0; i < 14; i++) addPickup('gold', e.x, e.y, Math.round(10 * e.lvl * G.st.goldMul));
    addPickup('scrap', e.x, e.y, Math.round(20 * e.lvl * G.st.scrapMul));
    for (let i = 0; i < 2; i++) addPickup('weapon', e.x, e.y, 0, randomItem(e.lvl, G.st.luck + 1.5, 3));
    addPickup('potion', e.x, e.y, 'hp'); addPickup('potion', e.x, e.y, 'mp');
    Quests.progress('overlord');
    this.startClosing(90, t('The Overlord has fallen'));
  },
};

// ---------- quests ----------
const QUEST_KINDS = [
  { id: 'kill',     w: 3,  icon: '⚔️' },
  { id: 'killType', w: 3,  icon: '🎯' },
  { id: 'elite',    w: 2,  icon: '⭐' },
  { id: 'outpost',  w: 2,  icon: '🏴' },
  { id: 'zone',     w: 1.5, icon: '🧭' },
  { id: 'gold',     w: 1.5, icon: '🪙' },
  { id: 'overlord', w: .8, icon: '👹' },
];

const Quests = {
  gen() {
    const S = G.save, L = Math.max(1, S.stats.best);
    const kinds = QUEST_KINDS.filter(k => k.id !== 'overlord' || L >= 3);
    const k = U.weighted(kinds, x => x.w);
    const q = { id: newUid(), type: k.id, sub: null, prog: 0, target: 1, done: false, mult: 1 };
    switch (k.id) {
      case 'kill': q.target = U.randi(20, 35) + L * 2; break;
      case 'killType': {
        const types = Object.keys(ENEMY_TYPES).filter(t => ENEMY_TYPES[t].minLvl <= L);
        q.sub = U.pick(types); q.target = U.randi(6, 12); q.mult = 1.3; break;
      }
      case 'elite': q.target = U.randi(2, 5); q.mult = 1.5; break;
      case 'outpost': q.target = U.randi(1, 3); q.mult = 1.4 * q.target; break;
      case 'zone': q.target = L + U.randi(1, 2); q.mult = 2; break;
      case 'gold': q.target = Math.round(120 * L * U.rand(1, 1.8)); break;
      case 'overlord': q.target = 1; q.mult = 4; break;
    }
    q.reward = {
      gold: Math.round(70 * L * q.mult),
      xp: Math.round(30 * L * q.mult),
      gems: k.id === 'overlord' ? 15 : Math.random() < .3 ? U.randi(3, 8) : 0,
      item: Math.random() < .35 ? randomItem(L, G.st.luck + .5, 1) : null,
    };
    return q;
  },
  ensure() {
    const S = G.save;
    while (S.quests.length < 3) {
      let q = this.gen();
      for (let i = 0; i < 8 && S.quests.some(o => o.type === q.type && o.sub === q.sub); i++) q = this.gen();
      S.quests.push(q);
    }
  },
  text(q) {
    switch (q.type) {
      case 'kill': return t('Defeat {n} enemies', { n: q.target });
      case 'killType': return t('Defeat {n} {e}', { n: q.target, e: t(ENEMY_TYPES[q.sub].name + 's') });
      case 'elite': return t('Defeat {n} elite enemies', { n: q.target });
      case 'outpost': return q.target > 1 ? t('Clear {n} outposts', { n: q.target }) : t('Clear 1 outpost');
      case 'zone': return t('Reach zone {n}', { n: q.target });
      case 'gold': return t('Collect {n} gold', { n: q.target });
      case 'overlord': return t('Slay a realm Overlord');
    }
    return '?';
  },
  icon(q) { return QUEST_KINDS.find(k => k.id === q.type).icon; },
  progress(type, amount = 1, sub = null) {
    for (const q of G.save.quests) {
      if (q.done || q.type !== type || (q.sub && q.sub !== sub)) continue;
      q.prog = type === 'zone' ? Math.max(q.prog, amount) : Math.min(q.target, q.prog + amount);
      if (q.prog >= q.target) { q.prog = q.target; q.done = true; toast(t('📜 Quest complete: {q}. Claim it at base', { q: this.text(q) }), '#ffe082'); Sfx.play('level'); }
    }
  },
  claim(id) {
    const S = G.save, i = S.quests.findIndex(q => q.id === id), q = S.quests[i];
    if (!q || !q.done) return;
    const r = q.reward;
    S.gold += r.gold; if (r.gems) Net.earn(r.gems, 'quest'); gainXp(r.xp);
    if (r.item && !invAdd(r.item)) S.stash.push(r.item);
    S.quests.splice(i, 1); this.ensure();
    toast(t('Reward: 🪙{g} ✨{x} XP', { g: U.fmt(r.gold), x: r.xp }) + (r.gems ? ` 💎${r.gems}` : '') + (r.item ? t(' + item') : ''), '#ffe082');
    Sfx.play('buy');
  },
  reroll(id) {
    const S = G.save, i = S.quests.findIndex(q => q.id === id);
    if (i < 0 || S.gold < 40 || S.quests[i].done) return;
    S.gold -= 40; S.quests[i] = this.gen();
  },
  readyCount() { return G.save.quests.filter(q => q.done).length; },
};

// ---------- NPCs at the base ----------
const NPCS = [
  { id: 'quest', name: 'Commander Vale', x: -100, y: -95,  col: '#c62828', hat: '#ffd54f', icon: '📜' },
  { id: 'gems',  name: 'Mystic Zara',    x: 100,  y: -95,  col: '#6a1b9a', hat: '#e1bee7', icon: '💎' },
  { id: 'vault', name: 'Keeper Bram',    x: -115, y: 115,  col: '#5d4037', hat: '#90a4ae', icon: '🗝️' },
  { id: 'smith', name: 'Smith Hilda',    x: 115,  y: 115,  col: '#e65100', hat: '#37474f', icon: '🔨' },
];
function nearNpc() {
  if (!G.atHome) return null;
  for (const n of NPCS) if (U.dist2(n.x, n.y, G.p.x, G.p.y) < 75 * 75) return n;
  return null;
}
