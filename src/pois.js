// v3 lane module "pois" (WORLD CONTENT lane): see src/V3.md. Twelve points of interest with real effects.
// st.pois[] = { ...site {id,type,x,z,quadrant}, used:bool, cd:seconds, disc:[bool x4], ...per-type fields }.
// Interaction: the hero walks within POI.reach and presses E (controls push {t:'poi', id}); team.poiNear = id of the POI in reach (0 = none) drives the prompt.
// AI lanes may push the same command. Events: {type:'discover', kind:'poi', id, team, x, z}, {type:'poiUse', id, kind, team, x, z, ok}.
import { simApi } from './sim.js';
import * as orbs from './pots.js'; // v5: potion rewards (orbs/books are gone; alias kept to avoid churn)
import { POI, UNITS } from './data.js';
import * as perks from './perks.js';
import * as recruits from './recruits.js';
import { clamp, anyTeamWithin, grantXP, addResearch, dropLegendary, walkableNear, makeCamp, msg, teamNear } from './wc_util.js';

const TAU = Math.PI * 2, ARM_DIST = 60;

export const POI_INFO = { // short names + prompt verbs shared with the view / UI
  altar: ['Blood Altar', 'Offer blood'], library: ['Ruined Library', 'Study the tomes'], graveyard: ['Graveyard', 'Raise the dead'], well: ['Wishing Well', 'Toss a coin'],
  witch: ['Witch Hut', 'Speak with the witch'], cage: ['Prisoner Cage', 'Free the prisoner'], hoard: ['Dragon Hoard', 'Take the hoard'], bridge: ['Troll Bridge', 'Pay the toll'],
  cursed: ['Cursed Chest', 'Open the chest'], watchtower: ['Watchtower', 'Light the beacon'], shrine: ['Hidden Shrine', 'Pray'], caravan: ['Merchant Caravan', 'Hire as escort'],
};

export function init(st) {
  st.pois = [];
  const sites = (st.world.sites && st.world.sites.pois) || [];
  for (const s of sites) {
    const p = Object.assign({}, s, { used: false, cd: 0, disc: [false, false, false, false] });
    if (!POI_INFO[p.type]) continue;
    setupPoi(st, p);
    st.pois.push(p);
  }
  for (const t of st.teams) t.poiNear = 0;
  st.poiT = 0;
}

// guard camps exist from the start but their monsters spawn lazily (armPoi) when somebody comes near: keeps the sim cheap
function guardCamp(st, p, types, tier, ox = 0, oz = 0) {
  const [x, z] = walkableNear(st, p.x + ox, p.z + oz);
  const id = makeCamp(st, x, z, tier, types, { poi: p.id }).id;
  (p.pending || (p.pending = [])).push(id);
  return id;
}

function armPoi(st, p) {
  const ids = p.pending; p.pending = null; p.armed = true;
  for (const id of ids) {
    simApi.spawnCamp(st, st.camps[id]);
    for (const e of st.ents) if (e.camp === id) e.poi = p.id;
  }
  if (p.type === 'bridge') { const tr = st.ents.find((e) => e.camp === p.camp); p.troll = tr ? tr.id : 0; }
}

function setupPoi(st, p) {
  const A = POI;
  switch (p.type) {
    case 'well': p.left = A.well.uses; break;
    case 'witch': p.q = {}; break;
    case 'cage': p.camp = guardCamp(st, p, A.cage.guards, A.cage.tier, 3, 3); break;
    case 'hoard': p.camp = guardCamp(st, p, A.hoard.guards, A.hoard.tier, 4, -3); break;
    case 'bridge': {
      p.camp = guardCamp(st, p, ['troll'], A.bridge.tier, 0, 0); p.troll = 0;
      break;
    }
    case 'watchtower': p.owner = -1; p.vision = 0; break;
    case 'caravan': setupCaravan(st, p); break;
  }
}

function setupCaravan(st, p) {
  p.sx = p.x; p.sz = p.z; p.state = 'idle'; p.team = -1; p.away = 0; p.prog = 0;
  // destination: the region whose distance best matches POI.caravan.dist (keeps / districts of other lords excluded unless nothing else fits)
  let best = null, bs = 1e9;
  for (const r of (st.world.sites && st.world.sites.regions) || []) {
    const d = Math.hypot(r.x - p.x, r.z - p.z);
    if (d < 50) continue;
    const s = Math.abs(d - POI.caravan.dist) + (r.kind === 'keep' ? 60 : 0);
    if (s < bs) { bs = s; best = r; }
  }
  if (best) { p.dx = best.x; p.dz = best.z; }
  else { const a = Math.atan2(-p.z, -p.x); p.dx = p.x + Math.cos(a) * POI.caravan.dist; p.dz = p.z + Math.sin(a) * POI.caravan.dist; }
  p.len = Math.hypot(p.dx - p.sx, p.dz - p.sz);
  const mx = p.sx + (p.dx - p.sx) * 0.55, mz = p.sz + (p.dz - p.sz) * 0.55;
  p.ambush = guardCamp(st, p, POI.caravan.ambush, POI.caravan.ambushTier, mx - p.x, mz - p.z);
}

export function update(st, dt) {
  // caravans move every step
  for (const p of st.pois) if (p.type === 'caravan' && p.state === 'moving') caravanStep(st, p, dt);
  for (const p of st.pois) if (p.cd > 0) p.cd -= dt;
  st.poiT -= dt;
  if (st.poiT > 0) return;
  st.poiT = 0.25;
  for (const p of st.pois) if (p.pending && anyTeamWithin(st, p.x, p.z, ARM_DIST)) armPoi(st, p);
  for (const t of st.teams) {
    t.poiNear = 0;
    const h = t.hero;
    if (!t.alive || !h || !h.alive) continue;
    let bd = POI.reach + 1;
    for (const p of st.pois) {
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < bd) { bd = d; t.poiNear = p.id; }
      const dr = p.type === 'shrine' ? 8 : POI.discover;
      if (d < dr && !p.disc[t.id]) {
        p.disc[t.id] = true;
        simApi.ev(st, { type: 'discover', kind: 'poi', poi: p.type, id: p.id, team: t.id, x: p.x, z: p.z });
        if (t.human) msg(st, `Discovered: ${POI_INFO[p.type][0]}`, 'info', t.id);
      }
    }
  }
}

function caravanStep(st, p, dt) {
  const C = POI.caravan, team = st.teams[p.team], h = team && team.hero;
  const escorted = h && h.alive && Math.hypot(h.x - p.x, h.z - p.z) < C.escort;
  const camp = st.camps[p.ambush];
  if (p.pending && anyTeamWithin(st, camp.x, camp.z, ARM_DIST)) armPoi(st, p);
  const ambushed = camp && camp.mons > 0 && Math.hypot(camp.x - p.x, camp.z - p.z) < 16;
  p.wait = !escorted || ambushed;
  if (!escorted) { p.away += dt; if (p.away > 60) { p.state = 'idle'; p.team = -1; p.away = 0; if (team && team.human) msg(st, 'The caravan lost faith in its escort and halted.', 'warn', team.id); } return; }
  p.away = 0;
  if (ambushed) return;
  const d = Math.hypot(p.dx - p.x, p.dz - p.z);
  if (d < 3) {
    p.state = 'done'; p.used = true; p.x = p.dx; p.z = p.dz;
    team.gold += C.gold;
    simApi.ev(st, { type: 'gold', x: p.x, z: p.z, amt: C.gold, team: team.id });
    grantXP(st, team.id, C.xp, 'caravan', p.x, p.z);
    simApi.ev(st, { type: 'poiUse', id: p.id, kind: 'caravan', team: team.id, x: p.x, z: p.z, ok: true });
    msg(st, `The caravan arrived safely: +${C.gold} gold.`, 'big', team.id);
    return;
  }
  const s = Math.min(d, C.speed * dt);
  p.x += (p.dx - p.x) / d * s; p.z += (p.dz - p.z) / d * s;
  p.prog = 1 - d / Math.max(1, p.len);
}

// ------------------------------------------------------------------ commands
export function command(st, team, c) {
  if (c.t !== 'poi') return false;
  const p = st.pois.find((q) => q.id === c.id);
  const h = team.hero;
  if (!p || !h || !h.alive || h.dead) return true;
  if (Math.hypot(h.x - p.x, h.z - p.z) > POI.reach + 1) return true;
  use(st, team, h, p, c);
  return true;
}

function say(st, team, text, kind = 'info') { if (team.human) msg(st, text, kind, team.id); }
function fx(st, p, team, ok = true) { simApi.ev(st, { type: 'poiUse', id: p.id, kind: p.type, team: team.id, x: p.x, z: p.z, ok }); }
function spend(team, g) { if (team.gold < g) return false; team.gold -= g; return true; }

function use(st, team, h, p) {
  const A = POI, rng = () => st.rng();
  switch (p.type) {
    case 'altar': {
      if (p.cd > 0) return say(st, team, `The altar is still warm (${Math.ceil(p.cd)} s).`, 'warn');
      if (h.hp < h.maxHp * A.altar.minHp) return say(st, team, 'You are too weak to bleed for the altar.', 'warn');
      h.hp -= h.maxHp * A.altar.hpFrac; p.cd = A.altar.cd;
      const xp = A.altar.xpBase + A.altar.xpPerLvl * h.lvl;
      grantXP(st, team.id, xp, 'altar', h.x, h.z);
      say(st, team, `The altar drinks your blood: +${xp} XP.`, 'info'); fx(st, p, team); break;
    }
    case 'library': {
      if (p.used) return say(st, team, 'The shelves are bare.', 'warn');
      p.used = true; addResearch(st, team.id, A.library.points); if (typeof orbs.poiReward === 'function') orbs.poiReward(st, team.id, 'library', p.x, p.z, p.tier || 2); grantXP(st, team.id, A.library.xp, 'library', h.x, h.z);
      say(st, team, `Forgotten lore: +${A.library.points} research points.`, 'big'); fx(st, p, team); break;
    }
    case 'graveyard': {
      if (p.cd > 0) return say(st, team, `The graves are quiet (${Math.ceil(p.cd)} s).`, 'warn');
      if (!spend(team, A.graveyard.cost)) return say(st, team, `Raising the dead costs ${A.graveyard.cost} gold.`, 'warn');
      p.cd = A.graveyard.cd;
      const gr = recruits.graveyardRaise(st, team, p, A.graveyard); // v4: one permanent skeleton follower when there is room, the rest are temporary
      say(st, team, gr.permanent ? `A skeleton rises and joins you${gr.temps ? `, with ${gr.temps} more for ${A.graveyard.life} s` : ''}.` : `${A.graveyard.n} undead claw out of the earth (${A.graveyard.life} s).`, 'info'); fx(st, p, team); break;
    }
    case 'well': {
      if (p.left <= 0) return say(st, team, 'The well has run dry.', 'warn');
      if (!spend(team, A.well.cost)) return say(st, team, `A coin costs ${A.well.cost} gold.`, 'warn');
      p.left--; if (p.left <= 0) p.used = true;
      let r = rng(), pay = 0;
      for (const [ch, g] of A.well.table) { if (r < ch) { pay = g; break; } r -= ch; }
      if (pay > 0) { team.gold += pay; simApi.ev(st, { type: 'gold', x: p.x, z: p.z, amt: pay, team: team.id }); }
      say(st, team, pay > 0 ? `The well answers: +${pay} gold!` : 'The coin sinks without a sound.', pay >= A.well.table[2][1] ? 'big' : 'info'); fx(st, p, team, pay > 0); break;
    }
    case 'witch': {
      const q = p.q[team.id] || (p.q[team.id] = { s: 'none', n: 0 });
      if (q.s === 'done') {
        q.s = 'claimed'; team.gold += A.witch.gold; if (typeof orbs.poiReward === 'function') orbs.poiReward(st, team.id, 'witch', p.x, p.z, 2); grantXP(st, team.id, A.witch.xp, 'witch', h.x, h.z);
        simApi.ev(st, { type: 'gold', x: p.x, z: p.z, amt: A.witch.gold, team: team.id });
        say(st, team, `The witch pays ${A.witch.gold} gold for the slain.`, 'big'); fx(st, p, team); break;
      }
      if (q.s === 'none') { q.s = 'active'; q.n = 0; say(st, team, `Bounty: slay ${A.witch.kills} monsters for the witch (${A.witch.gold} gold).`, 'big'); break; }
      if (p.cd > 0) return say(st, team, 'The cauldron is empty.', 'warn');
      if (q.s === 'active' && q.n < A.witch.kills && h.hp >= h.maxHp * 0.98) return say(st, team, `Bounty: ${q.n}/${A.witch.kills} slain.`, 'info');
      if (!spend(team, A.witch.brewCost)) return say(st, team, `A brew costs ${A.witch.brewCost} gold.`, 'warn');
      h.hp = h.maxHp; h.buff = { until: st.t + A.witch.buffT, dmg: A.witch.dmg, atkSpd: 1, spd: 1 }; p.cd = 20;
      say(st, team, 'You drink the brew: fully healed, fiercer for a while.', 'info'); fx(st, p, team); break;
    }
    case 'cage': {
      if (p.used) return say(st, team, 'The cage is empty.', 'warn');
      if (st.camps[p.camp] && st.camps[p.camp].mons > 0) return say(st, team, 'Kill the guards before opening the cage.', 'warn');
      // v4 (RECRUITS lane): the prisoner becomes a follower offer (accept with Y / the recruits panel); the cage stays closed until accepted
      if (recruits.offerFromCage(st, team, p)) { fx(st, p, team); break; }
      p.used = true;
      grantXP(st, team.id, A.cage.xp, 'cage', h.x, h.z);
      say(st, team, 'The prisoner thanks you and walks away.', 'info'); fx(st, p, team); break;
    }
    case 'hoard': {
      if (p.used) return say(st, team, 'Only scorched bones remain.', 'warn');
      if (st.camps[p.camp] && st.camps[p.camp].mons > 0) return say(st, team, 'The hoard is guarded.', 'warn');
      p.used = true; team.gold += A.hoard.gold;
      simApi.ev(st, { type: 'gold', x: p.x, z: p.z, amt: A.hoard.gold, team: team.id });
      for (let i = 0; i < A.hoard.legendary; i++) dropLegendary(st, p.x, p.z);
      if (typeof orbs.poiReward === 'function') orbs.poiReward(st, team.id, 'hoard', p.x, p.z, 3);
      grantXP(st, team.id, A.hoard.xp, 'hoard', h.x, h.z);
      say(st, team, `You claim the hoard: +${A.hoard.gold} gold and a legendary relic.`, 'big'); fx(st, p, team); break;
    }
    case 'bridge': {
      const tr = st.byId.get(p.troll);
      if (p.used || !tr || !tr.alive) return say(st, team, 'The bridge is free.', 'info');
      if (!spend(team, A.bridge.toll)) return say(st, team, `The troll wants ${A.bridge.toll} gold, or a fight.`, 'warn');
      p.used = true; tr.alive = false; tr.hp = 0; tr.poi = undefined;
      const camp = st.camps[tr.camp]; if (camp) camp.mons--;
      say(st, team, 'The troll pockets the coins and lumbers aside.', 'info'); fx(st, p, team); break;
    }
    case 'cursed': {
      if (p.used) return say(st, team, 'The chest is empty.', 'warn');
      p.used = true;
      const r = rng();
      if (r < A.cursed.good) {
        dropLegendary(st, p.x, p.z); team.gold += A.cursed.gold;
        if (typeof orbs.poiReward === 'function') orbs.poiReward(st, team.id, 'cursed', p.x, p.z, 2);
        simApi.ev(st, { type: 'gold', x: p.x, z: p.z, amt: A.cursed.gold, team: team.id });
        say(st, team, `Treasure! A relic and ${A.cursed.gold} gold.`, 'big'); fx(st, p, team, true);
      } else if (r < A.cursed.good + A.cursed.curse) {
        h.hp = Math.max(1, h.hp - h.maxHp * 0.3);
        h.buff = { until: st.t + A.cursed.curseT, dmg: A.cursed.curseDmg, atkSpd: 1, spd: 0.9 };
        say(st, team, 'A curse seizes you: weaker for a while.', 'warn'); fx(st, p, team, false);
      } else {
        const camp = makeCamp(st, p.x, p.z, A.cursed.mimicTier, A.cursed.mimic, { poi: p.id });
        simApi.spawnCamp(st, camp);
        for (const e of st.ents) if (e.camp === camp.id) { e.poi = undefined; e.tgt = h.id; }
        say(st, team, 'It was a mimic!', 'warn'); fx(st, p, team, false);
      }
      grantXP(st, team.id, A.cursed.xp, 'cursed', h.x, h.z);
      break;
    }
    case 'watchtower': {
      if (p.owner === team.id) return say(st, team, 'Your beacon already burns here.', 'info');
      p.owner = team.id; p.vision = A.watchtower.vision;
      grantXP(st, team.id, A.watchtower.xp, 'watchtower', h.x, h.z);
      say(st, team, 'The beacon flares: the land around is revealed.', 'info'); fx(st, p, team); break;
    }
    case 'shrine': {
      if (p.cd > 0) return say(st, team, `The shrine is silent (${Math.ceil(p.cd)} s).`, 'warn');
      p.cd = A.shrine.cd; h.hp = h.maxHp;
      for (const u of st.ents) if (u.alive && u.team === team.id && u.kind === 'unit' && Math.hypot(u.x - p.x, u.z - p.z) < 14) u.hp = u.maxHp;
      let rerolled = false;
      for (const fn of ['reroll', 'rerollOffers', 'rerollPerks']) if (!rerolled && typeof perks[fn] === 'function') { try { perks[fn](st, team.id); rerolled = true; } catch (e) { /* ignore */ } }
      grantXP(st, team.id, A.shrine.xp, 'shrine', h.x, h.z);
      if (typeof orbs.poiReward === 'function') orbs.poiReward(st, team.id, 'shrine', p.x, p.z, 2);
      say(st, team, rerolled ? 'The shrine heals you and reshuffles your fate (perks rerolled).' : 'The shrine heals your wounds.', 'big'); fx(st, p, team); break;
    }
    case 'caravan': {
      if (p.used || p.state === 'done') return say(st, team, 'The caravan has gone.', 'info');
      if (p.state === 'moving') return say(st, team, p.team === team.id ? 'Stay close: the caravan follows you only while you guard it.' : 'Another lord already escorts this caravan.', 'info');
      p.state = 'moving'; p.team = team.id; p.away = 0;
      say(st, team, `Escort the caravan to its destination (${Math.round(p.len)} m) for ${POI.caravan.gold} gold. Stay close.`, 'big'); fx(st, p, team); break;
    }
  }
}

// ------------------------------------------------------------------ hooks
export function onKill(st, t, src) {
  if (t.kind !== 'mon') return;
  const team = src && src.team >= 0 ? src.team : -1;
  if (team >= 0) {
    for (const p of st.pois) {
      if (p.type !== 'witch') continue;
      const q = p.q[team];
      if (q && q.s === 'active' && ++q.n >= POI.witch.kills) { q.s = 'done'; if (st.teams[team].human) msg(st, 'Bounty complete: return to the witch.', 'big', team); }
    }
  }
  if (t.poi === undefined) return;
  const p = st.pois.find((q) => q.id === t.poi);
  if (p && p.type === 'bridge' && t.id === p.troll && !p.used && team >= 0) {
    p.used = true;
    const tm = st.teams[team];
    tm.gold += POI.bridge.gold; simApi.ev(st, { type: 'gold', x: p.x, z: p.z, amt: POI.bridge.gold, team });
    grantXP(st, team, POI.bridge.xp, 'bridge', p.x, p.z);
    if (tm.human) msg(st, `The bridge troll falls: +${POI.bridge.gold} gold from his purse.`, 'big', team);
  }
}

export function onDamage(st, src, t, amt) { return amt; }
