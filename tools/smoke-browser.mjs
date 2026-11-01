// Browser smoke test (Windows Node 20+ and Chrome; playwright-core lives in ~/homlius, outside the repo). Start the server first:
//   node tools/serve.js 8400   then   node tools/smoke-browser.mjs 8400 0   (args: port, class 0-3). Prints hero position/kit/objective and console errors; screenshots go to C:/Users/marti/AppData/Local/Temp/claude/.
import { chromium } from 'file://wsl.localhost/Ubuntu-24.04/home/martin/homlius/node_modules/playwright-core/index.mjs';
const port = process.argv[2] || 8400, cls = process.argv[3] || '0';
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.stack || e).slice(0, 500)));
await page.goto(`http://localhost:${port}/?start=${cls}&speed=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.st, null, { timeout: 90000 }).catch((e) => errs.push('NO GAME: ' + e.message));
await page.waitForTimeout(3000);
const info = () => page.evaluate(() => { const g = window.__game; if (!g) return null; const t = g.st.teams[g.local], h = t.hero; return { t: +g.st.t.toFixed(1), x: +h.x.toFixed(1), z: +h.z.toFixed(1), hp: Math.round(h.hp), lvl: h.lvl, kit: t.kit && t.kit.slots, offers: t.kit && t.kit.offers.length, obj: g.st.objective && g.st.objective.text, uiOpen: !!(g.ui && g.ui.v3 && g.ui.v3.open), mons: g.st.ents.filter((e) => e.kind === 'mon' && e.alive).length }; });
console.log('start', JSON.stringify(await info()));
await page.mouse.move(800, 300);
await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
console.log('after W', JSON.stringify(await info()));
await page.keyboard.press('Digit1'); await page.waitForTimeout(300); await page.mouse.click(800, 300); await page.waitForTimeout(500);
await page.keyboard.down('Digit4'); await page.waitForTimeout(700); await page.keyboard.up('Digit4');
await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up();
console.log('after skills', JSON.stringify(await info()));
await page.screenshot({ path: 'C:/Users/marti/AppData/Local/Temp/claude/smoke1.png' });
await page.keyboard.press('KeyM'); await page.waitForTimeout(800); await page.screenshot({ path: 'C:/Users/marti/AppData/Local/Temp/claude/smoke_map.png' });
console.log('map', JSON.stringify(await info()));
await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
await page.keyboard.press('KeyI'); await page.waitForTimeout(500); await page.screenshot({ path: 'C:/Users/marti/AppData/Local/Temp/claude/smoke_gear.png' }); await page.keyboard.press('KeyI');
console.log('ERRORS', errs.length); for (const e of errs.slice(0, 25)) console.log(' ', e);
await browser.close();
