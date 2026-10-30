import { genWorld } from '../src/gen/worldgen'; import { RoadNet } from '../src/world/RoadNet'; import { netMetrics, components } from '../src/gen/netgen';
for (const seed of (process.argv[2]||'7,99,2024').split(',').map(Number)) { const W:any = genWorld(seed, 2); const net = RoadNet.deserialize(W.roads); const m = netMetrics(net);
  console.log(seed, JSON.stringify({ ...m, S: m.S.slice(0, 8) }), 'comp', components(net), (W.genLog||W.log||[]).filter((l:string)=>/регуляр/.test(l)).join('')); }
