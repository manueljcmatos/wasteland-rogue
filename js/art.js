'use strict';
// All visuals. Static shapes (enemies, trees, rocks, ground) are baked once into
// offscreen canvases at startup and blitted every frame, which keeps it fast on phones.

const OUT = 'rgba(22,18,26,.9)'; // outline color

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function ball(x, cx, cy, r, col, lw = 2.5) {
  const g = x.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r);
  g.addColorStop(0, shade(col, .35)); g.addColorStop(.7, col); g.addColorStop(1, shade(col, -.3));
  x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fillStyle = g; x.fill();
  if (lw) { x.lineWidth = lw; x.strokeStyle = OUT; x.stroke(); }
}
function poly(x, pts, fill, lw = 2) {
  x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath();
  x.fillStyle = fill; x.fill();
  if (lw) { x.lineWidth = lw; x.strokeStyle = OUT; x.stroke(); }
}
function rrect(x, rx, ry, w, h, rad, fill, lw = 2) {
  rad = Math.min(rad, w / 2, h / 2);
  x.beginPath();
  x.moveTo(rx + rad, ry); x.arcTo(rx + w, ry, rx + w, ry + h, rad); x.arcTo(rx + w, ry + h, rx, ry + h, rad);
  x.arcTo(rx, ry + h, rx, ry, rad); x.arcTo(rx, ry, rx + w, ry, rad); x.closePath();
  if (fill) { x.fillStyle = fill; x.fill(); }
  if (lw) { x.lineWidth = lw; x.strokeStyle = OUT; x.stroke(); }
}
function eyes(x, r, o = {}) {
  const ex = r * (o.fx ?? .42), ey = r * (o.sp ?? .34), er = r * (o.size ?? .2);
  for (const s of [-1, 1]) {
    x.beginPath(); x.arc(ex, ey * s, er, 0, 6.283); x.fillStyle = o.white || '#fff'; x.fill();
    x.lineWidth = 1.2; x.strokeStyle = OUT; x.stroke();
    x.beginPath(); x.arc(ex + er * .35, ey * s, er * .55, 0, 6.283); x.fillStyle = o.pupil || '#111'; x.fill();
  }
}
function shadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(x + r * .15, y + r * .3, r * 1.05, r * .8, 0, 0, 6.283); ctx.fill();
}

const Art = {
  S: 2, enemy: {}, enemyW: {}, tex: {}, tree: [], pine: [], rock: [], rubble: [],

  bake(size, fn) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * this.S);
    const x = c.getContext('2d');
    x.scale(this.S, this.S); x.translate(size / 2, size / 2);
    x.lineJoin = 'round'; x.lineCap = 'round';
    fn(x); c.size = size;
    return c;
  },
  white(src) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    c.size = src.size; return c;
  },
  blit(ctx, img, x, y, ang = 0, scale = 1) {
    const s = img.size * scale;
    if (ang) { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore(); }
    else ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
  },

  bodies: {}, icons: {},
  bodyFor(cls) { return this.bodyCol((CLASS_BY_ID[cls] || CLASSES[0]).color); },
  bodyCol(col) {
    return this.bodies[col] || (this.bodies[col] = this.bake(48, x => {
      rrect(x, -17, -9, 11, 18, 4, '#6d4c41');
      rrect(x, -15, -6, 6, 12, 2, '#8d6e63', 0);
      x.save(); x.scale(.72, 1.12); ball(x, 0, 0, 15, col); x.restore();
    }));
  },
  // data-URL icons for the inventory grid
  icon(it) {
    const key = it.kind === 'potion' ? 'p' + it.p : isWeapon(it) ? it.type + it.rarity : null;
    if (!key) return null;
    if (this.icons[key]) return this.icons[key];
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const x = c.getContext('2d'); x.scale(2, 2); x.lineJoin = x.lineCap = 'round';
    if (it.kind === 'potion') drawFlask(x, 24, 26, 1.7, POTIONS[it.p].color);
    else { const len = GUNS[it.type].len, sc = Math.min(2.2, 40 / len); x.translate(24, 26); x.rotate(-.6); x.scale(sc, sc); drawGun(x, it.type, RARITIES[it.rarity].color, -len / 2, 0); }
    return (this.icons[key] = c.toDataURL());
  },

  init() {
    for (const k in ENEMY_TYPES) {
      const d = ENEMY_TYPES[k];
      this.enemy[k] = this.bake(d.r * 5, x => this.drawEnemyShape(x, k, d.r, d.color));
      this.enemyW[k] = this.white(this.enemy[k]);
    }
    for (let i = 0; i < 3; i++) {
      this.tree.push(this.bake(76, x => this.treeShape(x, i)));
      this.pine.push(this.bake(76, x => this.pineShape(x, i)));
      this.rock.push(this.bake(70, x => this.rockShape(x, i)));
      this.rubble.push(this.bake(70, x => this.rubbleShape(x, i)));
    }
    for (const b in BIOMES) this.tex[b] = [0, 1, 2, 3].map(v => this.groundTex(b, v));
    this.playerBody = this.bake(48, x => {
      rrect(x, -17, -9, 11, 18, 4, '#6d4c41');              // backpack
      rrect(x, -15, -6, 6, 12, 2, '#8d6e63', 0);
      x.save(); x.scale(.72, 1.12); ball(x, 0, 0, 15, '#1e88e5'); x.restore(); // shoulders
    });
    this.playerHead = this.bake(28, x => {
      ball(x, 0, 0, 10, '#558b2f');                          // helmet
      x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 6, -1.2, 1.2); x.stroke();
    });
  },

  // ---------- enemies (all face +x) ----------
  drawEnemyShape(x, type, r, col) {
    const dark = shade(col, -.35);
    switch (type) {
      case 'grunt':
        for (const s of [-1, 1]) ball(x, -r * .05, s * r * .88, r * .42, shade(col, -.15));
        poly(x, [[r * .3, r * .78], [r * 1.25, r * .72], [r * .3, r * 1.02]], '#cfd8dc', 1.5);
        ball(x, 0, 0, r, col);
        x.beginPath(); x.arc(0, 0, r * .84, Math.PI * .62, Math.PI * 1.38); x.lineWidth = r * .3; x.strokeStyle = '#4e1a1a'; x.stroke();
        eyes(x, r);
        break;
      case 'runner':
        for (let i = 0; i < 3; i++) poly(x, [[-r * (.4 + i * .35), -r * .3], [-r * (.75 + i * .35), 0], [-r * (.4 + i * .35), r * .3], [-r * (.2 + i * .35) - r * .5, 0]], dark, 1.5);
        for (const s of [-1, 1]) poly(x, [[r * .35, s * r * .45], [-r * .1, s * r * 1.05], [r * .05, s * r * .3]], dark, 1.5);
        x.save(); x.scale(1.3, .85); ball(x, 0, 0, r, col); x.restore();
        eyes(x, r, { fx: .75, sp: .3, size: .18, white: '#fff59d' });
        break;
      case 'spitter':
        for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + .4; ball(x, Math.cos(a) * r * .85, Math.sin(a) * r * .85, r * .32, shade(col, .15), 1.5); }
        ball(x, 0, 0, r, col);
        ball(x, r * .55, 0, r * .32, '#1b5e20', 1.5); ball(x, r * .58, 0, r * .16, '#b2ff59', 0);
        eyes(x, r, { fx: .02, sp: .38 });
        break;
      case 'brute':
        for (const s of [-1, 1]) {
          poly(x, [[-r * .45, s * r * .7], [-r * .2, s * r * 1.35], [r * .1, s * r * .75]], '#d7ccc8', 2);
          ball(x, r * .65, s * r * .8, r * .38, shade(col, -.1));
        }
        ball(x, 0, 0, r, col);
        ball(x, -r * .1, 0, r * .55, shade(col, -.12), 0);
        eyes(x, r, { white: '#ff5252', pupil: '#300', size: .15, fx: .55 });
        break;
      case 'bomber':
        x.beginPath(); x.moveTo(-r * 1.25, 0); x.quadraticCurveTo(-r * 1.6, -r * .4, -r * 1.55, -r * .7); x.lineWidth = 2; x.strokeStyle = '#8d6e63'; x.stroke();
        ball(x, -r * .78, 0, r * .58, '#37474f');
        ball(x, 0, 0, r, col);
        eyes(x, r, { size: .24, pupil: '#000' });
        break;
      case 'sniper':
        rrect(x, r * .1, r * .22, r * 2.3, r * .26, 2, '#263238', 1.5);
        rrect(x, r * .8, r * .02, r * .7, r * .2, 2, '#455a64', 1.2);
        ball(x, -r * .05, 0, r, col);
        ball(x, -r * .25, 0, r * .72, shade(col, -.4), 0);
        for (const [hx, hy] of [[r * .65, r * .38], [r * 1.25, r * .36]]) ball(x, hx, hy, r * .2, '#ffcc80', 1.2);
        ball(x, r * .55, -r * .2, r * .16, '#ff1744', 1);
        break;
      case 'juggernaut':
        for (const s of [-1, 1]) ball(x, -r * .05, s * r * .82, r * .46, '#78909c');
        ball(x, 0, 0, r, col);
        rrect(x, -r * .1, -r * .66, r * .78, r * 1.32, r * .2, '#90a4ae', 2);
        for (const [rx, ry] of [[r * .05, -r * .5], [r * .05, r * .5], [r * .5, -r * .5], [r * .5, r * .5]]) { x.beginPath(); x.arc(rx, ry, r * .06, 0, 6.283); x.fillStyle = '#37474f'; x.fill(); }
        rrect(x, r * .55, -r * .38, r * .18, r * .76, 3, '#ff9800', 1.5);
        break;
      case 'charger':
        for (const s of [-1, 1]) poly(x, [[r * .35, s * r * .35], [r * 1.55, s * r * .95], [r * .5, s * r * .8]], '#eceff1', 2);
        ball(x, 0, 0, r, col);
        ball(x, -r * .2, 0, r * .55, shade(col, -.15), 0);
        eyes(x, r, { fx: .38, sp: .42, white: '#ffeb3b', pupil: '#b71c1c' });
        for (const s of [-1, 1]) { x.beginPath(); x.arc(r * .85, s * r * .14, r * .07, 0, 6.283); x.fillStyle = '#004d40'; x.fill(); }
        break;
      case 'overlord':
      case 'boss':
        for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, c = Math.cos(a), s = Math.sin(a); poly(x, [[c * r * .9 - s * r * .2, s * r * .9 + c * r * .2], [c * r * 1.3, s * r * 1.3], [c * r * .9 + s * r * .2, s * r * .9 - c * r * .2]], '#424242', 1.5); }
        for (const s of [-1, 1]) rrect(x, r * .2, s * r * .62 - r * .13, r * 1.15, r * .26, 3, '#37474f', 2);
        ball(x, 0, 0, r, col);
        x.beginPath(); x.arc(0, 0, r * .7, 0, 6.283); x.lineWidth = r * .12; x.strokeStyle = shade(col, -.4); x.stroke();
        eyes(x, r, { white: '#ffeb3b', pupil: '#b71c1c', size: .17, fx: .5 });
        break;
      default:
        ball(x, 0, 0, r, col); eyes(x, r);
    }
  },

  // ---------- scenery ----------
  treeShape(x, v) {
    const R = 28, rnd = i => U.hash(i, v, 77);
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + v; ball(x, Math.cos(a) * R * .48, Math.sin(a) * R * .48, R * (.42 + rnd(i) * .1), '#2e5d2f', 2.5); }
    ball(x, 0, 0, R * .62, '#3b7a3c', 0);
    for (let i = 0; i < 4; i++) ball(x, -R * .2 + (rnd(i + 9) - .5) * R * .4, -R * .22 + (rnd(i + 19) - .5) * R * .4, R * .2, '#55a053', 0);
  },
  pineShape(x, v) {
    const R = 28;
    const star = (rad, col, rot) => {
      const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283 + rot, rr = i % 2 ? rad * .6 : rad; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      poly(x, pts, col, 2);
    };
    star(R, '#1b4d3e', v); star(R * .72, '#24634f', v + .2); star(R * .45, '#2e7d62', v + .4);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + v; x.beginPath(); x.arc(Math.cos(a) * R * .8, Math.sin(a) * R * .8, 2.5, 0, 6.283); x.fillStyle = '#f5f9fc'; x.fill(); }
    x.beginPath(); x.arc(0, 0, 3, 0, 6.283); x.fillStyle = '#f5f9fc'; x.fill();
  },
  rockShape(x, v) {
    const R = 28, pts = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283, rr = R * (.78 + U.hash(i, v, 5) * .22); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    poly(x, pts, '#77736f', 2.5);
    poly(x, pts.slice(3, 7).map(([a, b]) => [a * .55 - 4, b * .55 - 4]).concat([[0, 0]]), '#918c86', 0);
    x.strokeStyle = 'rgba(30,25,25,.5)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(R * .1, R * .1); x.lineTo(R * .45, R * .25); x.lineTo(R * .5, R * .5); x.stroke();
  },
  rubbleShape(x, v) {
    const R = 28;
    poly(x, [[-R, -R * .55], [-R * .3, -R * .7], [R * .2, -R * .45], [R * .9, -R * .6], [R, R * .5], [R * .2, R * .65], [-R * .6, R * .45], [-R, R * .6]], '#5f6369', 2.5);
    x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 1.5;
    for (let row = -1; row <= 1; row++) {
      x.beginPath(); x.moveTo(-R * .9, row * R * .35); x.lineTo(R * .9, row * R * .35); x.stroke();
      for (let c = -2; c <= 2; c++) { const bx = c * R * .4 + (row & 1) * R * .2; x.beginPath(); x.moveTo(bx, row * R * .35); x.lineTo(bx, row * R * .35 + R * .35); x.stroke(); }
    }
    rrect(x, -R * .9, -R * .52, R * 1.8, R * .3, 3, 'rgba(255,255,255,.08)', 0);
    for (let i = 0; i < 3; i++) rrect(x, (U.hash(i, v, 3) - .5) * R * 1.6, R * .6 + i * 2, 6, 6, 1, '#4a4d52', 1);
  },

  groundTex(b, v) {
    const B = BIOMES[b], base = `rgb(${B.c})`, S = TILE;
    const c = document.createElement('canvas'); c.width = c.height = S * this.S;
    const x = c.getContext('2d'); x.scale(this.S, this.S);
    let seed = v * 1000 + b.length * 31;
    const rnd = () => U.hash(seed++, v, 991);
    const col = f => shade('#' + B.c.map(n => n.toString(16).padStart(2, '0')).join(''), f);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    x.fillStyle = col((rnd() - .5) * .04); x.fillRect(0, 0, S, S);
    const px = () => 4 + rnd() * (S - 8);
    if (b === 'grass' || b === 'forest' || b === 'swamp') {
      for (let i = 0; i < 16; i++) {
        const gx = px(), gy = px();
        x.strokeStyle = rnd() < .5 ? col(.15) : col(-.18); x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx - 1.5, gy - 4); x.moveTo(gx, gy); x.lineTo(gx + 1.5, gy - 4.5); x.stroke();
      }
      if (b === 'grass' && v === 3) for (let i = 0; i < 4; i++) { x.fillStyle = ['#fff59d', '#f8bbd0', '#ffffff'][i % 3]; x.beginPath(); x.arc(px(), px(), 1.8, 0, 6.283); x.fill(); }
      if (b === 'forest') for (let i = 0; i < 6; i++) { x.fillStyle = col(-.25); x.beginPath(); x.ellipse(px(), px(), 2.5, 1.5, rnd() * 3, 0, 6.283); x.fill(); }
      if (b === 'swamp' && v % 2 === 0) { x.fillStyle = 'rgba(30,70,80,.45)'; x.beginPath(); x.ellipse(20 + rnd() * 24, 20 + rnd() * 24, 12, 7, rnd() * 3, 0, 6.283); x.fill(); }
    } else if (b === 'desert') {
      x.strokeStyle = col(.12); x.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { const yy = 8 + i * 15 + rnd() * 5; x.beginPath(); x.moveTo(4, yy); x.quadraticCurveTo(32, yy - 6, 60, yy); x.stroke(); }
      for (let i = 0; i < 3; i++) { x.fillStyle = col(-.25); x.beginPath(); x.arc(px(), px(), 1.5, 0, 6.283); x.fill(); }
    } else if (b === 'waste') {
      x.strokeStyle = col(-.3); x.lineWidth = 1.2;
      let cx = px(), cy = px(); x.beginPath(); x.moveTo(cx, cy);
      for (let i = 0; i < 4; i++) { cx = U.clamp(cx + (rnd() - .5) * 26, 2, 62); cy = U.clamp(cy + (rnd() - .5) * 26, 2, 62); x.lineTo(cx, cy); }
      x.stroke();
      for (let i = 0; i < 5; i++) { x.fillStyle = rnd() < .5 ? col(-.2) : col(.12); x.beginPath(); x.arc(px(), px(), 1.2 + rnd() * 1.3, 0, 6.283); x.fill(); }
    } else if (b === 'snow') {
      for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(150,170,200,.25)'; x.beginPath(); x.ellipse(px(), px(), 6 + rnd() * 6, 2.5, 0, 0, 6.283); x.fill(); }
      for (let i = 0; i < 6; i++) { x.fillStyle = '#ffffff'; x.fillRect(px(), px(), 1.5, 1.5); }
    } else if (b === 'ruins') {
      const s = 16;
      for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
        if (rnd() < .12) continue;
        rrect(x, gx * s + 1 + (gy & 1) * 3, gy * s + 1, s - 2.5, s - 2.5, 3, rnd() < .5 ? col(.06) : col(-.06), 0);
      }
    }
    c.size = S;
    return c;
  },
};

// ---------- per-frame drawing ----------
function drawGround(ctx, tx0, tx1, ty0, ty1) {
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
    const t = World.tile(tx, ty);
    ctx.drawImage(Art.tex[t.b][t.v], tx * TILE, ty * TILE, TILE + .6, TILE + .6);
  }
}

function drawObstacle(ctx, o) {
  const sc = o.r / 28, v = Math.floor(o.rot) % 3;
  shadow(ctx, o.x + 3, o.y + 3, o.r * .95);
  if (o.kind === 'tree') Art.blit(ctx, Art.tree[v], o.x, o.y, 0, sc);
  else if (o.kind === 'pine') Art.blit(ctx, Art.pine[v], o.x, o.y, 0, sc);
  else if (o.kind === 'rock') Art.blit(ctx, Art.rock[v], o.x, o.y, o.rot, sc);
  else Art.blit(ctx, Art.rubble[v], o.x, o.y, o.rot, sc);
}

function drawDecals(ctx) {
  for (const d of G.decals) {
    ctx.globalAlpha = Math.min(.55, d.life / 6);
    ctx.fillStyle = d.color;
    for (let i = 0; i < 5; i++) {
      const a = d.rot + i * 1.3, rr = d.r * (i ? .35 : .7), off = i ? d.r * .75 : 0;
      ctx.beginPath(); ctx.arc(d.x + Math.cos(a) * off, d.y + Math.sin(a) * off, rr, 0, 6.283); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function logsRing(ctx, R, gaps, col, stone) {
  for (let i = 0; i < 4; i++) {
    const a0 = i * Math.PI / 2 + gaps, a1 = a0 + Math.PI / 2 - gaps * 2;
    const n = Math.floor((a1 - a0) * R / 13);
    for (let j = 0; j <= n; j++) {
      const a = a0 + (a1 - a0) * j / n, x = Math.cos(a) * R, y = Math.sin(a) * R;
      if (stone) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); rrect(ctx, -7, -7, 14, 14, 3, j % 2 ? stone : shade(stone, -.1), 1.5); ctx.restore(); }
      else ball(ctx, x, y, 7.5, col, 1.5);
    }
  }
}

function drawHome(ctx) {
  const B = G.save.buildings, total = Object.values(B).reduce((a, b) => a + b, 0);
  const g = ctx.createRadialGradient(0, 0, 40, 0, 0, HOME_R);
  g.addColorStop(0, 'rgba(150,130,100,.85)'); g.addColorStop(1, 'rgba(110,95,72,.75)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, HOME_R, 0, 6.283); ctx.fill();
  // dirt paths to the gates
  ctx.fillStyle = 'rgba(175,155,120,.6)';
  ctx.fillRect(-22, -HOME_R, 44, HOME_R * 2); ctx.fillRect(-HOME_R, -22, HOME_R * 2, 44);
  // plaza stones
  for (let i = 0; i < 22; i++) { const a = i / 22 * 6.283; ctx.save(); ctx.translate(Math.cos(a) * 70, Math.sin(a) * 70); ctx.rotate(a); rrect(ctx, -9, -6, 18, 12, 3, i % 2 ? '#9e9583' : '#8d846f', 1); ctx.restore(); }
  // walls: wood → stone → reinforced
  const stone = total > 30 ? '#607d8b' : total > 10 ? '#9e9e9e' : null;
  logsRing(ctx, HOME_R, .22, '#7b5537', stone);
  // gate posts with torches
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const a = i * Math.PI / 2 + s * .2, x = Math.cos(a) * HOME_R, y = Math.sin(a) * HOME_R;
    ball(ctx, x, y, 11, stone || '#5d4037', 2);
    const f = 1 + .2 * Math.sin(G.t * 13 + i * 3 + s);
    const tg = ctx.createRadialGradient(x, y, 0, x, y, 40 * f); tg.addColorStop(0, 'rgba(255,170,60,.35)'); tg.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(x, y, 40 * f, 0, 6.283); ctx.fill();
    ball(ctx, x, y, 4.5 * f, '#ffb74d', 0);
  }
  // campfire with glow
  const f = 1 + .12 * Math.sin(G.t * 12) + .06 * Math.sin(G.t * 31);
  const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, 130 * f); fg.addColorStop(0, 'rgba(255,160,60,.35)'); fg.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, 130 * f, 0, 6.283); ctx.fill();
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; ball(ctx, Math.cos(a) * 18, Math.sin(a) * 18, 5, '#8a8a8a', 1.2); }
  for (const r of [.6, -.6]) { ctx.save(); ctx.rotate(r); rrect(ctx, -14, -3.5, 28, 7, 3, '#6d4c41', 1.5); ctx.restore(); }
  ball(ctx, 0, 0, 10 * f, '#ff7043', 0); ball(ctx, 0, -1, 6.5 * f, '#ffa726', 0); ball(ctx, 0, -2, 3.5 * f, '#fff59d', 0);
  for (const b of BUILDINGS) drawBuilding(ctx, b, B[b.id]);
}

const ROOF = { market: '#e53935', vault: '#78909c', clinic: '#eceff1', armory: '#33691e', workshop: '#e65100', turrets: '#455a64', radar: '#5c6bc0' };
function drawBuilding(ctx, b, l) {
  const [x, y] = BUILD_POS[b.id], s = 54 + Math.min(l, 10) * 4, h = s / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (l === 0) {
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.strokeRect(x - h, y - h, s, s); ctx.setLineDash([]);
    for (let i = 0; i < 3; i++) rrect(ctx, x - h + 8, y - 10 + i * 8, s * .5, 5, 1, '#a1887f', 1);
    ctx.globalAlpha = .45; ctx.font = '20px system-ui'; ctx.fillText(b.icon, x + h * .45, y - h * .4); ctx.globalAlpha = 1;
  } else if (b.id === 'garden') {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - h + 5, y - h + 7, s, s);
    rrect(ctx, x - h, y - h, s, s, 5, '#6d4c2f', 2);
    const rows = 2 + Math.min(l, 6);
    for (let i = 0; i < rows; i++) {
      const ry = y - h + 6 + (s - 12) * (i + .5) / rows;
      for (let j = 0; j < 5; j++) ball(ctx, x - h + 8 + (s - 16) * j / 4, ry, 3.5 + Math.sin(G.t * 2 + i + j) * .4, i % 2 ? '#7cb342' : '#c0ca33', 0);
    }
  } else {
    const roof = ROOF[b.id] || '#8d6e63';
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - h + 6, y - h + 8, s, s);
    rrect(ctx, x - h, y - h, s, s, 5, l >= 6 ? '#b0bec5' : '#a1887f', 2.5);
    const rg = ctx.createLinearGradient(0, y - h, 0, y + h);
    rg.addColorStop(0, shade(roof, .25)); rg.addColorStop(1, shade(roof, -.2));
    rrect(ctx, x - h + 4, y - h + 4, s - 8, s - 16, 4, rg, 1.5);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - h + 6, y - 6); ctx.lineTo(x + h - 6, y - 6); ctx.stroke();
    if (b.id === 'market') for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(x - h + 6 + i * (s - 12) / 5, y + h - 14, (s - 12) / 10, 6); }
    if (b.id === 'clinic') { ctx.fillStyle = '#e53935'; ctx.fillRect(x - 4, y - 18, 8, 22); ctx.fillRect(x - 11, y - 11, 22, 8); }
    if (b.id === 'radar') {
      ctx.save(); ctx.translate(x, y - 6); ctx.rotate(G.t * 1.5);
      ctx.beginPath(); ctx.arc(0, 0, 12, -1.2, 1.2); ctx.lineWidth = 4; ctx.strokeStyle = '#e8eaf6'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    rrect(ctx, x - 6, y + h - 12, 12, 12, 2, '#4e342e', 1.5);
    if (b.id !== 'clinic' && b.id !== 'radar') { ctx.font = `${18 + Math.min(l, 10)}px system-ui`; ctx.fillText(b.icon, x, y - 8); }
  }
  // level badge + name plate
  if (l) { ball(ctx, x + h - 2, y - h + 2, 9, '#ffca28', 2); ctx.font = '800 10px system-ui'; ctx.fillStyle = '#3e2723'; ctx.fillText(l, x + h - 2, y - h + 2.5); }
  ctx.font = '700 11px system-ui';
  const bn = t(b.name), tw = ctx.measureText(bn).width + 10;
  rrect(ctx, x - tw / 2, y + h + 4, tw, 15, 7, 'rgba(0,0,0,.55)', 0);
  ctx.fillStyle = '#fff'; ctx.fillText(bn, x, y + h + 12);
}

function drawOutpost(ctx, o) {
  const cleared = G.save.run.cleared.includes(o.id);
  ctx.fillStyle = cleared ? 'rgba(70,90,60,.3)' : 'rgba(90,40,30,.32)';
  ctx.beginPath(); ctx.arc(o.x, o.y, 200, 0, 6.283); ctx.fill();
  ctx.save(); ctx.translate(o.x, o.y);
  // palisade with 3 openings
  for (let i = 0; i < 46; i++) {
    if (i % 15 < 3) continue;
    const a = i / 46 * 6.283; ball(ctx, Math.cos(a) * 190, Math.sin(a) * 190, 7.5, cleared ? '#6d6a5a' : '#6d4c41', 1.5);
  }
  // tents
  for (const [tx, ty, s] of [[-70, -40, 1], [60, 55, .85], [-40, 80, .75]]) {
    const w = 46 * s, c = cleared ? '#78909c' : '#8e2430';
    poly(ctx, [[tx - w, ty + w * .6], [tx, ty - w * .5], [tx, ty + w * .6]], shade(c, .15), 2);
    poly(ctx, [[tx, ty - w * .5], [tx + w, ty + w * .6], [tx, ty + w * .6]], shade(c, -.2), 2);
  }
  // crates
  for (const [cx, cy] of [[90, -60], [105, -38], [-110, 30]]) {
    rrect(ctx, cx - 10, cy - 10, 20, 20, 2, '#a1764a', 1.5);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy + 8); ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx - 8, cy + 8); ctx.stroke();
  }
  // flag
  ctx.fillStyle = '#ddd'; ctx.fillRect(60, -70, 4, 64);
  const fl = cleared ? '#66bb6a' : '#d32f2f', pts = [];
  for (let i = 0; i <= 6; i++) pts.push([64 + i * 5, -70 + Math.sin(G.t * 6 - i * .8) * 2.5]);
  for (let i = 6; i >= 0; i--) pts.push([64 + i * 5, -52 + Math.sin(G.t * 6 - i * .8) * 2.5]);
  poly(ctx, pts, fl, 1.5);
  ctx.restore();
}

function drawEnemy(ctx, e) {
  const p = G.p, k = e.type;
  const face = (e.windT > 0 || e.chargeT > 0) ? Math.atan2(e.cdy, e.cdx) : Math.atan2(p.y - e.y, p.x - e.x);
  const sc = e.r / e.def.r;
  shadow(ctx, e.x, e.y, e.r);
  if (e.elite) { ctx.globalAlpha = .45 + .25 * Math.sin(G.t * 6); ball(ctx, e.x, e.y, e.r + 6, '#ffd54f', 0); ctx.globalAlpha = 1; }
  if (e.boss) { ctx.globalAlpha = .35; ball(ctx, e.x, e.y, e.r + 8 + Math.sin(G.t * 5) * 3, '#ff2f6b', 0); ctx.globalAlpha = 1; }
  // walking feet
  if (k !== 'spitter') {
    const c = Math.cos(face), s = Math.sin(face), sw = Math.sin(e.walk || 0) * e.r * .35;
    for (const side of [-1, 1]) {
      const fx = e.x - s * side * e.r * .55 + c * sw * side, fy = e.y + c * side * e.r * .55 + s * sw * side;
      ctx.fillStyle = shade(e.def.color, -.55); ctx.beginPath(); ctx.arc(fx, fy, e.r * .28, 0, 6.283); ctx.fill();
    }
  }
  const squash = 1 + Math.sin((e.walk || 0) * 2) * .03;
  Art.blit(ctx, Art.enemy[k], e.x, e.y, face, sc * squash);
  if (e.hitT > 0 || e.windT > 0 && Math.sin(G.t * 40) > 0) { ctx.globalAlpha = e.hitT > 0 ? .8 : .5; Art.blit(ctx, Art.enemyW[k], e.x, e.y, face, sc * squash); ctx.globalAlpha = 1; }
  if (k === 'bomber') {
    const fx = e.x - Math.cos(face) * e.r * 1.55 + Math.sin(face) * e.r * .7, fy = e.y - Math.sin(face) * e.r * 1.55 - Math.cos(face) * e.r * .7;
    ball(ctx, fx, fy, 3 + Math.random() * 2.5, Math.random() < .5 ? '#ffeb3b' : '#ff9800', 0);
  }
  if (e.boss) { ctx.font = `${e.r}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('👑', e.x, e.y - e.r - 12); }
  if (e.hp < e.maxHp) {
    const w = e.boss ? 80 : e.r * 2, yy = e.y - e.r - (e.boss ? 32 : 12);
    rrect(ctx, e.x - w / 2 - 1, yy - 1, w + 2, 7, 3, 'rgba(0,0,0,.7)', 0);
    rrect(ctx, e.x - w / 2, yy, Math.max(2, w * Math.max(0, e.hp / e.maxHp)), 5, 2.5, e.boss ? '#ff2f6b' : e.elite ? '#ffca28' : '#ef5350', 0);
  }
}

const GUNS = {
  pistol:   { len: 16, w: 5 },
  smg:      { len: 22, w: 6, mag: 1 },
  shotgun:  { len: 27, w: 7, pump: 1 },
  rifle:    { len: 34, w: 5, scope: 1 },
  minigun:  { len: 28, w: 10, barrels: 1 },
  launcher: { len: 30, w: 10, tube: 1 },
};
function drawGun(ctx, type, accent, x0, y) {
  const g = GUNS[type];
  if (g.mag) rrect(ctx, x0 + 8, y + g.w / 2 - 1, 5, 7, 1, '#37474f', 1.2);
  if (g.tube) { rrect(ctx, x0, y - g.w / 2, g.len, g.w, 4, '#4e5b31', 1.8); rrect(ctx, x0 + g.len - 5, y - g.w / 2 - 1, 6, g.w + 2, 2, '#37474f', 1.5); }
  else rrect(ctx, x0, y - g.w / 2, g.len, g.w, 2, '#263238', 1.8);
  rrect(ctx, x0 + 3, y - g.w / 2 + 1.2, g.len * .4, Math.max(2, g.w - 2.4), 1, accent, 0);
  if (g.scope) rrect(ctx, x0 + 9, y - g.w / 2 - 3.5, 12, 4, 1.5, '#455a64', 1.2);
  if (g.pump) rrect(ctx, x0 + g.len * .55, y - g.w / 2 - 1, 9, g.w + 2, 2, '#5d4037', 1.2);
  if (g.barrels) { ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 1.5; for (const o of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(x0 + g.len - 9, y + o); ctx.lineTo(x0 + g.len + 3, y + o); ctx.stroke(); } }
  return g.len;
}

function drawPlayer(ctx) {
  const p = G.p, w = G.save.equipped, accent = RARITIES[w.rarity].color;
  shadow(ctx, p.x, p.y, p.r);
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
  // feet
  const moving = Input.move.x || Input.move.y, sw = moving ? Math.sin(G.t * 14) * 6 : 0;
  for (const s of [-1, 1]) { ctx.fillStyle = '#263238'; ctx.beginPath(); ctx.ellipse(sw * s, s * 8, 6, 4.5, 0, 0, 6.283); ctx.fill(); }
  Art.blit(ctx, Art.bodyFor(G.save.cls), 0, 0);
  const x0 = 4 - G.recoil, gy = 5;
  const len = drawGun(ctx, w.type, accent, x0, gy);
  ball(ctx, x0 + 3, gy + 2, 3.8, '#ffcc80', 1.2);
  ball(ctx, x0 + len * .6, gy + 1, 3.8, '#ffcc80', 1.2);
  if (G.flashT > 0) {
    const fx = x0 + len + 5, pts = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283, rr = i % 2 ? 3 : 9; pts.push([fx + Math.cos(a) * rr * 1.3, gy + Math.sin(a) * rr]); }
    poly(ctx, pts, '#fff59d', 0); ball(ctx, fx, gy, 3, '#ffffff', 0);
  }
  Art.blit(ctx, Art.playerHead, 1, 0);
  const hel = G.save.gear.helmet;
  if (hel) { ctx.beginPath(); ctx.arc(1, 0, 10, 0, 6.283); ctx.lineWidth = 2.5; ctx.strokeStyle = RARITIES[hel.rarity].color; ctx.stroke(); }
  ctx.restore();
  if (p.inv > 0 && Math.sin(G.t * 50) > 0) { ctx.globalAlpha = .5; ball(ctx, p.x, p.y, p.r + 2, '#ffffff', 0); ctx.globalAlpha = 1; }
}

function drawPickup(ctx, k) {
  const bob = Math.sin(G.t * 6 + k.x) * 2, x = k.x, y = k.y + bob;
  if (k.kind === 'gold') {
    const sx = Math.max(.15, Math.abs(Math.cos(G.t * 5 + k.x)));
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
    ball(ctx, 0, 0, 6.5, '#ffb300', 1.5); ball(ctx, 0, 0, 4, '#ffd54f', 0);
    ctx.restore();
    if (sx > .9) ball(ctx, x - 2, y - 2.5, 1.5, '#ffffff', 0);
  } else if (k.kind === 'scrap') {
    const pts = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283 + G.t, rr = i % 2 ? 6 : 8.5; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    poly(ctx, pts, '#90a4ae', 1.5); ball(ctx, x, y, 3, '#455a64', 0);
  } else if (k.kind === 'potion') {
    drawFlask(ctx, x, y, 1, POTIONS[k.v].color);
  } else if (k.kind === 'weapon' && !isWeapon(k.item)) {
    const c = RARITIES[k.item.rarity].color;
    ctx.globalAlpha = .3 + .15 * Math.sin(G.t * 4); ball(ctx, x, y, 22, c, 0); ctx.globalAlpha = 1;
    rrect(ctx, x - 14, y - 14, 28, 28, 7, 'rgba(20,22,26,.75)', 2);
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ARMOR_SLOTS[k.item.slot].icon, x, y + 1);
  } else if (k.kind === 'weapon') {
    const c = RARITIES[k.item.rarity].color;
    if (k.item.rarity >= 2) {
      const bg = ctx.createLinearGradient(0, y - 90, 0, y);
      bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(1, c);
      ctx.globalAlpha = .35 + .15 * Math.sin(G.t * 4); ctx.fillStyle = bg; ctx.fillRect(x - 7, y - 90, 14, 90); ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = .3 + .15 * Math.sin(G.t * 4); ball(ctx, x, y, 22, c, 0); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-.45);
    const len = GUNS[k.item.type].len; drawGun(ctx, k.item.type, c, -len / 2, 0);
    ctx.restore();
  }
}

function drawTurret(ctx, t) {
  shadow(ctx, t.x, t.y, 15);
  rrect(ctx, t.x - 15, t.y - 15, 30, 30, 5, '#546e7a', 2);
  for (const [bx, by] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) ball(ctx, t.x + bx, t.y + by, 2, '#263238', 0);
  ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
  for (const o of [-4, 4]) rrect(ctx, 4, o - 2.5, 20, 5, 1.5, '#37474f', 1.2);
  ball(ctx, 0, 0, 10, '#78909c', 2); ball(ctx, 3, 0, 3, '#80deea', 0);
  ctx.restore();
}

function drawBullets(ctx) {
  ctx.lineCap = 'round';
  for (const b of G.bullets) {
    const tx = b.x - b.vx * .022, ty = b.y - b.vy * .022;
    ctx.globalAlpha = .3; ctx.strokeStyle = b.color; ctx.lineWidth = b.r * 3;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = b.crit ? '#fff' : shade(b.color.length === 7 ? b.color : '#ffffff', .5); ctx.lineWidth = b.r * 1.1;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
  }
  for (const b of G.ebullets) {
    const c = b.sniper ? '#82b1ff' : '#b2ff59';
    ctx.globalAlpha = .35; ball(ctx, b.x, b.y, b.r + 4, c, 0); ctx.globalAlpha = 1;
    ball(ctx, b.x, b.y, b.r, c, 1.5); ball(ctx, b.x - 1, b.y - 1, b.r * .4, '#ffffff', 0);
  }
}

function drawFlask(ctx, x, y, s, col) {
  rrect(ctx, x - 3.5 * s, y - 12 * s, 7 * s, 7 * s, 1.5 * s, '#cfd8dc', 1.5);
  rrect(ctx, x - 3 * s, y - 14.5 * s, 6 * s, 3.5 * s, 1 * s, '#8d6e63', 1.2);
  ball(ctx, x, y + 1 * s, 9 * s, col, 2);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - 3 * s, y - 2 * s, 2 * s, 3.5 * s, -.5, 0, 6.283); ctx.fill();
}

function drawBolts(ctx) {
  for (const b of G.bolts) {
    ctx.globalAlpha = Math.min(1, b.life * 5);
    for (const [w, c] of [[7, 'rgba(120,180,255,.5)'], [2.5, '#e3f2fd']]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
      for (let i = 0; i < b.pts.length - 1; i++) {
        const [x0, y0] = b.pts[i], [x1, y1] = b.pts[i + 1];
        ctx.moveTo(x0, y0);
        for (let j = 1; j < 6; j++) { const t = j / 6; ctx.lineTo(x0 + (x1 - x0) * t + U.rand(-10, 10), y0 + (y1 - y0) * t + U.rand(-10, 10)); }
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawNpc(ctx, n) {
  const p = G.p, near = G.npc === n;
  const face = near ? Math.atan2(p.y - n.y, p.x - n.x) : Math.PI / 2 + Math.sin(G.t * .7 + n.x) * .6;
  const bob = Math.sin(G.t * 2.5 + n.x) * 1.2;
  shadow(ctx, n.x, n.y, 16);
  ctx.save(); ctx.translate(n.x, n.y + bob); ctx.rotate(face);
  Art.blit(ctx, Art.bodyCol(n.col), 0, 0);
  ball(ctx, 1, 0, 10, n.hat);
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 11px system-ui';
  const tw = ctx.measureText(n.name).width + 10;
  rrect(ctx, n.x - tw / 2, n.y + 22, tw, 15, 7, near ? 'rgba(255,202,40,.85)' : 'rgba(0,0,0,.6)', 0);
  ctx.fillStyle = near ? '#3e2723' : '#fff'; ctx.fillText(n.name, n.x, n.y + 30);
  // marker above the head
  let mark = n.icon, col = null;
  if (n.id === 'quest' && Quests.readyCount()) { mark = '!'; col = '#ffd600'; }
  const my = n.y - 34 + Math.sin(G.t * 4) * 3;
  if (col) { ball(ctx, n.x, my, 11, col, 2); ctx.font = '900 16px system-ui'; ctx.fillStyle = '#3e2723'; ctx.fillText(mark, n.x, my + 1); }
  else { ctx.font = '16px system-ui'; ctx.fillText(mark, n.x, my); }
}
