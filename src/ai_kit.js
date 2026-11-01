// FOGBOUND v0.5 ALLIES: what an ally does in menus: level-up cards, potions, shopping and mercenaries in towns, freeing cage prisoners.
// All other lanes are read through namespace imports and guarded, so a lane that is missing or mid-rewrite never breaks the AI.
import * as perks from './perks.js';
import * as gear from './gear.js';
import * as recruits from './recruits.js';
import { MAX_FOLLOWERS } from './data.js';
import { townAt } from './ai_world.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// ---- level-up cards: SKILLS lane `perks.autoPick(st, teamId)`; fallback = a legal option from `team.kit.offers[0]` ({t:'pickperk', idx})
export function pickCards(st, ai, team) {
  const kit = team.kit;
  const offers = kit && kit.offers;
  if (offers && offers.length) {
    if (ai.cardWait > st.t) return;
    ai.cardWait = st.t + 0.35;
    const first = offers[0];
    if (typeof perks.autoPick === 'function') {
      try { perks.autoPick(st, team.id); } catch (e) { ai.stat.errors++; }
      const k2 = team.kit;
      if (!k2 || !k2.offers || k2.offers[0] !== first) { ai.stat.perks++; return; } // consumed
    }
    // fallback: prefer a new skill while a slot is empty, else a level-up, else a branch; ties by the ai rng
    const empty = (kit.slots || []).some((s, i) => !s && i < 3);
    let best = 0, bs = -1;
    first.forEach((o, i) => {
      const k = o && o.kind;
      let s = k === 'skill' ? (empty ? 3 : 1) : k === 'level' ? 2 : 1.5;
      s += ai.rng() * 0.8;
      if (s > bs) { bs = s; best = i; }
    });
    ai.cmds.push({ t: 'pickperk', idx: best }); ai.stat.perks++;
    return;
  }
  const old = team.perks && team.perks.offers; // v0.4 layout (until the SKILLS lane lands)
  if (!kit && old && old.length && !(ai.cardWait > st.t)) {
    ai.cardWait = st.t + 0.5;
    ai.cmds.push({ t: 'pickperk', idx: Math.floor(ai.rng() * old[0].length) }); ai.stat.perks++;
  }
}

// ---- potions: heal below P.potion hp, shield when a fight turns bad, speed when running away. Shared potion cooldown handled by the sim.
export function usePotions(st, ai, team, h, S, hpPct, fleeing) {
  const pots = team.pots; if (!pots) return;
  ai.pots = (pots.heal || 0);
  if ((team.potCd || 0) > 0 || !h.alive) return;
  const use = (k) => { ai.cmds.push({ t: 'gear', op: 'potion', k }); ai.stat.potions++; };
  const threatened = S.threats.length > 0 || st.t - h.lastHit < 3;
  if (hpPct < ai.P.potion && (pots.heal || 0) > 0 && threatened) return use('heal');
  if (pots.shield > 0 && threatened && hpPct < 0.6 && S.threats.length >= 3) return use('shield');
  if ((pots.speed || pots.surge) > 0 && fleeing && S.threats.length) return use(pots.speed ? 'speed' : 'surge');
  if (pots.surge > 0 && S.threats.length >= 4 && hpPct > 0.5) return use('surge'); // v0.4 name of the damage potion
}

// ---- town: buy potions, hire a mercenary. Only when standing in a living town (the sim rejects the rest).
const potCost = (k) => num(gear.GEAR_CFG && gear.GEAR_CFG.potCost && gear.GEAR_CFG.potCost[k], 45);
export function wantsTown(st, team) {
  const pots = team.pots || {};
  const lacksPots = (pots.heal || 0) < 2 && team.gold >= potCost('heal');
  return lacksPots || canHire(st, team, 120);
}
export function canHire(st, team, minGold = 0) {
  const n = (team.followers && team.followers.length) || 0;
  const cap = typeof recruits.followerCap === 'function' ? num(recruits.followerCap(team), MAX_FOLLOWERS) : MAX_FOLLOWERS;
  return n < Math.min(MAX_FOLLOWERS, cap) && team.gold >= minGold;
}
export function shop(st, ai, team, h) {
  const town = townAt(st, h.x, h.z, 8);
  if (!town || town.state === 'fallen' || st.t < (ai.shopT || 0)) return false;
  ai.shopT = st.t + 2.5;
  const pots = team.pots || (team.pots = {});
  const costs = (gear.GEAR_CFG && gear.GEAR_CFG.potCost) || { heal: 45 };
  let gold = team.gold, did = false;
  for (const k of ['heal', 'shield', 'speed', 'surge']) {
    if (costs[k] === undefined) continue;
    const have = pots[k] || 0, cost = costs[k];
    if (have >= (k === 'heal' ? 3 : 1) || gold < cost + (k === 'heal' ? 0 : 150)) continue;
    ai.cmds.push({ t: 'gear', op: 'buypot', k }); gold -= cost; did = true; ai.stat.shop++;
  }
  if (canHire(st, team, 60) && typeof recruits.mercenaryOffers === 'function') {
    let offers = [];
    try { offers = recruits.mercenaryOffers(st, town.id) || []; } catch (e) { ai.stat.errors++; }
    let best = null, bv = -1;
    for (const o of offers) {
      if (o.sold || o.cost > gold - 25) continue;
      const v = (o.hp || 1) * 0.02 + (o.dmg || 1) * 0.6 + (o.cost || 0) * 0.01 + (/heal|priest|healer/.test((o.role || '') + (o.type || '')) ? 6 : 0);
      if (v > bv) { bv = v; best = o; }
    }
    if (best) { ai.cmds.push({ t: 'recruit', type: best.type, offer: best.id, town: town.id }); ai.stat.hires++; did = true; }
  }
  return did;
}

// ---- cage prisoners (POI 'cage'): free one when it is open (guards dead) and close
export function cageNear(st, h, r) {
  let best = null, bd = r;
  for (const p of st.pois || []) {
    if (p.type !== 'cage' || p.used) continue;
    const c = st.camps && st.camps[p.camp]; if (c && c.mons > 0) continue;
    const d = Math.hypot(p.x - h.x, p.z - h.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
