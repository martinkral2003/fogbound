import fs from 'fs';
const dir = process.argv[2]; const f = fs.readdirSync(dir).filter(x=>x.endsWith('.cpuprofile')).map(x=>dir+'/'+x).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];
const p = JSON.parse(fs.readFileSync(f)); const self = new Map(); const dt = p.timeDeltas; const idx = new Map(p.nodes.map(n=>[n.id,n]));
p.samples.forEach((id,i)=>{ const n = idx.get(id); const k = n.callFrame.functionName+' '+n.callFrame.url.split('/').pop()+':'+n.callFrame.lineNumber; self.set(k,(self.get(k)||0)+dt[i]); });
[...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,14).forEach(([k,v])=>console.log((v/1000|0)+'ms',k));
