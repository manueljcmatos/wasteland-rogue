'use strict';
// Twin-stick touch controls + keyboard/mouse fallback.
// Left half of the screen: floating move stick. Right half: floating aim stick (fires while held).
const STICK_R = 56;
const Input = {
  move: { x: 0, y: 0 }, aim: { x: 0, y: 0, active: false },
  keys: {}, left: null, right: null,
  mouse: { x: 0, y: 0, down: false }, touch: false,

  init(cv) {
    const start = e => {
      e.preventDefault(); Sfx.unlock(); this.touch = true;
      for (const t of e.changedTouches) {
        const s = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        if (t.clientX < innerWidth / 2) { if (!this.left) this.left = s; }
        else if (!this.right) this.right = s;
      }
    };
    const move = e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        for (const s of [this.left, this.right]) {
          if (!s || s.id !== t.identifier) continue;
          s.x = t.clientX; s.y = t.clientY;
          // drag the stick base along if the finger goes too far
          const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
          if (d > STICK_R * 1.3) { s.ox = s.x - dx / d * STICK_R * 1.3; s.oy = s.y - dy / d * STICK_R * 1.3; }
        }
      }
    };
    const end = e => {
      for (const t of e.changedTouches) {
        if (this.left && this.left.id === t.identifier) this.left = null;
        if (this.right && this.right.id === t.identifier) this.right = null;
      }
    };
    cv.addEventListener('touchstart', start, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    cv.addEventListener('touchend', end);
    cv.addEventListener('touchcancel', end);

    cv.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    cv.addEventListener('mousedown', e => { Sfx.unlock(); this.mouse.down = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    addEventListener('mouseup', () => { this.mouse.down = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; this.left = this.right = null; });
    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('textarea,input')) return;
      Sfx.unlock();
      this.keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); UI.act('dash'); }
      if (e.code === 'KeyQ') UI.act('med');
      if (e.code === 'KeyE' && G.atHome) UI.act(UI.open ? 'close' : 'home');
      if (e.code === 'KeyB' || e.code === 'KeyI') UI.act(UI.open ? 'close' : 'bag');
      if (e.code === 'KeyK') UI.act(UI.open ? 'close' : 'skills');
      if (e.code === 'Escape') UI.act(UI.open ? 'close' : 'menu');
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
  },

  update() {
    let mx = 0, my = 0;
    if (this.left) {
      mx = (this.left.x - this.left.ox) / STICK_R; my = (this.left.y - this.left.oy) / STICK_R;
    } else {
      const k = this.keys;
      mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      my = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    }
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if (ml < .12) { mx = 0; my = 0; }
    this.move.x = mx; this.move.y = my;

    this.aim.active = false;
    if (this.right) {
      const ax = this.right.x - this.right.ox, ay = this.right.y - this.right.oy;
      if (Math.hypot(ax, ay) > STICK_R * .3) { this.aim.x = ax; this.aim.y = ay; this.aim.active = true; }
    } else if (this.mouse.down && !this.touch) {
      this.aim.x = this.mouse.x - G.w / 2; this.aim.y = this.mouse.y - G.h / 2; this.aim.active = true;
    }
  },
};
