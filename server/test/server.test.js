'use strict';
// End-to-end test against a fake Telegram Bot API. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const calls = [];
const fakeTg = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const method = req.url.split('/').pop();
    calls.push({ method, body: JSON.parse(b || '{}') });
    res.end(JSON.stringify({ ok: true, result: method === 'createInvoiceLink' ? 'https://t.me/$invoice-test' : true }));
  });
});

const TOKEN = '123456:TEST', SECRET = 'hook-secret';
let base;

function initData(user, ageSec = 0) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - ageSec), query_id: 'Q1', user: JSON.stringify(user) });
  const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  p.set('hash', crypto.createHmac('sha256', key).update(dcs).digest('hex'));
  return p.toString();
}
const alice = { id: 42, first_name: 'Alice' };
async function call(method, url, body, id = initData(alice)) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-telegram-init-data': id, origin: 'https://game.test' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), json: await r.json() };
}
const hook = (up, secret = SECRET) => fetch(base + '/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(up) });

test.before(async () => {
  await new Promise(r => fakeTg.listen(0, r));
  Object.assign(process.env, {
    BOT_TOKEN: TOKEN, WEBHOOK_SECRET: SECRET, PORT: '18765', TG_API_BASE: `http://127.0.0.1:${fakeTg.address().port}`,
    DB_PATH: path.join(os.tmpdir(), `wr-test-${process.pid}.db`), ALLOWED_ORIGINS: 'https://game.test', ADMIN_IDS: '7', DAILY_EARN_CAP: '30',
  });
  require('../server.js');
  base = 'http://127.0.0.1:18765';
  await new Promise(r => setTimeout(r, 200));
});
test.after(() => { require('../server.js').server.close(); fakeTg.close(); });

test('rejects forged or expired Telegram sessions', async () => {
  assert.equal((await call('GET', '/api/me', null, 'user=%7B%22id%22%3A1%7D&hash=deadbeef')).status, 401);
  assert.equal((await call('GET', '/api/me', null, initData(alice, 90000))).status, 401);
  const tampered = initData(alice).replace('Alice', 'Mallory');
  assert.equal((await call('GET', '/api/me', null, tampered)).status, 401);
});

test('new user wallet + CORS', async () => {
  const r = await call('GET', '/api/me');
  assert.equal(r.status, 200);
  assert.equal(r.cors, 'https://game.test');
  assert.deepEqual([r.json.gems, r.json.vaultChests], [0, 1]);
});

test('full Stars purchase flow credits gems exactly once', async () => {
  const inv = await call('POST', '/api/invoice', { pack: 'p550' });
  assert.equal(inv.status, 200);
  const sent = calls.find(c => c.method === 'createInvoiceLink').body;
  assert.equal(sent.currency, 'XTR');
  assert.equal(sent.prices[0].amount, 350);
  // pre-checkout: valid
  await hook({ pre_checkout_query: { id: 'pc1', from: alice, currency: 'XTR', total_amount: 350, invoice_payload: sent.payload } });
  assert.deepEqual(calls.at(-1), { method: 'answerPreCheckoutQuery', body: { pre_checkout_query_id: 'pc1', ok: true } });
  // pre-checkout: wrong amount is rejected
  await hook({ pre_checkout_query: { id: 'pc2', from: alice, currency: 'XTR', total_amount: 1, invoice_payload: sent.payload } });
  assert.equal(calls.at(-1).body.ok, false);
  // payment (delivered twice)
  const pay = { message: { chat: { id: 42 }, from: alice, successful_payment: { currency: 'XTR', total_amount: 350, invoice_payload: sent.payload, telegram_payment_charge_id: 'ch_1' } } };
  await hook(pay); await hook(pay);
  assert.equal((await call('GET', '/api/me')).json.gems, 550);
});

test('webhook requires the secret token', async () => {
  const r = await hook({ message: { chat: { id: 1 }, from: alice, text: '/start' } }, 'wrong');
  assert.equal(r.status, 403);
});

test('spending gems: vault chests, not enough gems', async () => {
  let r = await call('POST', '/api/spend', { item: 'chest' });
  assert.deepEqual([r.status, r.json.wallet.gems, r.json.wallet.vaultChests], [200, 500, 2]);
  r = await call('POST', '/api/spend', { item: 'chest' }); // costs 100 now
  assert.deepEqual([r.json.wallet.gems, r.json.wallet.vaultChests], [400, 3]);
  r = await call('POST', '/api/spend', { item: 'nope' });
  assert.equal(r.status, 400);
  const bob = { id: 77, first_name: 'Bob' };
  r = await call('POST', '/api/spend', { item: 'gold' }, initData(bob));
  assert.equal(r.status, 402);
});

test('earned gems are capped per day and per call', async () => {
  let r = await call('POST', '/api/earn', { amount: 999, reason: 'quest' });
  assert.equal(r.json.credited, 20);
  r = await call('POST', '/api/earn', { amount: 15, reason: 'quest' });
  assert.equal(r.json.credited, 10); // cap 30
  r = await call('POST', '/api/earn', { amount: 5 });
  assert.equal(r.json.credited, 0);
});

test('cloud save round trip', async () => {
  await call('PUT', '/api/save', { data: '{"level":9}', savedAt: 1234 });
  const r = await call('GET', '/api/save');
  assert.deepEqual(r.json, { data: '{"level":9}', savedAt: 1234 });
});

test('admin refund removes gems once; non-admin ignored', async () => {
  const before = (await call('GET', '/api/me')).json.gems;
  await hook({ message: { chat: { id: 42 }, from: alice, text: '/refund ch_1' } }); // not admin
  assert.equal((await call('GET', '/api/me')).json.gems, before);
  await hook({ message: { chat: { id: 7 }, from: { id: 7 }, text: '/refund ch_1' } });
  assert.equal(calls.find(c => c.method === 'refundStarPayment').body.telegram_payment_charge_id, 'ch_1');
  assert.equal((await call('GET', '/api/me')).json.gems, before - 550);
  await hook({ message: { chat: { id: 7 }, from: { id: 7 }, text: '/refund ch_1' } });
  assert.equal((await call('GET', '/api/me')).json.gems, before - 550);
});

test('shards: server-decided amounts, zone only on new bests, daily cap', async () => {
  const carol = { id: 900, first_name: 'Carol' }, id = initData(carol);
  let r = await call('POST', '/api/shards', { event: 'overlord' }, id);
  assert.equal(r.json.credited, 25);
  r = await call('POST', '/api/shards', { event: 'quest', amount: 9999 }, id); // client amount ignored
  assert.equal(r.json.credited, 5);
  r = await call('POST', '/api/shards', { event: 'zone', value: 99 }, id); // best 1 -> at most +3 zones
  assert.equal(r.json.credited, 12);
  r = await call('POST', '/api/shards', { event: 'zone', value: 3 }, id); // not a new best
  assert.equal(r.json.credited, 0);
  r = await call('POST', '/api/shards', { event: 'cheat' }, id);
  assert.equal(r.status, 400);
  for (let i = 0; i < 10; i++) r = await call('POST', '/api/shards', { event: 'overlord' }, id);
  assert.equal(r.json.wallet.shardsToday, 120); // SHARDS_DAILY_CAP default
  assert.equal(r.json.credited, 0);
});

test('wallet linking: format, uniqueness, unlink', async () => {
  const dave = { id: 901, first_name: 'Dave' }, erin = { id: 902, first_name: 'Erin' };
  const addr = '0:' + 'ab'.repeat(32);
  assert.equal((await call('POST', '/api/wallet', { address: 'not-an-address' }, initData(dave))).status, 400);
  let r = await call('POST', '/api/wallet', { address: addr }, initData(dave));
  assert.equal(r.json.wallet.wallet, addr);
  assert.equal((await call('POST', '/api/wallet', { address: addr }, initData(erin))).status, 409);
  r = await call('POST', '/api/wallet', { address: null }, initData(dave));
  assert.equal(r.json.wallet.wallet, null);
  assert.equal((await call('POST', '/api/wallet', { address: 'EQ' + 'A'.repeat(46) }, initData(erin))).status, 200);
});

test('leaderboard ranks players by shards', async () => {
  const r = await call('GET', '/api/leaderboard', null, initData({ id: 900, first_name: 'Carol' }));
  assert.equal(r.json.top[0].name, 'Carol');
  assert.equal(r.json.top[0].me, true);
  assert.equal(r.json.myRank, 1);
});

// ---------- realtime ----------
function wsOpen(user) {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(`ws://127.0.0.1:18765/ws?auth=${encodeURIComponent(initData(user))}`);
    ws.msgs = [];
    ws.onmessage = e => ws.msgs.push(JSON.parse(e.data));
    ws.onopen = () => ok(ws);
    ws.onerror = () => fail(new Error('ws failed'));
  });
}
const waitFor = async (fn, ms = 2000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 30)); } return null; };

test('realtime: players in the same channel see each other and chat', async () => {
  const a = await wsOpen({ id: 501, first_name: 'Ana' }), b = await wsOpen({ id: 502, first_name: 'Bia' }), c = await wsOpen({ id: 503, first_name: 'Caio' });
  a.send(JSON.stringify({ t: 'join', ch: 'realm:77', cls: 'mage', lvl: 9, x: 10, y: 20 }));
  b.send(JSON.stringify({ t: 'join', ch: 'realm:77', cls: 'scout', lvl: 3, x: 50, y: 60 }));
  c.send(JSON.stringify({ t: 'join', ch: 'realm:78', cls: 'ranger', lvl: 1 }));
  b.send(JSON.stringify({ t: 'pos', x: 123, y: 456, a: 1.5 }));
  const snap = await waitFor(() => a.msgs.find(m => m.t === 'snap' && m.p.some(p => p[0] === '502' && p[4] === 123)));
  assert.ok(snap, 'Ana sees Bia');
  assert.deepEqual(snap.p.find(p => p[0] === '502').slice(1, 4), ['Bia', 'scout', 3]);
  assert.ok(!c.msgs.some(m => m.t === 'snap'), 'other realm sees nobody');
  a.send(JSON.stringify({ t: 'chat', text: '  olá   pessoal <b>  ' }));
  a.send(JSON.stringify({ t: 'chat', text: 'spam' })); // rate limited
  const chat = await waitFor(() => b.msgs.find(m => m.t === 'chat'));
  assert.deepEqual([chat.name, chat.text], ['Ana', 'olá pessoal <b>']);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(b.msgs.filter(m => m.t === 'chat').length, 1);
  assert.ok(!c.msgs.some(m => m.t === 'chat'));
  a.close(); b.close(); c.close();
});

test('realtime: forged session is refused, invalid channel ignored', async () => {
  const bad = new WebSocket('ws://127.0.0.1:18765/ws?auth=user%3D%7B%22id%22%3A1%7D%26hash%3Dbad');
  const res = await new Promise(r => { bad.onopen = () => r('open'); bad.onerror = () => r('error'); bad.onclose = () => r('closed'); });
  assert.notEqual(res, 'open');
  const a = await wsOpen({ id: 504, first_name: 'Dan' }), b = await wsOpen({ id: 505, first_name: 'Eva' });
  a.send(JSON.stringify({ t: 'join', ch: '../admin' })); b.send(JSON.stringify({ t: 'join', ch: '../admin' }));
  await new Promise(r => setTimeout(r, 450));
  assert.ok(!a.msgs.some(m => m.t === 'snap'));
  a.close(); b.close();
});

// ---------- trading post ----------
test('trading post: deposits are capped per day, withdrawals need balance', async () => {
  const f = initData({ id: 601, first_name: 'Fia' });
  let r = await call('POST', '/api/bank/deposit', { res: 'crystal', amount: 150 }, f);
  assert.equal(r.json.credited, 100); // daily cap
  r = await call('POST', '/api/bank/deposit', { res: 'crystal', amount: 5 }, f);
  assert.equal(r.json.credited, 0);
  assert.equal((await call('POST', '/api/bank/deposit', { res: 'diamonds', amount: 5 }, f)).status, 400);
  r = await call('POST', '/api/bank/withdraw', { res: 'crystal', amount: 30 }, f);
  assert.deepEqual([r.json.withdrawn, r.json.bank.crystal], [30, 70]);
  assert.equal((await call('POST', '/api/bank/withdraw', { res: 'crystal', amount: 71 }, f)).status, 402);
});

test('market: escrow, accept swaps both sides, cancel refunds', async () => {
  const seller = initData({ id: 611, first_name: 'Sol' }), buyer = initData({ id: 612, first_name: 'Ben' });
  await call('POST', '/api/bank/deposit', { res: 'wood', amount: 300 }, seller);
  await call('POST', '/api/bank/deposit', { res: 'gold', amount: 1000 }, buyer);
  assert.equal((await call('POST', '/api/market/offer', { give: { res: 'wood', n: 999 }, want: { res: 'gold', n: 1 } }, seller)).status, 402);
  let r = await call('POST', '/api/market/offer', { give: { res: 'wood', n: 200 }, want: { res: 'gold', n: 500 } }, seller);
  const offerId = r.json.id;
  assert.equal(r.json.bank.wood, 100); // escrowed
  r = await call('GET', '/api/market', null, buyer);
  assert.ok(r.json.public.some(o => o.id === offerId && o.sellerName === 'Sol'));
  assert.equal((await call('POST', '/api/market/accept', { id: offerId }, seller)).status, 403); // own offer
  r = await call('POST', '/api/market/accept', { id: offerId }, buyer);
  assert.deepEqual([r.json.bank.wood, r.json.bank.gold], [200, 500]);
  r = await call('GET', '/api/bank', null, seller);
  assert.deepEqual([r.json.bank.wood, r.json.bank.gold], [100, 500]);
  assert.equal((await call('POST', '/api/market/accept', { id: offerId }, buyer)).status, 404); // already taken
  r = await call('POST', '/api/market/offer', { give: { res: 'wood', n: 50 }, want: { res: 'stone', n: 50 } }, seller);
  r = await call('POST', '/api/market/cancel', { id: r.json.id }, seller);
  assert.equal(r.json.bank.wood, 100);
});

test('direct trade: only the chosen player can accept or decline', async () => {
  const a = initData({ id: 621, first_name: 'Ari' }), b = initData({ id: 622, first_name: 'Bel' }), c = initData({ id: 623, first_name: 'Cid' });
  await call('GET', '/api/me', null, b); await call('GET', '/api/me', null, c);
  await call('POST', '/api/bank/deposit', { res: 'iron', amount: 40 }, a);
  await call('POST', '/api/bank/deposit', { res: 'stone', amount: 100 }, b);
  await call('POST', '/api/bank/deposit', { res: 'stone', amount: 100 }, c);
  assert.equal((await call('POST', '/api/market/offer', { give: { res: 'iron', n: 10 }, want: { res: 'stone', n: 30 }, to: '999999' }, a)).status, 400);
  const id = (await call('POST', '/api/market/offer', { give: { res: 'iron', n: 10 }, want: { res: 'stone', n: 30 }, to: '622' }, a)).json.id;
  assert.ok(!(await call('GET', '/api/market', null, c)).json.public.some(o => o.id === id), 'direct offers are not public');
  assert.ok((await call('GET', '/api/market', null, b)).json.forMe.some(o => o.id === id));
  assert.equal((await call('POST', '/api/market/accept', { id }, c)).status, 403);
  const r = await call('POST', '/api/market/accept', { id }, b);
  assert.deepEqual([r.json.bank.iron, r.json.bank.stone], [10, 70]);
});

test('bases: list and public profile come from cloud saves', async () => {
  const g = initData({ id: 631, first_name: 'Gil' }), h = initData({ id: 632, first_name: 'Hal' });
  await call('PUT', '/api/save', { data: JSON.stringify({ level: 12, cls: 'guardian', buildings: { market: 3, vault: 1 }, stats: { best: 9 } }), savedAt: Date.now() }, g);
  let r = await call('GET', '/api/bases', null, h);
  const gil = r.json.bases.find(x => x.id === '631');
  assert.deepEqual([gil.name, gil.level, gil.cls, gil.buildings.market], ['Gil', 12, 'guardian', 3]);
  r = await call('GET', '/api/base/631', null, h);
  assert.equal(r.json.buildings.vault, 1);
  assert.equal((await call('GET', '/api/base/abc', null, h)).status, 404);
});
