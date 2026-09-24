import { WEAPONS, WEAPON_ORDER, ECON, RULES } from './config.js';
import { input, consume, releasePointer } from './input.js';
import * as MAP from './map.js';
import * as SFX from './audio.js';

const $ = (id) => document.getElementById(id);
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const TEAM_NAME = { T: 'Terrorists', CT: 'Counter-Terrorists' };
const WEAPON_ICON = { pistol: 'P-9', smg: 'Viper', shotgun: 'Breacher', rifle: 'AR-47', sniper: 'Longshot', bomb: '💥' };

export class HUD {
  constructor(game, ctrl, hooks) {
    this.g = game; this.ctrl = ctrl; this.hooks = hooks;
    this.el = {};
    for (const id of ['hud', 'minimap', 'money', 'scoreT', 'scoreCT', 'aliveT', 'aliveCT', 'timer', 'bombTimer', 'killfeed', 'center-msg', 'sub-msg', 'hint', 'progress',
      'crosshair', 'hitmarker', 'hp', 'armor', 'bombIcon', 'kitIcon', 'ammo', 'mag', 'reserve', 'wname', 'weapons', 'spectating', 'dmg-vignette', 'dmg-dir', 'scope',
      'btnUse', 'btnScope', 'btnBuy', 'buy', 'buyGrid', 'buyMoney', 'scoreboard', 'sbT', 'sbCT', 'sbRound']) this.el[id] = $(id);
    this.mm = this.el.minimap.getContext('2d');
    this.mmBase = MAP.renderMinimap(300);
    this.msgT = 0; this.subT = 0; this.hitT = 0; this.frame = 0;
    this.last = {};
    this.buildBuyMenu();

    $('buyClose').onclick = () => this.toggleBuy(false);
    $('sbClose').onclick = () => this.toggleScore(false);
    this.el.weapons.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-w]');
      if (b) { e.preventDefault(); e.stopPropagation(); input.pressed.add('w_' + b.dataset.w); }
    });

    game.on((type, d) => this.onEvent(type, d));
  }

  center(text, cls = '', sub = '', t = 3) {
    const c = this.el['center-msg'];
    c.textContent = text; c.className = cls; this.msgT = t;
    this.el['sub-msg'].textContent = sub; this.subT = t;
  }
  sub(text, t = 2.5) { this.el['sub-msg'].textContent = text; this.subT = t; }

  onEvent(type, d) {
    const g = this.g, p = g.player;
    if (type === 'roundStart') {
      const last = g.round === 2 * RULES.roundsToWin - 1 ? ' - Match point' : '';
      this.center(`Round ${d.round}${last}`, '', p.team === 'T' ? (g.bomb.carrier === p ? 'You have the bomb! Plant it at A or B.' : 'Plant the bomb at site A or B.') : 'Defend bombsites A and B.', 4);
      if (input.touch && g.canBuy && d.round === 1) this.sub('Tap BUY to purchase weapons', 4);
      this.el.killfeed.innerHTML = '';
    } else if (type === 'roundEnd') {
      const mine = d.winner === p.team;
      this.center(`${TEAM_NAME[d.winner]} Win`, d.winner, d.reason + (mine ? '' : ''), RULES.roundEndDelay);
    } else if (type === 'kill') {
      const div = document.createElement('div');
      const k = d.killer, v = d.victim;
      if (k === p || v === p) div.className = 'me';
      div.innerHTML = (k ? `<span class="${k.team}">${esc(k.name)}</span>` : '') +
        `<span class="w">${WEAPON_ICON[d.weapon] || d.weapon}${d.head ? ' ⌖' : ''}</span><span class="${v.team}">${esc(v.name)}</span>`;
      this.el.killfeed.prepend(div);
      while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
      setTimeout(() => div.remove(), 7000);
      if (v === p) this.center('You died', '', k ? `Killed by ${k.name} (${WEAPON_ICON[d.weapon] || d.weapon})` : '', 2.5);
      else if (k === p) this.sub(`Killed ${v.name}${d.head ? ' (headshot)' : ''}  +$${WEAPONS[d.weapon]?.kill ?? 0}`, 2);
    } else if (type === 'msg') {
      if (d.team && d.team !== p.team) return;
      if (d.big) this.center(d.text, 'T', '', 2.5); else this.sub(d.text, 3);
    } else if (type === 'hurt') {
      const vg = this.el['dmg-vignette'];
      vg.style.transition = 'none'; vg.style.opacity = Math.min(1, 0.3 + d.dmg / 60);
      requestAnimationFrame(() => { vg.style.transition = 'opacity 0.5s'; vg.style.opacity = 0; });
      if (d.from) {
        const dx = d.from.pos.x - p.pos.x, dz = d.from.pos.z - p.pos.z;
        const ang = Math.atan2(-dx, -dz) - p.yaw;
        const dd = this.el['dmg-dir'];
        dd.style.transition = 'none'; dd.style.opacity = 1; dd.style.transform = `rotate(${-ang}rad)`;
        requestAnimationFrame(() => { dd.style.transition = 'opacity 0.8s'; dd.style.opacity = 0; });
      }
    } else if (type === 'shot') {
      if (d.hit) { this.hitT = 0.18; this.el.hitmarker.className = d.head ? 'head' : ''; }
    } else if (type === 'matchOver') {
      this.hooks.matchOver(d.winner);
    }
  }

  buildBuyMenu() {
    const grid = this.el.buyGrid;
    grid.innerHTML = '';
    const items = WEAPON_ORDER.map((id) => {
      const w = WEAPONS[id];
      return { id, name: w.name, price: w.price, stats: `${w.damage}${w.pellets > 1 ? '×' + w.pellets : ''} dmg · ${w.rpm} rpm · ${w.mag} rds` };
    });
    items.push({ id: 'armor', name: 'Kevlar + Helmet', price: ECON.armorPrice, stats: 'Reduces damage taken' });
    items.push({ id: 'kit', name: 'Defuse Kit', price: ECON.kitPrice, stats: 'CT only · defuse in 5s', ct: true });
    this.buyButtons = items.map((it) => {
      const b = document.createElement('button');
      b.className = 'buy-item';
      b.innerHTML = `<b>${it.name}</b><span class="price">$${it.price}</span><div class="stats">${it.stats}</div>`;
      b.onclick = () => {
        if (!this.g.canBuy) return;
        if (this.g.buy(this.g.player, it.id)) SFX.buy();
        this.refreshBuy();
      };
      grid.appendChild(b);
      return { b, it };
    });
  }

  refreshBuy() {
    const p = this.g.player;
    this.el.buyMoney.textContent = '$' + p.money;
    for (const { b, it } of this.buyButtons) {
      const owned = it.id === 'armor' ? (p.armor >= 100 && p.helmet) : it.id === 'kit' ? p.hasKit : !!p.inv[it.id];
      b.classList.toggle('owned', owned);
      b.classList.toggle('hidden', !!it.ct && p.team !== 'CT');
      b.disabled = owned || p.money < it.price;
    }
  }

  toggleBuy(on) {
    if (on === undefined) on = this.el.buy.classList.contains('hidden');
    if (on && !this.g.canBuy) { this.sub(this.g.player.alive ? 'You can only buy in your spawn zone at the start of a round' : 'You are dead'); return; }
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
    this.el.sbRound.textContent = `Round ${g.round} · T ${g.score.T} - ${g.score.CT} CT`;
    for (const team of ['T', 'CT']) {
      const rows = g.agents.filter((a) => a.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const showMoney = team === p.team;
      this.el['sb' + team].innerHTML = `<h3>${TEAM_NAME[team]} · ${g.score[team]}</h3><table><tr><th>Name</th><th>K</th><th>D</th>${showMoney ? '<th>$</th>' : ''}</tr>` +
        rows.map((a) => `<tr class="${a.alive ? '' : 'dead'} ${a === p ? 'me' : ''}"><td>${esc(a.name)}${g.bomb.carrier === a && team === p.team ? ' 💣' : ''}</td><td>${a.kills}</td><td>${a.deaths}</td>${showMoney ? `<td>${a.money}</td>` : ''}</tr>`).join('') + '</table>';
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

    // scores / timer
    this.set('sT', el.scoreT, String(g.score.T));
    this.set('sCT', el.scoreCT, String(g.score.CT));
    const aliveStr = (t) => { const all = g.agents.filter((a) => a.team === t); return all.map((a) => a.alive ? '●' : '○').join(''); };
    this.set('aT', el.aliveT, aliveStr('T'));
    this.set('aCT', el.aliveCT, aliveStr('CT'));
    let timerText, low = false;
    if (g.phase === 'freeze') timerText = fmt(g.timer);
    else if (g.phase === 'live') { timerText = fmt(g.timer); low = g.timer < 20; }
    else if (g.bomb.state === 'planted') { timerText = '💣'; }
    else timerText = g.phase === 'end' ? '--' : '';
    this.set('timer', el.timer, timerText);
    el.timer.classList.toggle('low', low);
    const bt = g.bomb.state === 'planted' ? `${g.bomb.site} · ${Math.max(0, g.bomb.timer).toFixed(1)}s` : '';
    el.bombTimer.classList.toggle('hidden', !bt);
    if (bt) el.bombTimer.lastElementChild.textContent = bt;

    // vitals of the viewed agent
    const v = this.ctrl.spec || p;
    this.set('money', el.money, '$' + p.money);
    this.set('hp', el.hp, String(Math.max(0, Math.ceil(v.hp))));
    el.hp.parentElement.classList.toggle('low', v.hp <= 25);
    this.set('armor', el.armor, String(Math.ceil(v.armor)));
    el.bombIcon.classList.toggle('hidden', g.bomb.carrier !== v);
    el.kitIcon.classList.toggle('hidden', !v.hasKit);
    const inv = v.inv[v.weapon] || { mag: 0, reserve: 0 };
    this.set('mag', el.mag, v.reloadT > 0 ? '…' : String(inv.mag));
    this.set('res', el.reserve, String(inv.reserve));
    this.set('wn', el.wname, v.w.name);
    el.ammo.classList.toggle('empty', inv.mag === 0);

    // weapon buttons
    const invKey = p.alive ? Object.keys(p.inv).join(',') + '|' + p.weapon : '';
    if (invKey !== this.last.inv) {
      this.last.inv = invKey;
      const ids = p.alive ? [p.primary, 'pistol'].filter(Boolean) : [];
      el.weapons.innerHTML = ids.map((id, i) => `<button data-w="${id}" class="${p.weapon === id ? 'on' : ''}">${i + 1} · ${WEAPONS[id].name}</button>`).join('');
    }

    // crosshair
    const scoped = v.alive && v.scoped && v.w.zoomFov;
    el.scope.classList.toggle('hidden', !scoped);
    el.crosshair.style.display = scoped || !v.alive ? 'none' : '';
    if (v.alive && !scoped) {
      const cam = g.camera;
      const px = Math.tan(g.spreadOf(v)) * (window.innerHeight / 2) / Math.tan((cam.fov * Math.PI / 180) / 2);
      el.crosshair.style.setProperty('--gap', `${Math.round(3 + px)}px`);
    }
    this.hitT -= dt;
    el.hitmarker.style.opacity = this.hitT > 0 ? 1 : 0;

    // context hints + touch buttons
    let hint = '';
    const canPlant = !!g.plantSite(p), canDef = g.canDefuse(p);
    if (p.alive) {
      if (canPlant) hint = input.touch ? 'Hold USE to plant the bomb' : 'Hold E to plant the bomb';
      else if (canDef) hint = input.touch ? 'Hold USE to defuse' : 'Hold E to defuse';
      else if (g.canBuy && g.phase === 'freeze') hint = input.touch ? '' : 'Press B to buy';
    }
    const b = g.bomb;
    if ((b.planter === p && b.plantP > 0) || (b.defuser === p && b.defuseP > 0)) hint = '';
    this.set('hint', el.hint, hint);
    el.btnUse.classList.toggle('hidden', !(canPlant || canDef));
    el.btnScope.classList.toggle('hidden', !(p.alive && p.w.scoped));
    el.btnBuy.classList.toggle('hidden', !g.canBuy);

    // plant/defuse progress
    let prog = null;
    if (b.planter === v && b.plantP > 0) prog = { label: 'Planting…', k: b.plantP / RULES.plantTime };
    else if (b.defuser && b.defuseP > 0 && (b.defuser === v || b.defuser.team === p.team)) prog = { label: `${b.defuser === p ? 'Defusing' : b.defuser.name + ' defusing'}…`, k: b.defuseP / (b.defuser.hasKit ? RULES.defuseTimeKit : RULES.defuseTime) };
    el.progress.classList.toggle('hidden', !prog);
    if (prog) { el.progress.firstElementChild.textContent = prog.label; el.progress.querySelector('.bar div').style.width = (prog.k * 100).toFixed(1) + '%'; }

    // spectating
    const spec = this.ctrl.spec;
    el.spectating.classList.toggle('hidden', !spec);
    if (spec) this.set('spec', el.spectating, `Spectating ${spec.name} · tap to switch`);

    // messages
    this.msgT -= dt; this.subT -= dt;
    if (this.msgT <= 0 && el['center-msg'].textContent) el['center-msg'].textContent = '';
    if (this.subT <= 0 && el['sub-msg'].textContent) el['sub-msg'].textContent = '';

    if (this.frame % 2 === 0) this.drawMinimap();
  }

  drawMinimap() {
    const g = this.g, p = g.player, ctx = this.mm, S = 300, k = S / (MAP.W * MAP.CELL);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.mmBase, 0, 0);
    const dot = (x, z, color, r = 6) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x * k, z * k, r, 0, Math.PI * 2); ctx.fill(); };
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
    // player arrow
    const view = this.ctrl.spec || p;
    if (view.alive) {
      const x = view.pos.x * k, z = view.pos.z * k, yaw = view.yaw;
      ctx.save(); ctx.translate(x, z); ctx.rotate(-yaw);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
