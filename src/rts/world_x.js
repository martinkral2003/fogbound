// FOGBOUND: DOMINION WORLD lane entry: map enrichment (neutral sites, wildlife, weather, events, temple ritual).
// Files: world_data.js (data) wx_place.js (fair placement) wx_sites.js (creation) wx_kinds.js (per-kind logic) wx_wild.js (camps, wildlife, caravans, behemoth)
//        weather.js (weather, day/night, mods) events.js (events, temple ritual) neutrals.js (spawn/loot/relic helpers) wx_props.js (renderer props)
// Herds: WorldX owns them (neutral deer/boar units; on death a node rtype 'herd' {res:'blood'} is left for workers). Hidden veins join st.nodes (rtype 'mine') only when revealed.
// Income is granted directly to team.res (stats.gathered updated); WorldX.rates(st, team) reports it for the UI. Ley-line mana is read from site.owner by the Magic lane (magic_mana.js); relic mana/souls and necro graveyard mana are added directly. Sites carry isNeutral:true and influence (territory.js).
import { reachMap, placeAll } from './wx_place.js';
import { buildSite, linkPortals } from './wx_sites.js';
import { registerAll, wx, updatePickups, updateCarriers } from './neutrals.js';
import * as Kinds from './wx_kinds.js';
import * as Wild from './wx_wild.js';
import * as Weather from './weather.js';
import * as Events from './events.js';
import { extraProps as props } from './wx_props.js';

export function populate(st) {
  registerAll();
  const w = wx(st);
  st.neutral.length = 0;
  w.acc = 0; w.slowT = 0;
  const reach = reachMap(st);
  const pts = placeAll(st, reach);
  for (let i = 0; i < pts.length; i++) buildSite(st, pts[i], i);
  linkPortals(st);
  Wild.populate(st, reach);
  Weather.init(st);
  Events.init(st);
  Kinds.init(st);
  return st.neutral;
}
export function update(st, dt) {
  const w = wx(st);
  Weather.update(st, dt);
  Events.update(st, dt);
  w.acc += dt;
  while (w.acc >= 0.5) {
    w.acc -= 0.5;
    Weather.slow(st, 0.5);
    Kinds.slow(st, 0.5);
    Wild.slow(st, 0.5);
    Events.slow(st, 0.5);
    updatePickups(st);
    updateCarriers(st);
  }
  Wild.fast(st, dt);
}
export function command(st, teamId, cmd) { return Kinds.command(st, teamId, cmd) || Events.command(st, teamId, cmd); }
export function extraProps(st) { return props(st); }
export { mods, templeState, describe, rates, soulBonus, worldVision } from './wx_api.js';
