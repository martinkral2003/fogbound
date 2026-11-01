// Skill-tree data, part 1: combat skills. See skills.js header for the cost rules and prerequisite format.
// Rank entry: { name, mods:{key:delta per rank}, spells?:[ids unlocked], req?:{ lvl?, attrs?:{str:12}, all?:[[skill,rank]], any?:[[skill,rank]] }, note? }
// Mod values of a rank are ADDED to the lower ranks (kind 'mul' keys are multiplied, 'max' keys take the highest), see mods.js.
export const R = (name, mods, req, extra) => ({ name, mods: mods || {}, req: req || null, ...(extra || {}) });

export const TREES_COMBAT = {
  onehand: {
    name: 'One-Handed', group: 'combat', costMul: 1, desc: 'Swords, axes, maces, daggers and spears. Quick, tireless, forgiving.',
    ranks: [
      R('Swordplay', { oneHandDmgPct: 4 }),
      R('Footwork', { oneHandDmgPct: 4, critPct: 2 }),
      R('Riposte', { oneHandDmgPct: 5, critDmgPct: 20, attackCostPct: -8 }),
      R('Flurry', { oneHandDmgPct: 6, attackSpeedPct: 4 }),
      R('Blademaster', { oneHandDmgPct: 8, critPct: 3, armorPenPct: 10 }, { all: [['block', 1]] }),
    ],
  },
  twohand: {
    name: 'Two-Handed', group: 'combat', costMul: 1, desc: 'Greatswords, axes and hammers. Slow, brutal, needs strength.',
    ranks: [
      R('Heavy Grip', { twoHandDmgPct: 5, heavyDmgPct: 5 }, { attrs: { str: 12 } }),
      R('Momentum', { twoHandDmgPct: 5, attackCostPct: -6 }),
      R('Skullsplitter', { twoHandDmgPct: 6, staggerPct: 15, heavyDmgPct: 10 }, { attrs: { str: 14 }, all: [['block', 1]] }),
      R('Rend Armour', { twoHandDmgPct: 7, armorPenPct: 12 }),
      R('Whirlwind', { twoHandDmgPct: 9, cleave: 1, heavyDmgPct: 10 }, { attrs: { str: 16 } }),
    ],
  },
  archery: {
    name: 'Archery', group: 'combat', costMul: 1, desc: 'Bows and crossbows. Patience, range and a steady hand.',
    ranks: [
      R('Steady Aim', { bowSkillDmgPct: 5, drawSpeedPct: 8 }),
      R('Long Shot', { bowSkillDmgPct: 5, rangePct: 10 }),
      R('Headhunter', { bowSkillDmgPct: 6, drawSpeedPct: 8, critPct: 4, critDmgPct: 20 }, { attrs: { dex: 12 } }),
      R('Frugal Archer', { bowSkillDmgPct: 7, ammoSavePct: 12 }, { all: [['athletics', 2]] }),
      R('Hunter\'s Grace', { bowSkillDmgPct: 8, drawSpeedPct: 10, moveWhileDraw: 0.5 }, { attrs: { dex: 14 } }, { note: 'Signature: move at half speed while drawing.' }),
    ],
  },
  block: {
    name: 'Block & Parry', group: 'combat', costMul: 1, desc: 'Shield and weapon defence. Perfect parries stagger attackers.',
    ranks: [
      R('Guard', { blockEfficiency: 8, staminaCostPct: -3 }),
      R('Stalwart', { blockEfficiency: 6, staminaCostPct: -3 }),
      R('Deflect', { blockEfficiency: 6, parryWindow: 0.06 }, { any: [['onehand', 2], ['twohand', 2]] }, { note: 'Signature: wider parry window.' }),
      R('Bulwark', { blockEfficiency: 8, staminaCostPct: -4, poiseBonus: 10 }),
      R('Counterstrike', { blockEfficiency: 8, parryWindow: 0.04, counterDmgPct: 30 }, { any: [['onehand', 3], ['twohand', 3]] }, { note: 'Signature: parry then strike for +30%.' }),
    ],
  },
  lightArmor: {
    name: 'Light Armour', group: 'combat', costMul: 0.9, desc: 'Leather and cloth. Mobility and endurance (bonus scales with how many worn pieces are light).',
    ranks: [
      R('Supple', { armorPctLight: 4, moveSpeedPct: 1 }),
      R('Evasive', { armorPctLight: 4, staminaRegenPct: 6 }),
      R('Second Wind', { armorPctLight: 5, staminaRegenPct: 8, moveSpeedPct: 1 }),
      R('Slippery', { armorPctLight: 5, dodgeCostPct: -10 }),
      R('Shadow Dancer', { armorPctLight: 6, dodgeInv: 0.05, moveSpeedPct: 2 }),
    ],
  },
  heavyArmor: {
    name: 'Heavy Armour', group: 'combat', costMul: 1.05, desc: 'Mail and plate. Unmovable, but only for the strong (bonus scales with heavy pieces worn).',
    ranks: [
      R('Mailed', { armorPctHeavy: 5, heavyReqStr: -1 }, { attrs: { str: 12 } }),
      R('Iron Will', { armorPctHeavy: 5, heavyMovePenaltyPct: -30 }),
      R('Immovable', { armorPctHeavy: 6, poiseBonus: 20, heavyReqStr: -1 }, { attrs: { str: 14 }, all: [['block', 2]] }),
      R('Plate Mastery', { armorPctHeavy: 7, resAll: 3 }),
      R('Juggernaut', { armorPctHeavy: 8, resPhysical: 5, heavyMovePenaltyPct: -40, heavyReqStr: -1 }, { attrs: { str: 16 } }),
    ],
  },
};
