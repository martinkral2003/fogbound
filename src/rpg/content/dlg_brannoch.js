// Brannoch the smith: trade weapons/armour, upgrade gear via Items.upgradeItem, hammer quest.
import * as Items from '../items.js';
import { emit } from '../core.js';
import { questChoices, questNodes, bye } from './dlg_common.js';
import { SLOTS } from '../consts.js';

export const qtext = {
  hammer: {
    offer: ['"Raiders came through in the spring. They took the wall-iron, the horses, and my father\'s hammer."', '"A hammer is a hammer. I can forge another. But that one rang a hundred and nine bells in the old war, and it was the last thing he held."', '"They hole up in a camp past the treeline. Bring it back. I will not call it a favour; I will call it a debt, and I pay those."'],
    accept: '"Look for a crate or a chest in their camp; they hoard like magpies. The head is dark iron, the haft scorched. You will know it when you hold it."',
    active: ['"Not yet? Hm. It is out there. Iron does not walk off by itself... well, usually."'],
    done: ['*He takes the hammer in both hands, turns it, and for a moment says nothing.*', '"Same notch on the head. Same weight. You have done a thing today you will not understand until you are older."', '"Give me your blade. No. Not for coin. This one is mine to pay."'],
  },
};

// upgrade menu: one entry per equipped upgradable item; cost previewed on a clone
function preview(it) {
  if (typeof Items.upgradeItem !== 'function') return null;
  try { const r = Items.upgradeItem(structuredClone(it)); return r && r.ok ? r : null; } catch (e) { return null; }
}
function upgradeChoices(c) {
  const out = [];
  for (const s of SLOTS) {
    const it = c.a.equip[s]; if (!it) continue;
    const p = preview(it); if (!p) continue;
    out.push({
      text: 'Reinforce ' + it.name + ' (' + p.cost + 'g)', req: { gold: p.cost }, reason: 'You cannot afford it',
      effect: (cc) => { const r = Items.upgradeItem(cc.a.equip[s]); if (r && r.ok) { cc.a.gold -= r.cost || p.cost; emit(cc.st, { type: 'msg', actor: cc.a.id, text: cc.a.equip[s].name + ' reinforced.' }); } },
      next: 'upgrade',
    });
  }
  return out;
}

export default {
  start: (c) => (c.met ? 'hub' : 'first'),
  qtext,
  nodes: {
    first: {
      lines: ['The smith does not look up. Each blow of the hammer lands on the same spot, the way a heartbeat does.', '"Brannoch. Forge is open. Do not touch the anvil, do not stand in the light, do not ask what the sparks are about."', '"Weapons, armour. I buy what I can resell and I sell what I would carry myself. If it breaks, it was not mine."'],
      choices: [{ text: 'Show me what you have.', effect: { trade: true }, next: 'hub' }, { text: 'Can you improve my gear?', next: 'upgrade' }, bye()],
    },
    hub: {
      lines: [(c) => (c.hostile ? '"Not while you are in a brawl. Sheathe."' : (c.q('hammer') === 'done' ? '"The forge is yours. Within reason."' : '"Speak. Mind the sparks."'))],
      choices: (c) => [
        ...questChoices(c, 'brannoch'),
        { text: 'Show me what you have.', effect: { trade: true }, next: 'stay' },
        { text: 'Can you improve my gear?', next: 'upgrade' },
        { text: 'Tell me about this forge.', next: 'forge' },
        { text: 'I am done trading.', effect: { trade: false }, cond: (cc) => !!cc.st.dialogue && !!cc.st.dialogue.trade },
        bye(),
      ],
    },
    upgrade: {
      lines: ['"I can sharpen an edge or reinforce a plate. Plus one, plus two, plus three. After that the metal gets ideas of its own."', '"Equipped gear only. I do not carry your pack for you."'],
      choices: (c) => { const u = upgradeChoices(c); return [...(u.length ? u : [{ text: 'Nothing I wear can be improved further.', req: { fn: () => false }, reason: 'No upgrades available' }]), { text: 'Back.', next: 'hub' }]; },
    },
    forge: {
      lines: ['"My father built it. I rebuilt it. The roof has not stopped leaking since either of us."', '"There are good blades in the camps, out on the forts. If you find one, I will make it better. If you find one with a name, I will make it quieter."'],
      choices: [{ text: 'Back.', next: 'hub' }],
    },
    ...questNodes(qtext),
  },
};
