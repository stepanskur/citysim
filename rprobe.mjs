import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message, e.stack.slice(0,400)));
await p.goto('http://localhost:4173/?seed=7&size=2'); await p.waitForFunction('window.ready===true', null, { timeout: 60000 });
console.log(await p.evaluate(() => { const g = window.game, R = g.routes; const a = g.world.cities[0], c = g.world.cities[1];
  R.cmd({ c: 'create', by: 0, mode: 'bus', stops: [{ x: a.x, z: a.z }, { x: c.x, z: c.z }] }); const rt = R.book.routes.at(-1); R.cmd({ c: 'submit', by: 0, id: rt.id });
  let err = ''; for (let d = 0; d < 5; d++) { for (let h = 0; h < 24; h++) g.eco.tick(1); try { R.frame(); } catch (e) { err += e.message + e.stack.slice(0, 300); } }
  return JSON.stringify({ err, day: g.eco.day, lastDay: R.lastDay, bday: R.book.day, st: rt.status, ap: rt.approvers, notes: R.book.notices.slice(-3) }); }));
await b.close();
