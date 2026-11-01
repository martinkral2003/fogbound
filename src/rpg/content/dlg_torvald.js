// Torvald the trainer: sells skills (Skills.trainerOffers / the 'learn' cmd), gives combat advice.
import { questChoices, questNodes } from './dlg_common.js';

export default {
  start: (c) => (c.met ? 'hub' : 'first'),
  qtext: {},
  nodes: {
    first: {
      lines: ['A broad man with a shaved scalp and a face that has been broken and reset more than once puts down a practice sword. The yard is a muddle of dents and old blood.', '"Torvald. Trainer. I teach people how to not die, which is the only skill that matters, and the only one that cannot be taught after the fact."', '"You get skill points when you level. I get paid to tell you how to spend them. Gold and points both; I do not work for gratitude."'],
      choices: [{ text: 'Teach me.', effect: { trainer: true }, next: 'train' }, { text: 'Any advice for a fight?', next: 'advice' }, { text: 'Not now.', next: 'end' }],
    },
    hub: {
      lines: [(c) => (c.hostile ? '"Lessons are for the calm. Calm down."' : '"Back for more punishment? Good."')],
      choices: (c) => [
        ...questChoices(c, 'torvald'),
        { text: 'Teach me.', effect: { trainer: true }, next: 'train' },
        { text: 'Any advice for a fight?', next: 'advice' },
        { text: 'What do the dummies teach me?', next: 'dummies' },
        { text: 'Farewell.', next: 'end' },
      ],
    },
    train: {
      lines: [(c) => '"You have ' + c.a.points.skill + ' skill point' + (c.a.points.skill === 1 ? '' : 's') + ' and ' + c.a.gold + ' gold. Choose what to learn."'],
      trainer: true,
      choices: [{ text: 'That is enough for now.', effect: { trainer: false }, next: 'hub' }],
    },
    advice: {
      lines: ['"Everything telegraphs. The swing, the lunge, the breath before the roar. Watch the shoulders. The shoulders lie less than the face."', '"Hold the attack for a heavy, release when the opening is there. Block with your stamina, not your hope. When something big is winding up, roll through it. Not away. Through."', '"And never fight three if two will do. Never fight two if one will do. Never fight one if it is the Drowned King."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    dummies: {
      lines: ['"The straw ones do not hit back. That is the difference between practice and education."', '"Walk up, strike, count the beats, roll out. Do that until you hate me. Then do it again."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    ...questNodes({}),
  },
};
