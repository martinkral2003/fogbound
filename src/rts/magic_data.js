// MAGIC lane data (owner: MAGIC). Pure data, no imports of sim modules. SPELLS = per-school spells + neutral relic scrolls.
// Spell: {id, school, name, desc, icon, cost{mana,souls?,hp?,blood?}, soulAlt?(souls paid instead of missing mana), cd (s), range (m), radius (m),
//   target:'point'|'unit'|'self'|'building'|'none', tgt:'enemy'|'ally'|'any' (unit targets), age (0-2), kind (effect, see magic_effects.js), params..., start?, scroll?, req?(spell id), research{cost,time}}
import { SCHOOL_SPELLS_B } from './magic_data2.js';

export const SCHOOLS = {
  necromancy: { id: 'necromancy', name: 'Necromancy', color: '#4fe3c1', faction: 0, tower: 'bone_bolt' },
  warmagic: { id: 'warmagic', name: 'War-Magic', color: '#e8742a', faction: 1, tower: 'storm_bolt' },
  infernal: { id: 'infernal', name: 'Infernal', color: '#d8402a', faction: 2, tower: 'hell_bolt' },
  blood: { id: 'blood', name: 'Blood Rites', color: '#c43bd6', faction: 3, tower: 'blood_bolt' },
  neutral: { id: 'neutral', name: 'Relic Scrolls', color: '#d8c890', faction: -1, tower: null },
};
export const AGE_NAMES = ['Dark Age', 'Iron Age', 'Cursed Age'];
export const MANA = { base: 20, baseRegen: 0.1, cap: 450, regenCap: 7, ley: { max: 50, regen: 1.2 }, perProvide: 1 / 60, unitPool: { general: 40, caster: 30 }, unitRegen: 0.8 };
// buildings that give mana when the BUILDINGS lane did not declare provides.mana (fallback)
export const MANA_FALLBACK = { sanctum: 60, graveyard: 40, blood_altar: 45, library: 25, hellgate: 35, ritual_circle: 40, obelisk: 30, temple: 30 };

export const SPELL_LIST = [];
const sp = (school, id, name, icon, o) => { SPELL_LIST.push({ id, school, name, icon, target: 'point', tgt: 'enemy', age: 0, radius: 0, range: 20, cd: 20, cost: { mana: 40 }, ...o }); };
export { sp as defineSpell };

// ---------------------------------------------------------------- NECROMANCY
sp('necromancy', 'raise_dead', 'Raise Dead', '☠', { desc: 'Raise skeletons from fresh corpses in the area. They crumble after a while.', start: true, range: 22, radius: 9, cd: 20, cost: { mana: 40 }, kind: 'raise', unit: ['skeleton'], max: 6, life: 70 });
sp('necromancy', 'death_coil', 'Death Coil', '⚡', { desc: 'A coil of dark energy: damages an enemy or mends a friendly undead.', start: true, target: 'unit', tgt: 'any', range: 18, cd: 6, cost: { mana: 28 }, kind: 'bolt', dmg: 85, dtype: 'dark', healAlly: 130, bld: 0.4 });
sp('necromancy', 'soul_drain', 'Soul Drain', '☾', { desc: 'Rip the life from one enemy and feed it to the caster and nearby allies; a kill grants a soul.', target: 'unit', range: 14, cd: 12, cost: { mana: 35 }, kind: 'bolt', dmg: 110, dtype: 'dark', drain: 0.7, soulOnKill: 1, bld: 0, req: 'death_coil', research: { cost: { gold: 120, souls: 2 }, time: 25 } });
sp('necromancy', 'bone_prison', 'Bone Prison', '⛓', { desc: 'Bones erupt around enemies, rooting them and gnawing at them.', range: 20, radius: 5, cd: 30, cost: { mana: 50 }, kind: 'prison', dur: 4.5, dps: 9, dtype: 'physical', research: { cost: { gold: 140 }, time: 28 } });
sp('necromancy', 'plague_cloud', 'Plague Cloud', '☣', { desc: 'A lingering poison cloud that sickens and slows everything inside.', age: 1, req: 'bone_prison', range: 22, radius: 7, cd: 40, cost: { mana: 70 }, kind: 'zone', zk: 'plague', dur: 14, dps: 15, dtype: 'poison', slow: 0.75, bldDps: 3, research: { cost: { gold: 200, souls: 3 }, time: 40 } });
sp('necromancy', 'curse_frailty', 'Curse of Frailty', '✖', { desc: 'Enemies in the area take 30% more damage and deal 25% less for 20 s.', age: 1, req: 'soul_drain', range: 22, radius: 8, cd: 25, cost: { mana: 45 }, kind: 'debuff', dur: 20, buff: { id: 'frailty', take: 1.3, dmg: 0.75 }, research: { cost: { gold: 160 }, time: 30 } });
sp('necromancy', 'army_of_dead', 'Army of the Dead', '⚰', { desc: 'The earth gives up a dozen warriors around the caster. Costs souls.', age: 2, req: 'raise_dead', target: 'self', range: 0, radius: 6, cd: 120, cost: { mana: 140, souls: 8 }, kind: 'summon', unit: ['skeleton'], n: 12, life: 50, research: { cost: { gold: 350, souls: 8 }, time: 60 } });
sp('necromancy', 'soul_harvest', 'Soul Harvest', '❂', { desc: 'A wave of death sweeps the field; each kill yields a soul and restores mana.', age: 2, req: 'plague_cloud', range: 24, radius: 12, cd: 90, cost: { mana: 110 }, kind: 'aoe', dmg: 75, dtype: 'dark', bld: 0.15, soulsPerKill: 1, manaPerKill: 6, research: { cost: { gold: 320, souls: 6 }, time: 60 } });

// ---------------------------------------------------------------- WAR-MAGIC (orcs)
sp('warmagic', 'war_cry', 'War Cry', '✊', { desc: 'Allies around the caster hit 25% harder and run 15% faster for 12 s.', start: true, target: 'self', range: 0, radius: 14, cd: 25, cost: { mana: 30 }, kind: 'buff', dur: 12, buff: { id: 'warcry', dmg: 1.25, spd: 1.15 } });
sp('warmagic', 'chain_lightning', 'Chain Lightning', '⚡', { desc: 'Lightning leaps between up to five enemies.', start: true, target: 'unit', range: 22, cd: 8, cost: { mana: 45 }, kind: 'chain', dmg: 115, dtype: 'lightning', jumps: 5, jumpR: 9, falloff: 0.8, bld: 0.3 });
sp('warmagic', 'spirit_wolves', 'Ancestral Wolves', '🐺', { desc: 'Call three spirit wolves from the ancestors.', range: 18, radius: 3, cd: 45, cost: { mana: 55 }, kind: 'summon', unit: ['spirit_wolf', 'warg', 'wolfrider', 'grunt'], n: 3, life: 40, research: { cost: { gold: 110 }, time: 25 } });
sp('warmagic', 'totem_rage', 'Totem of Rage', '♜', { desc: 'Plant a totem; allies near it deal 30% more damage while it stands.', range: 20, radius: 10, cd: 40, cost: { mana: 60 }, kind: 'zone', zk: 'totem', dur: 25, buff: { id: 'totem', dmg: 1.3 }, research: { cost: { gold: 150 }, time: 30 } });
sp('warmagic', 'bloodlust', 'Bloodlust', '♨', { desc: 'Allies in the area attack 40% faster and 25% harder for 15 s, but take 15% more damage.', age: 1, req: 'war_cry', range: 20, radius: 9, tgt: 'ally', cd: 20, cost: { mana: 40 }, kind: 'buff', dur: 15, buff: { id: 'bloodlust', as: 1.4, dmg: 1.25, take: 1.15 }, research: { cost: { gold: 140 }, time: 30 } });
sp('warmagic', 'earthquake', 'Earthquake', '〰', { desc: 'The ground heaves: damages and briefly stuns units, and cracks walls and buildings.', age: 1, req: 'totem_rage', range: 24, radius: 10, cd: 60, cost: { mana: 90 }, kind: 'aoe', dmg: 60, dtype: 'physical', bld: 5.5, siege: true, stun: 1.5, slow: { amt: 0.6, dur: 4 }, research: { cost: { gold: 220, stone: 60 }, time: 45 } });
sp('warmagic', 'wall_shatter', 'Wall-Shatter Blast', '☄', { desc: 'A blast of raw force that smashes one enemy structure and cracks its neighbours.', age: 1, req: 'chain_lightning', target: 'building', range: 24, radius: 5, cd: 30, cost: { mana: 80 }, kind: 'blast', dmg: 750, splash: 0.35, dtype: 'siege', research: { cost: { gold: 200, stone: 40 }, time: 40 } });
sp('warmagic', 'storm_call', 'Storm Call', '⛈', { desc: 'Summon a thunderstorm that hurls lightning at random spots under it.', age: 2, req: 'earthquake', range: 26, radius: 12, cd: 100, cost: { mana: 150 }, kind: 'zone', zk: 'storm', dur: 15, every: 0.7, strike: 75, strikeR: 3.2, dtype: 'lightning', bldStrike: 2.2, research: { cost: { gold: 380 }, time: 60 } });

for (const s of SCHOOL_SPELLS_B()) SPELL_LIST.push(s);
export const SPELLS = {};
for (const s of SPELL_LIST) { s.cost = { mana: 0, ...s.cost }; SPELLS[s.id] = s; }
export const SCHOOL_ORDER = ['necromancy', 'warmagic', 'infernal', 'blood', 'neutral'];
export function schoolOf(team) { return (team && team.faction && team.faction.school) || 'necromancy'; }
