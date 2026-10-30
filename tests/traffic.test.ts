// Этап F: пробки и объезд — сглаженная стоимость полос, выбор пути в обход затора, перестройка застрявших агентов
import { RoadNet } from '../src/world/RoadNet';
import { Traffic } from '../src/sim/Traffic';
let fail = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok ' : 'FAIL ') + m); if (!c) fail++; };
const net = new RoadNet();
// прямая A(0,0)→B(1000,0) через M(500,0) и объезд через верх (500,300)
net.addRoad(0, 0, 500, 0, 1, 2); net.addRoad(500, 0, 1000, 0, 1, 2); net.addRoad(0, 0, 500, 300, 1, 2); net.addRoad(500, 300, 1000, 0, 1, 2); net.addRoad(-500, 0, 0, 0, 1, 2);
const w: any = { net, cities: [], nearestCity: () => -1, edgeOff: () => 0 };
const T = new Traffic(w); T.ensure();
const A = net.nearestNode(0, 0, 5), B = net.nearestNode(1000, 0, 5), M = net.nearestNode(500, 0, 5);
const via = (p: Int32Array | null) => p ? [...p].some(l => { const E = net.edges[l >> 1]; return E.a === M || E.b === M; }) : null;
T.updateCosts(); ok(via(T.route(A, B)) === true, 'без пробки путь прямой (через M)');
// затор на прямой: полоса M→B забита
const eMB = net.nodes[M].edges.find(e => { const E = net.edges[e]; return E.a === B || E.b === B; })!; const lMB = eMB * 2 + (net.edges[eMB].a === M ? 0 : 1);
T.laneW[lMB] = 500; T.updateCosts(); ok(T.costT[lMB] > 500 / 11 * 2, `сглаженная стоимость выросла: ${T.costT[lMB].toFixed(0)} с`);
const o1 = T.costT[lMB]; T.updateCosts(); ok(T.costT[lMB] > o1, 'EMA: стоимость подтягивается за пересчёты, не скачком');
ok(via(T.route(A, B)) === false, 'новые поездки после пересчёта едут в объезд');
// агент уже на A→M, стоит в очереди
T.laneW[lMB] = 0; T.updateCosts(); T.updateCosts(); T.updateCosts(); T.updateCosts(); T.updateCosts(); T.updateCosts(); const p = T.route(A, B)!; ok(via(p) === true, 'затор рассосался — снова прямой путь');
const S = net.nearestNode(-500, 0, 5); T.cache.clear(); T.spawn(S, B, 0, -1); const v = T.vehs.find(v => v && v.alive)!; v.wait = 60; T.laneW[lMB] = 500; T.updateCosts(); T.updateCosts();
T.rnd = () => 0; T.rerouteStuck();
ok(T.stats.rerouted === 1 && via(v.path) === false, 'застрявший агент перестроил остаток пути в объезд затора');
ok(v.path.length >= 2, 'путь агента цел');
console.log(`   перестроено ${T.stats.rerouted} из попыток ${T.rerouteTried}`);
// этап C (17): одностороннее, режимы узлов
{ const n2 = new RoadNet(); n2.addRoad(0, 0, 400, 0, 0, 2); n2.addRoad(400, 0, 800, 0, 0, 2); const w2: any = { net: n2, cities: [], nearestCity: () => -1, edgeOff: () => 0 }; const T2 = new Traffic(w2);
  const a = n2.nearestNode(0, 0, 5), m = n2.nearestNode(400, 0, 5), b = n2.nearestNode(800, 0, 5); const e1 = n2.nodes[a].edges[0];
  ok(!!T2.astar(b, a), 'двусторонняя: обратный путь есть'); n2.setOneWay(e1, 1); ok(!T2.astar(b, a) && !!T2.astar(a, b), 'одностороннее a→b: обратно не проехать');
  const e2 = n2.setOneWay(e1, -1); ok(!!T2.astar(m, a) && !T2.astar(a, m), 'разворот одностороннего');
  n2.setOneWay(e2, 0); ok(!!T2.astar(a, m) && !!T2.astar(m, a), 'снятие одностороннего');
  const dead = new RoadNet(); dead.addRoad(0, 0, 100, 0, 0, 2); dead.setOneWay(0, 1); ok(!dead.flowOk(dead.nearestNode(100, 0, 5)), 'тупик без выезда распознаётся'); }
{ const n3 = new RoadNet(); n3.addRoad(-300, 0, 0, 0, 1, 2); n3.addRoad(0, 0, 300, 0, 1, 2); n3.addRoad(0, 0, 0, 300, 1, 2); n3.addRoad(1000, 0, 1300, 0, 0, 2); n3.addRoad(1000, 0, 1000, 300, 0, 2); n3.addRoad(700, 0, 1000, 0, 0, 2);
  n3.addRoad(2000, 0, 2300, 0, 1, 2); n3.addRoad(2000, 0, 1700, 0, 1, 2); n3.addRoad(2000, 0, 2300, 220, 1, 2); // Y-развилка ~36°
  const T3 = new Traffic({ net: n3, cities: [], nearestCity: () => -1, edgeOff: () => 0 } as any);
  ok(T3.nodeMode(n3.nearestNode(0, 0, 5)) === 1, 'проспект × проспект — светофор'); ok(T3.nodeMode(n3.nearestNode(1000, 0, 5)) === 2, 'улица × улица — приоритет');
  ok(T3.nodeMode(n3.nearestNode(2000, 0, 5)) === 1, 'Y-развилка проспектов 30–60° — светофор');
  const nn = n3.nearestNode(1000, 0, 5); n3.nodes[nn].ctl = 3; n3.version++; ok(T3.nodeMode(nn) === 3, 'режим узла вручную'); }
console.log(fail ? `Провалено: ${fail}` : 'Все проверки пробок пройдены'); process.exit(fail ? 1 : 0);
