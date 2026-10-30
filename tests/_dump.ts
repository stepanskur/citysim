import { genWorld } from '/workspace/citysim/src/gen/worldgen';
import { RoadNet } from '/workspace/citysim/src/world/RoadNet';
const [seed,x,z,r]=process.argv.slice(2).map(Number);
const W:any=genWorld(seed,2); const net=RoadNet.deserialize(W.roads);
net.edges.forEach((e:any,i:number)=>{ if(!e.alive)return; const A=net.nodes[e.a],B=net.nodes[e.b]; const d=Math.min(Math.hypot(A.x-x,A.z-z),Math.hypot(B.x-x,B.z-z),Math.hypot((A.x+B.x)/2-x,(A.z+B.z)/2-z)); if(d<r) console.log(i,'t'+e.type,'lv'+(e.lv||0),e.a,`(${A.x|0},${A.z|0})d${net.nodes[e.a].edges.filter((k:number)=>net.edges[k].alive).length}`,'->',e.b,`(${B.x|0},${B.z|0})d${net.nodes[e.b].edges.filter((k:number)=>net.edges[k].alive).length}`,'len',e.len|0); });
console.log((globalThis as any).__netgenLog?.find((s:string)=>/въезд/.test(s))?.match(/развязок на въездах шоссе: \d+/)?.[0]);
