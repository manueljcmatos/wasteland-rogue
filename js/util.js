'use strict';
// Small math / random helpers shared by every module.
const U = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  dist2: (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: arr => arr[Math.floor(Math.random() * arr.length)],

  // Deterministic hash of an integer grid cell -> [0,1)
  hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  },
  // Smooth value noise
  noise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = U.hash(xi, yi, seed), b = U.hash(xi + 1, yi, seed);
    const c = U.hash(xi, yi + 1, seed), d = U.hash(xi + 1, yi + 1, seed);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  },
  fbm(x, y, seed) {
    let t = 0, amp = 1, f = 1, n = 0;
    for (let i = 0; i < 3; i++) { t += U.noise(x * f, y * f, seed + i * 97) * amp; n += amp; amp *= 0.5; f *= 2; }
    return t / n;
  },
  weighted(items, wf) {
    let sum = 0; for (const it of items) sum += wf(it);
    let r = Math.random() * sum;
    for (const it of items) { r -= wf(it); if (r <= 0) return it; }
    return items[items.length - 1];
  },
  fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return '' + n;
  },
  time(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
};
