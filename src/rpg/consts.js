// FOGBOUND: HERO shared constants. Pure data; imported by every rpg module.
export const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'boots', 'hands', 'amulet', 'ring'];
export const QUICK_SLOTS = 8; // keys 1-8: potions, spells, weapon swaps
export const DTYPES = ['physical', 'fire', 'cold', 'lightning', 'poison'];
export const ATTRS = ['str', 'dex', 'int', 'vit'];
export const MAX_LVL = 20;
export const SIM_DT = 1 / 30;

// physics / movement (metres, seconds)
export const PHYS = {
  gravity: 22, jumpV: 6.4, walk: 3.6, sprintMul: 1.65, crouchMul: 0.5, accel: 28,
  interactRange: 2.7, actorSeparation: 0.9,
};

// actor kinds: 'player' (the human), 'rival' (AI hero), 'monster', 'npc'
export const KINDS = ['player', 'rival', 'monster', 'npc'];

// combat state machine states (actor.cs.state)
export const CS = ['idle', 'windup', 'active', 'recover', 'block', 'dodge', 'stagger', 'draw', 'cast', 'dead'];

// an input that does nothing (AI actors that have no action use this)
export const IDLE_INPUT = Object.freeze({
  mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false,
  attack: false, attackPressed: false, heavy: false, block: false, dodge: false, interact: false,
  slot: -1, lockId: 0, cmds: [],
});
