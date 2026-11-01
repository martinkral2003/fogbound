// Hermit Oswin at the shrine outside the walls: the secret quest A Hermit's Riddle (3 lore stones).
import { questChoices, questNodes } from './dlg_common.js';

export const qtext = {
  hermit: {
    offer: ['"Three stones. Old as the first hearth. Written in a tongue I only half remember, which is more than anyone else."', '"They stand where the dead keep house: a graveyard, a ruin, a ring of rock. Read all three. Come back. I will pay you in something you cannot spend."'],
    yes: 'Where do I look?',
    accept: ['"Look near the old stones, in the moor, on the ridge, among the ruins. The stones hum. You will feel them before you see them."', '"Interact with each. Do not read aloud. They do not like it."'],
    active: ['"Three stones. You have read ' + 'some, I can see it in your face. Go on."'],
    done: ['*His hands shake as he lays them on your shoulders.*', '"So. The memory is whole. Take this: a vigil I kept for forty years. It will keep you better than it kept me."'],
  },
};

export default {
  start: (c) => (c.met ? 'hub' : 'first'),
  qtext,
  nodes: {
    first: {
      lines: ['A figure in a cowl sits by a mossy shrine. The lantern beside him gives off light the colour of old teeth.', '"Hm. A visitor. How tedious. How welcome."', '"Oswin. I keep this shrine. It keeps me. Mostly it keeps the fog from my feet."'],
      choices: [{ text: 'Maren says she is still angry about the goat.', next: 'goat' }, { text: 'What is this shrine?', next: 'shrine' }, { text: 'Farewell.', next: 'end' }],
    },
    hub: {
      lines: [(c) => (c.hostile ? '"Blood. I can smell it. Wash first."' : '"Back again. What do you seek?"')],
      choices: (c) => [
        ...questChoices(c, 'oswin'),
        { text: 'What is this shrine?', next: 'shrine' },
        { text: 'Any wisdom for the road?', next: 'wisdom' },
        { text: 'Farewell.', next: 'end' },
      ],
    },
    goat: { lines: ['"Ha. She is the only person alive who remembers the goat. Tell her it was already dead."'], choices: [{ text: 'Back.', next: 'hub' }] },
    shrine: {
      lines: ['"One of seven, once. Pilgrims came to pray for harvests. Now they come to pray for dawn."', '"It heals the weary and the wounded, if you ask nicely."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    wisdom: {
      lines: ['"The fog is not the enemy. The fog is a clock. Know the time, and you will know where to stand."', '"Also: never trust a chest that smiles."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    ...questNodes(qtext),
  },
};
