import { genWorld } from './worldgen';
self.onmessage = (ev: MessageEvent) => {
  const { seed, sizeIdx, neighbors } = ev.data;
  const t0 = performance.now();
  const w = genWorld(seed, sizeIdx, s => (self as any).postMessage({ progress: s }), neighbors ?? 2);
  const r = w.roads;
  const transfer = [w.heights.buffer, w.resource.buffer, w.zone.buffer, w.bld.buffer, w.kind.buffer, w.cityOf.buffer, w.road.buffer, w.style.buffer, r.nx.buffer, r.nz.buffer, r.nc.buffer, r.nf.buffer, r.ea.buffer, r.eb.buffer, r.et.buffer, r.ec.buffer];
  (self as any).postMessage({ world: w, ms: performance.now() - t0 }, transfer);
};
