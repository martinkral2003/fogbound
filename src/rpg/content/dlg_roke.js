// Captain Roke: guard captain, lore, bounty on rivals (Marked Hero), Bones in the Moor, receives the Supply Run.
import { questChoices, questNodes, rumour } from './dlg_common.js';

export const qtext = {
  bones: {
    offer: ['"The moor dead are walking again. We bury them, they climb out. Last week one of them was wearing my brother\'s cloak."', '"There is a camp of them to the north-west, around an old crypt. Break the skeletons, then open the crypt chest. Whatever is raising them left something there. Bring back what you can carry."'],
    accept: '"Four of them at least, probably more. They are fragile, but they do not stay down just because you want them to. Bring a blunt weapon if you have one."',
    active: ['"Bones still walk. I can hear them clatter in the wind."'],
    done: ['"So the dead stay dead a little longer. Good work."', '"The watch will not forget it. Take your due."'],
  },
  marked: {
    offer: ['"See that wall? Names of heroes who came ashore. The boldest, the loudest, the most dangerous, I mark."', '"One of them is a plague on the island. I have put a price on that head: kill ' + 'them and bring back the signet as proof. I do not care how."'],
    accept: '"Their name will be in your journal. The map will show where they were last seen. Keep your guard up; they will be hunting too."',
    active: ['"The marked one still breathes. That is a failure of someone."'],
    done: ['"A signet. Blood on it, still wet. You do not flinch, do you?"', '"Good. The bounty is yours. Do not make a habit of this. Or do. The gold is real."'],
  },
  supply: {
    offer: [],
  },
};
delete qtext.supply;

export default {
  start: (c) => (c.met ? 'hub' : 'first'),
  qtext,
  nodes: {
    first: {
      lines: ['A mailed man leans on a halberd by the gate. His eyes track you before his head does.', '"Captain Roke. I keep this gate. Rules: no steel drawn inside the palisade, no spells cast, no fires lit that are not mine. Break them and I will break you, politely."', '"Beyond the wall it is every hero for themselves. I do not envy you."'],
      choices: [{ text: 'What is out there?', next: 'out' }, { text: 'Understood.', next: 'hub' }],
    },
    hub: {
      lines: [(c) => (c.hostile ? '"Sheathe the blade or sleep in the stocks."' : (c.deliverWait ? '' : '"Report."'))],
      choices: (c) => [
        ...questChoices(c, 'roke'),
        { text: 'What is out there?', next: 'out' },
        { text: 'Tell me about the fog.', next: 'fog' },
        { text: 'Any news?', next: 'news' },
        { text: 'Farewell.', next: 'end' },
      ],
    },
    delivered: { lines: ['The captain looks over the goods and grunts. "That will do. Tell Hedda the watch is in her debt. Again."'], choices: [{ text: 'Back.', next: 'hub' }] },
    out: {
      lines: ['"Wolves on the moor. Skeletons in the camps. Orcs up in the highlands. A troll or two in the ridges that I would not wish on a rival."', '"And at the centre the Sunken Temple, with something big and wet in the cellar. Do not go there before you can carry your own weight."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    fog: {
      lines: ['"It moves in rings, like a tide. Each time it stops, the next ring is smaller. Anyone caught outside burns slowly, then quickly."', '"The temple sits in the middle of it all. When the last circle closes, there will be one hero standing, or none."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    news: { lines: [(c) => '"' + rumour(c) + '"'], choices: [{ text: 'Back.', next: 'hub' }] },
    ...questNodes(qtext),
  },
};
