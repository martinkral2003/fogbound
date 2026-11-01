// UNITS lane: roster builder. mk(factionKey, shortSpec) -> full unit def (see README: unit def shape). Pure data, no sim imports.
// Short spec keys: id,n(name),role,tier,needs,g(upgrade group),c(cost),pop,time,hp,ar(armor %),dmg,rng,cd,dt(dtype),spd,vis,r,tags[],bonus{},ab[],proj,splash,
// pierce,onhit{},res{},fly,eth,regen,souls,upkeep,d(desc),berserk,deathBlast,passive,model
export const FKEYS = ['necro', 'orc', 'demon', 'cult'];

// every def has `tags` (object): role + weight class + extras; atk.bonus multiplies damage vs target tags (max applies)
export function mk(f, s) {
  const role = s.role || 'melee';
  const tags = { [role]: 1 };
  for (const t of s.tags || []) tags[t] = 1;
  if (s.fly) tags.flyer = 1;
  const ranged = (s.rng || 1) >= 5;
  const g = s.g || (role === 'worker' ? 'work' : role);
  return {
    id: `${f}_${s.id}`, type: `${f}_${s.id}`, name: s.n, faction: f, role, desc: s.d || '', tier: s.tier || 1, age: s.tier || 1, needs: s.needs == null ? null : s.needs,
    cost: { ...(s.c || { gold: 50 }) }, popCost: s.pop == null ? (role === 'general' ? 0 : 1) : s.pop, time: s.time || 14,
    hp: s.hp, armor: s.ar || 0,
    atk: { dmg: s.dmg ?? 10, range: s.rng ?? 0.9, cd: s.cd || 1.2, dtype: s.dt || 'physical', splash: s.splash || 0, projectile: s.proj || (ranged ? 'arrow' : null), bonus: s.bonus || null, pierce: s.pierce || 0, onhit: s.onhit || null },
    speed: s.spd || 4, vision: s.vis || (ranged ? 24 : 20), r: s.r || 0.6,
    abilities: s.ab || [], tags, res: s.res || {}, fly: !!s.fly, eth: !!s.eth, regen: s.regen || 0, souls: s.souls ?? (role === 'worker' ? 0 : Math.max(1, Math.round(((s.c && s.c.gold) || 40) / 40))),
    upkeep: s.upkeep ?? (role === 'worker' ? 0 : 1), berserk: !!s.berserk, deathBlast: s.deathBlast || null, passive: !!s.passive, model: s.model || s.id,
    group: g, upgradeLines: role === 'worker' || role === 'general' ? [] : [`${f}_${g}_w`, `${f}_${g}_a`],
  };
}
export function mkWorker(f, s) {
  return mk(f, { role: 'worker', tier: 1, needs: 'keep', time: 12, hp: 50, ar: 0, dmg: 4, rng: 0.9, cd: 1.4, spd: 3.8, vis: 18, r: 0.5, upkeep: 0.5, souls: 0, passive: true, ...s });
}
// generals: s.skills are faction skill ids (generals.js GEN_SKILLS), idx is 0..2
export function mkGeneral(f, idx, s) {
  const d = mk(f, { role: 'general', tier: 1, needs: 'keep', time: 40 + idx * 10, r: 0.85, vis: 28, upkeep: 0, souls: 0, ...s, id: `general_${idx}` });
  d.general = true; d.idx = idx;
  d.cost = idx === 0 ? { gold: 0 } : (s.c || { gold: 350 + idx * 100, souls: 25 + idx * 10 });
  d.popCost = 0;
  return d;
}
