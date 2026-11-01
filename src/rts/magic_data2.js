// MAGIC lane data part 2 (owner: MAGIC): Infernal, Blood, neutral relic scrolls, magic-tower bolts. No imports.
const mk = (school, id, name, icon, o) => ({ id, school, name, icon, target: 'point', tgt: 'enemy', age: 0, radius: 0, range: 20, cd: 20, cost: { mana: 40 }, ...o });

export function SCHOOL_SPELLS_B() {
  const L = [];
  const I = (...a) => L.push(mk('infernal', ...a));
  I('hellfire_rain', 'Hellfire Rain', '🔥', { desc: 'Fire rains on an area, burning units and igniting timber.', start: true, range: 24, radius: 9, cd: 35, cost: { mana: 70 }, kind: 'zone', zk: 'hellfire', dur: 10, dps: 26, dtype: 'fire', bldDps: 9, ignite: true });
  I('summon_imps', 'Summon Imps', '👿', { desc: 'Four flying imps tear through the rift for a short time.', start: true, range: 16, radius: 3, cd: 30, cost: { mana: 45 }, kind: 'summon', unit: ['imp'], n: 4, life: 45 });
  I('flame_wall', 'Flame Wall', '▓', { desc: 'A line of fire that burns everything crossing it.', range: 22, radius: 10, cd: 35, cost: { mana: 55 }, kind: 'flamewall', dur: 12, dps: 32, dtype: 'fire', segs: 6, segR: 2.4, ignite: true, research: { cost: { gold: 120 }, time: 25 } });
  I('soul_burn', 'Soul Burn', '✺', { desc: 'Sear one enemy; the burn lingers and its mana is scorched away.', target: 'unit', range: 16, cd: 14, cost: { mana: 40 }, kind: 'bolt', dmg: 70, dtype: 'fire', burn: { dps: 6, dur: 8 }, manaBurn: 30, bld: 0.5, age: 1, req: 'summon_imps', research: { cost: { gold: 130 }, time: 28 } });
  I('immolation', 'Immolation Aura', '♨', { desc: 'The caster burns: a flaming aura scorches adjacent enemies for 15 s.', target: 'self', range: 0, radius: 6, age: 1, req: 'flame_wall', cd: 45, cost: { mana: 60 }, kind: 'zone', zk: 'aura', dur: 15, dps: 30, dtype: 'fire', follow: true, bldDps: 6, research: { cost: { gold: 160 }, time: 30 } });
  I('demonic_pact', 'Demonic Pact', '⛧', { desc: 'Spend souls: allies nearby gain 35% damage and +10 armour for 20 s.', target: 'self', range: 0, radius: 15, age: 1, req: 'soul_burn', cd: 60, cost: { mana: 50, souls: 2 }, kind: 'buff', dur: 20, buff: { id: 'pact', dmg: 1.35, armor: 10 }, research: { cost: { gold: 180, souls: 3 }, time: 35 } });
  I('gate_of_hell', 'Gate of Hell', '◎', { desc: 'Open a portal that disgorges a fiend every few seconds for 40 s.', age: 2, req: 'summon_imps', range: 18, radius: 3, cd: 150, cost: { mana: 120, souls: 8 }, kind: 'zone', zk: 'gate', dur: 40, every: 5, unit: ['brute', 'hellhound', 'imp'], research: { cost: { gold: 380, souls: 8 }, time: 60 } });
  I('meteor', 'Meteor', '☄', { desc: 'After a 2.5 s warning a meteor crashes down: huge damage, crushing structures, leaving fire.', age: 2, req: 'hellfire_rain', range: 28, radius: 8, cd: 80, cost: { mana: 140 }, kind: 'delay', delay: 2.5, dmg: 420, dtype: 'fire', bld: 1.6, siege: true, ignite: true, research: { cost: { gold: 400, souls: 6 }, time: 65 } });

  const B = (...a) => L.push(mk('blood', ...a));
  B('blood_pact', 'Blood Pact', '♥', { desc: 'The caster bleeds to heal every ally nearby.', start: true, target: 'self', range: 0, radius: 12, tgt: 'ally', cd: 25, cost: { mana: 25, hp: 60 }, kind: 'aoe', heal: 110 });
  B('crimson_nova', 'Crimson Nova', '✹', { desc: 'A burst of blood around the caster scorches foes and mends allies.', start: true, target: 'self', range: 0, radius: 9, cd: 25, cost: { mana: 45, hp: 45 }, kind: 'aoe', dmg: 130, dtype: 'dark', bld: 0.5, heal: 40 });
  B('sacrifice_power', 'Sacrifice for Power', '🗡', { desc: 'Slay a friendly unit: gain mana and souls, and nearby allies burn with zeal for 20 s.', target: 'unit', tgt: 'ally', range: 12, radius: 15, cd: 20, cost: { mana: 0 }, kind: 'sacrifice', mana: 60, souls: 2, buff: { id: 'zeal', dmg: 1.25 }, dur: 20, research: { cost: { gold: 100, blood: 40 }, time: 22 } });
  B('martyr_blessing', "Martyr's Blessing", '✚', { desc: 'Shield a friend (absorbs 150 damage for 15 s); when it expires or breaks it bursts.', target: 'unit', tgt: 'ally', range: 16, cd: 20, cost: { mana: 40 }, kind: 'shield', amount: 150, dur: 15, burst: 90, burstR: 5, age: 1, req: 'blood_pact', research: { cost: { gold: 130 }, time: 28 } });
  B('mind_thrall', 'Mind Thrall', '👁', { desc: 'Bend an enemy mind: it fights for you for 12 s (not generals).', target: 'unit', range: 14, cd: 50, cost: { mana: 80 }, kind: 'thrall', dur: 12, age: 1, req: 'crimson_nova', research: { cost: { gold: 220, souls: 3 }, time: 45 } });
  B('fanatic_frenzy', 'Fanatic Frenzy', '❢', { desc: 'Allies nearby attack 50% faster, move 30% faster and hit 25% harder, but take 20% more damage.', tgt: 'ally', range: 20, radius: 11, age: 1, req: 'sacrifice_power', cd: 40, cost: { mana: 45, blood: 20 }, kind: 'buff', dur: 14, buff: { id: 'frenzy', as: 1.5, spd: 1.3, dmg: 1.25, take: 1.2 }, research: { cost: { gold: 150, blood: 40 }, time: 30 } });
  B('blood_rain', 'Blood Rain', '☔', { desc: 'A crimson downpour that heals allies and drowns enemies.', age: 2, req: 'martyr_blessing', range: 24, radius: 12, cd: 90, cost: { mana: 110, blood: 40 }, kind: 'zone', zk: 'bloodrain', dur: 12, dps: 18, heal: 16, dtype: 'dark', research: { cost: { gold: 320, blood: 80 }, time: 55 } });
  B('divine_wrath', 'Divine Wrath', '✝', { desc: 'After 1.5 s a column of holy-red light smites the spot.', age: 2, req: 'mind_thrall', range: 26, radius: 7, cd: 100, cost: { mana: 150, souls: 5 }, kind: 'delay', delay: 1.5, dmg: 380, dtype: 'dark', bld: 1.0, research: { cost: { gold: 380, souls: 6 }, time: 65 } });

  return L.concat(NEUTRAL());
}
function NEUTRAL() {
  const N = (id, name, icon, o) => mk('neutral', id, name, icon, { scroll: true, ...o });
  return [
    N('scroll_blink', 'Scroll of Blinking', '➶', { desc: 'The caster steps through space to a point up to 30 m away.', target: 'point', range: 30, cd: 20, cost: { mana: 40 }, kind: 'teleport' }),
    N('scroll_sanctuary', 'Scroll of Sanctuary', '✧', { desc: 'A warded ground heals allies and hardens them for 14 s.', range: 18, radius: 7, tgt: 'ally', cd: 50, cost: { mana: 60 }, kind: 'zone', zk: 'sanctuary', dur: 14, heal: 12, buff: { id: 'sanct', armor: 8 } }),
    N('scroll_reveal', 'Scroll of Sight', '◉', { desc: 'Reveals a wide stretch of the map for 20 s.', range: 80, radius: 40, cd: 40, cost: { mana: 30 }, kind: 'reveal', dur: 20 }),
    N('scroll_doom', 'Scroll of Doom', '☠', { desc: 'A shockwave stuns enemies for 3 s and wounds them.', range: 22, radius: 6, cd: 60, cost: { mana: 80 }, kind: 'aoe', dmg: 80, dtype: 'dark', stun: 3, bld: 0.3 }),
  ];
}
// magic tower bolts per school (free of spell research; cost a little team mana per shot, see Magic.towerCast)
export const TOWER_BOLTS = {
  necromancy: { name: 'Bone Bolt', dmg: 38, dtype: 'dark', radius: 0, mana: 6, slow: 0.8 },
  warmagic: { name: 'Storm Bolt', dmg: 34, dtype: 'lightning', radius: 2.5, mana: 6, chain: 2 },
  infernal: { name: 'Hell Bolt', dmg: 36, dtype: 'fire', radius: 3, mana: 7, burn: true },
  blood: { name: 'Blood Bolt', dmg: 32, dtype: 'dark', radius: 0, mana: 6, healAlly: 24 },
};
