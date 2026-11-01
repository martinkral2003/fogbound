// FOGBOUND: DOMINION selection logic for controls.js (click, box, double-click type, groups, idle-worker cycling).
const norm = (st, list) => (list || []).map((e) => (typeof e === 'object' ? e : st.byId.get(e))).filter(Boolean);

export function installSelect(ctl) {
  const { st, renderer } = ctl;
  const me = () => ctl.local;
  const own = (e) => e && e.team === me();
  let lastClick = { t: 0, type: null };
  ctl.groups = Array.from({ length: 10 }, () => []);
  ctl.lastGroupTap = { n: -1, t: 0 };

  const w2s = (x, z, y) => { const s = renderer.worldToScreen(x, z, y); return Array.isArray(s) ? { x: s[0], y: s[1] } : s; };
  ctl.w2s = w2s;

  ctl.pickAt = function pickAt(mx, my) {
    const r = renderer.pick(mx - 2, my - 2, mx + 2, my + 2) || {};
    const cand = [];
    const add = (list, rank) => { for (const e of norm(st, list)) { const s = w2s(e.x, e.z, (e.y || 0) + (e.kind === 'bld' ? (e.h || 3) / 2 : 1)); cand.push({ e, rank, d: Math.hypot(s.x - mx, s.y - my) }); } };
    add(r.units, 0); add(r.blds, 1); add(r.nodes, 2); add(r.neutrals, 2);
    cand.sort((a, b) => a.rank - b.rank || a.d - b.d);
    return cand.length ? cand[0].e : null;
  };
  ctl.alive = (e) => e && (e.kind === 'bld' ? e.state !== 'ruin' : e.kind === 'node' || e.kind === 'neutral' || e.alive !== false);
  ctl.selEnts = () => ctl.sel.map((id) => st.byId.get(id)).filter((e) => e && ctl.alive(e) && e.team === me());
  ctl.selUnits = () => ctl.selEnts().filter((e) => e.kind === 'unit');
  ctl.selBlds = () => ctl.selEnts().filter((e) => e.kind === 'bld');
  ctl.select = function select(ents, add) {
    const ids = ents.filter((e) => own(e)).map((e) => e.id);
    if (!add) ctl.sel = []; ctl.info = null;
    for (const id of ids) if (!ctl.sel.includes(id)) ctl.sel.push(id);
    ctl.selVer++;
  };
  ctl.inspect = function inspect(e) { if (!(e && e.isNeutral)) ctl.sel = []; ctl.info = e ? e.id : null; ctl.selVer++; };
  ctl.toggle = function toggle(e) {
    if (!own(e)) return;
    const i = ctl.sel.indexOf(e.id); if (i >= 0) ctl.sel.splice(i, 1); else ctl.sel.push(e.id);
    ctl.info = null; ctl.selVer++;
  };
  ctl.pruneSel = function pruneSel() {
    const n = ctl.sel.length; ctl.sel = ctl.sel.filter((id) => { const e = st.byId.get(id); return e && ctl.alive(e); });
    if (ctl.sel.length !== n) ctl.selVer++;
    if (ctl.info) { const e = st.byId.get(ctl.info); if (!e || !ctl.alive(e)) { ctl.info = null; ctl.selVer++; } }
  };

  ctl.clickSelect = function clickSelect(mx, my, shift, now) {
    const e = ctl.pickAt(mx, my);
    if (!e) { if (!shift) { ctl.sel = []; ctl.info = null; ctl.selVer++; } return; }
    if (!own(e)) { ctl.inspect(e); return; }
    if (shift) { ctl.toggle(e); return; }
    const dbl = now - lastClick.t < 0.35 && lastClick.type === e.type && e.kind === 'unit';
    lastClick = { t: now, type: e.type };
    if (dbl) {
      const r = renderer.pick(0, 0, innerWidth, innerHeight) || {};
      ctl.select(norm(st, r.units).filter((u) => own(u) && u.type === e.type && u.alive), false);
    } else ctl.select([e], false);
  };

  ctl.boxSelect = function boxSelect(x0, y0, x1, y1, shift) {
    const r = renderer.pick(x0, y0, x1, y1) || {};
    const units = norm(st, r.units).filter((u) => own(u) && u.alive && !u.garrison);
    if (units.length) {
      // prefer military over workers when mixed (AoE style), unless only workers
      const mil = units.filter((u) => u.role !== 'worker');
      ctl.select(mil.length ? mil : units, shift); return;
    }
    const blds = norm(st, r.blds).filter((b) => own(b) && b.state !== 'ruin');
    if (blds.length) { ctl.select(blds.slice(0, 1), shift); return; }
    const foreign = [...norm(st, r.units), ...norm(st, r.blds), ...norm(st, r.nodes)][0];
    if (foreign && !shift) ctl.inspect(foreign); else if (!shift) { ctl.sel = []; ctl.info = null; ctl.selVer++; }
  };

  ctl.selectAllMilitary = () => ctl.select(st.ents.filter((u) => u.alive && u.team === me() && u.role !== 'worker' && u.role !== 'general' && !u.garrison).concat(st.ents.filter((u) => u.alive && u.team === me() && u.general)), false);
  ctl.idleWorkers = () => st.ents.filter((u) => u.alive && u.team === me() && u.role === 'worker' && !u.garrison && !u.order);
  ctl.selectIdleWorkers = function selectIdleWorkers(cycle) {
    const idle = ctl.idleWorkers(); if (!idle.length) return false;
    if (cycle) { const cur = ctl.sel.length === 1 ? idle.findIndex((u) => u.id === ctl.sel[0]) : -1; const u = idle[(cur + 1) % idle.length]; ctl.select([u], false); ctl.centerOn(u.x, u.z); }
    else ctl.select(idle, false);
    return true;
  };
  ctl.cycleSelectedTypes = function cycleSelectedTypes() {
    const us = ctl.selUnits(); if (!us.length) return;
    const types = [...new Set(us.map((u) => u.type))]; if (types.length < 2) return;
    ctl.subType = ((ctl.subType ?? -1) + 1) % types.length; ctl.selVer++;
  };
  ctl.activeType = () => { const t = [...new Set(ctl.selUnits().map((u) => u.type))]; return ctl.subType !== undefined && ctl.subType !== null && t.length > 1 ? t[ctl.subType % t.length] : null; };

  ctl.groupKey = function groupKey(n, ctrl, shift, now) {
    if (ctrl) { ctl.groups[n] = ctl.sel.slice(); ctl.ui && ctl.ui.toast && ctl.ui.toast('Group ' + n + ' set (' + ctl.sel.length + ')'); return; }
    const g = ctl.groups[n].filter((id) => { const e = st.byId.get(id); return e && ctl.alive(e) && e.team === me(); });
    ctl.groups[n] = g; if (!g.length) return;
    if (shift) { for (const id of g) if (!ctl.sel.includes(id)) ctl.sel.push(id); ctl.selVer++; }
    else { ctl.sel = g.slice(); ctl.info = null; ctl.selVer++; }
    const dbl = ctl.lastGroupTap.n === n && now - ctl.lastGroupTap.t < 0.4;
    ctl.lastGroupTap = { n, t: now };
    if (dbl) { const es = ctl.selEnts(); if (es.length) ctl.centerOn(es.reduce((a, e) => a + e.x, 0) / es.length, es.reduce((a, e) => a + e.z, 0) / es.length); }
  };
}
