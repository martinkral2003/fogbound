// v0.7 MQTT multiplayer: deterministic LOCKSTEP, not host-broadcast. Both peers run the FULL simulation locally and stay
// in sync by exchanging only player INPUTS, never game state. This works because the sim never touches Math.random()
// (grepped 2026-11-01: it only appears in render.js/worldview.js/towns_view.js, all visual-only effects that don't feed
// back into st) - everything that affects the outcome goes through the seeded st.rng(). So two peers calling createGame()
// with the same seed/options and feeding step() the same input sequence in the same order produce identical results,
// with no need to ever serialize the (large: nav grid, every building/unit) game state over the wire.
//
// This is simpler than ../gamee/game.js's pattern (host runs the sim, broadcasts a hand-picked per-frame snapshot) because
// that snapshot would be a real design problem here (see the TODO this file used to carry); lockstep sidesteps it.
//
// IMPORTANT, found 2026-11-01 while testing this: the sim is NOT perfectly deterministic in practice, despite using no
// raw Math.random(). Two independent createGame(same seed) + step() runs fed the IDENTICAL input sequence (verified with
// zero networking involved at all - see tools/v7-netplay-test.mjs's local-double-run check) can still diverge by about a
// meter of hero position after a few seconds, usually traced to ONE AI-controlled team taking a slightly different path
// (root cause not found - not Date.now()/performance.now(), not Math.random(); a stable .sort() by distance is the only
// sort in ai_combat.js's target selection, so the actual source is still open). This is a pre-existing sim/ai.js property,
// not something this networking layer causes. Mitigation: publishSync() below is a cheap, periodic, host-authoritative
// correction for just the 4 heroes' x/z/hp, so visible drift self-corrects every few seconds instead of compounding for
// an entire match. It does NOT correct monsters/servants/buildings - full-world drift is still possible and unfixed.
// Whoever wants true bit-exact lockstep should root-cause the actual divergence source first (start from the repro in
// tools/v7-netplay-test.mjs's companion local test) rather than trust this comment's guesses.
//
// Protocol, topics under `fogbound-<room>/`:
//   lobby  (retained) - host publishes {players:[{id,name,bg}], ...}. Clients subscribe, never publish it.
//   join / leave        - a client announces itself to the host / leaving. Host only subscribes.
//   start  (retained) - host publishes {seed, bgs, diff, factions, humans} ONCE, when both sides are ready. Both peers
//                        then call createGame with THESE EXACT options (humans = the two hero team ids being networked).
//   cmd                 - EITHER side publishes {id, team, tick, input} every sim tick, qos 1 (the public broker retries
//                          delivery instead of silently dropping a lost packet, which would otherwise stall the match).
//
// Lockstep mechanics: each session keeps a per-tick input buffer (tick -> {teamId: input}). Every sim tick it (a)
// publishes its OWN hero team's live input for tick (localTick + DELAY) and increments localTick, and (b) the caller
// only steps the sim for `simTick` once hasTick(simTick, humanTeams) is true (AI teams are never sent - both sides
// compute aiInput() locally and identically). DELAY ticks (default 5, ~167ms at the sim's 30Hz) of input lag absorb
// normal broker latency/jitter so the match basically never has to pause; hasTick() returning false IS a real stall
// (peer send was late/lost even past the delay budget) and the caller should show a "waiting for <peer>" indicator
// rather than guess at the missing input.
//
// Usage (see main.js for the actual wiring): one session per tab. Host calls connect(code,true), then publishLobby()
// as players join, then startGame(opts) once ready. The client calls connect(code,false) and waits for onStart. Both
// sides then createGame(startOpts), call beginLockstep(myTeamId, startOpts.humans), and each sim tick: queueLocalInput
// (controls.input) once, then only call step() when hasTick(simTick, humanTeams) - pulling the per-team inputs array
// from inputsAt(simTick, st.teams, humanTeams, aiFn).

export const DELAY = 9; // ticks of input lag (~300ms at 1/30s) - must comfortably exceed BATCH_EVERY+WINDOW below
const BATCH_EVERY = 3; // send a 'cmd' message every N ticks, not every tick (public brokers rate-limit/drop a 30/s-per-peer stream)
const WINDOW = 6;       // ...but each message repeats the last WINDOW ticks, so losing any ONE message still leaves no gap
const NEUTRAL_INPUT = { mx: 0, mz: 0, aimX: 0, aimZ: 0, atk: false, casts: [], charge: false, tele: false, repair: false, cmds: [] };

/**
 * Create one multiplayer session (one per tab/process: you are either the host or a client, never both).
 * opts.mqtt: the mqtt.js client lib - defaults to the global `mqtt` (the browser <script> build); pass the npm
 *   `mqtt` package explicitly for a Node-side test harness (see tools/v7-netplay-test.mjs).
 * opts.broker: overrides the broker URL (defaults to ?broker= in the page URL, then the public EMQX broker).
 * opts.id: this peer's client id (defaults to a random string).
 */
export function createSession(opts = {}) {
  const mqttLib = opts.mqtt || globalThis.mqtt;
  const broker = opts.broker || (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('broker') : null) || 'wss://broker.emqx.io:8084/mqtt';
  const S = { c: null, id: opts.id || Math.random().toString(36).slice(2, 10), code: null, base: null, host: false, localTeam: -1, localTick: 0, buf: new Map(), started: false, delay: opts.delay || DELAY, sendWin: [], sinceSend: 0 };

  function pub(topic, obj, o = {}) {
    if (!S.c) return;
    S.c.publish(S.base + topic, obj == null ? '' : JSON.stringify(obj), { retain: !!o.retain, qos: o.qos || 0 });
  }
  function bufAt(tick) { let m = S.buf.get(tick); if (!m) { m = {}; S.buf.set(tick, m); } return m; }

  /** cbs: onLobby(msg) [client], onJoin(msg)/onLeave(msg) [host], onStart(msg) [both - call createGame + beginLockstep from here] */
  function connect(code, asHost, cbs = {}) {
    disconnect();
    Object.assign(S, { code, base: `fogbound-${code}/`, host: !!asHost, localTick: 0, buf: new Map(), started: false });
    const copts = { clientId: 'fb_' + S.id, clean: true, reconnectPeriod: 2000, connectTimeout: 8000 };
    if (asHost) copts.will = { topic: S.base + 'lobby', payload: '', retain: true, qos: 0 };
    const c = S.c = mqttLib.connect(broker, copts);
    c.on('error', (e) => { if (cbs.onError) cbs.onError(e); });
    c.on('close', () => { if (cbs.onClose) cbs.onClose(); });
    c.on('offline', () => { if (cbs.onOffline) cbs.onOffline(); });
    c.on('reconnect', () => { if (cbs.onReconnect) cbs.onReconnect(); });
    c.on('connect', () => {
      c.subscribe([S.base + 'cmd', S.base + 'start', S.base + 'sync']);
      if (asHost) c.subscribe([S.base + 'join', S.base + 'leave']);
      else { c.subscribe(S.base + 'lobby'); pub('join', { id: S.id, ...cbs.joinInfo }, { retain: true }); } // retained: survives a host that subscribes a moment late
    });
    c.on('message', (topic, payload) => {
      let m = null;
      try { if (payload.length) m = JSON.parse(payload.toString()); } catch { return; }
      const t = topic.slice(S.base.length);
      if (t === 'cmd') { if (m && m.id !== S.id && m.items) for (const it of m.items) bufAt(it.tick)[m.team] = it.input; }
      else if (t === 'start') { if (m && !S.started) { S.started = true; if (cbs.onStart) cbs.onStart(m); } }
      else if (t === 'sync') { if (m && m.id !== S.id && cbs.onSync) cbs.onSync(m); }
      else if (t === 'lobby' && cbs.onLobby) cbs.onLobby(m);
      else if (t === 'join' && cbs.onJoin) cbs.onJoin(m);
      else if (t === 'leave' && cbs.onLeave) cbs.onLeave(m);
    });
    return S;
  }
  function disconnect() { if (S.c) { if (!S.host && S.base) pub('leave', { id: S.id }); S.c.end(true); S.c = null; } }

  /** host only: publish the retained lobby/room state (players, settings - whatever your menu needs) */
  function publishLobby(state) { if (S.host) pub('lobby', state, { retain: true }); }
  /** host only, ONCE: opts = {seed, bgs, diff, factions, humans} - both peers createGame() with this exact object */
  function startGame(gopts) { if (S.host) pub('start', gopts, { retain: true }); }

  /** host only: broadcast a small authoritative correction (see the determinism note at the top of this file) -
   * pass [{team, x, z, hp}, ...] for the hero teams. Call this every few seconds, not every tick (it's a safety
   * net for slow drift, not the primary sync mechanism - that's the input lockstep above). */
  function publishSync(heroes) { if (S.host) pub('sync', { id: S.id, heroes }); }

  /** call right after createGame(), before the first step() */
  function beginLockstep(localTeam, humanTeams) {
    S.localTeam = localTeam; S.localTick = 0; S.buf = new Map();
    for (let t = 0; t < S.delay; t++) for (const team of humanTeams) bufAt(t)[team] = NEUTRAL_INPUT;
  }
  /** call once per sim tick BEFORE stepping, with the live (mutable) input struct for your own hero (src/controls.js) */
  function queueLocalInput(liveInput) {
    const tick = S.localTick++ + S.delay, snap = JSON.parse(JSON.stringify(liveInput)); // plain-object snapshot: liveInput mutates in place every frame
    bufAt(tick)[S.localTeam] = snap;
    S.sendWin.push({ tick, input: snap });
    if (S.sendWin.length > WINDOW) S.sendWin.shift();
    if (++S.sinceSend >= BATCH_EVERY) { S.sinceSend = 0; pub('cmd', { id: S.id, team: S.localTeam, items: S.sendWin.slice() }); }
  }
  /** true once every human team's input for `tick` is buffered (so step() can safely run for it) */
  function hasTick(tick, humanTeams) { const m = S.buf.get(tick); return !!m && humanTeams.every((t) => m[t] !== undefined); }
  /** the full per-team inputs array for `tick` (human teams from the buffer, others via aiFn(teamId)); frees that tick's buffer entry */
  function inputsAt(tick, teams, humanTeams, aiFn) {
    const m = S.buf.get(tick) || {};
    const out = teams.map((t) => (humanTeams.includes(t.id) ? m[t.id] : aiFn(t.id)));
    S.buf.delete(tick);
    return out;
  }

  return {
    connect, disconnect, publishLobby, startGame, publishSync, beginLockstep, queueLocalInput, hasTick, inputsAt,
    get id() { return S.id; }, get started() { return S.started; }, get host() { return S.host; },
  };
}
