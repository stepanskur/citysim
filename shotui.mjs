import { chromium } from 'playwright';
const base='http://localhost:4173/';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
for (const [W,H,s] of [[1600,900,''],[1280,720,'_720']]) {
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto(base); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/g_menu${s}.png` });
await p.goto(base+'?seed=7&size=1'); await p.waitForFunction('window.ready === true', null, { timeout: 90000 }); await p.waitForTimeout(4000);
await p.screenshot({ path: `shots/g_hud${s}.png` });
await p.evaluate(`game.tools.set('road',1); game.ui.toast('Недостаточно средств для постройки','bad'); game.ui.toast('Сохранено в слот 1','good')`); await p.waitForTimeout(600);
await p.screenshot({ path: `shots/g_tool${s}.png` });
await p.evaluate(`game.tools.set('select',0); game.ui.open('eco'); document.querySelector('#layers-btn').click(); game.ui.setOverlay('traffic')`); await p.waitForTimeout(1500);
await p.screenshot({ path: `shots/g_panel${s}.png` });
await p.close(); }
await b.close();
