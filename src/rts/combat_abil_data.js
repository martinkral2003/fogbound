// UNITS lane: ability data (unit abilities + general skills). Pure data. Execution: combat_abilities.js.
// def: {id,name,type,cd,range,radius,dmg,dtype,dur,tgt:'none'|'self'|'unit'|'point',who:'enemy'|'ally',buff{mods},stun,slow,burn,heal,n,unit,ttl,mana,auto,desc}
// type: aoe heal buff debuff summon explode charm drain charge aura dispel
export const ABIL = {};
const A = (id, name, o) => { ABIL[id] = Object.assign({ id, name, type: 'aoe', cd: 20, range: 0, radius: 0, dmg: 0, dtype: 'physical', dur: 0, tgt: 'none', who: 'enemy', auto: true, mana: 0, desc: '' }, o); };

// ---- unit abilities (auto-cast; cooldown only)
A('wraith_drain', 'Life Drain', { type: 'drain', cd: 8, range: 11, dmg: 45, dtype: 'dark', tgt: 'unit', desc: 'Drains life from an enemy and heals the wraith.' });
A('plague_aura', 'Plague Aura', { type: 'aura', radius: 5, dmg: 5, dtype: 'poison', dur: 3, desc: 'Poisons nearby enemies.' });
A('raise_skeletons', 'Raise Skeletons', { type: 'summon', cd: 28, range: 14, unit: 'necro_skeleton', n: 2, ttl: 45, tgt: 'point', desc: 'Raises two skeletons.' });
A('death_coil', 'Death Coil', { type: 'aoe', cd: 9, range: 15, radius: 2.5, dmg: 50, dtype: 'dark', tgt: 'point', desc: 'Dark bolt that damages a small area.' });
A('berserk', 'Berserk', { type: 'buff', cd: 30, radius: 0, dur: 8, tgt: 'self', buff: { id: 'berserk', dmg: 1.4, spd: 1.2, take: 1.1 }, desc: 'Enrages: +40% damage, +20% speed.' });
A('bloodlust', 'Bloodlust', { type: 'buff', cd: 28, radius: 10, dur: 10, tgt: 'self', who: 'ally', buff: { id: 'bloodlust', dmg: 1.25, spd: 1.15, as: 1.2 }, desc: 'Allies fight 25% harder and faster.' });
A('chain_bolt', 'Chain Lightning', { type: 'aoe', cd: 10, range: 14, radius: 3.5, dmg: 55, dtype: 'lightning', tgt: 'point', stun: 0.4, desc: 'Lightning arcs through a cluster.' });
A('charge', 'Charge', { type: 'charge', cd: 18, range: 18, dur: 2.5, tgt: 'unit', buff: { id: 'charge', dmg: 1.6, spd: 2.2 }, desc: 'Charges the foe at double speed for a heavy first strike.' });
A('seduce', 'Seduction', { type: 'charm', cd: 40, range: 12, dur: 8, tgt: 'unit', desc: 'Takes control of an enemy unit for 8 s.' });
A('infernal_stomp', 'Infernal Stomp', { type: 'aoe', cd: 18, radius: 6, dmg: 60, dtype: 'fire', tgt: 'self', stun: 1, burn: { dps: 6, dur: 3 }, desc: 'Stomps for area fire damage and stuns.' });
A('heal', 'Heal', { type: 'heal', cd: 3.5, range: 11, heal: 40, tgt: 'unit', who: 'ally', desc: 'Heals a wounded ally.' });
A('purge', 'Purge', { type: 'dispel', cd: 20, radius: 8, dmg: 30, dtype: 'lightning', dur: 5, tgt: 'self', desc: 'Strips buffs, silences casters and smites summoned creatures.' });
A('detonate', 'Detonate', { type: 'explode', cd: 1, radius: 3.5, dmg: 90, dtype: 'fire', tgt: 'self', bld: 0.5, desc: 'Explodes, damaging everything around.' });
A('martyr_blast', 'Martyr Blast', { type: 'explode', cd: 1, radius: 5, dmg: 160, dtype: 'fire', heal: 40, tgt: 'self', bld: 0.5, desc: 'A huge blast that heals nearby cultists.' });

// ---- general skills (manual; cost team mana). `lvl` scales power x(1 + 0.3 (lvl-1))
const G = (id, name, o) => A(id, name, Object.assign({ auto: false, general: true }, o));
G('raise_dead', 'Raise Dead', { type: 'summon', cd: 25, range: 16, unit: 'necro_skeleton', n: 4, ttl: 60, tgt: 'point', mana: 30, desc: 'Raise skeleton warriors at a point.' });
G('bone_ward', 'Bone Ward', { type: 'buff', cd: 22, radius: 12, dur: 14, tgt: 'self', who: 'ally', mana: 25, buff: { id: 'bone_ward', armor: 20, take: 0.85 }, desc: 'Allies gain armour and take less damage.' });
G('death_nova', 'Death Nova', { type: 'aoe', cd: 20, radius: 9, dmg: 130, dtype: 'dark', tgt: 'self', mana: 40, bld: 0.3, desc: 'A wave of necrotic force around the general.' });
G('soul_drain', 'Soul Drain', { type: 'drain', cd: 14, range: 14, dmg: 160, dtype: 'dark', tgt: 'unit', mana: 35, desc: 'Drains an enemy to heal the caster.' });
G('gen_bloodlust', 'Bloodlust', { type: 'buff', cd: 24, radius: 14, dur: 12, tgt: 'self', who: 'ally', mana: 30, buff: { id: 'gen_bloodlust', dmg: 1.3, spd: 1.15, as: 1.2 }, desc: 'Allies hit 30% harder and move faster.' });
G('war_stomp', 'War Stomp', { type: 'aoe', cd: 16, radius: 7, dmg: 75, dtype: 'physical', tgt: 'self', stun: 2, mana: 25, bld: 0.3, desc: 'Stuns and damages nearby enemies.' });
G('chain_lightning', 'Chain Lightning', { type: 'aoe', cd: 12, range: 16, radius: 4, dmg: 150, dtype: 'lightning', tgt: 'point', stun: 0.5, mana: 35, desc: 'Crashing lightning on a cluster.' });
G('waaagh', 'WAAAGH!', { type: 'buff', cd: 60, radius: 20, dur: 15, tgt: 'self', who: 'ally', mana: 70, buff: { id: 'waaagh', dmg: 1.25, regen: 4, spd: 1.1 }, desc: 'The whole horde roars: damage, regeneration, speed.' });
G('hellstorm', 'Hellstorm', { type: 'aoe', cd: 30, range: 20, radius: 9, dmg: 220, dtype: 'fire', tgt: 'point', burn: { dps: 8, dur: 4 }, mana: 60, bld: 0.8, desc: 'Fire rains on a wide area; devastating against buildings.' });
G('summon_fiends', 'Summon Fiends', { type: 'summon', cd: 30, range: 14, unit: 'demon_imp', n: 4, ttl: 45, tgt: 'point', mana: 40, desc: 'Four flying imps tear through the rift.' });
G('infernal_armor', 'Infernal Armour', { type: 'buff', cd: 25, radius: 12, dur: 12, tgt: 'self', who: 'ally', mana: 30, buff: { id: 'infernal_armor', armor: 25, take: 0.8 }, desc: 'Allies are wreathed in hardened flame.' });
G('demon_form', 'Demon Form', { type: 'buff', cd: 60, radius: 0, dur: 15, tgt: 'self', who: 'ally', mana: 60, buff: { id: 'demon_form', dmg: 1.5, armor: 30, spd: 1.15 }, desc: 'The general transforms: huge damage and armour.' });
G('martyrs_blessing', "Martyr's Blessing", { type: 'buff', cd: 26, radius: 14, dur: 14, tgt: 'self', who: 'ally', mana: 30, buff: { id: 'martyrs_blessing', dmg: 1.25, regen: 3 }, desc: 'Cultists hit harder and regenerate.' });
G('smite', 'Smite', { type: 'drain', cd: 14, range: 16, dmg: 240, dtype: 'lightning', tgt: 'unit', mana: 35, lifesteal: 0, desc: 'Calls down a bolt on one enemy.' });
G('blood_rite', 'Blood Rite', { type: 'heal', cd: 22, radius: 12, heal: 140, tgt: 'self', who: 'ally', mana: 40, desc: 'Mends all allies around the general.' });
G('crimson_tide', 'Crimson Tide', { type: 'aoe', cd: 45, radius: 10, dmg: 100, dtype: 'dark', tgt: 'self', mana: 60, selfHeal: 150, bld: 0.3, desc: 'A tide of blood that wounds foes and heals the general.' });
