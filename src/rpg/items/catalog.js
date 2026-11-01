// ITEMS catalogue part 1: weapons, shields, armor, jewellery. Generated from compact tables so the data stays small.
// Item def fields: id,name,slot,kind,dmg[min,max],speed,reach,stam,dtype,weight,value,req{str,dex,int},twoHanded,ranged{draw,projSpeed,range},
// ammoKind,armor,cls('light'|'medium'|'heavy'),movePen,stamPen,block,res{},bonus{},tier(0-4 material tier),flavor.
export const TIER_NAMES = ['Rusty', 'Iron', 'Steel', 'Darksteel', 'Ancient'];
const TIER_DMG = [0.7, 1, 1.28, 1.6, 2.0];
const TIER_VAL = [0.4, 1, 2.6, 7, 18];
const TIER_REQ = [-2, 0, 1, 3, 5];

export const ITEMS = {};
const add = (d) => { ITEMS[d.id] = d; return d; };

// kind: [dmgMin, dmgMax, speed, reach, stam, weight, value, req, extra]
const WEAPON_BASE = {
  sword:    { dmg: [9, 13], speed: 1.0, reach: 2.1, stam: 10, weight: 3, value: 60, req: { str: 10, dex: 8 }, names: ['Rusty Sword', 'Iron Sword', 'Steel Longsword', 'Darksteel Blade', 'Wraithsteel Falchion'] },
  axe:      { dmg: [11, 16], speed: 0.9, reach: 1.9, stam: 12, weight: 4, value: 65, req: { str: 12 }, names: ['Rusty Hatchet', 'Iron Axe', 'Steel Battleaxe', 'Darksteel Cleaver', "Ancient Headsman's Axe"], extra: { cleave: 1.2 } },
  mace:     { dmg: [12, 15], speed: 0.85, reach: 1.8, stam: 13, weight: 5, value: 65, req: { str: 13 }, names: ['Rusty Cudgel', 'Iron Mace', 'Steel Flanged Mace', 'Darksteel Morningstar', 'Hammer of Ash'], extra: { poise: 1.5 } },
  dagger:   { dmg: [5, 8], speed: 1.45, reach: 1.3, stam: 6, weight: 1, value: 45, req: { dex: 10 }, names: ['Rusty Knife', 'Iron Dagger', 'Steel Stiletto', 'Darksteel Kris', 'Cursed Bone Dirk'], extra: { backstab: 2.5 } },
  spear:    { dmg: [10, 14], speed: 0.95, reach: 3.0, stam: 11, weight: 3.5, value: 60, req: { str: 10, dex: 10 }, names: ['Splintered Spear', 'Iron Spear', 'Steel Partisan', 'Darksteel Pike', 'Wraith Lance'] },
  twohand:  { dmg: [20, 28], speed: 0.68, reach: 2.6, stam: 20, weight: 8, value: 130, req: { str: 16 }, twoHanded: true, names: ['Rusty Greatsword', 'Iron Claymore', 'Steel Zweihander', "Darksteel Executioner", 'Doomblade'], extra: { poise: 2 } },
  bow:      { dmg: [11, 17], speed: 1.0, reach: 0, stam: 8, weight: 2, value: 70, req: { dex: 12 }, twoHanded: true, ammoKind: 'arrow', ranged: { draw: 0.9, projSpeed: 40, range: 65 }, names: ['Frayed Shortbow', "Hunter's Bow", 'Yew Longbow', 'Darkwood Warbow', 'Hollow Bow'] },
  crossbow: { dmg: [19, 27], speed: 0.8, reach: 0, stam: 10, weight: 4.5, value: 110, req: { str: 11, dex: 10 }, twoHanded: true, ammoKind: 'bolt', ranged: { draw: 1.6, projSpeed: 60, range: 75 }, names: ['Rusty Crossbow', 'Iron Crossbow', 'Steel Arbalest', 'Darksteel Repeater', 'Drowned Boltcaster'] },
  staff:    { dmg: [5, 8], speed: 0.95, reach: 2.3, stam: 8, weight: 2.5, value: 80, req: { int: 12 }, names: ['Gnarled Branch', 'Oak Staff', 'Runed Staff', 'Darksteel Rod', 'Staff of the Ancients'] },
};
const STAFF_MANA = [0, 10, 25, 45, 70];
const STAFF_SPELL = [0, 0.04, 0.1, 0.18, 0.28];
const FLAVOR_W = {
  sword: 'A blade is only as honest as the hand that holds it.', axe: 'Made for kindling. Used for worse.', mace: 'Bones remember what steel forgets.',
  dagger: 'Quiet work for quiet hours.', spear: 'Reach is its own kind of courage.', twohand: 'It asks both hands, and sometimes more.',
  bow: 'Strung with sinew from something that no longer needs it.', crossbow: 'Slow to wind, slower to forgive.', staff: 'The wood hums faintly in the fog.',
};

for (const [kind, b] of Object.entries(WEAPON_BASE)) {
  for (let t = 0; t < 5; t++) {
    const m = TIER_DMG[t];
    const req = {}; for (const [k, v] of Object.entries(b.req)) req[k] = Math.max(5, v + TIER_REQ[t]);
    const d = {
      id: `${kind}_${t}`, name: b.names[t], slot: 'weapon', kind, tier: t, dmg: [Math.round(b.dmg[0] * m), Math.round(b.dmg[1] * m)],
      speed: b.speed, reach: b.reach, stam: b.stam, dtype: 'physical', weight: +(b.weight * (t === 0 ? 1.1 : 1)).toFixed(1),
      value: Math.round(b.value * TIER_VAL[t]), req, flavor: FLAVOR_W[kind], ...(b.extra || {}),
    };
    if (b.twoHanded) d.twoHanded = true;
    if (b.ammoKind) { d.ammoKind = b.ammoKind; d.ranged = { ...b.ranged }; }
    if (kind === 'staff') d.bonus = { mana: STAFF_MANA[t], spellDmgPct: STAFF_SPELL[t] };
    if (t === 4 && kind !== 'bow' && kind !== 'crossbow' && kind !== 'staff') { d.cursed = true; d.bonus = { lifesteal: 0.02 }; }
    add(d);
  }
}
ITEMS.rustySword = ITEMS.sword_0;

// shields
const SH_NAMES = ['Plank Buckler', 'Iron Kite Shield', 'Steel Heater', 'Darksteel Tower Shield', 'Ancient Bulwark'];
const SH_BLOCK = [0.55, 0.65, 0.75, 0.82, 0.88], SH_ARM = [1, 3, 5, 8, 11], SH_W = [3, 5, 6.5, 8, 9], SH_REQ = [8, 10, 13, 16, 18];
for (let t = 0; t < 5; t++) {
  add({ id: `shield_${t}`, name: SH_NAMES[t], slot: 'offhand', kind: 'shield', tier: t, block: SH_BLOCK[t], armor: SH_ARM[t], weight: SH_W[t], value: Math.round(45 * TIER_VAL[t]), req: { str: SH_REQ[t] }, flavor: 'Dented, scarred, and still here.' });
}

// armor: slot base armor / weight / value; material factors
const SLOT_BASE = { head: [4.5, 2, 30], chest: [9, 6, 60], legs: [5.5, 3.5, 40], boots: [3, 2.5, 25], hands: [3, 1.2, 25] };
const MATS = [
  { id: 'cloth', cls: 'light', arm: 0.4, w: 0.25, v: 0.5, tier: 0, str: 0, names: ['Tattered Hood', 'Ragged Tunic', 'Patched Breeches', 'Worn Wraps', 'Cloth Mitts'] },
  { id: 'leather', cls: 'light', arm: 0.85, w: 0.6, v: 1, tier: 1, str: 0, names: ['Leather Cap', 'Leather Jerkin', 'Leather Trousers', 'Leather Boots', 'Leather Gloves'] },
  { id: 'studded', cls: 'medium', arm: 1.25, w: 1.0, v: 1.8, tier: 1, str: 10, names: ['Studded Cap', 'Studded Brigandine', 'Studded Chaps', 'Studded Boots', 'Studded Gauntlets'] },
  { id: 'mail', cls: 'medium', arm: 1.75, w: 1.5, v: 3.2, tier: 2, str: 12, names: ['Mail Coif', 'Chainmail Hauberk', 'Mail Chausses', 'Mail Boots', 'Mail Mitts'] },
  { id: 'plate', cls: 'heavy', arm: 2.1, w: 2.1, v: 6, tier: 3, str: 15, names: ['Plate Helm', 'Plate Cuirass', 'Plate Greaves', 'Plate Sabatons', 'Plate Gauntlets'] },
  { id: 'dark', cls: 'heavy', arm: 2.5, w: 2.0, v: 14, tier: 4, str: 18, names: ['Darksteel Greathelm', 'Darksteel Cuirass', 'Darksteel Legplates', 'Darksteel Sabatons', 'Darksteel Gauntlets'] },
];
const CLS_MOVE = { light: 0, medium: 0.05, heavy: 0.12 }, CLS_STAM = { light: 0, medium: 0.08, heavy: 0.22 };
const SLOT_ORDER = ['head', 'chest', 'legs', 'boots', 'hands'];
for (const m of MATS) {
  SLOT_ORDER.forEach((slot, i) => {
    const [a, w, v] = SLOT_BASE[slot], share = a / 25;
    const d = { id: `${slot}_${m.id}`, name: m.names[i], slot, kind: 'armor', cls: m.cls, mat: m.id, armorClass: m.cls === 'light' || m.id === 'studded' ? 'light' : 'heavy', tier: m.tier, armor: +(a * m.arm).toFixed(1), weight: +(w * m.w).toFixed(1),
      value: Math.round(v * m.v), movePen: +(CLS_MOVE[m.cls] * share).toFixed(4), stamPen: +(CLS_STAM[m.cls] * share).toFixed(4) };
    if (m.str) d.req = { str: m.str };
    if (m.id === 'cloth' && slot === 'chest') d.bonus = { mana: 5 };
    add(d);
  });
}
ITEMS.leatherJerkin = ITEMS.chest_leather;
// robes for casters
add({ id: 'chest_robe', name: 'Acolyte Robe', slot: 'chest', kind: 'armor', cls: 'light', mat: 'cloth', tier: 1, armor: 4, weight: 1.5, value: 90, movePen: 0, stamPen: 0, bonus: { mana: 25, manaRegen: 0.4 }, req: { int: 10 }, flavor: 'Stitched with prayers nobody answers.' });
add({ id: 'chest_vestments', name: 'Gravecaller Vestments', slot: 'chest', kind: 'armor', cls: 'light', mat: 'cloth', tier: 3, armor: 8, weight: 2, value: 600, movePen: 0, stamPen: 0, bonus: { mana: 55, manaRegen: 0.9, spellDmgPct: 0.08 }, res: { cold: 10, poison: 10 }, req: { int: 16 }, flavor: 'Cold to the touch, and warmer than it should be.' });
add({ id: 'head_cowl', name: 'Hooded Cowl', slot: 'head', kind: 'armor', cls: 'light', mat: 'cloth', tier: 1, armor: 2.5, weight: 0.6, value: 55, movePen: 0, stamPen: 0, bonus: { mana: 12, sneak: 0.1 } });
