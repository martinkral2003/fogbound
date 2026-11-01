// Skill aiming for the human hero (HERO lane). controls.js attaches this to its controls object:
//   key down  = start aiming: the skill's shape follows the cursor on the ground (circle / cone / line / dash path / wall), see aim_view.js
//   key up    = fire (after a hold of 0.18 s or more; the hold length is sent as input.hold[slot] for charge-and-release skills)
//   a quick tap (< 0.18 s) keeps the aim "sticky": LMB or pressing the same key again fires, RMB or Esc cancels
//   controls.quickCast = true  -> every skill fires instantly at the cursor like before (no aiming)
// Skills that simply happen around you (aim 'self' without a hold) always fire instantly.
import { SKILLS } from './data.js';
import { modSkill } from './perks.js';
import { skillShape, holdScaled, holdFactor, isAimed, AIM } from './skillaim.js';

export const TAP_TIME = 0.18;

export function createAiming(game, c, keys, m) {
  const st = game.st;
  const a = { slot: -1, code: '', t: 0, sticky: false, swallow: false };
  const team = () => st.teams[game.local];
  const skillOf = (slot) => { const k = team().kit; const id = slot >= 0 && slot < 3 && k ? k.slots[slot] : null; return id ? SKILLS[id] : null; }; // Q W E only: slot 3 (R) is the charged ultimate (input.charge)
  const uiBusy = () => !!(game.ui && game.ui.v3 && game.ui.v3.open);

  function end() { a.slot = -1; a.sticky = false; AIM.cur = null; }
  function cancel() { end(); }
  function fire() {
    const slot = a.slot, s0 = skillOf(slot), tm = team(), h = tm.hero;
    if (s0 && h.alive) {
      const s = modSkill(tm, s0, h), hold = a.sticky ? 0 : Math.min(a.t, s.hold ? s.hold.max : 0);
      c.input.casts.push(slot);
      if (hold > 0) (c.input.hold || (c.input.hold = {}))[slot] = hold;
    }
    a.swallow = m.l; // the click that fired must not also start a basic attack
    end();
  }

  // a skill key went down (controls.js digit handler)
  c.skillKey = function (n, code) {
    const tm = team(), h = tm.hero, s0 = skillOf(n);
    if (!h.alive || !s0) return;
    if (c.quickCast || !isAimed(s0)) { c.input.casts.push(n); return; }
    if ((tm.cd[s0.id] || 0) > 0) { c.input.casts.push(n); return; } // sim ignores it; keeps the cooldown feedback the same as before
    if (a.slot === n) { fire(); return; } // second press while sticky = confirm
    a.slot = n; a.code = code; a.t = 0; a.sticky = false;
  };
  // mouse click while aiming: LMB fires, RMB cancels. Returns true when the click was consumed.
  c.aimInput = function (b) {
    if (a.slot < 0) return false;
    if (b === 'l') fire(); else cancel();
    return true;
  };
  c.aimCancel = cancel;

  // once per frame at the end of controls.update
  c.updateAim = function (dt) {
    if (a.swallow && !m.l) a.swallow = false;
    c.aimBusy = a.slot >= 0 || a.swallow;
    if (a.slot < 0) return;
    const tm = team(), h = tm.hero, s0 = skillOf(a.slot);
    if (!h.alive || !s0 || uiBusy() || c.buildMode || c.demolish || (tm.cd[s0.id] || 0) > 0.05 && a.t > 0.3) { cancel(); c.aimBusy = a.swallow; return; }
    a.t += dt;
    if (!a.sticky && !keys.has(a.code)) { // key released
      if (a.t < TAP_TIME) a.sticky = true; else { fire(); c.aimBusy = a.swallow; return; }
    }
    if (!c.aim) return;
    const holdT = a.sticky ? 0 : a.t;
    const base = modSkill(tm, s0, h);
    const shape = skillShape(holdScaled(base, holdT), h, c.aim.x, c.aim.z);
    shape.ok = (tm.cd[s0.id] || 0) <= 0;
    shape.color = s0.color || tm.f.color;
    shape.sticky = a.sticky;
    if (s0.hold) { shape.hold = holdFactor(s0, holdT); shape.max = skillShape(holdScaled(base, s0.hold.max), h, c.aim.x, c.aim.z); } else shape.hold = -1;
    AIM.cur = shape;
  };
  c.aimBusy = false;
  c.aimState = a;
  return a;
}
