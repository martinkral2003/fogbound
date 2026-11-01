// UNITS lane: Cult of Fanatics (SW, purple). Bombers, healers, anti-magic; blood knights charge. Crossbows pierce armour and counter heavies.
import { mk, mkWorker, mkGeneral } from './roster_lib.js';
const F = 'cult';
export const CULT = [
  mk(F, { id: 'zealot', n: 'Zealot', role: 'melee', tier: 1, needs: ['barracks', 'blood_altar'], g: 'zeal', c: { gold: 40, blood: 10 }, time: 11, hp: 105, ar: 5, dmg: 13, rng: 0.9, cd: 1.0, spd: 4.6, r: 0.6,
    berserk: true, tags: ['light', 'infantry'], d: 'Fanatic fighter: fights harder the more wounded he is. Falls to archers and cavalry charges.' }),
  mk(F, { id: 'flagellant', n: 'Flagellant', role: 'melee', tier: 1, needs: ['barracks', 'blood_altar'], g: 'zeal', c: { gold: 45, blood: 20 }, time: 11, hp: 75, ar: 0, dmg: 6, rng: 0.9, cd: 1.1, spd: 5.0, r: 0.6,
    ab: ['detonate'], deathBlast: { dmg: 55, radius: 3.5, dtype: 'fire' }, tags: ['light'], d: 'Bomber. Runs into packed foes and detonates for area damage. Shoot him before he arrives.' }),
  mk(F, { id: 'crossbow', n: 'Crossbow Cultist', role: 'ranged', tier: 1, needs: ['archery'], g: 'bolt', c: { gold: 55, timber: 25 }, time: 13, hp: 82, ar: 5, dmg: 17, rng: 17, cd: 1.8, spd: 4.2, r: 0.55, proj: 'bolt',
    pierce: 0.4, bonus: { heavy: 1.25, flyer: 1.4 }, tags: ['light'], d: 'Armour-piercing bolts. Counters heavies and fliers; cavalry and bombers get at it.' }),
  mk(F, { id: 'priest', n: 'Priest', role: 'caster', tier: 2, needs: ['temple', 'blood_altar'], g: 'faith', c: { gold: 80, blood: 10 }, time: 18, hp: 85, ar: 0, dmg: 5, rng: 10, cd: 1.5, dt: 'lightning', spd: 4.0, vis: 26, r: 0.55, proj: 'lightning',
    ab: ['heal'], tags: ['light'], d: 'Heals wounded allies automatically. Protect him; cavalry hunts priests.' }),
  mk(F, { id: 'inquisitor', n: 'Inquisitor', role: 'melee', tier: 2, needs: ['temple', 'blood_altar'], g: 'faith', c: { gold: 90, blood: 15 }, time: 18, hp: 150, ar: 25, dmg: 15, rng: 1.0, cd: 1.3, spd: 4.1, r: 0.65,
    ab: ['purge'], bonus: { caster: 1.6, summoned: 2.0 }, tags: ['infantry'], res: { dark: 0.4, lightning: 0.25 }, d: 'Anti-magic zealot: purges buffs, silences casters and slays summoned creatures.' }),
  mk(F, { id: 'bloodknight', n: 'Blood Knight', role: 'cavalry', tier: 3, needs: ['stable'], g: 'knight', c: { gold: 150, blood: 40, timber: 30, souls: 5 }, pop: 2, time: 28, hp: 310, ar: 35, dmg: 27, rng: 1.3, cd: 1.5, spd: 6.0, r: 0.9,
    ab: ['charge'], bonus: { ranged: 1.4, caster: 1.4 }, tags: ['cavalry', 'big'], d: 'Armoured cavalry. Charges into ranged lines; spears and crossbows stop it.' }),
  mk(F, { id: 'martyr', n: 'Martyr', role: 'melee', tier: 2, needs: ['blood_altar'], g: 'faith', c: { gold: 70, souls: 8 }, time: 16, hp: 95, ar: 0, dmg: 3, rng: 0.9, cd: 1.2, spd: 4.4, r: 0.6,
    ab: ['martyr_blast'], deathBlast: { dmg: 70, radius: 5, dtype: 'fire', heal: 40 }, tags: ['light'], d: 'Suicide fanatic: his blast scorches foes and heals nearby cultists. Pop him at range.' }),
  mkWorker(F, { id: 'worker', n: 'Acolyte', c: { gold: 30 }, hp: 48, d: 'Devout acolyte. Gathers, builds and repairs.' }),
  mkGeneral(F, 0, { n: 'Prophet Ezekar', hp: 480, ar: 5, dmg: 22, rng: 14, cd: 1.5, dt: 'lightning', spd: 4.2, proj: 'lightning', tags: ['hero'], model: 'prophet',
    d: 'Mad prophet of the Blood Rite. Aura: cultists nearby slowly regenerate.' }),
  mkGeneral(F, 1, { n: 'Maldrin the High Inquisitor', hp: 760, ar: 35, dmg: 32, rng: 1.2, cd: 1.4, spd: 4.2, res: { dark: 0.4 }, tags: ['infantry', 'hero'], model: 'high_inquisitor',
    d: 'Armoured witch-hunter. Melee general.' }),
  mkGeneral(F, 2, { n: 'Sethra the Blood Matriarch', hp: 520, ar: 10, dmg: 20, rng: 12, cd: 1.3, dt: 'dark', spd: 4.6, proj: 'dark', tags: ['hero'], model: 'matriarch',
    d: 'Blood-mage who feeds on the dying. Support caster.' }),
];
