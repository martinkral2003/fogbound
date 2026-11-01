// Quest sites placed around the island: the hammer crate (raider camp), the crypt chest (moor skeleton camp), 3 lore stones, the hermit's shrine.
import { BIOME } from '../../data.js';
import { mkItem } from './qutil.js';
import { NPC_BY_KEY } from './npcs.js';

const LORE_TEXT = [
  'First stone: "Here the Drowned King took the crown of salt, and gave his city to the sea."',
  'Second stone: "The fog is no weather. It is a promise made by those who drowned, to those who forgot them."',
  'Third stone: "When one remains, the tide recedes. Whoever kneels last, inherits the island."',
];
const LORE_SPOTS = [[-95, -45], [-30, -62], [-62, 34]];

function spotNear(w, x, z, avoid, minD = 5) {
  for (let r = 0; r < 40; r += 2) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + r, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!w.walkable(px, pz) || w.slopeAt(px, pz) > 0.4 || w.heightAt(px, pz) < 1.2 || w.roadDist(px, pz) < 2) continue;
      if (avoid.some((q) => Math.hypot(q.x - px, q.z - pz) < minD)) continue;
      return { x: px, z: pz };
    }
  }
  return { x, z };
}

export function placeSites(st, L, makeNpc) {
  const w = st.world, f = w.features, S = st.quests.sites;
  const near = (list) => list.slice().sort((p, q) => Math.hypot(p.x - L.x, p.z - L.z) - Math.hypot(q.x - L.x, q.z - L.z));
  const far = near(f.camps.filter((c) => !c.temple && Math.hypot(c.x - L.x, c.z - L.z) > 45));
  const hamCamp = far.find((c) => c.biome !== BIOME.MOOR) || far[0];
  const cryCamp = far.find((c) => c.biome === BIOME.MOOR && c !== hamCamp) || far.find((c) => c !== hamCamp) || far[0];
  const feat = [...f.camps, ...f.chests, ...f.shrines, ...f.nodes];
  const crate = (kind, name, x, z, items, tier) => {
    const c = { id: st.nextId++, x, z, kind, tier, locked: false, items, opened: false, name, quest: true };
    st.containers.push(c); return c;
  };
  if (hamCamp) {
    const p = spotNear(w, hamCamp.x + 2.5, hamCamp.z + 1.5, [], 2);
    S.hammer = { x: p.x, z: p.z, cont: crate('crate', 'Raider Strongbox', p.x, p.z, [mkItem(st, 'smithsHammer', { quest: true, name: "Brannoch's War-Hammer" })], 1) };
  }
  if (cryCamp) {
    const p = spotNear(w, cryCamp.x - 2.5, cryCamp.z + 2, [S.hammer].filter(Boolean), 3);
    const items = [mkItem(st, 'cryptRelic', { quest: true, name: 'Crypt Relic' })];
    try { items.push(...(Items_rollLoot(st) || [])); } catch (e) { /* ignore */ }
    S.crypt = { x: p.x, z: p.z, cont: crate('crate', 'Crypt Chest', p.x, p.z, items, 2) };
  }
  S.lore = LORE_SPOTS.map(([bx, bz], i) => {
    const p = spotNear(w, bx, bz, feat, 6);
    const c = { id: st.nextId++, x: p.x, z: p.z, kind: 'lore', tier: 1, locked: false, items: [], opened: false, name: 'Lore Stone', quest: true };
    st.containers.push(c);
    return { x: p.x, z: p.z, text: LORE_TEXT[i], cont: c };
  });
  // the hermit at the nearest shrine outside the settlement
  const shr = near(f.shrines).find((s) => Math.hypot(s.x - L.x, s.z - L.z) > L.r + 8);
  const base = shr ? { x: shr.x, z: shr.z } : { x: L.x - 45, z: L.z + 10 };
  const hp = spotNear(w, base.x + 2.5, base.z, [], 1.5);
  const def = NPC_BY_KEY.oswin;
  const n = makeNpc(def, hp.x, hp.z, Math.atan2(base.z - hp.z, base.x - hp.x));
  S.hermit = { x: hp.x, z: hp.z, npc: n.id };
  st.settlement.hermit = { x: hp.x, z: hp.z };
}

import * as ItemsMod from '../items.js';
function Items_rollLoot(st) { return ItemsMod.rollLoot('chest', st.rng, 2); }
