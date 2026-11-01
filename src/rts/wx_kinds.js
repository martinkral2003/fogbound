// WORLD lane: per-kind site logic (capture, income, levies, raids, graveyards, altars, ley lines, beacons, thrones) + commands.
import { emit } from './core.js';
import { TIMES, RELICS } from './world_data.js';
import { spawnN, grant, canPay, pay, announce, unitsNear, killQuiet, dropLoot, wx } from './neutrals.js';
import * as K2 from './wx_kinds2.js';

const CAPTURABLE = new Set(['village', 'graveyard', 'altar', 'leyline', 'beacon', 'throne']);
const CAP_TIME = { village: 8, graveyard: 7, altar: 7, leyline: 6, beacon: 5, throne: 20 };
const key = (st, team) => (st.teams[team] ? st.teams[team].faction.key : '');
export const sites = (st, kind) => st.neutral.filter((s) => s.kind === kind);
export function guardsAlive(st, s) { let n = 0; for (const id of s.guards) { const u = st.byId.get(id); if (u && u.alive) n++; } return n; }
export function presence(st, s, r = s.r) {
  const r2 = r * r; let team = -1, n = 0, multi = false;
  for (const e of st.ents) {
    if (!e.alive || e.team < 0 || e.role === 'worker' || e.garrison) continue;
    if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 > r2) continue;
    if (team === -1) { team = e.team; n = 1; } else if (team === e.team) n++; else multi = true;
  }
  return { team, n, multi };
}
export function init(st) { wx(st).vision = [[], [], [], []]; rebuildVision(st); }

function rebuildVision(st) {
  const v = wx(st).vision;
  for (let i = 0; i < 4; i++) v[i].length = 0;
  for (const s of st.neutral) {
    if (s.owner < 0) continue;
    if (s.kind === 'beacon') v[s.owner].push({ x: s.x, z: s.z, r: 62, kind: 'beacon' });
    else if (s.kind === 'village' && s.state !== 'burned') v[s.owner].push({ x: s.x, z: s.z, r: 28, kind: 'village' });
    else if (s.kind === 'leyline') v[s.owner].push({ x: s.x, z: s.z, r: 16, kind: 'leyline' });
  }
  for (const t of st.teams) t.worldVision = v[t.id];
}
function captured(st, s, team) {
  s.owner = team; s.cap = { team: -1, p: 0 }; s.capturedAt = st.t;
  if (s.kind === 'village') { s.levyT = Math.min(s.levyT, 30); }
  emit(st, { type: 'neutral', what: 'capture', id: s.id, kind: s.kind, team, x: s.x, z: s.z });
  announce(st, `${st.teams[team].faction.name} took ${s.name}.`, team);
  rebuildVision(st);
}
function captureStep(st, s, dt) {
  if (s.state === 'burned' || s.allied && s.owner >= 0) return;
  const pr = presence(st, s);
  if (guardsAlive(st, s) > 0 || pr.multi || pr.team < 0 || s.raidBy === pr.team) { if (pr.team < 0 && s.cap.p > 0) s.cap.p = Math.max(0, s.cap.p - 0.04 * dt); return; }
  if (s.owner === pr.team) return;
  if (s.cap.team !== pr.team) s.cap = { team: pr.team, p: 0 };
  const need = (CAP_TIME[s.kind] || 8) * (s.owner >= 0 ? 1.5 : 1);
  s.cap.p += dt / need * (1 + 0.12 * (pr.n - 1));
  if (s.cap.p >= 1) captured(st, s, pr.team);
}

function villageStep(st, s, dt) {
  if (s.state === 'burned') return;
  // raid / burn
  if (s.raidBy != null) {
    const raiders = unitsNear(st, s.x, s.z, s.r, (e) => e.team === s.raidBy && e.role !== 'worker');
    const def = s.owner >= 0 && s.owner !== s.raidBy ? unitsNear(st, s.x, s.z, s.r * 1.3, (e) => e.team === s.owner && e.role !== 'worker').length : 0;
    if (!raiders.length) s.raidBy = null;
    else if (!def && guardsAlive(st, s) === 0) {
      const take = Math.min(6 * dt, s.stock.gold + s.stock.blood);
      const g = Math.min(s.stock.gold, take * 0.6), b = Math.min(s.stock.blood, take - g);
      s.stock.gold -= g; s.stock.blood -= b; grant(st, s.raidBy, 'gold', g); grant(st, s.raidBy, 'blood', b);
      s.burn += dt / 25; s.prosperity = Math.max(0, 1 - s.burn);
      if (s.burn >= 1) {
        s.state = 'burned'; const o = s.owner; s.owner = -1; s.allied = false; s.raidBy = null;
        emit(st, { type: 'fire', x: s.x, z: s.z }); emit(st, { type: 'neutral', what: 'burned', id: s.id, x: s.x, z: s.z });
        announce(st, `${s.name} burns!`, o >= 0 ? o : undefined); rebuildVision(st); return;
      }
    }
  }
  if (s.owner < 0) return;
  const k = TIMES.village, m = (s.allied ? 1.2 : 1) * s.prosperity;
  grant(st, s.owner, 'gold', k.income.gold * m * dt); grant(st, s.owner, 'blood', k.income.blood * m * dt);
  if (s.stock.gold < 140) s.stock.gold += 0.15 * dt;
  s.levyT = Math.max(0, s.levyT - dt); s.levyReady = s.levyT <= 0;
}

function graveStep(st, s, dt) {
  if (s.owner >= 0) {
    const necro = key(st, s.owner) === 'necro', t = st.teams[s.owner];
    grant(st, s.owner, 'souls', (necro ? 0.6 : 0.35) * dt);
    if (necro) t.mana = Math.min(t.manaMax, t.mana + 0.6 * dt);
  }
  const night = st.time && st.time.night;
  s.skel = s.skel.filter((id) => { const u = st.byId.get(id); return u && u.alive; });
  if (!night) { for (const id of s.skel) { const u = st.byId.get(id); if (u) killQuiet(st, u); } s.skel = []; s.spawnT = 0; return; }
  s.spawnT = (s.spawnT || 0) + dt;
  const necro = s.owner >= 0 && key(st, s.owner) === 'necro';
  if (s.spawnT < (necro ? 10 : 22)) return;
  s.spawnT = 0;
  const px = s.x + (st.rng() - 0.5) * 8, pz = s.z + (st.rng() - 0.5) * 8;
  if (s.owner >= 0) {
    if (s.skel.length >= (necro ? 5 : 3) || !st.teams[s.owner].alive) return;
    const u = spawnN(st, 'wx_bound', s.owner, px, pz, {}); if (u) { u.bound = true; s.skel.push(u.id); }
  } else if (s.skel.length < 3) { const u = spawnN(st, 'wx_zombie', -1, px, pz, { site: s.id }); if (u) s.skel.push(u.id); }
}

function leyStep(st, s, dt) {
  if (s.owner < 0) return;
  const t = st.teams[s.owner];
  if (st.wxDirectMana) t.mana = Math.min(t.manaMax, t.mana + 1.2 * dt); // Magic lane reads held ley lines itself
  for (const b of st.blds) if (b.team === s.owner && b.state !== 'ruin' && /magic|spire|sanctum/.test(b.type) && (b.x - s.x) ** 2 + (b.z - s.z) ** 2 < 24 * 24) b.leyBonus = 1.25;
}
function beaconStep(st, s, dt) {
  if (s.owner < 0) return;
  s.alertT = Math.max(0, (s.alertT || 0) - dt);
  if (s.alertT > 0) return;
  const e = unitsNear(st, s.x, s.z, 62, (u) => u.team >= 0 && u.team !== s.owner && u.role !== 'worker')[0];
  if (e) { s.alertT = 12; emit(st, { type: 'alert', team: s.owner, what: 'beacon', x: e.x, z: e.z }); }
}
function throneStep(st, s, dt) {
  if (s.owner < 0) return;
  s.relicT += dt;
  if (s.relicT >= 360) { s.relicT = 0; const ids = ['ashbanner', 'bloodring', 'ironheart', 'nightcrown', 'soulphial']; dropLoot(st, s.x + 2, s.z + 2, { relic: ids[Math.floor(st.rng() * ids.length)] }); announce(st, `The ${s.name} yields a relic.`, s.owner); }
}

export function slow(st, dt) {
  relicIncome(st, dt); aiHelp(st, dt);
  for (const b of st.blds) if (b.leyBonus && b.state === 'ruin') b.leyBonus = 0;
  for (const s of st.neutral) {
    if (s.kind === 'pickup') continue;
    if (CAPTURABLE.has(s.kind)) captureStep(st, s, dt);
    switch (s.kind) {
      case 'village': villageStep(st, s, dt); break;
      case 'graveyard': graveStep(st, s, dt); break;
      case 'altar': if (s.owner >= 0) grant(st, s.owner, 'blood', 0.35 * dt); s.rite = Math.max(0, s.rite - dt); break;
      case 'leyline': leyStep(st, s, dt); break;
      case 'beacon': beaconStep(st, s, dt); break;
      case 'throne': throneStep(st, s, dt); break;
      default: K2.step(st, s, dt);
    }
  }
}

function relicIncome(st, dt) {
  for (const id of wx(st).carriers) {
    const c = st.byId.get(id);
    if (!c || !c.alive || !c.relics || c.team < 0) continue;
    const t = st.teams[c.team];
    for (const r of c.relics) { const d = RELICS[r]; if (!d) continue; if (d.mana) t.mana = Math.min(t.manaMax, t.mana + d.mana * dt); if (d.souls) grant(st, c.team, 'souls', d.souls * dt); }
  }
}
// light help so AI lords use sites (AI lane may do better): ally/levy/hire when rich and a unit is near
function aiHelp(st, dt) {
  const w = wx(st); w.aiT = (w.aiT || 0) + dt;
  if (w.aiT < 10) return; w.aiT = 0;
  for (const t of st.teams) {
    if (!t.alive || !t.ai) continue;
    for (const s of st.neutral) {
      if (s.kind === 'village' && s.owner === -1 && s.state !== 'burned' && t.res.gold > 450 && (s.x - t.base.x) ** 2 + (s.z - t.base.z) ** 2 < 120 * 120) command(st, t.id, { t: 'allyVillage', site: s.id });
      else if (s.kind === 'village' && s.owner === t.id && s.levyReady && t.res.gold > 300) command(st, t.id, { t: 'levy', site: s.id });
      else if (s.kind === 'mercs' && t.res.gold > 700 && unitsNear(st, s.x, s.z, s.r + 14, (e) => e.team === t.id).length) command(st, t.id, { t: 'hireMerc', camp: s.id, unit: 'wx_merc_knight' });
    }
  }
}

// ---- commands
export function command(st, teamId, cmd) {
  const t = st.teams[teamId], s = cmd.site != null ? st.byId.get(cmd.site) : cmd.camp != null ? st.byId.get(cmd.camp) : null;
  switch (cmd.t) {
    case 'allyVillage': {
      if (!s || s.kind !== 'village' || s.owner !== -1 || s.state === 'burned' || !canPay(st, teamId, TIMES.village.allyCost)) return true;
      pay(st, teamId, TIMES.village.allyCost);
      for (const id of s.guards) { const u = st.byId.get(id); if (u) killQuiet(st, u); }
      s.guards = []; s.allied = true; captured(st, s, teamId); return true;
    }
    case 'levy': {
      if (!s || s.kind !== 'village' || s.owner !== teamId || !s.levyReady || !canPay(st, teamId, TIMES.village.levyCost)) return true;
      if (t.pop.mil + 3 > t.cap.mil) return true;
      pay(st, teamId, TIMES.village.levyCost);
      for (let i = 0; i < 3; i++) spawnN(st, 'wx_militia', teamId, s.x + (i - 1) * 2, s.z + 4, {});
      s.levyT = TIMES.village.levyEvery; s.levyReady = false; return true;
    }
    case 'raid': {
      if (!s || s.kind !== 'village' || s.state === 'burned' || s.owner === teamId) return true;
      s.raidBy = teamId; return true;
    }
    case 'altarRite': return K2.rite(st, teamId, s, cmd);
    case 'hireMerc': return K2.hire(st, teamId, s, cmd, 'mercs');
    case 'buyUnit': return K2.hire(st, teamId, s, cmd, 'trader');
    default: return false;
  }
}
