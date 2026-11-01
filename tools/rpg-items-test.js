// Headless test of the FOGBOUND: HERO item system. node tools/rpg-items-test.js
import { mulberry32 } from '../src/util.js';
import { SLOTS, DTYPES } from '../src/rpg/consts.js';
import * as I from '../src/rpg/items.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL:', msg); } };
const rng = mulberry32(12345);
let nextId = 1;
function actor(o = {}) {
  return { id: nextId++, kind: 'rival', name: 'T', lvl: o.lvl || 1, attrs: { str: 10, dex: 10, int: 10, vit: 10, ...(o.attrs || {}) }, gold: 0, hp: 100, stamina: 100, mana: 50, maxHp: 100, maxStamina: 100, maxMana: 50,
    equip: Object.fromEntries(SLOTS.map((s) => [s, null])), inv: [], quick: new Array(8).fill(null), status: [], x: 0, z: 0, yaw: 0, pitch: 0, d: null };
}
const mkSt = () => ({ t: 0, rng: mulberry32(7), nextId: 1000, groundItems: [], containers: [], events: [] });
const recompute = (a) => { a.d = I.derived(a); a.maxHp = a.d.maxHp; a.maxStamina = a.d.maxStamina; a.maxMana = a.d.maxMana; return a.d; };

console.log('== catalogue');
const ids = Object.keys(I.ITEMS); console.log('defs:', ids.length);
ok(ids.length > 150, 'catalogue size');
for (const id of ids) { const it = I.makeItem(id, { rarity: 3 }, rng); ok(it.uid && it.name && it.weight !== undefined, 'bad item ' + id); }
for (const u of I.UNIQUE_IDS) { const it = I.makeItem('unique:' + u, {}, rng); ok(it.rarity === 4 && it.flavor, 'unique ' + u); }
console.log('uniques:', I.UNIQUE_IDS.length);
console.log('sample names:', [0, 1, 2, 3, 4].map((r) => I.makeItem('sword_1', { rarity: r }, rng).name).join(' | '));

console.log('== derived per class kit');
for (const kit of ['wanderer', 'warrior', 'ranger', 'mage', 'rogue', 'brute']) {
  const a = actor(); I.starterKit(a, kit); const d = recompute(a);
  console.log(`${kit.padEnd(9)} hp ${d.maxHp} st ${d.maxStamina} mp ${d.maxMana} armor ${d.armor.toFixed(1)} move ${d.moveSpeed.toFixed(2)} dmgMul ${d.dmgMul.toFixed(2)} crit ${d.critChance.toFixed(3)} wpn ${d.weapon.kind} ${d.weapon.dmg} carry ${d.carry} w ${d.weight.toFixed(1)} light ${d.light} block ${d.block.absorb.toFixed(2)}`);
  ok(d.maxHp > 80 && d.maxHp < 400, kit + ' hp'); ok(d.armor >= 0 && d.armor <= 75, kit + ' armor'); ok(d.moveSpeed > 2.5 && d.moveSpeed <= 4.2, kit + ' move');
  ok(DTYPES.every((t) => typeof d.res[t] === 'number'), 'res keys'); ok(d.weapon.dmg[1] >= d.weapon.dmg[0], 'weapon dmg');
}
{ // heavy armour full set
  const a = actor({ attrs: { str: 20 } });
  for (const id of ['head_dark', 'chest_dark', 'legs_dark', 'boots_dark', 'hands_dark', 'shield_4', 'sword_4']) { const it = I.makeItem(id); a.inv.push(it); I.equip(a, it.uid); }
  const d = recompute(a); console.log('full darksteel: armor', d.armor.toFixed(1), 'move', d.moveSpeed.toFixed(2), 'stamRegen', d.staminaRegen.toFixed(1), 'weight', d.weight.toFixed(1), '/', d.carry);
  ok(d.armor <= 75 && d.armor > 50, 'dark armor'); ok(d.moveSpeed < 3.6, 'heavy slows');
  const b = actor(); for (const id of ['head_cloth', 'chest_robe', 'legs_cloth']) { const it = I.makeItem(id); b.inv.push(it); I.equip(b, it.uid); }
  ok(recompute(b).moveSpeed >= 3.59, 'light does not slow');
}
{ // unmet requirements
  const a = actor({ attrs: { str: 8 } }); const w = I.makeItem('twohand_4'); a.inv.push(w); const r = I.equip(a, w.uid);
  const d = recompute(a); ok(r.ok && r.penalty && d.dmgMul < 1, 'requirement penalty'); console.log('unmet 2h: dmgMul', d.dmgMul.toFixed(2), r.reason);
}

console.log('== equip rules');
{
  const a = actor({ attrs: { str: 18, dex: 14 } }); const st = mkSt();
  const sw = I.makeItem('sword_1'), sh = I.makeItem('shield_1'), bow = I.makeItem('bow_1'), th = I.makeItem('twohand_1'), tr = I.makeItem('torch');
  for (const i of [sw, sh, bow, th, tr]) a.inv.push(i);
  I.equip(a, sw.uid); I.equip(a, sh.uid); ok(a.equip.weapon === sw && a.equip.offhand === sh, 'sword+shield');
  const r = I.equip(a, th.uid); ok(a.equip.weapon === th && a.equip.offhand === null && a.inv.includes(sh) && a.inv.includes(sw), 'two-hander frees offhand and swaps weapon');
  I.equip(a, sh.uid); ok(a.equip.offhand === sh && a.equip.weapon === null && a.inv.includes(th), 'shield removes two-hander');
  I.equip(a, bow.uid); ok(a.equip.offhand === null && a.equip.weapon === bow, 'bow takes both hands');
  I.equip(a, tr.uid); ok(a.equip.weapon === null && a.equip.offhand === tr, 'torch in offhand'); ok(recompute(a).light >= 14, 'torch light ' + a.d.light);
  I.unequip(a, 'offhand'); ok(a.inv.includes(tr), 'unequip returns to inventory');
  // ammo
  I.equip(a, bow.uid); ok(I.ammoFor(a) === null, 'no ammo'); I.addToInventory(a, I.makeItem('arrow', { qty: 3 })); I.addToInventory(a, I.makeItem('arrowIron', { qty: 2 }));
  ok(I.ammoCount(a) === 5, 'ammo count'); const sh1 = I.consumeAmmo(a); ok(sh1.def === 'arrowIron' && I.ammoCount(a) === 4, 'best ammo first');
  I.consumeAmmo(a); I.consumeAmmo(a); I.consumeAmmo(a); I.consumeAmmo(a); ok(I.consumeAmmo(a) === null, 'ammo runs out');
  ok(!a.inv.some((q) => q.kind === 'arrow'), 'empty stacks removed');
}

console.log('== stacking / weight');
{
  const a = actor(); const st = mkSt();
  I.addToInventory(a, I.makeItem('healthPotion', { qty: 2 })); I.addToInventory(a, I.makeItem('healthPotion', { qty: 3 }));
  ok(a.inv.length === 1 && a.inv[0].qty === 5, 'stack merges');
  const part = I.removeFromInventory(a, a.inv[0].uid, 2); ok(part.qty === 2 && a.inv[0].qty === 3 && part.uid !== a.inv[0].uid, 'split stack');
  I.addToInventory(a, I.makeItem('goldCoins', { qty: 40 })); ok(a.gold === 40 && a.inv.length === 1, 'gold converts');
  const k1 = I.makeItem('key', { keyId: 'a' }), k2 = I.makeItem('key', { keyId: 'b' }); I.addToInventory(a, k1); I.addToInventory(a, k2); ok(a.inv.filter((q) => q.kind === 'key').length === 2, 'keys with different ids do not stack');
  recompute(a); let n = 0; while (I.addToInventory(a, I.makeItem('twohand_4')) && n < 100) n++;
  const d = recompute(a); console.log('picked', n, 'claymores; weight', d.weight.toFixed(0), 'carry', d.carry, 'hardCap', d.hardCap, 'moveSpeed', d.moveSpeed.toFixed(2));
  ok(n > 0 && n < 100 && d.weight <= d.hardCap, 'hard cap respected'); ok(d.overweight && d.moveSpeed < 3.6, 'overweight slows');
  const g = I.dropFromInventory(st, a, a.inv.find((q) => q.kind === 'twohand').uid, 1); ok(st.groundItems.length === 1 && g, 'drop to ground');
}

console.log('== consumables');
{
  const a = actor(); const st = mkSt(); recompute(a); a.hp = 20; a.stamina = 10; a.mana = 0;
  const hp = I.makeItem('healthPotionM'), sp = I.makeItem('staminaPotion'), mp = I.makeItem('manaPotion'), food = I.makeItem('cookedMeat'), anti = I.makeItem('antidote');
  for (const i of [hp, sp, mp, food, anti]) a.inv.push(i);
  a.status.push({ id: 'poison', t: 5, power: 1 });
  I.useItem(st, a, hp.uid); ok(a.hp >= 100, 'heal ' + a.hp); st.t += 1;
  I.useItem(st, a, sp.uid); ok(a.stamina >= 55, 'stamina'); st.t += 1; I.useItem(st, a, mp.uid); ok(a.mana >= 30, 'mana'); st.t += 1;
  I.useItem(st, a, anti.uid); ok(!a.status.some((s) => s.id === 'poison'), 'antidote cures'); st.t += 1;
  I.useItem(st, a, food.uid); ok(!a.inv.includes(food), 'food consumed');
  const sc = I.makeItem('scroll_firebolt'); a.inv.push(sc); const r = I.useItem(st, a, sc.uid); console.log('scroll use result', JSON.stringify(r));
  const armor = I.makeItem('chest_mail'); a.inv.push(armor); I.useItem(st, a, armor.uid); ok(a.equip.chest === armor, 'use equips');
  a.quick[0] = hp.uid; a.hp = 10; a.inv.push(I.makeItem('healthPotion')); a.quick[1] = a.inv[a.inv.length - 1].uid; st.t += 2; ok(I.useQuick(st, a, 1) && a.hp > 10, 'quick slot use');
  I.removeFromInventory(a, a.quick[1] || 'x', 1);
}

console.log('== locks and containers');
{
  const a = actor({ attrs: { dex: 12 } }); const st = mkSt(); recompute(a);
  const key = I.makeItem('key', { keyId: 'crypt1' }); a.inv.push(key);
  const c1 = { id: 50, kind: 'chest', tier: 2, locked: true, keyId: 'crypt1', items: [], x: 0, z: 0 };
  ok(I.tryUnlock(a, c1) && !c1.locked && !a.inv.includes(key), 'key unlocks and is consumed');
  a.inv.push(I.makeItem('lockpick', { qty: 300 }));
  let succ = 0, tries = 0;
  for (let i = 0; i < 40; i++) { const c = { id: 100 + i, kind: 'chest', tier: 1 + (i % 3), locked: true, items: [], x: 0, z: 0 }; let guard = 0; while (!I.tryUnlock(a, c) && guard++ < 30); if (!c.locked) succ++; tries += c.tries || 0; }
  console.log('lockpicking: 40 chests opened', succ, 'avg picks', (tries / 40).toFixed(2)); ok(succ === 40, 'lockpick eventually works');
  ok(!I.tryUnlock(actor(), { id: 9, locked: true, tier: 1, items: [] }), 'no lockpick = fail');
  const cc = { id: 70, kind: 'chest', tier: 1, locked: false, items: [I.makeItem('healthPotion', { qty: 2 }), I.makeItem('sword_1'), I.makeItem('goldCoins', { qty: 30 })], x: 0, z: 0 }; st.containers.push(cc);
  const b = actor(); recompute(b); I.takeFromContainer(st, b, 70, cc.items[0].uid); ok(b.inv.length === 1 && cc.items.length === 2, 'take one');
  I.takeAllFromContainer(st, b, 70); ok(cc.items.length === 0 && b.gold === 30, 'take all (+gold)');
}

console.log('== corpses');
{
  const st = mkSt(); const a = actor(); I.starterKit(a, 'warrior'); a.gold = 77; a.kind = 'rival'; recompute(a);
  const n = a.inv.length + SLOTS.filter((s) => a.equip[s]).length;
  const c = I.dropCorpse(st, a); console.log('rival corpse items', c.items.length, 'from kit', n); ok(c.items.length >= n && st.containers.includes(c) && a.inv.length === 0 && !a.equip.weapon, 'rival drops whole kit');
  ok(c.items.some((i) => i.kind === 'gold' && i.qty === 77), 'gold drops');
  const m = actor(); m.kind = 'monster'; m.loot = 'wolf'; m.lvl = 3; let got = 0; for (let i = 0; i < 30; i++) got += I.dropCorpse(st, m).items.length; ok(got > 10, 'monster loot ' + got);
}

console.log('== loot tables (rarity distribution over 3000 gear rolls, % per rarity; items per roll)');
const TBL = ['skeleton', 'skelArcher', 'ghoul', 'wolf', 'orcRaider', 'bogBeast', 'wraith', 'troll', 'crypt', 'king', 'chest1', 'chest2', 'chest3', 'chest1L', 'chest2L', 'chest3L', 'supply', 'rival', 'camp', 'shrine'];
for (const t of TBL) {
  for (const tier of (['chest1', 'chest2', 'chest3', 'supply'].includes(t) ? [1] : [1, 3])) {
    const cnt = [0, 0, 0, 0, 0]; let eq = 0, items = 0, gold = 0, N = 600;
    for (let i = 0; i < N; i++) for (const it of I.rollLoot(t, rng, tier)) { items++; if (it.kind === 'gold') gold += it.qty; else if (it.slot) { eq++; cnt[it.rarity]++; } }
    const p = cnt.map((c) => (eq ? Math.round(100 * c / eq) : 0));
    console.log(`${t.padEnd(10)} tier${tier} items/roll ${(items / N).toFixed(1)} gold/roll ${(gold / N).toFixed(0).padStart(4)} gear/roll ${(eq / N).toFixed(2)} rarity% [${p.join(',')}]`);
  }
}
{ const cnt = [0, 0, 0, 0, 0]; let uniq = 0, N = 4000; for (let i = 0; i < N; i++) for (const it of I.rollLoot('supply', rng, 2)) if (it.slot) { cnt[it.rarity]++; if (it.unique) uniq++; } console.log('supply tier2 rarity counts', cnt.join(','), 'uniques', uniq); ok(cnt[3] + cnt[4] > cnt[0], 'supply is mostly epic+'); }
ok(I.rollLoot('nonexistent', rng, 1).length === 0, 'unknown table = empty');

console.log('== shops, prices, upgrades, tooltips');
for (const role of ['general', 'smith', 'alchemist', 'fence', 'inn']) {
  const s = I.shopStock(role, rng); console.log(role.padEnd(10), s.length, 'items:', s.slice(0, 5).map((i) => `${i.name}${i.qty > 1 ? ' x' + i.qty : ''}(${I.buyPrice(i, {})})`).join(', '));
  ok(s.length >= 5, role + ' stock'); for (const i of s) ok(I.buyPrice(i, {}) > I.sellValue(i, {}) || i.value <= 2, 'buy > sell ' + i.name);
}
{
  const a = actor(); a.gold = 1000; const w = I.makeItem('sword_2', { rarity: 2 }, rng); a.inv.push(w);
  const d0 = w.dmg.slice(), v0 = w.value, q = I.upgradeQuote(w); console.log('upgrade', w.name, 'dmg', d0, 'cost', q.cost);
  let steps = 0; while (I.upgradeItem(w, a).ok) steps++;
  ok(steps === 3 && w.plus === 3 && w.dmg[1] > d0[1] && w.value > v0, 'three upgrades'); console.log('  ->', w.name, w.dmg, 'gold left', a.gold);
  ok(!I.upgradeItem(I.makeItem('healthPotion')).ok, 'potion cannot be upgraded');
  const poor = actor(); ok(!I.upgradeItem(I.makeItem('sword_1'), poor).ok, 'too poor');
  const a2 = actor(); I.starterKit(a2, 'warrior'); recompute(a2);
  const cand = I.makeItem('sword_3', { rarity: 3 }, rng); const cmp = I.compareItem(a2, cand); console.log('compare', cand.name, JSON.stringify({ dps: cmp.dpsDelta, dmg: cmp.dmgDelta, unmet: cmp.unmet.length, better: cmp.better }));
  ok(cmp.better && cmp.equipped, 'darksteel better than iron');
  for (const it of [cand, I.makeItem('unique:wraithbane'), I.makeItem('chest_plate'), I.makeItem('healthPotionL'), I.makeItem('bow_2'), I.makeItem('scroll_nova'), I.makeItem('torch')]) {
    const t = I.describeItem(it, a2); ok(t.title && t.lines.length >= 3 && t.color, 'tooltip ' + it.name);
  }
  const t = I.describeItem(I.makeItem('unique:drownedTrident'), a2); console.log('--', t.title, t.color, '\n' + t.lines.map((l) => '   ' + l.text).join('\n'));
  const best = actor(); for (const id of ['sword_0', 'sword_3', 'shield_0', 'chest_cloth', 'chest_mail', 'head_plate']) best.inv.push(I.makeItem(id)); best.attrs.str = 16; I.equipBest(best);
  ok(best.equip.weapon && best.equip.weapon.def === 'sword_3' && best.equip.chest.def === 'chest_mail', 'equipBest');
}
console.log(fails ? `\n${fails} FAILURES` : '\nall item checks passed');
process.exit(fails ? 1 : 0);
