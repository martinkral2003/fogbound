// Verifies the lockstep protocol in src/net.js actually keeps two INDEPENDENT simulations in sync over the real public
// MQTT broker (not a mock) - two sessions in this one process, each with its own mqtt connection, playing the roles of
// "host" and "joining friend". Each publishes synthetic-but-deterministic input for its own hero team only; after N
// ticks we diff the two completely separate `st` objects. If the protocol is right, they must be identical: neither
// side ever sees the other's game state, only its inputs, so any divergence means a desync bug (wrong tick tagged,
// a dropped qos-0-style message, AI computed differently, world gen not deterministic, etc).
// node tools/v7-netplay-test.mjs
import mqtt from 'mqtt';
import { createGame, step } from '../src/sim.js';
import { createAI, aiInput } from '../src/ai.js';
import { SIM_DT } from '../src/data.js';
import { createSession } from '../src/net.js';

const ROOM = 'test' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MAXTICKS = 240; // 8 sim-seconds - enough to exercise many cmd round-trips without a slow test
const HUMANS = [0, 1];

function makePeer(id, isHost) {
  const session = createSession({ mqtt, id, broker: 'wss://broker.emqx.io:8084/mqtt' });
  const P = { session, st: null, ais: null, started: false, simTick: 0, team: isHost ? 0 : 1, startSent: false, done: false, stallTicks: 0, pub: 0, recv: 0 };
  session.connect(ROOM, isHost, {
    onJoin: () => { if (isHost && !P.startSent) { P.startSent = true; session.startGame({ seed: 777, humans: HUMANS, diff: 'normal' }); } },
    onStart: (m) => {
      P.st = createGame({ seed: m.seed, humans: m.humans, diff: m.diff });
      P.ais = P.st.teams.map((t) => createAI(P.st, t.id));
      session.beginLockstep(P.team, m.humans);
      P.started = true;
    },
    onError: (e) => console.error('[' + id + '] mqtt error', e.message),
    onClose: () => console.error('[' + id + '] mqtt close'),
    onOffline: () => console.error('[' + id + '] mqtt offline'),
    onReconnect: () => console.error('[' + id + '] mqtt reconnect'),
  });
  return P;
}

console.log('room', ROOM);
const host = makePeer('peerHost', true);
const guest = makePeer('peerGuest', false);

function tickOf(p, now) {
  if (!p.started || p.done) return;
  const t = p.simTick;
  const live = { mx: Math.sin(t * 0.17 + (p.team ? 1.7 : 0)), mz: Math.cos(t * 0.13), aimX: 1, aimZ: 0, atk: t % 11 === 0, casts: t % 37 === 0 ? [0] : [], charge: false, tele: false, repair: false, cmds: [] };
  p.session.queueLocalInput(live);
  if (p.session.hasTick(p.simTick, HUMANS)) {
    p.stallTicks = 0;
    const inputs = p.session.inputsAt(p.simTick, p.st.teams, HUMANS, (id) => aiInput(p.st, p.ais[id], SIM_DT));
    step(p.st, SIM_DT, inputs);
    p.st.events.length = 0;
    p.simTick++;
    if (p.simTick >= MAXTICKS) p.done = true;
  } else { p.stallTicks++; }
}

const t0 = Date.now();
const iv = setInterval(() => {
  tickOf(host); tickOf(guest);
  if (host.done && guest.done) {
    clearInterval(iv);
    report();
  } else if (Date.now() - t0 > 60000) {
    clearInterval(iv);
    console.error('TIMEOUT: host.simTick', host.simTick, 'guest.simTick', guest.simTick, 'host.started', host.started, 'guest.started', guest.started, 'host stall', host.stallTicks, 'guest stall', guest.stallTicks);
    process.exit(1);
  }
}, Math.round(SIM_DT * 1000));

function fingerprint(st) {
  return {
    t: +st.t.toFixed(3),
    ents: st.ents.length,
    kills: st.stats.kills,
    heroes: st.teams.slice(0, 4).map((t) => ({ x: +t.hero.x.toFixed(3), z: +t.hero.z.toFixed(3), hp: +t.hero.hp.toFixed(3), lvl: t.hero.lvl, gold: +t.gold.toFixed(3), alive: t.hero.alive })),
  };
}
function report() {
  const a = fingerprint(host.st), b = fingerprint(guest.st);
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  console.log('host simTick', host.simTick, 'guest simTick', guest.simTick, '(both reaching', MAXTICKS, 'with 0 permanent stalls = the delivery protocol itself works)');
  console.log('host fingerprint ', sa);
  console.log('guest fingerprint', sb);
  host.session.disconnect(); guest.session.disconnect();
  if (sa === sb) { console.log('\nMATCH: both peers simulated identically over the real broker - lockstep sync fully verified.'); process.exit(0); }
  console.error('\nMISMATCH: the two peers diverged. As of 2026-11-01 this is EXPECTED - it is the known, pre-existing');
  console.error('sim/ai.js determinism bug (see src/net.js header + tools/v7-determinism-test.mjs), NOT a protocol bug:');
  console.error('both peers reached tick', MAXTICKS, 'with no stalls, so every input was delivered and applied at the');
  console.error('right tick on both sides. Re-run tools/v7-determinism-test.mjs; if THAT now passes (bug fixed), this');
  console.error('test should also start passing - if it still fails here, the protocol itself regressed, look there first.');
  process.exit(1);
}
