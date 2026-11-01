// Affix definitions + rolling. An affix is {id, k:'p'|'s', n:name, tags, stat, lo, hi, int}.
// stat: a bonus key ('critPct' ...), 'res:<dtype>', 'resAll', 'armorMul' (multiplies item armor), 'dtype:<fire|cold|lightning|poison>' (converts weapon damage type).
// tags: which item groups may roll it: melee, ranged, magic, shield, armor, jewel, any (any = every equippable).
// Magnitude at "power 1": lo..hi; power = (0.55 + 0.2*matTier) * (0.8 + 0.15*rarity).
export const AFFIXES = [
  // weapon prefixes
  { id: 'keen', k: 'p', n: 'Keen', tags: ['melee', 'ranged'], stat: 'critPct', lo: 0.02, hi: 0.05 },
  { id: 'brutal', k: 'p', n: 'Brutal', tags: ['melee', 'ranged'], stat: 'dmgPct', lo: 0.07, hi: 0.16 },
  { id: 'swift', k: 'p', n: 'Swift', tags: ['melee'], stat: 'atkSpeed', lo: 0.05, hi: 0.11 },
  { id: 'vampiric', k: 'p', n: 'Vampiric', tags: ['melee', 'ranged'], stat: 'lifesteal', lo: 0.02, hi: 0.05 },
  { id: 'flaming', k: 'p', n: 'Flaming', tags: ['melee', 'ranged'], stat: 'dtype:fire', lo: 1, hi: 1, conv: true },
  { id: 'frozen', k: 'p', n: 'Frozen', tags: ['melee', 'ranged'], stat: 'dtype:cold', lo: 1, hi: 1, conv: true },
  { id: 'stormtouched', k: 'p', n: 'Storm-touched', tags: ['melee', 'ranged'], stat: 'dtype:lightning', lo: 1, hi: 1, conv: true },
  { id: 'venomous', k: 'p', n: 'Venomous', tags: ['melee', 'ranged'], stat: 'dtype:poison', lo: 1, hi: 1, conv: true },
  { id: 'arcane', k: 'p', n: 'Arcane', tags: ['magic'], stat: 'spellDmgPct', lo: 0.08, hi: 0.2 },
  { id: 'lucid', k: 'p', n: 'Lucid', tags: ['magic', 'jewel'], stat: 'mana', lo: 10, hi: 28, int: true },
  // armor / shield / jewel prefixes
  { id: 'sturdy', k: 'p', n: 'Sturdy', tags: ['armor', 'shield'], stat: 'armorMul', lo: 0.1, hi: 0.3 },
  { id: 'hardy', k: 'p', n: 'Hardy', tags: ['armor', 'shield', 'jewel'], stat: 'hp', lo: 8, hi: 26, int: true },
  { id: 'fleet', k: 'p', n: 'Fleet', tags: ['armor', 'jewel'], stat: 'moveSpeed', lo: 0.03, hi: 0.07 },
  { id: 'warded', k: 'p', n: 'Warded', tags: ['armor', 'shield', 'jewel'], stat: 'resAll', lo: 4, hi: 12, int: true },
  { id: 'stalwart', k: 'p', n: 'Stalwart', tags: ['armor', 'shield'], stat: 'stamina', lo: 8, hi: 24, int: true },
  { id: 'gleaming', k: 'p', n: 'Gleaming', tags: ['armor', 'jewel'], stat: 'light', lo: 1.5, hi: 4 },
  // suffixes (any)
  { id: 'wolf', k: 's', n: 'of the Wolf', tags: ['any'], stat: 'dex', lo: 1, hi: 3, int: true },
  { id: 'bear', k: 's', n: 'of the Bear', tags: ['any'], stat: 'str', lo: 1, hi: 3, int: true },
  { id: 'owl', k: 's', n: 'of the Owl', tags: ['any'], stat: 'int', lo: 1, hi: 3, int: true },
  { id: 'ox', k: 's', n: 'of the Ox', tags: ['any'], stat: 'vit', lo: 1, hi: 3, int: true },
  { id: 'fox', k: 's', n: 'of the Fox', tags: ['armor', 'jewel'], stat: 'moveSpeed', lo: 0.03, hi: 0.06 },
  { id: 'raven', k: 's', n: 'of the Raven', tags: ['any'], stat: 'manaRegen', lo: 0.3, hi: 0.9 },
  { id: 'leech', k: 's', n: 'of the Leech', tags: ['melee', 'jewel'], stat: 'lifesteal', lo: 0.015, hi: 0.04 },
  { id: 'endurance', k: 's', n: 'of Endurance', tags: ['any'], stat: 'staminaRegen', lo: 1.5, hi: 4 },
  { id: 'bulwark', k: 's', n: 'of the Bulwark', tags: ['armor', 'shield', 'jewel'], stat: 'armor', lo: 1.5, hi: 5 },
  { id: 'flame', k: 's', n: 'of the Flame', tags: ['armor', 'shield', 'jewel'], stat: 'res:fire', lo: 10, hi: 25, int: true },
  { id: 'frost', k: 's', n: 'of Frost', tags: ['armor', 'shield', 'jewel'], stat: 'res:cold', lo: 10, hi: 25, int: true },
  { id: 'storms', k: 's', n: 'of Storms', tags: ['armor', 'shield', 'jewel'], stat: 'res:lightning', lo: 10, hi: 25, int: true },
  { id: 'toad', k: 's', n: 'of the Toad', tags: ['armor', 'shield', 'jewel'], stat: 'res:poison', lo: 12, hi: 28, int: true },
  { id: 'vigor', k: 's', n: 'of Vigor', tags: ['any'], stat: 'hpRegen', lo: 0.3, hi: 1.0 },
  { id: 'packmule', k: 's', n: 'of the Pack Mule', tags: ['armor', 'jewel'], stat: 'carry', lo: 8, hi: 22, int: true },
  { id: 'precision', k: 's', n: 'of Precision', tags: ['melee', 'ranged', 'jewel'], stat: 'critPct', lo: 0.02, hi: 0.06 },
  { id: 'haste', k: 's', n: 'of Haste', tags: ['melee', 'jewel'], stat: 'atkSpeed', lo: 0.04, hi: 0.1 },
  { id: 'mage', k: 's', n: 'of the Mage', tags: ['magic', 'jewel'], stat: 'spellDmgPct', lo: 0.06, hi: 0.16 },
  { id: 'ruin', k: 's', n: 'of Ruin', tags: ['melee', 'ranged', 'jewel'], stat: 'dmgPct', lo: 0.06, hi: 0.14 },
  { id: 'shadows', k: 's', n: 'of Shadows', tags: ['armor', 'jewel'], stat: 'sneak', lo: 0.1, hi: 0.25 },
  { id: 'vitality', k: 's', n: 'of Vitality', tags: ['any'], stat: 'hp', lo: 10, hi: 32, int: true },
];

export const EPIC_PREFIX = ['Gravecall', 'Ashen', 'Hollow', 'Mournful', 'Pale', 'Wretched', 'Black', 'Thorned', 'Dread', 'Bleak', 'Fogbound', 'Sepulchral'];
export const EPIC_NOUN = {
  sword: ['Brand', 'Fang', 'Whisper', 'Edge'], axe: ['Reaver', 'Bite', 'Splitter'], mace: ['Toll', 'Crusher', 'Hymn'], dagger: ['Sting', 'Kiss', 'Sliver'],
  spear: ['Thorn', 'Lance', 'Skewer'], twohand: ['Doom', 'Verdict', 'Harbinger'], bow: ['Sigh', 'Reach', 'Arc'], crossbow: ['Judge', 'Sorrow'],
  staff: ['Vigil', 'Spire', 'Crook'], shield: ['Ward', 'Aegis', 'Bastion'], armor: ['Shroud', 'Carapace', 'Mantle', 'Raiment'], amulet: ['Heart', 'Eye', 'Tear'], ring: ['Coil', 'Loop', 'Vow'],
};

export function itemTags(d) {
  const k = d.kind;
  if (k === 'shield') return ['shield', 'any'];
  if (k === 'armor') return ['armor', 'any'];
  if (k === 'amulet' || k === 'ring') return ['jewel', 'any'];
  if (k === 'bow' || k === 'crossbow') return ['ranged', 'any'];
  if (k === 'staff') return ['magic', 'melee', 'any'];
  if (d.slot === 'weapon') return ['melee', 'any'];
  return [];
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];
const fmt = (v, int) => (int ? Math.max(1, Math.round(v)) : +v.toFixed(3));

// apply one affix to a (fresh, mutable) item. returns the stored affix record {id,n,k,stat,v}
export function applyAffix(item, af, power, rng) {
  const v = fmt((af.lo + (af.hi - af.lo) * rng()) * (af.conv ? 1 : power), af.int);
  const stat = af.stat;
  if (stat.startsWith('dtype:')) item.dtype = stat.slice(6);
  else if (stat === 'armorMul') item.armor = +((item.armor || 0) * (1 + v)).toFixed(1);
  else if (stat === 'resAll') { for (const t of ['physical', 'fire', 'cold', 'lightning', 'poison']) if (t !== 'physical') item.res[t] = (item.res[t] || 0) + v; }
  else if (stat.startsWith('res:')) { const t = stat.slice(4); item.res[t] = (item.res[t] || 0) + v; }
  else item.bonus[stat] = +(((item.bonus[stat] || 0) + v)).toFixed(3);
  return { id: af.id, n: af.n, k: af.k, stat, v: stat.startsWith('dtype:') ? 1 : v };
}

// roll `n` distinct affixes (balanced prefix/suffix) for an item def; returns records (already applied to item)
export function rollAffixes(item, def, rarity, rng) {
  const n = [0, 1, 2, 3, 4][rarity] || 0; if (!n) return [];
  const tags = itemTags(def), power = (0.55 + 0.2 * (def.tier || 0)) * (0.8 + 0.15 * rarity);
  const pool = AFFIXES.filter((a) => a.tags.some((t) => tags.includes(t)) && !(a.conv && def.dtype && def.dtype !== 'physical'));
  const out = [], used = new Set(); let conv = false;
  for (let i = 0; i < n && pool.length; i++) {
    const want = i % 2 === 0 ? (rng() < 0.5 ? 'p' : 's') : (out[out.length - 1].k === 'p' ? 's' : 'p');
    let cand = pool.filter((a) => !used.has(a.stat) && !used.has(a.id) && (!a.conv || !conv) && a.k === want);
    if (!cand.length) cand = pool.filter((a) => !used.has(a.stat) && !used.has(a.id) && (!a.conv || !conv));
    if (!cand.length) break;
    const af = pick(cand, rng); used.add(af.id); used.add(af.stat); if (af.conv) conv = true;
    out.push(applyAffix(item, af, power, rng));
  }
  return out;
}

// build the display name for a rolled item
export function affixName(baseName, affixes, rarity, def, rng) {
  if (!affixes.length) return baseName;
  const pre = affixes.find((a) => a.k === 'p'), suf = affixes.find((a) => a.k === 's');
  if (rarity <= 2) return `${pre ? pre.n + ' ' : ''}${baseName}${suf ? ' ' + suf.n : ''}`;
  const nouns = EPIC_NOUN[def.kind] || EPIC_NOUN[def.slot] || EPIC_NOUN.armor;
  return `${pick(EPIC_PREFIX, rng)} ${pick(nouns, rng)}`;
}
