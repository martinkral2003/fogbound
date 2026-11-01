// Dialogue data index. DIALOGUES[npcKey] = { start(c)->nodeId, nodes:{id:{lines,choices,enter?,trade?,trainer?}}, qtext }.
// Conditions (cond hides a choice, req shows it disabled): {q:[id,'active|ready|done|none|failed'] , avail:id, gold:n, lvl:n, item:spec|[spec,n],
//   flag, noflag, skill, rep, stage, deliver:bool, met:bool, not:cond, any:[cond], fn:(c)=>bool} or function(c) or array (all).
// Effects: {start:id, turnin:id, abandon:id, give:def(+qty), take:spec(+qty), gold:+-n, flag, rep, xp, heal:true|n, deliver:true, say:text, trade:bool,
//   trainer:bool, jump:nodeId} or function(c) (may return a node id) or array. Choice 'next': nodeId | 'end' | 'stay'; default 'hub'.
// Ctx c = {st, a, npc, key, r (record), q(id)->state, flag(f), met, hostile}.
import maren from './dlg_maren.js';
import brannoch from './dlg_brannoch.js';
import vessa from './dlg_vessa.js';
import torvald from './dlg_torvald.js';
import hedda from './dlg_hedda.js';
import pell from './dlg_pell.js';
import roke from './dlg_roke.js';
import oswin from './dlg_oswin.js';

export const DIALOGUES = { maren, brannoch, vessa, torvald, hedda, pell, roke, oswin };
