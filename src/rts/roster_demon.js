// UNITS lane: Infernal Legion (SE, red). Fire, fliers over walls, soul-paid elites. Fire archers counter fliers; legionary spears hold the line.
import { mk, mkWorker, mkGeneral } from './roster_lib.js';
const F = 'demon';
const FIRE = { fire: 0.6, cold: -0.2 };
export const DEMON = [
  mk(F, { id: 'imp', n: 'Imp', role: 'flyer', tier: 1, needs: ['barracks'], g: 'imp', c: { gold: 40, souls: 1 }, time: 10, hp: 62, ar: 0, dmg: 9, rng: 9, cd: 1.0, dt: 'fire', spd: 6.2, vis: 26, r: 0.45, fly: true, proj: 'fire',
    tags: ['light'], res: FIRE, d: 'Flies over walls and spears. Harasses ranged units; fire archers and crossbows swat it.' }),
  mk(F, { id: 'hellhound', n: 'Hellhound', role: 'beast', tier: 1, needs: ['stable', 'hellgate'], g: 'hound', c: { gold: 60, souls: 2 }, time: 12, hp: 115, ar: 0, dmg: 12, rng: 1.0, cd: 0.9, dt: 'fire', spd: 7.0, r: 0.7,
    bonus: { ranged: 1.3 }, onhit: { burn: { dps: 5, dur: 3 } }, tags: ['cavalry', 'beast'], res: { fire: 0.75, cold: -0.2 }, d: 'Fast burning hound. Rides down archers; legionary spears and cold hurt it.' }),
  mk(F, { id: 'legionary', n: 'Legionary', role: 'melee', tier: 1, needs: ['barracks'], g: 'legion', c: { gold: 60, timber: 15 }, time: 13, hp: 165, ar: 25, dmg: 13, rng: 1.6, cd: 1.2, spd: 4.1, r: 0.65,
    bonus: { cavalry: 1.6, beast: 1.4 }, tags: ['spear', 'infantry'], res: FIRE, d: 'Disciplined spear-and-shield infantry. Stops cavalry; heavies and brutes crush it.' }),
  mk(F, { id: 'succubus', n: 'Succubus', role: 'caster', tier: 2, needs: ['sanctum'], g: 'dark', c: { gold: 100, souls: 10 }, time: 22, hp: 90, ar: 0, dmg: 13, rng: 13, cd: 1.5, dt: 'dark', spd: 4.8, vis: 26, r: 0.55, proj: 'dark',
    ab: ['seduce'], tags: ['light'], res: FIRE, d: 'Charms the strongest enemy for a few seconds. Fragile; keep her screened.' }),
  mk(F, { id: 'brute', n: 'Infernal Brute', role: 'heavy', tier: 2, needs: ['barracks'], g: 'legion', c: { gold: 130, stone: 20, souls: 8 }, pop: 2, time: 24, hp: 470, ar: 30, dmg: 34, rng: 1.4, cd: 2.0, splash: 2, dt: 'physical', spd: 3.3, r: 1.1,
    bonus: { spear: 1.4 }, tags: ['big'], res: { fire: 0.5, cold: -0.2 }, d: 'Hulking demon. Smashes spear lines; archers and casters wear it down.' }),
  mk(F, { id: 'pitlord', n: 'Pit Lord', role: 'heavy', tier: 3, needs: ['hellgate'], g: 'elite', c: { gold: 200, souls: 60 }, pop: 4, time: 45, hp: 950, ar: 40, dmg: 54, rng: 1.6, cd: 2.0, splash: 3, dt: 'fire', spd: 3.6, r: 1.4,
    ab: ['infernal_stomp'], bonus: { light: 1.15 }, tags: ['big', 'elite'], res: { fire: 0.8, cold: -0.25 }, d: 'Elite champion paid in Souls. Stomps for area fire damage. Only massed focus fire or magic fells it.' }),
  mk(F, { id: 'firearcher', n: 'Fire Archer', role: 'ranged', tier: 1, needs: ['archery'], g: 'fire', c: { gold: 55, timber: 20 }, time: 13, hp: 75, ar: 5, dmg: 12, rng: 18, cd: 1.4, dt: 'fire', spd: 4.2, r: 0.55, proj: 'fire',
    bonus: { flyer: 1.6 }, onhit: { burn: { dps: 3, dur: 3 } }, tags: ['light'], res: FIRE, d: 'Flaming arrows set foes ablaze and swat fliers. Fragile in melee.' }),
  mkWorker(F, { id: 'worker', n: 'Thrall-Imp', c: { gold: 30 }, hp: 45, d: 'Wretched imp slave. Gathers, builds and repairs.', res: FIRE }),
  mkGeneral(F, 0, { n: 'Azrakul the Burning', hp: 820, ar: 25, dmg: 40, rng: 1.6, cd: 1.5, splash: 2, dt: 'fire', spd: 4.2, tags: ['big', 'hero'], res: { fire: 0.8, cold: -0.2 }, model: 'pitlord_general',
    d: 'Pit lord general wreathed in flame. Aura: nearby fiends deal extra fire damage.' }),
  mkGeneral(F, 1, { n: 'Zaryss the Hellspawn Queen', hp: 450, ar: 0, dmg: 22, rng: 14, cd: 1.4, dt: 'fire', spd: 5.0, proj: 'fire', tags: ['hero'], res: FIRE, model: 'succubus_queen',
    d: 'Caster queen of the abyss, hurls hellfire.' }),
  mkGeneral(F, 2, { n: 'Cinderlord Vorg', hp: 760, ar: 35, dmg: 36, rng: 1.4, cd: 1.6, splash: 1.5, dt: 'fire', spd: 3.9, tags: ['big', 'hero'], res: { fire: 0.9, cold: -0.2 }, model: 'cinderlord',
    d: 'Slag-armoured demon-knight. Tough front-line general.' }),
];
