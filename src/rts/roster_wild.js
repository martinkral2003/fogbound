// UNITS lane: neutral / wildlife / summoned defs (NOT in ROSTER so no building trains them). Units.spawn(st,'wild_wolf',-1,x,z,{neutral:true,home,aggro}).
// extra fields: bounty{res:amt} (Econ.onDeath may pay the killer), xpValue, aggro (m), leash (m), passive (flees, never attacks), boss.
import { mk } from './roster_lib.js';
const W = (s, extra = {}) => { const d = mk('wild', { upkeep: 0, tier: 1, ...s }); Object.assign(d, { neutral: true, aggro: s.aggro ?? 13, leash: s.leash ?? 32, bounty: s.bounty || null, xpValue: s.xp ?? 20, boss: !!s.boss }, extra); return d; };
const UND = { poison: 0.8, cold: 0.4, fire: -0.2 };
export const WILD = Object.fromEntries([
  W({ id: 'wolf', n: 'Wolf', role: 'beast', hp: 70, dmg: 9, rng: 0.9, cd: 0.9, spd: 7.0, r: 0.6, aggro: 14, xp: 10, bounty: { blood: 10, gold: 6 }, tags: ['light', 'beast'] }),
  W({ id: 'direwolf', n: 'Dire Wolf', role: 'beast', hp: 150, ar: 5, dmg: 15, rng: 1.0, cd: 0.9, spd: 7.2, r: 0.8, aggro: 15, xp: 22, bounty: { blood: 20, gold: 14 }, tags: ['beast'] }),
  W({ id: 'boar', n: 'Wild Boar', role: 'beast', hp: 110, ar: 5, dmg: 12, rng: 0.9, cd: 1.2, spd: 5.4, r: 0.7, aggro: 8, xp: 12, bounty: { blood: 25 }, tags: ['beast'] }),
  W({ id: 'deer', n: 'Deer', role: 'beast', hp: 45, dmg: 0, rng: 0.9, cd: 2, spd: 7.5, r: 0.6, aggro: 0, passive: true, xp: 2, bounty: { blood: 40 }, tags: ['beast'] }),
  W({ id: 'bear', n: 'Cave Bear', role: 'beast', hp: 260, ar: 10, dmg: 22, rng: 1.2, cd: 1.4, spd: 5.0, r: 1.0, aggro: 9, xp: 30, bounty: { blood: 50, gold: 18 }, tags: ['beast', 'big'] }),
  W({ id: 'bandit', n: 'Bandit', role: 'melee', hp: 120, ar: 10, dmg: 13, rng: 0.9, cd: 1.1, spd: 4.4, r: 0.6, aggro: 14, xp: 14, bounty: { gold: 14 }, tags: ['light'] }),
  W({ id: 'banditarcher', n: 'Bandit Archer', role: 'ranged', hp: 80, ar: 5, dmg: 12, rng: 16, cd: 1.5, spd: 4.3, r: 0.55, aggro: 18, xp: 14, bounty: { gold: 16 }, tags: ['light'] }),
  W({ id: 'skeleton', n: 'Restless Skeleton', role: 'melee', hp: 90, ar: 10, dmg: 11, rng: 0.8, cd: 1.0, spd: 4.3, r: 0.55, aggro: 12, xp: 10, bounty: { souls: 1, gold: 6 }, tags: ['light', 'undead'], res: UND }),
  W({ id: 'ghoul', n: 'Feral Ghoul', role: 'beast', hp: 105, dmg: 12, rng: 0.9, cd: 0.9, spd: 6.2, r: 0.6, aggro: 13, xp: 14, bounty: { souls: 1, gold: 8 }, onhit: { poison: { dps: 3, dur: 4 } }, tags: ['light', 'undead'], res: UND }),
  W({ id: 'wraith', n: 'Barrow Wraith', role: 'caster', hp: 90, dmg: 15, rng: 12, cd: 1.5, dt: 'dark', spd: 5.0, r: 0.6, aggro: 15, xp: 20, bounty: { souls: 3, gold: 10 }, proj: 'dark', tags: ['undead', 'spirit'], res: { ...UND, physical: 0.4 } }),
  W({ id: 'ogre', n: 'Ogre', role: 'heavy', hp: 520, ar: 15, dmg: 34, rng: 1.4, cd: 1.9, splash: 1.5, spd: 3.8, r: 1.2, aggro: 11, xp: 60, bounty: { gold: 50, blood: 30 }, tags: ['big'] }),
  W({ id: 'golem', n: 'Stone Golem', role: 'heavy', hp: 760, ar: 45, dmg: 36, rng: 1.4, cd: 2.2, splash: 2, spd: 3.0, r: 1.3, aggro: 9, xp: 80, bounty: { gold: 60, stone: 40 }, tags: ['big'], res: { poison: 1, cold: 0.5 } }),
  W({ id: 'drake', n: 'Cliff Drake', role: 'flyer', hp: 380, ar: 15, dmg: 24, rng: 10, cd: 1.6, dt: 'fire', spd: 6.4, r: 1.1, aggro: 16, fly: true, xp: 70, bounty: { gold: 70, souls: 4 }, proj: 'fire', tags: ['big'], res: { fire: 0.7 } }),
  W({ id: 'dragon', n: 'Ancient Dragon', role: 'flyer', hp: 4200, ar: 40, dmg: 70, rng: 14, cd: 2.0, splash: 4, dt: 'fire', spd: 6.0, r: 2.6, aggro: 24, leash: 60, fly: true, boss: true, xp: 600, bounty: { gold: 500, souls: 40 }, proj: 'fire', tags: ['big', 'elite'], res: { fire: 0.9 } }),
  W({ id: 'behemoth', n: 'Behemoth', role: 'heavy', hp: 5200, ar: 45, dmg: 90, rng: 2.4, cd: 2.4, splash: 4, spd: 3.6, r: 2.8, aggro: 20, leash: 60, boss: true, xp: 600, bounty: { gold: 500, souls: 30 }, tags: ['big', 'elite'] }),
  // summoned allies (spawn with a team and ttl): Magic lane may use these
  W({ id: 'spirit_wolf', n: 'Spirit Wolf', role: 'beast', hp: 85, dmg: 11, rng: 0.9, cd: 0.9, spd: 7.4, r: 0.6, aggro: 14, xp: 0, tags: ['light', 'beast', 'summoned'], res: { physical: 0.2 } }, { neutral: false }),
].map((d) => [d.id, d]));
