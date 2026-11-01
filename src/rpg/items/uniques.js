// Hand-made legendaries. makeItem('unique:<id>'). They override fields of a base def ('base') and set name/flavor/bonus/res.
// 'slayer': {undead: 0.5} = +50% damage vs monster types in that group (COMBAT may honour it; see README additions).
export const UNIQUES = {
  drownedTrident: { base: 'spear_4', name: "Drowned King's Trident", dmg: [30, 42], speed: 1.0, reach: 3.4, dtype: 'cold', bonus: { lifesteal: 0.05, dex: 3 }, res: { cold: 25 }, value: 3200,
    flavor: 'Pulled, dripping, from the throat of the Sunken Temple. The sea has not forgiven the theft.' },
  wraithbane: { base: 'sword_4', name: 'Wraithbane', dmg: [24, 34], speed: 1.15, reach: 2.3, bonus: { critPct: 0.08, str: 2, dex: 2 }, slayer: { undead: 0.5 }, value: 3000,
    flavor: 'The blade hums when the dead walk near. It has never once been wrong.' },
  boneReaper: { base: 'twohand_4', name: 'Bonereaper', dmg: [52, 72], speed: 0.7, reach: 2.9, bonus: { lifesteal: 0.06, str: 4 }, value: 3600,
    flavor: 'Forged from the ribs of a thousand tithes. Every swing is a harvest.' },
  stormcaller: { base: 'staff_4', name: "Stormcaller's Staff", dtype: 'lightning', bonus: { spellDmgPct: 0.3, mana: 55, int: 4, manaRegen: 1.2 }, value: 3400,
    flavor: 'Struck by the same bolt that felled the abbey tower.' },
  hollowEye: { base: 'bow_4', name: 'Longbow of the Hollow Eye', dmg: [30, 44], ranged: { draw: 0.75, projSpeed: 52, range: 85 }, bonus: { critPct: 0.12, dex: 4 }, value: 3100,
    flavor: 'It never misses what it has already decided to find.' },
  cloakPale: { base: 'chest_robe', name: 'Cloak of the Pale', tier: 4, armor: 16, weight: 3, bonus: { moveSpeed: 0.08, sneak: 0.3, hp: 30 }, res: { cold: 20, poison: 20, fire: 10, lightning: 10 }, value: 2800,
    flavor: 'Woven from the mist that clings to graves. Hostile eyes slide off its wearer.' },
  gravewalker: { base: 'chest_dark', name: 'Gravewalker Plate', armor: 46, bonus: { hp: 50, vit: 3, str: 2 }, res: { physical: 8, poison: 20 }, value: 3500,
    flavor: 'The last knight of Harrowmere is still inside, they say. Listen for his sigh.' },
  oathShield: { base: 'shield_4', name: 'Bulwark of the Last Oath', block: 0.92, armor: 16, bonus: { vit: 3, hp: 40 }, res: { fire: 15, lightning: 15 }, value: 3000,
    flavor: 'Sworn to hold the gate. The gate is gone; the oath is not.' },
  heartFog: { base: 'amulet_fog', name: 'Heart of the Fog', tier: 4, bonus: { hp: 60, hpRegen: 1.8, mana: 30 }, res: { poison: 40, cold: 20 }, value: 2600,
    flavor: 'A beating knot of mist. The Dread Fog parts, grudgingly, around it.' },
  hangedRing: { base: 'ring_shadow', name: 'Ring of the Hanged Man', tier: 4, bonus: { lifesteal: 0.04, critPct: 0.1, hp: -20, dmgPct: 0.12 }, value: 2400,
    flavor: 'He wore it to the gallows. It remembers the drop.' },
  saintLantern: { base: 'lantern', name: "Saint's Lantern", tier: 4, light: 28, bonus: { hpRegen: 1.2, vit: 2 }, res: { poison: 30 }, value: 2200,
    flavor: 'A pious flame that burns the mist and mends the faithful.' },
};
export const UNIQUE_IDS = Object.keys(UNIQUES);
