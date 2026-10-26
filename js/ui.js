'use strict';
// DOM menus: HUD, inventory/equipment/attributes, base (buildings / shop / stash / workshop), skills, classes, perks, death.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const QUICK = ['btnDash', 'btnHp', 'btnMp', 'btnAbility'];

const UI = {
  open: null, homeTab: 'base', sel: null, clsNew: false,

  init() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el || QUICK.includes(el.id)) return;
      Sfx.unlock();
      this.act(el.dataset.act, el.dataset);
    });
    // in-game quick buttons react on pointerdown for responsiveness
    for (const id of QUICK) {
      $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Sfx.unlock(); this.act($(id).dataset.act); });
    }
    $('modal').addEventListener('click', e => { if (e.target.id === 'modal' && this.closable) this.close(); });
  },

  // ---------- generic ----------
  show(name, html, closable = true) {
    this.open = name; this.closable = closable; G.paused = true;
    Input.left = Input.right = null; Input.mouse.down = false;
    $('panel').innerHTML = html; $('modal').classList.remove('hidden');
  },
  close() {
    if (this.open === 'perk') return;
    this.open = null; this.sel = null; $('modal').classList.add('hidden'); G.paused = false;
    persist();
    if (G.pendingPerks > 0) this.perkChoice();
  },
  refresh() {
    if (this.open && this[this.open + 'Html']) {
      const sc = $('panel').scrollTop;
      $('panel').innerHTML = this[this.open + 'Html']();
      $('panel').scrollTop = sc;
    }
    if (this.open === 'menu') $('saveCode').value = Save.exportCode(G.save);
    if (this.open === 'map') this.drawMap();
  },
  head(title) { return `<h2><span>${title}</span><button class="x" data-act="close">✕</button></h2>`; },
  wallet() {
    const S = G.save, r = S.run;
    return `<div class="wallet"><span>🪙 ${U.fmt(S.gold)}${r.gold ? ` <small class="muted">(+${U.fmt(r.gold)} ${t('carried')})</small>` : ''}</span><span>⚙️ ${U.fmt(S.scrap)}${r.scrap ? ` <small class="muted">(+${r.scrap})</small>` : ''}</span><span style="color:#b388ff">💎 ${U.fmt(S.gems)}</span></div>${this.resHtml(S.res, r.res)}`;
  },
  cls() { return CLASS_BY_ID[G.save.cls] || CLASSES[0]; },
  // costs in gold, scrap and resources
  canPay(c) { const S = G.save; return S.gold >= (c.gold || 0) && S.scrap >= (c.scrap || 0) && RES_IDS.every(k => S.res[k] >= (c[k] || 0)); },
  pay(c) { const S = G.save; S.gold -= c.gold || 0; S.scrap -= c.scrap || 0; for (const k of RES_IDS) S.res[k] -= c[k] || 0; },
  costHtml(c) {
    const S = G.save, part = (ok, ic, n) => `<span class="cst${ok ? '' : ' no'}">${ic}${U.fmt(n)}</span>`;
    return `<span class="cost">${part(S.gold >= c.gold, '🪙', c.gold)}${part(S.scrap >= c.scrap, '⚙️', c.scrap)}${RES_IDS.filter(k => c[k]).map(k => part(S.res[k] >= c[k], `<img src="${Art.resIcon(k)}" alt="">`, c[k])).join('')}</span>`;
  },
  resHtml(res, carried) {
    return `<div class="resline">${RES_IDS.map(k => `<span title="${t(RES_BY_ID[k].name)}"><img src="${Art.resIcon(k)}" alt="">${U.fmt(res[k])}${carried && carried[k] ? `<small> +${carried[k]}</small>` : ''}</span>`).join('')}</div>`;
  },

  toast(msg, color) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = msg; if (color) d.style.color = color;
    const box = $('toasts'); box.appendChild(d);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.remove(), 2700);
  },
  banner(big, small = '') {
    const b = $('banner');
    b.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  },

  hud() {
    const S = G.save, r = S.run, p = G.p, st = G.st, ab = this.cls().ability;
    $('hpFill').style.width = (100 * Math.max(0, p.hp) / st.maxHp) + '%';
    $('hpText').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${st.maxHp}`;
    $('mpFill').style.width = (100 * p.mp / st.maxMp) + '%';
    $('mpText').textContent = `${Math.floor(p.mp)} / ${st.maxMp}`;
    $('xpFill').style.width = (100 * S.xp / xpNeed(S.level)) + '%';
    $('xpText').textContent = t('Level {n}', { n: S.level });
    $('rankFill').style.width = (100 * r.rxp / rankNeed(r.rank)) + '%';
    $('rankText').textContent = t('Rank {n} · next perk', { n: r.rank });
    $('goldTxt').textContent = G.atHome ? U.fmt(S.gold) : U.fmt(r.gold);
    $('scrapTxt').textContent = G.atHome ? U.fmt(S.scrap) : U.fmt(r.scrap);
    const rr = G.atHome ? S.res : r.res, rk = RES_IDS.map(k => rr[k]).join(',');
    if (rk !== this.lastRes) { this.lastRes = rk; $('resRow').innerHTML = RES_IDS.map(k => `<span><img src="${Art.resIcon(k)}" alt="">${U.fmt(rr[k])}</span>`).join(''); }
    $('shardRow').style.display = Net.on && Net.w ? '' : 'none';
    if (Net.w) $('shardTxt').textContent = U.fmt(Net.w.shards);
    const zl = $('zoneLbl');
    if (G.atHome) { zl.textContent = t('🏠 Safe base'); zl.style.color = ''; }
    else {
      const tier = tierOf(G.lastZone), hard = recLevel(G.lastZone) > S.level + 3;
      zl.textContent = (hard ? '⚠️ ' : '') + t('Zone {z} · {t}', { z: G.lastZone, t: tier.name }); zl.style.color = hard ? '#ff8a80' : tier.color;
    }
    $('spBadge').textContent = S.sp + S.ap > 0 ? S.sp + S.ap : '';
    $('hpCount').textContent = potionCount('hp');
    $('mpCount').textContent = potionCount('mp');
    $('abIcon').textContent = ab.icon; $('abCost').textContent = ab.mana;
    $('abCd').style.height = (100 * G.abCd / ab.cd) + '%';
    $('btnAbility').classList.toggle('nomana', p.mp < ab.mana);
    $('btnDash').classList.toggle('cd', p.dashCd > 0);
    $('btnHome').classList.toggle('show', G.atHome);
    const rc = $('btnRecall');
    rc.classList.toggle('show', !G.atHome);
    if (!G.atHome) {
      const c = recallCost();
      $('recallLbl').textContent = G.recallT > 0 ? '🏠 …' : `🏠 🪙${U.fmt(c)}`;
      rc.classList.toggle('poor', r.gold + S.gold < c);
    }
    const qr = Quests.readyCount();
    $('homeLbl').textContent = G.visit ? t('🏠 Return home') : G.npc ? t('{i} Talk', { i: G.npc.icon }) : t('🏠 Base') + (qr ? ` · 📜${qr}` : '');
    $('btnChat').style.display = Mp.on ? '' : 'none';
    if (G.visit) { zl.textContent = t('🏰 {n}\'s base', { n: G.visit.name }); zl.style.color = '#b388ff'; }
    const R = S.realm, left = Realm.timeLeft(), rl = $('realmLbl');
    rl.textContent = `🌀 ${R.name} · ${U.time(left)}`; rl.classList.toggle('closing', Realm.closing());
    const q = S.quests.find(x => !x.done);
    $('questTrk').textContent = qr ? (qr === 1 ? t('📜 1 quest ready to claim at base') : t('📜 {n} quests ready to claim at base', { n: qr })) : q ? `${Quests.icon(q)} ${Quests.text(q)} · ${U.fmt(q.prog)}/${U.fmt(q.target)}` : '';
  },

  // ---------- item locations ----------
  getAt(w, k) {
    const S = G.save;
    if (w === 'inv') return S.inv[k];
    if (w === 'stash') return S.stash[k];
    if (w === 'eq') return k === 'weapon' ? S.equipped : S.gear[k];
    if (w === 'shop') return G.shop && G.shop.items[k];
    return null;
  },
  setAt(w, k, v) {
    const S = G.save;
    if (w === 'inv') S.inv[k] = v;
    else if (w === 'stash') { if (v) S.stash[k] = v; else S.stash.splice(k, 1); }
    else if (w === 'eq') { if (k === 'weapon') S.equipped = v; else S.gear[k] = v; }
  },
  findUid(uid) {
    const S = G.save;
    if (S.equipped.uid === uid) return S.equipped;
    for (const sl of GEAR_SLOTS) if (S.gear[sl] && S.gear[sl].uid === uid) return S.gear[sl];
    return S.inv.find(i => i && i.uid === uid) || S.stash.find(i => i.uid === uid);
  },

  // ---------- actions ----------
  act(a, d = {}) {
    const S = G.save, st = G.st;
    const sel = this.sel, it = sel ? this.getAt(sel.w, sel.k) : null;
    switch (a) {
      case 'close': this.close(); return;
      case 'dash': dash(); return;
      case 'hp': usePotion('hp'); return;
      case 'mp': usePotion('mp'); return;
      case 'ability': useAbility(); return;
      case 'menu': persist(); this.show('menu', this.menuHtml()); $('saveCode').value = Save.exportCode(S); return;
      case 'bag': this.sel = null; this.show('bag', this.bagHtml()); return;
      case 'skills': this.show('skills', this.skillsHtml()); return;
      case 'home':
        if (G.visit) { endVisit(); return; }
        if (!G.atHome) return;
        this.sel = null;
        if (G.npc) return this.npc(G.npc.id);
        this.show('home', this.homeHtml()); return;
      case 'recall': startRecall(); return;
      case 'travel': Explore.startTeleport(d.id); return;
      case 'map': this.show('map', this.mapHtml()); this.drawMap(); return;
      case 'quests': this.show('quests', this.questsHtml()); return;
      case 'gemshop': this.show('gems', this.gemsHtml()); return;
      case 'shards':
        this.board = null; this.show('shards', this.shardsHtml());
        if (Net.on) Net.leaderboard().then(b => { this.board = b; if (this.open === 'shards') this.refresh(); }).catch(() => {});
        return;
      case 'tonconnect': Ton.connect(); return;
      case 'chat': this.show('chat', this.chatHtml()); this.updateChatBox(); setTimeout(() => { const i = $('chatIn'); if (i) i.focus(); }, 50); return;
      case 'sendchat': { const i = $('chatIn'); if (i && i.value.trim()) { Mp.sendChat(i.value); i.value = ''; } return; }
      case 'trade': this.tradeTab = this.tradeTab || 'bank'; this.show('trade', this.tradeHtml()); this.loadMarket(); return;
      case 'ttab': this.tradeTab = d.tab; this.refresh(); this.loadMarket(); return;
      case 'dep': case 'wd': this.bankMove(a, d.res); return;
      case 'offer': this.postOffer(); return;
      case 'accept': case 'decline': case 'cancel': this.offerAction(a === 'accept' ? 'accept' : 'cancel', d.id); return;
      case 'gate': this.bases = null; this.show('gate', this.gateHtml()); if (Net.on) Net.call('GET', '/api/bases').then(r => { this.bases = r.bases; if (this.open === 'gate') this.refresh(); }).catch(() => {}); return;
      case 'visit': startVisit(d.id); return;
      case 'tondisconnect': Ton.disconnect().then(() => this.refresh()); return;
      case 'claim': Quests.claim(d.id); break;
      case 'qreroll': Quests.reroll(d.id); break;
      case 'gempack': {
        const pk = GEM_PACKS[+d.i]; if (!pk) return;
        if (Net.canBuy) { Net.buy(pk.id).catch(e => this.toast('⚠️ ' + e.message, '#ff8a80')); return; }
        if (!(window.GAME_CONFIG || {}).devFreeGems) { this.toast(t('Gems can be bought in the Telegram app'), '#b388ff'); return; }
        S.gems += pk.gems; this.toast(t('💎 +{n} gems (dev mode, no charge)', { n: pk.gems }), '#b388ff');
        break;
      }
      case 'buychest': case 'gemgold': case 'gempots': {
        const item = { buychest: 'chest', gemgold: 'gold', gempots: 'pots' }[a];
        const cost = { chest: this.chestPrice(), gold: 30, pots: 20 }[item];
        if (S.gems < cost || (item === 'chest' && S.vaultChests >= MAX_CHESTS)) return;
        if (item === 'pots' && !S.inv.some(x => !x || x.kind === 'potion') && S.stash.length >= st.stashCap) { this.toast(t('No room for potions')); return; }
        const grant = () => {
          if (item === 'chest') { Sfx.play('level'); this.toast(t('🗝️ New vault chest unlocked (+8 slots)'), '#b388ff'); }
          if (item === 'gold') { const g = 500 * Math.max(1, S.stats.best); S.gold += g; Sfx.play('buy'); this.toast(t('🪙 +{g} gold', { g: U.fmt(g) })); }
          if (item === 'pots') { for (const p of ['hp', 'mp']) { const pot = makePotion(p, 4); if (!invAdd(pot)) S.stash.push(pot); } Sfx.play('buy'); this.toast(t('🧪 +4 health and +4 mana potions')); }
          persist(); this.refresh();
        };
        if (Net.on) { Net.spend(item).then(grant).catch(e => this.toast('⚠️ ' + e.message, '#ff8a80')); return; }
        S.gems -= cost; if (item === 'chest') { S.vaultChests++; recalc(); }
        grant();
        return;
      }
      case 'tab': this.homeTab = d.tab; this.sel = null; break;
      case 'sel': {
        const k = d.w === 'eq' ? d.k : +d.k;
        this.sel = sel && sel.w === d.w && sel.k === k ? null : { w: d.w, k };
        break;
      }
      case 'equip': {
        if (!it || !sel || sel.w === 'eq') return;
        if (it.kind === 'potion') { usePotion(it.p); break; }
        if (isWeapon(it)) { const old = S.equipped; S.equipped = it; this.setAt(sel.w, sel.k, old); }
        else { const old = S.gear[it.slot]; S.gear[it.slot] = it; this.setAt(sel.w, sel.k, old || null); }
        this.sel = null; recalc(); Sfx.play('pick');
        break;
      }
      case 'unequip': {
        if (!it || !sel || sel.w !== 'eq' || sel.k === 'weapon') return;
        const i = S.inv.indexOf(null);
        if (i < 0) { this.toast(t('Inventory full')); return; }
        S.inv[i] = it; S.gear[sel.k] = null; this.sel = null; recalc();
        break;
      }
      case 'drop': {
        if (!it || !sel || sel.w !== 'inv' || G.atHome) return;
        S.inv[sel.k] = null; this.sel = null;
        if (it.kind === 'potion') for (let i = 0; i < it.n; i++) { addPickup('potion', G.p.x, G.p.y, it.p); G.pickups[G.pickups.length - 1].lock = 2.5; }
        else { addPickup('weapon', G.p.x, G.p.y, 0, it); G.pickups[G.pickups.length - 1].lock = 2.5; }
        break;
      }
      case 'sell': {
        if (!it || !sel || !G.atHome || sel.w === 'eq' || sel.w === 'shop') return;
        const v = this.sellPrice(it); this.setAt(sel.w, sel.k, null); this.sel = null;
        S.gold += v; Sfx.play('buy'); this.toast(t('Sold for 🪙{v}', { v }));
        break;
      }
      case 'salvage': {
        const target = d.uid ? this.findUid(d.uid) : it;
        if (!target || target.kind === 'potion' || !G.atHome) return;
        if (target === S.equipped || GEAR_SLOTS.some(s => S.gear[s] === target)) return;
        let i = S.inv.indexOf(target); if (i >= 0) S.inv[i] = null;
        i = S.stash.indexOf(target); if (i >= 0) S.stash.splice(i, 1);
        const v = salvageValue(target); S.scrap += v; this.sel = null; Sfx.play('buy'); this.toast(t('Salvaged ⚙️{v}', { v }));
        break;
      }
      case 'tostash': {
        if (!it || !sel || sel.w !== 'inv') return;
        if (S.stash.length >= st.stashCap) { this.toast(t('Stash full — upgrade the Armory')); return; }
        S.stash.push(it); S.inv[sel.k] = null; this.sel = null;
        break;
      }
      case 'take': {
        if (!it || !sel || sel.w !== 'stash') return;
        if (S.inv.indexOf(null) < 0) { this.toast(t('Inventory full')); return; }
        S.stash.splice(sel.k, 1); invAdd(it); this.sel = null;
        break;
      }
      case 'upg': {
        const w = this.findUid(d.uid); if (!w) return;
        const c = upgradeCost(w);
        if (w.upg >= S.buildings.workshop * 2 || S.gold < c.gold || S.scrap < c.scrap) return;
        S.gold -= c.gold; S.scrap -= c.scrap; w.upg++; recalc(); Sfx.play('level');
        break;
      }
      case 'attr': {
        if (S.ap <= 0) return;
        const hpPct = G.p.hp / st.maxHp;
        S.ap--; S.attrs[d.id]++; recalc(); G.p.hp = hpPct * G.st.maxHp; Sfx.play('buy');
        break;
      }
      case 'skill': {
        if (S.sp <= 0 || S.skills[d.id] >= skillMax(SKILLS.find(s => s.id === d.id))) return;
        S.sp--; S.skills[d.id]++; recalc(); Sfx.play('buy');
        break;
      }
      case 'build': {
        const l = S.buildings[d.id], c = buildCost(l);
        if (l >= BUILD_MAX || !this.canPay(c)) return;
        this.pay(c); S.buildings[d.id]++;
        recalc(); if (d.id === 'market') rollShop();
        Sfx.play('level');
        this.toast(t('{b} upgraded!', { b: t(BUILDINGS.find(b => b.id === d.id).name) }), '#ffe082');
        break;
      }
      case 'buy': {
        const w = G.shop.items[+d.i]; if (!w) return;
        const price = this.buyPrice(w);
        if (S.gold < price) return;
        if (S.inv.indexOf(null) < 0 && S.stash.length >= st.stashCap) { this.toast(t('Inventory and stash full')); return; }
        S.gold -= price; if (!invAdd(w)) S.stash.push(w);
        G.shop.items.splice(+d.i, 1); Sfx.play('buy');
        break;
      }
      case 'buypot': {
        const price = this.potPrice();
        if (S.gold < price) return;
        if (!invAdd(makePotion(d.p))) { this.toast(t('Inventory full')); return; }
        S.gold -= price; Sfx.play('buy');
        break;
      }
      case 'reroll': if (S.gold >= 25) { S.gold -= 25; rollShop(); Sfx.play('buy'); } break;
      case 'perk': this.pickPerk(+d.i); return;
      case 'changecls': this.classPick(false); return;
      case 'pickcls': {
        const c = CLASS_BY_ID[d.id]; if (!c) return;
        S.cls = c.id;
        if (this.clsNew && S.level === 1 && S.equipped.level === 1 && S.equipped.upg === 0) S.equipped = makeWeapon(c.start, 0, 1);
        recalc(); G.p.hp = G.st.maxHp; G.p.mp = G.st.maxMp;
        Sfx.play('level'); this.toast(t('{i} You are a {c}', { i: c.icon, c: t(c.name) }), '#ffe082');
        this.open = null; this.close();
        return;
      }
      case 'autoaim': S.settings.autoAim = !S.settings.autoAim; break;
      case 'sound': S.settings.sound = Sfx.on = !S.settings.sound; break;
      case 'lang': S.settings.lang = I18N.lang = I18N.lang === 'pt' ? 'en' : 'pt'; document.documentElement.lang = I18N.lang; break;
      case 'copysave': {
        persist();
        const ta = $('saveCode'); ta.value = Save.exportCode(G.save);
        const fallback = () => { ta.focus(); ta.select(); try { document.execCommand('copy'); this.toast(t('Code copied')); } catch (e) { this.toast(t('Select the code and copy it')); } };
        if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => this.toast(t('Code copied ✔')), fallback); else fallback();
        return;
      }
      case 'loadsave': {
        let s;
        try { s = Save.importCode($('saveCode').value); } catch (e) { this.toast(t('That code is not valid'), '#ff8a80'); return; }
        if (!confirm(t('Load this save (Level {l}, 🪙{g})? Current progress will be replaced.', { l: s.level, g: U.fmt(s.gold) }))) return;
        G.noSave = true; Save.write(s); location.reload();
        return;
      }
      case 'wipe':
        if (confirm(t('Erase ALL progress (base, skills, items)?'))) { G.noSave = true; Save.wipe(); location.reload(); }
        return;
      case 'rise': this.open = null; this.close(); return;
      case 'start':
        S.seenIntro = true; this.open = null; this.close();
        if (!S.cls) this.classPick(true);
        return;
    }
    persist();
    this.refresh();
  },

  sellPrice: it => Math.round(itemValue(it) * .4 * (1 + .06 * G.st.haggle)),
  buyPrice: it => Math.round(itemValue(it) * 1.5 * (1 - .06 * G.st.haggle)),
  potPrice: () => Math.round(30 * (1 - .06 * G.st.haggle)),

  // ---------- item rendering ----------
  slot(it, w, k, ph = '') {
    const sel = this.sel && this.sel.w === w && this.sel.k === k ? ' sel' : '';
    if (!it) return `<button class="slot empty${sel}" data-act="sel" data-w="${w}" data-k="${k}">${ph ? `<span class="ph">${ph}</span>` : ''}</button>`;
    const col = it.kind === 'potion' ? POTIONS[it.p].color : RARITIES[it.rarity].color;
    const inner = `<img src="${Art.icon(it)}" alt="">`, leg = it.kind !== 'potion' && it.rarity >= 4 ? ' leg' : '';
    const badge = it.kind === 'potion' ? `<b>${it.n}</b>` : `<small>${t('Lv{n}', { n: it.level })}</small>${it.upg ? `<b style="color:${col}">+${it.upg}</b>` : ''}`;
    return `<button class="slot${sel}${leg}" style="--rc:${col}" data-act="sel" data-w="${w}" data-k="${k}">${inner}${badge}</button>`;
  },

  icard(it, buttons = '') {
    if (it.kind === 'potion') {
      const P = POTIONS[it.p];
      return `<div class="card" style="border-color:${P.color}55"><div class="cn" style="color:${P.color}"><img class="cardicon" src="${Art.icon(it)}" alt="">${t(P.name)} ×${it.n}</div><div class="cs">${t(P.desc)}</div>${buttons ? `<div class="cb">${buttons}</div>` : ''}</div>`;
    }
    if (isWeapon(it)) return this.wcard(it, buttons);
    const r = RARITIES[it.rarity], cur = G.save.gear[it.slot], av = armorValue(it);
    const cmp = !cur ? `<span class="up">${t('NEW')}</span>` : cur === it ? '' : av > armorValue(cur) ? `<span class="up">▲${av - armorValue(cur)}</span>` : av < armorValue(cur) ? `<span class="down">▼${armorValue(cur) - av}</span>` : '';
    return `<div class="card" style="border-color:${r.color}55">
      <div class="cn" style="color:${r.color}"><img class="cardicon" src="${Art.icon(it)}" alt="">${itemName(it)} <small>${t('Lv {n}', { n: it.level })}</small></div>
      <div class="cs">${t('🛡️ Armor')} <b>${av}</b> ${cmp}</div>
      ${Object.entries(it.stats).map(([k, v]) => `<div class="af">◆ ${statLabel(k, v)}</div>`).join('')}
      ${buttons ? `<div class="cb">${buttons}</div>` : ''}</div>`;
  },

  wcard(w, buttons) {
    const s = weaponStats(w), r = RARITIES[w.rarity], dps = weaponDps(w), eq = weaponDps(G.save.equipped);
    const cmp = w === G.save.equipped ? '' : dps > eq ? `<span class="up">▲${Math.round(dps - eq)}</span>` : dps < eq ? `<span class="down">▼${Math.round(eq - dps)}</span>` : '';
    const n = s.bullets + s.multi;
    return `<div class="card" style="border-color:${r.color}55">
      <div class="cn" style="color:${r.color}"><img class="cardicon" src="${Art.icon(w)}" alt="">${weaponName(w)} <small>${t('Lv {n}', { n: w.level })}</small></div>
      <div class="cs">${t('DMG')} ${Math.round(s.dmg)}${n > 1 ? '×' + n : ''} · ${s.rate.toFixed(1)}/s · <b>DPS ${Math.round(dps)}</b> ${cmp}</div>
      ${w.affixes.map(a => `<div class="af">◆ ${AFFIX_BY_ID[a.id].label(a.v)}</div>`).join('')}
      ${buttons ? `<div class="cb">${buttons}</div>` : ''}</div>`;
  },

  // card + action buttons for the selected slot
  detail() {
    const sel = this.sel; if (!sel) return `<p class="muted">${t('Tap a square to see the item.')}</p>`;
    const it = this.getAt(sel.w, sel.k);
    if (!it) return '';
    const home = G.atHome, b = [];
    if (sel.w === 'eq') { if (sel.k !== 'weapon') b.push(`<button class="btn alt" data-act="unequip">${t('Unequip')}</button>`); }
    else if (it.kind === 'potion') {
      if (sel.w === 'inv') b.push(`<button class="btn good" data-act="equip">${t('Use')}</button>`);
    } else b.push(`<button class="btn" data-act="equip">${t('Equip')}</button>`);
    if (sel.w === 'inv') {
      if (home) { b.push(`<button class="btn alt" data-act="tostash">${t('To stash')}</button>`); }
      else b.push(`<button class="btn alt" data-act="drop">${t('Drop')}</button>`);
    }
    if (sel.w === 'stash') b.push(`<button class="btn alt" data-act="take">${t('Take')}</button>`);
    if (home && (sel.w === 'inv' || sel.w === 'stash')) {
      b.push(`<button class="btn good" data-act="sell">${t('Sell 🪙{v}', { v: this.sellPrice(it) })}</button>`);
      if (it.kind !== 'potion') b.push(`<button class="btn alt" data-act="salvage">${t('Salvage ⚙️{v}', { v: salvageValue(it) })}</button>`);
    }
    return `<div class="detail">${this.icard(it, b.join(''))}</div>`;
  },

  equipBlock() {
    const S = G.save;
    return `<h3>${t('Equipment')}</h3>
      <div class="slots eq">${this.slot(S.equipped, 'eq', 'weapon')}${GEAR_SLOTS.map(sl => this.slot(S.gear[sl], 'eq', sl, ARMOR_SLOTS[sl].icon)).join('')}</div>
      <div class="slotlbl"><span>${t('Weapon')}</span>${GEAR_SLOTS.map(sl => `<span>${t(ARMOR_SLOTS[sl].name)}</span>`).join('')}</div>`;
  },
  invBlock() {
    const inv = G.save.inv, used = inv.filter(Boolean).length;
    return `<h3>${t('Bag {a}/{b}', { a: used, b: INV_SIZE })}</h3><div class="slots">${inv.map((it, i) => this.slot(it, 'inv', i)).join('')}</div>`;
  },

  // ---------- panels ----------
  menuHtml() {
    const S = G.save, st = S.stats, onoff = v => `<button class="btn ${v ? 'good' : 'alt'}"`;
    return `${this.head(t('Paused'))}
      <div class="stats">
        <div>${t('Level')}<b>${S.level}</b></div><div>${t('Best zone')}<b>${st.best}</b></div>
        <div>${t('Best tier')}<b style="font-size:15px">${tierOf(st.best).name}</b></div><div>${t('Total kills')}<b>${U.fmt(st.kills)}</b></div><div>${t('Warlords slain')}<b>${st.bosses}</b></div>
        <div>${t('Runs')}<b>${st.runs}</b></div><div>${t('This run')}<b>${U.time(S.run.time)}</b></div>
      </div>
      ${S.run.perks.length ? `<h3>${t('Run perks')}</h3><div class="chips">${S.run.perks.map(id => { const p = PERKS.find(x => x.id === id); return `<span>${p.icon} ${t(p.name)}</span>`; }).join('')}</div>` : ''}
      <h3>${t('Settings')}</h3>
      <div class="row"><div class="tx"><b>🌐 ${t('Language')}</b></div><button class="btn" data-act="lang">${I18N.lang === 'pt' ? '🇵🇹 Português' : '🇬🇧 English'}</button></div>
      <div class="row"><div class="tx"><b>${t('Auto-aim')}</b><div>${t('Shoot nearest enemy automatically when not aiming')}</div></div>${onoff(S.settings.autoAim)} data-act="autoaim">${t(S.settings.autoAim ? 'ON' : 'OFF')}</button></div>
      <div class="row"><div class="tx"><b>${t('Sound')}</b></div>${onoff(S.settings.sound)} data-act="sound">${t(S.settings.sound ? 'ON' : 'OFF')}</button></div>
      <h3>${t('Save backup')}</h3>
      <p class="muted">${t('Progress saves automatically on this device. Copy this code somewhere safe (e.g. Notes) to restore it later or on another device.')}${Net.on ? ' ' + t('Progress is also saved to the cloud with your Telegram account.') : ''}</p>
      <textarea id="saveCode" spellcheck="false"></textarea>
      <div class="cb"><button class="btn" data-act="copysave">${t('📋 Copy code')}</button><button class="btn alt" data-act="loadsave">${t('📥 Load pasted code')}</button></div>
      <h3>${t('How to play')}</h3>
      <p>${this.helpText()}</p>
      <button class="btn big" data-act="close">${t('▶ Resume')}</button>
      <button class="btn big warn" data-act="wipe">${t('Erase save')}</button>`;
  },

  helpText() {
    if (I18N.lang === 'pt') return t('HELP');
    return `<b>Left thumb</b> moves, <b>right thumb</b> aims &amp; fires (or let auto-aim do it). 💨 dashes, 🏠 returns you to base (costs more gold the further out you are, interrupted if you get hit) and leaves a 🌀 portal at base that takes you back to where you were. Tap the minimap for the 🗺️ world map: it only shows what you have explored. Walk close to an ancient 🌀 waypoint to wake it up, then pay gold to travel to it from the map. ✨ uses your class ability (costs mana), ❤️/🔷 drink health and mana potions.
      The further you roam from base, the higher the <b>zone level</b>: tougher enemies, better loot. The world is endless: every 5 zones is a new danger tier (Outskirts → Badlands → Deadlands → Inferno → The Abyss…) with new enemy types.
      Shoot trees and rocks (or stand still next to them) to gather 🪵 wood, 🪨 stone and ⛓️ iron; 💠 crystal drops from elites and bosses. Buildings need resources.
      In the Telegram app you see other players in your realm, 💬 chat, trade at ⚖️ Trader Oto and visit other bases through 🌀 Gatekeeper Ilsa.
      Enemies drop weapons and armor (helmet, armor, pants, boots) with bonus attributes. Each level gives attribute points (🎒) and a skill point (⭐).
      Every 15 minutes the <b>realm</b> closes and a new map opens, the same for every player (you are pulled back to base safely). Clear 3 outposts to awaken the realm's 👹 <b>Overlord</b>. Talk to NPCs at base for <b>quests</b>, 💎 gems and vault chests.
      Clear red <b>outposts</b> by killing their 👑 Warlord. Gold and scrap you carry are only safe once you <b>return to base</b>.
      Dying ends the run: you lose carried loot, the gear in your bag and run perks. Equipped items, potions, level, skills, base and stash remain.
      <br><span class="muted">Desktop: WASD + mouse, Space dash, F ability, H return to base, M map, Q/1 health potion, R/2 mana potion, E base, B bag, K skills.</span>`;
  },

  intro() {
    this.show('intro', this.introHtml(), false);
  },
  introHtml() {
    return `<h2>⚔️ Realms of Tyra <button class="btn alt" data-act="lang">${I18N.lang === 'pt' ? '🇵🇹 PT' : '🇬🇧 EN'}</button></h2>
      <p>${t('An open-world roguelike shooter. Pick a class, venture out from your base, survive, loot and level up.')}</p>
      <p>${this.helpText()}</p>
      <button class="btn big good" data-act="start">${t('Start')}</button>`;
  },

  classPick(isNew) {
    this.clsNew = isNew;
    this.show('cls', this.clsHtml(), !isNew);
  },
  clsHtml() {
    const S = G.save;
    return `${this.clsNew ? `<h2>${t('Choose your class')}</h2>` : this.head(t('Change class'))}
      ${this.clsNew ? '' : `<p class="muted">${t('Switching is free. Your items, level and spent attribute points stay.')}</p>`}
      <div class="classes">${CLASSES.map(c => `<button class="cls${S.cls === c.id ? ' on' : ''}" data-act="pickcls" data-id="${c.id}">
        <span class="ic">${c.icon}</span><div><b>${t(c.name)}</b><div class="d">${t(c.desc)}</div>
        <div class="ab">${c.ability.icon} ${t(c.ability.name)} (${t('{m} mana', { m: c.ability.mana })}): ${t(c.ability.desc)}</div>
        <div class="at">${ATTRS.map(a => `${t(a.short)} ${c.base[a.id]}`).join(' · ')} · ${t('starts with {w}', { w: t(WEAPON_TYPES[c.start].name) })}</div></div></button>`).join('')}</div>`;
  },

  bagHtml() {
    const S = G.save, st = G.st, A = st.attrs, c = this.cls();
    return `${this.head(t('🎒 Inventory'))}
      ${this.wallet()}
      <div class="row"><div class="ic">${c.icon}</div><div class="tx"><b>${t(c.name)}</b> <span class="muted">${t('Lv {n}', { n: S.level })}</span><div>${c.ability.icon} ${t(c.ability.name)}: ${t(c.ability.desc)}</div></div></div>
      ${this.equipBlock()}
      ${this.invBlock()}
      ${this.detail()}
      ${G.atHome ? '' : `<p class="muted">${t('⚠️ Gear in your bag is lost if you die (potions are kept). Equipped items are always safe.')}</p>`}
      <h3>${t('Attributes')} ${S.ap ? `<span style="color:#66ff88">${t('· {n} points to spend', { n: S.ap })}</span>` : ''}</h3>
      ${ATTRS.map(a => {
        const gear = GEAR_SLOTS.reduce((n, sl) => n + ((S.gear[sl] && S.gear[sl].stats[a.id]) || 0), 0);
        return `<div class="attr"><span>${a.icon}</span><div class="nm"><b>${t(a.name)}</b><div>${t(a.desc)}</div></div>
          <div class="val">${A[a.id]}${gear ? ` <small>(+${gear})</small>` : ''}</div>
          <button class="btn" data-act="attr" data-id="${a.id}" ${S.ap > 0 ? '' : 'disabled'}>+</button></div>`;
      }).join('')}
      <h3>${t('Stats')}</h3>
      <div class="stats">
        <div>${t('Max HP')}<b>${st.maxHp}</b></div><div>${t('Max mana')}<b>${st.maxMp}</b></div>
        <div>${t('Armor')}<b>${Math.round(st.armor)} <small style="font-size:11px">${t('(-{n}% dmg)', { n: Math.round(st.dr * 100) })}</small></b></div><div>${t('Damage')}<b>×${st.dmgMul.toFixed(2)}</b></div>
        <div>${t('Fire rate')}<b>×${st.rateMul.toFixed(2)}</b></div><div>${t('Crit')}<b>${Math.round(st.crit * 100)}%</b></div>
        <div>${t('Speed')}<b>${Math.round(st.spd)}</b></div><div>${t('Ability power')}<b>×${st.abPower.toFixed(2)}</b></div>
        <div>${t('HP regen')}<b>${st.regen.toFixed(1)}/s</b></div><div>${t('Mana regen')}<b>${st.mpRegen.toFixed(1)}/s</b></div>
      </div>`;
  },

  skillsHtml() {
    const S = G.save;
    return `${this.head(t('⭐ Skills'))}
      <p>${t('Skill points:')} <b style="color:#ffe082">${S.sp}</b> <span class="muted">${t('· earn 1 per level · permanent')}</span></p>
      ${S.ap ? `<p style="color:#66ff88">${t('You also have {n} attribute points: spend them in 🎒 Inventory.', { n: S.ap })}</p>` : ''}
      ${SKILLS.map(sk => {
        const l = S.skills[sk.id];
        const mx = skillMax(sk), pips = sk.infinite ? `<span class="pips" style="color:#ffca28;font-size:12px">${t('Rank {n}', { n: l })}</span>` : `<span class="pips">${'<i class="on"></i>'.repeat(l)}${'<i></i>'.repeat(SKILL_MAX - l)}</span>`;
        return `<div class="row"><div class="ic">${sk.icon}</div><div class="tx"><b>${t(sk.name)}</b>${pips}<div>${t(sk.desc)}${sk.infinite ? '' : t(' per rank')}</div></div>
          <button class="btn" data-act="skill" data-id="${sk.id}" ${S.sp > 0 && l < mx ? '' : 'disabled'}>${l >= mx ? t('MAX') : '+1'}</button></div>`;
      }).join('')}`;
  },

  homeHtml() {
    const tabs = [['base', t('🏗️ Base')], ['shop', t('🏪 Shop')], ['stash', t('📦 Stash')], ['work', t('🔧 Workshop')]];
    const body = { base: this.baseTab, shop: this.shopTab, stash: this.stashTab, work: this.workTab }[this.homeTab].call(this);
    return `${this.head(t('🏠 Home Base'))}${this.wallet()}
      <div class="tabs">${tabs.map(([k, n]) => `<button class="${this.homeTab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${n}</button>`).join('')}</div>${body}`;
  },

  baseTab() {
    const S = G.save, c = this.cls();
    return `<div class="row"><div class="ic">${c.icon}</div><div class="tx"><b>${t('Class: {c}', { c: t(c.name) })}</b><div>${c.ability.icon} ${t(c.ability.name)}</div></div><button class="btn alt" data-act="changecls">${t('Change')}</button></div>` +
      BUILDINGS.map(b => {
        const l = S.buildings[b.id], cost = buildCost(l), max = l >= BUILD_MAX, can = !max && this.canPay(cost);
        return `<div class="row"><div class="ic">${b.icon}</div><div class="tx"><b>${t(b.name)}</b><span class="pips">${'<i class="on"></i>'.repeat(l)}${'<i></i>'.repeat(BUILD_MAX - l)}</span>
          <div>${b.desc(l)}</div>${max ? '' : `<div style="color:#9fd">${t('Next: {d}', { d: b.desc(l + 1) })}</div>`}</div>
          <button class="btn ${can ? 'good' : ''}" data-act="build" data-id="${b.id}" ${can ? '' : 'disabled'}>${max ? t('MAX') : this.costHtml(cost)}</button></div>`;
      }).join('');
  },

  shopTab() {
    const S = G.save;
    if (!G.shop) rollShop();
    const pp = this.potPrice();
    return Object.entries(POTIONS).map(([k, P]) => `<div class="row"><div class="ic"><img src="${Art.icon({ kind: 'potion', p: k })}" style="width:34px" alt=""></div><div class="tx"><b>${t(P.name)}</b><div>${t('{d} · you have {n}', { d: t(P.desc), n: potionCount(k) })}</div></div>
        <button class="btn" data-act="buypot" data-p="${k}" ${S.gold >= pp ? '' : 'disabled'}>🪙${pp}</button></div>`).join('') + `
      <h3>${t('Weapons &amp; armor')} <span class="muted">${t('(level {n}, rises with your best zone)', { n: Math.max(1, S.stats.best - 1) })}</span></h3>
      ${G.shop.items.length ? `<div class="grid">${G.shop.items.map((w, i) => {
        const pr = this.buyPrice(w);
        return this.icard(w, `<button class="btn ${S.gold >= pr ? 'good' : ''}" data-act="buy" data-i="${i}" ${S.gold >= pr ? '' : 'disabled'}>${t('Buy 🪙{p}', { p: U.fmt(pr) })}</button>`);
      }).join('')}</div>` : `<p class="muted">${t('Sold out.')}</p>`}
      <button class="btn big alt" data-act="reroll" ${S.gold >= 25 ? '' : 'disabled'}>${t('🔄 New stock (🪙25)')}</button>`;
  },

  stashTab() {
    const S = G.save, cap = Math.max(G.st.stashCap, S.stash.length), cells = i => this.slot(S.stash[i] || null, 'stash', i);
    let html = '', i = 0;
    for (let c = 0; c < S.vaultChests; c++) { html += `<div class="chest"><h4>${t('🗝️ Vault chest {n}', { n: c + 1 })}</h4><div class="slots">`; for (let j = 0; j < 8; j++) html += cells(i++); html += '</div></div>'; }
    if (cap > i) { html += `<div class="chest"><h4>${t('🛡️ Armory rack')}</h4><div class="slots">`; while (i < cap) html += cells(i++); html += '</div></div>'; }
    return `${this.equipBlock()}${this.invBlock()}${this.detail()}
      <h3>${t('Vault {a}/{b}', { a: S.stash.length, b: G.st.stashCap })} <span class="muted">${t('· safe forever')}</span></h3>${html}
      ${S.vaultChests < MAX_CHESTS ? `<button class="btn big alt" data-act="gemshop">${t('🔒 Unlock vault chest {n} (💎{p})', { n: S.vaultChests + 1, p: this.chestPrice() })}</button>` : ''}`;
  },

  workTab() {
    const S = G.save, cap = S.buildings.workshop * 2;
    if (!cap) return `<p>${t('Build the <b>🔧 Workshop</b> (Base tab) to upgrade weapons and armor with gold and scrap.')}</p>`;
    const worn = [S.equipped, ...GEAR_SLOTS.map(s => S.gear[s]).filter(Boolean)];
    const all = [...worn, ...S.inv.filter(i => i && i.kind !== 'potion'), ...S.stash];
    return `<p class="muted">${t('Weapons: +10% damage, +3% fire rate per level. Armor: +10% armor per level. Max +{n} at this Workshop level.', { n: cap })}</p>
      <div class="grid">${all.map(w => {
        const c = upgradeCost(w), can = w.upg < cap && S.gold >= c.gold && S.scrap >= c.scrap;
        const sal = worn.includes(w) ? '' : `<button class="btn alt" data-act="salvage" data-uid="${w.uid}">${t('Salvage ⚙️{v}', { v: salvageValue(w) })}</button>`;
        return this.icard(w, (w.upg >= cap ? `<button class="btn" disabled>${t('MAX')}</button>` :
          `<button class="btn ${can ? 'good' : ''}" data-act="upg" data-uid="${w.uid}" ${can ? '' : 'disabled'}>${t('Upgrade 🪙{g} ⚙️{s}', { g: c.gold, s: c.scrap })}</button>`) + sal);
      }).join('')}</div>`;
  },

  // ---------- chat ----------
  chatLog() {
    const now = Date.now(), recent = Mp.chat.filter(m => now - m.at < 9000).slice(-4);
    $('chatLog').innerHTML = recent.map(m => `<div><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('');
    clearTimeout(this.chatT); if (recent.length) this.chatT = setTimeout(() => this.chatLog(), 3000);
  },
  chatLines() { return Mp.chat.length ? Mp.chat.map(m => `<div class="${m.me ? 'me' : ''}"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('') : `<p class="muted">${t('No messages yet. Say hi!')}</p>`; },
  updateChatBox() { const b = document.querySelector('.chatbox'); if (b) { b.innerHTML = this.chatLines(); b.scrollTop = b.scrollHeight; } },
  chatHtml() {
    const n = Mp.others.size;
    return `${this.head(t('💬 Chat'))}
      <p class="muted">${G.visit || G.atHome ? t('Talking to players in this base.') : t('Talking to everyone in this realm.')} ${t('{n} player(s) nearby.', { n })}</p>
      <div class="chatbox">${this.chatLines()}</div>
      <div class="chatin"><input id="chatIn" maxlength="140" placeholder="${t('Write a message…')}" onkeydown="if(event.key==='Enter'){UI.act('sendchat')}"><button class="btn good" data-act="sendchat">➤</button></div>`;
  },

  // ---------- trading post ----------
  tradeIcon(r) { return r === 'gold' ? '🪙' : `<img src="${Art.resIcon(r)}" alt="" class="ri">`; },
  tradeName(r) { return r === 'gold' ? t('Gold') : t(RES_BY_ID[r].name); },
  localAmount(r) { return r === 'gold' ? G.save.gold : G.save.res[r]; },
  loadMarket() {
    if (!Net.on) return;
    Net.call('GET', '/api/market').then(m => { this.market = m; if (this.open === 'trade') this.refresh(); }).catch(e => this.toast('⚠️ ' + e.message, '#ff8a80'));
  },
  async bankMove(kind, r) {
    const inp = $('amt-' + r), n = Math.floor(+(inp && inp.value));
    if (!(n > 0)) return;
    const S = G.save;
    try {
      if (kind === 'dep') {
        if (this.localAmount(r) < n) { this.toast(t('You do not have that much at your base')); return; }
        const res = await Net.call('POST', '/api/bank/deposit', { res: r, amount: n });
        if (r === 'gold') S.gold -= res.credited; else S.res[r] -= res.credited;
        if (res.credited < n) this.toast(t('Daily deposit limit reached'), '#ffe082');
      } else {
        const res = await Net.call('POST', '/api/bank/withdraw', { res: r, amount: n });
        if (r === 'gold') S.gold += res.withdrawn; else S.res[r] += res.withdrawn;
      }
      Sfx.play('buy'); persist(); this.loadMarket();
    } catch (e) { this.toast('⚠️ ' + e.message, '#ff8a80'); }
  },
  async postOffer() {
    const gr = $('ofGive').value, gn = Math.floor(+$('ofGiveN').value), wr = $('ofWant').value, wn = Math.floor(+$('ofWantN').value), to = $('ofTo').value || null;
    if (!(gn > 0 && wn > 0) || gr === wr) { this.toast(t('Choose two different resources and amounts')); return; }
    try { await Net.call('POST', '/api/market/offer', { give: { res: gr, n: gn }, want: { res: wr, n: wn }, to }); this.toast(t('Offer published'), '#ffe082'); Sfx.play('buy'); this.loadMarket(); }
    catch (e) { this.toast('⚠️ ' + e.message, '#ff8a80'); }
  },
  async offerAction(kind, id) {
    try { await Net.call('POST', '/api/market/' + kind, { id: +id }); Sfx.play('buy'); this.toast(kind === 'accept' ? t('Trade done! Collect it in the Bank tab') : t('Offer closed'), '#ffe082'); this.loadMarket(); }
    catch (e) { this.toast('⚠️ ' + e.message, '#ff8a80'); this.loadMarket(); }
  },
  offerRow(o, buttons) {
    return `<div class="row offer"><div class="tx"><b>${esc(o.sellerName || '')}</b><div class="swap">${this.tradeIcon(o.give.res)} ${U.fmt(o.give.n)} <span>⇄</span> ${this.tradeIcon(o.want.res)} ${U.fmt(o.want.n)}</div></div>${buttons}</div>`;
  },
  tradeHtml() {
    const head = this.head(t('⚖️ Trader Oto')), tab = this.tradeTab;
    if (!Net.on) return `${head}<div class="testmode">${t('Trading with other players works inside the Telegram app.')}</div>`;
    const m = this.market, tabs = [['bank', t('🏦 Bank')], ['market', t('🛒 Market')], ['offers', t('🤝 My trades')]];
    let body = `<p class="muted">${t('Loading…')}</p>`;
    if (m) {
      const all = ['gold', ...RES_IDS], opts = sel => all.map(r => `<option value="${r}" ${r === sel ? 'selected' : ''}>${this.tradeName(r)}</option>`).join('');
      if (tab === 'bank') body = `<p class="muted">${t('Move gold and resources between your base and the trading post. Only what is in the trading post can be traded.')}</p>` +
        all.map(r => `<div class="row"><div class="ic">${this.tradeIcon(r)}</div><div class="tx"><b>${this.tradeName(r)}</b><div>${t('Base {a} · Post {b}', { a: U.fmt(this.localAmount(r)), b: U.fmt(m.bank[r]) })}</div><div class="muted" style="font-size:11px">${t('Deposited today {a}/{b}', { a: U.fmt(m.deposited[r]), b: U.fmt(m.caps[r]) })}</div></div>
          <div class="bankctl"><input id="amt-${r}" type="number" min="1" inputmode="numeric" placeholder="0"><button class="btn" data-act="dep" data-res="${r}">⬆</button><button class="btn alt" data-act="wd" data-res="${r}">⬇</button></div></div>`).join('');
      else if (tab === 'market') body = `<h3>${t('Create an offer')}</h3>
          <div class="offerform"><label>${t('I give')}</label><select id="ofGive">${opts('wood')}</select><input id="ofGiveN" type="number" min="1" inputmode="numeric" value="50">
          <label>${t('I want')}</label><select id="ofWant">${opts('gold')}</select><input id="ofWantN" type="number" min="1" inputmode="numeric" value="100">
          <label>${t('To')}</label><select id="ofTo"><option value="">${t('Everyone (market)')}</option>${[...Mp.others.values()].map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select></div>
          <button class="btn big good" data-act="offer">${t('Publish offer')}</button>
          <h3>${t('Offers from other players')}</h3>
          ${m.public.length ? m.public.map(o => this.offerRow(o, `<button class="btn good" data-act="accept" data-id="${o.id}" ${m.bank[o.want.res] >= o.want.n ? '' : 'disabled'}>${t('Accept')}</button>`)).join('') : `<p class="muted">${t('No offers right now.')}</p>`}`;
      else body = `<h3>${t('Offers sent to you')}</h3>
          ${m.forMe.length ? m.forMe.map(o => this.offerRow(o, `<div class="cb"><button class="btn good" data-act="accept" data-id="${o.id}" ${m.bank[o.want.res] >= o.want.n ? '' : 'disabled'}>${t('Accept')}</button><button class="btn alt" data-act="decline" data-id="${o.id}">${t('Decline')}</button></div>`)).join('') : `<p class="muted">${t('None.')}</p>`}
          <h3>${t('Your open offers')}</h3>
          ${m.mine.length ? m.mine.map(o => this.offerRow({ ...o, sellerName: o.target ? t('Direct offer') : t('Market') }, `<button class="btn alt" data-act="cancel" data-id="${o.id}">${t('Cancel')}</button>`)).join('') : `<p class="muted">${t('None.')}</p>`}`;
    }
    return `${head}<div class="npc-say">“${t('Wood, stone, iron, crystal… everything has a price. Leave your goods with me and trade with anyone in Tyra.')}”</div>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-act="ttab" data-tab="${k}">${n}</button>`).join('')}</div>${body}`;
  },

  // ---------- gatekeeper: visit other players' bases ----------
  gateHtml() {
    const head = this.head(t('🌀 Gatekeeper Ilsa'));
    if (!Net.on) return `${head}<div class="testmode">${t('Visiting other bases works inside the Telegram app.')}</div>`;
    const b = this.bases;
    return `${head}<div class="npc-say">“${t('My gates reach every base in Tyra. Whose home do you wish to see?')}”</div>
      ${!b ? `<p class="muted">${t('Loading…')}</p>` : b.length ? b.map(x => {
        const c = CLASS_BY_ID[x.cls] || CLASSES[0], lv = Object.values(x.buildings || {}).reduce((s, v) => s + (+v || 0), 0);
        return `<div class="row"><div class="ic">${c.icon}</div><div class="tx"><b>${x.online ? '🟢 ' : ''}${esc(x.name)}</b><div>${t('Level {l} · {c} · base level {b}', { l: x.level, c: t(c.name), b: lv })}</div></div><button class="btn" data-act="visit" data-id="${esc(x.id)}">${t('Visit')}</button></div>`;
      }).join('') : `<p class="muted">${t('No other bases yet.')}</p>`}`;
  },

  // ---------- world map ----------
  mapHtml() {
    const sz = Math.min(innerWidth - 56, innerHeight - 190, 560);
    return `${this.head(t('🗺️ World map'))}
      <canvas id="bigmap" width="${sz * 2}" height="${sz * 2}" style="width:${sz}px;height:${sz}px;display:block;margin:0 auto;border-radius:12px"></canvas>
      <p class="muted">${t('🏠 base · 🌀 portal · 👹 Overlord · ■ outposts (all of them with the Radar) · dashed rings: danger tiers')} · ${t('◆ waypoints · dark: unexplored')}</p>
      ${this.travelHtml()}`;
  },
  travelHtml() {
    const list = Explore.knownList();
    const head = `<h3>🌀 ${t('Waypoints')} <span class="muted">· ${t('{n} discovered in this realm', { n: list.length })}</span></h3>`;
    if (G.visit) return head + `<p class="muted">${t('Return home before travelling.')}</p>`;
    if (!list.length) return head + `<p class="muted">${t('Explore the realm to find ancient waypoints. Walk close to one to wake it up.')}</p>`;
    const S = G.save, money = S.gold + S.run.gold;
    return head + list.map((w, i) => {
      const c = Explore.cost(w), z = zoneOf(w.x, w.y), d = Math.round(Math.hypot(w.x - G.p.x, w.y - G.p.y) / 10);
      return `<div class="row"><div class="ic wpn">${i + 1}</div><div class="tx"><b>${w.name}</b><div>${t('Zone {z} · {d}m away', { z, d: U.fmt(d) })}</div></div>
        <button class="btn ${money >= c ? 'good' : ''}" data-act="travel" data-id="${w.id}" ${money >= c && !G.tp ? '' : 'disabled'}>🌀 🪙${U.fmt(c)}</button></div>`;
    }).join('') + `<p class="muted">${t('Travelling takes {s}s and is interrupted if you get hit.', { s: TP_TIME })}</p>`;
  },
  drawMap() { const cv = $('bigmap'); if (cv) drawWorldMap(cv); },

  // ---------- NPCs ----------
  npc(id) {
    if (id === 'quest') return this.act('quests');
    if (id === 'gems') return this.act('gemshop');
    if (id === 'oracle') return this.act('shards');
    if (id === 'trade') return this.act('trade');
    if (id === 'gate') return this.act('gate');
    this.homeTab = id === 'vault' ? 'stash' : 'work';
    this.show('home', this.homeHtml());
  },
  chestPrice() { return 50 * G.save.vaultChests; },

  shardsHtml() {
    const w = Net.w, head = this.head(t('☢️ Oracle Nyx'));
    const say = `<div class="npc-say">“${t('Tyra remembers every deed. Gather Shards, survivor: one day they will become real treasure on the TON chain.')}”</div>`;
    if (!Net.on || !w) return `${head}${say}<div class="testmode">${t('☢️ Shards are earned when you play inside the Telegram app.')}</div>`;
    const short = a => a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-6) : a;
    const ev = [['👹', t('Slay an Overlord'), 25], ['📜', t('Complete a quest'), 5], ['🏴', t('Clear an outpost'), 3], ['🧭', t('Reach a new best zone'), 4]];
    const b = this.board;
    return `${head}${say}
      <div class="stats"><div>☢️ Shards<b style="color:#b9f6ca">${U.fmt(w.shards)}</b></div><div>${t('Today')}<b>${w.shardsToday} / ${w.shardCap}</b></div></div>
      <h3>${t('How to earn')}</h3>
      ${ev.map(([i, n, v]) => `<div class="row"><div class="ic">${i}</div><div class="tx"><b>${n}</b></div><b style="color:#b9f6ca">+${v} ☢️</b></div>`).join('')}
      <h3>👛 ${t('TON wallet')}</h3>
      ${w.wallet ? `<div class="row"><div class="ic">👛</div><div class="tx"><b>${short(w.wallet)}</b><div>${t('Your Shards will be converted to the token and sent here.')}</div></div><button class="btn alt" data-act="tondisconnect">${t('Unlink')}</button></div>`
        : `<p class="muted">${t('Link a TON wallet (Telegram Wallet, Tonkeeper…) so you can receive the token later.')}</p><button class="btn big good" data-act="tonconnect">👛 ${t('Connect TON wallet')}</button>`}
      <div class="testmode">🪙 ${t('Token coming soon: Shards will convert to the Tyra token on TON. The rate and date will be announced. Shards cannot be bought.')}</div>
      <h3>🏆 ${t('Leaderboard')}</h3>
      ${!b ? `<p class="muted">${t('Loading…')}</p>` : b.top.length ? b.top.map(r => `<div class="row" style="${r.me ? 'outline:2px solid #b9f6ca' : ''}"><div class="ic">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : '#' + r.rank}</div><div class="tx"><b>${r.name.replace(/</g, '&lt;')}</b></div><b style="color:#b9f6ca">${U.fmt(r.shards)} ☢️</b></div>`).join('')
        + (b.myRank && b.myRank > b.top.length ? `<p class="muted">${t('Your rank: #{n}', { n: b.myRank })}</p>` : '') : `<p class="muted">${t('No Shards yet. Be the first!')}</p>`}`;
  },

  questsHtml() {
    const S = G.save;
    const lines = ['The wastes grow bolder every day. Thin their ranks and I will make it worth your while.', 'Bring me proof of your deeds, survivor.', 'Each realm hides an Overlord. Clear three outposts and it will show itself.'].map(x => t(x));
    return `${this.head('📜 Commander Vale')}
      <div class="npc-say">“${lines[Math.floor(G.t / 20) % lines.length]}”</div>
      ${S.quests.map(q => {
        const r = q.reward, pct = 100 * q.prog / q.target;
        return `<div class="row"><div class="ic">${Quests.icon(q)}</div><div class="tx"><b>${Quests.text(q)}</b>
          <div>${t('Reward:')} 🪙${U.fmt(r.gold)} · ✨${r.xp} XP${r.gems ? ` · <span style="color:#b388ff">💎${r.gems}</span>` : ''}${r.item ? ` · <span style="color:${RARITIES[r.item.rarity].color}">${itemName(r.item)}</span>` : ''}</div>
          <div class="qbar"><div style="width:${pct}%"></div></div><div>${U.fmt(q.prog)} / ${U.fmt(q.target)}</div></div>
          ${q.done ? `<button class="btn good" data-act="claim" data-id="${q.id}">${t('Claim')}</button>` : `<button class="btn alt" data-act="qreroll" data-id="${q.id}" ${S.gold >= 40 ? '' : 'disabled'}>↻ 🪙40</button>`}</div>`;
      }).join('')}
      <p class="muted">${t('Progress counts anywhere in the realm. Claim rewards here at the base.')}</p>`;
  },

  gemsHtml() {
    const S = G.save, cp = this.chestPrice();
    return `${this.head('💎 Mystic Zara')}
      <div class="npc-say">“${t('Gems open doors that gold cannot. Vaults, supplies… for a price.')}”</div>
      ${this.wallet()}
      <h3>${t('Spend gems')}</h3>
      <div class="row"><div class="ic">🗝️</div><div class="tx"><b>${t('Vault chest')}</b><div>${t('+8 permanent stash slots · you own {a}/{b}', { a: S.vaultChests, b: MAX_CHESTS })}</div></div>
        <button class="btn good" data-act="buychest" ${S.vaultChests < MAX_CHESTS && S.gems >= cp ? '' : 'disabled'}>${S.vaultChests >= MAX_CHESTS ? t('MAX') : `💎${cp}`}</button></div>
      <div class="row"><div class="ic">💰</div><div class="tx"><b>${t('Gold pouch')}</b><div>+🪙${U.fmt(500 * Math.max(1, S.stats.best))} ${t('(grows with your best zone)')}</div></div>
        <button class="btn" data-act="gemgold" ${S.gems >= 30 ? '' : 'disabled'}>💎30</button></div>
      <div class="row"><div class="ic">🧪</div><div class="tx"><b>${t('Potion crate')}</b><div>${t('4 health + 4 mana potions')}</div></div>
        <button class="btn" data-act="gempots" ${S.gems >= 20 ? '' : 'disabled'}>💎20</button></div>
      <h3>${t('Get gems')}</h3>
      ${Net.canBuy ? `<p class="muted">${t('Paid securely with Telegram Stars ⭐. Gems are also earned from quests and Overlords.')}</p>`
        : `<div class="testmode">${t('💎 Gems are sold in the Telegram app with Telegram Stars ⭐')}${(window.GAME_CONFIG || {}).botUsername ? `: <a style="color:#ffe082" href="https://t.me/${window.GAME_CONFIG.botUsername}" target="_blank" rel="noopener">${t('open @{b}', { b: window.GAME_CONFIG.botUsername })}</a>` : ''}${t('. You can also earn gems from quests and Overlords.')}</div>`}
      ${GEM_PACKS.map((pk, i) => `<div class="row"><div class="ic">💎</div><div class="tx"><b>${t('{n} gems', { n: pk.gems })}</b>${pk.bonus ? ` <span class="up">${pk.bonus}</span>` : ''}<div>${t('{n} ⭐ Telegram Stars', { n: pk.stars })}</div></div>
        <button class="btn ${Net.canBuy ? 'good' : ''}" data-act="gempack" data-i="${i}">⭐${pk.stars}</button></div>`).join('')}`;
  },

  // ---------- perks ----------
  perkChoice() {
    const pool = PERKS.slice(), opts = [];
    while (opts.length < 3 && pool.length) { const p = U.weighted(pool, x => x.w || 1); opts.push(p); pool.splice(pool.indexOf(p), 1); }
    this.perkOpts = opts;
    Sfx.play('level');
    this.show('perk', `<h2>${t('⚡ Run rank {n}: choose a perk', { n: G.save.run.rank - G.pendingPerks + 1 })}</h2>
      <p class="muted">${t('Perks last until you die.')}</p>
      <div class="perks">${opts.map((p, i) => `<button class="perk" data-act="perk" data-i="${i}"><span class="ic">${p.icon}</span><div><b>${t(p.name)}</b><div>${t(p.desc)}</div></div></button>`).join('')}</div>`, false);
  },
  pickPerk(i) {
    const p = this.perkOpts[i]; if (!p) return;
    const r = G.save.run;
    p.apply(r.mod); r.perks.push(p.id); G.pendingPerks--;
    recalc();
    if (p.id === 'hp') G.p.hp += 12;
    this.open = null; $('modal').classList.add('hidden'); G.paused = false;
    if (G.pendingPerks > 0) this.perkChoice();
  },

  // ---------- death ----------
  death(s) {
    this.show('death', `<h2>${t('💀 You fell in Zone {z}', { z: s.zone })}</h2>
      <div class="stats">
        <div>${t('Survived')}<b>${U.time(s.time)}</b></div><div>${t('Kills')}<b>${s.kills}</b></div>
        <div>${t('Run rank')}<b>${s.rank}</b></div><div>${t('Items lost')}<b>${s.lostItems}</b></div>
      </div>
      <p>${t('Lost 🪙{g} ⚙️{s}', { g: U.fmt(s.lostGold), s: s.lostScrap })}${s.keptGold || s.keptScrap ? t(' · Vault saved 🪙{g} ⚙️{s}', { g: U.fmt(s.keptGold), s: s.keptScrap }) : ''}</p>
      ${s.perks.length ? `<div class="chips">${s.perks.map(id => { const p = PERKS.find(x => x.id === id); return `<span>${p.icon} ${t(p.name)}</span>`; }).join('')}</div>` : ''}
      <p class="muted">${t('The realms of Tyra shift… a new world awaits. Your level, skills, equipped gear, potions, base and stash remain.')}</p>
      <button class="btn big good" data-act="rise">${t('Rise again')}</button>`, false);
  },
};
