import { layoutYard, YARD_RULES, type ThemeId } from '../yards';
document.getElementById('lbl')!.textContent = 'v5 · Дворы по темам (60×40 м) + панель выбора темы зоны';
const C: Record<string, string> = { lawn: '#9cae7c', path: '#d8cdb8', parking: '#7a7c88', playground: '#e2b98a', tree: '#4f6d42', bush: '#6e8a55', bench: '#8a5a4a', garage: '#b9b2a8', fountain: '#8cc0d0', bins: '#55586a' };
const names: Record<ThemeId, string> = { lateSng: 'Позднее СНГ', russianClassic: 'Российская классика', french: 'Париж', base: 'Пастила' };
document.body.style.background = '#e9e6df';
const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;inset:56px 20px 60px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;font:12px Inter;color:#222'; document.body.appendChild(wrap);
for (const t of Object.keys(names) as ThemeId[]) {
  const cv = document.createElement('canvas'); cv.width = 600; cv.height = 400; cv.style.width = '100%'; const g = cv.getContext('2d')!; const S = 10;
  g.fillStyle = '#cfc6b4'; g.fillRect(0, 0, 600, 400); g.translate(300, 200);
  for (const it of layoutYard(t, 58, 38, 3)) { g.save(); g.translate(it.x * S, it.z * S); g.rotate(it.rot ?? 0); g.fillStyle = C[it.kind];
    if (it.kind === 'tree') { g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill(); } else if (it.kind === 'bush') { g.beginPath(); g.arc(0, 0, 10, 0, 7); g.fill(); } else if (it.kind === 'bench') g.fillRect(-9, -3, 18, 6); else if (it.kind === 'fountain') { g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill(); }
    else { g.fillRect(-(it.w! * S) / 2, -(it.d! * S) / 2, it.w! * S, it.d! * S); if (it.kind === 'parking') { g.strokeStyle = '#fff'; for (let x = -it.w! * S / 2; x < it.w! * S / 2; x += 25) { g.beginPath(); g.moveTo(x, -it.d! * S / 2); g.lineTo(x, -it.d! * S / 2 + 50); g.stroke(); } } }
    g.restore(); }
  const R = YARD_RULES[t]; const box = document.createElement('div'); box.innerHTML = `<b>${names[t]}</b> — дорожки ${R.path.style} ${R.path.w} м, парковка ${R.parkingShare * 100}%, деревья шаг ${R.treeStep} м`; box.prepend(cv); wrap.appendChild(box);
}
const ui = document.createElement('div'); ui.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:6px;background:#16192cdd;padding:8px;border-radius:14px;font:12px Inter;color:#fff;align-items:center';
ui.innerHTML = '<span style="margin-right:6px">Зона: <b>Жилая</b> · Тема:</span>' + (['lateSng', 'russianClassic', 'french', 'base'] as ThemeId[]).map((t, i) => `<span style="padding:5px 10px;border-radius:999px;${i === 0 ? 'background:#5fe0c8;color:#06201c' : 'background:#ffffff14'}">${names[t]}</span>`).join('') + '<span style="opacity:.5;margin-left:8px;text-decoration:line-through">Смешанный</span>';
document.body.appendChild(ui); document.getElementById('info')!.style.display = 'none'; (window as any).ready = true;
