// Dialogue runtime. Data lives in dialogue.js / dlg_*.js. See dialogue.js header for the node, condition and effect formats.
import { emit } from '../core.js';
import * as Items from '../items.js';
import * as Skills from '../skills.js';
import { DIALOGUES } from './dialogue.js';
import { QUESTS } from './quests.js';
import { rec, mkItem, countItems, takeItems, giveItem, npcById } from './qutil.js';
import { qstate, isAvailable, startQuest, turnIn, abandon, deliver, canDeliver, evaluate } from './q_progress.js';
import { isHostile } from './q_trade.js';
import { questChoices } from './dlg_common.js';

export function makeCtx(st, a, npc) {
  const r = rec(st, a.id);
  return { st, a, npc, key: npc.npcId, r, q: (id) => qstate(st, a, id), flag: (f) => !!r.flags[f], met: !!r.met[npc.npcId], hostile: isHostile(st, a) };
}

export function check(cond, c) {
  if (cond === undefined || cond === null || cond === true) return true;
  if (cond === false) return false;
  if (typeof cond === 'function') return !!cond(c);
  if (Array.isArray(cond)) return cond.every((x) => check(x, c));
  const { st, a, r } = c;
  for (const k of Object.keys(cond)) {
    const v = cond[k];
    switch (k) {
      case 'q': { const [id, is] = Array.isArray(v) ? v : [v, 'active|ready']; if (!is.split('|').includes(c.q(id))) return false; break; }
      case 'avail': if (!isAvailable(st, a, v)) return false; break;
      case 'gold': if (a.gold < v) return false; break;
      case 'lvl': if (a.lvl < v) return false; break;
      case 'item': { const [spec, n] = Array.isArray(v) ? v : [v, 1]; if (countItems(a, spec) < n) return false; break; }
      case 'flag': if (!r.flags[v]) return false; break;
      case 'noflag': if (r.flags[v]) return false; break;
      case 'skill': if (!(a.skills && a.skills[v] > 0)) return false; break;
      case 'rep': if (r.rep < v) return false; break;
      case 'stage': if (!(st.zone && (st.zone.stage || 0) >= v)) return false; break;
      case 'deliver': if (canDeliver(st, a, c.key) !== v) return false; break;
      case 'met': if (c.met !== v) return false; break;
      case 'not': if (check(v, c)) return false; break;
      case 'any': if (!v.some((x) => check(x, c))) return false; break;
      case 'fn': if (!v(c)) return false; break;
      default: break;
    }
  }
  return true;
}

const say = (st, a, t) => emit(st, { type: 'msg', actor: a.id, text: t });

// apply an effect (object, array or function); returns a node id if an effect asks for a jump
export function applyEffect(eff, c) {
  if (!eff) return undefined;
  if (Array.isArray(eff)) { let jump; for (const e of eff) { const j = applyEffect(e, c); if (j) jump = j; } return jump; }
  if (typeof eff === 'function') return eff(c) || undefined;
  const { st, a } = c; let jump;
  for (const k of Object.keys(eff)) {
    const v = eff[k];
    switch (k) {
      case 'start': startQuest(st, a, v); break;
      case 'turnin': if (turnIn(st, a, v) === false) say(st, a, 'That task is not finished yet.'); break;
      case 'abandon': abandon(st, a, v); break;
      case 'give': giveItem(a, mkItem(st, v, { qty: eff.qty || 1 })); break;
      case 'take': takeItems(a, v, eff.qty || 1); break;
      case 'gold': a.gold = Math.max(0, a.gold + v); break;
      case 'flag': c.r.flags[v] = true; break;
      case 'rep': c.r.rep += v; break;
      case 'xp': Skills.grantXp(st, a, v); break;
      case 'heal': a.hp = v === true ? a.maxHp : Math.min(a.maxHp, a.hp + v); if (v === true) { a.stamina = a.maxStamina; } break;
      case 'deliver': deliver(st, a, c.key); break;
      case 'say': say(st, a, v); break;
      case 'trade': if (st.dialogue) st.dialogue.trade = !!v; break;
      case 'trainer': if (st.dialogue) { st.dialogue.trainer = !!v; st.dialogue.offers = trainerOffers(c); } break;
      case 'jump': jump = v; break;
      default: break;
    }
  }
  return jump;
}

export function trainerOffers(c) {
  try { return typeof Skills.trainerOffers === 'function' ? (Skills.trainerOffers(c.npc.trainerRole || 'master', c.a) || []) : []; } catch (e) { return []; }
}

const textOf = (t, c) => (typeof t === 'function' ? t(c) : t);

function render(st, a, npc, d, nodeId) {
  const c = makeCtx(st, a, npc), node = d.nodes[nodeId];
  if (!node) { endDialogue(st, a); return; }
  if (node.enter) applyEffect(node.enter, c);
  const lines = (node.lines || []).map((l) => textOf(l, c)).filter(Boolean);
  let raw = typeof node.choices === 'function' ? node.choices(c) : node.choices || [];
  if (nodeId === 'first') raw = [...questChoices(c, npc.npcId), ...raw];
  const shown = [];
  for (const ch of raw) {
    if (!check(ch.cond, c)) continue;
    let disabled = false, reason = '';
    if (ch.req && !check(ch.req, c)) { disabled = true; reason = ch.reason || 'Requirement not met'; }
    shown.push({ ...ch, text: textOf(ch.text, c), disabled, reason });
  }
  const keepTrade = st.dialogue && st.dialogue.npcId === npc.id ? st.dialogue : null;
  st.dialogue = {
    npcId: npc.id, npcKey: npc.npcId, nodeId, name: npc.name, title: npc.title || '', lines,
    choices: shown.map((s) => ({ text: s.text, disabled: s.disabled, reason: s.reason })),
  };
  if (keepTrade && keepTrade.trade) st.dialogue.trade = true;
  if (keepTrade && keepTrade.trainer) { st.dialogue.trainer = true; st.dialogue.offers = trainerOffers(c); }
  st.dialogueInternal = { def: d, choices: shown, npcId: npc.id };
  // a node can open the trade/trainer window on entry
  if (node.trade) st.dialogue.trade = true;
  if (node.trainer) { st.dialogue.trainer = true; st.dialogue.offers = trainerOffers(c); }
}

export function startDialogue(st, a, npc) {
  if (!a || !npc || !npc.alive || a.kind !== 'player') return;
  const d = DIALOGUES[npc.npcId]; if (!d) return;
  const r = rec(st, a.id);
  // face the player
  npc.yaw = Math.atan2(a.z - npc.z, a.x - npc.x); npc.talkT = 4;
  for (const id of Object.keys(r.active)) { const q = QUESTS[id]; q.objectives.forEach((ob, i) => { if (ob.kind === 'talk' && ob.npc === npc.npcId) r.active[id].p[i] = 1; }); }
  st.dialogue = null;
  const c = makeCtx(st, a, npc);
  const first = d.start ? d.start(c) : (c.met ? 'hub' : 'first');
  r.met[npc.npcId] = true; r.flags['met_' + npc.npcId] = true;
  render(st, a, npc, d, first);
  evaluate(st, a);
}

export function dialogueChoose(st, a, idx) {
  const di = st.dialogueInternal; if (!st.dialogue || !di) return;
  const npc = st.byId.get(di.npcId); if (!npc) { endDialogue(st, a); return; }
  const ch = di.choices[idx]; if (!ch || ch.disabled) return;
  const c = makeCtx(st, a, npc);
  const jump = applyEffect(ch.effect, c);
  evaluate(st, a);
  const next = jump || ch.next || 'hub';
  if (next === 'end') { endDialogue(st, a); return; }
  if (next === 'stay') { render(st, a, npc, di.def, st.dialogue.nodeId); return; }
  render(st, a, npc, di.def, next);
}

export function endDialogue(st, a) { st.dialogue = null; st.dialogueInternal = null; }

export function dialogueTick(st) {
  if (!st.dialogue) return;
  const npc = st.byId.get(st.dialogue.npcId), p = st.player;
  if (!npc || !npc.alive || !p || !p.alive || Math.hypot(npc.x - p.x, npc.z - p.z) > 5) endDialogue(st, p);
}
export { Items };
