// v3 lane module "dungeons" (WORLD CONTENT lane): see src/V3.md.
// st.dungeons[] = { ...site {id,x,z,tier,theme,quadrant}, r, name, state:'locked'|'open'|'cleared', by:-1..3, bonusKind, camps:[campIds], bossCamp, bossId, disc:[bool x4], bossPos }.
// 'locked' = nobody has found it yet, 'open' = discovered, 'cleared' = every monster (and the boss) dead; the clearing team gets a PERMANENT bonus in team.bonus[kind]
// (see DUNGEON.bonus in data.js), gold, XP and legendary loot. Cleared dungeons never respawn. Heroes are not teleported: the complex is open-air.
// Exports for other lanes: bonusOf(team, kind), BONUS_TEXT(kind, tier), plus the usual hooks.
import { simApi } from './sim.js';
import * as orbs from './pots.js'; // v5: potion rewards for a cleared dungeon (orbs/books are gone)
import { DUNGEON, TIER_MUL } from './data.js';
import { clamp, anyTeamWithin, grantXP, addResearch, dropLegendary, walkableNear, makeCamp, bossFlavor, msg } from './wc_util.js';

const TAU = Math.PI * 2, ARM_DIST = 60; // monsters spawn when a unit comes within radius + ARM_DIST

export const bonusOf = (team, kind) => (team && team.bonus && team.bonus[kind]) || 0;
export function bonusText(kind, tier) {
  const b = DUNGEON.bonus[kind]; if (!b) return '';
  return b.text.replace('{v}', String(b.v[clamp(tier, 1, 3)]));
}

export function init(st) {
  for (const t of st.teams) t.bonus = t.bonus || {};
  st.dungeons = [];
  const seen = {};
  for (const s of (st.world.sites && st.world.sites.dungeons) || []) {
    const tier = clamp(s.tier | 0 || 1, 1, 3), th = DUNGEON.themes[s.theme] || DUNGEON.themes.crypt;
    const key = s.quadrant + '|' + s.theme, idx = (seen[key] = (seen[key] ?? -1) + 1);
    const d = Object.assign({}, s, {
      tier, theme: DUNGEON.themes[s.theme] ? s.theme : 'crypt', r: s.r || DUNGEON.radius[tier], name: th.name, state: 'locked', by: -1,
      bonusKind: th.kinds[(((st.seed | 0) >>> 0) + idx) % th.kinds.length], camps: [], bossCamp: -1, bossId: 0, disc: [false, false, false, false], bossPos: { x: s.x, z: s.z }, left: 0,
    });
    spawnDungeon(st, d, th);
    st.dungeons.push(d);
  }
  st.dunT = 0;
}

// layout only (camp records exist from the start); the monsters spawn lazily when somebody comes near (armDungeon) to keep the sim cheap
function spawnDungeon(st, d, th) {
  const tier = d.tier, rf = () => st.rng(), mix = th.mix[tier];
  const nC = DUNGEON.camps[tier], size = DUNGEON.campSize[tier], a0 = rf() * TAU;
  for (let i = 0; i < nC; i++) {
    const a = a0 + (i / nC) * TAU, [cx, cz] = walkableNear(st, d.x + Math.cos(a) * d.r * 0.6, d.z + Math.sin(a) * d.r * 0.6);
    const types = []; for (let k = 0; k < size; k++) types.push(mix[(k + i) % mix.length]);
    d.camps.push(makeCamp(st, cx, cz, tier, types, { dun: d.id }).id);
  }
  const [bx, bz] = walkableNear(st, d.x, d.z);
  d.bossCamp = makeCamp(st, bx, bz, tier, [], { dun: d.id, boss: true }).id; d.camps.push(d.bossCamp); d.bossPos = { x: bx, z: bz };
  d.armed = false;
}

function armDungeon(st, d) {
  const api = simApi, th = DUNGEON.themes[d.theme], tier = d.tier, rf = () => st.rng(), mix = th.mix[tier];
  d.armed = true;
  for (const id of d.camps) {
    const camp = st.camps[id];
    if (id === d.bossCamp) continue;
    api.spawnCamp(st, camp);
    for (const e of st.ents) if (e.camp === id) e.dun = d.id;
  }
  const lair = st.camps[d.bossCamp], bx = lair.x, bz = lair.z, bo = th.boss, isKing = bo.key === 'king';
  const boss = api.spawnMonster(st, bo.key, isKing ? 2 : tier, bx, bz, lair);
  boss.dun = d.id; boss.dunBoss = true; d.bossId = boss.id;
  if (!isKing) bossFlavor(boss, { title: bo.title, hp: DUNGEON.bossHp[tier], dmg: DUNGEON.bossDmg[tier], affixes: bo.affixes, scale: bo.scale || DUNGEON.bossScale });
  const g = DUNGEON.guards[tier];
  for (let k = 0; k < g; k++) {
    const a = (k / g) * TAU + rf(), [gx, gz] = walkableNear(st, bx + Math.cos(a) * 5.5, bz + Math.sin(a) * 5.5);
    api.spawnMonster(st, mix[k % mix.length], tier, gx, gz, lair).dun = d.id;
  }
  d.total = d.camps.reduce((n, id) => n + st.camps[id].mons, 0);
  d.left = d.total;
}

export function update(st, dt) {
  st.dunT -= dt;
  const slow = st.dunT <= 0;
  if (slow) st.dunT = 0.5;
  if (slow) {
    for (const d of st.dungeons) {
      if (d.state === 'cleared') continue;
      if (!d.armed) { if (anyTeamWithin(st, d.x, d.z, d.r + ARM_DIST)) armDungeon(st, d); else { discover(st, d); continue; } }
      let left = 0; for (const id of d.camps) left += st.camps[id].mons;
      d.left = left;
      discover(st, d);
      const boss = st.byId.get(d.bossId);
      if (boss && boss.alive) { d.bossPos.x = boss.x; d.bossPos.z = boss.z; }
      if (d.armed && left <= 0 && !(boss && boss.alive)) clearDungeon(st, d);
    }
    regenTick(st, 0.5);
  }
  // permanent income bonus (fractional gold is banked by team.dunAcc and paid out in whole coins)
  for (const t of st.teams) {
    const inc = t.alive && t.bonus ? t.bonus.income : 0;
    if (!inc) continue;
    t.dunAcc = (t.dunAcc || 0) + inc * dt;
    if (t.dunAcc >= 1) { const g = Math.floor(t.dunAcc); t.gold += g; t.dunAcc -= g; }
  }
}

function discover(st, d) {
  // discovery: any unit of a team inside radius + margin
  const rr = d.r + DUNGEON.discover;
  for (const t of st.teams) {
    if (!t.alive || d.disc[t.id]) continue;
    let hit = t.hero && t.hero.alive && Math.hypot(t.hero.x - d.x, t.hero.z - d.z) < rr;
    if (!hit) for (const e of st.ents) if (e.alive && e.kind === 'unit' && e.team === t.id && Math.hypot(e.x - d.x, e.z - d.z) < rr) { hit = true; break; }
    if (!hit) continue;
    d.disc[t.id] = true;
    simApi.ev(st, { type: 'discover', kind: 'dungeon', id: d.id, team: t.id, x: d.x, z: d.z });
    if (d.state === 'locked') {
      d.state = 'open';
      if (t.human) msg(st, `You found the ${d.name}: ${bonusText(d.bonusKind, d.tier)} for whoever clears it.`, 'info', t.id);
    }
  }
}

function regenTick(st, dt) {
  for (const t of st.teams) {
    const rg = t.alive && t.bonus ? t.bonus.regen : 0;
    if (!rg || !t.heart) continue;
    const f = rg / 100 * dt;
    for (const e of st.ents) {
      if (!e.alive || e.team !== t.id || (e.kind !== 'unit' && e.kind !== 'hero') || e.hp >= e.maxHp) continue;
      if (Math.hypot(e.x - t.heart.x, e.z - t.heart.z) < 40) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * f);
    }
  }
}

function clearDungeon(st, d) {
  d.state = 'cleared';
  // credit: whoever killed the boss, else whoever last hurt a dungeon monster
  let by = d.by;
  if (by < 0) by = d.lastTeam ?? -1;
  d.by = by;
  const p = d.bossPos;
  simApi.ev(st, { type: 'dungeonCleared', id: d.id, team: by, x: d.x, z: d.z, kind: d.bonusKind });
  if (by < 0) { msg(st, `The ${d.name} has been cleared, but no one claimed its prize.`, 'info'); return; }
  const t = st.teams[by], tier = d.tier, b = DUNGEON.bonus[d.bonusKind], v = b.v[tier];
  t.bonus = t.bonus || {};
  if (d.bonusKind === 'research') addResearch(st, by, v);
  else t.bonus[d.bonusKind] = (t.bonus[d.bonusKind] || 0) + v;
  t.bonusLog = t.bonusLog || [];
  t.bonusLog.push({ dungeon: d.id, kind: d.bonusKind, v, tier });
  t.gold += DUNGEON.gold[tier];
  simApi.ev(st, { type: 'gold', x: p.x, z: p.z, amt: DUNGEON.gold[tier], team: by });
  for (let i = 0; i < DUNGEON.legendary[tier]; i++) dropLegendary(st, p.x, p.z);
  if (typeof orbs.dungeonReward === 'function') orbs.dungeonReward(st, by, d);
  grantXP(st, by, DUNGEON.xp[tier], 'dungeon', p.x, p.z);
  msg(st, `The ${d.name} has been cleared by ${t.f.title}: ${b.name} (${bonusText(d.bonusKind, tier)}).`, 'big');
}

export function onDamage(st, src, t, amt) {
  if (!src) return amt;
  // remember who is hurting dungeon monsters (credit if the kill itself comes from a DoT or a monster)
  if (t.kind === 'mon' && t.dun !== undefined && src.team >= 0) {
    const d = dunById(st, t.dun); if (d) d.lastTeam = src.team;
  }
  const sTeam = src.team >= 0 ? st.teams[src.team] : null;
  if (sTeam && sTeam.bonus) {
    const b = sTeam.bonus;
    if (b.towerDmg || b.servDmg || b.heroDmg) {
      const se = src.kind && src.kind !== 'timer' ? src : st.byId.get(src.id);
      if (se) {
        if (se.kind === 'bld' && b.towerDmg) amt *= 1 + b.towerDmg / 100;
        else if (se.kind === 'unit' && b.servDmg) amt *= 1 + b.servDmg / 100;
        else if (se.kind === 'hero' && b.heroDmg) amt *= 1 + b.heroDmg / 100;
      }
    }
  }
  if (t.kind === 'hero' && t.team >= 0) {
    const tb = st.teams[t.team].bonus;
    if (tb && tb.heroHp) amt *= Math.max(0.3, 1 - tb.heroHp / 100);
  }
  return amt;
}

export function onKill(st, t, src) {
  if (t.kind !== 'mon' || t.dun === undefined) return;
  const d = dunById(st, t.dun);
  if (!d) return;
  const team = src && src.team >= 0 ? src.team : (d.lastTeam ?? -1);
  if (t.dunBoss) {
    d.by = team;
    simApi.ev(st, { type: 'msg', text: `${t.title || 'The guardian'} of the ${d.name} has fallen!`, kind: 'big' });
  }
}

function dunById(st, id) {
  for (const d of st.dungeons) if (d.id === id) return d;
  return null;
}

export function command() { return false; }
