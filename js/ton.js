'use strict';
// TON Connect: link the player's TON wallet (Telegram Wallet, Tonkeeper, ...) to their account.
// The UI library is only downloaded when the player opens the wallet dialog.
const TON_UI_SRC = 'https://unpkg.com/@tonconnect/ui@3.0.2/dist/tonconnect-ui.min.js';
const Ton = {
  ui: null, loading: null,
  load() {
    if (window.TON_CONNECT_UI) return Promise.resolve();
    return this.loading || (this.loading = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = TON_UI_SRC; s.onload = ok; s.onerror = () => { this.loading = null; fail(new Error('TON Connect failed to load')); };
      document.head.appendChild(s);
    }));
  },
  async init() {
    await this.load();
    if (this.ui) return this.ui;
    const cfg = window.GAME_CONFIG || {};
    this.ui = new TON_CONNECT_UI.TonConnectUI({ manifestUrl: new URL('tonconnect-manifest.json', location.href).href });
    if (cfg.botUsername && cfg.miniAppName) this.ui.uiOptions = { twaReturnUrl: `https://t.me/${cfg.botUsername}/${cfg.miniAppName}` };
    this.ui.onStatusChange(w => {
      if (!w) return;
      const addr = TON_CONNECT_UI.toUserFriendlyAddress(w.account.address, w.account.chain === '-3');
      Net.linkWallet(addr).then(() => UI.toast(t('👛 Wallet linked'), '#80deea')).catch(e => UI.toast('⚠️ ' + e.message, '#ff8a80'));
    });
    return this.ui;
  },
  async connect() {
    try { const ui = await this.init(); if (ui.connected) await ui.disconnect(); await ui.openModal(); }
    catch (e) { UI.toast('⚠️ ' + e.message, '#ff8a80'); }
  },
  async disconnect() {
    try { if (this.ui && this.ui.connected) await this.ui.disconnect(); } catch (e) { /* already disconnected */ }
    await Net.linkWallet(null).catch(() => {});
  },
};
