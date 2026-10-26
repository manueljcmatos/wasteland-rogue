'use strict';
// Detailed item icons (weapons, armor, potions, resources), drawn once per item kind and rarity
// on a 48x48 logical canvas, then reused as <img> in menus and as sprites for loot on the ground.

// armor material changes with rarity: leather -> iron -> steel -> shadow steel -> gold
const MATS = [
  { base: '#8d6e63', dark: '#5d4037', light: '#c8a98f' },
  { base: '#7d8f6c', dark: '#4e5b41', light: '#bccbab' },
  { base: '#7f97a6', dark: '#455a64', light: '#dbe6ec' },
  { base: '#6a55a0', dark: '#3a2d5c', light: '#c5b3ef' },
  { base: '#d4a82a', dark: '#8a6d0b', light: '#fff3b0' },
];
function grad(x, y0, y1, m) {
  const g = x.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, m.light); g.addColorStop(.45, m.base); g.addColorStop(1, m.dark);
  return g;
}
const METAL = { light: '#cfd8dc', base: '#607d8b', dark: '#263238' };
const WOOD = { light: '#d7a86e', base: '#8d6e63', dark: '#4e342e' };
function rivet(x, cx, cy, c = '#eceff1') { x.beginPath(); x.arc(cx, cy, 1.2, 0, 6.283); x.fillStyle = c; x.fill(); }
function sparkle(x, cx, cy, r, c) {
  x.fillStyle = c; x.beginPath();
  x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r);
  x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r); x.fill();
}

const ICON_DRAW = {
  helmet(x, m, acc) {
    x.beginPath(); x.moveTo(9, 29); x.arc(24, 28, 15, Math.PI, 0); x.lineTo(39, 29); x.closePath();
    x.fillStyle = grad(x, 13, 30, m); x.fill(); x.lineWidth = 2; x.strokeStyle = OUT; x.stroke();
    rrect(x, 22, 11, 4, 16, 2, acc, 1.2);                       // crest
    rrect(x, 7, 27, 34, 7, 3, grad(x, 27, 34, { light: m.base, base: m.dark, dark: m.dark }), 1.8); // brim
    rrect(x, 13, 21, 22, 5, 2, '#141414', 1.2);                 // visor slit
    x.fillStyle = acc; x.globalAlpha = .7; x.fillRect(15, 22.5, 18, 1.5); x.globalAlpha = 1;
    for (const rx of [11, 18, 30, 37]) rivet(x, rx, 30.5);
    x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(17, 18, 3, 6, -.6, 0, 6.283); x.fill();
  },
  chest(x, m, acc) {
    poly(x, [[15, 9], [33, 9], [39, 15], [36, 41], [12, 41], [9, 15]], grad(x, 9, 41, m), 2);
    for (const sx of [11, 37]) { x.beginPath(); x.ellipse(sx, 15, 6, 5, 0, 0, 6.283); x.fillStyle = grad(x, 10, 20, m); x.fill(); x.lineWidth = 1.6; x.strokeStyle = OUT; x.stroke(); }
    rrect(x, 19, 7, 10, 5, 2, m.dark, 1.4);                      // collar
    x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(24, 12); x.lineTo(24, 33); x.moveTo(14, 21); x.lineTo(34, 21); x.moveTo(14, 27); x.lineTo(34, 27); x.stroke();
    poly(x, [[24, 15], [28, 19], [24, 23], [20, 19]], acc, 1.2);  // emblem
    rrect(x, 12, 33, 24, 5, 2, m.dark, 1.4);                     // belt
    rrect(x, 21, 32.5, 6, 6, 1.5, acc, 1.2);                     // buckle
    x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.ellipse(16, 18, 2.5, 7, .2, 0, 6.283); x.fill();
  },
  pants(x, m, acc) {
    poly(x, [[13, 11], [24, 11], [23.5, 42], [14, 42]], grad(x, 11, 42, m), 1.8);
    poly(x, [[24, 11], [35, 11], [34, 42], [24.5, 42]], grad(x, 11, 42, m), 1.8);
    rrect(x, 12, 7, 24, 6, 2.5, m.dark, 1.6);                    // belt
    rrect(x, 21, 6.5, 6, 7, 1.5, acc, 1.2);
    for (const kx of [14.5, 25.5]) rrect(x, kx, 24, 8, 7, 2.5, grad(x, 24, 31, { light: m.light, base: m.base, dark: m.dark }), 1.3); // knee pads
    for (const kx of [14, 24.5]) rrect(x, kx, 38, 9.5, 4, 1.5, m.dark, 1.2);  // cuffs
    x.fillStyle = acc; x.globalAlpha = .55; x.fillRect(15, 14, 1.6, 9); x.fillRect(31.4, 14, 1.6, 9); x.globalAlpha = 1;
  },
  boots(x, m, acc) {
    for (const bx of [8, 24]) {
      rrect(x, bx, 9, 10, 22, 3, grad(x, 9, 31, m), 1.8);         // shaft
      poly(x, [[bx, 28], [bx + 10, 28], [bx + 16, 33], [bx + 16, 38], [bx, 38]], grad(x, 28, 38, m), 1.8); // foot
      rrect(x, bx - 1, 37, 18, 4, 2, '#212121', 1.4);              // sole
      rrect(x, bx - .5, 8, 11, 4, 2, acc, 1.2);                    // cuff
      x.strokeStyle = m.light; x.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(bx + 3, 15 + i * 5); x.lineTo(bx + 7, 17 + i * 5); x.stroke(); }
    }
  },

  // weapons are drawn pointing right around (0,0), then rotated by iconFor()
  pistol(x, acc) {
    poly(x, [[-9, 1], [-2, 1], [-5, 13], [-12, 13]], grad(x, 1, 13, WOOD), 1.6);
    rrect(x, -11, -6, 24, 8, 2, grad(x, -6, 2, METAL), 1.8);
    x.beginPath(); x.arc(-2, 4, 3.2, 0, Math.PI); x.lineWidth = 1.5; x.strokeStyle = '#263238'; x.stroke();
    rrect(x, -8, -5, 16, 2.2, 1, acc, 0);
    for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(-9 + i * 2.5, -2.5, 1, 3.5); }
  },
  smg(x, acc) {
    rrect(x, -23, -3, 10, 5, 2, '#37474f', 1.5);
    rrect(x, -1, 4, 5, 11, 1.5, '#263238', 1.5);
    poly(x, [[-9, 3], [-4, 3], [-7, 12], [-12, 12]], '#3e2723', 1.5);
    rrect(x, -14, -5, 27, 9, 2, grad(x, -5, 4, METAL), 1.8);
    rrect(x, 13, -2.5, 9, 4, 1, '#263238', 1.4);
    rrect(x, -11, -4, 18, 2.5, 1, acc, 0);
  },
  shotgun(x, acc) {
    poly(x, [[-14, -4], [-27, 0], [-27, 7], [-14, 4]], grad(x, -4, 7, WOOD), 1.6);
    rrect(x, -15, -5, 12, 9, 2, grad(x, -5, 4, METAL), 1.8);
    rrect(x, -4, -5, 30, 4, 1.5, grad(x, -5, -1, METAL), 1.5);
    rrect(x, -3, -1, 25, 3.5, 1.5, '#37474f', 1.2);
    rrect(x, 4, -2, 11, 6, 2, grad(x, -2, 4, WOOD), 1.4);
    rrect(x, -13, -4, 8, 2, 1, acc, 0);
  },
  rifle(x, acc) {
    poly(x, [[-13, -3], [-28, -1], [-28, 6], [-13, 4]], grad(x, -3, 6, { light: '#8d8d8d', base: '#424242', dark: '#1c1c1c' }), 1.6);
    rrect(x, -3, 3, 5, 8, 1.5, '#263238', 1.4);
    rrect(x, -14, -4, 19, 8, 2, grad(x, -4, 4, METAL), 1.8);
    rrect(x, 5, -2.5, 25, 3.5, 1.2, grad(x, -2.5, 1, METAL), 1.4);
    rrect(x, -10, -11, 17, 5, 2.5, '#263238', 1.4);               // scope
    x.beginPath(); x.arc(7, -8.5, 2.6, 0, 6.283); x.fillStyle = acc; x.fill(); x.lineWidth = 1; x.strokeStyle = OUT; x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(6.2, -9.3, .9, 0, 6.283); x.fill();
    rrect(x, -12, -3, 14, 2, 1, acc, 0);
  },
  minigun(x, acc) {
    x.beginPath(); x.arc(-6, 10, 7, 0, 6.283); x.fillStyle = grad(x, 3, 17, METAL); x.fill(); x.lineWidth = 1.6; x.strokeStyle = OUT; x.stroke();
    for (const o of [-5, -1, 3]) rrect(x, 2, o - 1.3, 23, 3, 1, grad(x, o - 1.3, o + 1.7, METAL), 1.2);
    rrect(x, 14, -7.5, 3.5, 13, 1, '#263238', 1.2);
    rrect(x, -14, -9, 17, 17, 3, grad(x, -9, 8, METAL), 1.8);
    x.beginPath(); x.arc(-5, -9, 5, Math.PI, 0); x.lineWidth = 2.5; x.strokeStyle = '#263238'; x.stroke();
    rrect(x, -12, -2, 13, 2.5, 1, acc, 0);
  },
  launcher(x, acc) {
    const olive = { light: '#b4bd7a', base: '#6b7339', dark: '#3b4020' };
    rrect(x, -4, 5, 4.5, 9, 1.5, '#263238', 1.4);
    rrect(x, -22, -6.5, 42, 13, 5, grad(x, -6.5, 6.5, olive), 1.8);
    rrect(x, 18, -8, 5, 16, 2, '#263238', 1.5);
    rrect(x, -24, -7, 5, 14, 2, '#263238', 1.5);
    rrect(x, -3, -12, 7, 5, 1.5, '#37474f', 1.2);
    poly(x, [[23, -4], [29, 0], [23, 4]], acc, 1.3);
    rrect(x, -14, -6, 20, 2.2, 1, acc, 0);
  },

  potion(x, color) {
    x.globalAlpha = .35; x.beginPath(); x.arc(24, 30, 16, 0, 6.283); x.fillStyle = color; x.fill(); x.globalAlpha = 1;
    rrect(x, 19.5, 9, 9, 11, 2, 'rgba(220,240,255,.55)', 1.5);   // neck
    rrect(x, 18.5, 4.5, 11, 6, 2, grad(x, 4.5, 10.5, WOOD), 1.4); // cork
    x.save(); x.beginPath(); x.arc(24, 31, 13, 0, 6.283); x.clip();
    x.fillStyle = 'rgba(220,240,255,.35)'; x.fillRect(8, 15, 32, 32);
    const g = x.createLinearGradient(0, 24, 0, 44); g.addColorStop(0, color); g.addColorStop(1, '#1a1a2e');
    x.fillStyle = g; x.fillRect(8, 26, 32, 20);
    x.fillStyle = 'rgba(255,255,255,.5)';
    for (const [bx, by, br] of [[19, 34, 1.6], [27, 38, 1.2], [24, 31, 1]]) { x.beginPath(); x.arc(bx, by, br, 0, 6.283); x.fill(); }
    x.restore();
    x.beginPath(); x.arc(24, 31, 13, 0, 6.283); x.lineWidth = 2; x.strokeStyle = OUT; x.stroke();
    x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.ellipse(18.5, 26, 2.5, 5, .5, 0, 6.283); x.fill();
  },

  wood(x) {
    for (const [lx, ly] of [[8, 26], [22, 26], [15, 15]]) {
      rrect(x, lx, ly, 18, 10, 4, grad(x, ly, ly + 10, WOOD), 1.6);
      x.strokeStyle = 'rgba(62,39,35,.45)'; x.lineWidth = 1; x.beginPath(); x.moveTo(lx + 3, ly + 3.5); x.lineTo(lx + 12, ly + 3.5); x.moveTo(lx + 5, ly + 7); x.lineTo(lx + 13, ly + 7); x.stroke();
      x.beginPath(); x.ellipse(lx + 16, ly + 5, 3.5, 5, 0, 0, 6.283); x.fillStyle = '#e6c08e'; x.fill(); x.lineWidth = 1.3; x.strokeStyle = OUT; x.stroke();
      x.beginPath(); x.ellipse(lx + 16, ly + 5, 1.6, 2.5, 0, 0, 6.283); x.strokeStyle = '#a1785a'; x.lineWidth = .9; x.stroke();
    }
  },
  stone(x) {
    poly(x, [[7, 36], [10, 26], [18, 22], [24, 28], [22, 38]], grad(x, 22, 38, { light: '#d6d6d6', base: '#9e9e9e', dark: '#5f5f5f' }), 1.8);
    poly(x, [[18, 22], [24, 12], [34, 10], [41, 19], [39, 33], [25, 36], [24, 28]], grad(x, 10, 36, { light: '#e0e0e0', base: '#a8a8a8', dark: '#616161' }), 1.8);
    poly(x, [[24, 12], [34, 10], [33, 18], [26, 19]], 'rgba(255,255,255,.4)', 0);
    x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 1; x.beginPath(); x.moveTo(33, 18); x.lineTo(37, 27); x.stroke();
  },
  iron(x) {
    const st = { light: '#eef3f6', base: '#90a4ae', dark: '#455a64' };
    poly(x, [[6, 38], [10, 29], [26, 29], [30, 38]], grad(x, 29, 38, st), 1.6);
    poly(x, [[19, 38], [23, 29], [39, 29], [43, 38]], grad(x, 29, 38, st), 1.6);
    poly(x, [[12, 28], [16, 19], [32, 19], [36, 28]], grad(x, 19, 28, st), 1.6);
    x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(17, 21, 9, 1.4); x.fillRect(11, 31, 9, 1.4); x.fillRect(24, 31, 9, 1.4);
  },
  crystal(x) {
    x.globalAlpha = .3; x.beginPath(); x.arc(24, 27, 18, 0, 6.283); x.fillStyle = '#4dd0e1'; x.fill(); x.globalAlpha = 1;
    const cr = (pts, top) => { const g = x.createLinearGradient(0, top, 0, 42); g.addColorStop(0, '#e0f7fa'); g.addColorStop(.5, '#26c6da'); g.addColorStop(1, '#006064'); poly(x, pts, g, 1.6); };
    cr([[10, 40], [9, 27], [14, 20], [18, 28], [17, 40]], 20);
    cr([[31, 40], [30, 26], [35, 18], [39, 27], [38, 40]], 18);
    cr([[17, 42], [16, 18], [24, 6], [32, 18], [31, 42]], 6);
    poly(x, [[24, 6], [32, 18], [24, 22], [16, 18]], 'rgba(255,255,255,.45)', 0);
    x.strokeStyle = 'rgba(0,77,64,.45)'; x.lineWidth = 1; x.beginPath(); x.moveTo(24, 22); x.lineTo(24, 42); x.stroke();
  },
};

const Icons = {
  cache: {},
  // returns a 96x96 canvas (48x48 logical) for an item or a resource id
  canvas(key, draw) {
    if (this.cache[key]) return this.cache[key];
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const x = c.getContext('2d'); x.scale(2, 2); x.lineJoin = x.lineCap = 'round';
    draw(x);
    c.url = null;
    return (this.cache[key] = c);
  },
  of(it) {
    if (it.kind === 'potion') return this.canvas('p' + it.p, x => ICON_DRAW.potion(x, POTIONS[it.p].color));
    const r = it.rarity, acc = RARITIES[r].color, fx = x => {
      if (r >= 3) { // epic / legendary sparkle
        sparkle(x, 8, 9, 3.2, acc); sparkle(x, 41, 40, 2.4, '#ffffff'); if (r >= 4) sparkle(x, 40, 8, 2.8, '#fff59d');
      }
    };
    const fit = { pistol: 1.15, smg: 1, shotgun: .82, rifle: .78, minigun: .95, launcher: .82 }[it.type] || 1;
    if (isWeapon(it)) return this.canvas('w' + it.type + r, x => { x.save(); x.translate(24, 25); x.rotate(-.55); x.scale(fit, fit); ICON_DRAW[it.type](x, acc); x.restore(); fx(x); });
    return this.canvas('a' + it.slot + r, x => { ICON_DRAW[it.slot](x, MATS[r], acc); fx(x); });
  },
  res(id) { return this.canvas('r' + id, x => ICON_DRAW[id](x)); },
  url(c) { return c.url || (c.url = c.toDataURL()); },
};
