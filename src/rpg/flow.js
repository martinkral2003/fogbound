// FLOW: world population, spawn points, rival heroes, the closing Dread Fog, match flow. (owner: FLOW agent)
// Submodules live in src/rpg/flow/*; AI in src/rpg/ai.js. Exports are the contract in README.md plus safeZoneInfo.
import { populateMonsters } from './flow/monsters.js';
import { populateContainers, populateShrines, populatePickups } from './flow/containers.js';
import { computeSpawns, spawnPoint as spawnPt, createRivals } from './flow/spawn.js';
import { initZone, updateZone as zoneStep, safeZoneInfo as zoneInfo, refreshOfferings } from './flow/zone.js';
import { initMatch, stepMatch, onDeath as matchDeath } from './flow/match.js';
import { updateAI as aiStep } from './ai.js';

export function populate(st) {
  st.flow = { spawns: [], camps: [], boss: 0, difficulty: st.difficulty || 'normal' };
  computeSpawns(st, 48);
  initMatch(st);
  initZone(st);
  populateMonsters(st);
  populateContainers(st);
  populateShrines(st);
  populatePickups(st);
  createRivals(st, st.rivalCount ?? 9, st.flow.difficulty);
}
export function spawnPoint(st, who) { return spawnPt(st, who); }
export function updateAI(st, dt) { return aiStep(st, dt); }
export function updateZone(st, dt) { zoneStep(st, dt); }
export function afterStep(st, dt) { stepMatch(st, dt); if ((st.tick & 15) === 0) refreshOfferings(st); }
export function onDeath(st, a, killer) { matchDeath(st, a, killer); }
export function safeZoneInfo(st) { return zoneInfo(st); }
