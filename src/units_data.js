// v0.5 SERVANTS data: the servant roster (8 types), their spells, militia, summoned minions. Pure data, no imports. Re-exported from data.js.
// Servants have NO levels, XP, evolution or gear. Three sources: free a prisoner from a cage (poi 'cage', type chosen by tier), hire in a city
// (`mercenaryOffers`), or the hero SUMMON skill (`summonServants`, temporary, outside the cap). Max 4 permanent followers.
//
// Stats are EFFECTIVE values (what you see in play): servants.js unitExtra() divides them by COMBAT.unitHp / COMBAT.unitDmg so recalc() lands on them.
// Reference: a hero has ~600-950 HP; a servant is roughly a third of a hero in power (two knights hold a lane). Entries without `eff` (legacy minions,
// town guards defined in towns.js) keep the old "base number" meaning (recalc multiplies them).
//   role: tank | healer | caster | ranged | melee | summoner (drives AI + the plate icon), kite: ranged units keep this distance from the enemy,
//   spells: ids of SERVANT_SPELLS auto-cast by the sim AI (1-2), cost: hire price, tier: 1 cheap .. 3 premium (who sells it / which cage holds it).
const EFF = (o) => ({ eff: true, ...o });

export const ROLE_INFO = {
  tank: { label: 'Tank', col: '#a0a8b8', icon: '♞' }, healer: { label: 'Healer', col: '#80e090', icon: '✚' }, caster: { label: 'Mage', col: '#ff9a5a', icon: '✦' },
  ranged: { label: 'Ranged', col: '#8fd0ff', icon: '➶' }, melee: { label: 'Fighter', col: '#e0a060', icon: '⚔' }, summoner: { label: 'Summoner', col: '#c08cff', icon: '☠' },
  elite: { label: 'Captain', col: '#ffb040', icon: '⚑' }, scout: { label: 'Scout', col: '#e8e070', icon: '➶' }, siege: { label: 'Siege', col: '#ff7a5a', icon: '✹' },
};

export const RECRUIT_UNITS = {
  hound:      EFF({ name: 'War Hound', role: 'melee', hp: 230, atk: 14, range: 1.9, spd: 10.5, cd: 0.7, cost: 60, r: 0.6, model: 'warhound', animal: true, tier: 1, icon: '❖', spells: ['bite', 'howl'],
                    blurb: 'Fast and loyal. Leaps onto prey and howls to hasten the whole band.' }),
  archer:     EFF({ name: 'Archer', role: 'ranged', hp: 190, atk: 17, range: 16, spd: 7.6, cd: 1.1, cost: 100, r: 0.6, model: 'ranger', ranged: true, proj: { spd: 32, color: 0xe0d09a }, kite: 6, tier: 1, icon: '➶', spells: ['volley', 'snare'],
                    blurb: 'Rains arrows on groups and lays snare traps in the enemy path.' }),
  berserker:  EFF({ name: 'Berserker', role: 'melee', hp: 440, atk: 21, range: 2.5, spd: 8.4, cd: 0.8, cost: 130, r: 0.75, model: 'berserk', tier: 1, icon: '⚔', spells: ['leap', 'whirl'],
                    blurb: 'Leaps into the fray and spins in a storm of steel.' }),
  priest:     EFF({ name: 'Priest', role: 'healer', hp: 270, atk: 9, range: 11, spd: 7.4, cd: 1.4, cost: 140, r: 0.62, model: 'priest', ranged: true, proj: { spd: 20, color: 0xfff0b0 }, kite: 7, tier: 2, icon: '✚', spells: ['mend', 'ward'],
                    blurb: 'Heals the whole band in a pulse and shields the wounded. Cannot raise the dead.' }),
  knight:     EFF({ name: 'Knight', role: 'tank', hp: 780, atk: 17, range: 2.6, spd: 7.0, cd: 1.1, cost: 160, r: 0.85, model: 'knight', armor: 30, tier: 2, icon: '♞', spells: ['charge', 'taunt'],
                    blurb: 'Plate and a heavy blade. Charges in and draws every enemy onto himself.' }),
  battlemage: EFF({ name: 'Battle-Mage', role: 'caster', hp: 215, atk: 18, range: 13, spd: 7.4, cd: 1.2, cost: 170, r: 0.62, model: 'battlemage', ranged: true, proj: { spd: 24, color: 0xff8a30 }, dtype: 'fire', kite: 7, tier: 2, icon: '✦', spells: ['nova', 'frost'],
                    blurb: 'Bursts foes around him with a nova and chills the ground to slow a charge.' }),
  golem:      EFF({ name: 'Stone Golem', role: 'tank', hp: 1100, atk: 24, range: 3.0, spd: 5.4, cd: 1.5, cost: 190, r: 1.05, model: 'golem', armor: 22, tier: 3, icon: '◼', spells: ['slam', 'stoneskin'],
                    blurb: 'A walking wall. Slams the ground to stun and hardens into stone.' }),
  summoner:   EFF({ name: 'Imp-Tamer', role: 'summoner', hp: 210, atk: 11, range: 11, spd: 7.4, cd: 1.3, cost: 200, r: 0.62, model: 'summoner', ranged: true, proj: { spd: 22, color: 0xc08cff }, kite: 7, tier: 3, icon: '☠', spells: ['raise'],
                    blurb: 'Raises three spirits to fight beside him.' }),
  // ---- free town militia (team 4, never hired) ----
  militia:       EFF({ name: 'Militia Spearman', hidden: true, role: 'tank', hp: 170, atk: 11, range: 2.8, spd: 6.4, cd: 1.2, cost: 0, r: 0.68, model: 'shieldman', armor: 14, icon: '⚑' }),
  militiaArcher: EFF({ name: 'Militia Archer', hidden: true, role: 'ranged', hp: 110, atk: 11, range: 14, spd: 6.4, cd: 1.5, cost: 0, r: 0.6, model: 'crossbow', ranged: true, proj: { spd: 28, color: 0xcfd6e0 }, icon: '➶' }),
  militiaCaptain:EFF({ name: 'Militia Captain', hidden: true, role: 'elite', hp: 360, atk: 16, range: 2.7, spd: 6.8, cd: 1.0, cost: 0, r: 0.85, model: 'captain', armor: 24, icon: '⚑', spells: ['taunt'] }),
  // ---- summoned minions (temporary) ----
  spirit:     EFF({ name: 'Spirit', hidden: true, role: 'melee', hp: 75, atk: 11, range: 1.9, spd: 9.5, cd: 0.8, cost: 0, r: 0.5, model: 'spirit', icon: '✧' }),
};
// legacy summon units still referenced by hero ultimates / skills / graveyards (base-number stats: recalc multiplies them)
const LEGACY_UNITS = {
  skeleton:    { name: 'Skeleton Warrior', role: 'melee', hp: 150, atk: 21, range: 2.3, spd: 6.5, cd: 1.0, cost: 0, r: 0.6, model: 'skeleton', res: { poison: 60, cold: 30, fire: -10 }, hidden: true },
  grunt:       { name: 'Orc Grunt', role: 'melee', hp: 285, atk: 30, range: 2.5, spd: 6.5, cd: 1.1, cost: 0, r: 0.85, model: 'grunt', armor: 10, hidden: true },
  thug:        { name: 'Bandit Thug', role: 'melee', hp: 210, atk: 26, range: 2.3, spd: 7.0, cd: 0.9, cost: 0, r: 0.65, model: 'thug', armor: 6, hidden: true },
  zealot:      { name: 'Zealot', role: 'melee', hp: 165, atk: 26, range: 2.3, spd: 7.0, cd: 1.0, cost: 0, r: 0.65, model: 'zealot', deathBlast: { r: 3.5, dmg: 55, dtype: 'fire' }, res: { fire: 25 }, hidden: true },
  spiritwolf:  { name: 'Spirit Wolf', hidden: true, role: 'melee', hp: 100, atk: 19, range: 1.9, spd: 9.5, cd: 0.8, cost: 0, r: 0.65, model: 'spiritwolf', res: { poison: 30, cold: 30 } },
  flamewisp:   { name: 'Flame Wisp', hidden: true, role: 'ranged', hp: 65, atk: 17, range: 10, spd: 7.5, cd: 1.1, cost: 0, r: 0.5, model: 'flamewisp', ranged: true, dtype: 'fire', proj: { spd: 20, color: 0xff8a30 }, res: { fire: 80 } },
};
export const UNITS = { ...LEGACY_UNITS, ...RECRUIT_UNITS };

// types sold by city brokers, cheapest first (each town lists 3 of them: see MERC_STOCK)
export const MERC_TYPES = ['hound', 'archer', 'berserker', 'priest', 'knight', 'battlemage', 'golem', 'summoner'];
// which tiers a town kind sells: a village sells tier 1-2, a town 1-3, the capital everything (3 offers each, fixed per town and seed)
export const MERC_STOCK = { village: [1, 2], town: [1, 2, 3], capital: [1, 2, 3] };
export const FOLLOWER_MAX = 4;
export const FOLLOWER_TUNE = {
  warpDist: 50, warpT: 1.2,   // a follower farther than warpDist from the hero for warpT seconds teleports to the hero
  regen: 0.02,                // out-of-combat regeneration (fraction of max HP per second); x3 inside a town
  hireRange: 25,              // metres beyond the town radius where the hero may still hire
  cageXp: 80,                 // XP for freeing a prisoner
};
// free town militia (team 4). counts per town kind: [spearmen, archers, captains]; they respawn one at a time while the town stands (hp > 0)
export const MILITIA = { respawn: 40, plan: { village: [2, 1, 0], town: [3, 2, 0], capital: [5, 2, 1] }, hold: 11 };
// prisoners in cages (poi.tier 1..3, default 2): the servant types a cage of that tier may hold
export const CAGE_TYPES = { 1: ['hound', 'archer', 'berserker'], 2: ['priest', 'knight', 'battlemage', 'berserker'], 3: ['golem', 'summoner', 'knight', 'battlemage'] };

// ---- spells (auto-cast by the sim AI in servant_spells.js; cooldowns 5-12 s) ----------------------------------------------------------------
// kind -> behaviour. Common: cd (s), color (visual), name (shown as a floating label). Numbers are final damage / healing.
export const SERVANT_SPELLS = {
  // knight
  charge:    { name: 'Charge',       icon: '»', kind: 'dash',   cd: 8,  min: 4.5, max: 13, dmg: 38, r: 2.6, stun: 0.9, color: 0xffd070, desc: 'Rushes a distant enemy, damaging and stunning those at the landing.' },
  taunt:     { name: 'Taunt',        icon: '!', kind: 'taunt',  cd: 11, r: 9.5, dur: 4, shield: 0.2, color: 0xffa040, desc: 'Every enemy nearby turns on him; he gains a shield.' },
  // priest
  mend:      { name: 'Mend',         icon: '+', kind: 'heal',   cd: 7,  r: 10.5, amt: 95, below: 0.75, color: 0x7af09a, desc: 'A pulse of light heals everyone nearby.' },
  ward:      { name: 'Ward',         icon: '◍', kind: 'ward',   cd: 10, range: 13, amt: 140, dur: 6, color: 0xfff0b0, desc: 'Shields the most endangered ally.' },
  // battle-mage
  nova:      { name: 'Fire Nova',    icon: '✹', kind: 'nova',   cd: 8,  r: 5.5, dmg: 70, slow: 0.6, slowT: 2, color: 0xff8a30, desc: 'A burst of flame around him that slows what survives.' },
  frost:     { name: 'Frost Field',  icon: '❄', kind: 'field',  cd: 9,  range: 14, r: 5, dmg: 14, pulses: 6, dur: 3, slow: 0.5, color: 0x7fd0ff, desc: 'Chills the ground: damage and heavy slow for 3 s.' },
  // hound
  bite:      { name: 'Savage Bite',  icon: '≫', kind: 'dash',   cd: 6,  min: 2.5, max: 9.5, dmg: 52, r: 1.8, stun: 0, color: 0xff6a5a, leap: true, desc: 'Leaps onto prey and bites for heavy damage.' },
  howl:      { name: 'Howl',         icon: '♫', kind: 'haste',  cd: 12, r: 13, dur: 5, mul: 1.35, color: 0xffe9a0, desc: 'The band moves and attacks 35% faster for 5 s.' },
  // archer
  volley:    { name: 'Volley',       icon: '⇶', kind: 'volley', cd: 7,  range: 16, r: 4.2, dmg: 58, delay: 0.55, color: 0xe0d09a, desc: 'A hail of arrows lands on a group.' },
  snare:     { name: 'Snare Trap',   icon: '✸', kind: 'trap',   cd: 10, range: 13, r: 2.6, dmg: 34, slow: 0.12, slowT: 3, life: 25, color: 0xc8b078, desc: 'Lays a trap in the enemy path: near-root for 3 s.' },
  // golem
  slam:      { name: 'Ground Slam',  icon: '▼', kind: 'nova',   cd: 9,  r: 5.2, dmg: 62, stun: 0.9, color: 0xb8a070, desc: 'Smashes the ground, damaging and stunning everything near.' },
  stoneskin: { name: 'Stone Skin',   icon: '◼', kind: 'skin',   cd: 12, dur: 6, shield: 0.45, color: 0x9aa0a8, desc: 'Hardens into stone: a shield worth 45% of his health.' },
  // imp-tamer
  raise:     { name: 'Raise Spirits',icon: '☠', kind: 'raise',  cd: 12, n: 3, unit: 'spirit', dur: 14, max: 6, color: 0xc08cff, desc: 'Three spirits fight for 14 s.' },
  // berserker
  leap:      { name: 'Leap',         icon: '⤴', kind: 'dash',   cd: 7,  min: 4, max: 12, dmg: 46, r: 3, stun: 0.4, color: 0xff6a3a, leap: true, desc: 'Jumps onto an enemy and crashes down, hurting all around.' },
  whirl:     { name: 'Whirlwind',    icon: '✴', kind: 'whirl',  cd: 8,  r: 3.9, dmg: 30, pulses: 4, dur: 1.3, color: 0xdfe4ee, desc: 'Spins in a storm of steel: four hits to all around.' },
};
