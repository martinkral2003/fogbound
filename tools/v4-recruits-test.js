// RECRUITS lane test: node tools/v4-recruits-test.js
// Covers mercenary hiring, the 4-follower cap, levels + evolution, stances, real death + paid revive + priest revive, follow-teleport,
// cage / graveyard / champion recruits, gear, dismiss, role behaviours (taunt, kite), XP from kills, model builders.
import fs from 'node:fs';
import { createGame, step, simApi } from '../src/sim.js';
import * as D from '../src/data.js';
import * as RC from '../src/recruits.js';
import * as SV from '../src/servants.js';

const { SIM_DT, UNITS, FOLLOWER_TUNE: FT } = D;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } else console.log('ok:   ' + m); };
const evs = []; // every event since the last clear
const idle = (st) => st.teams.map(() => ({ cmds: [] }));
const run = (st, secs, cmds = []) => {
  for (let i = 0; i < Math.round(secs / SIM_DT); i++) {
    const inp = idle(st);
    if (i === 0) inp[0].cmds.push(...cmds);
    step(st, SIM_DT, inp); evs.push(...st.events); st.events.length = 0;
  }
};
const cmd = (st, c) => run(st, SIM_DT, [c]);
const evOf = (t) => evs.filter((e) => e.type === t);
const clearEv = () => { evs.length = 0; };

function setup(seed = 7) {
  const st = createGame({ seed, humans: [0] });
  const team = st.teams[0], h = team.hero;
  for (const e of st.ents) if (e.kind === 'unit' && e.team === 0 && !e.recruit) { e.alive = false; e.hp = 0; } // no starting servants of the old kind
  // a town to shop in: the real one when the TOWNS lane exists, else a stub at the hero
  let town = (st.towns || []).find((t) => t.state !== 'fallen');
  if (town) { h.x = town.x; h.z = town.z; } else { town = { id: 901, name: 'Testvale', x: h.x, z: h.z, r: 30, kind: 'town', state: 'safe' }; st.towns = [town]; }
  h.ox = h.x; h.oz = h.z; team.fpos = null;
  team.gold = 5000; team.hero.hp = team.hero.maxHp;
  return { st, team, h, town };
}
// move the hero to open ground away from every town (safe zones make monsters drop their targets)
function wilds(S) {
  const { st, team, h } = S;
  const w = st.world, tw = st.towns || [];
  for (let r = 60; r < 380; r += 20) for (let a = 0; a < 6.28; a += 0.4) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!w.walkable(x, z) || !w.walkable(x + 12, z) || !w.walkable(x - 8, z) || tw.some((t) => Math.hypot(t.x - x, t.z - z) < (t.r || 40) + 60)) continue;
    h.x = x; h.z = z; h.ox = x; h.oz = z; team.fpos = { x, z };
    for (const e of RC.followersOf(st, 0)) { e.x = x + 2; e.z = z + 2; e.ox = e.x; e.oz = e.z; }
    for (const e of st.ents) if (e.kind === 'mon' && e.team === -1 && Math.hypot(e.x - x, e.z - z) < 120) { e.alive = false; e.hp = 0; }
    return S;
  }
  return S;
}
const spawnMon = (st, key, x, z, o = {}) => {
  const camp = { id: 9000 + st.camps.length, x, z, tier: o.tier || 1, types: [key], mons: 1, respT: 0, boss: false, noResp: true };
  st.camps.push(camp);
  const m = simApi.spawnMonster(st, key, o.tier || 1, x, z, camp);
  if (o.elite) { m.elite = 1; m.title = 'Test Champion'; }
  return m;
};
const wipeMons = (st) => { for (const e of st.ents) if (e.kind === 'mon') { e.alive = false; e.hp = 0; } };

// ---------------------------------------------------------------- 0. data and models
{
  const types = Object.keys(D.RECRUIT_UNITS);
  ok(types.length >= 11, 'recruit roster defined: ' + types.join(', '));
  ok(D.FOLLOWER_MAX === 4, 'follower cap constant is 4');
  ok(D.MERC_TYPES.every((k) => UNITS[k] && UNITS[k].hire), 'every mercenary type exists and is hireable');
  ok(D.MERC_TYPES.length === 8, 'eight mercenary types: ' + D.MERC_TYPES.join(', '));
  const roles = new Set(D.MERC_TYPES.map((k) => UNITS[k].role));
  ok(['melee', 'ranged', 'healer', 'tank', 'caster', 'scout'].every((r) => roles.has(r)), 'roles covered: ' + [...roles].join(', '));
  const src = fs.readFileSync(new URL('../src/models_servants.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../src/models.js', import.meta.url), 'utf8');
  const missing = types.map((k) => UNITS[k].model).filter((m) => !new RegExp('\\b' + m + '\\s*[:,(]').test(src) && !new RegExp('\\b' + m + '\\s*=>').test(src));
  ok(missing.length === 0, 'every recruit model has a builder' + (missing.length ? ': missing ' + missing : ''));
  ok(types.every((k) => D.EVOLVE_NAMES[k] || ['champion', 'freedorc'].includes(k)), 'evolution names exist for the roster');
  ok(['melee', 'ranged', 'tank', 'healer', 'caster', 'scout'].every((r) => D.EVOLVE_MODS[r]), 'evolution mods exist for every recruit role');
}

// ---------------------------------------------------------------- 1. mercenary offers and hiring
const S = setup(7);
{
  const { st, team, h, town } = S;
  ok(Array.isArray(team.followers) && team.followers.length === 0, 'team.followers starts empty');
  const o1 = RC.mercenaryOffers(st, town.id), o2 = RC.mercenaryOffers(st, town.id);
  ok(o1.length >= 4 && JSON.stringify(o1) === JSON.stringify(o2), `mercenary offers: ${o1.length}, deterministic`);
  ok(o1.every((o) => o.cost > 0 && o.name && o.lvl >= 1 && UNITS[o.type] && o.hp > 0), 'offers carry type, name, level, price, stats');
  ok(new Set(o1.map((o) => o.type)).size === o1.length, 'offers are distinct types');
  const g0 = team.gold, o = o1[0];
  cmd(st, { t: 'recruit', town: town.id, type: o.type });
  const f = RC.followersOf(st, 0);
  ok(f.length === 1 && f[0].recruit && f[0].kind === 'unit' && f[0].team === 0, 'hired one recruit: ' + (f[0] && f[0].name));
  ok(f[0] && f[0].type === o.type && f[0].lvl === o.lvl && f[0].name === o.name, 'hired follower matches the offer (' + o.name + ' lvl ' + o.lvl + ')');
  ok(g0 - team.gold === o.cost, 'price paid: ' + o.cost);
  ok(evOf('recruited').length === 1, 'event recruited');
  ok(RC.mercenaryOffers(st, town.id)[0].sold === true, 'hired offer is marked sold');
  const g1 = team.gold; cmd(st, { t: 'recruit', town: town.id, type: o.type });
  ok(RC.followerCount(st, team) === 1 && team.gold === g1, 'cannot hire a sold offer twice');
  // cap 4
  for (const x of RC.mercenaryOffers(st, town.id)) if (!x.sold && RC.followerCount(st, team) < 4) cmd(st, { t: 'recruit', town: town.id, type: x.type });
  ok(RC.followerCount(st, team) === 4, 'band filled to 4: ' + RC.followersOf(st, 0).map((e) => e.type).join(','));
  const g2 = team.gold; clearEv();
  const left = RC.mercenaryOffers(st, town.id).find((x) => !x.sold);
  if (left) { cmd(st, { t: 'recruit', town: town.id, type: left.type }); ok(RC.followerCount(st, team) === 4 && team.gold === g2, 'cap of 4 enforced, gold kept'); ok(evOf('msg').some((m) => /full/i.test(m.text)), 'message says the band is full'); }
  ok(RC.hireBlock(st, team, town.id, left ? left.type : 'guard') !== null, 'hireBlock reports a reason when full: ' + RC.hireBlock(st, team, town.id, 'guard'));
  // distinct names, stats scale with level
  ok(new Set(RC.followersOf(st, 0).map((e) => e.name)).size >= 3, 'followers have personal names');
  // away from town: refused
  const fx = h.x, fz = h.z; h.x += 400; h.ox = h.x; team.fpos = { x: h.x, z: h.z };
  cmd(st, { t: 'dismiss', id: RC.followersOf(st, 0)[0].id }); // free a slot first
  const g3 = team.gold; cmd(st, { t: 'recruit', town: town.id, type: 'guard' });
  ok(team.gold === g3, 'cannot hire when far from the town');
  h.x = fx; h.ox = fx; team.fpos = { x: fx, z: fz };
  for (const e of RC.followersOf(st, 0)) { e.x = h.x + 2; e.z = h.z + 2; }
}

// ---------------------------------------------------------------- 2. levels and evolution
{
  const { st, team } = setup(11);
  const town = st.towns[0];
  cmd(st, { t: 'recruit', town: town.id, type: RC.mercenaryOffers(st, town.id).find((o) => o.lvl === 1).type });
  const f = RC.followersOf(st, 0)[0];
  const hp1 = f.maxHp, atk1 = f.atk;
  ok(f.lvl === 1 && !f.evoReady, 'level 1, no evolution yet');
  simApi.addXP(st, f, 10000);
  ok(f.lvl === D.MAX_UNIT_LVL && f.lvl === 6, 'levels cap at 6');
  ok(f.maxHp > hp1 * 1.5 && f.atk > atk1 * 1.4, `stats grow with level: hp ${Math.round(hp1)} -> ${Math.round(f.maxHp)}, atk ${atk1.toFixed(1)} -> ${f.atk.toFixed(1)}`);
  run(st, 0.7);
  ok(f.evoReady === true && team.evoN >= 1, 'evolution offered at level 3+ (no research needed)');
  ok(SV.evolveOptions(f).length === 2 && SV.evolveOptions(f)[0].name !== SV.evolveOptions(f)[1].name, 'two distinct evolution options: ' + SV.evolveOptions(f).map((o) => o.name).join(' / '));
  const before = f.maxHp + f.atk; clearEv();
  cmd(st, { t: 'evolve', id: f.id, to: 1 });
  ok(f.evoDone && f.evo === 2 && f.evoName && evOf('evolve').length === 1, 'evolved: ' + f.evoName);
  ok(f.maxHp + f.atk !== before, 'evolution changed stats');
  cmd(st, { t: 'evolve', id: f.id, to: 0 });
  ok(f.evo === 2, 'cannot evolve twice');
}

// ---------------------------------------------------------------- 3. stances
{
  const { st, team, h } = setup(12);
  const town = st.towns[0];
  for (const o of RC.mercenaryOffers(st, town.id).slice(0, 3)) cmd(st, { t: 'recruit', town: town.id, type: o.type });
  const fs = RC.followersOf(st, 0);
  ok(fs.length === 3 && fs.every((e) => e.mode === 'follow'), 'new followers follow');
  cmd(st, { t: 'stance', id: fs[0].id, mode: 'hold' });
  ok(fs[0].mode === 'hold' && fs[1].mode === 'follow', 'per-follower hold');
  cmd(st, { t: 'hold' });
  ok(fs.every((e) => e.mode === 'hold'), 'global hold command reaches every follower');
  cmd(st, { t: 'follow' });
  ok(fs.every((e) => e.mode === 'follow'), 'global follow command');
  cmd(st, { t: 'stance', id: fs[1].id, mode: 'amove', x: h.x + 20, z: h.z });
  ok(fs[1].mode === 'amove' && Math.abs(fs[1].dest.x - (h.x + 20)) < 0.01, 'per-follower attack-move');
  cmd(st, { t: 'amove', x: h.x - 15, z: h.z });
  ok(fs.every((e) => e.mode === 'amove'), 'global amove command');
  run(st, 12);
  ok(fs.every((e) => e.mode === 'hold' || e.mode === 'amove'), 'amove ends in hold at the destination: ' + fs.map((e) => e.mode).join(','));
  // following: walk the hero, followers stay close
  cmd(st, { t: 'follow' });
  const hx = h.x; h.dest = { x: hx + 30, z: h.z, r: 1 }; run(st, 10);
  ok(fs.every((e) => Math.hypot(e.x - h.x, e.z - h.z) < 14), 'followers keep up with the hero: ' + fs.map((e) => Math.hypot(e.x - h.x, e.z - h.z).toFixed(1)).join(', '));
}

// ---------------------------------------------------------------- 4. real death, paid revive, waystone, no revive away from services
{
  const { st, team, h, town } = setup(13);
  cmd(st, { t: 'recruit', town: town.id, type: 'guard' }); cmd(st, { t: 'recruit', town: town.id, type: RC.mercenaryOffers(st, town.id).find((o) => !o.sold && o.type !== 'priest').type });
  const f = RC.followersOf(st, 0)[0]; const name = f.name, lvl = f.lvl;
  simApi.addXP(st, f, 200); const lvl2 = f.lvl;
  f.eq.weapon = { slot: 'weapon', tier: 2, rarity: 1, affixes: [], name: 'Test Blade', score: 5 }; f.gear.weapon = 2; simApi.recalc(f);
  clearEv();
  f.hp = 1; simApi.kill(st, f, { team: -1 }); run(st, 0.2);
  ok(!f.alive && RC.followerCount(st, team) === 1, 'follower died for real; band is down to 1');
  ok(evOf('followerDied').length === 1 && evOf('followerDied')[0].id === f.id, 'event followerDied');
  ok(team.fallen.length === 1 && team.fallen[0].name === name && team.fallen[0].lvl === lvl2, 'fallen record kept (name, level)');
  const rec = team.fallen[0];
  ok(RC.reviveCost(st, team, rec, 'town') > 0 && RC.reviveCost(st, team, rec, 'waystone') > RC.reviveCost(st, team, rec, 'town'), `revive prices: town ${RC.reviveCost(st, team, rec, 'town')}, waystone ${RC.reviveCost(st, team, rec, 'waystone')}`);
  // away from any service: refused
  const hx = h.x; h.x += 300; h.ox = h.x; team.fpos = { x: h.x, z: h.z }; run(st, 0.1);
  const g = team.gold; cmd(st, { t: 'revivefollower', id: rec.fid });
  ok(RC.followerCount(st, team) === 1 && team.gold === g, 'cannot revive in the wilds');
  h.x = hx; h.ox = hx; team.fpos = { x: h.x, z: h.z }; run(st, 0.1);
  const cost = RC.reviveCost(st, team, rec, 'town'), g1 = team.gold; clearEv();
  cmd(st, { t: 'revivefollower', id: rec.fid });
  const back = RC.followersOf(st, 0).find((e) => e.name === name);
  ok(!!back && back.alive && back.lvl === lvl2 && back.type === rec.type, 'paid revive at a town brings the follower back with name and level');
  ok(g1 - team.gold === cost, 'revive cost deducted: ' + cost);
  ok(back && back.eq.weapon && back.eq.weapon.name === 'Test Blade', 'gear restored');
  ok(team.fallen.length === 0 && evOf('followerRevived').length === 1, 'record cleared, event followerRevived');
  // not enough gold
  back.hp = 1; simApi.kill(st, back, { team: -1 }); run(st, 0.1);
  team.gold = 1; const n = RC.followerCount(st, team); cmd(st, { t: 'revivefollower', id: team.fallen[0].fid });
  ok(RC.followerCount(st, team) === n, 'revive needs the gold');
  // waystone ritual
  team.gold = 5000; h.x += 200; h.ox = h.x; team.fpos = { x: h.x, z: h.z };
  st.waystones = st.waystones || []; const ws = { id: 777, x: h.x, z: h.z, disc: [true, true, true, true] }; st.waystones.push(ws); run(st, 0.1);
  const r2 = team.fallen[0], c2 = RC.reviveCost(st, team, r2, 'waystone'), g2 = team.gold;
  cmd(st, { t: 'revivefollower', id: r2.fid });
  ok(RC.followerCount(st, team) === 2 && g2 - team.gold === c2, 'waystone ritual revive costs more: ' + c2);
  st.waystones.pop();
}

// ---------------------------------------------------------------- 5. priest revives once
{
  const { st, team, h, town } = setup(14);
  for (const t of ['priest', 'guard']) cmd(st, { t: 'recruit', town: town.id, type: t }); // may not both be on offer: fall back to spawning
  if (!RC.followersOf(st, 0).some((e) => e.type === 'priest')) RC.spawnFollower(st, team, 'priest', { lvl: 2 });
  if (!RC.followersOf(st, 0).some((e) => e.type === 'guard')) RC.spawnFollower(st, team, 'guard', { lvl: 1 });
  const pr = RC.followersOf(st, 0).find((e) => e.type === 'priest'), gd = RC.followersOf(st, 0).find((e) => e.type === 'guard');
  ok(pr && pr.sv.rez && pr.role === 'healer', 'priest has the revive ability');
  gd.x = pr.x + 3; gd.z = pr.z; gd.hp = 1; simApi.kill(st, gd, { team: -1 });
  run(st, 1);
  ok(team.fallen.length === 1, 'guard fell next to the priest');
  clearEv(); let hpAt = null;
  for (let i = 0; i < 12 / SIM_DT && hpAt === null; i++) { step(st, SIM_DT, idle(st)); evs.push(...st.events); const rv = st.events.find((x) => x.type === 'followerRevived'); st.events.length = 0; if (rv) { const b = st.byId.get(rv.id); hpAt = b.hp / b.maxHp; } }
  const back = RC.followersOf(st, 0).find((e) => e.name === gd.name);
  ok(!!back && back.alive, 'priest raised the fallen guard: ' + (back && back.name));
  ok(hpAt !== null && hpAt > 0.3 && hpAt <= 0.9, 'revived at about half health: ' + (hpAt !== null && Math.round(hpAt * 100)) + '%');
  ok(evOf('followerRevived').length === 1 && team.fallen.length === 0 && pr.sv.rezT > 100, 'priest ability goes on cooldown (' + Math.round(pr.sv.rezT) + ' s)');
  back.hp = 1; simApi.kill(st, back, { team: -1 }); run(st, 8);
  ok(team.fallen.length === 1 && RC.followerCount(st, team) === 1, 'a second death is not revived while the ability recharges');
}

// ---------------------------------------------------------------- 6. follow, warp with the hero
{
  const { st, team, h, town } = setup(15);
  for (const o of RC.mercenaryOffers(st, town.id).slice(0, 3)) cmd(st, { t: 'recruit', town: town.id, type: o.type });
  const fs = RC.followersOf(st, 0); clearEv();
  const far = () => Math.max(...fs.map((e) => Math.hypot(e.x - h.x, e.z - h.z)));
  h.x += 150; h.z += 40; h.ox = h.x; h.oz = h.z; run(st, 0.2); // teleport / respawn style jump
  ok(far() < 7, 'followers come along when the hero teleports: ' + far().toFixed(1) + ' m');
  // one follower stranded far away for a few seconds
  const lost = fs[0]; lost.x = h.x + 250; lost.z = h.z; lost.ox = lost.x; lost.oz = lost.z; lost.mode = 'follow';
  run(st, 1.5); ok(Math.hypot(lost.x - h.x, lost.z - h.z) > 100, 'a follower straggling >60 m does not warp instantly');
  run(st, 6); ok(Math.hypot(lost.x - h.x, lost.z - h.z) < 12, 'after a few seconds out of combat he teleports to the hero: ' + Math.hypot(lost.x - h.x, lost.z - h.z).toFixed(1) + ' m');
  // hero dies and respawns elsewhere: followers wait, then come
  h.alive = false; h.dead = true; run(st, 0.1);
  h.x -= 120; h.ox = h.x; h.alive = true; h.dead = false; run(st, 0.2);
  ok(far() < 8, 'followers come with the hero on respawn: ' + far().toFixed(1) + ' m');
}

// ---------------------------------------------------------------- 7. cage offers, accept / decline, graveyard, champion
{
  const { st, team, h } = setup(16);
  const poi = (st.pois || []).find((p) => p.type === 'cage') || { id: 4242, type: 'cage', x: h.x + 5, z: h.z, used: false };
  ok(RC.offerFromCage(st, team, poi) === true && team.offer && team.offer.kind === 'cage', 'cage opens a recruit offer: ' + (team.offer && team.offer.name + ' the ' + team.offer.type));
  clearEv(); cmd(st, { t: 'recruitoffer', accept: false });
  ok(team.offer === null && RC.followerCount(st, team) === 0 && !poi.used, 'declining leaves the prisoner (cage stays closed)');
  RC.offerFromCage(st, team, poi); const nm = team.offer.name, ty = team.offer.type;
  cmd(st, { t: 'recruitoffer', accept: true });
  const f = RC.followersOf(st, 0)[0];
  ok(f && f.name === nm && f.type === ty && f.src === 'cage' && poi.used === true, 'accepting frees the prisoner as a follower (' + nm + ', ' + ty + ')');
  // an offer expires
  RC.offerFromCage(st, team, { id: 4243, type: 'cage', x: h.x, z: h.z, used: false }); run(st, FT.offerT + 2);
  ok(team.offer === null, 'offers expire');
  // full band: cannot accept
  while (RC.roomFor(st, team)) RC.spawnFollower(st, team, 'guard');
  RC.offerFromCage(st, team, { id: 4244, type: 'cage', x: h.x, z: h.z, used: false }); cmd(st, { t: 'recruitoffer', accept: true });
  ok(RC.followerCount(st, team) === 4 && team.offer !== null, 'a full band keeps the offer open until somebody is dismissed');
  cmd(st, { t: 'dismiss', id: RC.followersOf(st, 0)[1].id }); cmd(st, { t: 'recruitoffer', accept: true });
  ok(RC.followerCount(st, team) === 4 && team.offer === null, 'after a dismissal the prisoner joins');
}
{
  const { st, team, h } = setup(17);
  const gy = { x: h.x + 4, z: h.z, id: 5000 };
  const r1 = RC.graveyardRaise(st, team, gy, D.POI.graveyard);
  const sk = RC.followersOf(st, 0)[0];
  ok(r1.permanent && sk && sk.type === 'skeleton' && sk.src === 'graveyard', 'graveyard raises a permanent skeleton follower');
  ok(st.ents.filter((e) => e.alive && e.temp && e.team === 0).length === Math.max(0, D.POI.graveyard.n - 1), 'the rest are temporary undead');
  while (RC.roomFor(st, team)) RC.spawnFollower(st, team, 'guard');
  const r2 = RC.graveyardRaise(st, team, gy, D.POI.graveyard);
  ok(!r2.permanent && RC.followerCount(st, team) === 4, 'with a full band the graveyard only gives temporary undead');
}
{
  const { st, team, h } = setup(18);
  const saved = FT.champChance; FT.champChance = 1;
  const m = spawnMon(st, 'orcRaider', h.x + 3, h.z, { tier: 2, elite: true });
  clearEv(); m.hp = 1; simApi.kill(st, m, { team: 0 }); run(st, 0.2);
  ok(team.offer && team.offer.kind === 'champion' && team.offer.champ, 'a defeated elite offers to join: ' + (team.offer && team.offer.name));
  cmd(st, { t: 'recruitoffer', accept: true });
  const c = RC.followersOf(st, 0)[0];
  ok(c && c.type === 'champion' && c.model === 'grunt' && c.src === 'champion' && c.lvl >= 2, 'champion follower keeps the monster look (model ' + (c && c.model) + ', lvl ' + (c && c.lvl) + ')');
  const cm = c.maxHp; c.hp = 1; simApi.kill(st, c, { team: -1 }); run(st, 0.1);
  const rec = team.fallen[0]; const e2 = RC.reviveRecord(st, team, rec, { hpFrac: 1 });
  ok(e2 && e2.model === 'grunt' && Math.abs(e2.maxHp - cm) < 1, 'revived champion keeps model and stats');
  const m2 = spawnMon(st, 'wolf', h.x + 3, h.z, { tier: 2, elite: true }); team.offer = null; m2.hp = 1; simApi.kill(st, m2, { team: 0 }); run(st, 0.1);
  ok(!team.offer, 'beasts do not offer to join');
  FT.champChance = saved;
}

// ---------------------------------------------------------------- 8. gear, dismiss
{
  const { st, team, h } = setup(19);
  const f = RC.spawnFollower(st, team, 'guard');
  const hp0 = f.maxHp, atk0 = f.atk;
  const blade = { slot: 'weapon', tier: 3, rarity: 2, affixes: [], name: 'Fine Spear', score: 20 };
  ok(RC.giveItem(st, team, f, blade) && f.eq.weapon.name === 'Fine Spear' && f.atk > atk0, 'giving a weapon equips it (atk ' + atk0.toFixed(1) + ' -> ' + f.atk.toFixed(1) + ')');
  ok(!RC.giveItem(st, team, f, { ...blade, name: 'Worse', score: 3 }) && f.eq.weapon.name === 'Fine Spear', 'a worse weapon is refused');
  const armor = { slot: 'armor', tier: 3, rarity: 2, affixes: [], name: 'Mail', score: 12 };
  cmd(st, { t: 'giveitem', id: f.id, item: armor });
  ok(f.eq.armor && f.eq.armor.name === 'Mail' && f.maxHp > hp0, 'giveitem command equips armour (hp ' + Math.round(hp0) + ' -> ' + Math.round(f.maxHp) + ')');
  // hero gear swap
  h.eq.helmet = { slot: 'helmet', tier: 2, rarity: 1, affixes: [], name: 'Hero Helm', score: 9 };
  cmd(st, { t: 'givegear', id: f.id, slot: 'helmet' });
  ok(f.eq.helmet && f.eq.helmet.name === 'Hero Helm' && !h.eq.helmet, 'givegear moves the hero\'s item to the follower');
  // ground items: only hand-me-downs the hero would not use
  h.eq.amulet = { slot: 'amulet', tier: 3, rarity: 3, affixes: [], name: 'Hero Amulet', score: 30 };
  ok(RC.followerWants(st, f, { slot: 'amulet', score: 10 }) === true && RC.followerWants(st, f, { slot: 'amulet', score: 60 }) === false, 'followers take hand-me-downs, not hero upgrades');
  clearEv(); const n0 = st.items.length;
  cmd(st, { t: 'dismiss', id: f.id });
  ok(!f.alive && RC.followerCount(st, team) === 0 && evOf('followerDismissed').length === 1 && team.fallen.length === 0, 'dismissed follower leaves (no fallen record)');
  ok(st.items.length > n0, 'his gear drops on the ground');
}

// ---------------------------------------------------------------- 9. combat: XP from kills, taunt, kite
{
  const { st, team, h } = wilds(setup(21));
  const f = RC.spawnFollower(st, team, 'guard'); f.x = h.x + 3; f.z = h.z;
  const sk = spawnMon(st, 'skeleton', h.x + 10, h.z + 2);
  const xp0 = f.xp + f.lvl * 1000; clearEv();
  run(st, 20);
  ok(!sk.alive, 'hero and follower killed the skeleton');
  ok(f.xp + f.lvl * 1000 > xp0, 'follower earned XP from the kill (xp ' + f.xp.toFixed(1) + ', lvl ' + f.lvl + ')');
  wipeMons(st); run(st, 0.1);
}
{
  const { st, team, h } = wilds(setup(22));
  const k = RC.spawnFollower(st, team, 'knight', { lvl: 2 }); k.x = h.x + 3; k.z = h.z; k.sv.tauntT = 0.1;
  const ms = [0, 1, 2].map((i) => spawnMon(st, 'orcRaider', h.x + 7, h.z + (i - 1) * 2, { tier: 1 }));
  for (const m of ms) m.tgt = h.id;
  run(st, 1.0);
  ok(ms.every((m) => m.tgt === k.id || !m.alive) || ms.filter((m) => m.tgt === k.id).length >= 2, 'knight taunts: enemies turn on him (' + ms.filter((m) => m.tgt === k.id).length + '/3)');
  wipeMons(st); run(st, 0.1);
}
{
  const { st, team, h } = wilds(setup(23));
  const a = RC.spawnFollower(st, team, 'crossbowman'); a.x = h.x - 2; a.z = h.z;
  const m = spawnMon(st, 'skeleton', a.x + 2, a.z); m.tgt = a.id; a.tgt = m.id; m.spd = 0.01; m.atk = 0.01; // a harmless slow target adjacent to the archer
  const d0 = Math.hypot(a.x - m.x, a.z - m.z); run(st, 1.2);
  const d1 = Math.hypot(a.x - m.x, a.z - m.z);
  ok(d1 > d0 + 2.5, 'crossbowman backs away from a melee enemy: ' + d0.toFixed(1) + ' -> ' + d1.toFixed(1));
  wipeMons(st); run(st, 0.1);
}

// ---------------------------------------------------------------- 10. regeneration, JSON safety, long run
{
  const { st, team, h } = setup(24);
  const f = RC.spawnFollower(st, team, 'sellsword'); f.hp = f.maxHp * 0.3; f.lastHit = -99;
  run(st, 10); ok(f.hp > f.maxHp * 0.4, 'followers regenerate out of combat: ' + Math.round(f.hp / f.maxHp * 100) + '%');
  let json = null; try { json = JSON.stringify({ f: team.followers, fallen: team.fallen, offer: team.offer, recr: st.recr }); } catch (e) { /* */ }
  ok(json !== null, 'follower state is JSON-able');
  const t0 = performance.now(); for (let i = 0; i < 200; i++) step(st, SIM_DT, idle(st)); st.events.length = 0;
  ok(performance.now() - t0 < 4000, 'sim with followers stays fast: ' + ((performance.now() - t0) / 200).toFixed(2) + ' ms/step');
}

console.log(fails ? `\n${fails} FAILED` : '\nall recruits tests passed');
process.exit(fails ? 1 : 0);
