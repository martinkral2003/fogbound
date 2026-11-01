// Quest definitions (8). Objective kinds: kill{match,goal} fetch{item,goal,consume} loot{site} visit{goal} boss target lore{goal} deliver{item,goal,to} talk{npc}.
// A quest becomes 'ready' when every objective is satisfied; it is turned in by talking to `turnin` (default: giver) and choosing the turn-in option.
// reward: {xp, gold, rep, items:[{def,qty,rarity}|{loot:table,tier}] | (st,a)=>items[]}. Quest items (smithsHammer, rivalSignet, cryptRelic) are fabricated by qutil.mkItem if the Items agent has no def.
import * as Items from '../items.js';
import { mkItem } from './qutil.js';

const isWolf = (m) => m.type === 'wolf' || /wolf/i.test(m.name || '');
const isSkel = (m) => /skel/i.test(m.type || '') || /skeleton/i.test(m.name || '');
export const isBoss = (m) => m.type === 'king' || m.boss || /drowned ?king/i.test(m.name || '') || m.type === 'drownedKing';

// a unique legendary-flavoured reward built from whatever the Items defs offer
export function uniqueItem(st, name, slots, bonus) {
  let def = null;
  const defs = Items.ITEMS ? Object.values(Items.ITEMS) : [];
  for (const s of slots) { def = defs.find((d) => d.slot === s || d.kind === s); if (def) break; }
  const it = mkItem(st, def ? def.id : 'cryptRelic', { rarity: 4, name });
  it.name = name; it.unique = true; it.rarity = 4;
  it.bonus = { ...(it.bonus || {}), ...(bonus || {}) };
  return it;
}

export const QUESTS = {
  wolves: {
    id: 'wolves', title: 'Wolves at the Gate', giver: 'maren', level: 1,
    desc: 'Dire wolves circle Harrowmere at dusk and the watch is stretched thin. Elder Maren wants five of them dead before the fog thickens.',
    objectives: [{ kind: 'kill', match: isWolf, goal: 5, text: 'Slay dire wolves', where: 'monster:wolf' }],
    reward: { xp: 120, gold: 60, rep: 5, items: [{ def: 'healthPotion', qty: 2 }] },
  },
  hammer: {
    id: 'hammer', title: "The Smith's Hammer", giver: 'brannoch', level: 1,
    desc: "Brannoch's father's war-hammer was lost when raiders took it to their camp. The smith will not say how much it matters. His hands say it.",
    objectives: [{ kind: 'fetch', item: 'smithsHammer', goal: 1, consume: true, text: "Recover Brannoch's war-hammer from the camp", where: 'site:hammer' }],
    reward: { xp: 160, gold: 40, rep: 6, free: 'upgrade', items: [{ loot: 'chest', tier: 1 }] },
  },
  bones: {
    id: 'bones', title: 'Bones in the Moor', giver: 'roke', level: 2,
    desc: 'Something keeps raising the dead in the moor, and the watch buries the same men twice. Clear the skeletons from their camp and open the crypt chest they guard.',
    objectives: [
      { kind: 'kill', match: isSkel, goal: 4, text: 'Destroy skeletons', where: 'monster:skel' },
      { kind: 'loot', site: 'crypt', text: 'Open the crypt chest', where: 'site:crypt' },
    ],
    reward: { xp: 200, gold: 90, rep: 6, items: [{ loot: 'chest', tier: 2 }] },
  },
  lantern: {
    id: 'lantern', title: 'Lantern Rite', giver: 'hedda', level: 1,
    desc: 'Hedda keeps the old rite: carry a flame to three sacred places, shrines or obelisks, and the Lantern stays lit. It is superstition. It also works.',
    objectives: [{ kind: 'visit', goal: 3, text: 'Visit shrines or obelisks', where: 'visit' }],
    reward: { xp: 140, gold: 50, rep: 4, items: [{ def: 'healthPotion', qty: 1 }, { def: 'manaPotion', qty: 1 }] },
  },
  king: {
    id: 'king', title: "The Drowned King's Heart", giver: 'maren', level: 5,
    desc: 'Beneath the Sunken Temple the Drowned King still walks. End him, and Harrowmere may sleep. Maren will pay for proof that he is gone.',
    objectives: [{ kind: 'boss', text: 'Slay the Drowned King at the Sunken Temple', where: 'boss' }],
    reward: { xp: 800, gold: 400, rep: 15, items: [{ loot: 'boss', tier: 3 }] },
  },
  marked: {
    id: 'marked', title: 'Marked Hero', giver: 'roke', level: 3, needsRival: true,
    desc: 'The fog draws killers from every shore. Captain Roke has a name on the wall and a price beside it. Bring back the hero\'s signet as proof.',
    objectives: [
      { kind: 'target', text: (st, qs) => 'Kill ' + (qs.data.targetName || 'the marked hero'), where: 'target' },
      { kind: 'fetch', item: 'rivalSignet', goal: 1, consume: true, text: "Bring the signet to Captain Roke", where: 'npc:roke' },
    ],
    reward: { xp: 300, gold: 200, rep: 10, items: [{ loot: 'chest', tier: 3 }] },
  },
  hermit: {
    id: 'hermit', title: "A Hermit's Riddle", giver: 'oswin', level: 1, hidden: true,
    desc: '"Three stones stand where the dead keep house. Read them in order or in any order; the stones do not care. Then come back, and I shall pay you in something you cannot spend."',
    objectives: [{ kind: 'lore', goal: 3, text: 'Read the lore stones', where: 'lore' }],
    reward: { xp: 350, gold: 0, rep: 8, items: (st) => [uniqueItem(st, "Oswin's Vigil", ['amulet', 'ring', 'weapon'], { hp: 30, mana: 20 })] },
  },
  supply: {
    id: 'supply', title: 'Supply Run', giver: 'hedda', level: 1,
    desc: 'The watch drinks my ale but forgets to eat. Captain Roke and his men need three potions and two meals for the night shift. Take them yourself; my knees are not what they were.',
    objectives: [
      { kind: 'deliver', item: 'kind:potion', goal: 3, to: 'roke', text: 'Deliver potions to Captain Roke' },
      { kind: 'deliver', item: 'kind:food', goal: 2, to: 'roke', text: 'Deliver food to Captain Roke' },
    ],
    reward: { xp: 110, gold: 70, rep: 5, items: [{ def: 'bread', qty: 3 }] },
  },
};
export const QUEST_ORDER = ['wolves', 'hammer', 'bones', 'lantern', 'king', 'marked', 'hermit', 'supply'];
