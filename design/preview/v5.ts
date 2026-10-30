// Превью v5: роутер по hash-префиксу.
const v = location.hash.slice(1) || 'night-street'; addEventListener('hashchange', () => location.reload());
const pre = v.split('-')[0];
const mods: Record<string, () => Promise<unknown>> = { night: () => import('./v5night'), joints: () => import('./v5joints'), ground: () => import('./v5ground'), palette: () => import('./v5ground'), water: () => import('./v5water'), yards: () => import('./v5yards') };
(mods[pre] ?? mods.night)();
