// UNITS lane: Orc Horde (NE, orange). Brutal, cheap, fast production; trolls regenerate. Spears beat cavalry, cavalry beats ranged, trolls beat spears.
import { mk, mkWorker, mkGeneral } from './roster_lib.js';
const F = 'orc';
export const ORC = [
  mk(F, { id: 'grunt', n: 'Grunt', role: 'melee', tier: 1, needs: ['barracks', 'war_hall'], g: 'brute', c: { gold: 45, blood: 10 }, time: 10, hp: 155, ar: 15, dmg: 15, rng: 0.9, cd: 1.2, spd: 4.3, r: 0.7,
    tags: ['infantry'], d: 'Sturdy axe infantry. Solid all-rounder; weak to heavy units and massed archers.' }),
  mk(F, { id: 'raider', n: 'Berserker Raider', role: 'melee', tier: 2, needs: ['barracks', 'war_hall'], g: 'brute', c: { gold: 70, blood: 15 }, time: 14, hp: 120, ar: 0, dmg: 24, rng: 0.9, cd: 1.0, spd: 4.8, r: 0.7,
    ab: ['berserk'], tags: ['light'], d: 'Frenzied glass cannon. Enrages in battle for extra damage and speed; spears and archers cut him down.' }),
  mk(F, { id: 'spearthrower', n: 'Spear-Thrower', role: 'ranged', tier: 1, needs: ['archery'], g: 'spear', c: { gold: 45, timber: 30 }, time: 12, hp: 95, ar: 5, dmg: 15, rng: 12, cd: 1.5, spd: 4.2, r: 0.6, proj: 'spear',
    bonus: { cavalry: 1.7, beast: 1.5 }, tags: ['spear'], d: 'Javelins that punish cavalry and beasts. Short range; trolls and brutes trample them.' }),
  mk(F, { id: 'wolfrider', n: 'Wolf Rider', role: 'cavalry', tier: 2, needs: ['stable'], g: 'ride', c: { gold: 85, timber: 20 }, time: 16, hp: 140, ar: 10, dmg: 14, rng: 1.1, cd: 1.1, spd: 7.4, r: 0.8,
    ab: ['charge'], bonus: { ranged: 1.5, caster: 1.5 }, tags: ['cavalry'], d: 'Fast raider. Rides down archers and casters; spear-throwers shred it.' }),
  mk(F, { id: 'troll', n: 'Cave Troll', role: 'heavy', tier: 2, needs: ['barracks', 'war_hall'], g: 'brute', c: { gold: 130, blood: 40 }, pop: 2, time: 22, hp: 480, ar: 25, dmg: 32, rng: 1.3, cd: 1.8, splash: 1.5, spd: 3.5, r: 1.1,
    regen: 3, bonus: { spear: 1.4 }, tags: ['big'], d: 'Regenerating heavy with sweeping clubs. Tramples spears; hurt by sustained ranged fire and casters.' }),
  mk(F, { id: 'shaman', n: 'Orc Shaman', role: 'caster', tier: 2, needs: ['sanctum'], g: 'totem', c: { gold: 100, souls: 5 }, time: 20, hp: 90, ar: 0, dmg: 13, rng: 14, cd: 1.7, dt: 'lightning', spd: 4.0, vis: 26, r: 0.6, proj: 'lightning',
    ab: ['bloodlust', 'chain_bolt'], tags: ['light'], d: 'War-magic caster. Bloodlust empowers the horde; chain lightning punishes tight packs.' }),
  mk(F, { id: 'warg', n: 'Warg Beast', role: 'beast', tier: 2, needs: ['stable'], g: 'ride', c: { gold: 75, blood: 25 }, time: 14, hp: 175, ar: 10, dmg: 18, rng: 1.0, cd: 1.0, spd: 6.0, r: 0.8,
    bonus: { ranged: 1.3 }, tags: ['cavalry', 'beast'], d: 'Savage beast. Hunts ranged troops; weak to spears.' }),
  mkWorker(F, { id: 'worker', n: 'Peon', c: { gold: 25 }, hp: 55, d: 'Hardy peon. Gathers, builds and repairs.' }),
  mkGeneral(F, 0, { n: 'Gorrak Skullsplitter', hp: 700, ar: 20, dmg: 38, rng: 1.3, cd: 1.4, splash: 1.5, spd: 4.5, tags: ['infantry', 'hero'], model: 'warchief',
    d: 'Warchief of the Horde. Aura: Bloodlust, nearby orcs hit harder.' }),
  mkGeneral(F, 1, { n: "Zug'ra the Storm-Caller", hp: 440, ar: 5, dmg: 22, rng: 15, cd: 1.5, dt: 'lightning', spd: 4.2, proj: 'lightning', tags: ['hero'], model: 'shaman_king',
    d: 'Shaman-king who hurls storms. Ranged caster general.' }),
  mkGeneral(F, 2, { n: 'Brakka Bonecrusher', hp: 900, ar: 30, dmg: 44, rng: 1.5, cd: 2.0, splash: 2.5, spd: 3.8, regen: 2, tags: ['big', 'hero'], model: 'troll_chief',
    d: 'Troll chieftain. Slow, regenerating wall of muscle.' }),
];
