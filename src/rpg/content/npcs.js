// NPC definitions for Harrowmere and the hermit. role = shop role for Items.shopStock (null = no shop).
// act: 'stand' | 'work' (hammering/mixing/wiping) | 'patrol' (short loop) | 'sit'. look: appearance hint for chars.js (outfit/hair/props).
export const NPCS = [
  {
    key: 'maren', name: 'Elder Maren', title: 'Elder of Harrowmere', role: null, act: 'stand', lvl: 8, gold: 0,
    look: { outfit: 'robe', hair: 'grey-long', prop: 'staff', tint: '#7d7566' },
    barks: ['The fog has opinions about us, child.', 'Another winter of this and the graves will outnumber the beds.', 'Keep the Lantern lit.', 'Harrowmere has stood three hundred years. I should like it to stand three hundred and one.'],
  },
  {
    key: 'brannoch', name: 'Brannoch', title: 'Smith', role: 'smith', act: 'work', lvl: 10, gold: 600,
    look: { outfit: 'apron', hair: 'bald-beard', prop: 'hammer', tint: '#6b5a4a' },
    barks: ['Steel does not care who holds it.', 'Dull blade, dull end.', '*clang* *clang*', 'Bring me iron, not excuses.'],
  },
  {
    key: 'vessa', name: 'Vessa', title: 'Alchemist', role: 'alchemist', act: 'work', lvl: 6, gold: 400,
    look: { outfit: 'hooded-dress', hair: 'black-braid', prop: 'vial', tint: '#4f5f4a' },
    barks: ['Do not sniff that.', 'Everything is poison. Dosage is the only difference.', 'Nightshade, wolfsbane, a little grave dirt. The usual.', 'If it glows, it is probably fine.'],
  },
  {
    key: 'torvald', name: 'Torvald', title: 'Trainer', role: null, act: 'stand', lvl: 12, gold: 0,
    look: { outfit: 'scarred-leather', hair: 'shaved', prop: 'sword', tint: '#5c5148' },
    barks: ['Again. Lower your guard and I will lower your teeth.', 'Pain is just the lesson arriving.', 'Feet first. Blade second. Pride never.', 'Dead heroes make poor teachers.'],
  },
  {
    key: 'hedda', name: 'Hedda', title: 'Innkeeper of the Drowned Lantern', role: 'inn', act: 'stand', lvl: 5, gold: 250,
    look: { outfit: 'dress-apron', hair: 'red-bun', prop: 'tankard', tint: '#8a6a50' },
    barks: ['Ale is cheaper than courage.', 'The stew is fine. The fog is in the stew, but the stew is fine.', 'No fighting inside. The walls are older than you.', 'Sit. Drink. Pretend tomorrow is not coming.'],
  },
  {
    key: 'pell', name: 'Pell', title: 'Fence', role: 'fence', act: 'stand', lvl: 4, gold: 900,
    look: { outfit: 'patched-coat', hair: 'lank-thin', prop: 'sack', tint: '#4e4a58' },
    barks: ['Everything has a price. Mostly lower than you hoped.', 'I never ask where it came from. I ask where it is going.', 'Psst. Locks open for the patient.', 'Gold does not smell, friend. Corpses do.'],
  },
  {
    key: 'roke', name: 'Captain Roke', title: 'Captain of the Watch', role: null, act: 'patrol', lvl: 14, gold: 0,
    look: { outfit: 'mail-surcoat', hair: 'grey-crop', prop: 'halberd', tint: '#59605a' },
    barks: ['Eyes on the treeline.', 'Keep your blade sheathed inside the gate.', 'Nothing lives out there that wants to be friends.', 'The wall holds. The wall always holds. Until it does not.'],
  },
  {
    key: 'oswin', name: 'Hermit Oswin', title: 'Keeper of the Shrine', role: null, act: 'sit', lvl: 6, gold: 0, outside: true,
    look: { outfit: 'rags-cowl', hair: 'wild-white', prop: 'lantern', tint: '#8c8c7c' },
    barks: ['The stones remember.', 'Three, there are three. Or were.', 'Do not look into the fog too long. It looks back with interest.', 'Hm. A visitor. How tedious. How welcome.'],
  },
];
export const NPC_BY_KEY = Object.fromEntries(NPCS.map((n) => [n.key, n]));
