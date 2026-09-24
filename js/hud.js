import { WEAPONS, WEAPON_ORDER, ECON, GRENADES, NADE_ORDER, MAX_NADES } from './config.js';
import { input, consume, releasePointer } from './input.js';
import { renderMinimap } from './mapmesh.js';
import { calloutAt } from './world.js';
import * as SFX from './audio.js';

const $ = (id) => document.getElementById(id);
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const TEAM_NAME = { T: 'Terrorists', CT: 'Counter-Terrorists' };
const ICON = { pistol: 'P-9', smg: 'Viper', shotgun: 'Breacher', rifle: 'AR-47', sniper: 'Longshot', knife: 'Knife', he: 'HE', molotov: 'Molotov', bomb: 'C4', fall: 'Fall' };
const NADE_SHORT = { he: 'HE', flash: 'FL', smoke: 'SM', molotov: 'MO' };
let weaponsBound = false;

export class HUD {
  constructor(game, ctrl, hooks) {
    this.g = game; this.ctrl = ctrl; this.hooks = hooks;
    this.el = {};
    for (const id of ['hud', 'minimap', 'money', 'callout', 'hudLeftCol', 'scoreT', 'scoreCT', 'aliveT', 'aliveCT', 'timer', 'bombTimer', 'punish', 'killfeed', 'center-msg', 'sub-msg', 'hint', 'progress',
      'crosshair', 'hitmarker', 'hp', 'armor', 'bombIcon', 'kitIcon', 'ammo', 'mag', 'reserve', 'wname', 'weapons', 'spectating', 'dmg-vignette', 'dmg-dir', 'scope', 'flashbang',
      'btnUse', 'btnScope', 'btnBuy', 'buy', 'buyGuns', 'buyNades', 'buyGear', 'buyMoney', 'scoreboard', 'sbT', 'sbCT', 'sbRound']) this.el[id] = $(id);
    this.mm = this.el.minimap.getContext('2d');
    this.mmBase = renderMinimap(game.mapDef, 320);
    this.mmK = 320 / Math.max(game.mapDef.w, game.mapDef.h);
    this.msgT = 0; this.subT = 0; this.hitT = 0; this.frame = 0;
    this.last = {};
    this.buildBuyMenu();
    $('buyClose').onclick = () => this.toggleBuy(false);
    $('sbClose').onclick = () => this.toggleScore(false);
    if (!weaponsBound) {
      this.el.weapons.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-w]');
        if (b && !document.body.classList.contains('editing')) { e.preventDefault(); e.stopPropagation(); input.pressed.add('w_' + b.dataset.w); }
      });
      weaponsBound = true;
    }
    // On touch devices the weapon bar lives in the touch layer so it's above the look pad
    if (input.touch) $('touch').appendChild(this.el.weapons); else this.el.hud.appendChild(this.el.weapons);
    this.el.weapons.innerHTML = '';
    game.on((type, d) => this.onEvent(type, d));
  }

  center(text, cls = '', sub = '', t = 3) {
    const c = this.el['center-msg'];
    c.textContent = text; c.className = cls; this.msgT = t;
    this.el['sub-msg'].textContent = sub; this.el['sub-msg'].className = ''; this.subT = t;
  }
  sub(text, t = 2.5, warn = false) { this.el['sub-msg'].textContent = text; this.el['sub-msg'].className = warn ? 'warn' : ''; this.subT = t; }

  onEvent(type, d) {
    const g = this.g, p = g.player;
    if (type === 'roundStart') {
      const mp = g.score.T === g.rules.roundsToWin - 1 || g.score.CT === g.rules.roundsToWin - 1 ? ' · Match point' : '';
      let sub = p.team === 'T' ? (g.bomb.carrier === p ? 'You have the bomb! Plant it at A or B.' : 'Plant the bomb at site A or B.') : 'Defend bombsites A and B.';
      if (p.punishedActive) sub = 'Teamkill penalty: knife only, no buying this round.';
      this.center(`Round ${d.round}${mp}`, '', sub, 4);
      this.el.killfeed.innerHTML = '';
    } else if (type === 'roundEnd') {
      this.center(`${TEAM_NAME[d.winner]} Win`, d.winner, d.reason, g.rules.roundEndDelay);
    } else if (type === 'kill') {
      const div = document.createElement('div');
      const k = d.killer, v = d.victim;
      div.className = (k === p || v === p ? 'me ' : '') + (d.teamkill ? 'tk' : '');
      div.innerHTML = (k && k !== v ? `<span class="${k.team}">${esc(k.name)}</span>` : '') +
        `<span class="w">${ICON[d.weapon] || d.weapon}${d.head ? ' ⌖' : ''}${d.teamkill ? ' TK' : ''}</span><span class="${v.team}">${esc(v.name)}</span>`;
      this.el.killfeed.prepend(div);
      while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
      setTimeout(() => div.remove(), 7000);
      if (v === p) this.center('You died', '', k && k !== p ? `Killed by ${k.name}${k.team === p.team ? ' (teammate)' : ''} · ${ICON[d.weapon] || d.weapon}` : '', 2.5);
      else if (k === p && !d.teamkill) this.sub(`Killed ${v.name}${d.head ? ' (headshot)' : ''}  +$${WEAPONS[d.weapon]?.kill ?? 300}`, 2);
    } else if (type === 'msg') {
      if (d.team && d.team !== p.team) return;
      if (d.big) this.center(d.text, 'T', '', 2.5); else this.sub(d.text, d.warn ? 3.5 : 3, d.warn);
    } else if (type === 'hurt') {
      const vg = this.el['dmg-vignette'];
      vg.style.transition = 'none'; vg.style.opacity = Math.min(1, 0.3 + d.dmg / 60);
      requestAnimationFrame(() => { vg.style.transition = 'opacity 0.5s'; vg.style.opacity = 0; });
      if (d.from && d.from !== p) {
        const ang = Math.atan2(-(d.from.pos.x - p.pos.x), -(d.from.pos.z - p.pos.z)) - p.yaw;
        const dd = this.el['dmg-dir'];
        dd.style.transition = 'none'; dd.style.opacity = 1; dd.style.transform = `rotate(${-ang}rad)`;
        requestAnimationFrame(() => { dd.style.transition = 'opacity 0.8s'; dd.style.opacity = 0; });
      }
    } else if (type === 'shot') {
      if (d.hit) { this.hitT = 0.18; this.el.hitmarker.className = d.team ? 'team' : d.head ? 'head' : ''; }
    } else if (type === 'matchOver') {
      this.hooks.matchOver(d.winner);
    }
  }

  buildBuyMenu() {
    const mk = (parent, it) => {
      const b = document.createElement('button');
      b.className = 'buy-item';
      b.innerHTML = `<b>${it.name}</b><span class="price">$${it.price}</span><div class="stats">${it.stats}</div>`;
      b.onclick = () => { if (this.g.canBuy && this.g.buy(this.g.player, it.id)) SFX.buy(); this.refreshBuy(); };
      parent.appendChild(b);
      return { b, it };
    };
    for (const k of ['buyGuns', 'buyNades', 'buyGear']) this.el[k].innerHTML = '';
    this.buyButtons = [
      ...WEAPON_ORDER.map((id) => { const w = WEAPONS[id]; return mk(this.el.buyGuns, { id, name: w.name, price: w.price, stats: `${w.damage}${w.pellets > 1 ? '×' + w.pellets : ''} dmg · ${w.rpm} rpm · ${w.mag} rds` }); }),
      ...NADE_ORDER.map((id) => { const n = GRENADES[id]; return mk(this.el.buyNades, { id, name: n.name, price: n.price, nade: true, stats: { he: `${n.damage} dmg blast`, flash: 'Blinds anyone looking · max 2', smoke: `${n.duration}s vision block`, molotov: `Fire zone ${n.duration}s` }[id] }); }),
      mk(this.el.buyGear, { id: 'armor', name: 'Kevlar + Helmet', price: ECON.armorPrice, stats: 'Reduces damage taken' }),
      mk(this.el.buyGear, { id: 'kit', name: 'Defuse Kit', price: ECON.kitPrice, stats: 'CT only · defuse in 5s', ct: true }),
    ];
  }

  refreshBuy() {
    const p = this.g.player;
    this.el.buyMoney.textContent = '$' + p.money;
    for (const { b, it } of this.buyButtons) {
      let owned, blocked = false;
      if (it.id === 'armor') owned = p.armor >= 100 && p.helmet;
      else if (it.id === 'kit') owned = p.hasKit;
      else if (it.nade) { owned = p.nades[it.id] >= GRENADES[it.id].max; blocked = p.nadeCount >= MAX_NADES; b.querySelector('b').textContent = `${GRENADES[it.id].name}${p.nades[it.id] ? ` (${p.nades[it.id]})` : ''}`; }
      else owned = !!p.inv[it.id];
      b.classList.toggle('owned', owned);
      b.classList.toggle('hidden', !!it.ct && p.team !== 'CT');
      b.disabled = owned || blocked || p.money < it.price || p.punishedActive;
    }
  }

  toggleBuy(on) {
    if (on === undefined) on = this.el.buy.classList.contains('hidden');
    const p = this.g.player;
    if (on && !this.g.canBuy) {
      this.sub(p.punishedActive ? 'Teamkill penalty: you can\'t buy right now' : p.alive ? 'You can only buy in your spawn at the start of a round' : 'You are dead', 2.5, p.punishedActive);
      return;
    }
    this.el.buy.classList.toggle('hidden', !on);
    if (on) { this.refreshBuy(); input.fire = false; releasePointer(); }
  }

  toggleScore(on) {
    if (on === undefined) on = this.el.scoreboard.classList.contains('hidden');
    this.el.scoreboard.classList.toggle('hidden', !on);
    if (on) this.renderScoreboard();
  }

  renderScoreboard() {
    const g = this.g, p = g.player;
    this.el.sbRound.textContent = `${g.mapDef.name} · Round ${g.round} · T ${g.score.T} - ${g.score.CT} CT`;
    for (const team of ['T', 'CT']) {
      const rows = g.agents.filter((a) => a.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const mine = team === p.team;
      this.el['sb' + team].innerHTML = `<h3>${TEAM_NAME[team]} · ${g.score[team]}</h3><table><tr><th>Name</th><th>K</th><th>D</th><th>TK</th>${mine ? '<th>$</th>' : ''}</tr>` +
        rows.map((a) => `<tr class="${a.alive ? '' : 'dead'} ${a === p ? 'me' : ''}"><td>${esc(a.name)}${g.bomb.carrier === a && mine ? ' · C4' : ''}${a.punishedActive ? ' · knife' : ''}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.teamkills || ''}</td>${mine ? `<td>${a.money}</td>` : ''}</tr>`).join('') + '</table>';
    }
  }

  set(key, el, val, prop = 'textContent') {
    if (this.last[key] === val) return;
    this.last[key] = val; el[prop] = val;
  }

  update(dt) {
    const g = this.g, p = g.player, el = this.el;
    this.frame++;
    if (consume('buy')) this.toggleBuy();
    if (consume('score')) this.toggleScore();
    if (consume('scoreUp')) this.toggleScore(false);
    if (!el.buy.classList.contains('hidden')) { if (!g.canBuy) this.toggleBuy(false); else if (this.frame % 10 === 0) this.refreshBuy(); }
    if (!el.scoreboard.classList.contains('hidden') && this.frame % 30 === 0) this.renderScoreboard();

    // left column under the minimap
    // money + callout sit just right of the minimap
    const mm = el.minimap;
    this.set('lcTop', el.hudLeftCol.style, `${mm.offsetTop}px`, 'top');
    this.set('lcLeft', el.hudLeftCol.style, `${mm.offsetLeft + mm.offsetWidth + 8}px`, 'left');

    this.set('sT', el.scoreT, String(g.score.T));
    this.set('sCT', el.scoreCT, String(g.score.CT));
    const aliveStr = (t) => g.agents.filter((a) => a.team === t).map((a) => (a.alive ? '●' : '○')).join('');
    this.set('aT', el.aliveT, aliveStr('T'));
    this.set('aCT', el.aliveCT, aliveStr('CT'));
    let timerText, low = false;
    if (g.phase === 'freeze') timerText = fmt(g.timer);
    else if (g.phase === 'live') { timerText = fmt(g.timer); low = g.timer < 20; }
    else if (g.bomb.state === 'planted') timerText = 'C4';
    else timerText = g.phase === 'end' ? '--' : '';
    this.set('timer', el.timer, timerText);
    el.timer.classList.toggle('low', low || g.bomb.state === 'planted');
    const bt = g.bomb.state === 'planted' ? `${g.bomb.site} · ${Math.max(0, g.bomb.timer).toFixed(1)}s` : '';
    el.bombTimer.classList.toggle('hidden', !bt);
    if (bt) el.bombTimer.lastElementChild.textContent = bt;
    const pun = p.punishedActive ? `TEAMKILL PENALTY · knife only · no buying or money${p.punished ? ` · ${p.punished + 1} rounds left` : ' · last round'}` : '';
    el.punish.classList.toggle('hidden', !pun);
    this.set('pun', el.punish, pun);

    const v = this.ctrl.spec || p;
    this.set('money', el.money, '$' + p.money);
    const co = v.alive ? calloutAt(v.pos.x, v.pos.z) : null;
    this.set('callout', el.callout, co ? co.name : '');
    this.set('hp', el.hp, String(Math.max(0, Math.ceil(v.hp))));
    el.hp.parentElement.classList.toggle('low', v.hp <= 25);
    this.set('armor', el.armor, String(Math.ceil(v.armor)));
    el.bombIcon.classList.toggle('hidden', g.bomb.carrier !== v);
    el.kitIcon.classList.toggle('hidden', !v.hasKit);
    const w = v.w;
    if (v.weapon === 'knife') { this.set('mag', el.mag, '∞'); this.set('res', el.reserve, ''); }
    else if (v.weapon === 'nade') { this.set('mag', el.mag, String(v.nades[v.nadeSel] || 0)); this.set('res', el.reserve, String(v.nadeCount)); }
    else {
      const inv = v.inv[v.weapon] || { mag: 0, reserve: 0 };
      this.set('mag', el.mag, v.reloadT > 0 ? '…' : String(inv.mag));
      this.set('res', el.reserve, String(inv.reserve));
      el.ammo.classList.toggle('empty', inv.mag === 0);
    }
    this.set('wn', el.wname, v.weapon === 'nade' ? GRENADES[v.nadeSel]?.name || 'Grenade' : w.name);

    // weapon bar: primary / pistol / knife / grenades
    const key = p.alive ? `${Object.keys(p.inv).join(',')}|${p.weapon}|${p.nadeSel}|${NADE_ORDER.map((n) => p.nades[n]).join('')}` : '';
    if (key !== this.last.inv) {
      this.last.inv = key;
      if (!p.alive) el.weapons.innerHTML = '';
      else {
        const ids = [p.primary, p.inv.pistol ? 'pistol' : null, 'knife'].filter(Boolean);
        const nades = NADE_ORDER.filter((n) => p.nades[n] > 0);
        let html = nades.length ? `<div class="wrow">${nades.map((n) => `<button data-w="${n}" class="${p.weapon === 'nade' && p.nadeSel === n ? 'on' : ''}">${NADE_SHORT[n]}${p.nades[n] > 1 ? '×' + p.nades[n] : ''}</button>`).join('')}</div>` : '';
        html += `<div class="wrow">${ids.map((id) => `<button data-w="${id}" class="${p.weapon === id ? 'on' : ''}">${ICON[id]}</button>`).join('')}</div>`;
        el.weapons.innerHTML = html;
      }
    }

    // crosshair + scope
    const scoped = v.alive && v.scoped && w.zoomFov;
    el.scope.classList.toggle('hidden', !scoped);
    el.crosshair.style.display = scoped || !v.alive ? 'none' : '';
    if (v.alive && !scoped) {
      const px = Math.tan(g.spreadOf(v)) * (window.innerHeight / 2) / Math.tan((g.camera.fov * Math.PI / 180) / 2);
      el.crosshair.style.setProperty('--gap', `${Math.round(3 + px)}px`);
    }
    this.hitT -= dt;
    el.hitmarker.style.opacity = this.hitT > 0 ? 1 : 0;
    // flashbang whiteout (full white while blindT > 1s, then fades)
    const bl = v.alive ? Math.max(0, v.blindT || 0) : 0;
    el.flashbang.style.opacity = bl > 1 ? 1 : bl.toFixed(3);

    let hint = '';
    const canPlant = !!g.plantSite(p), canDef = g.canDefuse(p);
    const b = g.bomb;
    if (p.alive) {
      if (canPlant) hint = input.touch ? 'Hold USE to plant the bomb' : 'Hold E to plant the bomb';
      else if (canDef) hint = input.touch ? 'Hold USE to defuse' : 'Hold E to defuse';
      else if (g.canBuy && g.phase === 'freeze' && !input.touch) hint = 'Press B to buy';
      else if (p.weapon === 'nade') hint = input.touch ? 'Fire: throw · Scope: lob' : 'Click: throw · Right-click: lob';
    }
    if ((b.planter === p && b.plantP > 0) || (b.defuser === p && b.defuseP > 0)) hint = '';
    this.set('hint', el.hint, hint);
    el.btnUse.classList.toggle('hidden', !(canPlant || canDef));
    el.btnScope.classList.toggle('hidden', !(p.alive && (w.scoped || p.weapon === 'nade')));
    el.btnBuy.classList.toggle('hidden', !g.canBuy);

    let prog = null;
    if (b.planter === v && b.plantP > 0) prog = { label: 'Planting…', k: b.plantP / g.rules.plantTime };
    else if (b.defuser && b.defuseP > 0 && (b.defuser === v || b.defuser.team === p.team)) prog = { label: `${b.defuser === p ? 'Defusing' : b.defuser.name + ' defusing'}…`, k: b.defuseP / (b.defuser.hasKit ? g.rules.defuseTimeKit : g.rules.defuseTime) };
    el.progress.classList.toggle('hidden', !prog);
    if (prog) { el.progress.firstElementChild.textContent = prog.label; el.progress.querySelector('.bar div').style.width = (prog.k * 100).toFixed(1) + '%'; }

    const spec = this.ctrl.spec;
    el.spectating.classList.toggle('hidden', !spec);
    if (spec) this.set('spec', el.spectating, `Spectating ${spec.name} · tap to switch`);

    this.msgT -= dt; this.subT -= dt;
    if (this.msgT <= 0 && el['center-msg'].textContent) el['center-msg'].textContent = '';
    if (this.subT <= 0 && el['sub-msg'].textContent) el['sub-msg'].textContent = '';
    if (this.frame % 2 === 0) this.drawMinimap();
  }

  drawMinimap() {
    const g = this.g, p = g.player, ctx = this.mm, S = 320, k = this.mmK;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.mmBase, 0, 0);
    const dot = (x, z, color, r = 6) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x * k, z * k, r, 0, Math.PI * 2); ctx.fill(); };
    for (const s of g.grenades.smokes) { ctx.fillStyle = 'rgba(220,220,220,0.5)'; ctx.beginPath(); ctx.arc(s.x * k, s.z * k, Math.max(2, s.w.r * k), 0, 7); ctx.fill(); }
    for (const f of g.grenades.fires) { ctx.fillStyle = 'rgba(255,120,30,0.55)'; ctx.beginPath(); ctx.arc(f.x * k, f.z * k, f.r * k, 0, 7); ctx.fill(); }
    for (const a of g.agents) {
      if (a === p) continue;
      if (a.team === p.team) {
        if (a.alive) dot(a.pos.x, a.pos.z, a.team === 'T' ? '#e0a33a' : '#5aa0ff');
        else { ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; const x = a.pos.x * k, z = a.pos.z * k; ctx.beginPath(); ctx.moveTo(x - 5, z - 5); ctx.lineTo(x + 5, z + 5); ctx.moveTo(x + 5, z - 5); ctx.lineTo(x - 5, z + 5); ctx.stroke(); }
      } else if (a.alive && a.spotted > 0) dot(a.pos.x, a.pos.z, '#ff3030');
    }
    const b = g.bomb;
    let bp = null;
    if (b.state === 'planted' || (b.state === 'dropped' && p.team === 'T')) bp = b.pos;
    else if (b.state === 'carried' && b.carrier && p.team === 'T') bp = b.carrier.pos;
    if (bp) { ctx.fillStyle = b.state === 'planted' && (this.frame >> 4) % 2 ? '#ff2020' : '#ffd23a'; ctx.fillRect(bp.x * k - 5, bp.z * k - 5, 10, 10); }
    const view = this.ctrl.spec || p;
    if (view.alive) {
      ctx.save(); ctx.translate(view.pos.x * k, view.pos.z * k); ctx.rotate(-view.yaw);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
