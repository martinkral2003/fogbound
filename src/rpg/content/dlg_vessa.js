// Vessa the alchemist: potions, herbs, dry warnings.
import { questChoices, questNodes, rumour } from './dlg_common.js';

export default {
  start: (c) => (c.met ? 'hub' : 'first'),
  qtext: {},
  nodes: {
    first: {
      lines: ['The hut smells of burnt sugar and wet earth. A woman with ink-black braids and a stained apron does not turn from her cauldron.', '"Close the door. Light spoils half my work. I am Vessa. I make what keeps you alive and what ends others, and I do not always keep them in separate jars."', '"Healing draughts, mana tonics, tinctures. Prices are fair. If the glass glows, do not drink it. If it does not glow, drink it quickly."'],
      choices: [{ text: 'Let me see your stock.', effect: { trade: true }, next: 'hub' }, { text: 'What do you recommend?', next: 'advice' }, { text: 'Farewell.', next: 'end' }],
    },
    hub: {
      lines: [(c) => (c.hostile ? '"No brawlers in my shop. Sheathe or leave."' : '"Mm. What is it? I have a boil in the cauldron."')],
      choices: (c) => [
        ...questChoices(c, 'vessa'),
        { text: 'Let me see your stock.', effect: { trade: true }, next: 'stay' },
        { text: 'What do you recommend?', next: 'advice' },
        { text: 'What do you hear?', next: 'news' },
        { text: 'I am done trading.', effect: { trade: false }, cond: (cc) => !!cc.st.dialogue && !!cc.st.dialogue.trade },
        { text: 'Farewell.', next: 'end' },
      ],
    },
    advice: {
      lines: ['"Carry two healing draughts at all times, a tonic if you have any sense about spellcraft. Drink before you are dying, not once you are."', '"Fight on stable ground. Fight with your back to a wall. Fight someone smaller than you. I have never lost a customer to that advice."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    news: { lines: [(c) => '"' + rumour(c) + '" She stirs, unimpressed with the world in general.'], choices: [{ text: 'Back.', next: 'hub' }] },
    ...questNodes({}),
  },
};
