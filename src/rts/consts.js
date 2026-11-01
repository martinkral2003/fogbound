// FOGBOUND: DOMINION shared constants (RTS mode). Pure data.
export const SIM_DT = 1 / 30;
export const RES = ['gold', 'timber', 'stone', 'blood', 'souls'];
export const RES_NAMES = { gold: 'Tithe', timber: 'Rotwood', stone: 'Black Stone', blood: 'Blood', souls: 'Souls' };
export const RES_ICONS = { gold: '◈', timber: '❚', stone: '⬣', blood: '♥', souls: '☠' };
export const CAPS = { mil: 50, work: 24, gen: 3 };
export const START_RES = { gold: 400, timber: 300, stone: 150, blood: 200, souls: 0 };
export const MAX_VET = 6;
export const MAX_GENERAL_LVL = 10;

// the four lords; team id == faction id == start corner (world.hearts order NW, NE, SE, SW)
export const FACTIONS = [
  { id: 0, key: 'necro', name: 'Necromancers', lord: 'Mordrek the Pale', color: 0x4fe3c1, css: '#4fe3c1', school: 'necromancy', blurb: 'Fearless cheap undead hordes, bone walls, graveyard mana.' },
  { id: 1, key: 'orc', name: 'Orc Horde', lord: 'Gorrak Skullsplitter', color: 0xe8742a, css: '#e8742a', school: 'warmagic', blurb: 'Brutal fast production, rams and war-wagons, wall breakers.' },
  { id: 2, key: 'demon', name: 'Infernal Legion', lord: 'Azrakul the Burning', color: 0xd8402a, css: '#d8402a', school: 'infernal', blurb: 'Summoned fiends, flying imps, hellfire cannons, soul-paid elites.' },
  { id: 3, key: 'cult', name: 'Cult of Fanatics', lord: 'Prophet Ezekar', color: 0xc43bd6, css: '#c43bd6', school: 'blood', blurb: 'Zealots, bombers, priests, blood magic and sacrifice.' },
];

export const LAYERS = { ground: 0, wall: 1 };
export const STANCES = ['aggressive', 'defensive', 'hold'];
export const DTYPES = ['physical', 'fire', 'cold', 'lightning', 'poison', 'dark', 'siege'];
