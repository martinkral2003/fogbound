// v0.7 MQTT transport (host-authoritative). NOT WIRED IN YET on purpose: nothing imports this module. Written so the next
// session can wire it with a live two-browser-tab test instead of me guessing blind at the protocol.
//
// Pattern mirrors ../gamee/game.js (read 2026-11-01, reused not reinvented): a namespaced MQTT topic tree under a room
// code, the host subscribes to 'join'/'cmd'/'leave' and publishes a retained 'lobby', everyone else subscribes to 'lobby'
// and publishes 'join'/'leave'/'cmd'. Design v0.7 first-pass scope: YOU always host (you run createGame()+step() and
// broadcast it), one friend joins with a room code, AI fills every other hero slot. Full host-or-join symmetry and >2
// humans are later work (see CLAUDE.md Design v0.7 build plan, row 9).
//
// What a human player's per-tick input already looks like (controls.js, src/main.js:102 `step(st, dt, inputs)`):
//   { mx, mz, aimX, aimZ, atk, casts: [slot,...], charge, tele, repair, cmds: [...] }
// That object is exactly what a client should publish on 'cmd' and what the host drops into `inputs[teamId]` in place
// of `aiInput(...)` for that team — see main.js's loop() for how `inputs` is built today. st.humans (opts.humans to
// createGame) already supports more than one human-controlled team; only this transport was missing.
//
// NOT in this file (left for the wiring session, needs a live two-tab test to get right rather than guessed):
//   - state snapshot serialization for the host -> clients broadcast. `st` is large (nav grid, all buildings/units);
//     do not JSON.stringify(st) wholesale. Likely answer: reuse whatever per-frame "view model" render.js/ui.js already
//     read off st each frame (they can't be reading the whole thing either) and publish THAT, trimmed further if it's
//     still too big for a free broker at the tick rate we want. Measure actual payload size before picking a rate.
//   - client-side prediction/interpolation of the broadcast snapshots (gamee's C.snaps/C.pred pattern is the reference).
//   - the lobby/menu screen itself (room code entry, host/join choice, faction pick for Design v0.7 competitive mode).
//   - reconnect-into-the-same-match behaviour if a client's tab drops mid-game.
//
// Requires the mqtt.js browser build as a global `mqtt` (gamee loads it via <script src="https://unpkg.com/mqtt/dist/mqtt.min.js">
// in index.html). Not vendored here yet (lib/ only has Three.js) - add the same <script> tag, or vendor it, when wiring.

const BROKER = () => new URLSearchParams(location.search).get('broker') || 'wss://broker.emqx.io:8084/mqtt';
const NS = 'fogbound-';
export const CMD_HZ = 20; // client -> host input publish rate; gamee uses 50ms (20Hz) for the same reason: responsive enough, cheap on a free broker

// one transport per tab (you are either the host or a client, never both); S.cmds[teamId] = last input received for that team (host only)
const S = { c: null, id: Math.random().toString(36).slice(2, 10), code: null, base: null, host: false, cmds: {}, cmdT: {}, timer: 0 };

function pub(topic, obj, retain) {
  if (!S.c) return;
  S.c.publish(S.base + topic, obj == null ? '' : JSON.stringify(obj), { retain: !!retain, qos: 0 });
}

/**
 * Join or host a room.
 * @param {string} code 4-letter room code (any short string works; keep it short so it's easy to say out loud)
 * @param {boolean} asHost true = you run the sim and broadcast it (today's only supported role)
 * @param {object} cbs callbacks, all optional:
 *   onJoin(msg)   a client announced itself                 (host only; msg = whatever the client published on 'join')
 *   onLeave(msg)  a client left                              (host only)
 *   onCmd(teamId, input) a client's input for a specific hero team (host only; wire teamId yourself via your own 'join' payload - this module does not assign teams)
 *   onLobby(msg)  the host's retained room/lobby state        (client only)
 *   onState(msg)  a host's broadcast snapshot                 (client only)
 */
export function connect(code, asHost, cbs = {}) {
  disconnect();
  Object.assign(S, { code, base: NS + code + '/', host: !!asHost, cmds: {}, cmdT: {} });
  const opts = { clientId: 'fb_' + S.id, clean: true, reconnectPeriod: 2000, connectTimeout: 8000 };
  if (asHost) opts.will = { topic: S.base + 'lobby', payload: '', retain: true, qos: 0 }; // if the host's tab dies, clear the retained lobby so clients see the room is gone
  const c = S.c = mqtt.connect(BROKER(), opts); // `mqtt` = the global from the mqtt.js browser build (see file header)
  c.on('connect', () => {
    if (asHost) c.subscribe([S.base + 'join', S.base + 'cmd', S.base + 'leave']);
    else c.subscribe(S.base + 'lobby');
  });
  c.on('message', (topic, payload) => {
    let m = null;
    try { if (payload.length) m = JSON.parse(payload.toString()); } catch { return; }
    const t = topic.slice(S.base.length);
    if (t === 'join' && cbs.onJoin) cbs.onJoin(m);
    else if (t === 'leave' && cbs.onLeave) cbs.onLeave(m);
    else if (t === 'cmd' && m) { if (m.team !== undefined) { S.cmds[m.team] = m.input; S.cmdT[m.team] = performance.now(); } if (cbs.onCmd) cbs.onCmd(m.team, m.input); }
    else if (t === 'lobby' && cbs.onLobby) cbs.onLobby(m);
    else if (t === 'state' && cbs.onState) cbs.onState(m);
  });
  return S;
}

export function disconnect() {
  if (S.timer) { clearInterval(S.timer); S.timer = 0; }
  if (S.c) { if (!S.host && S.base) pub('leave', { id: S.id }); S.c.end(true); S.c = null; }
}

/** host only: publish the retained lobby/room state (whatever shape your menu needs - players, settings, status) */
export function publishLobby(state) { if (S.host) pub('lobby', state, true); }
/** host only: broadcast a state snapshot to clients (see the serialization TODO at the top of this file) */
export function publishState(snapshot) { if (S.host) pub('state', snapshot); }
/** client only: announce yourself to the host so it can assign you a hero team */
export function sendJoin(info) { if (!S.host) pub('join', { id: S.id, ...info }); }
export function sendLeave() { if (!S.host) pub('leave', { id: S.id }); }
/**
 * client only: start publishing your controls.input struct on CMD_HZ. getInput() should return the live
 * `controls.input` object (see src/controls.js) - call this once after you know which hero team you were assigned.
 */
export function startSendingInput(teamId, getInput) {
  if (S.host) return;
  if (S.timer) clearInterval(S.timer);
  S.timer = setInterval(() => pub('cmd', { id: S.id, team: teamId, input: getInput() }), 1000 / CMD_HZ);
}
/** host only: the most recent input received for a hero team, or `fallback` (pass your aiInput() result) if it's missing/stale */
export function inputFor(teamId, fallback, maxAgeMs = 500) {
  const t = S.cmdT[teamId];
  return t !== undefined && performance.now() - t <= maxAgeMs ? S.cmds[teamId] : fallback;
}
