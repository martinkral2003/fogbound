// UNITS lane: Necromancers (NW, teal). Cheap, fearless undead; resist poison/cold, weak to fire. Counter triangle noted in each desc.
import { mk, mkWorker, mkGeneral } from './roster_lib.js';
const F = 'necro';
const UND = { poison: 0.8, cold: 0.4, fire: -0.2 };
export const NECRO = [
  mk(F, { id: 'skeleton', n: 'Skeleton Warrior', role: 'melee', tier: 1, needs: ['barracks', 'bone_crypt'], g: 'bone', c: { gold: 35, timber: 10 }, time: 12, hp: 100, ar: 10, dmg: 12, rng: 0.8, cd: 1.0, spd: 4.3, r: 0.55,
    tags: ['light', 'undead'], res: UND, souls: 1, d: 'Cheap bone infantry. Strong in numbers; beats archers and light troops, falls to spears and heavy hitters.', upkeep: 0.5 }),
  mk(F, { id: 'archer', n: 'Skeleton Archer', role: 'ranged', tier: 1, needs: ['archery'], g: 'bow', c: { gold: 45, timber: 25 }, time: 14, hp: 70, ar: 5, dmg: 11, rng: 17, cd: 1.3, spd: 4.2, r: 0.55, proj: 'arrow',
    bonus: { light: 1.25 }, tags: ['undead'], res: UND, d: 'Long-range archer. Shreds light infantry; cavalry and ghouls ride it down.' }),
  mk(F, { id: 'ghoul', n: 'Ghoul', role: 'beast', tier: 1, needs: ['barracks', 'bone_crypt'], g: 'bone', c: { gold: 50, blood: 10 }, time: 14, hp: 105, ar: 0, dmg: 13, rng: 0.9, cd: 0.9, spd: 6.4, r: 0.6,
    bonus: { ranged: 1.3, caster: 1.3 }, onhit: { poison: { dps: 3, dur: 4 } }, tags: ['light', 'undead'], res: UND, d: 'Fast, venomous. Hunts archers and casters; dies to spears and heavy infantry.' }),
  mk(F, { id: 'wraith', n: 'Wraith', role: 'caster', tier: 2, needs: ['sanctum'], g: 'spirit', c: { gold: 90, souls: 5 }, time: 22, hp: 85, ar: 0, dmg: 15, rng: 12, cd: 1.5, dt: 'dark', spd: 5.2, vis: 28, r: 0.6, eth: true, proj: 'dark',
    ab: ['wraith_drain'], tags: ['undead', 'spirit'], res: { ...UND, physical: 0.4 }, d: 'Ethereal caster: halves physical damage taken. Drains life. Vulnerable to fire and magic.' }),
  mk(F, { id: 'golem', n: 'Bone Golem', role: 'heavy', tier: 2, needs: ['barracks'], g: 'bone', c: { gold: 140, timber: 40, souls: 8 }, pop: 2, time: 28, hp: 520, ar: 35, dmg: 30, rng: 1.2, cd: 1.9, splash: 2, spd: 3.1, r: 1.0,
    bonus: { spear: 1.4, light: 1.1 }, tags: ['undead', 'big'], res: UND, d: 'Slow heavy bruiser with cleaving blows. Crushes spears and light troops; spears and ranged kite it.' }),
  mk(F, { id: 'plague', n: 'Plague Carrier', role: 'melee', tier: 2, needs: ['graveyard', 'barracks'], g: 'spirit', c: { gold: 70, blood: 20 }, time: 18, hp: 140, ar: 5, dmg: 7, rng: 0.9, cd: 1.1, dt: 'poison', spd: 3.8, r: 0.7,
    ab: ['plague_aura'], onhit: { poison: { dps: 6, dur: 6 } }, deathBlast: { dmg: 40, radius: 4, dtype: 'poison' }, tags: ['undead'], res: { poison: 1, cold: 0.4, fire: -0.2 },
    d: 'Walking contagion: poisons everything near it and bursts on death. Strong against massed infantry.' }),
  mk(F, { id: 'lich', n: 'Lich Acolyte', role: 'caster', tier: 3, needs: ['sanctum'], g: 'spirit', c: { gold: 120, souls: 12 }, pop: 2, time: 30, hp: 100, ar: 0, dmg: 18, rng: 15, cd: 1.8, dt: 'dark', spd: 3.9, vis: 28, r: 0.6, proj: 'dark',
    ab: ['raise_skeletons', 'death_coil'], tags: ['undead', 'spirit'], res: UND, d: 'Master of the grave: raises skeletons and blasts masses with dark bolts. Fragile; cavalry and ghouls reach it.' }),
  mkWorker(F, { id: 'worker', n: 'Thrall', c: { gold: 30 }, hp: 45, d: 'Shambling thrall. Gathers, builds and repairs.' }),
  mkGeneral(F, 0, { n: 'Mordrek the Pale', hp: 520, ar: 10, dmg: 24, rng: 15, cd: 1.5, dt: 'dark', spd: 4.0, proj: 'dark', tags: ['undead', 'hero'], res: UND, model: 'lich_lord',
    d: 'Archlich, master of Necromancy. Ranged caster; aura: undead near him gain armour.' }),
  mkGeneral(F, 1, { n: 'Valdrek the Deathknight', hp: 760, ar: 30, dmg: 36, rng: 1.2, cd: 1.5, splash: 1.5, spd: 4.3, tags: ['undead', 'hero'], res: UND, model: 'death_knight',
    d: 'Fallen champion in black plate. Melee general who holds the line.' }),
  mkGeneral(F, 2, { n: 'Nyssa the Banshee', hp: 420, ar: 0, dmg: 20, rng: 13, cd: 1.3, dt: 'dark', spd: 5.2, eth: true, proj: 'dark', tags: ['undead', 'hero', 'spirit'], res: { ...UND, physical: 0.4 }, model: 'banshee',
    d: 'Wailing queen of the dead. Fast ethereal caster general.' }),
];
