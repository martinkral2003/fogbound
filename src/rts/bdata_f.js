// FOGBOUND: DOMINION faction-unique buildings and wonders (BUILDINGS lane). Pure data: [id, props] pairs consumed by bdata.js.
// trainMul {time,cost} scales the unit train time/cost at that building. aura {type,radius,...} read by Buildings.update.
export const FACTION_BUILDINGS = [
  // ---- Necromancers
  ['graveyard', { name: 'Graveyard', faction: 'necro', w: 7, d: 7, h: 4, hp: 700, armor: 2, cost: { timber: 60, stone: 80 }, buildTime: 28, age: 1, influence: 18, garrison: 6,
    provides: { mana: 60, manaRegen: 0.8, souls: 0.12 }, limit: 4, desc: 'Gloomy ground: trickles Souls, feeds mana, wakes the dead.' }],
  ['bone_crypt', { name: 'Bone Crypt', faction: 'necro', w: 9, d: 9, h: 7, hp: 1500, armor: 4, cost: { stone: 160, timber: 120, souls: 20 }, buildTime: 44, age: 1, needs: ['barracks'], influence: 18, garrison: 12,
    trains: ['skeleton', 'ghoul'], trainMul: { time: 0.55, cost: 0.6 }, limit: 1, unique: true, desc: 'Raises skeleton hordes cheaply and swiftly.' }],
  ['soul_engine', { name: 'Soul Engine', faction: 'necro', w: 14, d: 14, h: 18, hp: 6000, armor: 8, cost: { stone: 900, timber: 400, gold: 700, souls: 300 }, buildTime: 150, age: 3, needs: ['sanctum', 'graveyard'],
    influence: 30, vision: 40, provides: { souls: 1.0, mana: 300, manaRegen: 3, wonder: 1 }, limit: 1, wonder: true, desc: 'WONDER. Grinds the dead into endless Souls and mana; undead rise stronger.' }],
  // ---- Orcs
  ['war_totem', { name: 'War Totem', faction: 'orc', w: 4, d: 4, h: 9, hp: 700, armor: 2, cost: { timber: 90, blood: 40 }, buildTime: 22, age: 1, influence: 16, vision: 24,
    aura: { type: 'rage', radius: 28, dmg: 0.1, speed: 0.05 }, limit: 5, desc: 'Roaring totem: nearby orcs fight and march faster.' }],
  ['war_hall', { name: 'War Hall', faction: 'orc', w: 10, d: 8, h: 7, hp: 1500, armor: 3, cost: { timber: 220, stone: 80, blood: 60 }, buildTime: 40, age: 1, needs: ['barracks'], influence: 18, garrison: 12,
    trains: ['grunt', 'raider', 'troll'], alsoTrains: ['barracks'], trainMul: { time: 0.7, cost: 0.9 }, aura: { type: 'rage', radius: 24, dmg: 0.15, speed: 0.08 }, limit: 1, unique: true,
    desc: 'Rage aura; cheap, fast production of brutes.' }],
  ['great_totem', { name: 'Great Totem', faction: 'orc', w: 12, d: 12, h: 24, hp: 5500, armor: 6, cost: { timber: 800, stone: 400, blood: 500, gold: 500 }, buildTime: 140, age: 3, needs: ['war_hall', 'sanctum'],
    influence: 30, vision: 45, aura: { type: 'rage', radius: 60, dmg: 0.25, speed: 0.15 }, provides: { wonder: 1, mana: 150, manaRegen: 1.5 }, limit: 1, wonder: true,
    desc: 'WONDER. A towering totem: massive army-wide rage and war-magic.' }],
  // ---- Demons
  ['hellgate', { name: 'Hellgate', faction: 'demon', w: 9, d: 9, h: 9, hp: 1600, armor: 4, cost: { stone: 200, timber: 100, souls: 40 }, buildTime: 46, age: 2, needs: ['barracks'], influence: 18, garrison: 8,
    trains: ['fiend', 'hellhound', 'archdemon'], trainMul: { time: 0.9, cost: 1 }, provides: { souls: 0.06 }, limit: 1, unique: true, desc: 'Gate to the abyss: summons infernal elites for Souls.' }],
  ['brimstone_pit', { name: 'Brimstone Pit', faction: 'demon', w: 6, d: 6, h: 3, hp: 800, armor: 3, cost: { stone: 70, blood: 40 }, buildTime: 24, age: 1, influence: 16,
    provides: { mana: 50, manaRegen: 0.7, souls: 0.08 }, limit: 4, desc: 'Seething fissure: souls and mana trickle upward.' }],
  ['infernal_rift', { name: 'Infernal Rift', faction: 'demon', w: 13, d: 13, h: 16, hp: 5500, armor: 7, cost: { stone: 800, timber: 300, gold: 700, souls: 400 }, buildTime: 150, age: 3, needs: ['hellgate', 'sanctum'],
    influence: 30, vision: 40, provides: { wonder: 1, souls: 0.8, mana: 250, manaRegen: 2.5 }, limit: 1, wonder: true, desc: 'WONDER. A rift to hell: fiends pour out and the ground burns.' }],
  // ---- Cult of Fanatics
  ['flagellant_chapel', { name: 'Flagellant Chapel', faction: 'cult', w: 6, d: 7, h: 6, hp: 900, armor: 3, cost: { timber: 90, stone: 70, blood: 40 }, buildTime: 26, age: 1, influence: 16, garrison: 8,
    provides: { heal: 1, healRadius: 14, mana: 40, manaRegen: 0.5 }, limit: 4, desc: 'Pain and prayer: heals zealots and feeds blood magic.' }],
  ['blood_altar', { name: 'Blood Altar', faction: 'cult', w: 7, d: 7, h: 5, hp: 1300, armor: 3, cost: { stone: 150, blood: 150 }, buildTime: 38, age: 1, needs: ['barracks'], influence: 18, garrison: 6,
    trains: ['zealot', 'bomber', 'inquisitor'], trainMul: { time: 0.85, cost: 0.85 }, provides: { sacrifice: 2, burst: 1, souls: 0.05 }, limit: 1, unique: true,
    desc: 'Sacrifice units for a burst of power; trains fanatics.' }],
  ['blood_cathedral', { name: 'Blood Cathedral', faction: 'cult', w: 13, d: 15, h: 22, hp: 5200, armor: 6, cost: { stone: 800, timber: 300, blood: 700, gold: 600 }, buildTime: 150, age: 3, needs: ['blood_altar', 'sanctum'],
    influence: 30, vision: 40, provides: { wonder: 1, sacrifice: 3, heal: 1, healRadius: 40, mana: 250, manaRegen: 2.5 }, limit: 1, wonder: true,
    desc: 'WONDER. Unholy cathedral: mass healing, sacrifice power, a tide of zealots.' }],
];
