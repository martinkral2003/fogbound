// The ten spells (SPELLS defs for the UI), casting (state 'cast'), projectile impacts and summons.
import { emit, makeActor, recompute, removeActor } from '../core.js';
import * as Skills from '../skills.js';
import { clamp, angDiff } from '../../util.js';
import { applyDamage } from './damage.js';
import { addStatus } from './status.js';
import { isHostile, isHero, inSettlement, sideOf, atkSpeed, hasStatus } from './common.js';
import { spawnProj, aimShot, nearestHostileInCone, isBlockedPoint } from './ranged.js';

// kind: projectile | chain | beam | self | aoe | blink | summon. dmg = base before the caster's spellMul (int + perks). icon = a glyph for the UI.
export const SPELLS = {
  firebolt:   { id: 'firebolt', name: 'Firebolt', mana: 14, cd: 1.3, cast: 0.45, dtype: 'fire', kind: 'projectile', dmg: 13, speed: 28, g: 3, aoe: 1.8, hostile: true, icon: '☄', desc: 'A bolt of fire that burns and splashes.' },
  frostshard: { id: 'frostshard', name: 'Frost Shard', mana: 10, cd: 0.7, cast: 0.3, dtype: 'cold', kind: 'projectile', dmg: 13, speed: 36, g: 1.5, hostile: true, icon: '❄', desc: 'A fast shard of ice that chills its target.' },
  arc:        { id: 'arc', name: 'Arc Lightning', mana: 16, cd: 1.4, cast: 0.3, dtype: 'lightning', kind: 'chain', dmg: 15, range: 14, jumps: 3, hostile: true, icon: '↯', desc: 'Lightning that leaps between nearby enemies.' },
  venom:      { id: 'venom', name: 'Venom Dart', mana: 9, cd: 0.6, cast: 0.25, dtype: 'poison', kind: 'projectile', dmg: 6, speed: 32, g: 2, hostile: true, icon: '☠', desc: 'A dart whose poison eats away over time.' },
  mend:       { id: 'mend', name: 'Mend', mana: 22, cd: 6, cast: 0.7, dtype: 'physical', kind: 'self', heal: 45, icon: '✚', desc: 'Close your wounds.' },
  stoneskin:  { id: 'stoneskin', name: 'Stoneskin', mana: 25, cd: 20, cast: 0.5, dtype: 'physical', kind: 'self', absorb: 45, dur: 25, icon: '◆', desc: 'A shell of stone absorbs the next blows.' },
  nova:       { id: 'nova', name: 'Fire Nova', mana: 30, cd: 8, cast: 0.6, dtype: 'fire', kind: 'aoe', dmg: 24, aoe: 5.5, knock: 7, hostile: true, icon: '✵', desc: 'A burst of flame around you that hurls enemies back.' },
  blink:      { id: 'blink', name: 'Blink', mana: 14, cd: 5, cast: 0.12, dtype: 'physical', kind: 'blink', range: 9, icon: '⇝', desc: 'Step through the fog a few metres ahead.' },
  bonewarden: { id: 'bonewarden', name: 'Bone Warden', mana: 40, cd: 25, cast: 0.9, dtype: 'physical', kind: 'summon', life: 40, icon: '☠', desc: 'Raise a skeleton ally for 40 seconds.' },
  drain:      { id: 'drain', name: 'Life Drain', mana: 20, cd: 3, cast: 0.4, dtype: 'poison', kind: 'beam', dmg: 16, range: 9, leech: 0.8, hostile: true, icon: '❦', desc: 'Tear life from an enemy and keep it.' },
};

const spellDmg = (st, a, sp) => sp.dmg * ((a.d && a.d.spellMul) || 1);
const say = (st, a, text) => { if (a.kind === 'player') emit(st, { type: 'msg', actor: a.id, text }); };

// aim: {yaw,pitch,lockId,scroll} (all optional). Returns true when the cast starts.
export function castSpell(st, a, spellId, aim) {
  const sp = SPELLS[spellId];
  if (!sp || !a.alive) return false;
  const cs = a.cs, free = !!(aim && aim.scroll);
  if (cs.state !== 'idle' && cs.state !== 'block' && !(cs.state === 'recover' && cs.t > (cs.dur || 0.3) * 0.6)) return false;
  if (hasStatus(a, 'stun')) return false;
  if (isHero(a) && !free) {
    const known = typeof Skills.knownSpells === 'function' ? Skills.knownSpells(a) : null;
    if (Array.isArray(known) && known.length && !known.includes(spellId)) { say(st, a, 'You do not know ' + sp.name + '.'); return false; }
  }
  if (a.spellCd && a.spellCd[spellId] > st.t) return false;
  if (a.mana < sp.mana) { say(st, a, 'Not enough mana.'); return false; }
  if (sp.hostile && isHero(a) && st.settlement && st.settlement.safe && inSettlement(st, a.x, a.z)) { say(st, a, 'Violence is forbidden here.'); return false; }
  a.mana -= sp.mana;
  (a.spellCd || (a.spellCd = {}))[spellId] = st.t + sp.cd;
  const dur = sp.cast / atkSpeed(st, a);
  cs.state = 'cast'; cs.t = 0; cs.dur = dur; cs.kind = 'cast'; cs.blocking = false; cs.charging = false; cs.move = null; cs.hitSet = null;
  cs.spell = { id: spellId, aim: aim || null };
  emit(st, { type: 'swing', actor: a.id, kind: 'cast', spell: spellId, windup: dur, telegraph: true });
  return true;
}

// called by updateCombat when the cast time has elapsed
export function finishCast(st, a) {
  const cs = a.cs, info = cs.spell, sp = info && SPELLS[info.id];
  cs.spell = null; cs.state = 'recover'; cs.t = 0; cs.dur = 0.2; cs.move = { windup: 0, active: 0, recover: 0.2, noHit: true };
  if (!sp) return;
  const aim = info.aim || {}, dmg = spellDmg(st, a, sp);
  const tgt = pickTarget(st, a, sp.range || 30, aim.lockId ?? cs.lock);
  emit(st, { type: 'cast', actor: a.id, spell: sp.id, x: a.x, z: a.z, dtype: sp.dtype });
  switch (sp.kind) {
    case 'projectile': {
      const s = aimShot(st, a, sp.speed, sp.g, tgt), c = Math.cos(s.pitch);
      spawnProj(st, {
        kind: 'spell', spell: sp.id, owner: a.id, side: sideOf(st, a), x: s.ox, y: s.oy, z: s.oz,
        vx: Math.cos(s.yaw) * c * sp.speed, vy: Math.sin(s.pitch) * sp.speed, vz: Math.sin(s.yaw) * c * sp.speed, g: sp.g, r: 0.45, life: 3, dmg, dtype: sp.dtype, aoe: sp.aoe || 0,
        color: { fire: 0xff8a30, cold: 0x7fd0ff, poison: 0x8be04a }[sp.dtype] || 0xffffff,
      });
      break;
    }
    case 'chain': chainLightning(st, a, sp, dmg, tgt); break;
    case 'beam': {
      if (!tgt) break;
      const dealt = applyDamage(st, a, tgt, dmg, { dtype: sp.dtype, source: 'spell', blockable: false, leech: sp.leech });
      emit(st, { type: 'cast', actor: a.id, spell: 'drain-beam', x: tgt.x, z: tgt.z, tgt: tgt.id, amt: dealt });
      break;
    }
    case 'self':
      if (sp.id === 'mend') { a.hp = Math.min(a.maxHp, a.hp + sp.heal * ((a.d && a.d.spellMul) || 1)); }
      else addStatus(a, 'shield', sp.dur, sp.absorb * ((a.d && a.d.spellMul) || 1));
      break;
    case 'aoe': {
      for (const b of st.actors) {
        if (!isHostile(st, a, b)) continue;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d > sp.aoe + b.radius) continue;
        const dealt = applyDamage(st, a, b, dmg * (1 - 0.35 * d / sp.aoe), { dtype: sp.dtype, source: 'spell', knock: sp.knock, poise: 20, fromX: a.x, fromZ: a.z });
        if (dealt > 0 && b.alive) addStatus(b, 'burn', 3, Math.max(2, dmg * 0.12), a.id);
      }
      emit(st, { type: 'sfx', name: 'nova', x: a.x, z: a.z, r: sp.aoe });
      break;
    }
    case 'blink': doBlink(st, a, sp, aim); break;
    case 'summon': summonSkeletons(st, a, 1, { life: sp.life }); break;
    default: break;
  }
}

function pickTarget(st, a, range, lockId) {
  const lock = lockId ? st.byId.get(lockId) : null;
  if (lock && lock.alive && isHostile(st, a, lock) && Math.hypot(lock.x - a.x, lock.z - a.z) <= range + 4) return lock;
  return nearestHostileInCone(st, a, range, a.kind === 'player' ? 0.3 : 0.6);
}

function chainLightning(st, a, sp, dmg, first) {
  const path = [{ x: a.x, z: a.z }];
  let cur = first;
  if (!cur) { path.push({ x: a.x + Math.cos(a.yaw) * 6, z: a.z + Math.sin(a.yaw) * 6 }); emit(st, { type: 'cast', actor: a.id, spell: 'arc-chain', path }); return; }
  const hit = new Set();
  let mul = 1;
  for (let i = 0; i <= sp.jumps && cur; i++) {
    hit.add(cur.id); path.push({ x: cur.x, z: cur.z });
    const dealt = applyDamage(st, a, cur, dmg * mul, { dtype: sp.dtype, source: 'spell', blockable: false, poise: 8 });
    if (dealt > 0 && cur.alive && st.rng() < 0.2) addStatus(cur, 'stun', 0.5, 1, a.id);
    mul *= 0.75;
    let best = null, bd = 8;
    for (const b of st.actors) {
      if (hit.has(b.id) || !isHostile(st, a, b)) continue;
      const d = Math.hypot(b.x - cur.x, b.z - cur.z);
      if (d < bd) { bd = d; best = b; }
    }
    cur = best;
  }
  emit(st, { type: 'cast', actor: a.id, spell: 'arc-chain', path });
}

function doBlink(st, a, sp, aim) {
  const w = st.world, yaw = aim.yaw ?? a.yaw, ox = a.x, oz = a.z;
  for (let d = sp.range; d >= 1; d -= 1) {
    const x = ox + Math.cos(yaw) * d, z = oz + Math.sin(yaw) * d;
    if (!w.walkable(x, z) || isBlockedPoint(st, x, z, a.radius)) continue;
    if (w.heightAt(x, z) > a.y + 2.2) continue;
    a.x = x; a.z = z; a.y = w.heightAt(x, z); a.vx = 0; a.vz = 0;
    a.cs.inv = Math.max(a.cs.inv, st.t + 0.25);
    emit(st, { type: 'sfx', name: 'blink', x: ox, z: oz, tx: x, tz: z });
    return true;
  }
  return false;
}

// ---- impacts of spell projectiles (called from ranged.stepProjectiles)
export function projHit(st, p, tgt, src) {
  const sp = SPELLS[p.spell];
  if (!sp) return;
  const onHit = (b, mul) => {
    const dealt = applyDamage(st, src, b, p.dmg * mul, { dtype: p.dtype, source: mul === 1 ? 'proj' : 'spell', poise: 8, fromX: p.x - p.vx * 0.1, fromZ: p.z - p.vz * 0.1 });
    if (!(dealt > 0) || !b.alive) return;
    if (sp.id === 'firebolt') addStatus(b, 'burn', 3, Math.max(2, p.dmg * 0.1), p.owner);
    else if (sp.id === 'frostshard') addStatus(b, 'slow', 2.5, 1, p.owner);
    else if (sp.id === 'venom') addStatus(b, 'poison', 6, 4 + p.dmg * 0.35, p.owner);
  };
  if (tgt) onHit(tgt, 1);
  if (p.aoe) {
    for (const b of st.actors) {
      if (b === tgt || !b.alive || (src ? !isHostile(st, src, b) : sideOf(st, b) === p.side)) continue;
      if (Math.hypot(b.x - p.x, b.z - p.z) <= p.aoe + b.radius) onHit(b, 0.55);
    }
    emit(st, { type: 'sfx', name: 'explode', x: p.x, z: p.z, r: p.aoe });
  }
}

// ---- summons (Bone Warden for heroes, Drowned King adds for the boss). Allies carry owner = hero id and expire.
export function summonSkeletons(st, owner, n, o = {}) {
  const hero = isHero(owner);
  if (hero) {
    const mine = st.actors.filter((q) => q.alive && q.owner === owner.id && q.summoned);
    while (mine.length + n > 2 && mine.length) removeActor(st, mine.shift());
  }
  else if (st.actors.filter((q) => q.alive && q.summoner === owner.id).length >= 6) return;
  const w = st.world;
  for (let i = 0; i < n; i++) {
    let x = owner.x, z = owner.z;
    for (let k = 0; k < 8; k++) {
      const ang = owner.yaw + (st.rng() - 0.5) * 3 + (i - (n - 1) / 2) * 1.2, r = 2.2 + st.rng() * 1.2;
      const tx = owner.x + Math.cos(ang) * r, tz = owner.z + Math.sin(ang) * r;
      if (w.walkable(tx, tz) && !isBlockedPoint(st, tx, tz, 0.5)) { x = tx; z = tz; break; }
    }
    const lvl = hero ? Math.max(1, owner.lvl) : Math.max(1, owner.lvl - 1);
    const m = makeActor(st, {
      kind: 'monster', type: 'skeleton', name: hero ? 'Bone Warden' : 'Risen Skeleton', model: 'skeleton', x, z, yaw: owner.yaw, lvl, radius: 0.6, team: owner.team,
      extra: { owner: hero ? owner.id : 0, summoned: true, summoner: owner.id, expireAt: st.t + (o.life || 40), noLoot: true, ai: owner.kind === 'monster' ? null : undefined },
    });
    m.attrs.vit = 6 + Math.round(lvl * 0.8); m.attrs.str = 10 + Math.round(lvl * 0.5);
    recompute(st, m, true);
    emit(st, { type: 'sfx', name: 'summon', x, z });
  }
}
export { clamp, angDiff };
