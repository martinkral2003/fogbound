// FOGBOUND: DOMINION siege unit definitions (SIEGE lane). Pure data; registered with Units.registerUnits by siege.js (ensureUnits).
// def.siege = { kind, bld (dmg per hit vs structures, before wall-tier resistance), unit (dmg vs units), cd, reach (melee) | range, splash, fire, gateMul, arc, speedShot, minRange, hitsAir }
const S = (o) => o;
const base = (id, name, extra) => Object.assign({ id, name, role: 'siege', needs: 'siege_workshop', tier: 2, age: 2, popCost: 3, vision: 22, souls: 2, upkeep: 2, desc: '' }, extra);

export const SIEGE_DEFS = {
  necro_ram: base('necro_ram', 'Bone Ram', { cost: { timber: 150, stone: 20 }, time: 32, hp: 560, armor: 16, speed: 3.4, r: 1.3, tags: { siege: 1, ram: 1 },
    atk: { dmg: 14, range: 2.4, cd: 2.2, dtype: 'siege', splash: 0, projectile: null }, siege: S({ kind: 'ram', bld: 125, unit: 14, cd: 2.2, reach: 2.4, gateMul: 1.8 }),
    desc: 'A skull-headed battering ram. Devastating against gates and walls, helpless against units.' }),
  necro_catapult: base('necro_catapult', 'Bone Catapult', { cost: { timber: 180, stone: 40, souls: 2 }, time: 40, hp: 320, armor: 6, speed: 2.8, r: 1.4, tags: { siege: 1, ranged: 1 },
    atk: { dmg: 90, range: 42, cd: 5.5, dtype: 'siege', splash: 3.4, projectile: 'boulder' }, siege: S({ kind: 'catapult', bld: 105, unit: 70, cd: 5.5, range: 42, minRange: 9, splash: 3.4, arc: 14, speed: 20, projectile: 'boulder' }),
    desc: 'Hurls bone-boulders over walls. Slow, splash damage, long range.' }),
  necro_siegetower: base('necro_siegetower', 'Bone Siege Tower', { cost: { timber: 260, stone: 60 }, time: 46, hp: 1100, armor: 12, speed: 2.4, r: 2.4, popCost: 4, tags: { siege: 1, tower: 1 },
    atk: { dmg: 0, range: 0, cd: 5, dtype: 'physical', splash: 0 }, siege: S({ kind: 'tower', reach: 3.2, dockT: 600 }),
    desc: 'Docks against an enemy wall; your soldiers climb onto the wall-top.' }),

  orc_ram: base('orc_ram', 'Troll Ram', { cost: { timber: 140, stone: 20 }, time: 26, hp: 620, armor: 15, speed: 3.6, r: 1.3, tags: { siege: 1, ram: 1 },
    atk: { dmg: 16, range: 2.4, cd: 2.0, dtype: 'siege', splash: 0, projectile: null }, siege: S({ kind: 'ram', bld: 135, unit: 16, cd: 2.0, reach: 2.4, gateMul: 1.8 }),
    desc: 'A tree trunk with an iron skull, pushed by trolls. The orc wall-breaker.' }),
  orc_warwagon: base('orc_warwagon', 'War-Wagon', { cost: { timber: 170, stone: 60, gold: 60 }, time: 38, hp: 460, armor: 10, speed: 3.0, r: 1.5, tags: { siege: 1, ranged: 1 },
    atk: { dmg: 85, range: 28, cd: 4.2, dtype: 'siege', splash: 3.0, projectile: 'cannonball' }, siege: S({ kind: 'cannon', bld: 95, unit: 85, cd: 4.2, range: 28, minRange: 6, splash: 3.0, arc: 4, speed: 28, projectile: 'cannonball' }),
    desc: 'A spiked wagon with a smoke-belching cannon. Good against both walls and units.' }),
  orc_siegetower: base('orc_siegetower', 'Scrap Siege Tower', { cost: { timber: 240, stone: 50 }, time: 42, hp: 1000, armor: 12, speed: 2.6, r: 2.4, popCost: 4, tags: { siege: 1, tower: 1 },
    atk: { dmg: 0, range: 0, cd: 5, dtype: 'physical', splash: 0 }, siege: S({ kind: 'tower', reach: 3.2, dockT: 600 }), desc: 'Lets the horde pour onto enemy walls.' }),
  orc_ballista: base('orc_ballista', 'Bolt Thrower', { cost: { timber: 140, gold: 50 }, time: 30, hp: 280, armor: 4, speed: 3.2, r: 1.2, tags: { siege: 1, ranged: 1 },
    atk: { dmg: 120, range: 36, cd: 4.5, dtype: 'physical', splash: 0, projectile: 'bolt_big' }, siege: S({ kind: 'ballista', bld: 30, unit: 120, cd: 4.5, range: 36, minRange: 4, arc: 0, speed: 50, projectile: 'bolt_big', bigMul: 1.6 }),
    desc: 'Giant bolts for heavy targets and tower garrisons; weak against stone.' }),

  demon_ram: base('demon_ram', 'Infernal Ram', { cost: { timber: 130, stone: 30, souls: 4 }, time: 30, hp: 580, armor: 14, speed: 3.5, r: 1.3, tags: { siege: 1, ram: 1 },
    atk: { dmg: 14, range: 2.4, cd: 2.2, dtype: 'siege', splash: 0, projectile: null }, siege: S({ kind: 'ram', bld: 120, unit: 14, cd: 2.2, reach: 2.4, gateMul: 1.8, fire: true }),
    desc: 'A burning ram that sets timber alight on every blow.' }),
  demon_hellcannon: base('demon_hellcannon', 'Hellfire Cannon', { cost: { timber: 150, stone: 80, souls: 6 }, time: 42, hp: 420, armor: 8, speed: 2.9, r: 1.5, tags: { siege: 1, ranged: 1 },
    atk: { dmg: 100, range: 32, cd: 4.6, dtype: 'fire', splash: 3.6, projectile: 'hellfire' }, siege: S({ kind: 'cannon', bld: 100, unit: 100, cd: 4.6, range: 32, minRange: 7, splash: 3.6, arc: 5, speed: 26, projectile: 'hellfire', fire: true }),
    desc: 'Lobs balls of liquid hellfire that ignite timber and flesh.' }),
  demon_firethrower: base('demon_firethrower', 'Flame Fiend Engine', { cost: { timber: 100, stone: 40, souls: 3 }, time: 26, hp: 360, armor: 6, speed: 3.4, r: 1.2, tags: { siege: 1, ranged: 1 },
    atk: { dmg: 22, range: 9, cd: 0.6, dtype: 'fire', splash: 1.6, projectile: 'flame' }, siege: S({ kind: 'flame', bld: 14, unit: 22, cd: 0.6, range: 9, splash: 1.6, arc: 0.5, speed: 16, projectile: 'flame', fire: true }),
    desc: 'A stream of fire. Torches palisades, gates and the men behind them.' }),

  cult_ram: base('cult_ram', 'Penitent Ram', { cost: { timber: 140, stone: 20, blood: 20 }, time: 28, hp: 540, armor: 14, speed: 3.4, r: 1.3, tags: { siege: 1, ram: 1 },
    atk: { dmg: 14, range: 2.4, cd: 2.2, dtype: 'siege', splash: 0, projectile: null }, siege: S({ kind: 'ram', bld: 120, unit: 14, cd: 2.2, reach: 2.4, gateMul: 1.8 }), desc: 'A blessed ram carried by chanting penitents.' }),
  cult_firecatapult: base('cult_firecatapult', 'Pyre Catapult', { cost: { timber: 170, stone: 40, blood: 30 }, time: 38, hp: 300, armor: 6, speed: 2.8, r: 1.4, tags: { siege: 1, ranged: 1 },
    atk: { dmg: 70, range: 40, cd: 5.0, dtype: 'fire', splash: 3.4, projectile: 'firerock' }, siege: S({ kind: 'catapult', bld: 80, unit: 70, cd: 5.0, range: 40, minRange: 9, splash: 3.4, arc: 14, speed: 20, projectile: 'firerock', fire: true }),
    desc: 'Flings burning pitch; wooden walls and gates go up in flames.' }),
  cult_sapper: base('cult_sapper', 'Flagellant Bomber', { cost: { gold: 40, blood: 40 }, time: 14, hp: 120, armor: 0, speed: 5.6, r: 0.7, popCost: 1, tags: { siege: 1, melee: 1, bomber: 1 },
    atk: { dmg: 0, range: 1.8, cd: 1, dtype: 'siege', splash: 4.5, projectile: null }, siege: S({ kind: 'sapper', bld: 620, unit: 85, splash: 4.6, reach: 1.9, fuse: 0.4 }),
    desc: 'A screaming fanatic with a keg of black powder. Cracks gates and wall sections, then is gone.' }),
};
