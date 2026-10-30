import { genWorld } from '/workspace/citysim/src/gen/worldgen';
import { RoadNet } from '/workspace/citysim/src/world/RoadNet';
for (const seed of [7, 99]) { const W: any = genWorld(seed, 2); const net = RoadNet.deserialize(W.roads); const hist: Record<string, number> = {};
  net.nodes.forEach((N: any, n: number) => { if (!N.alive) return; const L = N.edges.filter((e: number) => net.edges[e].alive && !(net.edges[e].lv)); const h = L.filter((e: number) => net.edges[e].type === 2).length; if (!h || h === L.length) return;
    const k = `hw${h}+` + L.filter((e: number) => net.edges[e].type !== 2).map((e: number) => net.edges[e].type).sort().join(''); hist[k] = (hist[k] || 0) + 1; });
  console.log(seed, JSON.stringify(hist)); }
