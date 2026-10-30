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
console.log(fail ? `Провалено: ${fail}` : 'Все проверки пробок пройдены'); process.exit(fail ? 1 : 0);
