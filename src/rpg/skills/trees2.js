// Skill-tree data, part 2: magic, stealth and utility skills.
import { R } from './trees.js';

export const TREES_UTIL = {
  destruction: {
    name: 'Destruction', group: 'magic', costMul: 1.15, desc: 'Offensive magic. Each rank teaches a new spell.',
    ranks: [
      R('Firebolt', { spellDmgPct: 5 }, null, { spells: ['firebolt'] }),
      R('Frostshard', { spellDmgPct: 5, spellCostPct: -5 }, null, { spells: ['frostshard'] }),
      R('Arc Lightning', { spellDmgPct: 6, spellCritPct: 5 }, { attrs: { int: 12 } }, { spells: ['arc'] }),
      R('Venom Dart', { spellDmgPct: 7, spellCostPct: -5 }, { all: [['restoration', 1]] }, { spells: ['venom'] }),
      R('Nova', { spellDmgPct: 8, castSpeedPct: 15 }, { attrs: { int: 15 }, all: [['restoration', 2]] }, { spells: ['nova'] }),
    ],
  },
  restoration: {
    name: 'Restoration', group: 'magic', costMul: 1.1, desc: 'Healing, wards and necromantic craft. Everyone knows Mend; this makes it better.',
    ranks: [
      R('Ward', { healPct: 15, manaPct: 3 }, null, { spells: ['stoneskin'] }),
      R('Mender', { healPct: 15, shieldPct: 15, hpPct: 3 }),
      R('Soul Siphon', { healPct: 10, manaRegenPct: 10, lifesteal: 1 }, { attrs: { int: 12 } }, { spells: ['drain'] }),
      R('Resilience', { shieldPct: 15, hpPct: 3, hpRegenPct: 10, manaPct: 3 }, { all: [['destruction', 1]] }),
      R('Grave Warden', { healPct: 15, summonPct: 25, lifesteal: 2, manaPct: 4 }, { attrs: { int: 14 } }, { spells: ['bonewarden'] }),
    ],
  },
  stealth: {
    name: 'Stealth', group: 'rogue', costMul: 1, desc: 'Sneaking, backstabs and vanishing. Crouch to move unseen.',
    ranks: [
      R('Quiet Feet', { sneakMul: 0.9, sneakSpeedPct: 8 }),
      R('Shadow', { sneakMul: 0.9, backstabPct: 10 }),
      R('Cutthroat', { sneakMul: 0.9, backstabPct: 15 }, { attrs: { dex: 12 }, all: [['lightArmor', 1]] }),
      R('Vanish', { sneakMul: 0.9, backstabPct: 15, sneakSpeedPct: 8 }, { all: [['lightArmor', 2]] }, { spells: ['blink'] }),
      R('Assassin', { sneakMul: 0.9, backstabPct: 25, sneakCritPct: 25 }, { all: [['lockpicking', 2]] }),
    ],
  },
  lockpicking: {
    name: 'Lockpicking', group: 'rogue', costMul: 0.8, desc: 'Open locked chests and doors; better locks need better hands.',
    ranks: [
      R('Fiddler', { lockpick: 0.15, lockTier: 1 }),
      R('Tumbler', { lockpick: 0.15, lockTier: 2 }),
      R('Safecracker', { lockpick: 0.15, lootLuckPct: 5 }, { all: [['stealth', 1]] }),
      R('Master Key', { lockpick: 0.15, lockTier: 3 }),
      R('Master Thief', { lockpick: 0.15, lootLuckPct: 8, goldFindPct: 10 }, { all: [['stealth', 3]] }),
    ],
  },
  athletics: {
    name: 'Athletics', group: 'utility', costMul: 0.9, desc: 'Stamina, sprinting and dodging.',
    ranks: [
      R('Wind', { staminaPct: 5, staminaRegenPct: 6 }),
      R('Runner', { staminaPct: 5, sprintCostPct: -10, staminaRegenPct: 6 }),
      R('Roll With It', { staminaPct: 5, dodgeCostPct: -10, moveSpeedPct: 2 }),
      R('Marathon', { staminaPct: 5, sprintCostPct: -10, staminaRegenPct: 6 }, { all: [['survival', 1]] }),
      R('Peak Form', { staminaPct: 5, dodgeCostPct: -10, moveSpeedPct: 3, staminaRegenPct: 6 }, { all: [['survival', 2]] }),
    ],
  },
  survival: {
    name: 'Survival', group: 'utility', costMul: 0.9, desc: 'Endure the island and the creeping Dread Fog.',
    ranks: [
      R('Forager', { hpRegenPct: 15, foodPct: 10 }),
      R('Hardy', { hpRegenPct: 15, foodPct: 10, resPoison: 5, fogResist: 4 }),
      R('Frostborn', { hpRegenPct: 15, resCold: 10, fogResist: 4 }),
      R('Herbalist', { hpRegenPct: 15, foodPct: 15, resPoison: 5, fogResist: 4 }),
      R('Fogwalker', { hpRegenPct: 15, fogResist: 12, moveSpeedPct: 3 }, { all: [['athletics', 2]] }),
    ],
  },
  trade: {
    name: 'Trade', group: 'utility', costMul: 0.8, desc: 'Haggling, hauling and an eye for coin.',
    ranks: [
      R('Haggler', { tradePct: 5 }),
      R('Pack Mule', { tradePct: 5, carryPct: 5 }),
      R('Silver Tongue', { tradePct: 5, goldFindPct: 10 }, { any: [['lockpicking', 1], ['stealth', 1]] }),
      R('Porter', { tradePct: 5, carryPct: 5 }),
      R('Merchant Prince', { tradePct: 6, goldFindPct: 15 }),
    ],
  },
};
