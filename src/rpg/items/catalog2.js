// ITEMS catalogue part 2: jewellery, consumables, ammo, scrolls, tools, junk/valuables, ingredients.
// Consumable fields: heal (hp now), stamina (now), mana (mana now), hot {hp,dur} (regen over time via Combat.addStatus 'regen'
// where power = hp per second), cure:['poison'|'bleed'|'burn'], light (torch radius m), spell (scroll), dmgAdd (ammo).
import { ITEMS } from './catalog.js';
const add = (d) => { ITEMS[d.id] = d; return d; };

// ---- jewellery (slot amulet/ring). bonus keys are documented in items.js (derived).
const AMULETS = [
  ['amulet_bone', 'Bone Charm', 0, 40, { hp: 12 }, null, 'Carved from something that screamed.'],
  ['amulet_wolf', 'Wolf-Tooth Pendant', 1, 90, { dex: 2, critPct: 0.02 }, null, 'Still sharp enough to draw blood.'],
  ['amulet_warded', 'Warded Locket', 1, 130, {}, { fire: 12, cold: 12, lightning: 12 }, 'A scrap of hair under cracked glass.'],
  ['amulet_pale', 'Amulet of the Pale', 2, 260, { mana: 28, manaRegen: 0.6 }, { cold: 10 }, 'The pale ones do not forget who wore it.'],
  ['amulet_fog', 'Fogwarden Talisman', 2, 240, { hp: 20 }, { poison: 25 }, 'It breathes when the mist is near.'],
  ['amulet_blood', 'Blood Pendant', 3, 520, { lifesteal: 0.03, hp: 15 }, null, 'The ruby is never quite dry.'],
];
const RINGS = [
  ['ring_iron', 'Iron Band', 0, 30, { hp: 8 }, null, 'Plain, cold, honest.'],
  ['ring_vigor', 'Ring of Vigor', 1, 100, { stamina: 18, staminaRegen: 1.5 }, null, ''],
  ['ring_fury', 'Ring of Fury', 2, 230, { dmgPct: 0.08 }, null, 'Anger fits like a second knuckle.'],
  ['ring_shadow', 'Signet of Shadows', 2, 250, { critPct: 0.05, sneak: 0.15 }, null, ''],
  ['ring_mage', "Magus' Loop", 2, 240, { int: 3, mana: 15 }, null, ''],
  ['ring_ember', 'Cinder Ring', 1, 120, {}, { fire: 20 }, 'Warm on the coldest nights.'],
  ['ring_bulwark', 'Bulwark Ring', 3, 480, { armor: 4, vit: 2 }, null, 'It will not let you fall easy.'],
];
for (const [id, name, tier, value, bonus, res, flavor] of AMULETS) add({ id, name, slot: 'amulet', kind: 'amulet', tier, weight: 0.2, value, bonus, res: res || {}, flavor });
for (const [id, name, tier, value, bonus, res, flavor] of RINGS) add({ id, name, slot: 'ring', kind: 'ring', tier, weight: 0.1, value, bonus, res: res || {}, flavor });

// ---- potions (3 sizes): [suffix, label, heal, stamina, mana, value]
const SIZES = [['', 'Small', 0], ['M', 'Strong', 1], ['L', 'Greater', 2]];
const POT = { heal: [45, 90, 160], stamina: [50, 100, 180], mana: [30, 60, 120] };
const POTV = [30, 70, 150];
for (const [sfx, lab, i] of SIZES) {
  add({ id: 'healthPotion' + sfx, name: `${lab} Healing Draught`, kind: 'potion', heal: POT.heal[i], weight: 0.3, value: POTV[i], stack: true, flavor: 'Bitter, red, and mostly honest.' });
  add({ id: 'staminaPotion' + sfx, name: `${lab} Draught of Vigor`, kind: 'potion', stamina: POT.stamina[i], weight: 0.3, value: POTV[i] * 0.8 | 0, stack: true });
  add({ id: 'manaPotion' + sfx, name: `${lab} Draught of Clarity`, kind: 'potion', mana: POT.mana[i], weight: 0.3, value: POTV[i] * 0.9 | 0, stack: true });
}
add({ id: 'antidote', name: 'Antidote', kind: 'potion', cure: ['poison'], heal: 10, weight: 0.2, value: 35, stack: true, flavor: 'Tastes of chalk and old coins.' });
add({ id: 'bandage', name: 'Linen Bandage', kind: 'potion', cure: ['bleed'], hot: { hp: 3, dur: 8 }, weight: 0.1, value: 12, stack: true });
add({ id: 'resistPotion', name: 'Elixir of Warding', kind: 'potion', buff: { id: 'shield', dur: 60, power: 0.25 }, weight: 0.3, value: 110, stack: true, flavor: 'Skin like wet slate for a minute.' });
// ---- food (regen over time)
add({ id: 'bread', name: 'Stale Bread', kind: 'food', heal: 5, hot: { hp: 1.2, dur: 10 }, weight: 0.2, value: 4, stack: true });
add({ id: 'cookedMeat', name: 'Cooked Meat', kind: 'food', heal: 8, hot: { hp: 2.5, dur: 14 }, weight: 0.4, value: 9, stack: true, flavor: "Don't ask what it was." });
add({ id: 'roastBoar', name: 'Roast Boar Haunch', kind: 'food', heal: 15, hot: { hp: 4, dur: 15 }, weight: 0.8, value: 22, stack: true });
add({ id: 'stew', name: 'Harrowmere Stew', kind: 'food', heal: 10, stamina: 30, hot: { hp: 3, dur: 12 }, weight: 0.5, value: 16, stack: true });
add({ id: 'ale', name: 'Black Ale', kind: 'food', stamina: 35, mana: 8, weight: 0.5, value: 7, stack: true, flavor: 'It warms the bones and dulls the dread.' });
// ---- light (offhand)
add({ id: 'torch', name: 'Pitch Torch', slot: 'offhand', kind: 'torch', light: 12, weight: 0.6, value: 8, tier: 0, flavor: 'The fog only retreats a few steps.' });
add({ id: 'lantern', name: 'Fogwarden Lantern', slot: 'offhand', kind: 'torch', light: 18, weight: 1.2, value: 120, tier: 2, flavor: 'Burns a pale green, and the mist keeps its distance.' });
// ---- ammo
const AM = [['arrow', 'Crude Arrows', 0, 0, 1, 'arrow'], ['arrowIron', 'Iron-Tipped Arrows', 3, 'physical', 3, 'arrow'], ['arrowBarbed', 'Barbed Arrows', 6, 'physical', 5, 'arrow'],
  ['arrowFire', 'Pitch-Soaked Arrows', 4, 'fire', 7, 'arrow'], ['bolt', 'Crude Bolts', 0, 0, 2, 'bolt'], ['boltIron', 'Iron Bolts', 4, 'physical', 4, 'bolt'], ['boltBarbed', 'Barbed Bolts', 8, 'physical', 7, 'bolt']];
for (const [id, name, dmgAdd, dtype, value, ammoKind] of AM) add({ id, name, kind: ammoKind, ammoKind, dmgAdd, ...(dtype ? { dtype } : {}), weight: 0.05, value, stack: true });
// ---- scrolls (one per spell id; reading casts it once)
const SC = [['firebolt', 'Firebolt', 70], ['frostshard', 'Frost Shard', 70], ['arc', 'Arc', 90], ['venom', 'Venom Dart', 70], ['mend', 'Mend', 60],
  ['stoneskin', 'Stoneskin', 90], ['nova', 'Nova', 140], ['blink', 'Blink', 120], ['bonewarden', 'Bonewarden', 180], ['drain', 'Drain', 150]];
for (const [spell, nm, value] of SC) add({ id: 'scroll_' + spell, name: `Scroll of ${nm}`, kind: 'scroll', spell, weight: 0.1, value, stack: true, flavor: 'The ink crawls when read aloud.' });
// ---- tools and keys
add({ id: 'lockpick', name: 'Lockpick', kind: 'lockpick', weight: 0.05, value: 12, stack: true });
add({ id: 'key', name: 'Old Key', kind: 'key', weight: 0.1, value: 5, keyId: null, flavor: 'Opens exactly one thing.' });
// ---- junk and valuables (sell to merchants / fences)
const JUNK = [['boneDice', 'Bone Dice', 6], ['crowFeather', 'Black Crow Feather', 3], ['rustyShackles', 'Rusty Shackles', 8], ['brokenFlask', 'Cracked Flask', 4], ['tarnishedLocket', 'Tarnished Locket', 22], ['candleStub', 'Votive Candle', 3]];
for (const [id, name, value] of JUNK) add({ id, name, kind: 'misc', junk: true, weight: 0.3, value, stack: true });
const VAL = [['silverGoblet', 'Silver Goblet', 80, 0.8], ['jewelChalice', 'Jewelled Chalice', 220, 1.2], ['ruby', 'Blood Ruby', 350, 0.1], ['ancientCoin', 'Ancient Coin', 45, 0.05], ['ivoryIdol', 'Ivory Idol', 140, 0.6], ['sealRing', 'Noble Signet', 110, 0.1]];
for (const [id, name, value, weight] of VAL) add({ id, name, kind: 'misc', valuable: true, weight, value, stack: true, flavor: 'Heavier with history than metal.' });
add({ id: 'goldCoins', name: 'Gold', kind: 'gold', weight: 0, value: 1, stack: true });
// ---- ingredients
const ING = [['nightshade', 'Nightshade', 6], ['bogMoss', 'Bog Moss', 4], ['wolfPelt', 'Wolf Pelt', 18], ['trollHide', 'Troll Hide', 60], ['wraithDust', 'Wraith Dust', 40], ['ghoulClaw', 'Ghoul Claw', 14]];
for (const [id, name, value] of ING) add({ id, name, kind: 'ingredient', weight: 0.2, value, stack: true });
