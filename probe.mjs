import { chromium } from 'playwright';
const [url,js] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } }); p.on('console', m => console.log('LOG', m.text().slice(0,300))); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(url); await p.waitForFunction('window.ready === true', null, { timeout: 60000 });
console.log(JSON.stringify(await p.evaluate(js))); await b.close();
