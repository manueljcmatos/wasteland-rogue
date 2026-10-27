'use strict';
// Fog of war and waypoint portals. The map only shows what you have explored in this realm;
// ancient waypoints wake up when you walk near them, and you can pay gold to travel between them.

const FOG_CELL = 500;        // size of one explored map cell
const REVEAL_R = 800;        // how far around you gets revealed
const WP_CHUNK = 2600;       // at most one waypoint per chunk
const WP_WAKE_R = 230;       // walk this close to discover a waypoint
const TP_TIME = 1.5;         // channel time before teleporting
const WP_A = ['Ember', 'Frost', 'Raven', 'Iron', 'Dusk', 'Storm', 'Ash', 'Moon', 'Thorn', 'Stone', 'Gale', 'Sun'];
const WP_B = ['Gate', 'Spire', 'Arch', 'Shrine', 'Obelisk', 'Circle'];

const Explore = {
  seen: new Set(), markT: 0,

  // called when a realm starts or is loaded
  load() {
    const R = G.save.realm;
    if (!R.seen) R.seen = [];
    if (!R.wps) R.wps = [];
    this.seen = new Set(R.seen);
    this.markT = 0;
  },
  key(x, y) { return Math.floor(x / FOG_CELL) + ',' + Math.floor(y / FOG_CELL); },
  seenAt(x, y) { return Math.hypot(x, y) < HOME_R + 300 || this.seen.has(this.key(x, y)); },
  mark(x, y) {
    const R = G.save.realm, n = Math.ceil(REVEAL_R / FOG_CELL), cx = Math.floor(x / FOG_CELL), cy = Math.floor(y / FOG_CELL);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const wx = (cx + i + .5) * FOG_CELL, wy = (cy + j + .5) * FOG_CELL;
      if (U.dist2(wx, wy, x, y) > (REVEAL_R + FOG_CELL * .5) ** 2) continue;
      const k = (cx + i) + ',' + (cy + j);
      if (!this.seen.has(k)) { this.seen.add(k); R.seen.push(k); }
    }
  },

  // ----- waypoints: deterministic from the realm seed, the same for every player -----
  wpOfChunk(cx, cy) {
    const s = World.seed + 911;
    if (U.hash(cx, cy, s) > .55) return null;
    let x = (cx + .2 + .6 * U.hash(cx, cy, s + 1)) * WP_CHUNK, y = (cy + .2 + .6 * U.hash(cx, cy, s + 2)) * WP_CHUNK;
    if (Math.hypot(x, y) < HOME_R + 900) return null;
    if (World.nearOutpost(x, y, 420)) return null;
    const name = `${WP_A[Math.floor(U.hash(cx, cy, s + 3) * WP_A.length)]} ${WP_B[Math.floor(U.hash(cx, cy, s + 4) * WP_B.length)]}`;
    return { id: cx + ',' + cy, x, y, name };
  },
  wpsNear(x, y, rad) {
    const out = [];
    const c0 = Math.floor((x - rad) / WP_CHUNK), c1 = Math.floor((x + rad) / WP_CHUNK);
    const r0 = Math.floor((y - rad) / WP_CHUNK), r1 = Math.floor((y + rad) / WP_CHUNK);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const w = this.wpOfChunk(cx, cy);
      if (w && U.dist2(w.x, w.y, x, y) < rad * rad) out.push(w);
    }
    return out;
  },
  known(id) { return G.save.realm.wps.includes(id); },
  knownList() {
    return G.save.realm.wps.map(id => { const [cx, cy] = id.split(',').map(Number); return this.wpOfChunk(cx, cy); }).filter(Boolean);
  },
  // standing at a known waypoint: travel through the network costs half
  atWaypoint() { return this.wpsNear(G.p.x, G.p.y, WP_WAKE_R + 60).some(w => this.known(w.id)); },
  cost(w) {
    const z = zoneOf(w.x, w.y), d = Math.hypot(w.x - G.p.x, w.y - G.p.y);
    return Math.round((10 + 12 * z * (1 + .12 * z) + d / 80) * (this.atWaypoint() ? .5 : 1));
  },

  update(dt) {
    if (G.visit) return;
    const p = G.p;
    this.markT -= dt;
    if (this.markT <= 0) { this.markT = .4; this.mark(p.x, p.y); }
    // wake waypoints you walk near
    for (const w of this.wpsNear(p.x, p.y, WP_WAKE_R)) {
      if (this.known(w.id)) continue;
      G.save.realm.wps.push(w.id);
      UI.banner(t('🌀 WAYPOINT DISCOVERED'), t('{n} · travel here from the 🗺️ map', { n: w.name }));
      burst(w.x, w.y, '#80deea', 30, 220, 4);
      Sfx.play('level');
      persist();
    }
    // teleport channel
    if (G.tp) {
      G.tp.t -= dt;
      if (G.tp.t <= 0) this.arrive();
    }
  },

  startTeleport(id) {
    const w = this.knownList().find(x => x.id === id), S = G.save;
    if (!w || G.visit || G.tp || Math.hypot(w.x - G.p.x, w.y - G.p.y) < 300) return;
    const c = this.cost(w);
    if (S.run.gold + S.gold < c) { toast(t('Need 🪙{c} to travel', { c: U.fmt(c) }), '#ff8a80'); return; }
    G.tp = { t: TP_TIME, w, c };
    UI.close();
    toast(t('🌀 Travelling to {n}… (🪙{c})', { n: w.name, c: U.fmt(c) }), '#80deea');
  },
  cancel() { if (G.tp) { G.tp = null; toast(t('Travel interrupted!'), '#ff8a80'); } },
  arrive() {
    const { w, c } = G.tp, S = G.save, run = S.run;
    G.tp = null;
    if (run.gold + S.gold < c) { toast(t('Not enough gold'), '#ff8a80'); return; }
    const fromRun = Math.min(run.gold, c); run.gold -= fromRun; S.gold -= c - fromRun;
    burst(G.p.x, G.p.y, '#80deea', 26, 220);
    G.p.x = w.x; G.p.y = w.y + 60; G.ebullets = []; G.p.inv = 2; // a moment to get your bearings
    UI.mapSel = null;
    burst(G.p.x, G.p.y, '#80deea', 26, 220);
    UI.banner(`🌀 ${w.name}`, t('Zone {z}', { z: zoneOf(w.x, w.y) }));
    Sfx.play('level');
    persist();
  },
};
