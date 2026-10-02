// Team brains, one per side. A brain decides the round's economy and plan, gives each bot its job, keeps what
// the team knows (who was seen or heard where, enemy utility, the bomb), calls rotations and retakes, and
// talks on the radio. The T side picks a site and a strategy (execute with smokes and flashes, default and
// read the map, rush, split, fake); the CT side spreads over both sites watching every entrance, rotates on
// information and retakes together.

import { ECON, GRENADES } from './config.js';
import * as W from './world.js';
import { getNav, topHolds, watchSpots, retakePoints, routeUtilityJob, finishJob, calloutName, laneOf, siteMouth, routePoint } from './botnav.js';
import { initBotRound, setOrder, botBuy } from './bot.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const wpick = (w) => { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const NUM = ['', 'One', 'Two', 'Three', 'Four', 'Five'];

export class TeamBrain {
  constructor(g, team) {
    this.g = g; this.team = team; this.enemy = team === 'T' ? 'CT' : 'T';
    this.history = [];           // past rounds: { site, strat, won }
    this.seenAt = { A: 0, B: 0 }; // (T) how many CTs we tend to meet at each site
    this.radioT = 0; this.said = new Map();
    this.jobs = [];
    g.on((type, d) => this.onEvent(type, d));
  }

  get nav() { return getNav(this.g.mapDef); }
  members() { return this.g.agents.filter((a) => a.team === this.team); }
  bots() { return this.g.agents.filter((a) => a.team === this.team && a.isBot); }
  aliveBots() { return this.g.agents.filter((a) => a.team === this.team && a.isBot && a.alive); }
  enemiesAlive() { return this.g.agents.filter((a) => a.team === this.enemy && a.alive).length; }

  // ---------------------------------------------------------------- round start
  startRound() {
    const g = this.g;
    this.intel = new Map();      // enemy -> { x, y, z, t, seen }
    this.cleared = new Map();    // spot -> time we last saw it empty
    this.threat = { A: 0, B: 0 };
    this.siteSeen = { A: new Set(), B: new Set() };
    this.callouts = [];
    this.t = 0; this.thinkT = 0; this.jobs.length = 0;
    this.phase = 'setup'; this.rotated = null; this.retake = null; this.post = null; this.lastPlantCall = -9;
    this.fed = null; this.regroup = null;
    this.econ = this.decideEcon();
    this.plan = this.team === 'T' ? this.planT() : this.planCT();
    const bots = this.bots();
    // utility roles go to whoever can afford them
    const roles = this.rolesFor(bots);
    for (const a of bots) botBuy(a, g, this.econ, roles.get(a));
    this.drops(bots);
    for (const a of bots) initBotRound(a, g);
    this.assignSetup();
    this.announce();
  }

  decideEcon() {
    const g = this.g, ms = this.members();
    if (g.round === 1 || ms.every((a) => a.roundsPlayed <= 1 && a.money <= g.rules.startMoney)) return 'pistol';
    const need = (a) => (a.primary ? 0 : 2700) + (a.armor >= 50 ? 0 : 1000) + 500;
    let short = 0, spare = 0;
    for (const a of ms) { const n = need(a); if (a.money < n) short++; else spare += a.money - n; }
    const fixable = Math.floor(spare / 2700);
    if (short - fixable <= 1) return 'full';
    const avg = ms.reduce((s, a) => s + a.money, 0) / Math.max(1, ms.length);
    if (g.score[this.enemy] >= g.rules.roundsToWin - 1) return avg > 1200 ? 'force' : 'eco';   // no next round to save for
    // won the last round (e.g. the pistol) but can't afford rifles: SMGs and armor keep the pressure on
    const wonLast = this.history.length && this.history[this.history.length - 1].won;
    if (wonLast && avg >= 2300) return 'force';
    // the other side is broke: a cheaper buy is enough
    const them = g.agents.filter((a) => a.team === this.enemy);
    const theirs = them.reduce((s, a) => s + a.money, 0) / Math.max(1, them.length);
    if (theirs < 2000 && avg >= 2000) return 'force';
    const lossPay = Math.min(ECON.lossBase + ECON.lossStep * (g.lossStreak[this.team] || 0), ECON.lossMax);
    const nextShort = ms.filter((a) => a.money + lossPay < need(a)).length;
    if (nextShort <= 1) return 'eco';
    return avg > 2400 ? 'force' : 'eco';
  }

  rolesFor(bots) {
    const roles = new Map(), byMoney = [...bots].sort((a, b) => b.money - a.money);
    const want = this.team === 'T' ? ['smoke', 'flash', 'smoke', 'molly', 'flash'] : ['kit', 'flash', 'molly', 'smoke', 'kit'];
    byMoney.forEach((a, i) => roles.set(a, want[i % want.length]));
    // one sniper per team on full buys, if someone can afford it
    if (this.econ === 'full') {
      const awp = byMoney.find((a) => a.money >= 6000 && !a.primary) || bots.find((a) => a.inv.sniper);
      if (awp && Math.random() < 0.6) roles.set(awp, 'awp');
    }
    return roles;
  }

  // the rich buy a rifle for a teammate who can't afford one (like dropping a gun in spawn)
  drops(bots) {
    if (this.econ !== 'full' && this.econ !== 'force') return;
    for (const poor of bots) {
      if (poor.primary || poor.punishedActive) continue;
      const rich = bots.filter((b) => b !== poor && b.money >= 2700 + 300).sort((x, y) => y.money - x.money)[0];
      if (!rich) break;
      rich.money -= 2700;
      poor.give('rifle');
      this.say(rich, `Dropping a rifle for ${poor.name}`, 1);
    }
  }

  // ---------------------------------------------------------------- T plan
  planT() {
    const g = this.g, nav = this.nav, rt = g.rules.roundTime;
    const sites = Object.keys(nav.sites).filter((k) => nav.sites[k].tRoutes.length);
    const econ = this.econ;
    const W8 = econ === 'eco' ? { rush: 0.45, execute: 0.3, default: 0.25 }
      : econ === 'pistol' ? { rush: 0.25, execute: 0.45, default: 0.3 }
      : { execute: 0.42, default: 0.28, split: 0.15, fake: 0.1, rush: 0.05 };
    let strat = wpick(W8);
    // where to go: avoid the site that has been stacked or where we keep losing
    const score = {};
    for (const s of sites) {
      const recent = this.history.slice(-4).filter((h) => h.site === s);
      score[s] = 1 + recent.filter((h) => h.won).length * 0.3 - recent.filter((h) => !h.won).length * 0.25 - this.seenAt[s] * 0.08;
    }
    const site = sites.length > 1 ? (Math.random() < 0.75 ? sites.sort((a, b) => score[b] - score[a])[0] : pick(sites)) : sites[0];
    const routes = nav.sites[site].tRoutes;
    if (routes.length < 2 && strat === 'split') strat = 'execute';
    if (sites.length < 2 && strat === 'fake') strat = 'execute';
    const other = sites.find((s) => s !== site);
    // the main way in: hidden staging and a short walk preferred
    const rank = (r) => r.len / 100 + (r.stage.exposed ? 0.6 : 0) + (r.danger || 0) * 0.6 + Math.random() * 0.5;
    const main = [...routes].sort((a, b) => rank(a) - rank(b));
    const plan = { strat, site, other, routes: main, execAt: rt - rand(42, 60), decided: strat !== 'default' };
    if (strat === 'rush') plan.execAt = rt;
    if (strat === 'default') { plan.decideAt = rt - rand(52, 66); plan.execAt = 0; }
    if (strat === 'fake') { plan.fakeAt = rt - rand(38, 48); plan.execAt = plan.fakeAt - rand(7, 10); }
    return plan;
  }

  // ---------------------------------------------------------------- CT plan
  planCT() {
    const nav = this.nav, sites = Object.keys(nav.sites);
    const bots = shuffle(this.bots());
    const n = this.members().length;
    const mouths = (k) => nav.sites[k].mouths.length;
    const plan = { sites, alloc: {} };
    if (sites.length < 2) { plan.alloc[sites[0]] = bots; return plan; }
    // more defenders where there are more ways in; sometimes stack a site the Ts like
    let nA = Math.round(n * mouths('A') / (mouths('A') + mouths('B')));
    const lean = (this.history.slice(-3).filter((h) => h.site === 'A').length - this.history.slice(-3).filter((h) => h.site === 'B').length);
    if (Math.random() < 0.25 && lean) nA += Math.sign(lean);
    nA = Math.max(n > 1 ? 1 : 0, Math.min(n - (n > 1 ? 1 : 0), nA));
    // humans count towards a site, but we don't know which; give the bots the rest by need
    const humans = this.members().filter((a) => !a.isBot).length;
    let wantA = Math.max(0, nA - Math.round(humans / 2)), wantB = Math.max(0, n - nA - (humans - Math.round(humans / 2)));
    // the sniper takes the site with the longest sightlines
    plan.alloc = { A: [], B: [] };
    for (const a of bots) {
      if (plan.alloc.A.length < wantA && (plan.alloc.B.length >= wantB || Math.random() < 0.5)) plan.alloc.A.push(a);
      else if (plan.alloc.B.length < wantB) plan.alloc.B.push(a);
      else plan.alloc[plan.alloc.A.length <= plan.alloc.B.length ? 'A' : 'B'].push(a);
    }
    return plan;
  }

  // ---------------------------------------------------------------- jobs
  assignSetup() {
    if (this.team === 'T') this.assignT(); else this.assignCT();
  }

  assignT() {
    const p = this.plan, nav = this.nav, bots = this.aliveBots();
    if (!bots.length) return;
    p.groups = [];
    if (p.strat === 'default') {
      // spread out over every way in (both sites), one or two per route
      const all = [];
      for (const s of Object.values(nav.sites)) all.push(...s.tRoutes);
      shuffle(all);
      bots.forEach((a, i) => this.stageOn(a, all[i % all.length], i));
      return;
    }
    if (p.strat === 'split') {
      const [r1, r2] = p.routes;
      const half = Math.ceil(bots.length / 2);
      p.groups = [{ route: r1, bots: bots.slice(0, half) }, { route: r2, bots: bots.slice(half) }];
    } else if (p.strat === 'fake') {
      const fakers = bots.slice(0, Math.min(2, bots.length - 1));
      const fr = this.nav.sites[p.other].tRoutes[0];
      p.fake = { route: fr, bots: fakers };
      p.groups = [{ route: p.routes[0], bots: bots.filter((b) => !fakers.includes(b)) }];
      fakers.forEach((a, i) => this.stageOn(a, fr, i));
    } else {
      p.groups = [{ route: p.routes[0], bots: [...bots] }];
      // a lurker waits on the other side of the map for rotating CTs
      if (bots.length >= 4 && p.strat === 'execute' && p.other && Math.random() < 0.35) {
        const lurker = bots.find((b) => this.g.bomb.carrier !== b);
        p.groups[0].bots = bots.filter((b) => b !== lurker);
        p.lurker = lurker;
        this.stageOn(lurker, pick(nav.sites[p.other].tRoutes), 0);
      }
    }
    for (const gr of p.groups) {
      gr.bots.forEach((a, i) => this.stageOn(a, gr.route, i, p.strat === 'rush'));
      this.prepUtility(gr.route);
    }
    if (p.fake) this.prepUtility(p.fake.route);
  }

  // go wait at a route's staging spot (one of its slots), crosshair on the way in
  stageOn(a, route, i, rush = false) {
    const st = route.stage, slot = st.slots[i % st.slots.length] || st;
    const m = siteMouth(this.nav, route);
    a.ai.route = route;
    if (rush) { this.entryOrder(a, route, i); return; }
    setOrder(a, { type: 'hold', pos: { x: slot.x, z: slot.z }, look: st.look, pace: 'run', route, stage: true, preaim: topHolds(m, 6) });
  }

  // through the mouth and onto the site: carrier to the plant spot, the rest to spots covering it
  entryOrder(a, route, k) {
    const nav = this.nav, site = nav.sites[route.site], m = siteMouth(nav, route);
    const plant = site.plants[0] || { x: site.center.x, z: site.center.z, y: m.y };
    const spots = this.siteSpots(route.site, plant);
    const preaim = [...topHolds(m, 10), ...site.anchors.slice(0, 3)];
    if (this.g.bomb.carrier === a) {
      setOrder(a, { type: 'plant', pos: { x: plant.x, z: plant.z }, pace: 'run', preaim, anywhere: this.g.timer < 20, urgent: true });
    } else {
      const s = spots[k % Math.max(1, spots.length)] || plant;
      setOrder(a, { type: 'hold', pos: { x: s.x, z: s.z }, look: s.look || { x: m.x, y: m.y + 1.6, z: m.z }, pace: 'run', preaim, entry: true });
    }
  }

  siteSpots(siteKey, plant) {
    this.spotCache ||= new Map();
    const key = `${siteKey}:${plant.x},${plant.z}`;
    if (!this.spotCache.has(key)) this.spotCache.set(key, watchSpots(this.nav, siteKey, { x: plant.x, y: plant.y ?? W.groundAt(plant.x, plant.z), z: plant.z }, 5, { radius: 22 }));
    return this.spotCache.get(key);
  }

  // work out a route's smokes/flash/molotov over the next frames (freeze time)
  prepUtility(route) {
    if (route.util || this.jobs.some((j) => j.route === route)) return;
    this.jobs.push({ route, it: routeUtilityJob(this.nav, route) });
  }

  assignCT() {
    const nav = this.nav, p = this.plan;
    p.post = new Map();
    for (const k of Object.keys(p.alloc)) {
      const site = nav.sites[k], bots = p.alloc[k];
      if (!bots.length) continue;
      if (bots.length === 1 && site.mouths.length > 1 && site.anchors.length) {
        const an = pick(site.anchors.slice(0, 2));
        this.holdOrder(bots[0], { ...an, site: k }, k);
        continue;
      }
      // every entrance watched; extra players double up on the busiest ones
      const ms = [...site.mouths].sort((x, y) => y.routes.length - x.routes.length);
      bots.forEach((a, i) => {
        const m = ms[i % ms.length];
        const style = a.inv.sniper ? 'sniper' : (a.inv.smg || a.inv.shotgun || !a.primary) && m.holds.close.length ? 'close' : 'rifle';
        const list = m.holds[style].length ? m.holds[style] : m.holds.rifle;
        const taken = [...p.post.values()];
        const free = list.filter((h) => !taken.some((t) => Math.hypot(t.x - h.x, t.z - h.z) < 3)).slice(0, 3);
        const h = free.length ? (Math.random() < 0.6 ? free[0] : pick(free)) : list[0];
        if (h) this.holdOrder(a, h, k, m);
      });
    }
  }

  holdOrder(a, h, siteKey, m = null) {
    this.plan.post?.set(a, h);
    a.ai.site = siteKey;
    const alts = m ? [...m.holds.rifle, ...m.holds.close].filter((x) => x !== h).slice(0, 4) : [];
    setOrder(a, { type: 'hold', pos: { x: h.x, z: h.z }, look: h.look, looks: h.looks, pace: 'run', low: h.low, coverPt: h.coverPt, alts, mouth: m?.id });
  }

  announce() {
    const a = this.aliveBots()[0];
    if (!a) return;
    const econ = { eco: 'Eco round, save', force: 'Force buy', pistol: '', full: '' }[this.econ];
    if (this.team === 'T') {
      const p = this.plan, via = p.routes?.[0]?.name;
      const txt = {
        execute: `Execute ${p.site}${via ? ' through ' + via : ''}, wait for the smokes`,
        rush: `Rush ${p.site}${via ? ' through ' + via : ''}, don't stop`,
        default: 'Default: spread out and call what you see',
        split: `Split ${p.site}: ${p.routes[0]?.name} and ${p.routes[1]?.name}`,
        fake: `Fake ${p.other}, then hit ${p.site}`,
      }[p.strat];
      this.say(a, econ ? `${econ}. ${txt}` : txt, 2);
    } else if (econ) this.say(a, `${econ}, play safe`, 2);
  }

  // ---------------------------------------------------------------- shared knowledge
  spotted(by, e, fresh) {
    const now = this.g.time;
    const prev = this.intel.get(e);
    this.intel.set(e, { x: e.pos.x, y: e.pos.y, z: e.pos.z, t: now, seen: true, by });
    const lane = laneOf(this.nav, e.pos.x, e.pos.z);
    if (this.team === 'CT') {
      if (lane === 1 || lane === 2) { const s = lane === 1 ? 'A' : 'B'; this.threat[s] += prev && now - prev.t < 3 ? 0.05 : 1; this.siteSeen[s].add(e); }
      if (this.g.bomb.carrier === e && lane && lane < 3) this.threat[lane === 1 ? 'A' : 'B'] += 0.5;
    } else if (lane === 1 || lane === 2) this.siteSeen[lane === 1 ? 'A' : 'B'].add(e);
    if (fresh) this.callout(by, e.pos.x, e.pos.z, this.g.bomb.carrier === e);
  }

  heard(by, src, x, z, kind) {
    if (!src || src.team !== this.enemy) return;
    const now = this.g.time, prev = this.intel.get(src);
    if (['bounce', 'smoke', 'flash', 'he', 'molotov'].includes(kind)) return;
    if (!prev || now - prev.t > 1.5 || !prev.seen) this.intel.set(src, { x, y: src.pos.y, z, t: now, seen: false, by });
    if (this.team === 'CT' && (kind === 'step' || kind === 'shot')) {
      const lane = laneOf(this.nav, x, z);
      if (lane === 1 || lane === 2) this.threat[lane === 1 ? 'A' : 'B'] += kind === 'step' ? 0.12 : 0.3;
    }
    if (kind === 'defuse' && this.team === 'T') this.say(by, "He's on the bomb!", 3, 'defuse');
    else if (kind === 'step' && (!prev || now - prev.t > 8) && Math.random() < 0.35) {
      const where = calloutName(x, z);
      if (where) this.say(by, `Steps at ${where}`, 0, 'steps:' + where);
    }
  }

  // group fresh sightings for a couple of tenths so five Ts at Long becomes one call
  callout(by, x, z, carrier) {
    const where = calloutName(x, z) || 'somewhere';
    const now = this.g.time;
    let c = this.callouts.find((q) => q.where === where && now - q.t < 0.6);
    if (!c) { c = { where, t: now, n: 0, by, carrier: false, sent: false }; this.callouts.push(c); }
    c.n++; c.carrier ||= carrier;
  }

  isCleared(s) { const t = this.cleared.get(s); return t !== undefined && this.g.time - t < 8; }
  clear(s) { this.cleared.set(s, this.g.time); }

  // ---------------------------------------------------------------- radio
  say(from, text, prio = 1, key = text) {
    const g = this.g, now = g.time;
    if (!from || !from.alive && prio < 3) return;
    const last = this.said.get(key);
    if (last !== undefined && now - last < 10) return;
    if (now < this.radioT && prio < 2) return;
    this.said.set(key, now);
    this.radioT = now + 1.4;
    g.emit('radio', { team: this.team, from, text });
  }

  // ---------------------------------------------------------------- events
  onEvent(type, d) {
    const g = this.g;
    if (!this.intel) return;
    if (type === 'kill') {
      const { killer, victim } = d;
      if (victim.team === this.team && killer && killer.team === this.enemy) {
        // the last thing a dying teammate saw
        this.intel.set(killer, { x: killer.pos.x, y: killer.pos.y, z: killer.pos.z, t: g.time, seen: true });
        const where = calloutName(killer.pos.x, killer.pos.z);
        const hpLeft = killer.hp;
        if (victim.isBot && where) this.say(victim, hpLeft < 60 ? `He's at ${where}, ${hpLeft} HP` : `Killed from ${where}`, 2, 'dead:' + victim.name);
        if (this.team === 'CT') { const lane = laneOf(this.nav, victim.pos.x, victim.pos.z); if (lane === 1 || lane === 2) this.threat[lane === 1 ? 'A' : 'B'] += 1.2; }
        if (this.team === 'T' && this.phase === 'entry' && victim.ai?.route) this.fedAtMouth(victim, killer);
        if (this.team === 'CT' && victim.ai?.site && g.bomb.state !== 'planted') this.siteLoss(victim);
        this.tradeFor(victim, killer);
      } else if (killer && killer.team === this.team && victim.team === this.enemy && killer.isBot && Math.random() < 0.4) {
        const left = this.enemiesAlive();
        this.say(killer, left ? (left === 1 ? 'Got him, one left' : `Got one, ${left} left`) : 'Got him', 1, 'kill' + g.time.toFixed(1));
      }
      this.intel.delete(victim);
    } else if (type === 'fxDetonate' && d.owner && d.owner.team === this.enemy && this.team === 'CT') {
      // their smokes and flashes landing on a site is an execute coming
      const lane = laneOf(this.nav, d.x, d.z);
      if (lane === 1 || lane === 2) this.threat[lane === 1 ? 'A' : 'B'] += d.type === 'smoke' ? 1.2 : d.type === 'flash' ? 0.8 : 0.6;
    } else if (type === 'roundEnd') {
      if (this.team === 'T' && this.plan) {
        this.history.push({ site: this.plan.site, strat: this.plan.strat, won: d.winner === 'T' });
        for (const s of ['A', 'B']) this.seenAt[s] = this.seenAt[s] * 0.6 + this.siteSeen[s].size * 0.4;
      } else if (this.team === 'CT') {
        const site = g.bomb.site || (this.threat.A > this.threat.B ? 'A' : 'B');
        this.history.push({ site, won: d.winner === 'CT' });
      }
    }
  }

  // An entry fragger died at the door: the rest don't walk into the same crosshair one by one. Hold back,
  // throw something at him, then swing together; a second death there means the door is camped: go round.
  fedAtMouth(victim, killer) {
    const g = this.g, r = victim.ai.route, m = siteMouth(this.nav, r);
    if (!m || dist(victim.pos, m) > 12) return;
    const past = (a) => (a.pos.x - m.x) * m.dir.x + (a.pos.z - m.z) * m.dir.z > 1.5;
    const gr = this.plan.groups?.find((q) => q.route === r);
    if (!gr) return;
    const waiting = gr.bots.filter((a) => a.alive && a.isBot && !past(a) && !a.ai.target && a.ai.order?.type !== 'plant' || (a.alive && a.isBot && a === g.bomb.carrier && !past(a)));
    this.fed ||= new Map();
    const f = this.fed.get(r) || { n: 0 };
    f.n++; f.t = g.time; f.at = killer ? { x: killer.pos.x, y: killer.pos.y, z: killer.pos.z } : null;
    this.fed.set(r, f);
    if (!waiting.length) return;
    const site = this.nav.sites[r.site];
    const other = site.tRoutes.find((q) => q !== r && !(this.fed.get(q)?.n >= 2));
    if (f.n >= 2 && other) {
      this.say(waiting[0], `They're stacked at ${m.name}, going ${other.name}`, 2);
      gr.route = other;
      waiting.forEach((a, k) => this.stageOn(a, other, k));
      this.phase = 'setup';
      this.plan.execAt = Math.max(g.timer - 4, 25);
      return;
    }
    // hold just short of the door, crosshair on it
    for (const a of waiting) {
      a.ai.waitT = 0;
      setOrder(a, { type: 'hold', pos: { x: a.pos.x, z: a.pos.z }, look: { x: m.x, y: m.y + 1.6, z: m.z }, pace: 'walk' });
    }
    // utility on him: a flash through the door, or fire/HE where he stands
    const thrower = waiting.find((a) => a.nades.flash > 0 || a.nades.molotov > 0 || a.nades.he > 0);
    if (thrower && f.at) {
      const t = thrower.nades.molotov > 0 && dist(f.at, m) < 12 ? 'molotov' : thrower.nades.flash > 0 ? 'flash' : thrower.nades.he > 0 ? 'he' : 'molotov';
      const tgt = t === 'flash' ? { x: m.x + m.dir.x * 2.5, y: m.y + 1.8, z: m.z + m.dir.z * 2.5 } : f.at;
      thrower.ai.nade = { type: t, target: tgt, mode: t === 'flash' ? 'air' : 'ground', deadline: 4 };
      if (t === 'flash') this.say(thrower, 'Flashing the door', 1);
    }
    this.regroup = { route: r, bots: waiting, until: g.time + rand(2.2, 3.6) };
  }

  // A defender went down and the site is overrun: the others stop peeking and fall back for the retake
  siteLoss(victim) {
    const g = this.g, key = victim.ai.site, site = this.nav.sites[key];
    if (!site) return;
    const seen = [...this.intel.entries()].filter(([e, i]) => e.alive && g.time - i.t < 4 && laneOf(this.nav, i.x, i.z) === (key === 'A' ? 1 : 2)).length;
    const mates = this.aliveBots().filter((a) => a.ai.site === key);
    if (seen < 2 || seen <= mates.length) return;
    const pts = site.ctRoutes.length ? site.ctRoutes.map((r) => routePoint(r, Math.max(0, r.cum[r.entry] - 10))) : [];
    for (const a of mates) {
      if (a.ai.target) continue;
      const p = pts.length ? pts.reduce((b, q) => (dist(a.pos, q) < dist(a.pos, b) ? q : b), pts[0]) : null;
      if (!p) continue;
      setOrder(a, { type: 'hold', pos: { x: p.x, z: p.z }, look: { x: site.center.x, y: (W.groundAt(site.center.x, site.center.z) || p.y) + 1.6, z: site.center.z }, pace: 'run', fallback: true });
    }
    if (mates.length) this.say(mates[0], `${key} is lost, falling back`, 2, 'lost' + key);
  }

  // a teammate just died: the nearest bot who can get there quickly goes for the trade
  tradeFor(victim, killer) {
    const D = this.g.diff;
    if (Math.random() > D.trade) return;
    let best = null, bd = 14;
    for (const b of this.aliveBots()) {
      if (b.ai.target || b.ai.order?.type === 'plant' || b.ai.order?.type === 'defuse') continue;
      const d = dist(b.pos, victim.pos);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      const back = best.ai.order;
      setOrder(best, { type: 'go', pos: { x: victim.pos.x, z: victim.pos.z }, pace: 'run', preaim: [{ x: killer.pos.x, y: killer.pos.y, z: killer.pos.z }], trade: true, then: back, until: this.g.time + 6 });
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g;
    // spread lineup solving over frames
    if (this.jobs.length) {
      const j = this.jobs[0];
      if (j.it.next().done) this.jobs.shift();
    }
    if (g.phase !== 'live' && g.phase !== 'planted') return;
    this.t += dt;
    if ((this.thinkT -= dt) > 0) return;
    this.thinkT = 0.25;
    for (const s of ['A', 'B']) this.threat[s] *= Math.exp(-0.25 / 14);
    this.flushCallouts();
    // jobs that ran out (trades) go back to what they were doing
    for (const a of this.aliveBots()) {
      const o = a.ai.order;
      if (o?.until && g.time > o.until) setOrder(a, o.then || null);
      if (!a.ai.order) this.reassign(a);
    }
    if (g.bomb.state === 'dropped' && this.team === 'T') this.fetchBomb();
    if (this.team === 'T') this.thinkT_(); else this.thinkCT();
  }

  flushCallouts() {
    const now = this.g.time;
    for (const c of this.callouts) {
      if (c.sent || now - c.t < 0.45) continue;
      c.sent = true;
      const who = c.n > 1 ? `${NUM[Math.min(5, c.n)]} at ${c.where}` : `Enemy at ${c.where}`;
      this.say(c.by, c.carrier ? `Bomb carrier at ${c.where}!` : who, c.n > 1 || c.carrier ? 2 : 1, 'spot:' + c.where);
    }
    this.callouts = this.callouts.filter((c) => now - c.t < 3);
  }

  reassign(a) {
    if (this.team === 'T') {
      const r = this.plan?.routes?.[0];
      if (r) this.entryOrder(a, r, 1);
    } else {
      const k = this.rotated || pick(Object.keys(this.nav.sites));
      const m = pick(this.nav.sites[k].mouths);
      if (m) this.holdOrder(a, pick(m.holds.rifle.slice(0, 3)) || m.holds.close[0], k, m);
    }
  }

  fetchBomb() {
    const b = this.g.bomb;
    let best = null, bd = Infinity;
    for (const a of this.aliveBots()) { const d = dist(a.pos, b.pos); if (d < bd) { bd = d; best = a; } }
    if (best && best.ai.order?.type !== 'pickup') {
      setOrder(best, { type: 'pickup', pos: b.pos, pace: 'run', then: best.ai.order });
      if (bd > 6) this.say(best, "I'll get the bomb", 1);
    }
  }

  // ---------------------------------------------------------------- T thinking
  thinkT_() {
    const g = this.g, p = this.plan, b = g.bomb, left = g.timer;
    if (b.state === 'planted') { if (this.phase !== 'post') this.startPost(); return this.thinkPost(); }
    // whoever picked up a dropped bomb carries on with the plant
    for (const a of this.aliveBots()) if (b.carrier === a && a.ai.order?.type === 'pickup') this.entryOrder(a, p.routes?.[0] || a.ai.route, 0);
    // a default reads the map, then picks the emptier site
    if (p.strat === 'default' && !p.decided && left <= p.decideAt) {
      p.decided = true;
      const quiet = Object.keys(this.nav.sites).sort((x, y) => this.siteSeen[x].size - this.siteSeen[y].size)[0];
      p.site = quiet; p.other = quiet === 'A' ? 'B' : 'A';
      p.routes = [...this.nav.sites[quiet].tRoutes].sort((x, y) => x.len - y.len);
      p.groups = [];
      for (const r of p.routes) p.groups.push({ route: r, bots: [] });
      for (const a of this.aliveBots()) {
        const gr = p.groups.find((q) => q.route === a.ai.route) || p.groups[0];
        gr.bots.push(a);
        if (gr.route !== a.ai.route) this.stageOn(a, gr.route, gr.bots.length - 1);
      }
      p.groups = p.groups.filter((q) => q.bots.length);
      p.execAt = left - 7;
      this.say(this.aliveBots()[0], `Go ${quiet}, ${quiet === 'A' ? 'B' : 'A'} looks busy`, 2);
    }
    if (p.fake && !p.fake.done && left <= p.fakeAt) {
      p.fake.done = true;
      this.throwUtility(p.fake.route, p.fake.bots.filter((a) => a.alive), true);
      this.say(p.fake.bots[0], `Faking ${p.other}`, 1);
    }
    // execute
    if (p.groups && this.phase === 'setup') {
      // wait for the stack (most of it) unless time is running out
      const inPlace = (a) => a.ai.arrived && a.ai.order?.stage;
      const staged = p.groups.every((gr) => { const al = gr.bots.filter((a) => a.alive); return al.filter(inPlace).length >= Math.max(1, al.length - 1); });
      const go = (left <= p.execAt && staged) || (staged && left <= p.execAt + 12 && Math.random() < 0.1) || left <= p.execAt - 12 || left < 30 || p.strat === 'rush';
      if (go && (p.decided || p.strat !== 'default')) {
        this.phase = 'exec'; this.execT = g.time;
        let anyUtil = false, walk = 0;
        for (const gr of p.groups) {
          const al = gr.bots.filter((a) => a.alive);
          const u = p.strat === 'rush' ? { n: 0, far: 0 } : this.throwUtility(gr.route, al);
          anyUtil ||= u.n > 0; walk = Math.max(walk, u.far);
          // everyone else closes in quietly to just short of the entrance
          if (p.strat !== 'rush') this.pushUp(gr.route, al.filter((a) => !a.ai.nade));
        }
        this.entryAt = g.time + (anyUtil ? 2.4 : 0.3);
        this.entryMax = g.time + Math.min(18, 6 + walk / 4.5);
        if (p.strat !== 'rush') this.say(p.groups[0].bots.find((a) => a.alive), anyUtil ? 'Utility going out, get ready' : 'Go go go!', 2);
      }
    }
    // go in once the utility is out (or has had its chance) and the stack is up
    const throwing = this.aliveBots().some((a) => a.ai.nade && a.ai.nade.phase !== 'release');
    const closing = this.aliveBots().some((a) => a.ai.order?.push && !a.ai.arrived);
    if (this.phase === 'exec' && g.time >= this.entryAt && ((!throwing && !closing) || g.time >= this.entryMax)) {
      this.phase = 'entry';
      for (const gr of p.groups) {
        const bots = gr.bots.filter((a) => a.alive && !a.ai.nade);
        // the bomb goes in behind the first player, not first
        bots.sort((x, y) => (x === b.carrier) - (y === b.carrier));
        bots.forEach((a, k) => { a.ai.waitT = k === 0 ? 0 : (k === 1 ? rand(0.05, 0.2) : (k - 0.6) * rand(0.3, 0.55)); this.entryOrder(a, gr.route, k); });
      }
      if (p.lurker?.alive && left < 40) this.entryOrder(p.lurker, p.routes[0], 4);
    }
    // after holding back at a camped door: go again, two at a time
    if (this.regroup && g.time >= this.regroup.until) {
      const { route, bots } = this.regroup;
      this.regroup = null;
      if (this.phase === 'entry') bots.filter((a) => a.alive).forEach((a, k) => { a.ai.waitT = Math.floor(k / 2) * rand(0.5, 0.8) + (k % 2) * 0.12; this.entryOrder(a, route, k); });
    }
    if (this.phase === 'entry') {
      // late: plant anywhere on site; lone lurker joins
      for (const a of this.aliveBots()) if (a === b.carrier && a.ai.order?.type === 'plant') a.ai.order.anywhere = left < 20;
      if (p.lurker?.alive && p.lurker.ai.order?.stage && left < 35) this.entryOrder(p.lurker, p.routes[0], 4);
      // somebody has to plant: a human carrier gets told, bots carry on
      if (b.carrier && !b.carrier.isBot && W.inZone(p.site, b.carrier.pos.x, b.carrier.pos.z) && g.time - this.lastPlantCall > 12) {
        this.lastPlantCall = g.time; this.say(this.aliveBots()[0], 'Plant the bomb, we cover you', 2);
      }
    }
    // nothing planted, outnumbered and out of time: keep the guns
    const tAlive = this.members().filter((a) => a.alive).length;
    if (left < 12 && tAlive + 2 <= this.enemiesAlive() && this.phase !== 'save') {
      this.phase = 'save';
      for (const a of this.aliveBots()) setOrder(a, { type: 'hold', pos: { x: a.ai.route?.stage.x ?? a.pos.x, z: a.ai.route?.stage.z ?? a.pos.z }, pace: 'walk' });
      this.say(this.aliveBots()[0], 'Save, no time', 2);
    }
  }

  // walk the group up to ~10 m short of the mouth (if they're staged further back)
  pushUp(route, bots) {
    const m = siteMouth(this.nav, route), L = route.cum[route.mouth.k];
    if (route.stage.s <= 14) return;
    const p = routePoint(route, L - 10);
    bots.forEach((a, k) => {
      const off = k === 0 ? { x: 0, z: 0 } : { x: Math.cos(k * 2.1) * 1.4, z: Math.sin(k * 2.1) * 1.4 };
      const [cx, cz] = W.nearestWalkable(Math.floor(p.x + off.x), Math.floor(p.z + off.z));
      setOrder(a, { type: 'hold', pos: { x: cx + 0.5, z: cz + 0.5 }, look: { x: m.x, y: m.y + 1.6, z: m.z }, pace: 'walk', preaim: topHolds(m, 6), push: true });
    });
  }

  // planned smokes/flashes/molotovs for a route, handed to whoever carries each grenade.
  // Returns { n: how many, far: the longest walk to a throw spot }.
  throwUtility(route, bots, fake = false) {
    if (!route.util) { const j = this.jobs.find((q) => q.route === route); if (j) { finishJob(j.it); this.jobs.splice(this.jobs.indexOf(j), 1); } else finishJob(routeUtilityJob(this.nav, route)); }
    const u = route.util, D = this.g.diff, used = new Set();
    let n = 0, maxFar = 0;
    const give = (x, delay) => {
      if (!x || Math.random() > D.util) return;
      const a = bots.filter((b) => b.alive && b.nades[x.type] > 0 && !used.has(b)).sort((p, q) => dist(p.pos, x.from) - dist(q.pos, x.from))[0];
      const st = this.utilStat ||= {};
      if (!a) { st['nobody:' + x.type] = (st['nobody:' + x.type] || 0) + 1; return; }
      const far = dist(a.pos, x.from);
      if (far > 70) { st['far:' + x.type] = (st['far:' + x.type] || 0) + 1; return; }
      maxFar = Math.max(maxFar, far);
      used.add(a); n++;
      a.ai.waitT = delay;
      st['give:' + x.type] = (st['give:' + x.type] || 0) + 1;
      a.ai.nade = { type: x.type, target: x.target, mode: x.type === 'flash' ? 'air' : 'ground', from: x.from, sol: x.sol, deadline: 6 + far / 4,
        onDone: (ok, why) => { const k = ok ? 'ok:' + x.type : 'fail:' + x.type + ':' + why; st[k] = (st[k] || 0) + 1; } };
      if (this.debugUtil) { const nd = a.ai.nade, od = nd.onDone; nd.onDone = (ok, why) => { od(ok, why); this.debugUtil.push({ type: x.type, ok, why, from: x.from, target: x.target, sol: nd.sol, solLand: nd.sol?.land, at: nd.at, planned: x.sol, by: a.name }); }; }
      if (x.type === 'flash' && n === 1) this.say(a, 'Flashing in', 1, 'flash' + this.g.time.toFixed(0));
    };
    for (const s of u.smokes) give(s, 0);
    give(u.molly, 0.6);
    give(u.flash, 1.2);
    return { n, far: maxFar };
  }

  startPost() {
    const g = this.g, b = g.bomb;
    this.phase = 'post';
    const spots = watchSpots(this.nav, b.site, { x: b.pos.x, y: b.pos.y, z: b.pos.z }, 6);
    this.post = spots;
    const bots = this.aliveBots().sort((x, y) => dist(x.pos, b.pos) - dist(y.pos, b.pos));
    const used = new Set();
    for (const a of bots) {
      let best = null, bd = Infinity;
      spots.forEach((s, i) => { if (used.has(i)) return; const d = dist(a.pos, s); if (d < bd) { bd = d; best = i; } });
      if (best === null) { setOrder(a, { type: 'hold', pos: { x: a.pos.x, z: a.pos.z }, look: { x: b.pos.x, y: b.pos.y + 1.2, z: b.pos.z } }); continue; }
      used.add(best);
      const s = spots[best];
      setOrder(a, { type: 'hold', pos: { x: s.x, z: s.z }, look: s.look, pace: 'run', coverPt: s.coverPt, post: true });
    }
    this.say(bots[0] || this.members()[0], `Bomb down ${b.site}, play the post-plant`, 2);
  }

  thinkPost() {
    const g = this.g, b = g.bomb;
    // he's defusing: whoever has a molotov or HE throws it on the bomb; the rest peek it
    if (b.defuser && !this.postPeek) {
      this.postPeek = true;
      for (const a of this.aliveBots()) {
        const type = a.nades.molotov > 0 ? 'molotov' : a.nades.he > 0 ? 'he' : null;
        if (type && dist(a.pos, b.pos) < 30) a.ai.nade = { type, target: { x: b.pos.x, y: b.pos.y, z: b.pos.z }, mode: 'ground', deadline: 3 };
        else if (a.ai.order?.post) setOrder(a, { type: 'go', pos: { x: b.pos.x, z: b.pos.z }, pace: 'run', preaim: [{ x: b.pos.x, y: b.pos.y, z: b.pos.z }], urgent: true });
      }
    }
    if (!b.defuser) this.postPeek = false;
  }

  // ---------------------------------------------------------------- CT thinking
  thinkCT() {
    const g = this.g, b = g.bomb;
    if (b.state === 'planted') return this.thinkRetake();
    // rotate on information: a site under clear pressure pulls the other site's players over
    const [hot, cold] = this.threat.A > this.threat.B ? ['A', 'B'] : ['B', 'A'];
    const sure = this.threat[hot] > 2.6 && this.threat[hot] > this.threat[cold] * 2 + 0.5;
    if (sure && this.rotated !== hot) {
      this.rotated = hot;
      const site = this.nav.sites[hot];
      const movers = this.aliveBots().filter((a) => a.ai.site !== hot);
      // one player may stay to anchor the other site (unless it's a big push)
      const stay = movers.length > 1 && this.threat[hot] < 4.5 ? movers.sort((x, y) => dist(y.pos, site.center) - dist(x.pos, site.center))[0] : null;
      let k = 0;
      for (const a of movers) {
        if (a === stay) continue;
        const pts = site.ctMouths.length ? site.ctMouths : site.mouths;
        const m = site.mouths[k % site.mouths.length];
        const hs = m.holds.rifle.filter((h) => h.cover).slice(0, 4);
        const h = hs[k % Math.max(1, hs.length)] || pts[0];
        a.ai.site = hot;
        setOrder(a, { type: 'hold', pos: { x: h.x, z: h.z }, look: h.look || { x: m.x, y: m.y + 1.6, z: m.z }, pace: 'run', preaim: [{ x: m.x, y: m.y, z: m.z }, ...topHolds(m, 4)], rotate: true });
        k++;
      }
      if (movers.length) this.say(movers.find((a) => a !== stay) || movers[0], `Rotate ${hot}!`, 2, 'rot' + hot);
    }
    // a CT whose angle got smoked over moves to another one on the same entrance
    for (const a of this.aliveBots()) {
      const o = a.ai.order;
      if (o?.type !== 'hold' || !a.ai.arrived || !o.look || !o.alts?.length || a.ai.target) continue;
      if (!W.smokeBlocks(a.pos.x, a.eyeY, a.pos.z, o.look.x, o.look.y, o.look.z)) continue;
      const alt = o.alts.find((h) => !W.smokeBlocks(h.x, h.y + 1.6, h.z, h.look.x, h.look.y, h.look.z));
      if (alt) setOrder(a, { ...o, pos: { x: alt.x, z: alt.z }, look: alt.look, low: alt.low, coverPt: alt.coverPt, alts: o.alts.filter((h) => h !== alt) });
    }
  }

  thinkRetake() {
    const g = this.g, b = g.bomb, nav = this.nav, site = b.site;
    const bots = this.aliveBots();
    const left = b.timer;
    if (!this.retake) {
      const pts = retakePoints(nav, site, { x: b.pos.x, y: b.pos.y, z: b.pos.z });
      this.retake = { pts, phase: 'gather', t: g.time, spots: watchSpots(nav, site, { x: b.pos.x, y: b.pos.y, z: b.pos.z }, 6) };
      for (const a of bots) {
        const p = pts.length ? pts.reduce((best, q) => (dist(a.pos, q) < dist(a.pos, best) ? q : best), pts[0]) : { x: b.pos.x, z: b.pos.z };
        a.ai.retakePt = p;
        setOrder(a, { type: 'hold', pos: { x: p.x, z: p.z }, look: p.look, pace: 'run' });
      }
      this.say(bots[0], bots.length > 1 ? `Retake ${site}, group up` : `Bomb's at ${site}, I'm going`, 2);
    }
    const R = this.retake;
    if (!bots.length) return;
    // no way to make it: save the gun
    const kit = bots.some((a) => a.hasKit);
    const need = (kit ? g.rules.defuseTimeKit : g.rules.defuseTime) + 1;
    const nearest = bots.reduce((m, a) => Math.min(m, dist(a.pos, b.pos)), Infinity);
    if (R.phase !== 'save' && left < need + nearest / 5.3 - 1.5) {
      R.phase = 'save';
      for (const a of bots) {
        const away = { x: a.pos.x + (a.pos.x - b.pos.x), z: a.pos.z + (a.pos.z - b.pos.z) };
        const [cx, cz] = W.nearestWalkable(Math.floor(away.x), Math.floor(away.z));
        setOrder(a, { type: 'hold', pos: { x: cx + 0.5, z: cz + 0.5 }, pace: 'run' });
      }
      this.say(bots[0], 'No time, save', 2);
      return;
    }
    if (R.phase === 'gather') {
      const ready = bots.every((a) => a.ai.arrived);
      const travel = nearest / 5.3 + 2;
      if (ready || g.time - R.t > 10 || left < need + travel + 4 || bots.length === 1) {
        R.phase = 'go';
        // the nearest player with a kit defuses, the others clear the spots the Ts like to hold
        const defuser = [...bots].sort((x, y) => (dist(x.pos, b.pos) - (x.hasKit ? 15 : 0)) - (dist(y.pos, b.pos) - (y.hasKit ? 15 : 0)))[0];
        R.defuser = defuser;
        const preaim = R.spots.map((s) => ({ x: s.x, y: s.y, z: s.z }));
        let k = 0;
        for (const a of bots) {
          if (a === defuser) continue;
          const s = R.spots[k++ % Math.max(1, R.spots.length)];
          setOrder(a, { type: 'go', pos: s ? { x: (s.x + b.pos.x) / 2, z: (s.z + b.pos.z) / 2 } : { x: b.pos.x, z: b.pos.z }, look: s ? { x: s.x, y: s.y + 1.6, z: s.z } : null, pace: 'run', preaim, urgent: true });
        }
        setOrder(defuser, { type: 'defuse', pace: 'run', preaim, urgent: true });
        defuser.ai.waitT = bots.length > 1 ? 0.8 : 0;
        if (bots.length > 1) this.say(bots[0], 'Go in together, now!', 2);
      }
    }
    if (R.phase === 'go' && b.defuser && b.defuser.isBot && !R.called) { R.called = true; this.say(b.defuser, 'Defusing, cover me', 2); }
    // the defuser died: next closest takes over
    if (R.phase === 'go' && (!R.defuser || !R.defuser.alive)) {
      R.defuser = bots.sort((x, y) => dist(x.pos, b.pos) - dist(y.pos, b.pos))[0];
      if (R.defuser) setOrder(R.defuser, { type: 'defuse', pace: 'run', urgent: true });
    }
  }
}
