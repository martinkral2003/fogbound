// FOGBOUND: DOMINION skirmish setup screen: faction cards, number of AI lords, difficulty, map seed, start.
import { h, esc, cssColor } from './dom.js';
import { FACTIONS } from '../consts.js';

const GLYPH = ['☠', '⚔', '☽', '✹'];
const LOOK = { 0: 'Bone-white towers, teal soulfire', 1: 'Hide, iron and totems', 2: 'Black basalt, hellfire', 3: 'Blood-red cathedral stone' };
export function showSetup(params) {
  return new Promise((resolve) => {
    let pref = {};
    try { pref = JSON.parse(localStorage.getItem('fogbound.rts.setup') || '{}'); } catch (e) { /* ignore */ }
    const o = { faction: pref.faction ?? 0, ai: pref.ai ?? 3, difficulty: pref.difficulty || 'normal', seed: Number(params.get('seed')) || pref.seed || 1337 };
    const wrap = h('div', 'rts-setup', document.body);
    const box = h('div', 'menuBox rts-setupbox', wrap);
    h('h1', '', box, 'DOMINION'); h('p', 'sub', box, 'Raise a fortress, march an army, break your rivals. Skirmish against the other dark lords.');
    const cards = h('div', 'rs-cards', box), info = h('div', 'rs-info', box);
    const opts = h('div', 'rs-opts', box);
    const grp = (label, items, key, fmt) => {
      const g = h('div', 'rs-grp', opts); h('span', 'lb', g, label); const bs = [];
      for (const v of items) { const b = h('button', 'btn small', g, fmt ? fmt(v) : String(v)); b.onclick = () => { o[key] = v; sync(); }; bs.push([b, v]); }
      return () => bs.forEach(([b, v]) => b.classList.toggle('sel', o[key] === v));
    };
    const syncAi = grp('AI lords', [1, 2, 3], 'ai'), syncDf = grp('Difficulty', ['easy', 'normal', 'hard'], 'difficulty', (v) => v[0].toUpperCase() + v.slice(1));
    const sg = h('div', 'rs-grp', opts); h('span', 'lb', sg, 'Map seed');
    const seed = document.createElement('input'); seed.type = 'number'; seed.value = o.seed; sg.appendChild(seed); seed.oninput = () => { o.seed = Math.max(1, Math.floor(+seed.value || 1337)); };
    const rnd = h('button', 'btn small', sg, '🎲'); rnd.onclick = () => { o.seed = 1 + Math.floor(Math.random() * 99999); seed.value = o.seed; };
    const row = h('div', 'row center', box);
    const go = h('button', 'btn gold big', row, 'Begin the conquest'), back = h('button', 'btn big', row, 'Back'); back.onclick = () => location.reload();
    const els = FACTIONS.map((f) => {
      const c = h('div', 'rs-card', cards); c.style.setProperty('--c', cssColor(f.color));
      h('div', 'em', c, GLYPH[f.id]); h('h3', '', c, f.name); h('div', 't', c, f.lord); h('p', '', c, f.blurb); h('div', 'ps', c, LOOK[f.id]);
      c.onclick = () => { o.faction = f.id; sync(); }; return c;
    });
    function sync() {
      els.forEach((c, i) => c.classList.toggle('sel', i === o.faction)); syncAi(); syncDf();
      const f = FACTIONS[o.faction]; info.innerHTML = `<b style="color:${cssColor(f.color)}">${esc(f.lord)}</b> leads the ${esc(f.name)} from the ${['north-west moor', 'north-east highlands', 'south-east deadwood', 'south-west abbey'][f.id]}. Facing ${o.ai} AI lord${o.ai > 1 ? 's' : ''} on <b>${o.difficulty}</b>.`;
    }
    sync();
    go.onclick = () => { try { localStorage.setItem('fogbound.rts.setup', JSON.stringify(o)); } catch (e) { /* ignore */ } wrap.remove(); resolve(o); };
  });
}
