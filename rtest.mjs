import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto('http://localhost:4173/?seed=7&size=2'); await p.waitForFunction('window.ready===true', null, { timeout: 60000 });
const r = await p.evaluate(() => { const g = window.game, R = g.routes; const a = g.world.cities[0], c = g.world.cities[1];
  const e1 = R.cmd({ c: 'create', by: 0, mode: 'bus', stops: [{ x: a.x, z: a.z }, { x: c.x, z: c.z }] }); const rt = R.book.routes[R.book.routes.length - 1];
  const e2 = R.cmd({ c: 'submit', by: 0, id: rt.id }); g.speed = 4; return { e1, e2, st: rt.status, ap: rt.approvers.map(x => [x.owner, x.status, x.decideAt]), day: g.eco.day }; });
console.log(JSON.stringify(r));
for (let t = 0; t < 6; t++) { await p.evaluate(() => { window.game.ecoAcc += 1440; }); await p.waitForTimeout(1500); console.log(await p.evaluate(() => { const g = window.game, rt = g.routes.book.routes.at(-1); return JSON.stringify({ day: g.eco.day, st: rt.status, ap: rt.approvers.map(x => [x.owner, x.status]) }); })); }
await b.close();
