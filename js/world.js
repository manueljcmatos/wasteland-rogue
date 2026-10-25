'use strict';
// Procedural, infinite open world. Everything is derived from the seed,
// so it never needs to be stored. A new seed is rolled on every death.
const World = {
  seed: 1,
  cache: new Map(),

  reset(seed) { this.seed = seed; this.cache.clear(); },

  biomeAt(x, y) {
    const s = this.seed;
    const t = U.fbm(x / 2600, y / 2600, s), m = U.fbm(x / 1900 + 50, y / 1900 + 50, s + 31);
    if (t < .38) return 'snow';
    if (t > .62) return m < .48 ? 'desert' : 'waste';
    if (m > .6) return 'forest';
    if (m > .54) return 'swamp';
    if (m < .38) return 'ruins';
    return 'grass';
  },

  tile(tx, ty) {
    const k = tx * 1000003 + ty;
    let c = this.cache.get(k);
    if (c) return c;
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    const b = this.biomeAt(cx, cy), B = BIOMES[b];
    const sh = (U.hash(tx, ty, this.seed + 13) - .5) * 14;
    const col = `rgb(${(B.c[0] + sh) | 0},${(B.c[1] + sh) | 0},${(B.c[2] + sh) | 0})`;
    let obs = null;
    if (Math.hypot(cx, cy) > HOME_R + 120 && U.hash(tx, ty, this.seed + 7) < B.dens && !this.nearOutpost(cx, cy, 230)) {
      const h2 = U.hash(tx, ty, this.seed + 21);
      obs = { x: cx + (h2 - .5) * 24, y: cy + (U.hash(tx, ty, this.seed + 22) - .5) * 24, r: 16 + h2 * 12, kind: B.obs, rot: h2 * 6 };
    }
    c = { col, b, obs, v: Math.floor(U.hash(tx, ty, this.seed + 3) * 4) };
    if (this.cache.size > 40000) this.cache.clear();
    this.cache.set(k, c);
    return c;
  },

  outpostOfChunk(cx, cy) {
    if (U.hash(cx, cy, this.seed + 5) > .3) return null;
    const x = (cx + .25 + .5 * U.hash(cx, cy, this.seed + 6)) * CHUNK;
    const y = (cy + .25 + .5 * U.hash(cx, cy, this.seed + 8)) * CHUNK;
    if (Math.hypot(x, y) < HOME_R + 700) return null;
    return { id: cx + ',' + cy, x, y };
  },

  outpostsNear(x, y, rad) {
    const out = [];
    const c0 = Math.floor((x - rad) / CHUNK), c1 = Math.floor((x + rad) / CHUNK);
    const r0 = Math.floor((y - rad) / CHUNK), r1 = Math.floor((y + rad) / CHUNK);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const o = this.outpostOfChunk(cx, cy);
      if (o && U.dist2(o.x, o.y, x, y) < rad * rad) out.push(o);
    }
    return out;
  },

  nearOutpost(x, y, r) { return this.outpostsNear(x, y, r).length > 0; },

  blocked(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const o = this.tile(tx + i, ty + j).obs;
      if (o && U.dist2(x, y, o.x, o.y) < o.r * o.r) return true;
    }
    return false;
  },

  collide(e) {
    const tx0 = Math.floor((e.x - e.r - 40) / TILE), tx1 = Math.floor((e.x + e.r + 40) / TILE);
    const ty0 = Math.floor((e.y - e.r - 40) / TILE), ty1 = Math.floor((e.y + e.r + 40) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
      const o = this.tile(tx, ty).obs;
      if (!o) continue;
      const dx = e.x - o.x, dy = e.y - o.y, rr = o.r + e.r, d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1; e.x = o.x + dx / d * rr; e.y = o.y + dy / d * rr; }
    }
  },
};
