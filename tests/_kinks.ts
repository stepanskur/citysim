import { genWorld } from '../src/gen/worldgen';
import { RoadNet } from '../src/world/RoadNet';
const cases = process.argv[2] ? JSON.parse(process.argv[2]) : [[11, 1], [99, 2], [2024, 3], [5, 2], [7, 1]];
for (const [seed, size] of cases) {
  const t = Date.now(); const W: any = genWorld(seed, size); const net = RoadNet.deserialize(W.roads);
  let k = 0, mx = 0; const where: string[] = [];
  net.nodes.forEach((N: any, n: number) => { if (!N.alive) return; const H = N.edges.filter((e: number) => net.edges[e].alive && net.edges[e].type === 2); if (H.length !== 2 || N.edges.filter((e: number) => net.edges[e].alive).length !== 2) return;
    const d = H.map((e: number) => { const E = net.edges[e], o = net.nodes[E.a === n ? E.b : E.a]; return [(o.x - N.x) / E.len, (o.z - N.z) / E.len]; });
    const turn = 180 - Math.acos(Math.max(-1, Math.min(1, d[0][0] * d[1][0] + d[0][1] * d[1][1]))) * 180 / Math.PI; if (turn > mx) mx = turn; if (turn > 20) { k++; if (where.length < 8) where.push(`${Math.round(N.x)},${Math.round(N.z)}:${turn.toFixed(0)}°/${N.edges.length}`); } });
  console.log(seed, size, 'изломов >20°:', k, 'макс', mx.toFixed(0), where.join(' '), (Date.now() - t) + 'мс', ((globalThis as any).__netgenLog || []).slice(-1)[0]);
}
