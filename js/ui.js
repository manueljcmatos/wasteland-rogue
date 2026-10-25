'use strict';
// DOM menus: HUD, base (buildings / shop / stash / workshop), bag, skills, perks, death.
const $ = id => document.getElementById(id);

const UI = {
  open: null, homeTab: 'base',

  init() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el || el.id === 'btnDash' || el.id === 'btnMed') return;
      Sfx.unlock();
      this.act(el.dataset.act, el.dataset);
    });
    // dash / medkit react on pointerdown for responsiveness
    for (const id of ['btnDash', 'btnMed']) {
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
    this.open = null; $('modal').classList.add('hidden'); G.paused = false;
    persist();
    if (G.pendingPerks > 0) this.perkChoice();
  },
  refresh() { if (this.open && this[this.open + 'Html']) $('panel').innerHTML = this[this.open + 'Html'](); },
  head(title) { return `<h2><span>${title}</span><button class="x" data-act="close">✕</button></h2>`; },
  wallet() {
    const S = G.save, r = S.run;
    return `<div class="wallet"><span>🪙 ${U.fmt(S.gold)}${r.gold ? ` <small class="muted">(+${U.fmt(r.gold)} carried)</small>` : ''}</span><span>⚙️ ${U.fmt(S.scrap)}${r.scrap ? ` <small class="muted">(+${r.scrap})</small>` : ''}</span></div>`;
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
    const S = G.save, r = S.run, p = G.p, st = G.st;
    $('hpFill').style.width = (100 * Math.max(0, p.hp) / st.maxHp) + '%';
    $('hpText').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${st.maxHp}`;
    $('xpFill').style.width = (100 * S.xp / xpNeed(S.level)) + '%';
    $('xpText').textContent = `Level ${S.level}`;
    $('rankFill').style.width = (100 * r.rxp / rankNeed(r.rank)) + '%';
    $('rankText').textContent = `Run rank ${r.rank} · next perk`;
    $('goldTxt').textContent = G.atHome ? U.fmt(S.gold) : U.fmt(r.gold);
    $('scrapTxt').textContent = G.atHome ? U.fmt(S.scrap) : U.fmt(r.scrap);
    $('zoneLbl').textContent = G.atHome ? '🏠 Safe base' : `Zone ${G.lastZone} · ${BIOMES[World.biomeAt(p.x, p.y)].name}`;
    $('spBadge').textContent = S.sp > 0 ? S.sp : '';
    $('medCount').textContent = S.medkits;
    $('btnDash').classList.toggle('cd', p.dashCd > 0);
    $('btnHome').classList.toggle('show', G.atHome);
  },

  // ---------- actions ----------
  act(a, d = {}) {
    const S = G.save, st = G.st;
    const find = uid => {
      let i = S.bag.findIndex(w => w.uid === uid); if (i >= 0) return { list: S.bag, i, w: S.bag[i] };
      i = S.stash.findIndex(w => w.uid === uid); if (i >= 0) return { list: S.stash, i, w: S.stash[i] };
      return null;
    };
    switch (a) {
      case 'close': this.close(); return;
      case 'dash': dash(); return;
      case 'med': useMed(); return;
      case 'menu': this.show('menu', this.menuHtml()); return;
      case 'bag': this.show('bag', this.bagHtml()); return;
      case 'skills': this.show('skills', this.skillsHtml()); return;
      case 'home': if (G.atHome) this.show('home', this.homeHtml()); return;
      case 'tab': this.homeTab = d.tab; break;
      case 'equip': {
        const f = find(d.uid); if (!f) return;
        f.list[f.i] = S.equipped; S.equipped = f.w; recalc(); Sfx.play('pick');
        break;
      }
      case 'drop': {
        const f = find(d.uid); if (!f) return;
        f.list.splice(f.i, 1);
        if (!G.atHome) { addPickup('weapon', G.p.x, G.p.y, 0, f.w); G.pickups[G.pickups.length - 1].lock = 2.5; }
        break;
      }
      case 'sell': {
        const f = find(d.uid); if (!f || !G.atHome) return;
        const v = this.sellPrice(f.w); f.list.splice(f.i, 1); S.gold += v; Sfx.play('buy'); this.toast(`Sold for 🪙${v}`);
        break;
      }
      case 'salvage': {
        const f = find(d.uid); if (!f || !G.atHome) return;
        const v = salvageValue(f.w); f.list.splice(f.i, 1); S.scrap += v; Sfx.play('buy'); this.toast(`Salvaged ⚙️${v}`);
        break;
      }
      case 'stash': {
        const i = S.bag.findIndex(w => w.uid === d.uid);
        if (i < 0) return;
        if (S.stash.length >= st.stashCap) { this.toast('Stash full — upgrade the Armory'); return; }
        S.stash.push(S.bag.splice(i, 1)[0]);
        break;
      }
      case 'take': {
        const i = S.stash.findIndex(w => w.uid === d.uid);
        if (i < 0) return;
        if (S.bag.length >= st.bagCap) { this.toast('Bag full'); return; }
        S.bag.push(S.stash.splice(i, 1)[0]);
        break;
      }
      case 'upg': {
        const w = d.uid === S.equipped.uid ? S.equipped : (find(d.uid) || {}).w;
        if (!w) return;
        const c = upgradeCost(w);
        if (w.upg >= S.buildings.workshop * 2 || S.gold < c.gold || S.scrap < c.scrap) return;
        S.gold -= c.gold; S.scrap -= c.scrap; w.upg++; recalc(); Sfx.play('level');
        break;
      }
      case 'skill': {
        if (S.sp <= 0 || S.skills[d.id] >= SKILL_MAX) return;
        S.sp--; S.skills[d.id]++; recalc(); Sfx.play('buy');
        break;
      }
      case 'build': {
        const l = S.buildings[d.id], c = buildCost(l);
        if (l >= BUILD_MAX || S.gold < c.gold || S.scrap < c.scrap) return;
        S.gold -= c.gold; S.scrap -= c.scrap; S.buildings[d.id]++;
        recalc(); if (d.id === 'market') rollShop();
        Sfx.play('level');
        this.toast(`${BUILDINGS.find(b => b.id === d.id).name} upgraded!`, '#ffe082');
        break;
      }
      case 'buy': {
        const w = G.shop.items[+d.i]; if (!w) return;
        const price = this.buyPrice(w);
        if (S.gold < price) return;
        if (S.bag.length >= st.bagCap && S.stash.length >= st.stashCap) { this.toast('Bag and stash full'); return; }
        S.gold -= price; (S.bag.length < st.bagCap ? S.bag : S.stash).push(w);
        G.shop.items.splice(+d.i, 1); Sfx.play('buy');
        break;
      }
      case 'buymed': {
        const price = this.medPrice();
        if (S.gold < price || S.medkits >= st.medCap) return;
        S.gold -= price; S.medkits++; Sfx.play('buy');
        break;
      }
      case 'reroll': if (S.gold >= 25) { S.gold -= 25; rollShop(); Sfx.play('buy'); } break;
      case 'perk': this.pickPerk(+d.i); return;
      case 'autoaim': S.settings.autoAim = !S.settings.autoAim; break;
      case 'sound': S.settings.sound = Sfx.on = !S.settings.sound; break;
      case 'wipe':
        if (confirm('Erase ALL progress (base, skills, items)?')) { Save.wipe(); location.reload(); }
        return;
      case 'rise': this.open = null; this.close(); return;
      case 'start': S.seenIntro = true; this.open = null; this.close(); return;
    }
    persist();
    this.refresh();
  },

  sellPrice: w => Math.round(weaponValue(w) * .4 * (1 + .06 * G.st.haggle)),
  buyPrice: w => Math.round(weaponValue(w) * 1.5 * (1 - .06 * G.st.haggle)),
  medPrice: () => Math.round(35 * (1 - .06 * G.st.haggle)),

  // ---------- weapon card ----------
  wcard(w, buttons) {
    const s = weaponStats(w), r = RARITIES[w.rarity], dps = weaponDps(w), eq = weaponDps(G.save.equipped);
    const cmp = w === G.save.equipped ? '' : dps > eq ? `<span class="up">▲${Math.round(dps - eq)}</span>` : dps < eq ? `<span class="down">▼${Math.round(eq - dps)}</span>` : '';
    const n = s.bullets + s.multi;
    return `<div class="card" style="border-color:${r.color}55">
      <div class="cn" style="color:${r.color}">${weaponName(w)} <small>Lv ${w.level}</small></div>
      <div class="cs">DMG ${Math.round(s.dmg)}${n > 1 ? '×' + n : ''} · ${s.rate.toFixed(1)}/s · <b>DPS ${Math.round(dps)}</b> ${cmp}</div>
      ${w.affixes.map(a => `<div class="af">◆ ${AFFIX_BY_ID[a.id].label(a.v)}</div>`).join('')}
      ${buttons ? `<div class="cb">${buttons}</div>` : ''}</div>`;
  },

  // ---------- panels ----------
  menuHtml() {
    const S = G.save, st = S.stats;
    return `${this.head('Paused')}
      <div class="stats">
        <div>Level<b>${S.level}</b></div><div>Best zone<b>${st.best}</b></div>
        <div>Total kills<b>${U.fmt(st.kills)}</b></div><div>Warlords slain<b>${st.bosses}</b></div>
        <div>Runs<b>${st.runs}</b></div><div>This run<b>${U.time(S.run.time)}</b></div>
      </div>
      ${S.run.perks.length ? `<h3>Run perks</h3><div class="chips">${S.run.perks.map(id => `<span>${PERKS.find(p => p.id === id).icon} ${PERKS.find(p => p.id === id).name}</span>`).join('')}</div>` : ''}
      <h3>Settings</h3>
      <div class="row"><div class="tx"><b>Auto-aim</b><div>Shoot nearest enemy automatically when not aiming</div></div><button class="btn ${S.settings.autoAim ? 'good' : 'alt'}" data-act="autoaim">${S.settings.autoAim ? 'ON' : 'OFF'}</button></div>
      <div class="row"><div class="tx"><b>Sound</b></div><button class="btn ${S.settings.sound ? 'good' : 'alt'}" data-act="sound">${S.settings.sound ? 'ON' : 'OFF'}</button></div>
      <h3>How to play</h3>
      <p>${this.helpText()}</p>
      <button class="btn big" data-act="close">▶ Resume</button>
      <button class="btn big warn" data-act="wipe">Erase save</button>`;
  },

  helpText() {
    return `<b>Left thumb</b> moves, <b>right thumb</b> aims &amp; fires (or let auto-aim do it). 💨 dashes through danger, 💊 heals.
      The further you roam from base, the higher the <b>zone level</b>: tougher enemies, better loot.
      Clear red <b>outposts</b> by killing their 👑 Warlord. Gold and scrap you carry are only safe once you
      <b>return to base</b>. Spend them to upgrade buildings, buy and upgrade weapons.
      Dying ends the run: you lose carried loot, your bag and run perks, and the world reshapes, but your level, skills, base and stash remain.
      <br><span class="muted">Desktop: WASD + mouse, Space dash, Q medkit, E base, B bag, K skills.</span>`;
  },

  intro() {
    this.show('intro', `<h2>☢️ Wasteland Rogue</h2>
      <p>An open-world roguelike shooter. Venture out from your base, survive, loot and level up.</p>
      <p>${this.helpText()}</p>
      <button class="btn big good" data-act="start">Start</button>`, false);
  },

  bagHtml() {
    const S = G.save, st = G.st;
    const btn = w => `<button class="btn" data-act="equip" data-uid="${w.uid}">Equip</button>` +
      (G.atHome ? `<button class="btn alt" data-act="stash" data-uid="${w.uid}">To stash</button><button class="btn good" data-act="sell" data-uid="${w.uid}">Sell 🪙${this.sellPrice(w)}</button>`
        : `<button class="btn alt" data-act="drop" data-uid="${w.uid}">Drop</button>`);
    return `${this.head('🎒 Bag')}
      ${this.wallet()}
      <h3>Equipped</h3>${this.wcard(S.equipped)}
      <h3>Bag ${S.bag.length}/${st.bagCap}</h3>
      ${S.bag.length ? `<div class="grid">${S.bag.map(w => this.wcard(w, btn(w))).join('')}</div>` : '<p class="muted">Empty. Enemies drop weapons; elites and Warlords drop better ones.</p>'}
      ${G.atHome ? '' : '<p class="muted">⚠️ Items in your bag are lost if you die. Bring them home to stash or sell.</p>'}
      <h3>Character</h3>
      <div class="stats">
        <div>Max HP<b>${st.maxHp}</b></div><div>Damage<b>×${st.dmgMul.toFixed(2)}</b></div>
        <div>Fire rate<b>×${st.rateMul.toFixed(2)}</b></div><div>Crit<b>${Math.round(st.crit * 100)}%</b></div>
        <div>Speed<b>${Math.round(st.spd)}</b></div><div>Regen<b>${st.regen.toFixed(1)}/s</b></div>
      </div>`;
  },

  skillsHtml() {
    const S = G.save;
    return `${this.head('⭐ Skills')}
      <p>Skill points: <b style="color:#ffe082">${S.sp}</b> <span class="muted">· earn 1 per level · permanent</span></p>
      ${SKILLS.map(s => {
        const l = S.skills[s.id];
        return `<div class="row"><div class="ic">${s.icon}</div><div class="tx"><b>${s.name}</b><span class="pips">${'<i class="on"></i>'.repeat(l)}${'<i></i>'.repeat(SKILL_MAX - l)}</span><div>${s.desc} per rank</div></div>
          <button class="btn" data-act="skill" data-id="${s.id}" ${S.sp > 0 && l < SKILL_MAX ? '' : 'disabled'}>${l >= SKILL_MAX ? 'MAX' : '+1'}</button></div>`;
      }).join('')}`;
  },

  homeHtml() {
    const tabs = [['base', '🏗️ Base'], ['shop', '🏪 Shop'], ['stash', '📦 Stash'], ['work', '🔧 Workshop']];
    const body = { base: this.baseTab, shop: this.shopTab, stash: this.stashTab, work: this.workTab }[this.homeTab].call(this);
    return `${this.head('🏠 Home Base')}${this.wallet()}
      <div class="tabs">${tabs.map(([k, n]) => `<button class="${this.homeTab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${n}</button>`).join('')}</div>${body}`;
  },

  baseTab() {
    const S = G.save;
    return BUILDINGS.map(b => {
      const l = S.buildings[b.id], c = buildCost(l), max = l >= BUILD_MAX, can = !max && S.gold >= c.gold && S.scrap >= c.scrap;
      return `<div class="row"><div class="ic">${b.icon}</div><div class="tx"><b>${b.name}</b><span class="pips">${'<i class="on"></i>'.repeat(l)}${'<i></i>'.repeat(BUILD_MAX - l)}</span>
        <div>${b.desc(l)}</div>${max ? '' : `<div style="color:#9fd">Next: ${b.desc(l + 1)}</div>`}</div>
        <button class="btn ${can ? 'good' : ''}" data-act="build" data-id="${b.id}" ${can ? '' : 'disabled'}>${max ? 'MAX' : `🪙${U.fmt(c.gold)}<br>⚙️${c.scrap}`}</button></div>`;
    }).join('');
  },

  shopTab() {
    const S = G.save, st = G.st;
    if (!G.shop) rollShop();
    const mp = this.medPrice();
    return `<div class="row"><div class="ic">💊</div><div class="tx"><b>Medkit</b><div>Heals 50% HP · carrying ${S.medkits}/${st.medCap}</div></div>
        <button class="btn" data-act="buymed" ${S.gold >= mp && S.medkits < st.medCap ? '' : 'disabled'}>🪙${mp}</button></div>
      <h3>Weapons <span class="muted">(level ${Math.max(1, S.stats.best - 1)}, rises with your best zone)</span></h3>
      ${G.shop.items.length ? `<div class="grid">${G.shop.items.map((w, i) => {
        const pr = this.buyPrice(w);
        return this.wcard(w, `<button class="btn ${S.gold >= pr ? 'good' : ''}" data-act="buy" data-i="${i}" ${S.gold >= pr ? '' : 'disabled'}>Buy 🪙${U.fmt(pr)}</button>`);
      }).join('')}</div>` : '<p class="muted">Sold out.</p>'}
      <button class="btn big alt" data-act="reroll" ${S.gold >= 25 ? '' : 'disabled'}>🔄 New stock (🪙25)</button>`;
  },

  stashTab() {
    const S = G.save, st = G.st;
    const bagBtn = w => `<button class="btn" data-act="equip" data-uid="${w.uid}">Equip</button><button class="btn alt" data-act="stash" data-uid="${w.uid}">Stash</button><button class="btn good" data-act="sell" data-uid="${w.uid}">Sell 🪙${this.sellPrice(w)}</button>`;
    const stBtn = w => `<button class="btn" data-act="equip" data-uid="${w.uid}">Equip</button><button class="btn alt" data-act="take" data-uid="${w.uid}">Take</button><button class="btn good" data-act="sell" data-uid="${w.uid}">Sell 🪙${this.sellPrice(w)}</button>`;
    return `<h3>Equipped</h3>${this.wcard(S.equipped)}
      <h3>Bag ${S.bag.length}/${st.bagCap}</h3>
      ${S.bag.length ? `<div class="grid">${S.bag.map(w => this.wcard(w, bagBtn(w))).join('')}</div>` : '<p class="muted">Empty</p>'}
      <h3>Stash ${S.stash.length}/${st.stashCap} <span class="muted">· safe forever</span></h3>
      ${S.stash.length ? `<div class="grid">${S.stash.map(w => this.wcard(w, stBtn(w))).join('')}</div>` : '<p class="muted">Empty</p>'}`;
  },

  workTab() {
    const S = G.save, cap = S.buildings.workshop * 2;
    if (!cap) return '<p>Build the <b>🔧 Workshop</b> (Base tab) to upgrade weapons with gold and scrap.</p>';
    const all = [S.equipped, ...S.bag, ...S.stash];
    return `<p class="muted">Each upgrade: +10% damage, +3% fire rate. Max +${cap} at this Workshop level.</p>
      <div class="grid">${all.map(w => {
        const c = upgradeCost(w), can = w.upg < cap && S.gold >= c.gold && S.scrap >= c.scrap;
        const sal = w === S.equipped ? '' : `<button class="btn alt" data-act="salvage" data-uid="${w.uid}">Salvage ⚙️${salvageValue(w)}</button>`;
        return this.wcard(w, (w.upg >= cap ? '<button class="btn" disabled>MAX</button>' :
          `<button class="btn ${can ? 'good' : ''}" data-act="upg" data-uid="${w.uid}" ${can ? '' : 'disabled'}>Upgrade 🪙${c.gold} ⚙️${c.scrap}</button>`) + sal);
      }).join('')}</div>`;
  },

  // ---------- perks ----------
  perkChoice() {
    const pool = PERKS.slice(), opts = [];
    while (opts.length < 3 && pool.length) { const p = U.weighted(pool, x => x.w || 1); opts.push(p); pool.splice(pool.indexOf(p), 1); }
    this.perkOpts = opts;
    Sfx.play('level');
    this.show('perk', `<h2>⚡ Run rank ${G.save.run.rank - G.pendingPerks + 1} — choose a perk</h2>
      <p class="muted">Perks last until you die.</p>
      <div class="perks">${opts.map((p, i) => `<button class="perk" data-act="perk" data-i="${i}"><span class="ic">${p.icon}</span><div><b>${p.name}</b><div>${p.desc}</div></div></button>`).join('')}</div>`, false);
  },
  pickPerk(i) {
    const p = this.perkOpts[i]; if (!p) return;
    const r = G.save.run;
    p.apply(r.mod); r.perks.push(p.id); G.pendingPerks--;
    recalc();
    if (p.id === 'hp') G.p.hp += 25;
    this.open = null; $('modal').classList.add('hidden'); G.paused = false;
    if (G.pendingPerks > 0) this.perkChoice();
  },

  // ---------- death ----------
  death(s) {
    this.show('death', `<h2>💀 You fell in Zone ${s.zone}</h2>
      <div class="stats">
        <div>Survived<b>${U.time(s.time)}</b></div><div>Kills<b>${s.kills}</b></div>
        <div>Run rank<b>${s.rank}</b></div><div>Items lost<b>${s.lostItems}</b></div>
      </div>
      <p>Lost 🪙${U.fmt(s.lostGold)} ⚙️${s.lostScrap}${s.keptGold || s.keptScrap ? ` · Vault saved 🪙${U.fmt(s.keptGold)} ⚙️${s.keptScrap}` : ''}</p>
      ${s.perks.length ? `<div class="chips">${s.perks.map(id => `<span>${PERKS.find(p => p.id === id).icon} ${PERKS.find(p => p.id === id).name}</span>`).join('')}</div>` : ''}
      <p class="muted">The wasteland shifts… a new world awaits. Your level, skills, base and stash remain.</p>
      <button class="btn big good" data-act="rise">Rise again</button>`, false);
  },
};
