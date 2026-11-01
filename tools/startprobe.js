// Where does startup time go on the headless side? node tools/startprobe.js [seed]
import { generateWorld } from '../src/world.js';
import { createNav } from '../src/nav.js';
import { createGame } from '../src/sim.js';
const seed = +process.argv[2] || 1337;
let t = performance.now();
const lap = (label) => { const n = performance.now(); console.log(label.padEnd(28), Math.round(n - t), 'ms'); t = n; };
const w = generateWorld(seed); lap('generateWorld');
createNav(w); lap('createNav');
createGame({ seed, humans: [0], world: w }); lap('createGame (world reused)');
createGame({ seed, humans: [0] }); lap('createGame (incl. its own world)');
generateWorld(seed); lap('generateWorld again');
