import { chromium } from 'playwright';
const [url,out,js=''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } });
await p.goto(url); await p.waitForFunction('window.ready === true', null, { timeout: 60000 });
if (js) await p.evaluate(js);
await p.waitForTimeout(1500);
const t0=Date.now(); let z=0;
while (Date.now()-t0<180000) { const n = await p.evaluate('window.chunkPending'); z = n===0 ? z+1 : 0; if (z>=3) break; await p.waitForTimeout(500); }
await p.waitForTimeout(1500);
const info = await p.evaluate(`(()=>{const r=game.r,c=game.world.cities[0],cp=r.cam.position;const sub=[];for(const ch of r.chunks.values()){}return {queueWaitMs:${'Date.now()'}-${Date.now()}, camH:Math.round(cp.y), camToCentre:Math.round(Math.hypot(cp.x-c.x,cp.y,cp.z-c.z)), targetToCentre:Math.round(Math.hypot(r.ctl.tx-c.x,r.ctl.tz-c.z)), det:[...r.chunks.values()].reduce((a,ch)=>(a[ch.bDetail]=(a[ch.bDetail]||0)+1,a),{}), fps: window.debugInfo?window.debugInfo().fps:0, calls:r.stats.calls, tris:r.stats.tris}})()`);
await p.screenshot({ path: out });
console.log(JSON.stringify(info), 'wait', Date.now()-t0); await b.close();
