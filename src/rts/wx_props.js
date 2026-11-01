// WORLD lane: extra renderer props for the neutral sites. Format {t,x,z,s,r} like world.props, plus optional site id `site`.
// New prop types: hut, tent, banner, burnt, pillar, rubble, grave, altar, leystone, brazier, beacon, shrine, throne, hellgate, wagon, bones, deadtree, crater, signpost, cairn.
const h = (a, b) => { let x = Math.imul(a * 73856093 ^ b * 19349663, 0x9e3779b1) >>> 0; x ^= x >>> 15; return (x % 10000) / 10000; };

export function extraProps(st) {
  const out = [], w = st.world;
  const add = (s, t, dx, dz, sc = 1, rot) => {
    const x = s.x + dx, z = s.z + dz;
    if (!w.walkable(x, z)) return;
    out.push({ t, x, z, s: sc, r: rot ?? h(s.id, out.length) * 6.28, site: s.id });
  };
  const ring = (s, t, n, R, sc = 1, jit = 1) => { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + h(s.id, i) * 0.5; const rr = R * (0.8 + h(s.id, i + 9) * 0.4 * jit); add(s, t, Math.cos(a) * rr, Math.sin(a) * rr, sc * (0.9 + h(s.id, i + 3) * 0.3)); } };
  for (const s of st.neutral) {
    switch (s.kind) {
      case 'village': ring(s, s.state === 'burned' ? 'burnt' : 'hut', s.huts || 4, 6.5, 1.1); add(s, 'signpost', 0, 0, 1); break;
      case 'ruin': ring(s, 'pillar', 4, 5, 1.2); ring(s, 'rubble', 5, 4, 1); add(s, 'cairn', 0, 0, 1.2); break;
      case 'graveyard': ring(s, 'grave', 9, 6, 1, 1.3); add(s, 'brazier', 0, 0, 1); break;
      case 'altar': add(s, 'altar', 0, 0, 1.3); ring(s, 'brazier', 3, 4.5, 1); break;
      case 'leyline': add(s, 'leystone', 0, 0, 1.4); ring(s, 'leystone', 4, 4, 0.7); break;
      case 'beacon': add(s, 'beacon', 0, 0, 1.5); break;
      case 'mercs': ring(s, 'tent', 3, 5.5, 1.2); add(s, 'banner', 0, 0, 1.2); add(s, 'brazier', 3, 0, 0.9); break;
      case 'shrine': add(s, 'shrine', 0, 0, 1); add(s, 'hut', 3.5, 1, 0.8); break;
      case 'grove': ring(s, 'deadtree', 7, 7, 1.3); break;
      case 'battlefield': ring(s, 'bones', 8, 8, 1, 1.4); ring(s, 'banner', 3, 6, 0.9); break;
      case 'vein': add(s, s.revealed ? 'crater' : 'rubble', 0, 0, 0.8); break;
      case 'trader': add(s, 'wagon', 0, 0, 1.2); ring(s, 'tent', 2, 4, 1); add(s, 'brazier', 3, 3, 1); break;
      case 'throne': add(s, 'throne', 0, 0, 1.4); ring(s, 'pillar', 4, 6, 1); break;
      case 'portal': add(s, 'hellgate', 0, 0, 1.5); ring(s, 'brazier', 3, 5, 1); break;
      case 'temple': ring(s, 'brazier', 4, 11, 1.2); break;
      default: break;
    }
  }
  return out;
}
