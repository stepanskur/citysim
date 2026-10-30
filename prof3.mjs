import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } });
await p.goto(process.argv[2]); await p.waitForFunction('window.ready === true');
if (process.argv[3]) await p.evaluate(process.argv[3]);
await p.waitForTimeout(2000); let z=0; while(z<3){ z=(await p.evaluate('window.chunkPending'))===0?z+1:0; await p.waitForTimeout(500);}
const fps=async()=>{await p.waitForTimeout(4000);return p.evaluate('Math.round(game.fps)')};
const set=(k,v)=>p.evaluate(`(()=>{const r=game.r;const sel={terrain:c=>[c.terrain],roads:c=>[c.roads,c.marks],blds:c=>c.blds};if(sel['${k}'])for(const c of r.chunks.values())for(const m of sel['${k}'](c))m&&(m.visible=${v});else if('${k}'==='veh')r.vehMeshes.forEach(m=>m.visible=${v});else if('${k}'==='all')r.scene.children.forEach(m=>m.visible=${v});})()`);
console.log('base',await fps());
console.log(await p.evaluate('JSON.stringify(Object.fromEntries(Object.entries(window.prof).map(([k,v])=>[k,+v.toFixed(2)])))'));
await p.evaluate('game.speed=0'); console.log('paused',await fps(), await p.evaluate('JSON.stringify(Object.fromEntries(Object.entries(window.prof).map(([k,v])=>[k,+v.toFixed(2)])))'));
await b.close();
