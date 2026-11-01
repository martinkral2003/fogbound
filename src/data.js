// All content + tuning. Pure data, no logic.
export const SIM_DT = 1 / 30;
export const WORLD = { size: 300, half: 150, navCell: 2, navN: 150, infCell: 3, infN: 100 }; // v0.5 compact map (MAP lane): 300 m island
export const SERVANT_CAP = 12; // legacy absolute cap (v0.4 followers: MAX_FOLLOWERS)
export const MAX_HERO_LVL = 15; // v0.5b: level cap 15 (a human reaches it around minute 18, see perks.js XP_NEED / XP_PACE)
export const MAX_UNIT_LVL = 1; // v0.5: servants have no levels
export const START_GOLD = 60; // v0.4: gold is scarce
export const TELE = { channel: 3.5, cd: 40 };
export const DAY_LEN = 480; // seconds per day/night cycle
// phase 1 pacing: territory pays, monsters grow, Dread Moon events
export const MONSTER_GROWTH = 0.03; // monsters gain +3% stats per minute (PACE.growth; tuned for a 20 min match)
export const DREAD = { times: [], warn: 20, dur: 90, dmg: 1.25, aggro: 1.4, loot: 1.5 };
// ---- v0.5 PACE (COMBAT lane): ONE place for the short-fight dials. Base HP / attack numbers in UNITS, MONSTERS and the hero blocks stay "small";
// sim.js recalc() multiplies them by these. Other lanes (DEMONS: demon entries in MONSTERS and the Demon Lord; SERVANTS: units) follow these scales:
//   effective monster HP = base.hp x PACE.monHp x TIER_MUL[tier] x time growth; champions (elite 1) x PACE.eliteHp; bosses use PACE.bossHp instead of monHp;
//   'swarm' monsters (flag swarm:true in MONSTERS) get x PACE.swarmHp / x PACE.swarmDmg on top. Effective damage = base.atk x PACE.monDmg (heroDmg for heroes).
// Targets (asserted by tools/v5-pace-test.js): swarm imp dies in 1-2 basic hits, a champion brute in 5-8 s with a decent kit, a boss in 20-40 s,
// and a hero survives ~4 imps for 10 s. hpGuide = recommended BASE hp per role so those targets hold (DEMONS lane: use them for the demon roster).
export const PACE = {
  heroHp: 1.2, heroDmg: 1.25, skillDmg: 1.0,        // heroes: max HP and basic-attack multiplier (skillDmg scales every hero skill number)
  unitHp: 2.2, unitDmg: 0.7,                        // servants / militia (SERVANTS lane may retune)
  monHp: 2.0, monDmg: 1.4,                          // wild monsters and demons (was 2.5 / 0.62 before v0.5: HP -60%)
  eliteHp: 5.5, eliteDmg: 1.3,                      // champions (elite 1)
  bossHp: 2.6, bossDmg: 0.8,                        // true bosses (boss:true: Demon Lord, Drowned King)
  miniHp: 9, miniDmg: 1.2,                        // mini-bosses (elite 2 without boss:true: dungeon bosses, which also apply DUNGEON.bossHp / bossDmg)
  swarmHp: 1.0, swarmDmg: 0.8,                     // weak horde units (swarm:true)
  regenOoc: 0.025, regenCombat: 0.004, oocDelay: 4, // hero regeneration (fraction of max HP per second) out of / in combat
  growth: 0.03,                                     // monsters gain +3% stats per minute (tuned for a 20 min match; MONSTER_GROWTH alias)
  ttk: { impHits: [1, 2], elite: [5, 8], boss: [20, 40], miniboss: [12, 18], surviveImps: 4, surviveSecs: 10 },
  hpGuide: { imp: 28, hound: 40, brute: 150, warlock: 60, hulk: 280, lord: 2800, miniboss: 700 },
};
// ---- difficulty (v0.5b): chosen in the menu (?diff=easy|normal|hard|nightmare), stored as st.diff. monHp/monDmg scale demons + wild monsters, wave scales assault and gate
// wave sizes, rate = how fast the demon front advances, xp = hero XP gain (the level pace limiter still applies), foeCd = nothing yet.
export const DIFFICULTY = {
  easy:      { id: 'easy',      name: 'Easy',      desc: 'Fewer, weaker demons and a slow front. Relaxed.',            monHp: 0.7,  monDmg: 0.7,  wave: 0.7,  rate: 0.85, xp: 1.15, lives: 1.6 },
  normal:    { id: 'normal',    name: 'Normal',    desc: 'The intended challenge.',                                      monHp: 1,    monDmg: 1,    wave: 1,    rate: 1,    xp: 1 },
  hard:      { id: 'hard',      name: 'Hard',      desc: 'Tougher demons, bigger waves, a faster front.',                monHp: 1.35, monDmg: 1.3,  wave: 1.3,  rate: 1.15, xp: 0.95, lives: 0.75 },
  nightmare: { id: 'nightmare', name: 'Nightmare', desc: 'Hordes of hardened demons. The capital will be tested.',      monHp: 1.8,  monDmg: 1.6,  wave: 1.7,  rate: 1.3,  xp: 0.9, lives: 0.5 },
};
export const DIFF_IDS = Object.keys(DIFFICULTY);
export const COMBAT = {
  heroHp: PACE.heroHp, unitHp: PACE.unitHp, monHp: PACE.monHp, bossHp: PACE.bossHp, xpMul: 0.25,   // compat aliases (readers: ai_world.js, recruits.js, servants.js)
  heroDmg: PACE.heroDmg, unitDmg: PACE.unitDmg, monDmg: PACE.monDmg, skillDmg: PACE.skillDmg,
  armorCap: 75,                                  // armor = ONE percent absorption of all damage (no damage types, no resistances)
  critMul: 1.75, heroCrit: 0.05, unitCrit: 0.03,
  stagger: { frac: 0.1, heroFrac: 0.16, dur: 0.22, cd: 1.6 }, // a hit over frac*maxHp briefly staggers (not bosses)
  // status riders: only ability options apply them (damage option burn / psn / slow / stun), never the damage type
  burn: { frac: 0.12, min: 5, max: 16, dur: 2.5 },
  poison: { frac: 0.12, min: 2, max: 14, dur: 5 },
  cold: { mul: 0.72, dur: 2.2 },
};
// dtype is only a colour/visual tag (projectiles, floating numbers); it never changes damage
export const DMG_TYPES = ['physical', 'fire', 'cold', 'lightning', 'poison'];
export const DTYPE_COLOR = { physical: 0xe8e0d0, fire: 0xff8a30, cold: 0x7fd0ff, lightning: 0xffe860, poison: 0x8be04a };

// Champion affixes (elites in camps tier 2+). e.affixes holds the ids, e.title the full name. Behaviour only: no damage types, no immunities.
export const MON_AFFIXES = {
  fast:     { name: 'Fast',           desc: '+35% move speed, attacks faster' },
  vampiric: { name: 'Vampiric',       desc: 'Heals from the damage it deals' },
  regen:    { name: 'Regenerating',   desc: 'Regains health quickly' },
  thorns:   { name: 'Thorned',        desc: 'Reflects damage onto melee attackers' },
  shielded: { name: 'Shielded',       desc: 'A magical shield that recharges' },
};
export const CHAMPION = { chance: 0.25, minTier: 2, hp: PACE.eliteHp, dmg: PACE.eliteDmg, xp: 2.5, gold: 2.2 };

// ---- v0.5 gear (COMBAT lane): 4 slots, ONE stat per item, 3 tiers = 3 colours (white, blue, gold). src/loot.js rolls, src/gear.js equips. ----
// Item = { slot, stat:'dmg'|'hp'|'spd'|'cdr', val (percent), tier 0..2, name, score, uid?, rarity (= tier, colour index), affixes: [] (compat, always empty) }.
export const RARITY = [
  { id: 'white', name: '', color: 0xe6e6e6, css: '#e6e6e6', affixes: [0, 0] },
  { id: 'blue',  name: '', color: 0x5a9bff, css: '#5a9bff', affixes: [0, 0] },
  { id: 'gold',  name: '', color: 0xf2c84a, css: '#f2c84a', affixes: [0, 0] },
];
export const ITEM_SLOTS = ['weapon', 'helmet', 'armor', 'amulet'];
export const GEAR_STATS = ['dmg', 'hp', 'spd', 'cdr'];
export const STAT_INFO = {       // val = percent bonus; w = weight used to compare different stats (score); cap = total from all slots
  dmg: { name: 'Damage',        text: '+{v}% damage',         w: 1.0, vals: [10, 20, 34], icon: '⚔' },
  hp:  { name: 'Health',        text: '+{v}% health',         w: 0.9, vals: [12, 24, 40], icon: '❤' },
  spd: { name: 'Speed',         text: '+{v}% move speed',     w: 1.8, vals: [5, 10, 16],  icon: '➤' },
  cdr: { name: 'Cooldowns',     text: '-{v}% cooldowns',      w: 1.6, vals: [6, 12, 20],  icon: '⌛' },
};
export const SLOT_STATS = {      // which stats a slot can roll (repeat = more likely)
  weapon: ['dmg', 'dmg', 'dmg', 'cdr'],
  helmet: ['hp', 'hp', 'cdr', 'spd'],
  armor:  ['hp', 'hp', 'hp', 'spd'],
  amulet: ['dmg', 'hp', 'spd', 'cdr'],
};
export const GEAR_NAMES = {      // GEAR_NAMES[slot][stat][tier]
  weapon: { dmg: ['Rusty Sword', 'Iron Sword', 'Dread Blade'], cdr: ['Runed Blade', 'Sage Blade', 'Arcane Blade'] },
  helmet: { hp: ['Leather Cap', 'Iron Helm', 'Giant Helm'], cdr: ['Cloth Hood', 'Sage Hood', 'Arch Hood'], spd: ['Fur Cap', 'Wolf Helm', 'Fenrir Helm'] },
  armor:  { hp: ['Hide Vest', 'Iron Mail', 'Dread Plate'], spd: ['Light Jerkin', 'Scout Vest', 'Shadow Coat'] },
  amulet: { dmg: ['Bone Charm', 'Fang Charm', 'Blood Charm'], hp: ['Iron Locket', 'Heart Locket', 'Troll Locket'], spd: ['Swift Charm', 'Wind Charm', 'Gale Charm'], cdr: ['Rune Charm', 'Moon Charm', 'Star Charm'] },
};
export const GEAR_CAP = { cdr: 40, spd: 40 };      // total percent caps over all four slots
// drops (src/loot.js rollDrop / sim.js kill): a drop about every killsPerDrop kills of a team (pity counter), guaranteed from elites, bosses, gates, dungeons; chests give 2.
export const DROP = {
  killsPerDrop: [4, 6],                  // a team's next drop comes after this many kills (inclusive range, rolled each time)
  potion: 0.2,                           // share of drops that are a potion instead of gear
  potionKinds: { heal: 0.5, shield: 0.28, speed: 0.22 },
  eliteGear: 1, eliteExtra: 0.35,        // champions: guaranteed gear drop (+ chance of a second)
  bossGear: 2, chestGear: 2, gateGear: 2, // guaranteed gear pieces
  tierOdds: [0.74, 0.22, 0.04],          // base tier weights (white / blue / gold); luck shifts them up
  empty: 0.5,                            // chance a drop targets a slot that your hero has empty
  sell: [4, 9, 18],                      // gold when a worse item is walked over (auto-sold)
};
export const POTION_INFO = {             // quick-use consumables (team.pots {heal, speed, shield}, max POTION_MAX of each, shared cooldown)
  heal:   { name: 'Healing Draught', desc: 'Instantly restores 45% of your health.', icon: '✚', key: 'Q', css: '#d8503c', price: 40 },
  speed:  { name: 'Swift Elixir',    desc: 'For 8 s: +30% move speed and +20% attack speed.', icon: '⚡', key: 'F', css: '#e0bb5c', price: 55 },
  shield: { name: 'Ward Potion',     desc: 'A shield absorbing 40% of your health for 8 s.', icon: '⛨', key: 'V', css: '#7fb8ff', price: 55 },
};
export const POTION_MAX = 3;
// DEPRECATED compat stubs (v0.4 affix gear): readers in other lanes may still import these until they are cleaned up. Do not use in new code.
export const ITEM_AFFIXES = {};
export const LEGENDARY_NAMES = { weapon: [], helmet: [], armor: [], amulet: [] };

export const BIOME = { MOOR: 0, HIGH: 1, DEAD: 2, ABBEY: 3, TEMPLE: 4, MIRE: 5, RIDGE: 6, ASH: 7, FROST: 8 }; // v0.4: ASH = orc lands (NE), FROST = frozen north ridges

// ---- skills (v0.5 SKILLS lane: the League-of-Legends style kit, see src/kits.js for the data and src/perks.js for the logic) ----------------
// 4 classes x 8 skills (3 levels, 3 upgrade branches each) + 2 ultimates per class. team.kit = { slots:[Q,W,E,R], lv, path, offers, ver }.
import { SKILLS, ULTS, CLASSES, CLASS_IDS, KIT } from './kits.js';
export { SKILLS, ULTS, CLASSES, CLASS_IDS, KIT };
export const SKILL_LEVELS = [];  // legacy (v0.4: skill cards at these levels); every level-up now queues one offer, see perks.js
export const SLOT_COUNT = 4;     // Q W E R

// ---- v0.4 heroes: four backgrounds (the starting kit), classless afterwards (every skill is in every pool) ---------------------------
// Team id = hero id (0 = the human, 1-3 = rival heroes); the background is chosen per team (st.teams[i].bg, `team.f` = this entry plus the team's colour/name).
// `pool`: skills offered at level-ups. Own signature skills first, then everything else (classless): the first two are the starting skills.
export const BACKGROUNDS = [
  {
    id: 0, key: 'soldier', name: 'Soldier', title: 'Aldric Vane', color: 0xc8ccd4, css: '#c8ccd4', emblem: '⚔',
    blurb: 'A veteran of the border wars. Sword and shield, heavy armour, holds the line.',
    kit: 'Sword and shield. Tanky melee: 20% less damage taken, wide cleave.',
    weapon: { slot: 'weapon', tier: 1, name: 'Soldier\'s Longsword', rarity: 0 },
    hero: { hp: 460, atk: 15, armor: 20, range: 2.9, ranged: false, arc: 2.3, cd: 0.95, spd: 8.0, r: 1.0, model: 'soldier', dtype: 'physical' },
    pool: CLASSES.soldier.skills.slice(),
    charge: SKILLS.quake,
  },
  {
    id: 1, key: 'hunter', name: 'Hunter', title: 'Wren Ashfield', color: 0x6fae5a, css: '#6fae5a', emblem: '➶',
    blurb: 'A woodsman with a longbow. Keeps range, picks enemies apart, hard to catch.',
    kit: 'Longbow. Ranged: long reach, fast shots, a little fragile.',
    weapon: { slot: 'weapon', tier: 1, name: 'Hunter\'s Longbow', rarity: 0 },
    hero: { hp: 300, atk: 12, range: 15, ranged: true, cd: 0.7, spd: 8.8, r: 0.85, proj: { spd: 36, color: 0xe0d09a }, model: 'hunter', dtype: 'physical' },
    pool: CLASSES.hunter.skills.slice(),
    charge: SKILLS.rain,
  },
  {
    id: 2, key: 'mage', name: 'Hedge-Mage', title: 'Ysolde Marrow', color: 0x7b8cff, css: '#7b8cff', emblem: '☽',
    blurb: 'A self-taught wizard with a staff. Fragile, but her spells hit hard and from afar.',
    kit: 'Staff and spells. Ranged magic, the most skills early, the least health.',
    weapon: { slot: 'weapon', tier: 1, name: 'Hedge-Mage\'s Staff', rarity: 0 },
    hero: { hp: 270, atk: 13, range: 12, ranged: true, cd: 0.85, spd: 8.0, r: 0.9, proj: { spd: 25, color: 0x9fb4ff }, model: 'mage', dtype: 'cold' },
    pool: CLASSES.mage.skills.slice(),
    charge: SKILLS.nova,
  },
  {
    id: 3, key: 'outlaw', name: 'Outlaw', title: 'Vess Crowe', color: 0xd9a441, css: '#d9a441', emblem: '✦',
    blurb: 'A hunted cutthroat with twin daggers. Fast, slippery, deadly up close.',
    kit: 'Twin daggers. Fast attacks and movement, shadow-step dodge.',
    weapon: { slot: 'weapon', tier: 1, name: 'Outlaw\'s Daggers', rarity: 0 },
    hero: { hp: 320, atk: 8.5, armor: 8, crit: 0.1, range: 2.5, ranged: false, arc: 1.8, cd: 0.5, spd: 9.6, r: 0.85, model: 'outlaw', dtype: 'physical' },
    pool: CLASSES.outlaw.skills.slice(),
    charge: SKILLS.keg,
  },
];
export const BG_KEYS = BACKGROUNDS.map((b) => b.key);
export const START_SKILLS = 1; // Q starts filled (the class basic skill)
// team identity (colour + name) by TEAM id: 0 = you, 1-3 = rival heroes, 4 = HUMANITY (town guards, villagers, merchants)
export const TEAM_COLORS = [
  { color: 0x58a8f0, css: '#58a8f0' }, { color: 0xd8503c, css: '#d8503c' }, { color: 0xb060ff, css: '#b060ff' }, { color: 0xe0a030, css: '#e0a030' },
  { color: 0xe6dcb0, css: '#e6dcb0' },
];
export const RIVAL_NAMES = ['Garran Holt', 'Selene Vael', 'Voss the Grey'];
export const HUMANITY = 4; // team id of the human towns
export const MAX_FOLLOWERS = 4;
// respawn: dead heroes return at their last waystone after this many seconds (min + perLevel * level, capped)
export const RESPAWN = { min: 10, perLevel: 0.8, max: 20 };
export const WIN_REASONS = { gates: 'The gates are sealed', capital: 'The capital has fallen' };
// DEPRECATED compat alias (v0.3 code indexed FACTIONS[teamId]): teams 0-3 with colour/name + the old world generator's corner/biome. Use BACKGROUNDS / TEAM_COLORS.
const OLD_CORNERS = [[-262, -262], [262, -262], [262, 262], [-262, 262]], OLD_BIOMES = [BIOME.MOOR, BIOME.HIGH, BIOME.DEAD, BIOME.ABBEY];
export const FACTIONS = BACKGROUNDS.map((b, i) => ({ id: i, key: 'hero' + i, name: 'Hero', title: i ? RIVAL_NAMES[i - 1] : 'You', color: TEAM_COLORS[i].color, css: TEAM_COLORS[i].css, corner: OLD_CORNERS[i], biome: OLD_BIOMES[i] }));

// ---- servants, research, Dark Tower tiers: see units_data.js (v0.3) ----
export * from './units_data.js';

// ---- neutral monsters ----------------------------------------------------------
export const MONSTERS = {
  skeleton:  { name: 'Skeleton',    swarm: true, hp: 40,  atk: 8,  range: 2.3, spd: 4.4, cd: 1.1, r: 0.6,  aggro: 10, xp: 9,   gold: 6,  model: 'skeleton' },
  skelArcher:{ name: 'Skeleton Archer', swarm: true, hp: 28, atk: 8, range: 13, spd: 4.4, cd: 1.3, r: 0.6, aggro: 14, xp: 10, gold: 7, model: 'skelarcher', ranged: true, proj: { spd: 22, color: 0xe0e0d0 } },
  ghoul:     { name: 'Ghoul',       hp: 70,  atk: 12, range: 2.2, spd: 5.8, cd: 0.9, r: 0.7,  aggro: 11, xp: 14,  gold: 9,  model: 'ghoul', dtype: 'poison' },
  wolf:      { name: 'Dire Wolf',   swarm: true, hp: 36,  atk: 10, range: 1.9, spd: 7.4, cd: 0.8, r: 0.65, aggro: 14, xp: 10,  gold: 6,  model: 'wolf' },
  orcRaider: { name: 'Orc Raider',  hp: 85, atk: 15, range: 2.5, spd: 4.8, cd: 1.1, r: 0.85, aggro: 11, xp: 16,  gold: 11, model: 'grunt', armor: 8 },
  bogBeast:  { name: 'Bog Beast',   hp: 160, atk: 20, range: 3.0, spd: 3.8, cd: 1.5, r: 1.4,  aggro: 10, xp: 34,  gold: 22, model: 'bogbeast', dtype: 'poison', armor: 5 },
  wraith:    { name: 'Wraith',      hp: 55,  atk: 14, range: 12,  spd: 5.2, cd: 1.5, r: 0.7,  aggro: 15, xp: 18,  gold: 12, model: 'wraith', ranged: true, dtype: 'cold', proj: { spd: 18, color: 0x9fb8ff } },
  troll:     { name: 'Cave Troll',  hp: 260, atk: 32, range: 3.2, spd: 4.2, cd: 1.7, r: 1.6,  aggro: 11, xp: 70,  gold: 45, model: 'troll', armor: 10 },
  crypt:     { name: 'Crypt Knight',hp: 160, atk: 24, range: 2.6, spd: 4.4, cd: 1.2, r: 0.95, aggro: 11, xp: 55,  gold: 34, model: 'cryptknight', armor: 20 },
  king:      { name: 'The Drowned King', hp: 2400, atk: 38, range: 4.2, spd: 4.0, cd: 1.6, r: 2.2, aggro: 16, xp: 400, gold: 260, model: 'drownedking', boss: true, armor: 20 },
  // ---- v0.5 demon invasion (src/horde.js, models in models_demons.js). Team -1 like every monster; `demon` = ability role used by horde.js.
  // Base HP follows PACE.hpGuide (imp 28, hound 40, brute 150, warlock 60, hulk 280, lord 2800); swarm:true = imps and hounds (x PACE.swarmHp / swarmDmg).
  imp:       { name: 'Imp',            hp: 28,   atk: 9,  range: 1.9, spd: 5.6, cd: 0.9, r: 0.5,  aggro: 13, xp: 5,    gold: 2,   model: 'imp', demon: 'imp', swarm: true, dtype: 'fire' },
  hellhound: { name: 'Hellhound',      hp: 40,   atk: 12, range: 2.0, spd: 8.8, cd: 0.8, r: 0.7,  aggro: 17, xp: 8,    gold: 3,   model: 'hellhound', demon: 'hound', swarm: true, dtype: 'fire' },
  brute:     { name: 'Demon Brute',    hp: 150,  atk: 22, range: 3.0, spd: 4.5, cd: 1.5, r: 1.2,  aggro: 12, xp: 30,   gold: 14,  model: 'brute', demon: 'brute', armor: 10 },
  warlock:   { name: 'Warlock',        hp: 60,   atk: 14, range: 14,  spd: 4.8, cd: 1.5, r: 0.8,  aggro: 17, xp: 24,   gold: 12,  model: 'warlock', demon: 'warlock', ranged: true, dtype: 'fire', proj: { spd: 19, color: 0xff5a20 } },
  hulk:      { name: 'Hellforged Hulk', hp: 280, atk: 40, range: 3.8, spd: 3.5, cd: 2.2, r: 1.9,  aggro: 12, xp: 60,   gold: 30,  model: 'hulk', demon: 'hulk', armor: 14, bldMul: 3.4 },
  // ---- v0.6 casters (spells in src/mspells.js): kill them first, their ground spells are telegraphed and cancel when the caster dies
  pyromancer:  { name: 'Pyromancer',  hp: 70,  atk: 14, range: 15, spd: 4.8, cd: 1.6, r: 0.8,  aggro: 19, xp: 26, gold: 14, model: 'warlock', demon: 'warlock', ranged: true, dtype: 'fire', proj: { spd: 19, color: 0xff5a20 }, spells: ['fireblast'] },
  hexer:       { name: 'Hexer',       hp: 65,  atk: 12, range: 14, spd: 4.8, cd: 1.7, r: 0.75, aggro: 19, xp: 26, gold: 14, model: 'wraith',  demon: 'warlock', ranged: true, dtype: 'cold', proj: { spd: 18, color: 0xa070ff }, spells: ['curse', 'frostnova'] },
  stormcaller: { name: 'Stormcaller', hp: 80,  atk: 13, range: 14, spd: 4.8, cd: 1.6, r: 0.8,  aggro: 19, xp: 30, gold: 16, model: 'warlock', demon: 'warlock', ranged: true, dtype: 'lightning', proj: { spd: 24, color: 0xffee60 }, spells: ['chain', 'frostnova'] },
  bonecaller:  { name: 'Bonecaller',  hp: 75,  atk: 10, range: 13, spd: 4.4, cd: 1.8, r: 0.8,  aggro: 19, xp: 30, gold: 16, model: 'warlock', demon: 'warlock', ranged: true, dtype: 'physical', proj: { spd: 17, color: 0xd0d8a0 }, spells: ['summon', 'heal'] },
  archmage:    { name: 'Archmage',    hp: 240, atk: 22, range: 16, spd: 4.6, cd: 1.5, r: 1.0,  aggro: 21, xp: 120, gold: 60, model: 'warlock', demon: 'warlock', ranged: true, dtype: 'fire', armor: 10, proj: { spd: 21, color: 0xff7a30 }, spells: ['meteors', 'shadowbolt', 'fireblast', 'heal'] },
  demonLord: { name: 'The Demon Lord', hp: 2800, atk: 48, range: 5.0, spd: 4.9, cd: 1.5, r: 2.4,  aggro: 28, xp: 1500, gold: 500, model: 'demonlord', demon: 'lord', boss: true, armor: 20 },
  demonGate: { name: 'Demon Gate',     hp: 1400, atk: 0,  range: 0,   spd: 0,   cd: 9,   r: 2.8,  aggro: 0,  xp: 0,    gold: 0,   model: 'demongate', demon: 'gate' },
};
export const TIER_MUL = [1, 1, 1.45, 2.1, 3.0];

// ---- v0.5 demon invasion (src/horde.js, DEMONS lane). Times in seconds, distances in metres. See src/V5.md 'DEMONS lane API'.
export const HORDE = {
  // v0.7.1 "calmer, more Gothic" pass: the whole timeline stretched ~1.8x and assault waves shrunk, so the world has real breathing
  // room between fights instead of a relentless RTS-style invasion clock. Was (15-20 min pace): firstWarn 210, townGap 120, capitalAt
  // 630, lordAt 840 - see Design notes below for the full before/after. Timeline now (~27-36 min pace): first warning ~6:18, first
  // town hit ~9:00, capital siege wave 1 ~18:54, the Lord at 2/3 gates closed or ~25:12.
  firstWarn: 378, townGap: 216, capitalAt: 1134, lordAt: 1512,
  lead: 36,                  // front distance before a town at which its assault launches (the clock point of a town = its path distance - lead)
  warn: 99, razeTime: 16, stuckGrace: 60,
  gateSlow: 0.10, rateFloor: 0.45, gatePush: 72,    // each closed gate: front speed -10% (min 45%) and the front clock is pushed back
  savedPush: 81, killPush: 0.9, killPushCap: 108,   // a saved town / each demon killed near the front pushes the front clock back
  band: { min: 10, max: 40, base: 10, perMin: 1.5, townMul: 1.1 },   // v0.7.1: smaller assault waves (was base 14/perMin 2.0/max 52)
  tierMin: [0, 11, 20],      // demon tier 1/2/3 from these minutes (champions / bigger units)
  gate: {
    hp: [900, 1100, 1300], // pinned max HP by gate tier (a hero with a kit needs ~25-40 s with defenders around)
    guardMul: 0.6, guardNear: 14, guardMin: 4,      // damage taken x0.6 while >= 4 guards stand within 14 m
    wardMul: 0.03, vulnT: [756, 1080, 1296],        // before vulnT[tier-1] the gate is warded (x0.15 damage): the front must hold first
    wave: [20, 35], waveFloor: 16, waveCap: 64, guards: [4, 7], guardRespawn: 40, phases: [0.75, 0.5, 0.25], phaseSize: 8,
    reward: { gold: [140, 200, 280], xp: [320, 460, 700], items: 2 },
  },
  reward: { goldPer: 4, xpPer: 7, near: 70 },
  capital: { lives: 22, fallAt: 1440, waves: 4, gap: 90, size: 26, perWave: 5, perMin: 0.6, max: 56, razeMul: 0.55, reclaim: 180, again: 240, sieges: 3 },
  occupy: { town: 8, cap: 12 },   // demons that stay behind as the garrison of a fallen town / the capital (the rest press on)
  raid: { every: 270, from: 864 },   // after the first sieges, an extra assault on a random standing town
  lord: { hp: 0, slamCd: 8, ringCd: 13, summonAt: [0.75, 0.5], rageAt: 0.3, summonN: 8, regen: 0.02, arm: 60 },   // hp 0 = MONSTERS.demonLord (PACE.hpGuide)
  events: [{ t: 702, kind: 'hunt', dur: 160 }, { t: 1026, kind: 'caravan', dur: 110 }, { t: 1404, kind: 'hunt', dur: 150, big: true }],
};

// Which monsters guard which biome, by tier. Elite entries are single spawns.
const R = (k, n) => Array(n).fill(k);
export const CAMP_TABLE = { // [tier 1, tier 2, tier 3]: 6-12 weak 'swarm' units (cleave food) plus a few tougher ones
  [BIOME.MOOR]:   [[...R('skeleton', 6), ...R('skelArcher', 2)], [...R('skeleton', 6), ...R('skelArcher', 3), 'ghoul', 'ghoul'], [...R('skeleton', 6), ...R('skelArcher', 2), 'crypt', 'wraith']],
  [BIOME.HIGH]:   [[...R('wolf', 8)], [...R('wolf', 8), 'orcRaider', 'orcRaider'], [...R('wolf', 6), 'troll', 'orcRaider', 'orcRaider']],
  [BIOME.DEAD]:   [[...R('wolf', 6), 'ghoul', 'ghoul'], [...R('wolf', 6), ...R('ghoul', 4)], [...R('wolf', 6), 'troll', 'ghoul', 'ghoul']],
  [BIOME.ABBEY]:  [[...R('skeleton', 5), 'ghoul', 'skelArcher', 'skelArcher'], [...R('skeleton', 5), 'wraith', 'wraith', 'ghoul', 'ghoul'], [...R('skeleton', 5), 'crypt', 'wraith', 'wraith']],
  [BIOME.MIRE]:   [[...R('ghoul', 6), 'wraith'], [...R('ghoul', 6), 'bogBeast', 'wraith'], [...R('ghoul', 4), 'bogBeast', 'bogBeast', 'wraith']],
  [BIOME.RIDGE]:  [[...R('wolf', 6), 'orcRaider', 'orcRaider'], [...R('wolf', 6), 'troll', 'orcRaider'], [...R('wolf', 4), 'troll', 'troll', 'orcRaider']],
  [BIOME.ASH]:    [[...R('wolf', 6), 'orcRaider', 'orcRaider'], [...R('wolf', 5), ...R('orcRaider', 3), 'troll'], [...R('orcRaider', 4), 'troll', 'troll']],
  [BIOME.FROST]:  [[...R('wolf', 6), ...R('skeleton', 3)], [...R('wolf', 6), ...R('skeleton', 3), 'wraith'], [...R('wolf', 5), 'troll', 'wraith', 'wraith']],
  [BIOME.TEMPLE]: [[...R('skeleton', 6), ...R('skelArcher', 4)], [...R('skeleton', 6), 'crypt', 'skelArcher', 'skelArcher'], [...R('skeleton', 4), 'crypt', 'crypt', 'wraith', 'wraith']],
};

// v0.6: casters in the camps (mages are the dangerous ones: tier 2 camps get one, tier 3 camps two, the cold / dark / ruined regions an Archmage)
{
  const PAIR = { [BIOME.MOOR]: ['hexer', 'bonecaller'], [BIOME.HIGH]: ['pyromancer', 'stormcaller'], [BIOME.DEAD]: ['hexer', 'pyromancer'], [BIOME.ABBEY]: ['bonecaller', 'hexer'], [BIOME.MIRE]: ['hexer', 'stormcaller'], [BIOME.RIDGE]: ['stormcaller', 'pyromancer'], [BIOME.ASH]: ['pyromancer', 'stormcaller'], [BIOME.FROST]: ['hexer', 'stormcaller'], [BIOME.TEMPLE]: ['bonecaller', 'hexer'] };
  const ARCH = new Set([BIOME.ASH, BIOME.FROST, BIOME.ABBEY, BIOME.TEMPLE]);
  for (const b of Object.keys(CAMP_TABLE)) {
    const p = PAIR[b] || ['pyromancer', 'hexer'], t = CAMP_TABLE[b];
    t[0].push(p[0]);                       // even tier 1 has a caster
    t[1].push(p[0], p[1]);
    t[2].push(p[0], p[1], ARCH.has(Number(b)) ? 'archmage' : p[0]);
  }
}

// ---- static structures (v0.4: there is no base building; towns / the horde place these via sim.addBuilding(st, type, team, x, z, rot, opts)) ----
// def: w,d footprint, hp, model (models.js makeBuildingModel), passable (gate: friendly teams walk through), atk {dmg, range, cd, heroMul, dtype} (shoots hostile units), vision
export const STRUCTURES = {
  wall:       { name: 'Wall',       w: 4,   d: 1.3, hp: 900,  model: 'wall' },
  gate:       { name: 'Gate',       w: 4,   d: 1.5, hp: 650,  model: 'gate', passable: true },
  tower:      { name: 'Watch Tower', w: 3,  d: 3,   hp: 1300, model: 'tower', vision: 32, atk: { dmg: 62, range: 19, cd: 1.0 } },
  watchtower: { name: 'Lookout',    w: 2,   d: 2,   hp: 280,  model: 'watch', vision: 48 },
  banner:     { name: 'Banner',     w: 1.6, d: 1.6, hp: 320,  model: 'banner', vision: 22 },
  // v0.6 castles (src/castles.js). 'hidden' = no mesh (towns_view draws the town walls); 'dark*' = the invaders' fortress.
  cwall:  { name: 'City Wall',     w: 5.5, d: 1.9, hp: 1800, model: 'hidden' },
  twall:  { name: 'Town Wall',     w: 5.4, d: 1.0, hp: 800,  model: 'hidden' },
  ctower: { name: 'City Tower',    w: 5,   d: 5,   hp: 2600, model: 'hidden', vision: 32, atk: { dmg: 60, range: 26, cd: 1.0 } },
  ttower: { name: 'Town Tower',    w: 3.6, d: 3.6, hp: 1300, model: 'hidden', vision: 26, atk: { dmg: 44, range: 22, cd: 1.1 } },
  fwall:  { name: 'Fortress Wall', w: 4.9, d: 2.0, hp: 1500, model: 'darkwall' },
  ftower: { name: 'Fortress Tower', w: 4.6, d: 4.6, hp: 2200, model: 'darktower', vision: 30, atk: { dmg: 42, range: 23, cd: 1.6 } },
};
// the levy (src/levy.js): reserve of free-peoples soldiers; your deeds move it, squads of militia are made from it
export const LEVY = {
  start: 60, max: 160, squadSize: 6, maxPatrols: 5, perPatrol: 30, regenPerTown: 0.02, camp: 4, saved: 15, elite: 1, fortress: 40, heroDeath: 2, townFallen: 25,
  // v0.7: offensive musters. Once the reserve is deep enough (no town under attack), send a bigger squad at the open gate / fortress heart
  // instead of only patrolling; size scales with the reserve so good hero play (clearing camps, saving towns) sends a stronger army.
  assaultAt: 90, assaultEvery: 55, assaultSize: 10, assaultMaxSize: 18, assaultPerReserve: 0.12,
};
export const CASTLE = { // which structure types each castle uses; the fortress rings are around the Lord's plateau
  capital: { wall: 'cwall', tower: 'ctower' }, town: { wall: 'twall', tower: 'ttower' },
  fortress: { wall: 'fwall', tower: 'ftower', outerR: 15.5, innerR: 8 },
  heroBldMul: 2.5,   // heroes (and their skills) deal this much more damage to buildings so a wall falls in ~25 s, not minutes
};
export const MONSTER_SPEED = 1.15; // neutral monsters move a bit faster than before, still slower than heroes

// capture points
export const NODES = {
  mine:    { name: 'Gold Mine', gold: 1.5, inf: 18, vision: 26, radius: 7 },
  obelisk: { name: 'Obelisk',   gold: 0.4, inf: 22, vision: 44, radius: 6 },
};
// ---- gear: see GEAR_NAMES / STAT_INFO above (v0.5). DEPRECATED compat stubs for readers that still import the v0.4 tables ----
export const GEAR = { weapon: [], armor: [], helmet: [], amulet: [] };
export const GEAR_ATK = [0, 0, 0, 0, 0];
export const GEAR_HP = [0, 0, 0, 0, 0];
export const GEAR_HELM = [0, 0, 0, 0, 0];
export const GEAR_ARMOR = [0, 0, 0, 0, 0];

// ---- map content: the hand-designed layout lives in src/mapdata.js (MAP lane); re-exported here for compatibility ----
export { TERRAIN, QUADRANT_LAYOUT, SHARED_LAYOUT, CENTER_LAYOUT, SITE_LAYOUT, KEEP, BOSS } from './mapdata.js';

// ---- v3 WORLD CONTENT: dungeons + points of interest (src/dungeons.js, src/pois.js, src/dungeons_view.js). Every tuning number lives here. ----
// Arrays are indexed by tier (index 0 unused, tiers 1..3). Gold is scarce; dungeon BONUSES are the real prize.
export const DUNGEON = {
  radius: [0, 15, 19, 26],      // complex radius (m) by tier, used when the site has no r
  discover: 14,                 // a team 'discovers' (and opens) a dungeon when one of its units is within radius + this
  camps: [0, 2, 3, 3],          // outer camps by tier
  campSize: [0, 6, 7, 8],       // monsters per outer camp (v0.5: swarms)
  guards: [0, 2, 2, 3],         // lair guards that stand with the boss
  bossHp: [0, 1.0, 1.2, 1.4], bossDmg: [0, 1.2, 1.4, 1.6], bossScale: 1.35,  // multipliers for non-king bosses (the Drowned King keeps its own stats)
  xp: [0, 250, 450, 800],       // XP for the clearing team (grantXP)
  gold: [0, 80, 150, 280],      // one-off gold for the clearing team
  legendary: [0, 1, 1, 2],      // guaranteed legendary-rarity item drops at the boss
  // monster mix per theme and tier (outer camps). Names are MONSTERS keys.
  themes: {
    crypt:  { name: 'Barrow Crypt',  glow: 0x66ffb0, mix: [null, ['skeleton', 'skeleton', 'skelArcher'], ['skeleton', 'skelArcher', 'ghoul', 'wraith'], ['crypt', 'skeleton', 'skelArcher', 'wraith', 'ghoul']],
              boss: { key: 'crypt', title: 'The Bone Warden', affixes: ['frozen'] }, kinds: ['regen', 'research'] },
    sunken: { name: 'Sunken Gate',   glow: 0x4fe3d0, mix: [null, ['ghoul', 'ghoul', 'wraith'], ['bogBeast', 'ghoul', 'wraith', 'skeleton'], ['bogBeast', 'bogBeast', 'wraith', 'ghoul', 'crypt']],
              boss: { key: 'king', title: 'The Drowned King', affixes: [] }, kinds: ['heroHp', 'heroDmg'] },
    forge:  { name: 'Ember Forge',   glow: 0xff8a30, mix: [null, ['orcRaider', 'orcRaider', 'wolf'], ['orcRaider', 'orcRaider', 'troll', 'wolf'], ['troll', 'troll', 'orcRaider', 'orcRaider', 'crypt']],
              boss: { key: 'troll', title: 'Forgemaster Gruk', affixes: ['fire'] }, kinds: ['towerDmg', 'income'] },
    warren: { name: 'Beast Warren',  glow: 0xd8c070, mix: [null, ['wolf', 'wolf', 'ghoul'], ['wolf', 'wolf', 'ghoul', 'ghoul'], ['troll', 'ghoul', 'wolf', 'wolf', 'ghoul']],
              boss: { key: 'wolf', title: 'The Alpha', affixes: ['fast', 'vampiric'], scale: 2.4 }, kinds: ['servDmg', 'slots'] },
  },
  // bonus kinds per theme are disjoint, so one quadrant offers different prizes; the match seed picks which kind a theme gives (same in all 4 quadrants = fair)
  // permanent team bonuses stored in team.bonus[kind] (summed over cleared dungeons); v = value by tier
  bonus: {
    towerDmg: { name: 'Siegebreaker Oath',   text: 'Towers and ballistas deal +{v}% damage',            v: [0, 12, 18, 26], pct: true },
    servDmg:  { name: 'Warband Banner',      text: 'Servants deal +{v}% damage',                        v: [0, 10, 15, 22], pct: true },
    heroDmg:  { name: 'Blood Pact',          text: 'Your hero deals +{v}% damage',                      v: [0, 8, 12, 18], pct: true },
    heroHp:   { name: 'Stoneheart',          text: 'Your hero takes {v}% less damage',                  v: [0, 8, 12, 17], pct: true },
    income:   { name: 'Hoard Tithe',         text: '+{v} gold per second',                              v: [0, 0.6, 1.0, 1.6] },
    slots:    { name: 'Veteran Muster',      text: '+{v} servant slot(s) (elite servants)',             v: [0, 1, 1, 2] },
    regen:    { name: 'Keep of Vigil',       text: 'Heroes and servants near your Dark Tower heal {v}% max HP/s', v: [0, 1.5, 2.5, 4], pct: true },
    research: { name: 'Forbidden Lore',      text: '+{v} research points now',                          v: [0, 3, 5, 8] },
  },
};

export const POI = {
  reach: 5,                     // m: the hero must be this close to use a POI (press E)
  discover: 26,                 // m: first sight fires the discover event (hidden shrines: 8)
  altar:   { hpFrac: 0.3, minHp: 0.5, xpBase: 70, xpPerLvl: 35, cd: 120 },                // trade 30% max HP (needs > 50% HP) for XP
  library: { points: 3, xp: 120 },                                                         // once: research points
  graveyard: { cost: 30, n: 3, life: 70, cd: 150, unit: 'skeleton' },                      // raise temporary undead
  well:    { cost: 40, uses: 3, table: [[0.45, 0], [0.30, 70], [0.18, 140], [0.07, 320]] }, // [chance, payout]
  witch:   { kills: 8, gold: 90, xp: 150, brewCost: 45, buffT: 90, dmg: 1.2 },             // bounty quest + potion (full heal + damage buff)
  cage:    { guards: ['orcRaider', 'orcRaider', 'wolf'], tier: 2, lvl: 3, xp: 110 },       // free a prisoner once the guards are dead
  hoard:   { guards: ['troll', 'crypt', 'crypt'], tier: 3, gold: 260, xp: 250, legendary: 1 },
  bridge:  { toll: 60, tier: 2, gold: 80, xp: 120 },                                       // troll toll: pay (he leaves) or fight (reward)
  cursed:  { good: 0.5, curse: 0.25, gold: 70, curseT: 90, curseDmg: 0.8, mimic: ['ghoul', 'ghoul', 'crypt'], mimicTier: 2, xp: 60 }, // rest is mimic
  watchtower: { vision: 70, xp: 40 },                                                      // claim: permanent vision around it
  shrine:  { cd: 240, xp: 60 },                                                            // hidden: full heal + perk reroll
  caravan: { speed: 3.6, escort: 24, dist: 110, gold: 160, xp: 140, ambush: ['wolf', 'wolf', 'orcRaider'], ambushTier: 2 },
};

// ---- v5 gold scarcity (src/pots.js). Orbs, books, skill ranks, death piles are gone. ------------------------------------------------
export const ECON4 = {
  stipend: 0,            // gold/s every hero gets (team.income is forced to this)
  killGoldMul: 0.45,     // monster gold values x this (applied once per monster on its death)
  chestGoldMul: 0.6,     // chest gold x this
};
export const POTION = { max: 5, heal: 0.4, cd: 15, start: 2, name: 'Health Potion' };
export const POTION_DROP = { mon: 0.045, tier: 0.02, champion: 0.2, chest: 0.35, boss: 2 }; // per kill/chest (danger adds up to +60%)


// ---- v0.4 towns (src/towns.js, towns_view.js, towns_ui.js; TOWNS lane) ----------------------------------------------------------
// kinds: guards = melee town guards, archers, captains (elite guards), villagers (ambient NPCs), lvl/tierMul = guard strength (tierMul also scales with time),
// hp = wall/gate strength (damageTown), gear = shop gear pieces (tier gearTier..+1, rarity weights), potions/scrolls = stocked ids, books = skill books in the shop,
// Prices are base gold; a saved town gives merchants a discount.
export const TOWN = {
  safeMul: 1.05, safeMin: 22,       // safe radius = max(safeMin, r * safeMul): no monsters, no PvP while the town stands
  activate: 170,                     // guards spawn when a hero comes this close (or when the town is besieged)
  reach: 4.6, service: 12,           // E reach to an NPC; shop/trainer/board commands work within r + service of the centre
  sellMul: 0.4, priceMul: 1, restockT: 240, maxActive: 0 /* v5: no quests; towns_ui.js still reads it */, bagMax: 24,
  guardRespawn: 75, guardGrowth: 0.02, // free replacement after this many seconds; +2% guard strength per minute
  autoFall: true,                    // a besieged town falls when its walls are down and every guard is dead
  kinds: {
    village: { guards: 3, archers: 1, captains: 0, villagers: 4, lvl: 2, tierMul: 1.0, hp: 500,  gear: 3, gearTier: 1, rarity: [66, 28, 6, 0, 0],   potions: ['heal'],                         potQty: 6,  books: 0, skills: 0, board: 3 },
    town:    { guards: 5, archers: 2, captains: 1, villagers: 8, lvl: 3, tierMul: 1.25, hp: 1400, gear: 5, gearTier: 2, rarity: [38, 38, 19, 5, 0],  potions: ['heal', 'surge'],       potQty: 8,  books: 1, skills: 5, board: 4 },
    capital: { guards: 10, archers: 4, captains: 2, villagers: 14, lvl: 5, tierMul: 1.7, hp: 4200, gear: 9, gearTier: 3, rarity: [14, 34, 32, 16, 4], potions: ['heal', 'surge'], potQty: 12 },
  },
  potions: {  // quick-use potions live in team.pots (gear.js): only these two kinds exist
    heal:  { name: 'Healing Draught', price: 45, tier: 1, rarity: 0, icon: '\u271a', desc: 'Instantly restores half of your health.' },
    surge: { name: 'Surge Elixir',    price: 70, tier: 1, rarity: 1, icon: '\u26a1', desc: 'For 12 s: +35% damage, +20% attack and move speed.' },
  },
  save: { gold: { village: 120, town: 240, capital: 500 }, xp: { village: 120, town: 260, capital: 600 }, minHelp: 8, disc: 0.1, discMax: 0.3 },
};
