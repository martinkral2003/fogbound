// Elder Maren: quest giver, lore, the state of the island.
import { questChoices, questNodes, rumour, bye } from './dlg_common.js';

export const qtext = {
  wolves: {
    offer: ['"Wolves. They came with the fog, or the fog came with them; I stopped arguing about which."', '"Five of the great grey ones have been taking the watch\'s patrols apart one man at a time. Kill five and the rest may remember they are afraid."'],
    accept: '"Good. They hunt on the open moor by dusk. Do not fight them in the open if you can help it. Wolves are patient. You will have to be more so."',
    active: ['"Still running free, the grey ones. I heard one howl this morning, close enough to rattle the shutters."'],
    done: ['"The howling has stopped. I did not know how loud it was until it did."', '"Take this. It is not much. Harrowmere has never been rich, only stubborn."'],
  },
  king: {
    offer: ['"You have the look of someone who survived something. Good. I need that."', '"Beneath the Sunken Temple the Drowned King keeps his court of the unburied. He was a lord once. Now he is a lock, and the fog is the key turning."', '"Kill him and the fog may slacken. I cannot promise it. I can promise gold, and my gratitude, which is worth less."'],
    accept: '"Go in force. Bring potions. Bring a plan, and then bring a second plan for when the first dies. The temple lies at the centre, the old roads meet there."',
    active: ['"The King still reigns. I can feel it in my teeth when the wind turns."'],
    done: ['"Then it is done. I will not pretend to understand what you have set free, or stopped."', '"Take it. Take all of it. You will have earned every coin and every scar."'],
  },
};

export default {
  start: (c) => (c.met ? 'hub' : 'first'),
  qtext,
  nodes: {
    first: {
      lines: ['An old woman in a grey shawl looks up from the notice board. Her eyes are the colour of wet slate.', '"Another one off the boats. They keep coming. Every one of you is certain you will be the last one standing."', '"I am Maren, Elder of Harrowmere. This place is a wall, a fire and a few stubborn people. While you stand inside the gate, nobody draws steel. That is the only law we keep."'],
      choices: [
        { text: 'What is this place?', next: 'about' },
        { text: 'What is happening on this island?', next: 'island' },
        bye('I will not draw steel.'),
      ],
    },
    hub: {
      lines: [(c) => (c.hostile ? '"You reek of blood and fresh quarrels. Say your piece, then take it outside the gate."' : (c.q('king') === 'done' ? '"You came back. That alone makes you the finest hero this island has had."' : '"Hm. The hero. What do you need, child?"'))],
      choices: (c) => [
        ...questChoices(c, 'maren'),
        { text: 'What is this place?', next: 'about' },
        { text: 'What is happening on this island?', next: 'island' },
        { text: 'Any news?', next: 'news' },
        { text: 'Who should I speak to here?', next: 'folk' },
        bye(),
      ],
    },
    about: {
      lines: ['"Harrowmere. Three hundred years old, built on the bones of a stronghold older than the realm. The palisade is new. The ground is not."', '"The smith, the alchemist, the inn: all of them will deal with you fairly if you do not bleed on the floor. Captain Roke keeps the gate."'],
      choices: [{ text: 'And the fog?', next: 'island' }, { text: 'Back.', next: 'hub' }],
    },
    island: {
      lines: ['"They call it the Dread Fog. It rises from the temple at the heart of the island and walks outward, a little further each hour. Whatever stands in it, withers."', '"Heroes come, each hoping to be the last one inside the circle. Whoever survives, the fog lets go of. So the old tale says."', '"I would rather you stood with Harrowmere than against the rest. But I am old, and I have stopped expecting more than one person to live."'],
      choices: [{ text: 'Back.', next: 'hub' }, bye()],
    },
    news: { lines: [(c) => '"' + rumour(c) + '"'], choices: [{ text: 'Back.', next: 'hub' }] },
    folk: {
      lines: ['"Brannoch at the forge for steel. Vessa in the little green hut for draughts. Torvald in the yard for teaching you not to die. Hedda at the Drowned Lantern, and if she is kind, you may eat."', '"Pell, who buys anything, which tells you everything. Roke at the gate. And if you go looking, there is an old fool at a shrine outside the walls. Oswin. Tell him I am still angry about the goat."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    ...questNodes(qtext),
  },
};
