// Peer-to-peer multiplayer over WebRTC (PeerJS). The host's browser runs the real game;
// friends connect with a 5-letter room code. PeerJS's free cloud server only introduces the
// players (signaling); game traffic flows directly between devices, or through PeerJS's
// free relay when a mobile network blocks direct connections.
import { snapshot, selfState } from './netgame.js';

export const NET_VERSION = 1;
const PREFIX = 'camstrike-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SNAP_HZ = 20, STATE_HZ = 30;

// ?peer=host:port points at a self-hosted PeerJS server (used for local testing)
function peerOptions() {
  const o = { debug: 1 };
  const q = new URLSearchParams(location.search).get('peer');
  if (q) { const [host, port] = q.split(':'); Object.assign(o, { host, port: +port || 9000, path: '/', secure: location.protocol === 'https:' && host !== 'localhost' }); }
  return o;
}
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const PeerCtor = () => {
  if (!window.Peer) throw new Error('Multiplayer library failed to load. Check your connection and reload.');
  return window.Peer;
};
function friendlyError(err) {
  const t = err?.type || '';
  if (t === 'peer-unavailable') return 'Room not found. Check the code, or ask your friend to host again.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Can\'t reach the matchmaking server. Check your internet connection.';
  if (t === 'browser-incompatible') return 'This browser doesn\'t support online play (WebRTC).';
  return err?.message || String(err);
}

// ============================ HOST ============================
export class NetHost {
  constructor(me, hooks) {
    this.me = me;                        // { name, outfit, loadout }
    this.hooks = hooks;                  // { onLobby(lobby), onError(msg), onPeerLeft(name) }
    this.role = 'host';
    this.players = [{ pid: 'host', name: me.name, team: 'T', outfit: me.outfit, loadout: me.loadout }];
    this.conns = new Map();              // pid -> { conn, latency, out: [] }
    this.settings = {};
    this.game = null;
    this.snapT = 0; this.pingT = 0; this.flyIds = new WeakMap(); this.flyN = 0;
  }

  open() {
    return new Promise((resolve, reject) => {
      const Peer = PeerCtor();
      const tryOpen = (attempt) => {
        const code = newCode();
        const peer = new Peer(PREFIX + code, peerOptions());
        peer.on('open', () => { this.peer = peer; this.code = code; resolve(code); });
        peer.on('connection', (conn) => this.accept(conn));
        peer.on('error', (err) => {
          if (err.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryOpen(attempt + 1); return; }
          if (!this.peer) reject(new Error(friendlyError(err))); else this.hooks.onError?.(friendlyError(err));
        });
        peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* peer destroyed */ } });
      };
      tryOpen(0);
    });
  }

  accept(conn) {
    conn.on('open', () => {
      if (this.game) { conn.send({ t: 'deny', reason: 'The match already started. Ask the host to go back to the lobby.' }); setTimeout(() => conn.close(), 500); return; }
      if (this.players.length >= 10) { conn.send({ t: 'deny', reason: 'The lobby is full (10 players).' }); setTimeout(() => conn.close(), 500); return; }
    });
    conn.on('data', (m) => this.onData(conn, m));
    conn.on('close', () => this.drop(conn.peer));
    conn.on('error', () => this.drop(conn.peer));
  }

  onData(conn, m) {
    const pid = conn.peer;
    if (m.t === 'hello') {
      if (m.v !== NET_VERSION) { conn.send({ t: 'deny', reason: 'Your game version is different from the host\'s. Reload the page to update.' }); return; }
      if (this.game || this.players.length >= 10) return;
      const count = (t) => this.players.filter((p) => p.team === t).length;
      const team = count('T') <= count('CT') ? 'T' : 'CT';
      this.players.push({ pid, name: String(m.name || 'Player').slice(0, 16), team, outfit: m.outfit ?? 0, loadout: m.loadout || {} });
      this.conns.set(pid, { conn, latency: 0.08, out: [] });
      conn.send({ t: 'welcome', pid });
      this.broadcastLobby();
      return;
    }
    const c = this.conns.get(pid);
    if (!c) return;
    if (m.t === 'team' && !this.game) { const p = this.players.find((x) => x.pid === pid); if (p && (m.team === 'T' || m.team === 'CT')) p.team = m.team; this.broadcastLobby(); }
    else if (m.t === 'pong') c.latency = Math.max(0.01, (performance.now() - m.ts) / 2000);
    else if (this.game) {
      const a = this.game.agents.find((x) => x.pid === pid && x.remote);
      if (!a) return;
      if (m.t === 'st') this.game.applyRemoteState(a, m);
      else if (m.t === 'act') this.game.remoteAction(a, m, c.latency);
    }
  }

  drop(pid) {
    if (!this.conns.has(pid)) return;
    this.conns.delete(pid);
    const p = this.players.find((x) => x.pid === pid);
    this.players = this.players.filter((x) => x.pid !== pid);
    if (this.game) {
      const a = this.game.agents.find((x) => x.pid === pid && x.remote);
      if (a) { this.game.botify(a); this.game.emit('msg', { text: `${p?.name || 'A player'} left · a bot took over` }); }
    } else this.broadcastLobby();
    this.hooks.onPeerLeft?.(p?.name);
  }

  setTeam(team) { this.players[0].team = team; this.broadcastLobby(); }
  setSettings(s) { this.settings = { ...this.settings, ...s }; this.broadcastLobby(); }
  lobby() { return { code: this.code, players: this.players.map(({ pid, name, team }) => ({ pid, name, team })), settings: this.settings, host: 'host' }; }
  broadcastLobby() {
    const l = this.lobby();
    for (const c of this.conns.values()) c.conn.send({ t: 'lobby', lobby: l });
    this.hooks.onLobby?.(l);
  }

  // Humans for buildRoster(): host is local, friends are remote
  humans() {
    return this.players.map((p) => ({ name: p.name, team: p.team, outfit: p.outfit, loadout: p.loadout, local: p.pid === 'host', pid: p.pid === 'host' ? null : p.pid }));
  }

  startMatch(game, opts) {
    this.game = game;
    const roster = game.roster.map((r) => ({ ...r, local: false }));
    for (const [pid, c] of this.conns) c.conn.send({ t: 'start', roster, opts, you: pid });
    game.on((type, d) => this.forward(type, d));
    // round 1 already started inside new Game(): tell clients where everyone spawned
    this.forward('roundStart', { round: game.round });
    if (game.phase === 'live') this.forward('live');
  }

  // Game events -> clients
  forward(type, d) {
    const g = this.game, N = (a) => (a ? a.nid : -1);
    const all = (ev) => { for (const c of this.conns.values()) c.out.push(ev); };
    const to = (agent, ev) => { if (agent?.remote) this.conns.get(agent.pid)?.out.push(ev); };
    switch (type) {
      case 'roundStart': all({ e: 'rs', round: d.round, sp: g.agents.map((a) => [a.nid, +a.pos.x.toFixed(3), +a.pos.y.toFixed(3), +a.pos.z.toFixed(3), +a.yaw.toFixed(3), a.spawnSeq]) }); break;
      case 'live': all({ e: 'live' }); break;
      case 'roundEnd': all({ e: 're', winner: d.winner, reason: d.reason }); break;
      case 'kill': all({ e: 'k', killer: N(d.killer), victim: N(d.victim), weapon: d.weapon, head: !!d.head, tk: !!d.teamkill, imp: d.impulse }); break;
      case 'msg': if (d.to) to(d.to, { e: 'm', text: d.text, big: d.big, warn: d.warn, team: d.team }); else all({ e: 'm', text: d.text, big: d.big, warn: d.warn, team: d.team }); break;
      case 'hurt': to(d.agent, { e: 'hu', nid: d.agent.nid, from: N(d.from), dmg: d.dmg }); break;
      case 'shot': if (d.hit) to(d.agent, { e: 'sh', hit: d.hit, head: d.head, team: d.team }); break;
      case 'fxShot': all({ e: 'fs', nid: d.a.nid, w: d.weapon, m: d.muzzle, e2: d.ends }); break;
      case 'fxMelee': all({ e: 'fm', nid: d.a.nid }); break;
      case 'fxDetonate': all({ e: 'fd', type: d.type, x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2) }); break;
      case 'flashed': to(d.agent, { e: 'fl', nid: d.agent.nid, t: d.t }); break;
      case 'planted': all({ e: 'pl', site: d.site }); break;
      case 'explode': all({ e: 'ex' }); break;
      case 'matchOver': all({ e: 'mo', winner: d.winner }); break;
    }
  }

  tick(dt) {
    if (!this.game) return;
    this.snapT -= dt; this.pingT -= dt;
    const snap = this.snapT <= 0 ? snapshot(this.game, (n) => { if (!this.flyIds.has(n)) this.flyIds.set(n, ++this.flyN); return this.flyIds.get(n); }) : null;
    if (snap) this.snapT = 1 / SNAP_HZ;
    for (const [pid, c] of this.conns) {
      if (c.out.length) { c.conn.send({ t: 'ev', list: c.out }); c.out = []; }
      if (snap) {
        const me = this.game.agents.find((a) => a.pid === pid && a.remote);
        c.conn.send(me ? { ...snap, me: selfState(me) } : snap);
      }
      if (this.pingT <= 0) c.conn.send({ t: 'ping', ts: performance.now() });
    }
    if (this.pingT <= 0) this.pingT = 1;
  }

  // Match over: everyone goes back to the lobby
  backToLobby() {
    this.game = null;
    for (const c of this.conns.values()) { c.out = []; c.conn.send({ t: 'end' }); }
    this.broadcastLobby();
  }

  close() {
    for (const c of this.conns.values()) { try { c.conn.send({ t: 'bye' }); } catch { /* closing */ } }
    setTimeout(() => this.peer?.destroy(), 150);
  }
}

// ============================ CLIENT ============================
export class NetClient {
  constructor(me, hooks) {
    this.me = me;
    this.hooks = hooks;                  // { onLobby, onStart(roster, opts, pid), onEnd(), onClose(reason), onError }
    this.role = 'client';
    this.game = null; this.stT = 0; this.pending = [];
  }

  join(code) {
    code = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return new Promise((resolve, reject) => {
      const Peer = PeerCtor();
      const peer = new Peer(undefined, peerOptions());
      this.peer = peer;
      let done = false;
      const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); peer.destroy(); } else this.hooks.onClose?.(msg); };
      const timer = setTimeout(() => fail('Couldn\'t connect to the room. Check the code and try again.'), 15000);
      peer.on('error', (err) => fail(friendlyError(err)));
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        this.conn = conn;
        conn.on('open', () => conn.send({ t: 'hello', v: NET_VERSION, name: this.me.name, outfit: this.me.outfit, loadout: this.me.loadout }));
        conn.on('data', (m) => {
          if (m.t === 'welcome') { this.pid = m.pid; this.code = code; done = true; clearTimeout(timer); resolve(code); return; }
          if (m.t === 'deny') { clearTimeout(timer); fail(m.reason); return; }
          this.onData(m);
        });
        conn.on('close', () => { clearTimeout(timer); if (!this.closing) fail('The host closed the game.'); });
      });
    });
  }

  onData(m) {
    switch (m.t) {
      case 'lobby': this.hooks.onLobby?.(m.lobby); break;
      case 'start': this.hooks.onStart?.(m.roster.map((r) => ({ ...r, local: r.pid === m.you })), m.opts); break;
      case 'snap': this.game?.applySnapshot(m); break;
      case 'ev': if (this.game) for (const e of m.list) this.game.applyEvent(e); break;
      case 'ping': this.conn.send({ t: 'pong', ts: m.ts }); break;
      case 'end': this.game = null; this.hooks.onEnd?.(); break;
      case 'bye': this.closing = true; this.hooks.onClose?.('The host left the game.'); break;
    }
  }

  send(m) { if (this.conn?.open) this.conn.send(m); }
  setTeam(team) { this.send({ t: 'team', team }); }

  tick(dt) {
    if (!this.game) return;
    this.stT -= dt;
    if (this.stT <= 0) { this.stT = 1 / STATE_HZ; this.send(this.game.stateMsg()); }
  }

  close() { this.closing = true; try { this.conn?.close(); } catch { /* ignore */ } setTimeout(() => this.peer?.destroy(), 150); }
}
