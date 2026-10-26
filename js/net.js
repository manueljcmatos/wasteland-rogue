'use strict';
// Telegram Mini App + backend connection: Stars purchases, server-side gems/vault chests, cloud save.
// Without Telegram or a configured server the game runs fully offline (gems stay local, no purchases).
const Net = {
  on: false, lastPush: 0, w: null,
  tg: (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) ? Telegram.WebApp : null,
  get url() { return (window.GAME_CONFIG || {}).serverUrl || ''; },
  get canBuy() { return this.on; },

  async call(method, path, body, keepalive = false) {
    const r = await fetch(this.url + path, {
      method, keepalive,
      headers: { 'content-type': 'application/json', 'x-telegram-init-data': this.tg.initData },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  },

  // before the save is loaded: use the cloud save if it is newer than this device's
  async boot() {
    if (!this.tg) return;
    try {
      this.tg.ready(); this.tg.expand();
      if (this.tg.disableVerticalSwipes) this.tg.disableVerticalSwipes();
      if (this.tg.setHeaderColor) this.tg.setHeaderColor('#14161a');
      if (this.tg.setBackgroundColor) this.tg.setBackgroundColor('#14161a');
    } catch (e) { /* older Telegram clients */ }
    if (!this.url) return;
    try {
      const r = await Promise.race([this.call('GET', '/api/save'), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 5000))]);
      const local = Save.load();
      if (r.data && (r.savedAt || 0) > (local.savedAt || 0) + 3000) Save.write(JSON.parse(r.data));
      this.on = true;
    } catch (e) { console.warn('cloud save unavailable', e); }
  },

  // after the game started: the server owns gems and vault chests
  async connect() {
    if (!this.on) return;
    try { this.apply(await this.call('GET', '/api/me')); }
    catch (e) { this.on = false; UI.toast(t('⚠️ Server offline: purchases unavailable'), '#ff8a80'); }
  },
  apply(w) {
    this.w = w;
    G.save.gems = Math.max(0, w.gems);
    G.save.vaultChests = w.vaultChests;
    recalc();
    if (UI.open) UI.refresh();
  },

  buy(packId) {
    return this.call('POST', '/api/invoice', { pack: packId }).then(({ link }) => new Promise(done => {
      this.tg.openInvoice(link, async status => {
        if (status === 'paid') {
          UI.toast(t('⏳ Payment received, adding gems…'), '#b388ff');
          const before = G.save.gems;
          for (let i = 0; i < 15; i++) { // the webhook can take a moment
            await new Promise(r => setTimeout(r, 1000));
            const w = await this.call('GET', '/api/me').catch(() => null);
            if (w && w.gems !== before) { this.apply(w); Sfx.play('level'); UI.toast(t('💎 Gems added. Thank you!'), '#b388ff'); break; }
          }
        } else if (status === 'failed') UI.toast(t('Payment failed'), '#ff8a80');
        done(status);
      });
    }));
  },
  async spend(item) { const r = await this.call('POST', '/api/spend', { item }); this.apply(r.wallet); return r; },

  // gems earned in play go through the server (daily cap) when online
  earn(amount, reason) {
    if (!this.on) { G.save.gems += amount; return; }
    this.call('POST', '/api/earn', { amount, reason }).then(r => this.apply(r.wallet)).catch(() => {});
  },

  // ☢️ Shards: the server decides how many an event is worth (and caps them per day)
  shard(event, value) {
    if (!this.on) return;
    this.call('POST', '/api/shards', { event, value }).then(r => {
      this.apply(r.wallet);
      if (r.credited > 0) UI.toast(t('+{n} ☢️ Shards', { n: r.credited }), '#b9f6ca');
    }).catch(() => {});
  },
  async linkWallet(address) { const r = await this.call('POST', '/api/wallet', { address }); this.apply(r.wallet); return r; },
  leaderboard() { return this.call('GET', '/api/leaderboard'); },

  pushSave(force = false) {
    if (!this.on) return;
    const now = Date.now();
    if (!force && now - this.lastPush < 20000) return;
    this.lastPush = now;
    this.call('PUT', '/api/save', { data: JSON.stringify(G.save), savedAt: G.save.savedAt }, force).catch(() => {});
  },
};
