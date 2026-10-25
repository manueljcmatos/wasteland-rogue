'use strict';
// Persistent progress in localStorage.
const Save = {
  KEY: 'wasteland_rogue_v1',

  fresh() {
    return {
      v: 1,
      gold: 60, scrap: 0,                 // banked at home
      xp: 0, level: 1, sp: 0,
      skills: Object.fromEntries(SKILLS.map(s => [s.id, 0])),
      buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
      equipped: makeWeapon('pistol', 0, 1),
      bag: [], stash: [], medkits: 2,
      seed: U.randi(1, 1e9),
      stats: { kills: 0, runs: 1, deaths: 0, best: 1, bosses: 0, goldEarned: 0 },
      settings: { autoAim: true, sound: true },
      run: null, seenIntro: false,
    };
  },

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(this.KEY));
      if (s && s.v === 1) {
        const d = this.fresh();
        for (const k in d) if (s[k] === undefined) s[k] = d[k];
        for (const grp of ['skills', 'buildings', 'stats', 'settings'])
          for (const k in d[grp]) if (s[grp][k] === undefined) s[grp][k] = d[grp][k];
        return s;
      }
    } catch (e) { /* corrupted save -> start fresh */ }
    return this.fresh();
  },

  write(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) { /* storage full or blocked */ } },
  exportCode(s) { return 'WR1.' + btoa(unescape(encodeURIComponent(JSON.stringify(s)))); },
  importCode(code) {
    code = (code || '').trim().replace(/\s+/g, '');
    if (code.startsWith('WR1.')) code = code.slice(4);
    const s = JSON.parse(decodeURIComponent(escape(atob(code))));
    if (!s || s.v !== 1 || !s.equipped || !s.buildings) throw new Error('bad save');
    return s;
  },
  wipe() { try { localStorage.removeItem(this.KEY); } catch (e) { /* ignore */ } },
};
