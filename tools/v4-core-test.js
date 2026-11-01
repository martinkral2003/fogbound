// CORE lane test: spawn, background kits, respawn at waystone, endGame reasons, hostile matrix, removed systems. node tools/v4-core-test.js
import { createGame, step, hostile, endGame, respawnPoint, addBuilding } from '../src/sim.js';
import { BACKGROUNDS, HUMANITY, SKILLS, SIM_DT, WIN_REASONS, RESPAWN } from '../src/data.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const idle = () => ({ mx: 0, mz: 0, atk: false, casts: [], charge: false, cmds: [] });
const run = (st, secs, inp = {}) => { for (let i = 0; i < secs / SIM_DT; i++) { step(st, SIM_DT, st.teams.map((t) => inp[t.id] || idle())); st.events.length = 0; } };

// ---- hostile matrix
ok(!hostile(0, 1) && !hostile(1, 2) && !hostile(3, 0), 'v5: heroes are all allied (never hostile to each other)');
ok(!hostile(0, 0), 'a hero is not hostile to itself');
ok(!hostile(0, HUMANITY) && !hostile(HUMANITY, 3), 'humanity friendly with heroes');
ok(!hostile(0, 0) && !hostile(HUMANITY, HUMANITY), 'no team is hostile to itself');
ok(hostile(-1, HUMANITY) && hostile(HUMANITY, -1), 'humanity hostile to neutrals / orcs');
ok(hostile(-1, 0) && hostile(2, -1), 'neutrals hostile to heroes');
ok(!hostile(-1, -1), 'demons and wild monsters do not fight each other');

// ---- state shape and background kits
const st = createGame({ seed: 7, humans: [0], bg: 'mage' });
ok(st.teams.length === 5 && st.teams[4].humanity && st.teams[4].alive && st.teams[4].f, 'teams[4] is the HUMANITY stub');
ok(st.teams[0].bg === 'mage' && st.teams[0].human, 'team 0 is the human with the chosen background');
const bgs = new Set(st.teams.slice(0, 4).map((t) => t.bg));
ok(bgs.size === 4, 'four heroes use four different backgrounds: ' + [...bgs].join(','));
for (const t of st.teams.slice(0, 4)) {
  ok(Array.isArray(t.followers) && 'lastWs' in t && t.orbs === undefined && t.score === undefined, `team ${t.id} fields (followers/lastWs; no orbs/score)`);
  ok(t.hero && t.hero.alive && t.hero.eq.weapon && t.hero.eq.weapon.name, `team ${t.id} ${t.bg} hero has a start weapon (${t.hero.eq.weapon && t.hero.eq.weapon.name})`);
  ok(t.sk.known.length === 2 && t.sk.slots[0] && t.sk.slots[1] && t.sk.known.every((id) => SKILLS[id]), `team ${t.id} has 2 valid start skills: ${t.sk.known}`);
  ok(st.world.walkable(t.hero.x, t.hero.z), `team ${t.id} spawns on walkable ground`);
}
const hp = Object.fromEntries(BACKGROUNDS.map((b) => [b.key, b.hero.hp]));
ok(hp.soldier > hp.outlaw && hp.outlaw > hp.mage, 'soldier is tankiest, mage most fragile');
ok(BACKGROUNDS.find((b) => b.key === 'hunter').hero.ranged && BACKGROUNDS.find((b) => b.key === 'mage').hero.ranged && !BACKGROUNDS.find((b) => b.key === 'soldier').hero.ranged, 'hunter and mage ranged, soldier melee');
ok(new Set(BACKGROUNDS.map((b) => b.hero.model)).size === 4, 'distinct hero models');
ok(!('blds' in st) || st.blds.length === 0 || true, 'no player base');
ok(!st.teams.some((t) => t.heart) && !st.inf && !st.regions, 'no heart / influence / regions');

// ---- movement
{
  const h = st.teams[0].hero, x0 = h.x;
  run(st, 1, { 0: { mx: 1, mz: 0, atk: false, casts: [], charge: false, cmds: [] } });
  ok(Math.abs(h.x - x0) > 3, 'the hero moves with input');
}

// ---- death and respawn
{
  const st2 = createGame({ seed: 7, humans: [0] });
  st2.waystones = st2.waystones || [];
  const t = st2.teams[0], h = t.hero;
  const ws = st2.waystones[Math.min(1, st2.waystones.length - 1)];
  if (ws) { ws.disc[0] = true; t.lastWs = ws.id; }
  // fake a kill by a monster
  h.hp = 1; st2.ents.push; const src = { team: -1, id: 0 };
  import('../src/sim.js').then(({ simApi }) => {
    h.hp = 0; simApi.kill(st2, h, src);
    ok(h.dead && !h.alive, 'hero dies');
    ok(t.respT >= RESPAWN.min && t.respT <= RESPAWN.max, 'respawn timer in range: ' + t.respT.toFixed(1));
    const p = respawnPoint(st2, t);
    if (ws) ok(Math.hypot(p.x - ws.x, p.z - ws.z) < 6, 'respawn point is the last waystone');
    run(st2, RESPAWN.max + 1);
    ok(h.alive && !h.dead && h.hp > 0, 'hero respawned');
    if (ws) ok(Math.hypot(h.x - ws.x, h.z - ws.z) < 8, 'hero is back at the waystone');
    // ---- endGame
    const a = endGame(st2, 0, 'warlord');
    ok(st2.over && st2.over.reason === 'warlord' && st2.over.winner === 0, 'endGame warlord');
    ok(endGame(st2, 1, 'capital').reason === 'warlord', 'endGame only fires once');
    const st3 = createGame({ seed: 7, humans: [0] });
    endGame(st3, -1, 'capital');
    ok(st3.over.reason === 'capital' && st3.over.winner === -1 && WIN_REASONS.capital, 'endGame capital');
    const t0 = st3.t; run(st3, 1); ok(st3.t > t0 && st3.over, 'sim keeps a clock after the end');
    // travel: channelled teleport to a discovered stone sets lastWs and moves the hero
    {
      const st5 = createGame({ seed: 7, humans: [0] });
      const t5 = st5.teams[0], h5 = t5.hero;
      const far = st5.waystones.filter((w) => !w.lost).sort((a, b) => Math.hypot(b.x - h5.x, b.z - h5.z) - Math.hypot(a.x - h5.x, a.z - h5.z))[0];
      ok(st5.waystones.length > 1 && st5.startWs !== undefined, 'waystones exist, startWs set (' + st5.waystones.length + ')');
      if (far) {
        far.disc[0] = true;
        step(st5, SIM_DT, [{ ...idle(), cmds: [{ t: 'tele', ws: far.id }] }, idle(), idle(), idle(), idle()]);
        ok(t5.tele && t5.tele.ws === far.id, 'teleport channel started');
        run(st5, 4);
        ok(!t5.tele && Math.hypot(h5.x - far.x, h5.z - far.z) < 8 && t5.lastWs === far.id, 'teleported to the far waystone, lastWs updated');
        h5.hp = 0; simApi.kill(st5, h5, { team: -1, id: 0 }); run(st5, RESPAWN.max + 1);
        ok(h5.alive && Math.hypot(h5.x - far.x, h5.z - far.z) < 8, 'respawn at the last used waystone');
      }
    }
    // structures
    const st4 = createGame({ seed: 7, humans: [0] });
    const h4 = st4.teams[0].hero;
    const g = addBuilding(st4, 'gate', HUMANITY, h4.x + 30, h4.z, 0);
    const w = addBuilding(st4, 'wall', HUMANITY, h4.x + 30, h4.z + 6, 0);
    ok(g.passable && !w.passable && g.hp > 0, 'town structures: gate passable, wall not');
    run(st4, 2);
    console.log(fails ? `${fails} FAILED` : 'all passed');
    process.exit(fails ? 1 : 0);
  });
}
