// node design/render-cards.mjs  (vite на :5199) → design/cards/*.png
import { chromium } from 'playwright'; import fs from 'fs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.goto('http://localhost:5199/design/cards.html');
await p.waitForFunction('window.ready === true', null, { timeout: 60000 });
const cards = await p.evaluate('window.cards');
for (const [id, url] of Object.entries(cards)) fs.writeFileSync(`design/cards/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(cards).length, 'cards'); await b.close();
