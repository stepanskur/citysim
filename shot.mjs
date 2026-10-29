import { chromium } from 'playwright';
const url = process.argv[2], out = process.argv[3], wait = +(process.argv[4] || 8000), js = process.argv[5] || '';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { errs.push(m.type() + ': ' + m.text()); console.log('C:', m.text().slice(0,300)); } });
p.on('crash', () => console.log('CRASH'));
p.on('pageerror', e => console.log('PAGEERR: ' + e.message + '\n' + e.stack));
await p.goto(url);
await p.waitForFunction('window.ready === true', null, { timeout: 60000 }).catch(e => errs.push('not ready ' + e.message));
if (js) { await p.evaluate(js).catch(e => errs.push('EVAL: ' + e.message)); }
await p.waitForTimeout(wait);
await p.screenshot({ path: out, timeout: 120000 });
const info = await p.evaluate('window.debugInfo ? window.debugInfo() : ""').catch(() => '');
console.log(JSON.stringify(info));
console.log(errs.slice(0, 20).join('\n'));
await b.close();
