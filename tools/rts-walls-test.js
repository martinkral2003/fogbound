// Headless test of the WALLS + SIEGE + NAV lane. node tools/rts-walls-test.js
import { createRts, step } from '../src/rts/core.js';
import { SIM_DT } from '../src/rts/consts.js';
import * as Units from '../src/rts/units.js';
import * as Nav from '../src/rts/nav.js';
import * as Walls from '../src/rts/walls.js';
import * as Siege from '../src/rts/siege.js';
import * as Towers from '../src/rts/towers.js';
import * as Buildings from '../src/rts/buildings.js';
import { ignite } from '../src/rts/wall_fire.js';

let fails = 0;
const ok = (c, msg, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + msg + (extra ? '  ' + extra : '')); if (!c) fails++; };
const run = (st, secs, f) => { for (let i = 0; i < secs * 30; i++) { step(st, SIM_DT, {}); if (f && f(i)) return i / 30; } return -1; };

const st = createRts({ seed: 1337, humans: [0], ai: [] });
st.cheats = true;
for (const t of st.teams) { t.res.gold = t.res.timber = t.res.stone = t.res.blood = t.res.souls = 99999; }
Siege.ensureUnits(); Walls.ensureDefs();
const T0 = st.teams[0], keep = T0.keep, cx = keep.x, cz = keep.z;
const toC = [-cx, -cz], tl = Math.hypot(toC[0], toC[1]), dirOut = [toC[0] / tl, toC[1] / tl]; // gate faces the map centre

// ---- 1. build a ring around the keep with the buildline command
const pieces = Walls.ring(cx, cz, 24, { type: 'wall', gate: 'gate', gateDir: toC, towerEvery: 8, tower: 'tower', stairs: true, stairsEvery: 8 });
const before = st.blds.length;
step(st, SIM_DT, { 0: { cmds: [{ t: 'buildline', pieces, instant: true }] } });
const added = st.blds.length - before;
ok(added >= pieces.length * 0.8, 'buildline placed ring pieces', added + '/' + pieces.length);
step(st, SIM_DT, {});
const gates = st.blds.filter((b) => b.team === 0 && b.type === 'gate');
const stairs = st.blds.filter((b) => b.team === 0 && b.type === 'stairs');
ok(gates.length === 1 && stairs.length > 0, 'ring has a gate and stairs', 'gates ' + gates.length + ' stairs ' + stairs.length);
const gate = gates[0];
ok(Walls.enclosed(st, 0), 'keep is enclosed by the ring');

const um = (type, team, x, z) => Units.spawn(st, type, team, x, z);
const melee = Units.list('orc').find((d) => d.role === 'melee').id, ranged = Units.list('necro').find((d) => d.role === 'ranged').id;
// ---- 2. pathing through / around walls
const out = [cx + dirOut[0] * 40, cz + dirOut[1] * 40];
const foe = um(melee, 1, out[0], out[1]);
let p = Nav.findPath(st, foe, cx, cz);
ok(p.partial && p.blocker > 0, 'enemy path into the keep ends at a blocker to attack', 'blocker ' + p.blocker + ' type ' + (st.byId.get(p.blocker) || {}).type + ' pts ' + p.length);
const own = um(ranged, 0, cx + 6, cz + 6);
p = Nav.findPath(st, own, out[0], out[1]);
ok(!p.partial && p.length > 0, 'own unit walks out through the gate', 'pts ' + p.length);
const lockedP = (gate.wall.locked = true, Nav.dirty(st), Nav.findPath(st, own, out[0], out[1]));
ok(lockedP.partial, 'locked gate blocks even the owner'); gate.wall.locked = false; Nav.dirty(st);

// ---- 3. stairs to the wall-top, walk the wall, wall-walk bonus
const far = st.blds.filter((b) => b.team === 0 && b.type === 'wall').sort((a, b) => Math.hypot(b.x - stairs[0].x, b.z - stairs[0].z) - Math.hypot(a.x - stairs[0].x, a.z - stairs[0].z))[0];
let wp = Nav.findPath(st, own, far.x, far.z, { layer: 'wall' });
ok(wp.goalLayer === 'wall' && wp.some((w) => w.layer === 'wall') && !wp.partial, 'path to the wall-top exists via stairs', 'pts ' + wp.length);
let n = 0; while (!Nav.advance(st, own, wp, SIM_DT) && n++ < 3000);
step(st, SIM_DT, {});
ok(own.layer === 'wall' && own.y > st.world.heightAt(own.x, own.z) + 3, 'unit stands on the wall-top', 'layer ' + own.layer + ' hgt ' + (own.y - st.world.heightAt(own.x, own.z)).toFixed(1));
ok(own.wallBuff && own.wallBuff.range > 1.1, 'wall-walk range bonus', JSON.stringify(own.wallBuff));
const back = Nav.findPath(st, own, cx + 5, cz + 5);
ok(back.some((w) => w.layer === 'ground'), 'path from the wall-top back down to the ground');

// ---- 4. ram breaks the gate
const ram = um('orc_ram', 1, gate.x + dirOut[0] * 12, gate.z + dirOut[1] * 12);
ram.orders = [{ type: 'attack', target: gate.id }]; ram.order = ram.orders[0];
const tRam = run(st, 90, () => gate.hp <= 0);
ok(tRam > 0, 'ram destroys the gate', 'in ' + tRam.toFixed(1) + ' s');
const br = Walls.breaches(st, 0);
ok(br.some((g) => g.kind === 'gate' || g.kind === 'gap'), 'breach detection lists the broken gate', JSON.stringify(br.map((b) => b.kind)));
ok(!Walls.enclosed(st, 0), 'keep no longer enclosed');
const foeP = Nav.findPath(st, foe, cx, cz);
ok(!foeP.blocker || st.byId.get(foeP.blocker).type !== 'gate', 'enemy path no longer blocked by the gate');
const pk = Siege.pickTarget(st, 1, 0);
ok(pk && (pk.kind === 'breach' || pk.kind === 'keep'), 'Siege.pickTarget points at the breach', pk && pk.kind);
ram.alive = false; foe.alive = false;

// ---- 5. catapult damages a wall
const wallPc = st.blds.filter((b) => b.team === 0 && b.type === 'wall' && b.hp > 0).sort((a, b) => (Math.hypot(a.x - cx - dirOut[0] * 24 * -1, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)))[0];
const cat = um('cult_firecatapult', 3, wallPc.x + (wallPc.x > 0 ? 28 : -28), wallPc.z + (wallPc.z > 0 ? 28 : -28));
const hp0 = wallPc.hp;
cat.orders = [{ type: 'attack', target: wallPc.id }]; cat.order = cat.orders[0];
run(st, 40, () => wallPc.hp < hp0 * 0.8);
ok(wallPc.hp < hp0, 'catapult damages a wall', Math.round(hp0) + ' -> ' + Math.round(wallPc.hp));
cat.alive = false;

// ---- 6. fire spreads on a palisade
const pal = Walls.line(cx + 60, cz - 40 * Math.sign(cz), cx + 60 + 36, cz - 40 * Math.sign(cz), { type: 'palisade' });
step(st, SIM_DT, { 0: { cmds: [{ t: 'buildline', pieces: pal, instant: true }] } });
const pbl = st.blds.filter((b) => b.type === 'palisade');
if (pbl.length > 2) {
  ignite(st, pbl[0], 14, 30);
  run(st, 40);
  const burnt = pbl.filter((b) => b.fire || b.hp < b.maxHp || b.state === 'ruin').length;
  ok(burnt >= 3, 'fire spreads along a palisade', burnt + '/' + pbl.length + ' burnt');
} else console.log('SKIP palisade (placed ' + pbl.length + ')');

// ---- 7. cannon tower hits siege
step(st, SIM_DT, { 0: { cmds: [{ t: 'build', type: 'cannon_tower', x: cx + 8, z: cz - 8, rot: 0 }] } });
let ct = st.blds.find((b) => b.type === 'cannon_tower' && b.team === 0);
if (!ct) { ct = Buildings.create(st, 'cannon_tower', 0, cx + 8, cz - 8, 0, { instant: true }); }
ct.state = 'ready'; ct.progress = 1; Walls.initPiece(st, ct); ct.hp = ct.maxHp;
const ram2 = um('orc_ram', 1, ct.x + 20, ct.z); ram2.orders = []; ram2.order = null; ram2.stance = 'hold';
const rh = ram2.hp;
run(st, 12, () => ram2.hp < rh * 0.8 || !ram2.alive);
ok(ram2.hp < rh || !ram2.alive, 'cannon tower fires at a siege unit', Math.round(rh) + ' -> ' + Math.round(ram2.hp));

// ---- 8. siege tower docking gives access to the wall-top
const w2 = st.blds.find((b) => b.team === 0 && b.type === 'wall' && b.hp > 0 && b.wall.walkable);
const stw = um('orc_siegetower', 1, w2.x + 14, w2.z + 14); stw.orders = [{ type: 'attack', target: w2.id }]; stw.order = stw.orders[0];
const tDock = run(st, 60, () => st.nav.dock.length > 0);
ok(tDock > 0, 'siege tower docks to a wall', tDock > 0 ? 'in ' + tDock.toFixed(1) + ' s' : '');
if (tDock > 0) {
  const grunt = um(melee, 1, stw.x + 1, stw.z + 1);
  Nav.rebuild(st);
  const gp = Nav.findPath(st, grunt, w2.x, w2.z, { layer: 'wall' });
  ok(gp.some((w) => w.layer === 'wall') && !gp.partial, 'enemy infantry can path onto the wall-top through the dock', 'pts ' + gp.length);
}

// ---- 8b. upgrades (palisade -> stone -> black stone, tower tiers) and a sapper
const up = st.blds.find((b) => b.type === 'wall' && b.team === 0 && b.hp > 0 && b.wall.tier === 1);
const hpU = up.maxHp;
step(st, SIM_DT, { 0: { cmds: [{ t: 'wallUpgrade', ids: [up.id], tier: 2 }] } });
run(st, 12);
ok(up.wall.tier === 2 && up.maxHp > hpU * 1.5, 'wall upgraded to black stone', hpU + ' -> ' + up.maxHp + ' armor ' + up.armor);
const tw0 = ct.maxHp;
step(st, SIM_DT, { 0: { cmds: [{ t: 'wallUpgrade', ids: [ct.id] }] } });
run(st, 12);
ok(ct.towerTier === 1 && ct.maxHp > tw0, 'cannon tower upgraded to tier 1', tw0 + ' -> ' + ct.maxHp);
const sw = st.blds.find((b) => b.type === 'wall' && b.team === 0 && b.hp > 0 && b.wall.tier === 1 && b.id !== up.id);
const sap = um('cult_sapper', 3, sw.x + (sw.x > 0 ? 18 : -18), sw.z + (sw.z > 0 ? 18 : -18));
sap.hp = sap.maxHp = 3000; const sh = sw.hp; sap.orders = [{ type: 'attack', target: sw.id }]; sap.order = sap.orders[0];
run(st, 20, () => !sap.alive); run(st, 1);
ok(!sap.alive && sw.hp < sh * 0.7, 'sapper blows itself up against a wall', Math.round(sh) + ' -> ' + Math.round(sw.hp));

// ---- 9. performance: 300 units, 600 pieces
const st2 = createRts({ seed: 7, humans: [0], ai: [] });
st2.cheats = true; for (const t of st2.teams) for (const k in t.res) t.res[k] = 99999;
const h2 = st2.world.hearts;
let np = 0;
for (let i = 0; i < 4; i++) {
  const hx = h2[i].x, hz = h2[i].z;
  const pcs = [...Walls.ring(hx, hz, 24, { gate: 'gate', gateDir: [-hx, -hz], towerEvery: 8, tower: 'tower', stairs: true, stairsEvery: 6 }), ...Walls.ring(hx, hz, 38, { gate: 'gate', gateDir: [-hx, -hz], stairs: true, stairsEvery: 5 }), ...Walls.rect(hx, hz, 12, 12, 0.3, { gate: 'gate' })];
  step(st2, SIM_DT, { [i]: { cmds: [{ t: 'buildline', pieces: pcs.slice(0, 80), instant: true }, { t: 'buildline', pieces: pcs.slice(80, 160), instant: true }, { t: 'buildline', pieces: pcs.slice(160), instant: true }] } });
}
np = st2.blds.filter((b) => b.wall).length;
const fk = ['necro', 'orc', 'demon', 'cult'];
for (let i = 0; i < 300; i++) { const ti = i % 4, d = Units.list(fk[ti]).filter((u) => u.role !== 'worker' && u.role !== 'general'); Units.spawn(st2, d[i % d.length].id, ti, h2[ti].x + (st2.rng() - 0.5) * 60, h2[ti].z + (st2.rng() - 0.5) * 60); }
let t0 = performance.now();
for (let i = 0; i < 60; i++) step(st2, SIM_DT, {});
const stepMs = (performance.now() - t0) / 60;
t0 = performance.now(); for (let i = 0; i < 60; i++) { Walls.update(st2, SIM_DT); Siege.update(st2, SIM_DT); }
const laneMs = (performance.now() - t0) / 60;
t0 = performance.now(); Nav.dirty(st2); Nav.rebuild(st2); const rebMs = performance.now() - t0;
t0 = performance.now(); let np2 = 0;
for (const u of st2.ents.slice(0, 300)) { const g = h2[(u.team + 2) % 4]; const pp = Nav.findPath(st2, u, g.x + (st2.rng() - 0.5) * 30, g.z + (st2.rng() - 0.5) * 30); np2 += pp.length; }
const pathMs = (performance.now() - t0) / 300;
ok(laneMs < 3 && pathMs < 4, 'lane cost (Walls+Towers+Siege) / full step with ' + st2.ents.length + ' units + ' + np + ' wall pieces', laneMs.toFixed(2) + ' ms lane, ' + stepMs.toFixed(2) + ' ms full step (all lanes), rebuild ' + rebMs.toFixed(1) + ' ms, path ' + pathMs.toFixed(2) + ' ms avg (' + Nav.stats(st2).exp + ' exp)');
console.log(fails ? fails + ' FAILURES' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
