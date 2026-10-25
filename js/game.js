'use strict';
// Core simulation + rendering.
const G = {
  enemies: [], bullets: [], decals: [], bolts: [], recoil: 0, flashT: 0, abCd: 0, potCd: 0,
  buff: { rapid: 0, crit: 0, spd: 0 }, ebullets: [], pickups: [], parts: [], texts: [], turrets: [],
  active: new Map(), // outpost id -> true while its garrison is spawned
  t: 0, paused: false, zoom: 1, w: 0, h: 0, dpr: 1,
  lastZone: 0, atHome: true, spawnT: 0, outT: 0, farmT: 0, saveT: 0, mmT: 0, hudT: 0,
  fireCd: 0, shake: 0, hurtFlash: 0, pendingPerks: 0, shop: null, fullToastT: 0,
};

// ---------- setup ----------
function resize() {
  G.dpr = Math.min(2, devicePixelRatio || 1);
  G.w = innerWidth; G.h = innerHeight;
  G.canvas.width = G.w * G.dpr | 0; G.canvas.height = G.h * G.dpr | 0;
  G.canvas.style.width = G.w + 'px'; G.canvas.style.height = G.h + 'px';
  G.zoom = U.clamp(Math.min(G.w, G.h) / 620, .55, 1.15);
}

function newRun() {
  G.save.run = {
    x: 0, y: 60, hp: -1, gold: 0, scrap: 0, rank: 0, rxp: 0, perks: [], cleared: [], maxZone: 1, kills: 0, time: 0,
    mod: { dmg: 0, rate: 0, hp: 0, spd: 0, crit: 0, multi: 0, pierce: 0, magnet: 0, regen: 0, leech: 0, gold: 0, dashCd: 0, thorns: 0 },
  };
}

// class base + spent points + gear bonuses
function totalAttrs() {
  const S = G.save, base = (CLASS_BY_ID[S.cls] || CLASSES[0]).base, t = { spd: 0, armor: 0 };
  for (const a of ATTRS) t[a.id] = base[a.id] + S.attrs[a.id];
  for (const sl of GEAR_SLOTS) {
    const g = S.gear[sl]; if (!g) continue;
    t.armor += armorValue(g);
    for (const k in g.stats) t[k] += g.stats[k];
  }
  return t;
}

function computeStats() {
  const S = G.save, k = S.skills, b = S.buildings, m = S.run.mod, A = totalAttrs();
  return {
    attrs: A, armor: A.armor, dr: A.armor / (A.armor + 100),
    maxHp: Math.round((100 + (S.level - 1) * 5 + b.clinic * 15 + m.hp + A.vit * 8 + A.str * 2) * (1 + k.tough * .1) * (1 + k.power * .03)),
    maxMp: Math.round(50 + A.int * 5),
    mpRegen: 2 + A.int * .15,
    abPower: (1 + A.int * .03) * (1 + .12 * (S.level - 1)),
    dmgMul: (1 + k.marks * .08 + m.dmg + A.str * .015) * (1 + k.power * .03),
    rateMul: 1 + k.trigger * .06 + m.rate + A.dex * .01,
    spd: 200 * (1 + k.fleet * .05 + m.spd + A.agi * .006 + A.spd / 100),
    crit: .05 + k.crit * .04 + m.crit + A.dex * .005,
    regen: k.regen * .5 + m.regen + A.vit * .1,
    dashCd: 2.6 * (1 - k.dash * .1) * Math.max(.35, 1 - m.dashCd) * Math.max(.5, 1 - A.agi * .008),
    magnet: 90 * (1 + m.magnet),
    leech: m.leech, goldMul: 1 + m.gold, scrapMul: 1 + k.scav * .15,
    thorns: m.thorns, multi: m.multi, pierce: m.pierce,
    luck: k.lucky * .25, haggle: k.haggle,
    stashCap: 8 * S.vaultChests + b.armory * 4,
  };
}

function recalc() {
  G.st = computeStats();
  G.ws = weaponStats(G.save.equipped);
  G.p.hp = Math.min(G.p.hp, G.st.maxHp);
  G.p.mp = Math.min(G.p.mp, G.st.maxMp);
  buildTurrets();
}

function buildTurrets() {
  const n = G.save.buildings.turrets;
  if (G.turrets.length === n) return;
  G.turrets = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i / n * Math.PI * 2 + .4;
    G.turrets.push({ x: Math.cos(a) * (HOME_R - 22), y: Math.sin(a) * (HOME_R - 22), cd: 0, ang: a });
  }
}

function persist() {
  if (G.noSave) return; // a restore/erase is reloading the page
  const r = G.save.run;
  r.x = G.p.x; r.y = G.p.y; r.hp = G.p.hp; r.mp = G.p.mp;
  Save.write(G.save);
}

function init() {
  G.canvas = document.getElementById('game'); G.ctx = G.canvas.getContext('2d');
  G.mm = document.getElementById('minimap'); G.mmx = G.mm.getContext('2d');
  resize(); addEventListener('resize', resize);
  G.save = Save.load();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* not supported */ }
  Realm.ensure();
  if (!G.save.run) newRun();
  const r = G.save.run;
  G.p = { x: r.x, y: r.y, hp: r.hp, mp: r.mp ?? 999, r: 16, ang: -Math.PI / 2, dashT: 0, dashCd: 0, dvx: 0, dvy: 0, inv: 0 };
  G.st = computeStats(); recalc();
  if (G.p.hp <= 0) G.p.hp = G.st.maxHp;
  G.atHome = Math.hypot(G.p.x, G.p.y) < HOME_R;
  G.lastZone = zoneOf(G.p.x, G.p.y);
  Sfx.on = G.save.settings.sound;
  Art.init();
  Input.init(G.canvas);
  UI.init();
  Quests.ensure();
  if (!G.save.seenIntro) UI.intro();
  else if (!G.save.cls) UI.classPick(true);
  addEventListener('visibilitychange', () => { if (document.hidden) { persist(); if (!UI.open) UI.act('menu'); } });
  addEventListener('pagehide', persist);
  addEventListener('beforeunload', persist);
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    Input.update();
    if (!G.paused) update(dt);
    render();
    G.hudT -= dt; if (G.hudT <= 0) { G.hudT = .1; UI.hud(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------- helpers ----------
function toast(msg, color) { UI.toast(msg, color); }
function addText(x, y, txt, color = '#fff', size = 14) { G.texts.push({ x, y, txt, color, size, life: .8 }); }
function burst(x, y, color, n = 8, spd = 160, size = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = U.rand(.3, 1) * spd;
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(.25, .55), max: .55, color, size });
  }
}
function nearestEnemy(x, y, range) {
  let best = null, bd = range * range;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = U.dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function addPickup(kind, x, y, v = 0, item = null) {
  const a = Math.random() * 6.283, s = U.rand(40, 160);
  G.pickups.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v, item, t: 0, life: kind === 'weapon' ? 150 : 60, lock: 0 });
}

// ---------- inventory ----------
function invAdd(it) {
  const inv = G.save.inv;
  if (it.kind === 'potion') {
    for (const s of inv) if (s && s.kind === 'potion' && s.p === it.p && s.n < STACK) {
      const take = Math.min(STACK - s.n, it.n); s.n += take; it.n -= take;
      if (!it.n) return true;
    }
  }
  const i = inv.indexOf(null);
  if (i < 0) return false;
  inv[i] = it; return true;
}
const potionCount = p => G.save.inv.reduce((n, s) => n + (s && s.kind === 'potion' && s.p === p ? s.n : 0), 0);

// ---------- player actions ----------
function dash() {
  const p = G.p;
  if (p.dashCd > 0 || G.paused) return;
  let dx = Input.move.x, dy = Input.move.y;
  if (!dx && !dy) { dx = Math.cos(p.ang); dy = Math.sin(p.ang); }
  const d = Math.hypot(dx, dy); p.dvx = dx / d; p.dvy = dy / d;
  p.dashT = .18; p.dashCd = G.st.dashCd;
  burst(p.x, p.y, '#9be7ff', 10, 120);
}

function usePotion(p) {
  const S = G.save, st = G.st;
  if (G.potCd > 0 || G.paused) return;
  const i = S.inv.findIndex(s => s && s.kind === 'potion' && s.p === p);
  if (i < 0) { toast(`No ${POTIONS[p].name}s`); return; }
  if (p === 'hp' ? G.p.hp >= st.maxHp : G.p.mp >= st.maxMp) { toast(p === 'hp' ? 'Already at full health' : 'Mana already full'); return; }
  if (--S.inv[i].n <= 0) S.inv[i] = null;
  G.potCd = .8;
  if (p === 'hp') { const h = st.maxHp * .5; G.p.hp = Math.min(st.maxHp, G.p.hp + h); addText(G.p.x, G.p.y - 30, '+' + Math.round(h), '#66ff88', 18); burst(G.p.x, G.p.y, '#ef5350', 12, 100); }
  else { const m = st.maxMp * .6; G.p.mp = Math.min(st.maxMp, G.p.mp + m); addText(G.p.x, G.p.y - 30, '+' + Math.round(m), '#64b5f6', 18); burst(G.p.x, G.p.y, '#42a5f5', 12, 100); }
  Sfx.play('pick');
}

// ---------- class abilities ----------
function useAbility() {
  const S = G.save, p = G.p, st = G.st, ab = (CLASS_BY_ID[S.cls] || CLASSES[0]).ability;
  if (G.paused || G.abCd > 0) return;
  if (p.mp < ab.mana) { toast('Not enough mana 🔷', '#64b5f6'); return; }
  const pow = st.abPower, tgt = nearestEnemy(p.x, p.y, 520);
  const aim = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.ang;
  p.mp -= ab.mana; G.abCd = ab.cd;
  switch (ab.id) {
    case 'grenade': {
      const d = tgt ? Math.min(380, Math.hypot(tgt.x - p.x, tgt.y - p.y)) : 260;
      G.bullets.push({ x: p.x, y: p.y, vx: Math.cos(aim) * 560, vy: Math.sin(aim) * 560, life: d / 560, dmg: 45 * pow, crit: false, pierce: 0, r: 7, color: '#9ccc65', explode: 115, leech: 0, hit: [], grenade: true });
      break;
    }
    case 'rapid': G.buff.rapid = 4; burst(p.x, p.y, '#ff7043', 16, 140); break;
    case 'chain': {
      let from = { x: p.x, y: p.y }, range = 460; const hit = [], pts = [[p.x, p.y]];
      for (let i = 0; i < 6; i++) {
        let best = null, bd = range * range;
        for (const e of G.enemies) { if (e.dead || hit.includes(e)) continue; const d = U.dist2(from.x, from.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
        if (!best) break;
        hit.push(best); pts.push([best.x, best.y]);
        damageEnemy(best, 32 * pow * (1 - i * .08), false, best.x - from.x, best.y - from.y);
        from = best; range = 280;
      }
      if (!hit.length) { p.mp += ab.mana; G.abCd = 0; toast('No target in range'); return; }
      G.bolts.push({ pts, life: .25 });
      break;
    }
    case 'warcry': {
      G.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: .35, max: .35, color: 'rgba(255,214,0,.6)', size: 230, ring: true });
      for (const e of G.enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
        if (d < 230 + e.r) { damageEnemy(e, 28 * pow, false, dx, dy); if (!e.boss) { e.kx += dx / (d || 1) * 900; e.ky += dy / (d || 1) * 900; } }
      }
      p.hp = Math.min(st.maxHp, p.hp + st.maxHp * .25); p.inv = 2;
      G.shake = .3;
      break;
    }
    case 'shadow': {
      let dx = Input.move.x, dy = Input.move.y;
      if (!dx && !dy) { dx = Math.cos(p.ang); dy = Math.sin(p.ang); }
      const d = Math.hypot(dx, dy);
      burst(p.x, p.y, '#90a4ae', 16, 120);
      for (let i = 0; i < 8; i++) { p.x += dx / d * 22; p.y += dy / d * 22; World.collide(p); }
      burst(p.x, p.y, '#90a4ae', 16, 120);
      p.inv = 1; G.buff.crit = 3; G.buff.spd = 3;
      break;
    }
  }
  Sfx.play('level');
}

function shoot() {
  const p = G.p, ws = G.ws, st = G.st;
  const extra = ws.multi + st.multi, n = ws.bullets + extra;
  for (let i = 0; i < n; i++) {
    let a = p.ang;
    if (ws.bullets > 1) a += U.rand(-ws.spread, ws.spread);
    else a += (i - (n - 1) / 2) * .13 + U.rand(-ws.spread, ws.spread);
    const crit = G.buff.crit > 0 || Math.random() < st.crit + ws.crit;
    const c = Math.cos(a), s = Math.sin(a), spd = ws.speed * U.rand(.95, 1.05);
    G.bullets.push({
      x: p.x + c * 22, y: p.y + s * 22, vx: c * spd, vy: s * spd, life: ws.range / ws.speed,
      dmg: ws.dmg * st.dmgMul * (crit ? 2 : 1), crit, pierce: ws.pierce + st.pierce + (G.buff.rapid > 0 ? 1 : 0), r: ws.size,
      color: crit ? '#ffffff' : ws.color, explode: ws.explode, leech: ws.leech + st.leech, hit: [],
    });
  }
  G.recoil = Math.min(6, 2 + ws.dmg / 20); G.flashT = .05;
  if (Math.random() < .7) {
    const c = Math.cos(p.ang), s = Math.sin(p.ang), side = U.rand(60, 120);
    G.parts.push({ x: p.x + c * 10, y: p.y + s * 10, vx: -s * side + U.rand(-20, 20), vy: c * side + U.rand(-20, 20), life: .45, max: .45, color: '#ffca28', size: 1.6 });
  }
  Sfx.play('shoot');
}

function hurtPlayer(dmg, src) {
  const p = G.p;
  if (p.inv > 0 || p.dashT > 0 || G.atHome) return;
  dmg *= 1 - G.st.dr;
  p.hp -= dmg; p.inv = .22; G.hurtFlash = .35; G.shake = Math.min(.4, G.shake + .15);
  addText(p.x, p.y - 26, '-' + Math.round(dmg), '#ff5252', 16);
  Sfx.play('hurt');
  if (src && G.st.thorns) damageEnemy(src, dmg * G.st.thorns * 3, false, 0, 0);
  if (p.hp <= 0) die();
}

function gainXp(x) {
  const S = G.save, run = S.run;
  S.xp += x;
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level); S.level++; S.sp++; S.ap += ATTR_PER_LEVEL;
    UI.banner('LEVEL ' + S.level, `+1 skill point · +${ATTR_PER_LEVEL} attribute points`);
    Sfx.play('level');
    recalc(); G.p.hp = Math.min(G.st.maxHp, G.p.hp + G.st.maxHp * .3);
  }
  run.rxp += x;
  while (run.rxp >= rankNeed(run.rank)) { run.rxp -= rankNeed(run.rank); run.rank++; G.pendingPerks++; }
  if (G.pendingPerks > 0 && !UI.open) UI.perkChoice();
}

// ---------- home ----------
function enterHome() {
  const run = G.save.run;
  if (run.gold || run.scrap) {
    G.save.gold += run.gold; G.save.scrap += run.scrap;
    toast(`Banked 🪙${U.fmt(run.gold)}  ⚙️${U.fmt(run.scrap)}`, '#ffe082');
    run.gold = 0; run.scrap = 0;
    Sfx.play('buy');
  }
  G.ebullets = [];
  if (!G.shop || G.t - G.shop.t > 150) rollShop();
  persist();
}

function rollShop() {
  const b = G.save.buildings.market, lvl = Math.max(1, G.save.stats.best - 1);
  const items = [];
  for (let i = 0; i < Math.min(8, 3 + b); i++) items.push(randomItem(lvl, b * .3 + G.st.luck));
  G.shop = { t: G.t, items };
}

// ---------- death ----------
function die() {
  const S = G.save, run = S.run, keep = Math.min(.8, S.buildings.vault * .12);
  const kept = { gold: Math.floor(run.gold * keep), scrap: Math.floor(run.scrap * keep) };
  const summary = {
    time: run.time, kills: run.kills, zone: run.maxZone, rank: run.rank, perks: run.perks.slice(),
    lostGold: run.gold - kept.gold, lostScrap: run.scrap - kept.scrap, keptGold: kept.gold, keptScrap: kept.scrap, lostItems: S.inv.filter(s => s && s.kind !== 'potion').length,
  };
  S.gold += kept.gold; S.scrap += kept.scrap;
  S.inv = S.inv.map(s => s && s.kind === 'potion' ? s : null); S.stats.deaths++; S.stats.runs++;
  S.realm = Realm.make(); S.seed = S.realm.seed; World.reset(S.seed);
  newRun();
  G.enemies = []; G.bullets = []; G.ebullets = []; G.pickups = []; G.decals = []; G.active.clear(); G.pendingPerks = 0;
  Object.assign(G.p, { x: 0, y: 60, dashT: 0, dashCd: 0, inv: 0 });
  G.buff = { rapid: 0, crit: 0, spd: 0 }; G.abCd = 0;
  recalc(); G.p.hp = G.st.maxHp; G.p.mp = G.st.maxMp;
  G.atHome = true; G.lastZone = 1; G.shop = null;
  persist();
  Sfx.play('boom');
  UI.death(summary);
}

// ---------- enemies ----------
function makeEnemy(type, x, y, lvl, outpost = null) {
  const d = ENEMY_TYPES[type];
  const elite = !outpost && type !== 'boss' && lvl >= 2 && Math.random() < tierOf(lvl).elite;
  // linear + gentle exponential growth so deeper zones always out-scale you eventually
  const hpMul = (1 + .3 * (lvl - 1)) * Math.pow(1.03, lvl - 1) * (elite ? 3 : 1);
  const e = {
    type, def: d, x, y, lvl, elite, outpost, boss: type === 'boss' || type === 'overlord',
    r: d.r * (elite ? 1.3 : 1), hp: d.hp * hpMul, maxHp: d.hp * hpMul,
    speed: d.speed * U.rand(.9, 1.1) * (1 + .02 * Math.min(lvl, 15)), dmg: d.dmg * (1 + .14 * (lvl - 1)) * Math.pow(1.02, lvl - 1) * (elite ? 1.5 : 1), chargeT: 0, windT: 0, cdx: 0, cdy: 0,
    atkCd: U.rand(.5, 1.5), touchCd: 0, hitT: 0, kx: 0, ky: 0, strafe: Math.random() < .5 ? 1 : -1, hx: x, hy: y, dead: false,
  };
  G.enemies.push(e);
  return e;
}

function spawnEnemies(dt) {
  G.spawnT -= dt;
  if (G.spawnT > 0) return;
  G.spawnT = .35;
  const p = G.p;
  if (Math.hypot(p.x, p.y) < HOME_R + 150) return;
  const cap = Math.min(55, 7 + G.lastZone * 3);
  let normal = 0; for (const e of G.enemies) if (!e.outpost) normal++;
  if (normal >= cap) return;
  const rad = Math.hypot(G.w, G.h) / 2 / G.zoom + 60;
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * 6.283, d = rad + U.rand(0, 180);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (Math.hypot(x, y) < HOME_R + 80 || World.blocked(x, y)) continue;
    const lvl = zoneOf(x, y);
    const types = Object.keys(ENEMY_TYPES).filter(k => ENEMY_TYPES[k].minLvl <= lvl);
    const type = U.weighted(types, k => ENEMY_TYPES[k].w);
    // occasionally spawn a small pack
    const pack = Math.random() < .15 + lvl * .02 ? U.randi(2, 4) : 1;
    for (let i = 0; i < pack; i++) makeEnemy(type, x + U.rand(-40, 40), y + U.rand(-40, 40), lvl);
    return;
  }
}

function updateOutposts(dt) {
  G.outT -= dt;
  if (G.outT > 0) return;
  G.outT = .5;
  const p = G.p, run = G.save.run;
  for (const o of World.outpostsNear(p.x, p.y, 800)) {
    if (run.cleared.includes(o.id) || G.active.has(o.id)) continue;
    const lvl = zoneOf(o.x, o.y) + 1;
    const boss = makeEnemy('boss', o.x, o.y, lvl, o.id);
    boss.hp = boss.maxHp *= 1 + .1 * lvl;
    const guards = Math.min(9, 4 + Math.floor(lvl / 2));
    const types = Object.keys(ENEMY_TYPES).filter(k => ENEMY_TYPES[k].minLvl <= lvl);
    for (let i = 0; i < guards; i++) {
      const a = i / guards * 6.283;
      makeEnemy(U.weighted(types, k => ENEMY_TYPES[k].w), o.x + Math.cos(a) * 120, o.y + Math.sin(a) * 120, lvl, o.id);
    }
    G.active.set(o.id, o);
    UI.banner('⚠️ OUTPOST', `Defeat the Warlord · Zone ${lvl}`);
  }
  // reset garrisons the player walked away from
  for (const [id, o] of G.active) {
    if (U.dist2(o.x, o.y, p.x, p.y) > 2400 * 2400) {
      G.enemies = G.enemies.filter(e => e.outpost !== id);
      G.active.delete(id);
    }
  }
}

function enemyShoot(e, nx, ny) {
  const R = e.def.ranged;
  const shots = R.burst && Math.random() < .5 ? R.burst : 1;
  for (let i = 0; i < shots; i++) {
    const a = Math.atan2(ny, nx) + (shots > 1 ? i / shots * 6.283 : U.rand(-.08, .08));
    G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * R.speed, vy: Math.sin(a) * R.speed, dmg: e.dmg * (shots > 1 ? .7 : 1), life: R.range / R.speed * 1.3, r: e.boss ? 8 : e.def.aimLine ? 5 : 6, sniper: !!e.def.aimLine });
  }
}

function updateEnemies(dt) {
  const p = G.p, decay = Math.pow(.002, dt);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.hitT = Math.max(0, e.hitT - dt); e.atkCd -= dt; e.touchCd -= dt;
    let tx = dx / d, ty = dy / d, spd = e.speed;
    const R = e.def.ranged;
    if (e.outpost && d > 700) {
      // leashed to their outpost
      const hx = e.hx - e.x, hy = e.hy - e.y, hd = Math.hypot(hx, hy);
      if (hd > 50) { tx = hx / hd; ty = hy / hd; spd *= .6; } else { tx = ty = 0; }
    } else if (G.atHome) {
      // player is safe: enemies lose interest and wander
      tx = Math.cos(G.t * .5 + e.hx); ty = Math.sin(G.t * .5 + e.hy); spd *= .3;
    } else if (R) {
      if (d < R.range * .55) { tx = -tx; ty = -ty; spd *= .7; }
      else if (d < R.range * .85) { const s = e.strafe; const ox = tx; tx = -ty * s; ty = ox * s; spd *= .5; }
      if (d < R.range && e.atkCd <= 0) { e.atkCd = 1 / R.rate * U.rand(.8, 1.2); enemyShoot(e, dx / d, dy / d); }
    } else if (e.def.charge) {
      // wind up (stand still, flashing), then charge in a straight line
      if (e.windT > 0) { e.windT -= dt; spd = 0; if (e.windT <= 0) { e.chargeT = .6; } }
      else if (e.chargeT > 0) { e.chargeT -= dt; tx = e.cdx; ty = e.cdy; spd *= 4.8; }
      else if (d < 380 && e.atkCd <= 0) { e.windT = .5; e.atkCd = 3.2; e.cdx = dx / d; e.cdy = dy / d; }
    }
    e.x += (tx * spd + e.kx) * dt; e.y += (ty * spd + e.ky) * dt;
    e.walk = (e.walk || 0) + spd * dt * .09;
    e.kx *= decay; e.ky *= decay;
    // enemies can't enter the base
    const dh = Math.hypot(e.x, e.y), lim = HOME_R + e.r;
    if (dh < lim) { e.x *= lim / dh; e.y *= lim / dh; }
    World.collide(e);
    // contact
    if (!G.atHome && d < e.r + p.r + 2) {
      if (e.def.explode) { killEnemy(e, true); continue; }
      if (e.touchCd <= 0) { e.touchCd = .7; hurtPlayer(e.dmg, e); }
    }
    if (!e.outpost && d > 1900) e.dead = true; // despawn far away
  }
  // light separation so crowds don't stack
  const es = G.enemies;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i], b = es[j], dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > .01) { const d = Math.sqrt(d2), push = (rr - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
  }
  G.enemies = es.filter(e => !e.dead);
}

function damageEnemy(e, dmg, crit, kx, ky, leech = 0) {
  if (e.dead) return;
  e.hp -= dmg; e.hitT = .1;
  if (!e.boss) { const k = 120 / Math.max(1, Math.hypot(kx, ky)); e.kx += kx * k * (e.def.r < 20 ? 1 : .4); e.ky += ky * k * (e.def.r < 20 ? 1 : .4); }
  addText(e.x + U.rand(-8, 8), e.y - e.r, Math.round(dmg) + (crit ? '!' : ''), crit ? '#ffeb3b' : '#fff', crit ? 17 : 13);
  if (leech) G.p.hp = Math.min(G.st.maxHp, G.p.hp + dmg * leech);
  Sfx.play('hit');
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e, exploded) {
  if (e.dead) return;
  e.dead = true;
  const run = G.save.run;
  if (e.def.explode) explode(e.x, e.y, e.def.explode, e.dmg, true);
  burst(e.x, e.y, e.def.color, e.boss ? 40 : 12, e.boss ? 300 : 180, e.boss ? 5 : 3);
  G.decals.push({ x: e.x, y: e.y, r: e.r * 1.1, color: shade(e.def.color, -.5), rot: Math.random() * 6, life: 25 });
  if (G.decals.length > 70) G.decals.shift();
  Sfx.play('kill');
  run.kills++; G.save.stats.kills++;
  Quests.progress('kill'); Quests.progress('killType', 1, e.type); if (e.elite) Quests.progress('elite');
  gainXp(Math.round(e.def.xp * (1 + .2 * (e.lvl - 1)) * (e.elite ? 3 : 1)));
  dropLoot(e);
  if (e.type === 'overlord') Realm.onBossKilled(e);
  else if (e.boss && e.outpost) {
    run.cleared.push(e.outpost); Quests.progress('outpost'); Realm.onOutpostCleared(); G.save.stats.bosses++;
    for (const g of G.enemies) if (g.outpost === e.outpost && !g.dead) g.outpost = null; // guards go feral
    G.active.delete(e.outpost);
    UI.banner('OUTPOST CLEARED', 'Loot dropped!');
    for (let i = 0; i < 8; i++) addPickup('gold', e.x, e.y, Math.round(6 * e.lvl * G.st.goldMul));
    addPickup('scrap', e.x, e.y, Math.round(8 * e.lvl * G.st.scrapMul));
    addPickup('potion', e.x, e.y, 'hp'); addPickup('potion', e.x, e.y, 'mp');
  }
}

function dropLoot(e) {
  const st = G.st, lv = e.lvl;
  const g = Math.round(U.randi(e.def.gold[0], e.def.gold[1]) * (1 + .2 * (lv - 1)) * st.goldMul * (e.elite ? 3 : 1));
  const coins = Math.min(6, Math.max(1, Math.ceil(g / 5)));
  for (let i = 0; i < coins; i++) addPickup('gold', e.x, e.y, Math.max(1, Math.round(g / coins)));
  if (Math.random() < (e.elite || e.boss ? 1 : .3)) addPickup('scrap', e.x, e.y, Math.max(1, Math.round(U.randi(1, 3) * (1 + .15 * (lv - 1)) * st.scrapMul)));
  if (Math.random() < (e.elite ? .25 : .03)) addPickup('potion', e.x, e.y, Math.random() < .55 ? 'hp' : 'mp');
  const wc = e.boss ? 1 : e.elite ? .35 : .03;
  if (Math.random() < wc) addPickup('weapon', e.x, e.y, 0, randomItem(lv, st.luck + Math.min(1.5, lv * .04) + (e.boss ? .8 : e.elite ? .3 : 0), e.boss ? 2 : 0));
}

function explode(x, y, rad, dmg, fromEnemy) {
  burst(x, y, '#ff9800', 22, rad * 3, 4); burst(x, y, '#ffeb3b', 10, rad * 2, 3);
  G.parts.push({ x, y, vx: 0, vy: 0, life: .25, max: .25, color: 'rgba(255,160,40,.35)', size: rad, ring: true });
  G.shake = Math.min(.5, G.shake + .2);
  Sfx.play('boom');
  if (fromEnemy) {
    if (U.dist2(x, y, G.p.x, G.p.y) < (rad + G.p.r) ** 2) hurtPlayer(dmg);
  } else {
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < rad + e.r) damageEnemy(e, dmg * (1 - .5 * Math.min(1, d / rad)), false, e.x - x, e.y - y);
    }
  }
}

// ---------- projectiles ----------
function updateBullets(dt) {
  for (const b of G.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (World.blocked(b.x, b.y)) { b.life = 0; burst(b.x, b.y, '#ccc', 3, 80, 2); }
    if (b.life > 0) for (const e of G.enemies) {
      if (e.dead || b.hit.includes(e)) continue;
      if (U.dist2(b.x, b.y, e.x, e.y) < (e.r + b.r) ** 2) {
        b.hit.push(e);
        if (b.explode) { b.life = 0; break; }
        damageEnemy(e, b.dmg, b.crit, b.vx, b.vy, b.leech);
        if (b.pierce > 0) b.pierce--; else { b.life = 0; break; }
      }
    }
    if (b.life <= 0 && b.explode && !b.boomed) { b.boomed = true; explode(b.x, b.y, b.explode, b.dmg, false); }
  }
  G.bullets = G.bullets.filter(b => b.life > 0);

  const p = G.p;
  for (const b of G.ebullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (World.blocked(b.x, b.y) || Math.hypot(b.x, b.y) < HOME_R) b.life = 0;
    else if (U.dist2(b.x, b.y, p.x, p.y) < (p.r + b.r) ** 2) { b.life = 0; hurtPlayer(b.dmg); }
  }
  G.ebullets = G.ebullets.filter(b => b.life > 0);
}

function updateTurrets(dt) {
  const dmg = 14 * (1 + .3 * (G.save.stats.best - 1));
  for (const t of G.turrets) {
    t.cd -= dt;
    const e = nearestEnemy(t.x, t.y, 560);
    if (!e) continue;
    t.ang = Math.atan2(e.y - t.y, e.x - t.x);
    if (t.cd > 0) continue;
    t.cd = .45;
    const c = Math.cos(t.ang), s = Math.sin(t.ang);
    G.bullets.push({ x: t.x + c * 18, y: t.y + s * 18, vx: c * 900, vy: s * 900, life: .7, dmg, crit: false, pierce: 0, r: 4, color: '#80deea', explode: 0, leech: 0, hit: [] });
  }
}

// ---------- pickups ----------
function updatePickups(dt) {
  const p = G.p, st = G.st, S = G.save, run = S.run, fr = Math.pow(.02, dt);
  for (const k of G.pickups) {
    k.t += dt; k.lock -= dt;
    k.vx *= fr; k.vy *= fr;
    const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
    if (k.kind !== 'weapon' && k.t > .3 && d < st.magnet) { const s = 520 * (1 - d / st.magnet) + 150; k.vx = dx / d * s; k.vy = dy / d * s; }
    k.x += k.vx * dt; k.y += k.vy * dt;
    if (d < p.r + 12 && k.lock <= 0 && k.t > .25) {
      if (k.kind === 'gold') { run.gold += k.v; S.stats.goldEarned += k.v; Quests.progress('gold', k.v); k.dead = true; Sfx.play('pick'); }
      else if (k.kind === 'scrap') { run.scrap += k.v; k.dead = true; addText(k.x, k.y - 10, '+' + k.v + ' ⚙️', '#cfd8dc', 12); Sfx.play('pick'); }
      else if (k.kind === 'potion') {
        if (invAdd(makePotion(k.v))) { k.dead = true; toast(k.v === 'hp' ? '❤️ Health Potion' : '🔷 Mana Potion', POTIONS[k.v].color); Sfx.play('pick'); }
        else if (G.t > G.fullToastT) { G.fullToastT = G.t + 3; toast('🎒 Inventory full!', '#ff8a80'); }
      } else if (k.kind === 'weapon') {
        if (invAdd(k.item)) {
          k.dead = true; Sfx.play('pick');
          const it = k.item, cur = isWeapon(it) ? null : S.gear[it.slot];
          const better = isWeapon(it) ? weaponDps(it) > weaponDps(S.equipped) : !cur || armorValue(it) > armorValue(cur);
          toast(`${itemName(it)} (Lv${it.level})${better ? ' ⬆️' : ''}`, RARITIES[it.rarity].color);
        } else if (G.t > G.fullToastT) { G.fullToastT = G.t + 3; toast('🎒 Inventory full! Equip, drop or bank items at base.', '#ff8a80'); }
      }
    }
    if (k.t > k.life) k.dead = true;
  }
  G.pickups = G.pickups.filter(k => !k.dead);
}

function updateFx(dt) {
  for (const q of G.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .9; q.vy *= .9; q.life -= dt; }
  G.parts = G.parts.filter(q => q.life > 0);
  for (const t of G.texts) { t.y -= 40 * dt; t.life -= dt; }
  G.texts = G.texts.filter(t => t.life > 0);
  for (const d of G.decals) d.life -= dt;
  G.decals = G.decals.filter(d => d.life > 0);
  G.recoil = Math.max(0, G.recoil - dt * 40); G.flashT -= dt;
  if (G.parts.length > 600) G.parts.splice(0, G.parts.length - 600);
}

// ---------- main update ----------
function update(dt) {
  G.t += dt;
  const p = G.p, st = G.st, S = G.save, run = S.run;
  run.time += dt;

  // movement
  let mx = Input.move.x, my = Input.move.y, spd = st.spd * (G.buff.spd > 0 ? 1.4 : 1);
  if (p.dashT > 0) { p.dashT -= dt; spd *= 3.6; mx = p.dvx; my = p.dvy; if (Math.random() < .6) G.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: .2, max: .2, color: 'rgba(120,220,255,.5)', size: p.r }); }
  p.x += mx * spd * dt; p.y += my * spd * dt;
  World.collide(p);
  p.dashCd = Math.max(0, p.dashCd - dt); p.inv = Math.max(0, p.inv - dt);
  G.potCd = Math.max(0, G.potCd - dt); G.abCd = Math.max(0, G.abCd - dt);
  for (const k in G.buff) G.buff[k] = Math.max(0, G.buff[k] - dt);
  for (const b of G.bolts) b.life -= dt;
  G.bolts = G.bolts.filter(b => b.life > 0);

  // home zone
  const atHome = Math.hypot(p.x, p.y) < HOME_R;
  if (atHome && !G.atHome) { G.atHome = true; enterHome(); }
  else if (!atHome && G.atHome) { G.atHome = false; UI.banner('Leaving base', 'Danger rises with distance'); }

  // regen
  let regen = st.regen;
  if (atHome) regen += S.buildings.clinic > 0 ? st.maxHp * .25 : 5;
  p.hp = Math.min(st.maxHp, p.hp + regen * dt);
  p.mp = Math.min(st.maxMp, p.mp + (st.mpRegen + (atHome ? st.maxMp * .25 : 0)) * dt);

  // zone levels
  const z = zoneOf(p.x, p.y);
  if (z !== G.lastZone) {
    if (z > G.lastZone && !atHome) {
      const t = tierOf(z), newTier = tierOf(G.lastZone).name !== t.name;
      if (newTier) UI.banner(`<span style="color:${t.color}">${t.name.toUpperCase()}</span>`, `Zone ${z} · enemies grow stronger · rec. level ${recLevel(z)}`);
      else UI.banner('ZONE ' + z, `${BIOMES[World.biomeAt(p.x, p.y)].name} · rec. level ${recLevel(z)}`);
      if (z > S.stats.best) toast(`🏆 New record: Zone ${z}`, '#ffe082');
    }
    G.lastZone = z;
    if (z > run.maxZone) run.maxZone = z;
    Quests.progress('zone', z);
    if (z > S.stats.best) S.stats.best = z;
  }

  // aiming & firing
  G.fireCd = Math.max(0, G.fireCd - dt);
  let fire = false;
  if (Input.aim.active) { p.ang = Math.atan2(Input.aim.y, Input.aim.x); fire = true; }
  else {
    const tgt = S.settings.autoAim && !atHome ? nearestEnemy(p.x, p.y, G.ws.range * .9) : null;
    if (tgt) { p.ang = Math.atan2(tgt.y - p.y, tgt.x - p.x); fire = true; }
    else if (mx || my) p.ang = Math.atan2(my, mx);
  }
  if (fire && G.fireCd <= 0) { shoot(); G.fireCd += 1 / (G.ws.rate * st.rateMul * (G.buff.rapid > 0 ? 2 : 1)); }

  spawnEnemies(dt);
  updateOutposts(dt);
  Realm.update(dt);
  G.npc = nearNpc();
  updateEnemies(dt);
  updateBullets(dt);
  updateTurrets(dt);
  updatePickups(dt);
  updateFx(dt);
  G.shake = Math.max(0, G.shake - dt); G.hurtFlash = Math.max(0, G.hurtFlash - dt);

  // farm income
  G.farmT += dt;
  if (G.farmT >= 10) { G.farmT = 0; const g = S.buildings.garden * 3; if (g) S.gold += g; }

  G.saveT += dt;
  if (G.saveT > 3) { G.saveT = 0; persist(); }
}

// ---------- rendering ----------
function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fillStyle = fill; ctx.fill(); }

function render() {
  const ctx = G.ctx, z = G.zoom, W = G.w, H = G.h, dpr = G.dpr, p = G.p;
  let cx = p.x, cy = p.y;
  if (G.shake > 0) { cx += U.rand(-1, 1) * G.shake * 18; cy += U.rand(-1, 1) * G.shake * 18; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cx * z), dpr * (H / 2 - cy * z));

  const hw = W / 2 / z, hh = H / 2 / z;
  const tx0 = Math.floor((cx - hw) / TILE) - 1, tx1 = Math.floor((cx + hw) / TILE) + 1;
  const ty0 = Math.floor((cy - hh) / TILE) - 1, ty1 = Math.floor((cy + hh) / TILE) + 1;

  // ground
  drawGround(ctx, tx0, tx1, ty0, ty1);
  const tint = !G.atHome && tierOf(G.lastZone).tint;
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(cx - hw - 10, cy - hh - 10, hw * 2 + 20, hh * 2 + 20); }

  const vis = (x, y, r) => x + r > cx - hw && x - r < cx + hw && y + r > cy - hh && y - r < cy + hh;

  if (vis(0, 0, HOME_R + 40)) { drawHome(ctx); for (const n of NPCS) drawNpc(ctx, n); }
  for (const o of World.outpostsNear(cx, cy, Math.max(hw, hh) + 300)) drawOutpost(ctx, o);
  drawDecals(ctx);

  // obstacles
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
    const o = World.tile(tx, ty).obs;
    if (o) drawObstacle(ctx, o);
  }

  // pickups
  for (const k of G.pickups) {
    if (!vis(k.x, k.y, 30) || (k.life - k.t < 5 && Math.sin(G.t * 20) > 0)) continue;
    drawPickup(ctx, k);
  }

  // enemies
  for (const e of G.enemies) {
    if (e.def.aimLine && !G.atHome && e.atkCd < .7 && U.dist2(e.x, e.y, p.x, p.y) < e.def.ranged.range ** 2) {
      ctx.strokeStyle = `rgba(255,40,40,${.25 + .5 * (1 - e.atkCd / .7)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    if (e.windT > 0) {
      ctx.strokeStyle = 'rgba(0,255,200,.45)'; ctx.lineWidth = e.r * 1.2;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.cdx * 300, e.y + e.cdy * 300); ctx.stroke();
    }
  }
  for (const e of G.enemies) if (vis(e.x, e.y, e.r + 10)) drawEnemy(ctx, e);

  for (const t of G.turrets) drawTurret(ctx, t);
  drawBullets(ctx);
  drawBolts(ctx);

  drawPlayer(ctx);

  // particles
  for (const q of G.parts) {
    ctx.globalAlpha = Math.max(0, q.life / q.max);
    if (q.ring) { ctx.strokeStyle = q.color; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1 - q.life / q.max * .6), 0, 6.283); ctx.stroke(); }
    else circle(ctx, q.x, q.y, q.size, q.color);
  }
  ctx.globalAlpha = 1;

  // floating text
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2);
    ctx.font = `800 ${t.size}px system-ui,sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(t.txt, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // ---- screen space ----
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // outpost direction arrows
  const RB = G.save.realm.boss, arrows = [...G.active.values()].map(o => [o, '#ff2f6b']);
  if (RB && !RB.killed) arrows.push([RB, '#b388ff']);
  for (const [o, acol] of arrows) {
    const dx = o.x - p.x, dy = o.y - p.y;
    if (Math.abs(dx) * z < W / 2 - 30 && Math.abs(dy) * z < H / 2 - 30) continue;
    const a = Math.atan2(dy, dx), r = Math.min(W, H) / 2 - 40;
    ctx.save(); ctx.translate(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r); ctx.rotate(a);
    ctx.fillStyle = acol; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.fill(); ctx.restore();
  }
  // home direction arrow
  if (!G.atHome) {
    const dh = Math.hypot(p.x, p.y);
    if (dh * z > Math.min(W, H) / 2) {
      const a = Math.atan2(-p.y, -p.x), r = Math.min(W, H) / 2 - 70;
      ctx.save(); ctx.translate(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
      ctx.globalAlpha = .75; ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🏠', 0, 0);
      ctx.font = '700 10px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(Math.round(dh / 10) + 'm', 0, 16);
      ctx.restore();
    }
  }
  // damage vignette
  const low = 1 - p.hp / G.st.maxHp;
  if (G.hurtFlash > 0 || low > .65) {
    const a = Math.max(G.hurtFlash, low > .65 ? (low - .65) * 1.5 * (.7 + .3 * Math.sin(G.t * 6)) : 0);
    const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .7);
    gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(200,0,0,${Math.min(.6, a)})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  // joysticks
  for (const s of [Input.left, Input.right]) {
    if (!s) continue;
    ctx.globalAlpha = .35; circle(ctx, s.ox, s.oy, STICK_R, '#fff');
    ctx.globalAlpha = .6;
    const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), k = d > STICK_R ? STICK_R / d : 1;
    circle(ctx, s.ox + dx * k, s.oy + dy * k, 24, s === Input.right ? '#ff8a65' : '#fff');
    ctx.globalAlpha = 1;
  }
  if (Input.touch && !Input.left && !Input.right && !UI.open && G.t < 12) {
    ctx.globalAlpha = .5; ctx.fillStyle = '#fff'; ctx.font = '600 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('◀ drag to move', W * .25, H - 60); ctx.fillText('drag to aim & shoot ▶', W * .75, H - 60);
    ctx.globalAlpha = 1;
  }

  G.mmT -= 1 / 60;
  if (G.mmT <= 0) { G.mmT = .25; drawMinimap(); }
}

function drawMinimap() {
  const m = G.mmx, S = 120, p = G.p, radar = G.save.buildings.radar;
  const range = 1300 * (1 + Math.min(radar, 6) * .4), sc = S / 2 / range, cells = 20, cs = S / cells;
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const wx = p.x + ((i + .5) * cs - S / 2) / sc, wy = p.y + ((j + .5) * cs - S / 2) / sc;
    const c = BIOMES[World.biomeAt(wx, wy)].c;
    m.fillStyle = `rgb(${c[0] * .7 | 0},${c[1] * .7 | 0},${c[2] * .7 | 0})`;
    m.fillRect(i * cs, j * cs, cs + 1, cs + 1);
  }
  const toM = (x, y) => [S / 2 + (x - p.x) * sc, S / 2 + (y - p.y) * sc];
  // home
  let [hx, hy] = toM(0, 0);
  m.strokeStyle = '#ffe082'; m.lineWidth = 2; m.beginPath(); m.arc(hx, hy, Math.max(3, HOME_R * sc), 0, 6.283); m.stroke();
  // outposts (radar reveals them; active ones always shown)
  for (const o of World.outpostsNear(p.x, p.y, range * 1.2)) {
    if (!radar && !G.active.has(o.id)) continue;
    const [ox, oy] = toM(o.x, o.y);
    m.fillStyle = G.save.run.cleared.includes(o.id) ? '#9e9e9e' : '#ff2f6b';
    m.fillRect(ox - 3, oy - 3, 6, 6);
  }
  const RBm = G.save.realm.boss;
  if (RBm && !RBm.killed) { const [bx, by] = toM(RBm.x, RBm.y); m.fillStyle = '#b388ff'; m.beginPath(); m.arc(U.clamp(bx, 4, S - 4), U.clamp(by, 4, S - 4), 4, 0, 6.283); m.fill(); }
  m.fillStyle = '#ff5252';
  for (const e of G.enemies) { const [ex, ey] = toM(e.x, e.y); m.fillRect(ex - 1, ey - 1, e.boss ? 4 : 2, e.boss ? 4 : 2); }
  m.fillStyle = '#fff'; m.beginPath(); m.arc(S / 2, S / 2, 3, 0, 6.283); m.fill();
}

addEventListener('load', init);
