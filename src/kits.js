// FOGBOUND v0.5 SKILLS lane: the League-of-Legends style kit data. Pure data (no imports, no DOM, no sim): 4 classes x 8 skills (3 levels, 3 upgrade branches each)
// plus 2 ultimates per class. Logic (offers, picks, level / branch application) lives in perks.js. See src/V5.md "SKILLS lane API".
//
// Skill fields (vocabulary of sim.js castSkill, see also skillaim.js): id name icon desc cd type aim dtype color + type fields
//   type line:   len w dmg stun burn            bolt:  dmg range spd split(n bolts) stun burn slow {m,dur} hold      strike: len arc dmg stun close behind
//   type aoe:    radius dmg stun burn delay self range    zone: radius dps dur slow range wall    dash: dist toPoint dmg stun inv hide land {radius,dmg,stun}
//   type fan:    n arc dmg range stun burn slow           buff: radius dur dmg atkSpd spd healPct  shield: amt dur   debuff: radius take deal dur range
//   type blink:  range radius dmg                         smoke: radius hide slow dur range        summon: unit n dur (+ hpMul dmgMul)
//   rider (any type, applied by perks.castRiders after the cast): { zone:{r,dps,dur,slow,dtype,color}, ring:{r,dmg,stun}, scatter:{n,r,dmg,spread,delay}, echo:{delay,mul},
//                  haste:{m,dur}, allyHeal:{r,frac}, slow:{r,m,dur} }   castHeal / castShield (fractions of max health) work on every type.
// `br` = the three upgrade branches { name, desc, fn(o) } (fn mutates a copy of the skill after the level scaling).
// Ultimates (`ult:true`, key R, charge-and-release): same fields as the old charged spells + kind 'blast' | 'rain' | 'storm'.

export const KIT = {
  dmgMul: 1.35,          // global knob: every skill's damage (dmg, dps, land.dmg) x this at cast time (short fights; hero damage "up")
  lvDmg: 0.2, lvCd: 0.05, lvSize: 0.05, // per level above 1: +30% damage, -8% cooldown, +7% radius / length / range
  maxSkillLv: 5,
  ultLevel: 5,           // hero level that offers the ultimate (R)
  startOfferLvl: 1,      // an offer is queued for hero level 1 (first extra skill) at the start
};

export const scaleDmg = (o, k) => { // scale every damage-like field (also riders)
  if (typeof o.dmg === 'number') o.dmg *= k;
  if (typeof o.dps === 'number') o.dps *= k;
  if (o.land) o.land = { ...o.land, dmg: o.land.dmg * k };
  if (o.rider) {
    const r = { ...o.rider };
    if (r.ring) r.ring = { ...r.ring, dmg: r.ring.dmg * k };
    if (r.scatter) r.scatter = { ...r.scatter, dmg: r.scatter.dmg * k };
    if (r.zone) r.zone = { ...r.zone, dps: r.zone.dps * k };
    o.rider = r;
  }
};
const D = scaleDmg;
const R = (o, r) => { o.rider = { ...(o.rider || {}), ...r }; }; // merge a rider
const sz = (o, k) => { for (const f of ['radius', 'len', 'range', 'dist']) if (typeof o[f] === 'number') o[f] *= k; };

export const SKILLS = {};
const add = (cls, id, o) => { SKILLS[id] = { id, cls, dtype: 'physical', aim: 'self', ...o }; };

// =================================================================================================== SOLDIER (sword and shield: tank, stuns, allies)
add('soldier', 'bash', {
  name: 'Shield Bash', icon: '⛉', desc: 'Slam your shield into everything in front of you: damage and a short stun.', cd: 4, type: 'strike', aim: 'cone', len: 3.8, arc: 1.7, dmg: 52, stun: 1.0, bldMul: 0.4, color: 0xc8ccd4,
  br: [
    { name: 'Concussion', desc: 'Stuns 0.8 s longer and hits 15% harder.', fn: (o) => { o.stun += 0.8; D(o, 1.15); } },
    { name: 'Wide Swing', desc: 'The bash arcs 50% wider and reaches 25% farther.', fn: (o) => { o.arc *= 1.5; o.len *= 1.25; } },
    { name: 'Shield Wall', desc: 'Bashing shields you for 15% of your health for 4 s.', fn: (o) => { o.castShield = 0.15; } },
  ],
});
add('soldier', 'rush', {
  name: 'Shield Rush', icon: '➠', desc: 'Dodge: rush up to 11 m toward the cursor, hitting and stunning what you pass.', cd: 7, type: 'dash', aim: 'dash', toPoint: true, dist: 11, dmg: 42, stun: 0.8, inv: 0.45, dodge: true, color: 0xc8ccd4,
  br: [
    { name: 'Trample', desc: 'Hits 50% harder.', fn: (o) => D(o, 1.5) },
    { name: 'Rally', desc: 'Allies within 9 m are healed for 12% of their health.', fn: (o) => R(o, { allyHeal: { r: 9, frac: 0.12 } }) },
    { name: 'Quick Rush', desc: 'Recharges 30% faster and goes 20% farther.', fn: (o) => { o.cd *= 0.7; o.dist *= 1.2; } },
  ],
});
add('soldier', 'slam', {
  name: 'Ground Slam', icon: '◎', desc: 'A stunning shockwave around you.', cd: 8, type: 'aoe', aim: 'self', self: true, radius: 6, dmg: 70, stun: 1.2, bldMul: 1.0, color: 0xe8a050,
  br: [
    { name: 'Aftershock', desc: 'A second shockwave follows 0.6 s later for 70% damage.', fn: (o) => R(o, { echo: { delay: 0.6, mul: 0.7 } }) },
    { name: 'Quake', desc: 'The shockwave is 30% wider and hits 15% harder.', fn: (o) => { o.radius *= 1.3; D(o, 1.15); } },
    { name: 'Crushing', desc: 'Stuns 0.8 s longer.', fn: (o) => { o.stun += 0.8; } },
  ],
});
add('soldier', 'guard', {
  name: 'Iron Guard', icon: '⛨', desc: 'Raise your shield: absorb damage for 6 s.', cd: 10, type: 'shield', aim: 'self', amt: 150, dur: 6,
  br: [
    { name: 'Bulwark', desc: 'The shield absorbs 50% more.', fn: (o) => { o.amt *= 1.5; } },
    { name: 'Retaliate', desc: 'Raising it bursts out: 40 damage and a short stun around you.', fn: (o) => R(o, { ring: { r: 5, dmg: 40, stun: 0.8 } }) },
    { name: 'Long Guard', desc: 'Lasts 4 s longer and recharges 15% faster.', fn: (o) => { o.dur += 4; o.cd *= 0.85; } },
  ],
});
add('soldier', 'cry', {
  name: 'Battle Cry', icon: '⚑', desc: 'Allies nearby: +25% damage and +30% attack speed for 6 s.', cd: 12, type: 'buff', aim: 'self', radius: 14, dur: 6, dmg: 1.25, atkSpd: 1.3, spd: 1.0, color: 0xe0c060,
  br: [
    { name: 'Rally Heal', desc: 'Also heals allies for 15% of their health.', fn: (o) => { o.healPct = 0.15; } },
    { name: 'Savage Cry', desc: 'Allies deal +40% damage instead of +25%.', fn: (o) => { o.dmg = 1.4; } },
    { name: 'Far Cry', desc: 'Reaches 50% farther and lasts 3 s longer.', fn: (o) => { o.radius *= 1.5; o.dur += 3; } },
  ],
});
add('soldier', 'javelin', {
  name: 'Javelin', icon: '↗', desc: 'Hurl a heavy javelin that pierces everything in its path.', cd: 6, type: 'bolt', aim: 'line', dmg: 78, range: 18, spd: 32, color: 0xe0d0b0,
  br: [
    { name: 'Heavy Throw', desc: 'Hits 40% harder and stuns for 0.6 s.', fn: (o) => { D(o, 1.4); o.stun = 0.6; } },
    { name: 'Twin Javelins', desc: 'Throws two javelins in a fan.', fn: (o) => { o.split = 2; } },
    { name: 'Long Throw', desc: '30% farther and recharges 20% faster.', fn: (o) => { o.range *= 1.3; o.cd *= 0.8; } },
  ],
});
add('soldier', 'leap', {
  name: 'Savage Leap', icon: '⤓', desc: 'Dodge: leap to the cursor (up to 13 m) and crash down: damage and stun where you land.', cd: 8, type: 'dash', aim: 'dash', toPoint: true, dist: 13, inv: 0.45, land: { radius: 4.5, dmg: 72, stun: 0.9 }, dodge: true, color: 0xe8a050,
  br: [
    { name: 'Crater', desc: 'The landing blast is 35% wider.', fn: (o) => { o.land = { ...o.land, radius: o.land.radius * 1.35 }; } },
    { name: 'Triumphant Landing', desc: 'Landing heals you for 8% of your health and shields you.', fn: (o) => { o.castHeal = 0.08; o.castShield = 0.1; } },
    { name: 'Rebound', desc: 'Recharges 30% faster.', fn: (o) => { o.cd *= 0.7; } },
  ],
});
add('soldier', 'call', {
  name: 'Call the Guard', icon: '⚔', desc: 'Summon 2 knights who fight beside you for 20 s.', cd: 16, type: 'summon', aim: 'self', unit: 'knight', n: 2, dur: 20, color: 0xc8ccd4,
  br: [
    { name: 'More Blades', desc: 'One more knight answers the call.', fn: (o) => { o.n += 1; } },
    { name: 'Lasting Oath', desc: 'The guard stays 60% longer.', fn: (o) => { o.dur *= 1.6; } },
    { name: 'Veteran Guard', desc: 'Knights are 50% tougher and hit 30% harder.', fn: (o) => { o.hpMul = (o.hpMul || 1) * 1.5; o.dmgMul = (o.dmgMul || 1) * 1.3; } },
  ],
});

// =================================================================================================== HUNTER (longbow: range, traps, mobility)
add('hunter', 'powershot', {
  name: 'Power Shot', icon: '⇀', desc: 'A piercing arrow. Hold to draw it for up to double damage.', cd: 4, type: 'bolt', aim: 'line', dmg: 58, range: 24, spd: 42, color: 0xcfd6a0, hold: { max: 0.9, scale: { dmg: 1.8, range: 1.15 } },
  br: [
    { name: 'Heavy Draw', desc: 'Drawing the bow grants up to 2.5x damage.', fn: (o) => { o.hold = { max: 1.1, scale: { dmg: 2.5, range: 1.25 } }; } },
    { name: 'Splitshot', desc: 'Looses three arrows in a fan.', fn: (o) => { o.split = 3; } },
    { name: 'Hunter\'s Focus', desc: 'Recharges 30% faster.', fn: (o) => { o.cd *= 0.7; } },
  ],
});
add('hunter', 'volley', {
  name: 'Volley', icon: '⇶', desc: 'Loose 5 arrows in a spread.', cd: 5, type: 'fan', aim: 'cone', n: 5, arc: 0.7, dmg: 28, range: 18, kind: 'arrow', color: 0xe0d09a,
  br: [
    { name: 'Rain of Arrows', desc: '9 arrows in a much wider spread.', fn: (o) => { o.n = 9; o.arc = 1.3; } },
    { name: 'Barbed Heads', desc: 'Arrows hit 30% harder and slow for 2 s.', fn: (o) => { D(o, 1.3); o.slow = { m: 0.6, dur: 2 }; } },
    { name: 'Quick Nock', desc: 'Recharges 40% faster.', fn: (o) => { o.cd *= 0.6; } },
  ],
});
add('hunter', 'tumble', {
  name: 'Tumble', icon: '↻', desc: 'Dodge: roll up to 7 m toward the cursor, untouchable for 0.5 s.', cd: 5, type: 'dash', aim: 'dash', toPoint: true, dist: 7, inv: 0.5, dodge: true,
  br: [
    { name: 'Trick Shot', desc: 'Fire a burst where you land: 45 damage around you.', fn: (o) => { o.land = { radius: 3.5, dmg: 45, stun: 0 }; } },
    { name: 'Fleet Foot', desc: '+35% movement speed for 2.5 s after rolling.', fn: (o) => R(o, { haste: { m: 1.35, dur: 2.5 } }) },
    { name: 'Smoke Roll', desc: 'Roll farther and vanish from sight for 2 s.', fn: (o) => { o.dist *= 1.25; o.hide = 2; } },
  ],
});
add('hunter', 'trap', {
  name: 'Spike Trap', icon: '✱', desc: 'Scatter spikes at the cursor: damage and slow for 6 s.', cd: 8, type: 'zone', aim: 'ground', range: 12, radius: 4, dps: 30, dur: 6, slow: 0.5, color: 0xc0c8d8,
  br: [
    { name: 'Snare', desc: 'Slows to a crawl and lasts 2 s longer.', fn: (o) => { o.slow = 0.25; o.dur += 2; } },
    { name: 'Blast Trap', desc: 'Detonates when placed: 60 damage and a stun.', fn: (o) => R(o, { ring: { r: 4, dmg: 60, stun: 0.8, at: 'impact' } }) },
    { name: 'Wide Net', desc: '40% bigger area.', fn: (o) => { o.radius *= 1.4; } },
  ],
});
add('hunter', 'huntmark', {
  name: "Hunter's Mark", icon: '◉', desc: 'Marked enemies take +35% damage for 8 s.', cd: 9, type: 'debuff', aim: 'ground', range: 20, radius: 4, take: 1.35, deal: 1, dur: 8, color: 0xff6060,
  br: [
    { name: 'Death Mark', desc: 'Marked enemies take +60% damage.', fn: (o) => { o.take = 1.6; } },
    { name: 'Wide Mark', desc: 'The mark covers a 60% larger area.', fn: (o) => { o.radius *= 1.6; } },
    { name: 'Weakness', desc: 'Marked enemies also deal 30% less damage.', fn: (o) => { o.deal = 0.7; } },
  ],
});
add('hunter', 'explosive', {
  name: 'Explosive Arrow', icon: '✹', desc: 'An arrow that explodes at the cursor after a blink: damage and burning.', cd: 7, type: 'aoe', aim: 'ground', dtype: 'fire', range: 22, radius: 4, dmg: 72, delay: 0.35, burn: 3, bldMul: 0.8, color: 0xff9040,
  br: [
    { name: 'Cluster Arrow', desc: 'Three smaller blasts burst around the impact.', fn: (o) => R(o, { scatter: { n: 3, r: 3, dmg: 36, spread: 5, delay: 0.35 } }) },
    { name: 'Inferno', desc: 'Leaves a burning patch for 4 s.', fn: (o) => R(o, { zone: { r: 4, dps: 24, dur: 4, dtype: 'fire', color: 0xff7a2a } }) },
    { name: 'Big Boom', desc: 'The blast is 35% wider.', fn: (o) => { o.radius *= 1.35; } },
  ],
});
add('hunter', 'rapid', {
  name: 'Rapid Fire', icon: '≫', desc: 'You loose arrows far faster (+60% attack speed, +20% damage) for 5 s.', cd: 10, type: 'buff', aim: 'self', radius: 0.1, dur: 5, dmg: 1.2, atkSpd: 1.6, spd: 1.0, color: 0xe0d09a,
  br: [
    { name: 'Marksman', desc: 'Also +40% damage instead of +20%.', fn: (o) => { o.dmg = 1.4; } },
    { name: 'Endurance', desc: 'Lasts 3 s longer.', fn: (o) => { o.dur += 3; } },
    { name: 'Adrenaline', desc: '+25% movement speed while it lasts.', fn: (o) => { o.spd = 1.25; } },
  ],
});
add('hunter', 'pack', {
  name: 'Call the Pack', icon: '☗', desc: 'Summon 2 war hounds for 18 s.', cd: 16, type: 'summon', aim: 'self', unit: 'warhound', n: 2, dur: 18, color: 0x6fae5a,
  br: [
    { name: 'Bigger Pack', desc: 'One more hound.', fn: (o) => { o.n += 1; } },
    { name: 'Long Hunt', desc: 'The pack stays 60% longer.', fn: (o) => { o.dur *= 1.6; } },
    { name: 'Alpha', desc: 'Hounds are 50% tougher and bite 40% harder.', fn: (o) => { o.hpMul = (o.hpMul || 1) * 1.5; o.dmgMul = (o.dmgMul || 1) * 1.4; } },
  ],
});

// =================================================================================================== MAGE (staff: area damage, control, glass cannon)
add('mage', 'arcbolt', {
  name: 'Arcane Bolt', icon: '✶', desc: 'A piercing bolt of arcane power.', cd: 3.5, type: 'bolt', aim: 'line', dtype: 'cold', dmg: 56, range: 22, spd: 34, color: 0x9fb4ff,
  br: [
    { name: 'Chilling Bolt', desc: 'Slows everything it hits by 40% for 2 s.', fn: (o) => { o.slow = { m: 0.6, dur: 2 }; } },
    { name: 'Overcharge', desc: 'Hold to charge: up to 2x damage and range.', fn: (o) => { o.hold = { max: 1, scale: { dmg: 2, range: 1.25 } }; } },
    { name: 'Twin Bolt', desc: 'Fires two bolts in a fan.', fn: (o) => { o.split = 2; } },
  ],
});
add('mage', 'fireball', {
  name: 'Fireball', icon: '♨', desc: 'Hurl a fireball at the cursor: it explodes and sets enemies alight.', cd: 6, type: 'aoe', aim: 'ground', dtype: 'fire', range: 20, radius: 4, dmg: 82, delay: 0.3, burn: 3, bldMul: 0.7, color: 0xff7a2a,
  br: [
    { name: 'Splitting Fireball', desc: 'Three smaller fireballs burst around the impact.', fn: (o) => R(o, { scatter: { n: 3, r: 3, dmg: 40, spread: 5, delay: 0.35 } }) },
    { name: 'Burning Ground', desc: 'Leaves a burning patch for 5 s.', fn: (o) => R(o, { zone: { r: 4, dps: 26, dur: 5, dtype: 'fire', color: 0xff7a2a } }) },
    { name: 'Bigger Blast', desc: 'The explosion is 40% wider.', fn: (o) => { o.radius *= 1.4; } },
  ],
});
add('mage', 'frostnova', {
  name: 'Frost Nova', icon: '❄', desc: 'A ring of frost around you: damage and a 2.5 s slow.', cd: 7, type: 'aoe', aim: 'self', self: true, dtype: 'cold', radius: 6.5, dmg: 55, bldMul: 0.4, color: 0x9fe0ff, rider: { slow: { r: 6.5, m: 0.5, dur: 2.5 } },
  br: [
    { name: 'Deep Freeze', desc: 'Also stuns for 1 s.', fn: (o) => { o.stun = 1.0; } },
    { name: 'Wide Nova', desc: '40% wider.', fn: (o) => { o.radius *= 1.4; o.rider = { ...o.rider, slow: { ...o.rider.slow, r: o.radius } }; } },
    { name: 'Rime Armour', desc: 'Casting shields you for 12% of your health.', fn: (o) => { o.castShield = 0.12; } },
  ],
});
add('mage', 'blink', {
  name: 'Blink', icon: '⚡', desc: 'Dodge: teleport up to 11 m toward the cursor, briefly untouchable.', cd: 6, type: 'dash', aim: 'dash', toPoint: true, dist: 11, inv: 0.35, dodge: true, color: 0x9fb4ff,
  br: [
    { name: 'Blink Burst', desc: 'An arcane burst where you arrive: 50 damage.', fn: (o) => { o.land = { radius: 4, dmg: 50, stun: 0 }; } },
    { name: 'Phase', desc: 'Recharges 35% faster.', fn: (o) => { o.cd *= 0.65; } },
    { name: 'Hasty Step', desc: '+30% movement speed for 3 s.', fn: (o) => R(o, { haste: { m: 1.3, dur: 3 } }) },
  ],
});
add('mage', 'lightning', {
  name: 'Lightning Bolt', icon: '↯', desc: 'A crackling bolt along a line: damage and a short stun.', cd: 5, type: 'line', aim: 'line', dtype: 'lightning', len: 14, w: 2.2, dmg: 70, stun: 0.4, color: 0xffe860,
  br: [
    { name: 'Wide Arc', desc: 'The bolt is twice as wide.', fn: (o) => { o.w *= 2; } },
    { name: 'Overload', desc: 'Stuns 0.8 s longer and hits 20% harder.', fn: (o) => { o.stun += 0.8; D(o, 1.2); } },
    { name: 'Long Arc', desc: '40% longer and recharges 15% faster.', fn: (o) => { o.len *= 1.4; o.cd *= 0.85; } },
  ],
});
add('mage', 'meteor', {
  name: 'Meteor', icon: '☄', desc: 'A meteor crashes at the cursor after a short delay: heavy damage, burning.', cd: 8, type: 'aoe', aim: 'ground', dtype: 'fire', range: 22, radius: 5.5, dmg: 125, delay: 0.9, burn: 4, bldMul: 1.0, color: 0xff7020,
  br: [
    { name: 'Twin Meteors', desc: 'A second meteor lands nearby.', fn: (o) => R(o, { scatter: { n: 1, r: 5, dmg: 100, spread: 6, delay: 0.5 } }) },
    { name: 'Molten Ground', desc: 'Leaves molten rock for 5 s.', fn: (o) => R(o, { zone: { r: 5, dps: 28, dur: 5, dtype: 'fire', color: 0xff5a1a } }) },
    { name: 'Impact', desc: 'Stuns 1.2 s and is 20% wider.', fn: (o) => { o.stun = 1.2; o.radius *= 1.2; } },
  ],
});
add('mage', 'barrier', {
  name: 'Arcane Barrier', icon: '◯', desc: 'A barrier absorbs damage for 5 s.', cd: 9, type: 'shield', aim: 'self', amt: 120, dur: 5, color: 0x9fb4ff,
  br: [
    { name: 'Reflective Ward', desc: 'Casting bursts out: 50 damage and a short stun around you.', fn: (o) => R(o, { ring: { r: 4.5, dmg: 50, stun: 0.5 } }) },
    { name: 'Siphon', desc: 'Casting heals you for 10% of your health.', fn: (o) => { o.castHeal = 0.1; } },
    { name: 'Greater Ward', desc: '60% stronger and lasts 2 s longer.', fn: (o) => { o.amt *= 1.6; o.dur += 2; } },
  ],
});
add('mage', 'conjure', {
  name: 'Conjure Battle-Mage', icon: '☽', desc: 'Summon a battle-mage who casts fire bolts for 18 s.', cd: 16, type: 'summon', aim: 'self', unit: 'battlemage', n: 1, dur: 18, color: 0x7b8cff,
  br: [
    { name: 'Second Mage', desc: 'One more battle-mage.', fn: (o) => { o.n += 1; } },
    { name: 'Lasting Pact', desc: 'They stay 60% longer.', fn: (o) => { o.dur *= 1.6; } },
    { name: 'Archmages', desc: 'They are 50% tougher and cast 40% harder.', fn: (o) => { o.hpMul = (o.hpMul || 1) * 1.5; o.dmgMul = (o.dmgMul || 1) * 1.4; } },
  ],
});

// =================================================================================================== OUTLAW (twin daggers: burst, mobility, stealth)
add('outlaw', 'cutthroat', {
  name: 'Cutthroat', icon: '†', desc: 'A quick stab in front of you. Enemies not facing you take 2x damage.', cd: 3.5, type: 'strike', aim: 'cone', len: 3.4, arc: 1.5, dmg: 50, behind: { mul: 2 }, bldMul: 0.5, color: 0xd8e0f0,
  br: [
    { name: "Assassin's Edge", desc: 'Attacks from behind deal 3x damage.', fn: (o) => { o.behindAdd = 1; } },
    { name: 'Rending Blades', desc: 'Hits 20% harder and makes enemies bleed.', fn: (o) => { D(o, 1.2); o.burn = 3; } },
    { name: 'Quick Cuts', desc: 'Recharges 30% faster.', fn: (o) => { o.cd *= 0.7; } },
  ],
});
add('outlaw', 'fan', {
  name: 'Knife Fan', icon: '✧', desc: 'Throw 7 knives in a cone.', cd: 5, type: 'fan', aim: 'cone', n: 7, arc: 1.2, dmg: 20, range: 13, kind: 'knife', color: 0xd8e0f0,
  br: [
    { name: 'More Knives', desc: '11 knives in a wider cone.', fn: (o) => { o.n = 11; o.arc = 1.6; } },
    { name: 'Crippling Knives', desc: 'Knives slow enemies by 40% for 2 s.', fn: (o) => { o.slow = { m: 0.6, dur: 2 }; } },
    { name: 'Long Range', desc: '40% farther and 20% harder.', fn: (o) => { o.range *= 1.4; D(o, 1.2); } },
  ],
});
add('outlaw', 'step', {
  name: 'Shadow Step', icon: '➤', desc: 'Dodge: dash up to 10 m toward the cursor, unseen for 2.5 s.', cd: 6, type: 'dash', aim: 'dash', toPoint: true, dist: 10, hide: 2.5, inv: 0.3, dodge: true, color: 0x6a5a8a,
  br: [
    { name: 'Backstab Step', desc: 'A burst of daggers where you land: 45 damage.', fn: (o) => { o.land = { radius: 3, dmg: 45, stun: 0 }; } },
    { name: 'Vanish', desc: 'Unseen for 2 s longer and untouchable 0.3 s longer.', fn: (o) => { o.hide += 2; o.inv += 0.3; } },
    { name: 'Fleet Step', desc: 'Recharges 30% faster and grants +30% speed for 2 s.', fn: (o) => { o.cd *= 0.7; R(o, { haste: { m: 1.3, dur: 2 } }); } },
  ],
});
add('outlaw', 'smoke', {
  name: 'Smoke Bomb', icon: '◌', desc: 'Throw a smoke bomb at the cursor. Standing in it hides you; enemies inside are slowed.', cd: 9, type: 'smoke', aim: 'ground', range: 11, radius: 5, hide: 3, slow: 0.55, dur: 4, color: 0x9aa0aa,
  br: [
    { name: 'Choking Smoke', desc: 'The cloud also deals damage.', fn: (o) => R(o, { zone: { r: 5, dps: 26, dur: 4, dtype: 'poison', color: 0x88e040 } }) },
    { name: 'Wide Cloud', desc: '50% bigger and lasts 2 s longer.', fn: (o) => { o.radius *= 1.5; o.dur += 2; } },
    { name: 'Blinding Cloud', desc: 'Slows enemies to a crawl.', fn: (o) => { o.slow = 0.3; } },
  ],
});
add('outlaw', 'assassinate', {
  name: 'Assassinate', icon: '✦', desc: 'Blink behind the enemy nearest the cursor and strike. +30% if it is not facing you.', cd: 8, type: 'blink', aim: 'ground', range: 14, radius: 4, dmg: 100, color: 0xd8e0f0,
  br: [
    { name: 'Executioner', desc: 'Hits 40% harder.', fn: (o) => D(o, 1.4) },
    { name: 'Reset', desc: 'Recharges 40% faster.', fn: (o) => { o.cd *= 0.6; } },
    { name: 'Shadow Burst', desc: 'Strikes with a burst: 45 damage to everything around the target.', fn: (o) => R(o, { ring: { r: 4, dmg: 45, stun: 0 } }) },
  ],
});
add('outlaw', 'rushblade', {
  name: 'Blade Rush', icon: '➶', desc: 'Dash through enemies up to 8 m, cutting them as you pass.', cd: 6, type: 'dash', aim: 'dash', toPoint: true, dist: 8, dmg: 58, stun: 0.4, inv: 0.2, color: 0xd8e0f0,
  br: [
    { name: 'Whirling Blades', desc: 'Hits 40% harder.', fn: (o) => D(o, 1.4) },
    { name: 'Twin Rush', desc: 'Recharges 30% faster.', fn: (o) => { o.cd *= 0.7; } },
    { name: 'Ghost Rush', desc: 'Untouchable for 0.3 s longer and unseen for 2 s.', fn: (o) => { o.inv += 0.3; o.hide = 2; } },
  ],
});
add('outlaw', 'deathmark', {
  name: 'Mark for Death', icon: '☠', desc: 'Marked enemies take +40% damage for 8 s.', cd: 9, type: 'debuff', aim: 'ground', range: 16, radius: 3.5, take: 1.4, deal: 1, dur: 8, color: 0xff6060,
  br: [
    { name: 'Contract', desc: 'Marked enemies take +70% damage.', fn: (o) => { o.take = 1.7; } },
    { name: 'Spreading Mark', desc: 'The mark covers a 70% larger area.', fn: (o) => { o.radius *= 1.7; } },
    { name: 'Demoralise', desc: 'Marked enemies also deal 30% less damage.', fn: (o) => { o.deal = 0.7; } },
  ],
});
add('outlaw', 'knives', {
  name: 'Hired Knives', icon: '⚑', desc: 'Hire 2 sellswords who fight for you for 18 s.', cd: 16, type: 'summon', aim: 'self', unit: 'sellsword', n: 2, dur: 18, color: 0xd9a441,
  br: [
    { name: 'More Knives', desc: 'One more sellsword.', fn: (o) => { o.n += 1; } },
    { name: 'Long Contract', desc: 'They stay 60% longer.', fn: (o) => { o.dur *= 1.6; } },
    { name: 'Elite Mercenaries', desc: 'Sellswords are 50% tougher and hit 40% harder.', fn: (o) => { o.hpMul = (o.hpMul || 1) * 1.5; o.dmgMul = (o.dmgMul || 1) * 1.4; } },
  ],
});

// =================================================================================================== v0.5b: single-target / skillshot skills (2 per class) for the League feel
add('soldier', 'hamstring', {
  name: 'Hamstring', icon: '⟋', desc: 'A narrow, heavy cut in front of you: big single-target damage and a slow.', cd: 7, type: 'strike', aim: 'cone', len: 4.6, arc: 0.7, dmg: 95, bldMul: 0.4, color: 0xd8dce4, rider: { slow: { r: 5.5, m: 0.55, dur: 2.2 } },
  br: [
    { name: 'Deep Cut', desc: 'Hits 40% harder.', fn: (o) => D(o, 1.4) },
    { name: 'Crippling', desc: 'The slow is much stronger and lasts longer.', fn: (o) => R(o, { slow: { r: 5.5, m: 0.3, dur: 3.5 } }) },
    { name: 'Trip', desc: 'Also stuns for 0.9 s.', fn: (o) => { o.stun = 0.9; } },
  ],
});
add('soldier', 'lunge', {
  name: 'Spear Lunge', icon: '➶', desc: 'Lunge up to 8 m toward the cursor, driving your spear through whoever is in the way.', cd: 9, type: 'dash', aim: 'dash', toPoint: true, dist: 8, dmg: 85, stun: 0.4, inv: 0.2, color: 0xe0d0b0,
  br: [
    { name: 'Far Lunge', desc: 'Reaches 40% farther.', fn: (o) => { o.dist *= 1.4; } },
    { name: 'Impale', desc: 'Hits 40% harder and stuns 0.8 s longer.', fn: (o) => { D(o, 1.4); o.stun += 0.8; } },
    { name: 'Quick Thrust', desc: 'Recharges 30% faster.', fn: (o) => { o.cd *= 0.7; } },
  ],
});
add('hunter', 'snipe', {
  name: 'Snipe', icon: '⌖', desc: 'A very long, very fast arrow. Hold to aim it for up to 1.8x damage.', cd: 9, type: 'bolt', aim: 'line', dmg: 115, range: 32, spd: 55, color: 0xe8e0b0, hold: { max: 1.2, scale: { dmg: 1.8, range: 1.1 } },
  br: [
    { name: 'Heavy Round', desc: 'Hits 35% harder and stuns 0.6 s.', fn: (o) => { D(o, 1.35); o.stun = 0.6; } },
    { name: 'Swift Reload', desc: 'Recharges 30% faster.', fn: (o) => { o.cd *= 0.7; } },
    { name: 'Long Sight', desc: '30% farther and 15% harder.', fn: (o) => { o.range *= 1.3; D(o, 1.15); } },
  ],
});
add('hunter', 'ensnare', {
  name: 'Ensnare', icon: '⌘', desc: 'Throw a net at the cursor: a small area that stuns after a short delay. Time it on a target.', cd: 10, type: 'aoe', aim: 'ground', range: 16, radius: 3, dmg: 40, stun: 1.6, delay: 0.5, bldMul: 0.3, color: 0xb8c890,
  br: [
    { name: 'Wide Net', desc: '50% wider.', fn: (o) => { o.radius *= 1.5; } },
    { name: 'Barbed Net', desc: 'Hits 80% harder.', fn: (o) => D(o, 1.8) },
    { name: 'Quick Net', desc: 'Lands faster and recharges 30% faster.', fn: (o) => { o.delay = 0.2; o.cd *= 0.7; } },
  ],
});
add('mage', 'frostbolt', {
  name: 'Frost Bolt', icon: '❄', desc: 'A bolt of frost: damage and a strong slow.', cd: 5, type: 'bolt', aim: 'line', dmg: 62, range: 20, spd: 30, dtype: 'cold', slow: { m: 0.45, dur: 2.5 }, color: 0x9fd8ff,
  br: [
    { name: 'Deep Freeze', desc: 'Slows harder for longer and stuns 0.6 s.', fn: (o) => { o.slow = { m: 0.3, dur: 4 }; o.stun = 0.6; } },
    { name: 'Icicle', desc: 'Hits 40% harder.', fn: (o) => D(o, 1.4) },
    { name: 'Shatter', desc: 'Fires three bolts in a fan.', fn: (o) => { o.split = 3; } },
  ],
});
add('mage', 'arcane', {
  name: 'Arcane Beam', icon: '⟿', desc: 'A wide beam straight ahead: the strongest hit of the mage, long cooldown.', cd: 11, type: 'line', aim: 'line', len: 16, w: 2.2, dmg: 120, dtype: 'cold', color: 0xb8a0ff,
  br: [
    { name: 'Overcharge', desc: 'Hits 40% harder.', fn: (o) => D(o, 1.4) },
    { name: 'Wide Beam', desc: '60% wider and 20% longer.', fn: (o) => { o.w *= 1.6; o.len *= 1.2; } },
    { name: 'Quick Cast', desc: 'Recharges 30% faster.', fn: (o) => { o.cd *= 0.7; } },
  ],
});
add('outlaw', 'poisonknife', {
  name: 'Poison Knife', icon: '☣', desc: 'Throw a knife: a little damage now, a lot over 4 s.', cd: 5, type: 'bolt', aim: 'line', dmg: 36, range: 16, spd: 36, burn: 4, dtype: 'poison', color: 0x8be04a,
  br: [
    { name: 'Festering', desc: 'The poison lasts 3 s longer.', fn: (o) => { o.burn += 3; } },
    { name: 'Heavy Blade', desc: 'Hits 50% harder.', fn: (o) => D(o, 1.5) },
    { name: 'Twin Knives', desc: 'Throws two knives in a fan.', fn: (o) => { o.split = 2; } },
  ],
});
add('outlaw', 'shadowdash', {
  name: 'Shadow Dash', icon: '≫', desc: 'Dash up to 9 m toward the cursor and vanish from sight for 2 s.', cd: 9, type: 'dash', aim: 'dash', toPoint: true, dist: 9, dmg: 30, inv: 0.35, hide: 2, dodge: true, color: 0x8a8ab8,
  br: [
    { name: 'Long Vanish', desc: 'Unseen for 2 s longer.', fn: (o) => { o.hide += 2; } },
    { name: 'Far Dash', desc: 'Reaches 40% farther.', fn: (o) => { o.dist *= 1.4; } },
    { name: 'Quick Step', desc: 'Recharges 35% faster.', fn: (o) => { o.cd *= 0.65; } },
  ],
});

// =================================================================================================== v0.6: three more skills per class and a third ultimate
add('soldier', 'groundpound', {
  name: 'Ground Pound', icon: '▮', desc: 'Smash the ground: a shockwave races straight ahead, hurting and briefly stunning everything in its line.', cd: 9, type: 'line', aim: 'line', len: 12, w: 3, dmg: 70, stun: 0.6, color: 0xe8a050,
  br: [
    { name: 'Heavier Fist', desc: 'Hits 40% harder.', fn: (o) => D(o, 1.4) },
    { name: 'Long Quake', desc: 'Travels 40% farther and 40% wider.', fn: (o) => { o.len *= 1.4; o.w *= 1.4; } },
    { name: 'Stunning Blow', desc: 'Stuns 1 s longer.', fn: (o) => { o.stun += 1; } },
  ],
});
add('soldier', 'whirlwind', {
  name: 'Whirlwind', icon: '✺', desc: 'Spin and cut everything around you.', cd: 7, type: 'aoe', aim: 'self', self: true, radius: 4.5, dmg: 55, bldMul: 0.6, color: 0xe8c080,
  br: [
    { name: 'Second Spin', desc: 'A second spin follows 0.5 s later for 70% damage.', fn: (o) => R(o, { echo: { delay: 0.5, mul: 0.7 } }) },
    { name: 'Bloodied Blades', desc: 'Hits 30% harder and heals you for 6% of your health.', fn: (o) => { D(o, 1.3); o.castHeal = 0.06; } },
    { name: 'Wide Arc', desc: '40% wider.', fn: (o) => { o.radius *= 1.4; } },
  ],
});
add('soldier', 'taunt', {
  name: "Challenger's Roar", icon: '☊', desc: 'Roar: enemies around you take 25% more damage and deal 30% less for 6 s.', cd: 14, type: 'debuff', aim: 'self', radius: 9, take: 1.25, deal: 0.7, dur: 6, range: 0, color: 0xff9040,
  br: [
    { name: 'Terrifying', desc: 'Enemies deal 45% less instead of 30%.', fn: (o) => { o.deal = 0.55; } },
    { name: 'Exposing', desc: 'Enemies take 45% more instead of 25%.', fn: (o) => { o.take = 1.45; } },
    { name: 'Far Roar', desc: '50% wider and lasts 3 s longer.', fn: (o) => { o.radius *= 1.5; o.dur += 3; } },
  ],
});
add('hunter', 'multishot', {
  name: 'Multi-Shot', icon: '⇶', desc: 'Loose five arrows in a cone.', cd: 6, type: 'fan', aim: 'cone', n: 5, arc: 0.8, dmg: 26, range: 15, color: 0xcfd6a0,
  br: [
    { name: 'Seven Arrows', desc: 'Seven arrows instead of five.', fn: (o) => { o.n = 7; } },
    { name: 'Barbed Arrows', desc: 'Hits 35% harder.', fn: (o) => D(o, 1.35) },
    { name: 'Long Draw', desc: '35% farther and recharges 20% faster.', fn: (o) => { o.range *= 1.35; o.cd *= 0.8; } },
  ],
});
add('hunter', 'beartrap', {
  name: 'Bear Trap', icon: '✱', desc: 'Throw a snare field at the cursor: it hurts and slows everything inside for 4 s.', cd: 12, type: 'zone', aim: 'ground', range: 14, radius: 3, dps: 14, dur: 4, slow: 0.3, color: 0xb8c890,
  br: [
    { name: 'Spiked Jaws', desc: 'Hurts 80% more.', fn: (o) => { o.dps *= 1.8; } },
    { name: 'Wide Field', desc: '50% wider and lasts 2 s longer.', fn: (o) => { o.radius *= 1.5; o.dur += 2; } },
    { name: 'Quick Trap', desc: 'Recharges 35% faster.', fn: (o) => { o.cd *= 0.65; } },
  ],
});
add('hunter', 'evade', {
  name: 'Evasive Roll', icon: '↻', desc: 'Dodge: roll up to 7 m toward the cursor, untouchable for 0.4 s.', cd: 6, type: 'dash', aim: 'dash', toPoint: true, dist: 7, inv: 0.4, dodge: true, color: 0xcfd6a0,
  br: [
    { name: 'Long Roll', desc: 'Rolls 40% farther.', fn: (o) => { o.dist *= 1.4; } },
    { name: 'Swift Recovery', desc: 'Recharges 35% faster.', fn: (o) => { o.cd *= 0.65; } },
    { name: 'Roll and Shoot', desc: 'Rolling also gives you 30% speed for 3 s.', fn: (o) => R(o, { haste: { m: 1.3, dur: 3 } }) },
  ],
});
add('mage', 'flamepool', {
  name: 'Flame Pool', icon: '♨', desc: 'Set the ground at the cursor ablaze for 5 s.', cd: 12, type: 'zone', aim: 'ground', range: 16, radius: 4, dps: 40, dur: 5, dtype: 'fire', color: 0xff7a2a,
  br: [
    { name: 'Inferno', desc: 'Burns 50% harder.', fn: (o) => { o.dps *= 1.5; } },
    { name: 'Wildfire', desc: '50% wider and lasts 2 s longer.', fn: (o) => { o.radius *= 1.5; o.dur += 2; } },
    { name: 'Smoke and Mirrors', desc: 'Also slows enemies inside by 40%.', fn: (o) => { o.slow = 0.6; } },
  ],
});
add('mage', 'timewarp', {
  name: 'Time Warp', icon: '⌛', desc: 'Allies nearby (and you): +40% attack speed and +30% movement for 5 s.', cd: 16, type: 'buff', aim: 'self', radius: 12, dur: 5, dmg: 1, atkSpd: 1.4, spd: 1.3, color: 0x9fb4ff,
  br: [
    { name: 'Lasting Warp', desc: 'Lasts 3 s longer.', fn: (o) => { o.dur += 3; } },
    { name: 'Mending Time', desc: 'Also heals allies for 12% of their health.', fn: (o) => { o.healPct = 0.12; } },
    { name: 'Quick Warp', desc: 'Recharges 35% faster.', fn: (o) => { o.cd *= 0.65; } },
  ],
});
add('mage', 'seekingorb', {
  name: 'Seeking Orb', icon: '◉', desc: 'A slow, heavy orb of force: big damage to what it hits.', cd: 8, type: 'bolt', aim: 'line', dmg: 85, range: 18, spd: 14, dtype: 'cold', color: 0xb8a0ff,
  br: [
    { name: 'Dense Orb', desc: 'Hits 40% harder.', fn: (o) => D(o, 1.4) },
    { name: 'Swift Orb', desc: 'Flies much faster and 25% farther.', fn: (o) => { o.spd = 26; o.range *= 1.25; } },
    { name: 'Splitting Orb', desc: 'Splits into three smaller orbs.', fn: (o) => { o.split = 3; } },
  ],
});
add('outlaw', 'bladedance', {
  name: 'Blade Dance', icon: '✧', desc: 'A quick flurry around you.', cd: 5, type: 'aoe', aim: 'self', self: true, radius: 3.5, dmg: 48, bldMul: 0.5, color: 0xd8e0f0,
  br: [
    { name: 'Faster Flurry', desc: 'Recharges 30% faster.', fn: (o) => { o.cd *= 0.7; } },
    { name: 'Razor Edge', desc: 'Hits 40% harder.', fn: (o) => D(o, 1.4) },
    { name: 'Dancing Step', desc: 'Also gives you +30% speed for 3 s.', fn: (o) => R(o, { haste: { m: 1.3, dur: 3 } }) },
  ],
});
add('outlaw', 'garrote', {
  name: 'Garrote', icon: '≈', desc: 'A narrow, close strike: stuns, and hits much harder from behind.', cd: 8, type: 'strike', aim: 'cone', len: 3.2, arc: 0.5, dmg: 70, stun: 1.2, behind: { mul: 1.8 }, bldMul: 0.3, color: 0xd8e0f0,
  br: [
    { name: 'Deeper Cut', desc: 'Hits 40% harder.', fn: (o) => D(o, 1.4) },
    { name: 'Chokehold', desc: 'Stuns 1 s longer.', fn: (o) => { o.stun += 1; } },
    { name: 'Backstabber', desc: 'Hits from behind for even more.', fn: (o) => { o.behind = { mul: 2.5 }; } },
  ],
});
add('outlaw', 'caltrops', {
  name: 'Caltrops', icon: '✱', desc: 'Scatter spikes at the cursor: they hurt and slow for 6 s.', cd: 11, type: 'zone', aim: 'ground', range: 12, radius: 3.5, dps: 20, dur: 6, slow: 0.5, color: 0xc0c8d8,
  br: [
    { name: 'Poisoned Spikes', desc: 'Hurt 60% more.', fn: (o) => { o.dps *= 1.6; } },
    { name: 'Big Patch', desc: '50% wider.', fn: (o) => { o.radius *= 1.5; } },
    { name: 'Quick Scatter', desc: 'Recharges 35% faster.', fn: (o) => { o.cd *= 0.65; } },
  ],
});

// MASTERY (second upgrade tier, offered once a skill is level 4+): generic effects that work on any skill type. kit.path2[skill] = index.
const STUNS = new Set(['strike', 'aoe', 'line', 'bolt', 'dash', 'fan']);
export const MASTERY = [
  { name: 'Swift', desc: 'Recharges 25% faster.', fn: (o) => { o.cd *= 0.75; } },
  { name: 'Mighty', desc: 'Hits 35% harder.', fn: (o) => D(o, 1.35) },
  { name: 'Reach', desc: '30% bigger and farther.', fn: (o) => { sz(o, 1.3); if (o.land) o.land = { ...o.land, radius: o.land.radius * 1.3 }; } },
  { name: 'Concussive', desc: 'Adds a 0.8 s stun.', fn: (o) => { if (STUNS.has(o.type)) o.stun = (o.stun || 0) + 0.8; else D(o, 1.2); } },
  { name: 'Chilling', desc: 'Slows nearby enemies by 45%.', fn: (o) => R(o, { slow: { r: 6, m: 0.55, dur: 2.5 } }) },
  { name: 'Searing', desc: 'Sets enemies burning (+3 s).', fn: (o) => { if (STUNS.has(o.type)) o.burn = (o.burn || 0) + 3; else D(o, 1.2); } },
  { name: 'Echoing', desc: 'Repeats 0.7 s later for half damage.', fn: (o) => { if (o.radius) R(o, { echo: { delay: 0.7, mul: 0.5 } }); else D(o, 1.25); } },
  { name: 'Vigor', desc: 'Casting heals you for 6% of your health.', fn: (o) => { o.castHeal = (o.castHeal || 0) + 0.06; } },
  { name: 'Guarded', desc: 'Casting shields you for 8% of your health.', fn: (o) => { o.castShield = (o.castShield || 0) + 0.08; } },
];

// =================================================================================================== ultimates (R): hold to charge (up to maxCharge s), release at the cursor
const ult = (cls, id, o) => { SKILLS[id] = { id, cls, ult: true, type: 'ult', aim: 'ground', kind: 'blast', cd: 40, range: 22, minR: 4, maxR: 8, minDmg: 90, maxDmg: 220, bldMul: 0.5, delay: 0, stun: 0, burn: 0, maxCharge: 1.6, dtype: 'physical', ...o }; };
ult('soldier', 'quake', { name: 'Earthbreaker', icon: '✺', desc: 'Hold, release at cursor. The earth shatters: heavy damage and a long stun.', range: 16, minR: 4, maxR: 8, minDmg: 100, maxDmg: 240, stun: 1.8, delay: 0.25, bldMul: 1.3, color: 0xd88a3a });
ult('soldier', 'bladestorm', { name: 'Blade Storm', icon: '✴', kind: 'storm', desc: 'Hold, release at cursor. A whirl of steel shreds everything inside for 3 s.', range: 14, minR: 4.5, maxR: 7.5, minDmg: 38, maxDmg: 80, bldMul: 0.6, pulses: 6, dur: 3, color: 0xdfe4ee });
ult('hunter', 'rain', { name: 'Arrow Storm', icon: '⇶', desc: 'Hold, release at cursor. A hail of arrows lands after a short delay.', range: 24, minR: 5, maxR: 9, minDmg: 85, maxDmg: 200, delay: 0.8, bldMul: 0.7, color: 0xcfd6a0 });
ult('hunter', 'hailstorm', { name: 'Hailstorm', icon: '☁', kind: 'rain', dtype: 'cold', desc: 'Hold, release at cursor. Icy arrows pour over the whole area for 4 s.', range: 26, minR: 7, maxR: 11, minDmg: 55, maxDmg: 120, bldMul: 0.7, n: 10, hitR: 3.2, dur: 4, delay: 0.7, color: 0x9fe0ff });
ult('mage', 'nova', { name: 'Arcane Cataclysm', icon: '✹', dtype: 'cold', desc: 'Hold, release at cursor. A huge arcane blast.', minDmg: 110, maxDmg: 260, bldMul: 1.15, delay: 0.2, color: 0x8fb0ff });
ult('mage', 'meteors', { name: 'Rain of Fire', icon: '☄', kind: 'rain', dtype: 'fire', desc: 'Hold, release at cursor. Burning stones fall over the whole area for 4 s.', range: 26, minR: 7, maxR: 11, minDmg: 62, maxDmg: 135, bldMul: 0.9, n: 10, hitR: 3.4, dur: 4, delay: 0.8, burn: 3, color: 0xff7a2a });
ult('outlaw', 'keg', { name: 'Powder Keg', icon: '❂', dtype: 'fire', desc: 'Hold, release at cursor. Fuse 1.8 s, then a big fiery blast.', range: 20, minR: 3.5, maxR: 7.5, minDmg: 100, maxDmg: 250, bldMul: 1.55, delay: 1.5, stun: 0.8, color: 0xffb040 });
ult('outlaw', 'blossom', { name: 'Death Blossom', icon: '✿', kind: 'storm', desc: 'Hold, release at cursor. A storm of knives rends the area for 3 s.', range: 14, minR: 4.5, maxR: 7.5, minDmg: 40, maxDmg: 85, bldMul: 0.4, pulses: 7, dur: 3, color: 0xd8e0f0 });

ult('soldier', 'avalanche', { name: 'Avalanche', icon: '⛰', kind: 'rain', desc: 'Hold, release at cursor. Boulders crash down across the area for 4 s.', range: 22, minR: 6, maxR: 10, minDmg: 70, maxDmg: 150, bldMul: 1.0, n: 9, hitR: 3.4, dur: 4, color: 0xb0a090 });
ult('hunter', 'execution', { name: 'Execution Shot', icon: '⌖', desc: 'Hold, release at cursor. One huge, precise blast: enormous damage in a small circle.', range: 28, minR: 2.4, maxR: 3.6, minDmg: 220, maxDmg: 520, delay: 0.9, bldMul: 1.0, color: 0xe8e0b0 });
ult('mage', 'blizzard', { name: 'Blizzard', icon: '❄', kind: 'storm', dtype: 'cold', desc: 'Hold, release at cursor. A freezing storm cuts everything inside for 4 s.', range: 18, minR: 5, maxR: 8.5, minDmg: 40, maxDmg: 90, bldMul: 0.5, pulses: 8, dur: 4, color: 0x9fd8ff });
ult('outlaw', 'venomrain', { name: 'Venom Rain', icon: '☣', kind: 'rain', dtype: 'poison', desc: 'Hold, release at cursor. Poisoned blades rain over the area for 4 s.', range: 22, minR: 6, maxR: 9.5, minDmg: 50, maxDmg: 110, bldMul: 0.4, n: 10, hitR: 3.2, dur: 4, color: 0x8be04a });

// =================================================================================================== classes
// start: Q skill at level 1. skills: the 8 ids. ults: 2 ids offered at hero level 5. prio: the order an allied AI hero prefers new skills in.
export const CLASSES = {
  soldier: { id: 'soldier', name: 'Soldier', start: 'bash',      skills: ['bash', 'rush', 'slam', 'guard', 'cry', 'javelin', 'leap', 'call', 'hamstring', 'lunge', 'groundpound', 'whirlwind', 'taunt'],            ults: ['quake', 'bladestorm', 'avalanche'], prio: ['slam', 'rush', 'cry', 'javelin', 'leap', 'hamstring', 'guard', 'lunge', 'call'] },
  hunter:  { id: 'hunter',  name: 'Hunter',  start: 'powershot', skills: ['powershot', 'volley', 'tumble', 'trap', 'huntmark', 'explosive', 'rapid', 'pack', 'snipe', 'ensnare', 'multishot', 'beartrap', 'evade'], ults: ['rain', 'hailstorm', 'execution'], prio: ['volley', 'tumble', 'explosive', 'trap', 'rapid', 'snipe', 'huntmark', 'ensnare', 'pack'] },
  mage:    { id: 'mage',    name: 'Hedge-Mage', start: 'arcbolt', skills: ['arcbolt', 'fireball', 'frostnova', 'blink', 'lightning', 'meteor', 'barrier', 'conjure', 'frostbolt', 'arcane', 'flamepool', 'timewarp', 'seekingorb'], ults: ['nova', 'meteors', 'blizzard'], prio: ['fireball', 'frostnova', 'blink', 'lightning', 'meteor', 'frostbolt', 'barrier', 'arcane', 'conjure'] },
  outlaw:  { id: 'outlaw',  name: 'Outlaw',  start: 'cutthroat', skills: ['cutthroat', 'fan', 'step', 'smoke', 'assassinate', 'rushblade', 'deathmark', 'knives', 'poisonknife', 'shadowdash', 'bladedance', 'garrote', 'caltrops'], ults: ['keg', 'blossom', 'venomrain'], prio: ['fan', 'step', 'assassinate', 'smoke', 'rushblade', 'poisonknife', 'deathmark', 'shadowdash', 'knives'] },
};
export const CLASS_IDS = Object.keys(CLASSES);
export const ULTS = Object.keys(SKILLS).filter((id) => SKILLS[id].ult);
export const KIT_SKILLS = Object.keys(SKILLS).filter((id) => !SKILLS[id].ult); // the 32 normal skills
