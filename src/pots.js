// v5 SLIM leftovers of the old orbs.js: potion drops from kills/chests, AI potion drinking, gold scarcity (kill/chest gold multipliers).
// COMBAT lane owns the numbers (data.js ECON4 / POTION_DROP); there is no passive income (team.income stays 0).
import { ECON4, POTION_DROP } from './data.js';
import * as gear from './gear.js'; // team.pots {heal, surge, ...}, addPotion, command({t:'gear',op:'potion',k})
import * as perks from './perks.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isHero = (id) => id >= 0 && id < 4;
const ev = (st, e) => st.events.push(e);
const say = (st, team, text, kind = 'info') => { if (team && team.human) ev(st, { type: 'msg', text, kind, team: team.id }); };
const danger = (st, x, z) => { try { return typeof perks.dangerAt === 'function' ? perks.dangerAt(st, x, z) : 0.5; } catch (e) { return 0.5; } };

// potions go straight into the hero's pouch (gear.js); returns true when there was room
export function giveHealPotion(st, team) { try { return !!gear.addPotion(team, 'heal', 1); } catch (e) { return false; } }

const seen = new WeakSet();
export function update(st, dt) {
  for (let k = 0; k < 4; k++) if (st.teams[k]) st.teams[k].income = ECON4.stipend;
  // chests: gold scaled once per fill; opened chests may add a potion
  for (const c of st.chests) {
    if (c.opened) c.sc = 0;
    else if (!c.sc) { c.sc = 1; c.gold = Math.max(5, Math.round((c.gold * ECON4.chestGoldMul) / 5) * 5); }
  }
  for (const e of st.events) {
    if (e.type !== 'chest' || seen.has(e)) continue;
    seen.add(e);
    if (!isHero(e.team)) continue;
    const dn = danger(st, e.x, e.z), tm = st.teams[e.team];
    if (st.rng() < (POTION_DROP.chest + 0.3 * dn) && giveHealPotion(st, tm)) say(st, tm, 'Found a Healing Draught', 'info');
  }
  if (st.stepN % 10 === 0) for (let k = 1; k < 4; k++) { // AI heroes drink potions when hurt (humans press the key)
    const tm = st.teams[k], h = tm && tm.hero;
    if (tm && !tm.human && h && h.alive && h.hp < h.maxHp * 0.38 && tm.pots && tm.pots.heal > 0 && !(tm.potCd > 0) && tm.aiPot !== false) gear.command(st, tm, { t: 'gear', op: 'potion', k: 'heal' });
  }
}

// every death passes here once, before the sim processes it
export function onKill(st, t, src) {
  if (t.kind !== 'mon') return;
  if (!t._gs) { t._gs = 1; t.goldV = (t.goldV || 0) * ECON4.killGoldMul; } // gold is scarce
  const team = src && isHero(src.team) ? st.teams[src.team] : null;
  if (!team || !team.alive) return;
  const dn = danger(st, t.x, t.z), tier = t.tier || 1;
  const big = t.boss ? 1 : 0, ch = t.elite === 1;
  const pn = big ? POTION_DROP.boss : (st.rng() < POTION_DROP.mon + POTION_DROP.tier * (tier - 1) + (ch ? POTION_DROP.champion : 0) + 0.06 * dn ? 1 : 0);
  let got = 0;
  for (let i = 0; i < pn; i++) if (giveHealPotion(st, team)) got++;
  if (got) say(st, team, got > 1 ? `Found ${got} Healing Draughts` : 'Found a Healing Draught', 'info');
}

// reward hooks for dungeons.js / pois.js (potions only; orbs and books are gone)
export function dungeonReward(st, teamId, d) {
  const team = st.teams[teamId];
  if (!team || !isHero(teamId)) return;
  const tier = clamp(d.tier || 1, 1, 3);
  for (let i = 0; i < tier; i++) giveHealPotion(st, team);
}
export function poiReward(st, teamId, kind) {
  const team = st.teams[teamId];
  if (team && isHero(teamId) && (kind === 'witch' || kind === 'shrine')) giveHealPotion(st, team);
}
