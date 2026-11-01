// Status effects (DoT, crowd control, buffs) and regeneration.
import { clamp } from '../../util.js';
import { applyDamage } from './damage.js';
import { getStatus, perk } from './common.js';

// id: burn bleed poison (DoT, power = dps) | slow root stun | regen (hp/s) | shield (power = absorb left) | haste (power = +speed frac) | vuln (power = +dmg taken frac)
export const STATUS_INFO = {
  burn: { dtype: 'fire', dot: true }, bleed: { dtype: 'physical', dot: true, trueDmg: true }, poison: { dtype: 'poison', dot: true },
  slow: {}, root: {}, stun: {}, regen: {}, shield: {}, haste: {}, vuln: {},
};

// src (actor id) is optional: DoT kills are credited to it
export function addStatus(a, id, dur, power = 1, src = 0) {
  if (!a || !a.alive || !(dur > 0)) return null;
  if (a.type === 'king' && (id === 'stun' || id === 'root')) return null;     // the boss cannot be locked down
  if (a.type === 'king' && id === 'slow') dur *= 0.5;
  if (id === 'burn' && a.immune && a.immune.fire) return null;
  const s = a.status.find((q) => q.id === id);
  if (s) {
    s.t = Math.max(s.t, dur);
    if (id === 'shield') s.power = Math.max(s.power, power); else s.power = Math.max(s.power, power);
    if (src) s.src = src;
    return s;
  }
  const n = { id, t: dur, power, src, acc: 0 };
  a.status.push(n);
  return n;
}
export function removeStatus(a, id) { a.status = a.status.filter((s) => s.id !== id); }

export function updateStatus(st, a, dt) {
  if (a.kind === 'npc') return;
  const cs = a.cs, d = a.d || {};
  for (const s of a.status) {
    s.t -= dt;
    const inf = STATUS_INFO[s.id];
    if (inf && inf.dot) {
      s.acc = (s.acc || 0) + dt;
      if (s.acc >= 0.5 && a.alive) {
        const amt = s.power * s.acc; s.acc = 0;
        const src = s.src ? st.byId.get(s.src) : null;
        applyDamage(st, src, a, amt, { dtype: inf.dtype, source: 'dot', ignoreArmor: true });
      }
    } else if (s.id === 'regen' && a.alive) a.hp = Math.min(a.maxHp, a.hp + s.power * dt);
  }
  if (!a.alive) return;
  a.status = a.status.filter((s) => s.t > 0 && !(s.id === 'shield' && s.power <= 0));
  // regeneration. stamina is paused briefly after actions and slow while guarding/attacking
  if (cs.stamPause > 0) cs.stamPause -= dt;
  const pm = perk(st, a);
  const st0 = cs.state;
  let sm = st0 === 'idle' ? 1 : st0 === 'block' ? 0.35 : st0 === 'recover' ? 0.5 : st0 === 'stagger' ? 0.6 : 0.15;
  if (a.sprinting) sm = 0;
  if (cs.stamPause > 0) sm = 0;
  if (a.stamina < a.maxStamina && a.kind !== 'monster') {
    const base = (d.staminaRegen ?? 18) * (1 + (pm.staminaRegenPct || 0) / 100);
    // exhaustion: recovering from 0 is slower until a small reserve is back
    a.stamina = Math.min(a.maxStamina, a.stamina + base * sm * (a.stamina < 12 ? 0.7 : 1) * dt);
  } else if (a.kind === 'monster') a.stamina = a.maxStamina;
  if (st0 !== 'cast') a.mana = Math.min(a.maxMana, a.mana + (d.manaRegen ?? 2) * dt);
  if (a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + (d.hpRegen ?? 0.4) * dt * clamp(1, 0, 3));
  // summons expire
  if (a.expireAt && st.t >= a.expireAt) { a.expired = true; }
}
export { getStatus };
