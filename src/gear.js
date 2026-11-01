// v0.5 COMBAT lane module "gear" (sim side): auto-equip gear (4 slots, one stat each), the drop system, 3 quick potions, dodge roll, run statistics.
// Sim-only: no DOM / Three, no Math.random (st.rng), deterministic. Hooks (v3hooks MODS): init, update, command, onKill, pickup. See src/V5.md "COMBAT lane API".
import { simApi } from './sim.js';
import { betterThan, sellValue } from './loot.js';
import { DROP, POTION_INFO, POTION_MAX } from './data.js';
import * as travel from './travel.js';

export const GEAR_CFG = {
  bag: 24,                       // compat: shop-bought gear lands in team.bag for one step and is then auto-equipped or sold (there is no backpack UI)
  sellMul: 0.5,                  // price multiplier for items sold by the UI/AI (walked-over worse items use DROP.sell)
  potMax: POTION_MAX, potCd: 8,  // carried potions per kind (3), shared cooldown (s)
  healFrac: 0.45,                // heal potion: instant +45% max HP
  speed: { dur: 8, spd: 1.3, atkSpd: 1.2 },
  shield: { dur: 8, frac: 0.4 }, // absorbs 40% of max HP
  potCost: { heal: POTION_INFO.heal.price, speed: POTION_INFO.speed.price, shield: POTION_INFO.shield.price }, // price at a town merchant (op 'buypot')
  start: { heal: 2, speed: 0, shield: 0 },
  roll: { t: 0.32, spd: 17, cd: 4.5, inv: 0.42 }, // dodge roll: ~5.4 m extra, short invulnerability
};
export const POTIONS = POTION_INFO;
const KINDS = ['heal', 'speed', 'shield'];
const kindOf = (k) => (k === 'surge' ? 'speed' : k); // v0.4 name of the speed potion

const ev = (st, e) => simApi.ev(st, e);
const isHeroTeam = (t) => t && t.id >= 0 && t.id < 4 && !t.humanity;
const msg = (st, team, text, kind = 'info') => { if (team.human) ev(st, { type: 'msg', text, kind, team: team.id }); };

export function init(st) {
  for (const t of st.teams) {
    if (!isHeroTeam(t)) continue;
    t.bag = t.bag || [];
    t.pots = Object.assign({ heal: 0, speed: 0, shield: 0 }, t.pots || { ...GEAR_CFG.start });
    delete t.pots.surge;
    t.potCd = t.potCd || 0;
    t.dodgeCd = 0; t.dodgeMax = GEAR_CFG.roll.cd;
    t.dropC = 0; t.dropAt = rollEvery(st);
    t.run = t.run || { kills: 0, orcs: 0, demons: 0, heroes: 0, elites: 0, bosses: 0, items: 0, gold: 0 };
  }
}

const rollEvery = (st) => DROP.killsPerDrop[0] + Math.floor(st.rng() * (DROP.killsPerDrop[1] - DROP.killsPerDrop[0] + 1));

export function addPotion(team, kind, n = 1) {
  kind = kindOf(kind);
  if (!KINDS.includes(kind)) return 0;
  if (!team.pots) team.pots = { heal: 0, speed: 0, shield: 0 };
  const have = team.pots[kind] || 0, add = Math.max(0, Math.min(GEAR_CFG.potMax - have, n));
  team.pots[kind] = have + add;
  return add;
}
export const bagFree = (team) => GEAR_CFG.bag - (team.bag ? team.bag.length : 0); // compat

// ---- equipment ------------------------------------------------------------------------------------------------------
const plain = (st, it) => ({ slot: it.slot, stat: it.stat, val: it.val, tier: it.tier | 0, rarity: it.tier | 0, affixes: [], name: it.name, score: it.score, uid: it.uid || st.nextId++ });
function wear(h, it) { h.eq[it.slot] = it; h.gear[it.slot] = (it.tier | 0) + 1; simApi.recalc(h); }

/** Give an item to a hero: auto-equip when better (the replaced one is sold), else sell it. Returns 'equipped' | 'sold'. */
export function takeItem(st, h, raw, at) {
  const team = st.teams[h.team], it = plain(st, raw), cur = h.eq[it.slot];
  const x = at ? at.x : h.x, z = at ? at.z : h.z;
  if (team && team.run) team.run.items++;
  if (betterThan(it, cur)) {
    wear(h, it);
    if (cur && team) { const g = sellValue(cur); team.gold += g; }
    ev(st, { type: 'item', x, z, name: it.name, team: h.team, hero: true, rarity: it.tier, equipped: true, slot: it.slot, stat: it.stat, val: it.val, old: cur ? { name: cur.name, stat: cur.stat, val: cur.val, tier: cur.tier } : null });
    return 'equipped';
  }
  const g = sellValue(it);
  if (team) team.gold += g;
  ev(st, { type: 'item', x, z, name: it.name, team: h.team, hero: true, rarity: it.tier, sold: g, slot: it.slot, stat: it.stat, val: it.val });
  ev(st, { type: 'gold', x, z, amt: g, team: h.team });
  return 'sold';
}
/** pickup hook (sim.js item loop): heroes take every item. Returns true when the item was taken. */
export function pickup(st, e, it) {
  if (e.kind !== 'hero' || !it.stat) return false;
  if (!isHeroTeam(st.teams[e.team])) return false;
  takeItem(st, e, it, it);
  return true;
}

function gearOp(st, team, c) {
  const h = team.hero;
  if (!h) return;
  switch (c.op) {
    case 'equip': { // compat: shop-bought gear in team.bag (auto-flushed every step anyway)
      if (!h.alive || !team.bag) return;
      const i = team.bag.findIndex((x) => x.uid === c.item); if (i < 0) return;
      takeItem(st, h, team.bag.splice(i, 1)[0]);
      break;
    }
    case 'potion': usePotion(st, team, kindOf(c.k)); break;
    case 'buypot': {
      const k = kindOf(c.k), cost = GEAR_CFG.potCost[k];
      if (!cost || !h.alive) return;
      if (!shopNear(st, h)) { msg(st, team, 'Potions are sold by merchants in towns', 'warn'); return; }
      if (team.gold < cost) { msg(st, team, 'Not enough gold', 'warn'); return; }
      if ((team.pots[k] || 0) >= GEAR_CFG.potMax) { msg(st, team, 'You cannot carry more', 'warn'); return; }
      team.gold -= cost; addPotion(team, k, 1);
      break;
    }
  }
}
export function shopNear(st, h) {
  if (!Array.isArray(st.towns) || !st.towns.length) return true; // no towns yet: do not block testing
  return st.towns.some((t) => t.state !== 'fallen' && (!t.services || t.services.shop !== false) && Math.hypot(t.x - h.x, t.z - h.z) < (t.r || 30) + 8);
}

function usePotion(st, team, k) {
  const h = team.hero, d = POTION_INFO[k];
  if (!h || !h.alive || h.dead || !d) return;
  if (!team.pots || (team.pots[k] || 0) <= 0) { msg(st, team, `No ${d.name.toLowerCase()} left`, 'warn'); return; }
  if (team.potCd > 0) return;
  if (k === 'heal') {
    if (h.hp >= h.maxHp - 1) { msg(st, team, 'You are at full health', 'info'); return; }
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * GEAR_CFG.healFrac);
    ev(st, { type: 'buff', x: h.x, z: h.z, r: 2.5, color: 0xff6a5a });
  } else if (k === 'speed') {
    const s = GEAR_CFG.speed;
    h.buff = { until: st.t + s.dur, dmg: 1, atkSpd: s.atkSpd, spd: s.spd };
    ev(st, { type: 'buff', x: h.x, z: h.z, r: 2.5, color: 0xffd860 });
  } else {
    const s = GEAR_CFG.shield;
    h.shield = { amt: h.maxHp * s.frac, until: st.t + s.dur };
    ev(st, { type: 'buff', x: h.x, z: h.z, r: 2.5, color: 0x9fd0ff });
  }
  team.pots[k]--; team.potCd = GEAR_CFG.potCd;
  ev(st, { type: 'potion', team: team.id, k, x: h.x, z: h.z });
}

function dodge(st, team, c) {
  const h = team.hero, R = GEAR_CFG.roll;
  if (!h || !h.alive || h.dead || (h.stun || 0) > 0 || team.dodgeCd > 0 || (h.roll && h.roll.t > 0)) return;
  let dx = +c.dx || 0, dz = +c.dz || 0; const l = Math.hypot(dx, dz);
  if (l < 0.01) { dx = Math.cos(h.face || 0); dz = Math.sin(h.face || 0); } else { dx /= l; dz /= l; }
  h.roll = { t: R.t, dx, dz };
  h.face = Math.atan2(dz, dx);
  h.inv = Math.max(h.inv || 0, st.t + R.inv);
  h.charging = false; h.chargeT = 0; h.dest = null;
  if (team.tele) { try { travel.cancelChannel(st, team, 'move'); } catch (e) { /* travel lane may differ */ } }
  team.dodgeCd = R.cd * (1 - Math.min(40, h.cdr || 0) / 100); team.dodgeMax = team.dodgeCd;
  ev(st, { type: 'dash', x: h.x, z: h.z, ang: h.face, color: 0xcfd6d0 });
  ev(st, { type: 'dodge', team: team.id, x: h.x, z: h.z });
}

export function command(st, team, c) {
  if (c.t === 'gear') { gearOp(st, team, c); return true; }
  if (c.t === 'dodge') { dodge(st, team, c); return true; }
  return false;
}

export function update(st, dt) {
  const R = GEAR_CFG.roll;
  for (const t of st.teams) {
    if (!isHeroTeam(t)) continue;
    if (t.bag && t.bag.length) { const h = t.hero; while (t.bag.length) { const b = t.bag.pop(); if (h && b && b.stat) takeItem(st, h, b); else if (b && b.stat) t.gold += sellValue(b); } } // shop-bought gear: wear or sell
    if (t.dodgeCd > 0) t.dodgeCd = Math.max(0, t.dodgeCd - dt);
    if (t.potCd > 0) t.potCd = Math.max(0, t.potCd - dt);
    const h = t.hero;
    if (h && h.roll) {
      if (!h.alive || h.dead) h.roll = null;
      else {
        const step = Math.min(dt, h.roll.t);
        simApi.moveBy(st, h, h.roll.dx * R.spd * step, h.roll.dz * R.spd * step);
        h.roll.t -= dt;
        if (h.roll.t <= 0) h.roll = null;
      }
    }
  }
}

// ---- drops ----------------------------------------------------------------------------------------------------------
const pickKind = (rng) => { let r = rng(), k = 'heal'; for (const id in DROP.potionKinds) { k = id; r -= DROP.potionKinds[id]; if (r <= 0) break; } return k; };

/** Drop gear on the ground at (x,z) (sim.js dropLoot). o: { team (favours its hero's empty slots), tier (monster tier), elite, boss, chest, n (pieces) } */
export const dropLoot = (st, x, z, o = {}) => simApi.dropLoot(st, x, z, o);

const DEMON = /demon|imp|hound|brute|warlock|hulk|lord|fiend|horror/i;
export function onKill(st, t, src) {
  if (!src || src.team === undefined || src.team < 0 || src.team > 3) return;
  const team = st.teams[src.team];
  if (!team || !team.run) return;
  const r = team.run;
  if (t.kind === 'bld') { if (t.gate || (t.type === 'gate' && t.team < 0)) dropLoot(st, t.x, t.z, { team: src.team, tier: 2, elite: 1, n: DROP.gateGear }); return; }
  if (t.kind === 'hero') return;
  if (t.team === src.team || t.team >= 4) return;
  r.kills++;
  if (t.elite) r.elites++;
  if (t.boss) r.bosses++;
  if (t.demon || t.horde || DEMON.test(String(t.type || t.model || t.name || ''))) { r.demons++; r.orcs++; }
  if (t.kind !== 'mon' || t.team >= 0) return;
  // guaranteed loot: gates, champions and bosses
  if (t.demon === 'gate' || t.gate) { dropLoot(st, t.x, t.z, { team: src.team, tier: 3, elite: 1, n: DROP.gateGear }); givePotions(st, team, t, 1); return; }
  if (t.boss) { dropLoot(st, t.x, t.z, { team: src.team, tier: t.tier || 3, boss: true, n: DROP.bossGear }); givePotions(st, team, t, 2); return; }
  if (t.elite) {
    dropLoot(st, t.x, t.z, { team: src.team, tier: t.tier || 2, elite: 1, n: DROP.eliteGear + (st.rng() < DROP.eliteExtra ? 1 : 0) });
    givePotions(st, team, t, 1); return;
  }
  // everything else: a drop about every killsPerDrop kills of the team (pity counter)
  team.dropC = (team.dropC || 0) + 1;
  if (team.dropC >= (team.dropAt || 5)) {
    team.dropC = 0; team.dropAt = rollEvery(st);
    if (st.rng() < DROP.potion) givePotions(st, team, t, 1);
    else dropLoot(st, t.x, t.z, { team: src.team, tier: t.tier || 1 });
  }
}
function givePotions(st, team, t, n) {
  for (let i = 0; i < n; i++) {
    const k = pickKind(st.rng);
    if (addPotion(team, k, 1)) { msg(st, team, `Found ${POTION_INFO[k].name}`, 'info'); ev(st, { type: 'pickpot', team: team.id, k, x: t.x, z: t.z }); }
    else { const g = 10; team.gold += g; ev(st, { type: 'gold', x: t.x, z: t.z, amt: g, team: team.id }); }
  }
}
