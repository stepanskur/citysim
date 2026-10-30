// Этап B: инварианты генерации сети (mechanics/13)
import { genWorld } from '../src/gen/worldgen';
import { components, CLS } from '../src/gen/netgen';
import { RoadNet } from '../src/world/RoadNet';
import { BALANCE } from '../src/sim/balance';
let fail = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fail++; };
for (const [seed, size] of [[7, 2], [42, 1], [1234, 0], [11, 1], [99, 2], [2024, 3], [5, 2]]) {
  const t = Date.now(); const W: any = genWorld(seed, size); const net = RoadNet.deserialize(W.roads);
  const comp = components(net); ok(comp === 1, `seed ${seed} size ${size}: компонент сети = ${comp} (${Date.now() - t} мс)`);
  // класс меняется только в узлах степени ≠ 2
  let bad = 0; for (const N0 of net.nodes) { if (!N0.alive) continue; const l = N0.edges.filter((e: number) => net.edges[e].alive); if (l.length === 2) { const [a, b] = l.map((e: number) => net.edges[e].type); if (a !== b && a !== 2 && b !== 2) bad++; } }
  ok(bad === 0, `seed ${seed}: смен класса вне перекрёстков ${bad}`);
  // короткие рёбра улиц в центре (< 0.5·junctionSpacing) — доля
  let short = 0, all = 0; for (const E of net.edges) if (E.alive && E.type !== 2) { all++; if (E.len < BALANCE.netgen.junctionSpacing.street * 0.3) short++; }
  ok(short / all < 0.15, `seed ${seed}: коротких рёбер ${(100 * short / all).toFixed(1)}% (${CLS[0]})`);
  // запрос Степана: шоссе не пересекает одну и ту же улицу многократно. Трасса шоссе = компонента рёбер типа 2;
  // трасса улицы = цепочка рёбер не-шоссе, склеенная в узлах по самому прямому продолжению (< 25°).
  { const lim = BALANCE.netgen.highway.maxCrossPerPair, step = BALANCE.netgen.highway.junctionStep;
    const par = new Map<number, number>(); const f = (x: number): number => { let r = x; while (par.has(r) && par.get(r) !== r) r = par.get(r)!; return r; }; const un = (a: number, b: number) => { const ra = f(a), rb = f(b); if (ra !== rb) par.set(ra, rb); };
    const dir = (e: number, n: number) => { const E = net.edges[e], o = net.nodes[E.a === n ? E.b : E.a], N0 = net.nodes[n]; return [(o.x - N0.x) / E.len, (o.z - N0.z) / E.len]; };
    net.nodes.forEach((N0: any, n: number) => { if (!N0.alive) return; const L = N0.edges.filter((e: number) => net.edges[e].alive);
      for (const hw of [true, false]) { const S = L.filter((e: number) => (net.edges[e].type === 2) === hw); if (hw) { for (let i = 1; i < S.length; i++) un(S[0], S[i]); continue; }
        const best = (e: number) => { let b = -1, bd = -Math.cos(25 * Math.PI / 180); const d = dir(e, n); for (const e2 of S) if (e2 !== e) { const d2 = dir(e2, n), dd = d[0] * d2[0] + d[1] * d2[1]; if (dd < bd) { bd = dd; b = e2; } } return b; };
        for (const e of S) { const b = best(e); if (b >= 0 && best(b) === e) un(e, b); } } });
    const X = (a: any, b: any, c: any, d: any) => { const den = (b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x); if (Math.abs(den) < 1e-9) return false; const t = ((c.x - a.x) * (d.z - c.z) - (c.z - a.z) * (d.x - c.x)) / den, u = ((c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)) / den; return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6; };
    const cnt = new Map<string, number>(); const bump = (h: number, s: number) => { const k = f(h) + ':' + f(s); cnt.set(k, (cnt.get(k) || 0) + 1); };
    const H = net.edges.map((E: any, i: number) => i).filter((i: number) => net.edges[i].alive && net.edges[i].type === 2);
    for (const h of H) { const E = net.edges[h]; const A = net.nodes[E.a], B = net.nodes[E.b];
      for (const s of net.edgesNear((A.x + B.x) / 2, (A.z + B.z) / 2, E.len / 2 + 60)) { const S = net.edges[s]; if (!S.alive || S.type === 2) continue; if (X(A, B, net.nodes[S.a], net.nodes[S.b])) bump(h, s); } }
    // наземные примыкания: узел, где сходятся шоссе и улица (считаем каждую цепочку улицы один раз на узел)
    const atg: number[] = []; net.nodes.forEach((N0: any, n: number) => { if (!N0.alive) return; const L = N0.edges.filter((e: number) => net.edges[e].alive); const hs = L.filter((e: number) => net.edges[e].type === 2), ss = L.filter((e: number) => net.edges[e].type !== 2); if (!hs.length || !ss.length) return; atg.push(n); const seen = new Set<number>(); for (const s of ss) { if (seen.has(f(s))) continue; seen.add(f(s)); if (L.length > 2 || hs.length === 1) bump(hs[0], s); } });
    let worst = 0, wk = ''; for (const [k, v] of cnt) if (v > worst) { worst = v; wk = k; }
    if (process.env.DBG && worst > lim) { const [hh, ss] = wk.split(':').map(Number); net.edges.forEach((E: any, i: number) => { if (E.alive && (f(i) === hh || f(i) === ss)) console.log('  ', i, E.type, E.lv || 0, E.a, E.b, Math.round(net.nodes[E.a].x), Math.round(net.nodes[E.a].z), Math.round(net.nodes[E.b].x), Math.round(net.nodes[E.b].z)); }); }
    ok(worst <= lim, `seed ${seed}: макс. пересечений пары «шоссе × улица» = ${worst} (лимит ${lim}; пар ${cnt.size})`);
    // шаг наземных развязок вдоль шоссе: соседние (по рёбрам шоссе) наземные узлы с улицами не ближе step, кроме «ворот» у концов
    const hdeg = (n: number) => net.nodes[n].edges.filter((x: number) => net.edges[x].alive && net.edges[x].type === 2).length; let close = 0; const isA = new Set(atg); for (const h of H) { const E = net.edges[h]; if (hdeg(E.a) < 2 || hdeg(E.b) < 2) continue; /* «ворота» в городе — конец трассы */ if (E.len < step * 0.5 && isA.has(E.a) && isA.has(E.b) && (E.lv || 0) === 0) close++; }
    if (process.env.DBG) for (const h of H) { const E = net.edges[h]; if (E.len < step * 0.5 && isA.has(E.a) && isA.has(E.b) && (E.lv || 0) === 0) console.log('  close', h, Math.round(E.len), Math.round(net.nodes[E.a].x), Math.round(net.nodes[E.a].z), net.nodes[E.a].edges.map((x: number) => net.edges[x].type + '/' + (net.edges[x].lv || 0)).join(','), '|', net.nodes[E.b].edges.map((x: number) => net.edges[x].type + '/' + (net.edges[x].lv || 0)).join(',')); }
    ok(close <= 2, `seed ${seed}: наземных развязок ближе ${step / 2} м подряд: ${close}`);
  }
  // плавность шоссе: на узлах степени 2 между рёбрами шоссе поворот ≤ 12° (ломаная давала 20–45°, до 175°)
  { let mx = 0; net.nodes.forEach((N0: any, n: number) => { if (!N0.alive) return; const L = N0.edges.filter((e: number) => net.edges[e].alive); if (L.length !== 2 || L.some((e: number) => net.edges[e].type !== 2)) return;
      const d = L.map((e: number) => { const E = net.edges[e], o = net.nodes[E.a === n ? E.b : E.a]; return [(o.x - N0.x) / E.len, (o.z - N0.z) / E.len]; });
      mx = Math.max(mx, 180 - Math.acos(Math.max(-1, Math.min(1, d[0][0] * d[1][0] + d[0][1] * d[1][1]))) * 180 / Math.PI); });
    ok(mx <= 12, `seed ${seed}: макс. излом шоссе ${mx.toFixed(1)}° (≤ 12°)`); }
  console.log('   ' + ((globalThis as any).__netgenLog || []).join('; '));
}
if (fail) { console.log('Провалено: ' + fail); process.exit(1); } else console.log('Все проверки сети пройдены');
