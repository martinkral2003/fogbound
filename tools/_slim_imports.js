import fs from 'fs'; import path from 'path';
const dir = 'src'; const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
const src = {}; for (const f of files) src[f] = fs.readFileSync(path.join(dir, f), 'utf8');
function exportsOf(f, seen = new Set()) {
  if (seen.has(f)) return new Set(); seen.add(f);
  const s = src[f], out = new Set();
  if (!s) return null;
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop().trim(); if (n) out.add(n); }
  for (const m of s.matchAll(/export\s*\*\s*from\s*'\.\/([^']+)'/g)) { const e = exportsOf(m[1], seen); if (e) for (const x of e) out.add(x); }
  return out;
}
let bad = 0;
for (const f of files) {
  for (const m of src[f].matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([^']+\.js)'/g)) {
    const ex = exportsOf(m[2]); if (!ex) { console.log(f, 'imports missing file', m[2]); bad++; continue; }
    for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/)[0].trim(); if (n && !ex.has(n)) { console.log(f, 'imports', n, 'not exported by', m[2]); bad++; } }
  }
  for (const m of src[f].matchAll(/import\s*\*\s*as\s+\w+\s+from\s*'\.\/([^']+\.js)'/g)) if (!src[m[1]]) { console.log(f, 'imports missing file', m[1]); bad++; }
  for (const m of src[f].matchAll(/import\s+\w+\s+from\s*'\.\/([^']+\.js)'/g)) if (!src[m[1]]) { console.log(f, 'imports missing file', m[1]); bad++; }
}
console.log('bad', bad);
