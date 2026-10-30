import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } });
await p.goto(process.argv[2]); await p.waitForFunction('window.ready === true');
if (process.argv[3]) await p.evaluate(process.argv[3]);
await p.waitForTimeout(2000); let z=0; while(z<3){ z=(await p.evaluate('window.chunkPending'))===0?z+1:0; await p.waitForTimeout(500);} 
console.log("raf", await p.evaluate(`new Promise(res=>{let n=0;const t=performance.now();const f=()=>{n++;if(performance.now()-t<4000)requestAnimationFrame(f);else res(Math.round(n/((performance.now()-t)/1000)))};requestAnimationFrame(f)})`), await p.evaluate("JSON.stringify(window.debugInfo())"));
console.log(JSON.stringify(await p.evaluate(`(()=>{const r=game.r,gl=r.renderer.getContext();const T=f=>{const t=performance.now();for(let i=0;i<10;i++){f();gl.finish()}return Math.round((performance.now()-t)/10)};const o={};o.render=T(()=>r.render());o.upd=T(()=>r.updateChunks());const vis=[];r.scene.traverse(m=>{if(m.isMesh&&m.visible)vis.push(m)});o.meshes=vis.length;const ov=r.overview;if(ov){ov.visible=false;o.noOverview=T(()=>r.render());ov.visible=true}r.scene.fog&&(o.fogNear=r.scene.fog.near,o.fogFar=r.scene.fog.far);return o})()`)));
await b.close();
