// FOGBOUND: DOMINION building placement for controls.js: ghost with rotation + soft snapping, validity (Buildings.canPlace), wall drag-line,
// Shift = ring, Ctrl = gate in the middle, rectangle tool, multi-worker assignment. Output: {t:'build'} / {t:'buildline'} commands.
import * as Buildings from '../buildings.js';
import * as Walls from '../walls.js';
import * as Econ from '../econ.js';

const STEP = Math.PI / 12, ANG = (Math.PI / 180) * 7.5;
const LINE_TYPES = new Set(['wall', 'palisade', 'spikes', 'moat']);

export function installBuild(ctl) {
  const { st } = ctl;
  const me = () => st.teams[ctl.local];
  const B = { active: false, type: null, tool: 'single', rot: 0, dragging: false, start: null, end: null, pieces: [], info: { count: 0, cost: {}, reason: null, ok: false }, _key: '' };
  const def = (t) => (Buildings.def ? Buildings.def(t, me()) : null) || { w: 4, d: 4, h: 4, cost: {} };
  const gateType = () => (Buildings.BUILDINGS && Buildings.BUILDINGS.gate ? 'gate' : 'wall');

  B.start = function start(type, tool) {
    const d = def(type);
    B.active = true; B.type = type; B.tool = tool || (LINE_TYPES.has(type) ? 'line' : 'single');
    B.dragging = false; B.pieces = []; B._key = '';
    ctl.mode = { kind: 'build', data: { type } }; ctl.selVer++;
    ctl.ui && ctl.ui.modeChanged && ctl.ui.modeChanged(ctl.mode);
    return d;
  };
  B.cancel = function cancel() {
    B.active = false; B.dragging = false; B.type = null; B.pieces = [];
    if (ctl.mode && ctl.mode.kind === 'build') ctl.mode = null;
    ctl.selVer++; ctl.ui && ctl.ui.modeChanged && ctl.ui.modeChanged(ctl.mode);
  };
  B.rotate = (dir) => { B.rot += dir * STEP; B._key = ''; };
  const ground = () => ctl.renderer.screenToGround(ctl.mouse.x, ctl.mouse.y);

  // wall ends of own pieces for soft snapping
  function ends() {
    const out = [];
    for (const b of st.blds) {
      if (b.team !== ctl.local || !b.wall || b.state === 'ruin') continue;
      const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0), hw = b.w / 2;
      out.push([b.x + c * hw, b.z + s * hw, b.rot], [b.x - c * hw, b.z - s * hw, b.rot]);
    }
    return out;
  }
  function snapPoint(p, isWall) {
    let x = p.x, z = p.z;
    if (isWall) { let bd = 2.6; for (const e of ends()) { const d = Math.hypot(e[0] - x, e[1] - z); if (d < bd) { bd = d; x = e[0]; z = e[1]; } } if (bd < 2.6) return { x, z, snapped: true }; }
    return { x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2, snapped: false };
  }

  function evaluate(list) {
    const team = me(), spent = {}; let any = false, reason = null;
    for (const p of list) {
      const d = def(p.type), cost = d.cost || {};
      const r = Buildings.canPlace ? Buildings.canPlace(st, ctl.local, p.type, p.x, p.z, p.rot) : null;
      let afford = true;
      for (const k in cost) if ((team.res[k] || 0) < (spent[k] || 0) + cost[k]) afford = false;
      p.reason = r || (afford ? null : 'Not enough resources');
      p.ok = !p.reason; p.w = d.w; p.d = d.d; p.h = d.h;
      if (p.ok) { for (const k in cost) spent[k] = (spent[k] || 0) + cost[k]; any = true; } else if (!reason) reason = p.reason;
    }
    B.info = { count: list.filter((p) => p.ok).length, total: list.length, cost: spent, reason: any ? null : reason, ok: any };
  }

  function compute() {
    const m = ctl.mouse, g = ground();
    if (!g) { B.pieces = []; return; }
    const isWall = !!(def(B.type).wall);
    const key = [Math.round(g.x * 2), Math.round(g.z * 2), B.rot.toFixed(2), B.dragging, B.end && Math.round(B.end.x * 2), B.end && Math.round(B.end.z * 2), B.mods, me().res.gold | 0, me().res.timber | 0, me().res.stone | 0, st.blds.length].join('|');
    if (key === B._key) return; B._key = key;
    let list;
    if (B.dragging && B.start) {
      const s = B.start, e = snapPoint(g, true);
      let dx = e.x - s.x, dz = e.z - s.z;
      const L = Math.hypot(dx, dz);
      if (B.tool === 'rect') {
        const th = B.rot, cu = Math.cos(th), su = Math.sin(th), U = dx * cu + dz * su, V = -dx * su + dz * cu;
        const nu = Math.max(1, Math.round((Math.abs(U) - 3) / 4)), nv = Math.max(1, Math.round((Math.abs(V) - 3) / 4));
        list = Walls.rect ? Walls.rect(s.x + (cu * U - su * V) / 2, s.z + (su * U + cu * V) / 2, nu, nv, th, { type: B.type, gate: B.mods & 2 ? gateType() : gateType(), gateDir: [-s.x, -s.z] }) : [];
      } else if (B.mods & 1 && Walls.ring) {
        list = Walls.ring(s.x, s.z, Math.max(5, L), { type: B.type, gate: gateType(), gateDir: [ctl.cam.x - s.x, ctl.cam.z - s.z] });
      } else if (L < 2.4) list = [{ type: B.type, x: s.x, z: s.z, rot: B.rot }];
      else {
        const th = Math.round(Math.atan2(dz, dx) / ANG) * ANG;
        const ex = s.x + Math.cos(th) * L, ez = s.z + Math.sin(th) * L;
        list = Walls.line ? Walls.line(s.x, s.z, e.snapped ? e.x : ex, e.snapped ? e.z : ez, { type: B.type, gateAt: B.mods & 2 ? 'mid' : undefined, gate: gateType() }) : [];
      }
    } else {
      const p = snapPoint(g, isWall);
      list = [{ type: B.type, x: p.x, z: p.z, rot: B.rot }];
      B.hover = p;
    }
    evaluate(list); B.pieces = list;
  }
  B.update = function update() { if (!B.active) return; const k = ctl.keys; B.mods = (k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : 0) | (k.has('ControlLeft') || k.has('ControlRight') ? 2 : 0); compute(); };
  B.ghosts = () => (B.active ? B.pieces : []);
  B.mods = 0;

  const workers = () => ctl.selUnits().filter((u) => u.role === 'worker').map((u) => u.id);
  function commit(shift) {
    const ok = B.pieces.filter((p) => p.ok).map((p) => ({ type: p.type, x: p.x, z: p.z, rot: p.rot }));
    if (!ok.length) { ctl.ui && ctl.ui.toast && B.info.reason && ctl.ui.toast(B.info.reason, 'warn'); return; }
    if (ok.length === 1) ctl.queueCmd({ t: 'build', type: ok[0].type, x: ok[0].x, z: ok[0].z, rot: ok[0].rot, workers: workers(), queue: !!shift });
    else ctl.queueCmd({ t: 'buildline', pieces: ok, workers: workers(), queue: !!shift });
    ctl.ping(ok[0].x, ok[0].z, 'build');
  }
  B.down = function down(mx, my, shift, ctrl) {
    ctl.mouse.x = mx; ctl.mouse.y = my; B.mods = (shift ? 1 : 0) | (ctrl ? 2 : 0);
    const g = ground(); if (!g) return;
    if (B.tool === 'single' || (!def(B.type).wall && B.tool !== 'rect')) { B._key = ''; compute(); commit(shift); if (!shift) B.cancel(); return; }
    B.start = snapPoint(g, true); B.end = B.start; B.dragging = true; B._key = '';
  };
  B.move = function move(mx, my, shift, ctrl) { B.mods = (shift ? 1 : 0) | (ctrl ? 2 : 0); if (B.dragging) B.end = ground(); };
  B.up = function up(mx, my, shift, ctrl) {
    B.mods = (shift ? 1 : 0) | (ctrl ? 2 : 0); B._key = ''; compute(); commit(shift);
    B.dragging = false; B.start = null; B.end = null; B._key = '';
    if (!shift) B.cancel();
  };
  return B;
}
