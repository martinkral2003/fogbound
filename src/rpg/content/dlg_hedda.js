// Hedda the innkeeper: food, ale, rumours, a cheap healing meal; Lantern Rite and Supply Run quests.
import { questChoices, questNodes, rumour } from './dlg_common.js';

export const qtext = {
  lantern: {
    offer: ['"You ever hear of the Lantern Rite? No? Of course not. Nobody under sixty does."', '"The old way: carry a candle to three of the sacred places, the shrines and the stone obelisks, and say a word at each. The lantern over my door stays lit as long as someone does it every year. This year it is you."', '"Do not laugh. It is good luck, and luck is the only thing I stock that is not watered."'],
    accept: '"Shrines glow where the road forks, obelisks stand taller than the trees. Walk up to three, any three. Say something kind. Or something rude, the dead are not choosy."',
    active: ['"Not finished? The Lantern flickers. It always does when someone dawdles."'],
    done: ['"There. I felt it catch. Do not tell Maren I said that."', '"A little something for the road. And a bed here, whenever you want one. Floors are free."'],
  },
  supply: {
    offer: ['"The watch lives on my stew and spite, and spite has run short."', '"Captain Roke is up at the gate, hungry and too proud to say so. Three potions and two meals will keep the night shift upright. I would carry it myself, but I have the pot."', '"Pay is fair. And Roke buys a round when he remembers."'],
    accept: '"Potions you can buy from Vessa. Food from my counter. Hand it to Roke himself, mind. The guards drink anything handed to them."',
    active: ['"The watch is hungry and I am out of excuses. Deliver them to Roke."'],
    done: ['"Roke says the watch will live. High praise, from him."', '"Here. For your trouble."'],
  },
};

export default {
  start: (c) => (c.met ? 'hub' : 'first'),
  qtext,
  nodes: {
    first: {
      lines: ['The Drowned Lantern is low, warm and loud with nobody. A stout woman with red hair pinned in a bun wipes a tankard that has been clean for an hour.', '"Hedda. This is my inn. Every inn needs a rule. Mine: no blood on the floors, no coin on credit, and no talking about the fog before supper."', '"Sit. Eat. Hear things. I sell food, ale, and sometimes company."'],
      choices: [{ text: 'What is on the menu?', next: 'menu' }, { text: 'Anything I should know?', next: 'rumour' }, { text: 'Farewell.', next: 'end' }],
    },
    hub: {
      lines: [(c) => (c.hostile ? '"Sit down and breathe, you are shaking the glasses."' : '"What can I do for you? Besides the obvious."')],
      choices: (c) => [
        ...questChoices(c, 'hedda'),
        { text: 'What is on the menu?', next: 'menu' },
        { text: 'Anything I should know?', next: 'rumour' },
        { text: 'Let me see what you stock.', effect: { trade: true }, next: 'stay' },
        { text: 'I am done trading.', effect: { trade: false }, cond: (cc) => !!cc.st.dialogue && !!cc.st.dialogue.trade },
        { text: 'Farewell.', next: 'end' },
      ],
    },
    menu: {
      lines: ['"A bowl of stew restores a body. The ale makes the world a gentler place. For about an hour."'],
      choices: [
        { text: 'A hot meal (8 gold): restores health and stamina.', req: { gold: 8 }, reason: 'Not enough gold', effect: [{ gold: -8 }, { heal: true }, { say: 'The stew is hot, hearty and almost entirely not fog. You feel restored.' }], next: 'meal' },
        { text: 'A tankard of ale (3 gold).', req: { gold: 3 }, reason: 'Not enough gold', effect: [{ gold: -3 }, { say: 'The ale is cold and dark and tastes a little of regret.' }], next: 'ale' },
        { text: 'Back.', next: 'hub' },
      ],
    },
    meal: { lines: ['She ladles it out without a word. Steam rises like a ghost leaving.'], choices: [{ text: 'Thanks.', next: 'hub' }] },
    ale: { lines: ['"Slowly. It has a temper."'], choices: [{ text: 'Cheers.', next: 'hub' }] },
    rumour: { lines: [(c) => '"' + rumour(c) + '"'], choices: [{ text: 'Another.', next: 'rumour2' }, { text: 'Back.', next: 'hub' }] },
    rumour2: { lines: ['"Some say Oswin the hermit knows where old stones keep the island\'s memory. Others say Oswin knows where he left his boots. Hard to tell."'], choices: [{ text: 'Back.', next: 'hub' }] },
    ...questNodes(qtext),
  },
};
