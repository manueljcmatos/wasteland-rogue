'use strict';
// Realms of Tyra backend: Telegram Mini App auth, Telegram Stars payments for gems,
// server-side gem ledger + vault chests, and cloud saves. Zero dependencies (Node >= 22.13).
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const CFG = {
  token: process.env.BOT_TOKEN,
  webhookSecret: process.env.WEBHOOK_SECRET,
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  gameUrl: process.env.GAME_URL || '',
  port: +process.env.PORT || 8080,
  origins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'game.db'),
  admins: (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  earnCap: +process.env.DAILY_EARN_CAP || 60,
  shardCap: +process.env.SHARDS_DAILY_CAP || 120,
  support: process.env.SUPPORT_CONTACT || 'Reply to this chat and we will help you.',
  tgApi: process.env.TG_API_BASE || 'https://api.telegram.org',
};
if (!CFG.token || !CFG.webhookSecret) {
  console.error('BOT_TOKEN and WEBHOOK_SECRET must be set (see .env.example)');
  process.exit(1);
}

// Gem packs priced in Telegram Stars (currency XTR). Ids must match GEM_PACKS in js/data.js.
const PACKS = {
  p100:  { gems: 100,  stars: 75 },
  p550:  { gems: 550,  stars: 350 },
  p1200: { gems: 1200, stars: 700 },
};
// Gem sinks. The server deducts gems; the client applies the in-game reward.
const MAX_CHESTS = 10;
// ☢️ Shards: off-chain points that will later convert to the TON token (phase 3).
// The client reports events; the server decides the amount and enforces a daily cap.
const SHARD_EVENTS = { overlord: 25, quest: 5, outpost: 3, zone: 4 };
// Trading post: what can be traded, and how much of it a player can deposit per day.
// Resources are earned on the player's device, so deposits are capped to limit forged amounts.
const TRADE_CAPS = { gold: 20000, wood: 1500, stone: 1500, iron: 600, crystal: 100 };
const TRADE_RES = Object.keys(TRADE_CAPS);
const MAX_OPEN_OFFERS = 10;
const SPEND = {
  chest: u => (u.vault_chests >= MAX_CHESTS ? null : 50 * u.vault_chests),
  gold: () => 30,
  pots: () => 20,
};

// ---------- database ----------
fs.mkdirSync(path.dirname(CFG.dbPath), { recursive: true });
const db = new DatabaseSync(CFG.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT, gems INTEGER NOT NULL DEFAULT 0, vault_chests INTEGER NOT NULL DEFAULT 1,
    earn_day TEXT, earned_today INTEGER NOT NULL DEFAULT 0, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS payments (
    charge_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, pack TEXT, stars INTEGER, gems INTEGER,
    refunded INTEGER NOT NULL DEFAULT 0, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS saves (user_id TEXT PRIMARY KEY, data TEXT, saved_at INTEGER);
  CREATE TABLE IF NOT EXISTS shard_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, event TEXT, amount INTEGER, created_at INTEGER);
`);
// columns added after the first release
const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
for (const [c, def] of [['shards', 'INTEGER NOT NULL DEFAULT 0'], ['shard_day', 'TEXT'], ['shards_today', 'INTEGER NOT NULL DEFAULT 0'], ['best_zone', 'INTEGER NOT NULL DEFAULT 1'], ['wallet', 'TEXT']])
  if (!cols.includes(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${def}`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_wallet ON users(wallet) WHERE wallet IS NOT NULL');
db.exec(`
  CREATE TABLE IF NOT EXISTS bank (user_id TEXT NOT NULL, res TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, res));
  CREATE TABLE IF NOT EXISTS deposits (user_id TEXT NOT NULL, day TEXT NOT NULL, res TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day, res));
  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, seller TEXT NOT NULL, seller_name TEXT, give_res TEXT, give_n INTEGER, want_res TEXT, want_n INTEGER,
    target TEXT, status TEXT NOT NULL DEFAULT 'open', buyer TEXT, created_at INTEGER, closed_at INTEGER);
  CREATE INDEX IF NOT EXISTS offers_open ON offers(status, target);
`);
const q = {
  getUser: db.prepare('SELECT * FROM users WHERE id = ?'),
  addUser: db.prepare('INSERT OR IGNORE INTO users (id, name, created_at) VALUES (?, ?, ?)'),
  setGems: db.prepare('UPDATE users SET gems = gems + ? WHERE id = ?'),
  setChests: db.prepare('UPDATE users SET vault_chests = ? WHERE id = ?'),
  setEarn: db.prepare('UPDATE users SET earn_day = ?, earned_today = ? WHERE id = ?'),
  ledger: db.prepare('INSERT INTO ledger (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)'),
  addPayment: db.prepare('INSERT OR IGNORE INTO payments (charge_id, user_id, pack, stars, gems, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  getPayment: db.prepare('SELECT * FROM payments WHERE charge_id = ?'),
  refundPayment: db.prepare('UPDATE payments SET refunded = 1 WHERE charge_id = ?'),
  addShards: db.prepare('UPDATE users SET shards = shards + ?, shard_day = ?, shards_today = ? WHERE id = ?'),
  setBestZone: db.prepare('UPDATE users SET best_zone = ? WHERE id = ?'),
  shardLog: db.prepare('INSERT INTO shard_log (user_id, event, amount, created_at) VALUES (?, ?, ?, ?)'),
  setWallet: db.prepare('UPDATE users SET wallet = ? WHERE id = ?'),
  walletOwner: db.prepare('SELECT id FROM users WHERE wallet = ?'),
  top: db.prepare('SELECT id, name, shards FROM users WHERE shards > 0 ORDER BY shards DESC, id LIMIT 30'),
  rankOf: db.prepare('SELECT COUNT(*) AS n FROM users WHERE shards > ?'),
  bankGet: db.prepare('SELECT amount FROM bank WHERE user_id = ? AND res = ?'),
  bankAll: db.prepare('SELECT res, amount FROM bank WHERE user_id = ?'),
  bankAdd: db.prepare('INSERT INTO bank (user_id, res, amount) VALUES (?, ?, ?) ON CONFLICT(user_id, res) DO UPDATE SET amount = amount + excluded.amount'),
  depGet: db.prepare('SELECT amount FROM deposits WHERE user_id = ? AND day = ? AND res = ?'),
  depAll: db.prepare('SELECT res, amount FROM deposits WHERE user_id = ? AND day = ?'),
  depAdd: db.prepare('INSERT INTO deposits (user_id, day, res, amount) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, day, res) DO UPDATE SET amount = amount + excluded.amount'),
  offerAdd: db.prepare('INSERT INTO offers (seller, seller_name, give_res, give_n, want_res, want_n, target, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  offerGet: db.prepare('SELECT * FROM offers WHERE id = ?'),
  offerClose: db.prepare("UPDATE offers SET status = ?, buyer = ?, closed_at = ? WHERE id = ? AND status = 'open'"),
  offersPublic: db.prepare("SELECT * FROM offers WHERE status = 'open' AND target IS NULL ORDER BY id DESC LIMIT 50"),
  offersMine: db.prepare("SELECT * FROM offers WHERE status = 'open' AND seller = ? ORDER BY id DESC"),
  offersForMe: db.prepare("SELECT * FROM offers WHERE status = 'open' AND target = ? ORDER BY id DESC"),
  openCount: db.prepare("SELECT COUNT(*) AS n FROM offers WHERE status = 'open' AND seller = ?"),
  recentSaves: db.prepare('SELECT s.user_id, s.data, s.saved_at, u.name FROM saves s JOIN users u ON u.id = s.user_id ORDER BY s.saved_at DESC LIMIT 40'),
  userName: db.prepare('SELECT name FROM users WHERE id = ?'),
  getSave: db.prepare('SELECT data, saved_at FROM saves WHERE user_id = ?'),
  putSave: db.prepare('INSERT INTO saves (user_id, data, saved_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at'),
};
// node:sqlite calls are synchronous, so each transaction runs without interleaving.
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
function changeGems(userId, delta, reason) {
  q.setGems.run(delta, userId);
  q.ledger.run(userId, delta, reason, Date.now());
}
function ensureUser(tgUser) {
  const id = String(tgUser.id);
  q.addUser.run(id, [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || '', Date.now());
  return q.getUser.get(id);
}
const today = () => new Date().toISOString().slice(0, 10);
function wallet(u) {
  const earned = u.earn_day === today() ? u.earned_today : 0;
  const shardsToday = u.shard_day === today() ? u.shards_today : 0;
  return { gems: u.gems, vaultChests: u.vault_chests, earnedToday: earned, earnCap: CFG.earnCap,
    shards: u.shards, shardsToday, shardCap: CFG.shardCap, wallet: u.wallet };
}

// ---------- trading post helpers ----------
const bankOf = uid => Object.fromEntries(TRADE_RES.map(r => [r, (q.bankGet.get(uid, r) || { amount: 0 }).amount]));
function bankView(uid) {
  const day = today(), used = Object.fromEntries(q.depAll.all(uid, day).map(r => [r.res, r.amount]));
  return { bank: bankOf(uid), deposited: Object.fromEntries(TRADE_RES.map(r => [r, used[r] || 0])), caps: TRADE_CAPS };
}
const offerView = o => ({ id: o.id, seller: o.seller, sellerName: o.seller_name, give: { res: o.give_res, n: o.give_n }, want: { res: o.want_res, n: o.want_n }, target: o.target, at: o.created_at });
const validAmount = n => Number.isInteger(n) && n > 0 && n <= 1e7;
// public profile of a base, read from the player's cloud save
function baseProfile(userId, data) {
  try {
    const s = JSON.parse(data);
    return { id: userId, level: s.level | 0, cls: s.cls || 'soldier', buildings: s.buildings || {}, best: (s.stats && s.stats.best) | 0 };
  } catch { return null; }
}

// ---------- Telegram ----------
async function tg(method, body) {
  const r = await fetch(`${CFG.tgApi}/bot${CFG.token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const SECRET = crypto.createHmac('sha256', 'WebAppData').update(CFG.token).digest();
function verifyInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const calc = crypto.createHmac('sha256', SECRET).update(dcs).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const authDate = +params.get('auth_date');
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null; // older than 24h
  try { return JSON.parse(params.get('user')); } catch { return null; }
}

// ---------- HTTP helpers ----------
function send(res, status, obj, origin) {
  const headers = { 'content-type': 'application/json' };
  if (origin && (CFG.origins.includes(origin) || CFG.origins.includes('*'))) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 600 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

// very small per-user rate limit for the API
const hits = new Map();
function limited(id) {
  const now = Date.now(), h = (hits.get(id) || []).filter(t => now - t < 10000);
  h.push(now); hits.set(id, h);
  return h.length > 30;
}

// ---------- API ----------
async function api(req, res, origin, route) {
  const user = verifyInitData(req.headers['x-telegram-init-data']);
  if (!user) return send(res, 401, { error: 'invalid Telegram session' }, origin);
  if (limited(user.id)) return send(res, 429, { error: 'too many requests' }, origin);
  let u = ensureUser(user);
  const body = req.method === 'GET' ? {} : await readBody(req);

  if (route === 'GET /api/me') return send(res, 200, wallet(u), origin);

  if (route === 'POST /api/invoice') {
    const pack = PACKS[body.pack];
    if (!pack) return send(res, 400, { error: 'unknown pack' }, origin);
    const link = await tg('createInvoiceLink', {
      title: `${pack.gems} Gems`,
      description: `${pack.gems} premium gems for Realms of Tyra`,
      payload: JSON.stringify({ u: String(user.id), p: body.pack }),
      currency: 'XTR',
      prices: [{ label: `${pack.gems} Gems`, amount: pack.stars }],
    });
    return send(res, 200, { link }, origin);
  }

  if (route === 'POST /api/spend') {
    const cost = SPEND[body.item] && SPEND[body.item](u);
    if (cost == null) return send(res, 400, { error: 'cannot buy this' }, origin);
    if (u.gems < cost) return send(res, 402, { error: 'not enough gems' }, origin);
    tx(() => {
      changeGems(u.id, -cost, `spend:${body.item}`);
      if (body.item === 'chest') q.setChests.run(u.vault_chests + 1, u.id);
    });
    u = q.getUser.get(u.id);
    return send(res, 200, { ok: true, item: body.item, wallet: wallet(u) }, origin);
  }

  if (route === 'POST /api/earn') {
    // gems earned in play (quests, Overlords) are reported by the client, so they are capped per day
    const day = today(), used = u.earn_day === day ? u.earned_today : 0;
    const amount = Math.max(0, Math.min(Math.floor(+body.amount || 0), 20, CFG.earnCap - used));
    if (amount > 0) tx(() => { changeGems(u.id, amount, `earn:${String(body.reason || '').slice(0, 40)}`); q.setEarn.run(day, used + amount, u.id); });
    u = q.getUser.get(u.id);
    return send(res, 200, { credited: amount, wallet: wallet(u) }, origin);
  }

  if (route === 'POST /api/shards') {
    const per = SHARD_EVENTS[body.event];
    if (!per) return send(res, 400, { error: 'unknown event' }, origin);
    let amount = per;
    if (body.event === 'zone') {
      // only new personal-best zones count, at most 3 zones per report
      const z = Math.floor(+body.value || 0);
      if (z <= u.best_zone) return send(res, 200, { credited: 0, wallet: wallet(u) }, origin);
      amount = per * Math.min(3, z - u.best_zone);
      q.setBestZone.run(Math.min(z, u.best_zone + 3), u.id);
    }
    const day = today(), used = u.shard_day === day ? u.shards_today : 0;
    amount = Math.max(0, Math.min(amount, CFG.shardCap - used));
    if (amount > 0) tx(() => { q.addShards.run(amount, day, used + amount, u.id); q.shardLog.run(u.id, body.event, amount, Date.now()); });
    u = q.getUser.get(u.id);
    return send(res, 200, { credited: amount, wallet: wallet(u) }, origin);
  }

  if (route === 'POST /api/wallet') {
    // TON address from TON Connect: raw "0:<64 hex>" or user-friendly 48-char base64url. null unlinks.
    const addr = body.address == null ? null : String(body.address).trim();
    if (addr !== null && !/^-?\d:[0-9a-fA-F]{64}$/.test(addr) && !/^[A-Za-z0-9_-]{48}$/.test(addr)) return send(res, 400, { error: 'invalid TON address' }, origin);
    if (addr) { const owner = q.walletOwner.get(addr); if (owner && owner.id !== u.id) return send(res, 409, { error: 'wallet already linked to another account' }, origin); }
    q.setWallet.run(addr, u.id);
    u = q.getUser.get(u.id);
    return send(res, 200, { wallet: wallet(u) }, origin);
  }

  if (route === 'GET /api/leaderboard') {
    const rows = q.top.all().map((r, i) => ({ rank: i + 1, name: (r.name || 'Player').slice(0, 24), shards: r.shards, me: r.id === u.id }));
    return send(res, 200, { top: rows, myRank: u.shards > 0 ? q.rankOf.get(u.shards).n + 1 : null, myShards: u.shards }, origin);
  }

  // ----- trading post -----
  if (route === 'GET /api/bank') return send(res, 200, bankView(u.id), origin);
  if (route === 'POST /api/bank/deposit') {
    const r = body.res, n = Math.floor(+body.amount);
    if (!TRADE_RES.includes(r) || !validAmount(n)) return send(res, 400, { error: 'invalid deposit' }, origin);
    const day = today(), used = (q.depGet.get(u.id, day, r) || { amount: 0 }).amount;
    const credited = Math.min(n, TRADE_CAPS[r] - used);
    if (credited > 0) tx(() => { q.bankAdd.run(u.id, r, credited); q.depAdd.run(u.id, day, r, credited); });
    return send(res, 200, { credited, ...bankView(u.id) }, origin);
  }
  if (route === 'POST /api/bank/withdraw') {
    const r = body.res, n = Math.floor(+body.amount);
    if (!TRADE_RES.includes(r) || !validAmount(n)) return send(res, 400, { error: 'invalid withdrawal' }, origin);
    if (bankOf(u.id)[r] < n) return send(res, 402, { error: 'not enough in the trading post' }, origin);
    q.bankAdd.run(u.id, r, -n);
    return send(res, 200, { withdrawn: n, ...bankView(u.id) }, origin);
  }
  if (route === 'GET /api/market') {
    return send(res, 200, {
      public: q.offersPublic.all().filter(o => o.seller !== u.id).map(offerView),
      mine: q.offersMine.all(u.id).map(offerView),
      forMe: q.offersForMe.all(u.id).map(offerView),
      ...bankView(u.id),
    }, origin);
  }
  if (route === 'POST /api/market/offer') {
    const g = body.give || {}, w = body.want || {}, gn = Math.floor(+g.n), wn = Math.floor(+w.n);
    const target = body.to == null ? null : String(body.to);
    if (!TRADE_RES.includes(g.res) || !TRADE_RES.includes(w.res) || g.res === w.res || !validAmount(gn) || !validAmount(wn)) return send(res, 400, { error: 'invalid offer' }, origin);
    if (target && (target === u.id || !q.getUser.get(target))) return send(res, 400, { error: 'unknown player' }, origin);
    if (q.openCount.get(u.id).n >= MAX_OPEN_OFFERS) return send(res, 400, { error: 'too many open offers' }, origin);
    if (bankOf(u.id)[g.res] < gn) return send(res, 402, { error: 'not enough in the trading post' }, origin);
    const id = tx(() => { q.bankAdd.run(u.id, g.res, -gn); return q.offerAdd.run(u.id, u.name || 'Player', g.res, gn, w.res, wn, target, Date.now()).lastInsertRowid; });
    return send(res, 200, { id: Number(id), ...bankView(u.id) }, origin);
  }
  if (route === 'POST /api/market/accept') {
    const o = q.offerGet.get(Math.floor(+body.id));
    if (!o || o.status !== 'open') return send(res, 404, { error: 'offer no longer available' }, origin);
    if (o.seller === u.id || (o.target && o.target !== u.id)) return send(res, 403, { error: 'not your offer to accept' }, origin);
    if (bankOf(u.id)[o.want_res] < o.want_n) return send(res, 402, { error: 'not enough in the trading post' }, origin);
    tx(() => {
      if (!q.offerClose.run('done', u.id, Date.now(), o.id).changes) throw new Error('race');
      q.bankAdd.run(u.id, o.want_res, -o.want_n); q.bankAdd.run(o.seller, o.want_res, o.want_n);
      q.bankAdd.run(u.id, o.give_res, o.give_n);
    });
    const seller = online.get(o.seller);
    if (seller) seller.ws.send(JSON.stringify({ t: 'trade', id: o.id, by: u.name || 'Player' }));
    return send(res, 200, { ok: true, ...bankView(u.id) }, origin);
  }
  if (route === 'POST /api/market/cancel') {
    const o = q.offerGet.get(Math.floor(+body.id));
    if (!o || o.status !== 'open') return send(res, 404, { error: 'offer no longer available' }, origin);
    if (o.seller !== u.id && o.target !== u.id) return send(res, 403, { error: 'not your offer' }, origin);
    tx(() => { q.offerClose.run(o.seller === u.id ? 'cancelled' : 'declined', null, Date.now(), o.id); q.bankAdd.run(o.seller, o.give_res, o.give_n); });
    return send(res, 200, { ok: true, ...bankView(u.id) }, origin);
  }

  // ----- visiting other players' bases -----
  if (route === 'GET /api/bases') {
    const list = [], seen = new Set();
    for (const r of q.recentSaves.all()) {
      if (r.user_id === u.id) continue;
      const p = baseProfile(r.user_id, r.data); if (!p) continue;
      seen.add(r.user_id);
      list.push({ ...p, name: (r.name || 'Player').slice(0, 24), online: online.has(r.user_id) });
    }
    for (const c of online.values()) if (c.id !== u.id && !seen.has(c.id)) list.push({ id: c.id, name: c.name, level: c.lvl, cls: c.cls, buildings: {}, online: true });
    list.sort((a, b) => (b.online - a.online) || (b.level - a.level));
    return send(res, 200, { bases: list.slice(0, 40) }, origin);
  }
  if (route.startsWith('GET /api/base/')) {
    const id = route.slice('GET /api/base/'.length);
    const s = /^\d{1,15}$/.test(id) && q.getSave.get(id), p = s && baseProfile(id, s.data);
    if (!p) return send(res, 404, { error: 'base not found' }, origin);
    return send(res, 200, { ...p, name: ((q.userName.get(id) || {}).name || 'Player').slice(0, 24), online: online.has(id) }, origin);
  }

  if (route === 'GET /api/save') {
    const s = q.getSave.get(u.id);
    return send(res, 200, s ? { data: s.data, savedAt: s.saved_at } : { data: null, savedAt: 0 }, origin);
  }
  if (route === 'PUT /api/save') {
    if (typeof body.data !== 'string' || body.data.length > 500 * 1024) return send(res, 400, { error: 'bad save' }, origin);
    q.putSave.run(u.id, body.data, Math.floor(+body.savedAt || Date.now()));
    return send(res, 200, { ok: true }, origin);
  }
  return send(res, 404, { error: 'not found' }, origin);
}

// ---------- bot webhook ----------
async function onUpdate(up) {
  if (up.pre_checkout_query) {
    const pq = up.pre_checkout_query;
    let ok = false, err = 'This purchase is not available.';
    try {
      const p = JSON.parse(pq.invoice_payload), pack = PACKS[p.p];
      ok = !!pack && pq.currency === 'XTR' && pq.total_amount === pack.stars && p.u === String(pq.from.id);
    } catch { /* invalid payload */ }
    return tg('answerPreCheckoutQuery', ok ? { pre_checkout_query_id: pq.id, ok: true } : { pre_checkout_query_id: pq.id, ok: false, error_message: err });
  }

  const msg = up.message;
  if (!msg) return;
  if (msg.successful_payment) {
    const sp = msg.successful_payment, p = JSON.parse(sp.invoice_payload), pack = PACKS[p.p];
    const userId = String(msg.from.id);
    if (!pack) return;
    ensureUser(msg.from);
    // idempotent: Telegram may deliver the same update twice
    const credited = tx(() => {
      const r = q.addPayment.run(sp.telegram_payment_charge_id, userId, p.p, sp.total_amount, pack.gems, Date.now());
      if (!r.changes) return false;
      changeGems(userId, pack.gems, `buy:${p.p}:${sp.telegram_payment_charge_id}`);
      return true;
    });
    if (credited) await tg('sendMessage', { chat_id: msg.chat.id, text: `✅ Thank you! +${pack.gems} 💎 gems added to your account.` });
    return;
  }

  const text = (msg.text || '').trim();
  if (text.startsWith('/start')) {
    return tg('sendMessage', {
      chat_id: msg.chat.id,
      text: '⚔️ Realms of Tyra: an open-world roguelike shooter. Tap Play to start!',
      reply_markup: CFG.gameUrl ? { inline_keyboard: [[{ text: '▶️ Play', web_app: { url: CFG.gameUrl } }]] } : undefined,
    });
  }
  if (text.startsWith('/paysupport')) {
    return tg('sendMessage', { chat_id: msg.chat.id, text: `💬 Payment support\n${CFG.support}\nPlease include the date of the purchase and the pack you bought.` });
  }
  // admin: /refund <telegram_payment_charge_id>
  if (text.startsWith('/refund') && CFG.admins.includes(String(msg.from.id))) {
    const charge = text.split(/\s+/)[1], pay = charge && q.getPayment.get(charge);
    if (!pay) return tg('sendMessage', { chat_id: msg.chat.id, text: 'Payment not found.' });
    if (pay.refunded) return tg('sendMessage', { chat_id: msg.chat.id, text: 'Already refunded.' });
    await tg('refundStarPayment', { user_id: +pay.user_id, telegram_payment_charge_id: charge });
    tx(() => { q.refundPayment.run(charge); changeGems(pay.user_id, -pay.gems, `refund:${charge}`); });
    return tg('sendMessage', { chat_id: msg.chat.id, text: `Refunded ${pay.stars}⭐ and removed ${pay.gems} gems from user ${pay.user_id}.` });
  }
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const route = `${req.method} ${req.url.split('?')[0]}`;
  try {
    if (req.method === 'OPTIONS') {
      const allowed = origin && (CFG.origins.includes(origin) || CFG.origins.includes('*'));
      res.writeHead(204, allowed ? {
        'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, PUT',
        'access-control-allow-headers': 'content-type, x-telegram-init-data', 'access-control-max-age': '86400', vary: 'Origin',
      } : {});
      return res.end();
    }
    if (route === 'GET /health') return send(res, 200, { ok: true });
    if (route === 'POST /telegram/webhook') {
      if (req.headers['x-telegram-bot-api-secret-token'] !== CFG.webhookSecret) return send(res, 403, { error: 'forbidden' });
      const up = await readBody(req);
      try { await onUpdate(up); } catch (e) { console.error('update failed:', e.message); }
      return send(res, 200, { ok: true });
    }
    if (route.includes(' /api/')) return await api(req, res, origin, route);
    send(res, 404, { error: 'not found' }, origin);
  } catch (e) {
    console.error(route, e.message);
    send(res, 500, { error: 'server error' }, origin);
  }
});

// ---------- realtime: presence + chat over WebSocket ----------
// Each client is in one channel: "realm:<id>" (out in the shared world) or "base:<owner id>" (inside a base).
// Positions are relayed 5 times per second to everyone in the same channel. Combat stays on each device.
const { upgrade } = require('./ws.js');
const online = new Map(); // telegram user id -> client
const CLASS_IDS = ['soldier', 'ranger', 'mage', 'guardian', 'scout'];
const num = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') return socket.destroy();
  const origin = req.headers.origin;
  if (origin && CFG.origins.length && !CFG.origins.includes(origin) && !CFG.origins.includes('*')) return socket.destroy();
  const user = verifyInitData(url.searchParams.get('auth'));
  if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
  const ws = upgrade(req, socket);
  if (!ws) return;
  ensureUser(user);
  const id = String(user.id), prev = online.get(id);
  if (prev) prev.ws.close(4000); // one live connection per account
  const c = { id, name: String(user.first_name || user.username || 'Player').slice(0, 20), ws, ch: null, x: 0, y: 0, a: 0, cls: 'soldier', lvl: 1, chatAt: 0 };
  online.set(id, c);
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; } onWs(c, m); });
  ws.on('close', () => { if (online.get(id) === c) online.delete(id); });
  ws.send(JSON.stringify({ t: 'hello', id }));
});

function onWs(c, m) {
  if (m.t === 'join' && typeof m.ch === 'string' && /^(realm:\d{1,12}|base:\d{1,15})$/.test(m.ch)) {
    c.ch = m.ch;
    if (CLASS_IDS.includes(m.cls)) c.cls = m.cls;
    c.lvl = Math.max(1, Math.min(9999, Math.floor(+m.lvl || 1)));
    c.x = num(m.x, 1e7); c.y = num(m.y, 1e7);
  } else if (m.t === 'pos') {
    c.x = num(m.x, 1e7); c.y = num(m.y, 1e7); c.a = num(m.a, 10);
  } else if (m.t === 'chat' && c.ch) {
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 140), now = Date.now();
    if (!text || now - c.chatAt < 1000) return;
    c.chatAt = now;
    const out = JSON.stringify({ t: 'chat', id: c.id, name: c.name, text });
    for (const o of online.values()) if (o.ch === c.ch) o.ws.send(out);
  }
}

setInterval(() => {
  const chans = new Map();
  for (const c of online.values()) if (c.ch) { if (!chans.has(c.ch)) chans.set(c.ch, []); chans.get(c.ch).push(c); }
  for (const list of chans.values()) {
    if (list.length < 2) continue;
    const snap = JSON.stringify({ t: 'snap', p: list.slice(0, 60).map(c => [c.id, c.name, c.cls, c.lvl, Math.round(c.x), Math.round(c.y), Math.round(c.a * 100) / 100]) });
    for (const c of list) c.ws.send(snap);
  }
}, 200).unref();

server.listen(CFG.port, async () => {
  console.log(`Realms of Tyra server on :${CFG.port}`);
  if (CFG.publicUrl) {
    try {
      await tg('setWebhook', { url: `${CFG.publicUrl}/telegram/webhook`, secret_token: CFG.webhookSecret, allowed_updates: ['message', 'pre_checkout_query'] });
      if (CFG.gameUrl) await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Play', web_app: { url: CFG.gameUrl } } });
      console.log('Telegram webhook and menu button configured');
    } catch (e) { console.error('Telegram setup failed:', e.message); }
  }
});

module.exports = { server, verifyInitData, PACKS, online };
