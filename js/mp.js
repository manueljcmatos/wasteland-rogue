'use strict';
// Shared world: see other players in the same realm (or base) in real time, with chat.
// Combat, enemies and loot stay on each device; the server only relays positions and messages.
const Mp = {
  ws: null, on: false, myId: null, ch: null, retry: 0, sendT: 0,
  others: new Map(), chat: [],

  connect() {
    if (!Net.on || !Net.tg || !Net.url || this.ws) return;
    const url = Net.url.replace(/^http/, 'ws') + '/ws?auth=' + encodeURIComponent(Net.tg.initData);
    let ws;
    try { ws = new WebSocket(url); } catch (e) { return; }
    this.ws = ws;
    ws.onopen = () => { this.on = true; this.retry = 0; this.ch = null; };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.handle(m); };
    ws.onclose = () => {
      this.on = false; this.ws = null; this.others.clear();
      setTimeout(() => this.connect(), Math.min(30000, 2000 * Math.pow(2, this.retry++)));
    };
  },
  send(m) { if (this.on && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },

  // out in the world everyone in this realm shares a channel; inside a base, its owner's channel
  channel() {
    if (G.visit) return 'base:' + G.visit.id;
    if (G.atHome && this.myId) return 'base:' + this.myId;
    return 'realm:' + G.save.realm.id;
  },
  join() {
    this.ch = this.channel(); this.others.clear();
    this.send({ t: 'join', ch: this.ch, cls: G.save.cls, lvl: G.save.level, x: G.p.x, y: G.p.y });
  },
  channelChanged() { if (this.on) this.join(); },

  update(dt) {
    if (!this.on) return;
    if (this.channel() !== this.ch) this.join();
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = .2; this.send({ t: 'pos', x: Math.round(G.p.x), y: Math.round(G.p.y), a: Math.round(G.p.ang * 100) / 100 }); }
    const now = performance.now(), k = Math.min(1, dt * 10);
    for (const [id, o] of this.others) {
      if (now - o.seen > 1500) { this.others.delete(id); continue; }
      const dx = o.tx - o.x, dy = o.ty - o.y;
      o.moving = Math.abs(dx) + Math.abs(dy) > 2;
      o.x += dx * k; o.y += dy * k;
      if (o.sayT > 0) o.sayT -= dt;
    }
  },

  handle(m) {
    if (m.t === 'hello') { this.myId = m.id; this.join(); }
    else if (m.t === 'snap') {
      const now = performance.now();
      for (const [id, name, cls, lvl, x, y, a] of m.p) {
        if (id === this.myId) continue;
        let o = this.others.get(id);
        if (!o) { o = { id, x, y }; this.others.set(id, o); }
        Object.assign(o, { name, cls, lvl, tx: x, ty: y, a, seen: now });
      }
    } else if (m.t === 'chat') {
      this.chat.push({ name: m.name, text: m.text, me: m.id === this.myId, at: Date.now() });
      if (this.chat.length > 40) this.chat.shift();
      const o = this.others.get(m.id);
      if (o) { o.say = m.text; o.sayT = 5; }
      if (m.id === this.myId) { G.mySay = m.text; G.mySayT = 5; }
      UI.chatLog();
      if (UI.open === 'chat') UI.updateChatBox();
    } else if (m.t === 'trade') {
      UI.toast(t('⚖️ {n} accepted your trade offer!', { n: m.by }), '#ffe082');
      Sfx.play('buy');
    }
  },
  sendChat(text) {
    text = String(text || '').trim().slice(0, 140);
    if (text) this.send({ t: 'chat', text });
  },
};
