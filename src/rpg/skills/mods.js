// Perk-modifier key metadata (pure data, no imports). Used by skills.js for combining and for tooltip text.
// kind: 'sum' (default, additive), 'mul' (multiplied together, identity 1), 'max' (highest wins).
// fmt: how describeSkill prints the value:  pct = "+N%"  neg = "-N%" (signed percent, negative = cheaper)  sec = "+N s"  num = "+N"  flag = label only
export const MOD_KEYS = {
  // ---- README base keys (percent points unless noted; 5 means +5%)
  dmgPct:           { label: 'damage (all)', fmt: 'pct' },
  meleeDmgPct:      { label: 'melee damage (resolved for the wielded weapon)', fmt: 'pct' },
  bowDmgPct:        { label: 'bow/crossbow damage (resolved for the wielded weapon)', fmt: 'pct' },
  spellDmgPct:      { label: 'spell damage', fmt: 'pct' },
  critPct:          { label: 'crit chance (percentage points)', fmt: 'pct' },
  critDmgPct:       { label: 'crit damage', fmt: 'pct' },
  staminaRegenPct:  { label: 'stamina regeneration', fmt: 'pct' },
  staminaCostPct:   { label: 'stamina cost of actions (signed)', fmt: 'neg' },
  blockEfficiency:  { label: 'damage absorbed when blocking (added to the base)', fmt: 'pct' },
  parryWindow:      { label: 'parry window', fmt: 'sec' },
  moveSpeedPct:     { label: 'movement speed', fmt: 'pct' },
  sneakMul:         { label: 'detection range multiplier', fmt: 'mul', kind: 'mul', base: 1 },
  lockpick:         { label: 'lockpicking success chance (0..1 added)', fmt: 'frac' },
  tradePct:         { label: 'better prices (buy cheaper / sell higher)', fmt: 'pct' },
  hpPct:            { label: 'max health', fmt: 'pct' },
  manaPct:          { label: 'max mana', fmt: 'pct' },
  armorPct:         { label: 'armour (resolved from the worn set)', fmt: 'pct' },
  resAll:           { label: 'resistance to everything (percentage points)', fmt: 'num' },
  lifesteal:        { label: 'life steal (percent of damage dealt)', fmt: 'pct' },
  dodgeCostPct:     { label: 'dodge stamina cost (signed)', fmt: 'neg' },
  drawSpeedPct:     { label: 'bow draw speed', fmt: 'pct' },
  // ---- extras (items/combat may read any of these; all optional)
  oneHandDmgPct:    { label: 'one-handed damage (raw skill value)', fmt: 'pct' },
  twoHandDmgPct:    { label: 'two-handed damage (raw skill value)', fmt: 'pct' },
  bowSkillDmgPct:   { label: 'archery damage (raw skill value)', fmt: 'pct' },
  armorPctLight:    { label: 'light armour bonus (raw)', fmt: 'pct' },
  armorPctHeavy:    { label: 'heavy armour bonus (raw)', fmt: 'pct' },
  attackCostPct:    { label: 'stamina cost of weapon attacks (signed)', fmt: 'neg' },
  attackSpeedPct:   { label: 'attack speed', fmt: 'pct' },
  heavyDmgPct:      { label: 'heavy (charged) attack damage', fmt: 'pct' },
  armorPenPct:      { label: 'armour penetration', fmt: 'pct' },
  staggerPct:       { label: 'stagger power dealt', fmt: 'pct' },
  poiseBonus:       { label: 'stagger resistance', fmt: 'pct' },
  cleave:           { label: 'heavy attacks sweep a wide arc', fmt: 'flag', kind: 'max' },
  rangePct:         { label: 'bow range', fmt: 'pct' },
  ammoSavePct:      { label: 'chance not to use up ammunition', fmt: 'pct' },
  moveWhileDraw:    { label: 'move speed kept while drawing a bow (fraction)', fmt: 'frac', kind: 'max' },
  counterDmgPct:    { label: 'damage of the strike right after a parry', fmt: 'pct' },
  heavyReqStr:      { label: 'strength requirement of armour/weapons (signed)', fmt: 'num' },
  heavyMovePenaltyPct: { label: 'movement penalty of heavy armour (signed)', fmt: 'neg' },
  dodgeInv:         { label: 'dodge invulnerability', fmt: 'sec' },
  sprintCostPct:    { label: 'sprint stamina cost (signed)', fmt: 'neg' },
  staminaPct:       { label: 'max stamina', fmt: 'pct' },
  hpRegenPct:       { label: 'health regeneration', fmt: 'pct' },
  manaRegenPct:     { label: 'mana regeneration', fmt: 'pct' },
  spellCostPct:     { label: 'mana cost of spells (signed)', fmt: 'neg' },
  spellCritPct:     { label: 'spell crit chance', fmt: 'pct' },
  castSpeedPct:     { label: 'casting speed', fmt: 'pct' },
  healPct:          { label: 'healing from spells', fmt: 'pct' },
  shieldPct:        { label: 'strength of absorb shields', fmt: 'pct' },
  summonPct:        { label: 'power of summoned allies', fmt: 'pct' },
  backstabPct:      { label: 'backstab / sneak attack damage', fmt: 'pct' },
  sneakSpeedPct:    { label: 'speed while crouched', fmt: 'pct' },
  sneakCritPct:     { label: 'crit chance against unaware targets', fmt: 'pct' },
  lockTier:         { label: 'highest chest tier you can pick', fmt: 'num', kind: 'max' },
  lootLuckPct:      { label: 'chance of better loot from containers', fmt: 'pct' },
  fogResist:        { label: 'Dread Fog damage taken (reduction)', fmt: 'pct' },
  foodPct:          { label: 'potency of food and potions', fmt: 'pct' },
  carryPct:         { label: 'carry weight', fmt: 'pct' },
  carryBonus:       { label: 'carry capacity (kg, derived: 0.6 per carryPct point)', fmt: 'num', abs: true },
  potionPct:        { label: 'potency of potions (alias of foodPct)', fmt: 'pct' },
  goldFindPct:      { label: 'gold found', fmt: 'pct' },
  resPhysical:      { label: 'physical resistance', fmt: 'num' },
  resFire:          { label: 'fire resistance', fmt: 'num' },
  resCold:          { label: 'cold resistance', fmt: 'num' },
  resLightning:     { label: 'lightning resistance', fmt: 'num' },
  resPoison:        { label: 'poison resistance', fmt: 'num' },
};

export function blankMods() {
  const m = {};
  for (const k in MOD_KEYS) m[k] = MOD_KEYS[k].base ?? 0;
  return m;
}

export function fmtMod(k, v) {
  const meta = MOD_KEYS[k]; if (!meta) return k + ' ' + v;
  const r = Math.round(v * 100) / 100;
  switch (meta.fmt) {
    case 'pct': return (r >= 0 ? '+' : '') + r + '% ' + meta.label;
    case 'neg': return (r >= 0 ? '+' : '') + r + '% ' + meta.label;
    case 'sec': return '+' + r + ' s ' + meta.label;
    case 'frac': return '+' + Math.round(v * 100) + '% ' + meta.label.replace(/ \(.*\)/, '');
    case 'mul': return Math.round((1 - v) * 100) + '% ' + 'less ' + meta.label;
    case 'flag': return meta.label;
    default: return (r >= 0 ? '+' : '') + r + ' ' + meta.label;
  }
}
