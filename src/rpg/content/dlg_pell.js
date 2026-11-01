// Pell the fence: buys anything, sells lockpicks, keys, maps.
import { questChoices, questNodes, rumour } from './dlg_common.js';

export default {
  start: (c) => (c.met ? 'hub' : 'first'),
  qtext: {},
  nodes: {
    first: {
      lines: ['A thin man in a coat of many patches steps out of the shadow of his stall as if the shadow were an apartment he rents.', '"Pell. Friend of the discerning, enemy of the rich. I buy anything, sell anything, and I never, ever ask where it came from."', '"Locked chest? I have picks. Locked door? I have keys. Lost? I have maps. Rich? I have a bridge to sell you, quite literally."'],
      choices: [{ text: 'Show me your wares.', effect: { trade: true }, next: 'hub' }, { text: 'What do you buy?', next: 'buys' }, { text: 'Farewell.', next: 'end' }],
    },
    hub: {
      lines: [(c) => (c.hostile ? '"Friend, friend. Not with that blade out. Bad for business."' : '"Business, friend? Always business."')],
      choices: (c) => [
        ...questChoices(c, 'pell'),
        { text: 'Show me your wares.', effect: { trade: true }, next: 'stay' },
        { text: 'What do you buy?', next: 'buys' },
        { text: 'Buy a map of the island (60 gold).', req: { gold: 60 }, reason: 'Not enough gold', cond: { not: { item: 'islandMap' } }, effect: [{ gold: -60 }, { give: 'islandMap' }, { say: 'Pell slides a creased map across the counter. The roads are marked in three inks.' }], next: 'map' },
        { text: 'Heard anything?', next: 'news' },
        { text: 'I am done trading.', effect: { trade: false }, cond: (cc) => !!cc.st.dialogue && !!cc.st.dialogue.trade },
        { text: 'Farewell.', next: 'end' },
      ],
    },
    buys: {
      lines: ['"Everything. Swords, boots, unmatched gloves, a suspiciously heavy ring. I pay fair, give or take what you owe me for not asking."', '"Anything with blood on it takes a little off. Anything cursed, a little more. Quest items stay with you; I have scruples. A few."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    map: { lines: ['"Cheap at twice the price. Mind the red ink: it means something died there."'], choices: [{ text: 'Back.', next: 'hub' }] },
    news: { lines: [(c) => '"' + rumour(c) + '" He smiles. It does not reach anywhere.'], choices: [{ text: 'Back.', next: 'hub' }] },
    ...questNodes({}),
  },
};
