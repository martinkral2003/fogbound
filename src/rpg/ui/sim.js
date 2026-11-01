// Lazy, failure-tolerant access to the sim subsystems (they are rewritten by other lanes; the UI must still load if one is broken).
// Usage: import { sim } from './sim.js'; sim.Core && sim.Core.nearestInteractable(st, p). Modules appear once their import resolves.
export const sim = { Core: null, Combat: null, Skills: null, Quests: null, Flow: null, Items: null };
const load = (key, path) => import(path).then((m) => { sim[key] = m; }).catch((e) => { console.warn('[rpg-ui] sim module ' + key + ' unavailable: ' + (e && e.message)); });
Promise.all([
  load('Core', '../core.js'), load('Combat', '../combat.js'), load('Skills', '../skills.js'),
  load('Quests', '../quests.js'), load('Flow', '../flow.js'), load('Items', '../items.js'),
]);
export function call(mod, fn, ...args) { try { const m = sim[mod]; return m && m[fn] ? m[fn](...args) : undefined; } catch (e) { return undefined; } }
