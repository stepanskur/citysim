import { genWorld } from '../src/gen/worldgen'; import { RoadNet } from '../src/world/RoadNet';
for (const seed of (process.argv[2]||'7,99,2024').split(',').map(Number)) { const W:any = genWorld(seed, 2); const net:any = RoadNet.deserialize(W.roads); const world:any = { net, cities: W.cities };
const A=((): any=>{const w=world,n=w.net,N=n.nodes,E=n.edges.map((e:any,i:number)=>({...e,i})).filter((e:any)=>e.alive);
 const c=w.cities[0];const P=e=>[N[e.a],N[e.b]];
 const seg=(p1,p2,p3,p4)=>{const d=(p2.x-p1.x)*(p4.z-p3.z)-(p2.z-p1.z)*(p4.x-p3.x);if(Math.abs(d)<1e-9)return null;const t=((p3.x-p1.x)*(p4.z-p3.z)-(p3.z-p1.z)*(p4.x-p3.x))/d,u=((p3.x-p1.x)*(p2.z-p1.z)-(p3.z-p1.z)*(p2.x-p1.x))/d;return t>0.02&&t<0.98&&u>0.02&&u<0.98?{x:p1.x+t*(p2.x-p1.x),z:p1.z+t*(p2.z-p1.z)}:null};
 const ang=e=>{const[a,b]=P(e);return Math.atan2(b.z-a.z,b.x-a.x)};
 const dA=(x,y)=>{let d=Math.abs(x-y)%Math.PI;return Math.min(d,Math.PI-d)*180/Math.PI};
 const dps=(p,a,b)=>{const vx=b.x-a.x,vz=b.z-a.z,l=vx*vx+vz*vz;let t=l?((p.x-a.x)*vx+(p.z-a.z)*vz)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(a.x+t*vx-p.x,a.z+t*vz-p.z)};
 const grid=new Map();const K=(x,z)=>Math.floor(x/100)+','+Math.floor(z/100);
 for(const e of E){const[a,b]=P(e);const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),z0=Math.min(a.z,b.z),z1=Math.max(a.z,b.z);for(let x=Math.floor(x0/100)-1;x<=Math.floor(x1/100)+1;x++)for(let z=Math.floor(z0/100)-1;z<=Math.floor(z1/100)+1;z++){const k=x+','+z;(grid.get(k)||grid.set(k,[]).get(k)).push(e)}}
 const cross=[],par=[],gap=[],hw=[];const seen=new Set();
 for(const e of E){const[a,b]=P(e);const cand=new Set();for(const k of [K(a.x,a.z),K(b.x,b.z),K((a.x+b.x)/2,(a.z+b.z)/2)])for(const f of grid.get(k)||[])cand.add(f);
  for(const f of cand){if(f.i<=e.i)continue;const sh=e.a===f.a||e.a===f.b||e.b===f.a||e.b===f.b;const[c1,c2]=P(f);
   if(!sh){const x=seg(a,b,c1,c2);if(x&&(e.lv||0)===(f.lv||0))cross.push({x:x.x|0,z:x.z|0,t:[e.type,f.type],ang:dA(ang(e),ang(f))|0});
    if(x&&e.type===2&&f.type===2)hw.push({x:x.x|0,z:x.z|0,ang:dA(ang(e),ang(f))|0,lv:[e.lv||0,f.lv||0]});}
   const da=dA(ang(e),ang(f));if(da<15&&e.len>20&&f.len>20){const d=Math.min(dps(c1,a,b),dps(c2,a,b),dps(a,c1,c2),dps(b,c1,c2));const mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};const dm=dps(mid,c1,c2);const lim=(4+3)/2;
    if(dm<25&&dm>1&&(e.lv||0)===(f.lv||0))par.push({x:mid.x|0,z:mid.z|0,d:dm|0,t:[e.type,f.type],sh})}}}
 for(let i=0;i<N.length;i++){const nd=N[i];if(!nd.alive||nd.outside)continue;const deg=nd.edges.filter(j=>n.edges[j].alive).length;if(deg!==1)continue;
  let best=1e9;for(const f of grid.get(K(nd.x,nd.z))||[]){if(f.a===i||f.b===i)continue;const[c1,c2]=P(f);best=Math.min(best,dps(nd,c1,c2))}
  if(best<20)gap.push({x:nd.x|0,z:nd.z|0,d:+best.toFixed(1)})}
 // acute highway junctions
 const acute=[];for(let i=0;i<N.length;i++){const nd=N[i];if(!nd.alive)continue;const es=nd.edges.map(j=>({...n.edges[j]})).filter(e=>e.alive);if(es.length<3)continue;const hs=es.filter(e=>e.type===2);if(!hs.length)continue;
  const an=es.map(e=>{const o=N[e.a===i?e.b:e.a];return Math.atan2(o.z-nd.z,o.x-nd.x)});let m=180;for(let x=0;x<an.length;x++)for(let y=x+1;y<an.length;y++){let d=Math.abs(an[x]-an[y])*180/Math.PI;d=Math.min(d,360-d);m=Math.min(m,d)}
  if(m<35)acute.push({x:nd.x|0,z:nd.z|0,deg:es.length,min:m|0})}
 // avenue chains
 const av=E.filter(e=>e.type===1);const par2={};const fd=x=>par2[x]===undefined||par2[x]===x?(par2[x]=x):(par2[x]=fd(par2[x]));for(const e of av){par2[fd(e.a)]=fd(e.b)}const L={};for(const e of av){const r=fd(e.a);L[r]=(L[r]||0)+e.len}
 const shortAv=Object.entries(L).filter(([r,l])=>l<400).map(([r,l])=>({x:N[r].x|0,z:N[r].z|0,len:l|0}));
 const cnt=[0,0,0,0];for(const e of E)cnt[e.type]+=e.len;
 // ring heuristic: highways inside city radius
 const hwIn=E.filter(e=>e.type===2&&Math.hypot((N[e.a].x+N[e.b].x)/2-c.x,(N[e.a].z+N[e.b].z)/2-c.z)<c.r).reduce((s,e)=>s+e.len,0);
 return {city:{x:c.x|0,z:c.z|0,r:c.r,pattern:c.pattern,pop:c.pop},len:cnt.map(x=>x|0),nE:E.length,cross:cross.length,crossS:cross.slice(0,6),par:par.length,parS:par.sort((a,b)=>a.d-b.d).slice(0,6),gap:gap.length,gapS:gap.sort((a,b)=>a.d-b.d).slice(0,6),hw,acute:acute.length,acuteS:acute.slice(0,6),shortAv:shortAv.length,shortAvS:shortAv.slice(0,5),hwInCity:hwIn|0,lights:N.filter(x=>x.alive&&x.ctl===1).length}})();
console.log('ANALYSIS', seed, JSON.stringify(A)); }
