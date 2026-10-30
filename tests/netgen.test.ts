// Этап B: инварианты генерации сети (mechanics/13)
import { genWorld } from '../src/gen/worldgen';
import { components, CLS, overlapDup } from '../src/gen/netgen';
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
  // USER_FEEDBACK_2 A1/A2/A3/A4: дубли, тупики у дорог, шоссе в уровне только с проспектом/шоссе
  { const W2 = BALANCE.netgen.specW; let dup = 0, dead = 0, hwStreet = 0; const al = net.edges.map((E: any, i: number) => i).filter((i: number) => net.edges[i].alive);
    const sd = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => { const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(ax + dx * t - px, az + dz * t - pz); };
    for (const e of al) { const E = net.edges[e]; if (E.type === 2 || E.lv) continue; const A = net.nodes[E.a], B = net.nodes[E.b];
      for (const f of net.edgesNear((A.x + B.x) / 2, (A.z + B.z) / 2, E.len / 2 + 30)) { if (f === e) continue; const F = net.edges[f]; if (!F.alive || F.lv) continue; const P = net.nodes[F.a], Q = net.nodes[F.b];
        const cos = Math.abs(((B.x - A.x) * (Q.x - P.x) + (B.z - A.z) * (Q.z - P.z)) / (E.len * F.len)); const thr = (W2[E.type] + W2[F.type]) / 2 + 4;
        void cos; if (f > e && overlapDup(A, B, P, Q, thr)) dup++; } }
    net.nodes.forEach((N0: any, n: number) => { if (!N0.alive) return; const L = N0.edges.filter((e: number) => net.edges[e].alive);
      if (L.some((e: number) => net.edges[e].type === 2 && !net.edges[e].lv) && L.some((e: number) => !net.edges[e].lv && (net.edges[e].type === 0 || net.edges[e].type === 3))) hwStreet++;
      if (L.length !== 1 || N0.outside || net.edges[L[0]].type === 2) return;
      for (const f of net.edgesNear(N0.x, N0.z, 20)) { const F = net.edges[f]; if (!F.alive || f === L[0] || F.a === n || F.b === n || F.lv || F.type === 2) continue; if (sd(N0.x, N0.z, net.nodes[F.a].x, net.nodes[F.a].z, net.nodes[F.b].x, net.nodes[F.b].z) < 12) { dead++; break; } } });
    { let xx = 0; net.nodes.forEach((N0: any) => { if (N0.alive && N0.edges.filter((e: number) => net.edges[e].alive && net.edges[e].type === 2 && !net.edges[e].lv).length >= 4) xx++; }); ok(xx === 0, `seed ${seed}: крестов «шоссе × шоссе» в уровне ${xx}`); }
    { let avDead = 0, cds = 0; const ends: any[] = []; net.nodes.forEach((N0: any) => { if (!N0.alive || N0.outside) return; const L = N0.edges.filter((e: number) => net.edges[e].alive); if (L.length !== 1) return; ends.push(N0); if (net.edges[L[0]].type === 1) { let cur = N0, e = L[0], hwEnd = false; for (let g = 0; g < 200; g++) { const E = net.edges[e]; const o = net.nodes[E.a === net.nodes.indexOf(cur) ? E.b : E.a]; if (o.edges.some((x: number) => net.edges[x].alive && net.edges[x].type === 2)) { hwEnd = true; break; } const nx = o.edges.filter((x: number) => net.edges[x].alive && x !== e && net.edges[x].type === 1); if (nx.length !== 1 || o.edges.filter((x: number) => net.edges[x].alive).length !== 2) break; cur = o; e = nx[0]; } if (!hwEnd) avDead++; } });
      for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) if (Math.hypot(ends[i].x - ends[j].x, ends[i].z - ends[j].z) < 80) cds++;
      ok(avDead === 0, `seed ${seed}: проспектов, кончающихся тупиком: ${avDead} (кроме съездов-стыков шоссе)`); ok(cds <= Math.max(3, ends.length * 0.05), `seed ${seed}: пар тупиков ближе 80 м ${cds} (тупиков ${ends.length})`); }
    ok(dup <= 2, `seed ${seed}: дублей «дорога в дороге» ${dup} (≤ 2)`); ok(dead <= 2, `seed ${seed}: тупиков ближе 12 м к дороге ${dead} (≤ 2)`); ok(hwStreet <= 3, `seed ${seed}: узлов «шоссе в уровне с улицей/переулком» ${hwStreet} (≤ 3)`); }
  // плавность шоссе: на узлах степени 2 между рёбрами шоссе поворот ≤ 12° (ломаная давала 20–45°, до 175°)
  { let mx = 0; net.nodes.forEach((N0: any, n: number) => { if (!N0.alive) return; const L = N0.edges.filter((e: number) => net.edges[e].alive); if (L.length !== 2 || L.some((e: number) => net.edges[e].type !== 2)) return;
      const d = L.map((e: number) => { const E = net.edges[e], o = net.nodes[E.a === n ? E.b : E.a]; return [(o.x - N0.x) / E.len, (o.z - N0.z) / E.len]; });
      mx = Math.max(mx, 180 - Math.acos(Math.max(-1, Math.min(1, d[0][0] * d[1][0] + d[0][1] * d[1][1]))) * 180 / Math.PI); });
    ok(mx <= 12, `seed ${seed}: макс. излом шоссе ${mx.toFixed(1)}° (≤ 12°)`); }
  console.log('   ' + ((globalThis as any).__netgenLog || []).join('; '));
}
if (fail) { console.log('Провалено: ' + fail); process.exit(1); } else console.log('Все проверки сети пройдены');
