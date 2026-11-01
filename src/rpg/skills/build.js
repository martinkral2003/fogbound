// AI builds: rivals/monsters level with the same rules as the player but no trainer visits and no gold.
// autoLevel(a, buildName, deps) spends a.points.attr / a.points.skill by archetype priority. The caller should core.recompute(st, a) afterwards.
export const BUILDS = {
  warrior: {
    attrs: { str: 3, vit: 3, dex: 2, int: 0 },
    skills: [['onehand', 2], ['block', 2], ['heavyArmor', 1], ['onehand', 4], ['block', 3], ['heavyArmor', 3], ['athletics', 2], ['onehand', 5], ['block', 5], ['heavyArmor', 5], ['survival', 2], ['athletics', 4]],
    start: { onehand: 1, block: 1 },
  },
  brute: {
    attrs: { str: 4, vit: 3, dex: 1, int: 0 },
    skills: [['twohand', 2], ['block', 1], ['heavyArmor', 2], ['twohand', 3], ['athletics', 2], ['twohand', 5], ['heavyArmor', 4], ['block', 3], ['survival', 3], ['heavyArmor', 5]],
    start: { twohand: 1, heavyArmor: 1 },
  },
  ranger: {
    attrs: { dex: 4, vit: 2, str: 1, int: 0 },
    skills: [['archery', 2], ['lightArmor', 2], ['athletics', 2], ['archery', 4], ['survival', 2], ['lightArmor', 4], ['archery', 5], ['athletics', 4], ['stealth', 2], ['survival', 4]],
    start: { archery: 1, lightArmor: 1 },
  },
  mage: {
    attrs: { int: 4, vit: 2, dex: 1, str: 0 },
    skills: [['destruction', 2], ['restoration', 1], ['destruction', 3], ['restoration', 3], ['destruction', 5], ['restoration', 5], ['athletics', 2], ['lightArmor', 2], ['survival', 2]],
    start: { destruction: 1 },
  },
  rogue: {
    attrs: { dex: 4, vit: 2, str: 1, int: 1 },
    skills: [['stealth', 2], ['onehand', 2], ['lightArmor', 2], ['stealth', 4], ['lockpicking', 2], ['onehand', 4], ['athletics', 3], ['stealth', 5], ['lightArmor', 4], ['trade', 2], ['survival', 2]],
    start: { stealth: 1, onehand: 1 },
  },
};

export const startingSkills = (build) => ({ ...((BUILDS[build] || BUILDS.warrior).start) });
// attribute points a build starts with on top of 10 each (rivals get a little variety so they are not clones)
export function startingAttrs(build) {
  const w = (BUILDS[build] || BUILDS.warrior).attrs, out = {};
  for (const k in w) out[k] = 10 + Math.min(3, w[k]);
  return out;
}

export function autoLevel(a, build, deps) {
  const B = BUILDS[build] || BUILDS.warrior, { canLearn, spendAttr, rankOf, invalidate } = deps || {};
  if (!canLearn) return;
  // skills first (they may demand attributes), then leftover attribute points by weight
  let guard = 80;
  while (a.points.skill > 0 && guard-- > 0) {
    let learned = false, wanted = null;
    for (const [id, cap] of B.skills) {
      if (rankOf(a, id) >= cap) continue;
      const c = canLearn(a, id, { ignoreGold: true });
      if (c.ok) { a.points.skill -= c.costPoints; a.skills[id] = c.rank; learned = true; break; }
      if (!wanted && /^Requires [A-Z]{3} /.test(c.reason)) wanted = c.reason.slice(9, 12).toLowerCase();
      if (a.points.skill < c.costPoints && c.reason.startsWith('Needs')) break; // saving up for this one
    }
    if (!learned) {
      if (wanted && a.points.attr > 0 && spendAttr(a, wanted)) continue; // buy the attribute the next skill needs
      break;
    }
  }
  guard = 80;
  while (a.points.attr > 0 && guard-- > 0) {
    let best = null, bs = -1;
    for (const k in B.attrs) { const s = B.attrs[k] / (1 + Math.max(0, a.attrs[k] - 10)); if (s > bs) { bs = s; best = k; } }
    if (!best || !spendAttr(a, best)) break;
  }
  if (invalidate) invalidate(a);
}
