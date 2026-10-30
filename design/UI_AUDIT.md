# UI_AUDIT — текущая игра (src/) против дизайна (design/)
Дата: 30.10.2026. Источник «сейчас»: vite dev :5199, `?seed=7&size=1`, 1600×900, swiftshader.
Скриншоты: `shots/audit-now-{menu,hud,eco,transport,tool,close3d}.png`, сравнения `shots/audit-{hud,menu,panel}-vs.png`.

## Корень проблемы
`src/style.css` импортирует `design/ui.css` (переменные определены: все 33 `var(--…)` кроме `--mono`), **но разметка `src/ui.ts` не использует ни одного компонента `cs-*`**. Получается «старый HUD в новых цветах»: верхняя строка из 10 эмодзи‑кнопок, левая колонка инструментов 196 px, `<select>` оверлеев, эмодзи вместо SVG `icons.svg.html`. Поэтому «не как у Дезигнера». Чинится заменой разметки, не цветов.

## P0 — компоновка (самый видимый эффект)
| # | Компонент | Сейчас (src) | Должно быть | Где менять |
|---|---|---|---|---|
|1|Панель инструментов|`#tools` слева, вертикальный список, эмодзи 🔍🛣〰…, `<kbd>`, сворачивание «◀ Свернуть», подсказка ЛКМ/ПКМ внутри|`.cs-glass.cs-dock` по центру снизу: `position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:4px;padding:6px;border-radius:22px`; кнопки `.cs-tool` 52×52, r=14, SVG 22 px `<svg><use href="#i-road"/></svg>`, хоткей — бейдж 10 px в углу; активная: `background:var(--accent);color:var(--accent-ink);box-shadow:var(--glow)`|`ui.ts` const TOOLS (стр. 14–23) + конструктор (`TOOLS.forEach…`); `style.css` `#tools*`, `#tools-toggle` удалить|
|2|Подменю инструмента|`#sub` отдельная панель слева|`.cs-seg` поповер над доком (bottom: 92px, по центру), сегменты 32 px, r=10|`ui.ts` showTool (`this.sub.innerHTML`), `style.css #sub`|
|3|Верхняя строка|`#top.panel` во всю ширину, 2 строки, 10 кнопок с эмодзи + `<select>`|Слева «капсула» статов `.cs-glass` (деньги `--money`, население, дата; цифры Manrope 700 20 px tabular-nums), по центру `.cs-seg` скорости (5 иконок 28 px), справа ряд `.cs-btn--icon` 40×40 (экономика/транспорт/города/регион/графики/настройки/сохранения/помощь) с tooltip. Высота 56, отступ 14 px, gap 10|`ui.ts` `this.top = h(…)`; `style.css #top, .stat, .sp`|
|4|Оверлеи|`<select id=overlay>` в топбаре|Кнопка `.cs-btn--icon` «слои» → вертикальный `.cs-glass` список с цветными свотчами `HEATMAPS` справа‑сверху|`ui.ts` OVERLAYS, setOverlay|
|5|Правая панель|`#right` 360 px, `<h3>💰 …</h3>`, таблицы без стилей|`.cs-glass.cs-panel` 380 px, `top:84px;right:14px;max-height:calc(100vh - 200px)`; `.cs-panel__head` (иконка 20 px + Manrope 600 16 px + `.cs-btn--icon` закрыть), `.cs-panel__body` с `.cs-kv` строками и `.cs-tabs`; анимация `.cs-enter`|`ui.ts` renderPanel (стр. ~130–215, все `R.innerHTML=`<h3>emoji`), `style.css #right, h3, table`|
|6|Главное меню|Своя `#menu .wrap` — карточка слева, пустой правый фон, нет превью|`menu-prototype.html`: фон — живой рендер карты/`out/cityplan.png` с blur, карточка `.cs-glass` 440 px слева `left:56px;top:44px`, логотип Manrope 800 56 px, размеры как `.cs-seg` с иконками, кнопка `.cs-btn--primary.cs-btn--lg`|`ui.ts`/`main.ts` построение меню; `style.css #menu*`|

## P1 — детали
|#|Компонент|Сейчас|Должно быть|Где|
|---|---|---|---|---|
|7|Уведомления|`#notes .note` с `border-left`, справа сверху|`.cs-toast` снизу‑справа над миникартой: r=14, иконка уровня 18 px в круге `--pos/--warn/--neg`, авто‑скрытие 6 с (не 12)|`ui.ts` note(); `style.css .note`|
|8|Миникарта|`#mini` 256 canvas, рамка panel|`.cs-glass` r=18, 200×200, слева снизу, поверх — кнопки зума `.cs-btn--icon` 28 px|`style.css #mini`|
|9|Hint у курсора|inline style `rgba(0,0,0,.7)` r=5|`.cs-glass` r=8, `font:500 12px var(--font)`, `padding:4px 8px`|`ui.ts` `this.hint`|
|10|Кнопки|`button.on` — заливка акцентом, старый синий glow `rgba(79,179,255,…)` в V8‑правках|только `.cs-btn`, `.cs-btn--primary`; убрать все `79,179,255` и `#06121f` → `var(--accent-ink)`|`style.css` grep `79,179,255`|
|11|Цель/обучение `#eng-goal`|свой блок снизу‑справа|`.cs-glass.cs-panel` 320 px, прогресс‑бар 4 px `--accent`, кнопка `.cs-btn` «Пропустить»|`style.css #eng-goal`, src/engage|
|12|Шрифты|Inter есть, заголовки тоже Inter|заголовки/числа `font-family:var(--display)` (Manrope)|`style.css h3,.stat b`|
|13|`--mono`|не определена в ui.css|`--mono:'JetBrains Mono',ui-monospace,monospace` (добавить в style.css :root или использовать `font-variant-numeric:tabular-nums`)|style.css|
|14|Иконки|эмодзи везде (панели, инструменты, скорость)|`icons.svg.html` (23 символа) инлайн в index.html один раз, `<svg class="cs-ic"><use href="#i-…"/></svg>`|index.html, ui.ts|

## P2 — 3D вид (против STYLE_GUIDE / scene-preset.ts)
|#|Что|Сейчас (`src/render/Renderer.ts`)|Должно быть|
|---|---|---|---|
|15|Материалы|`MeshLambertMaterial` для terrain/road/bld/veh (стр. 48–106)|`createStyledMaterial()` из `design/scene-preset.ts` (ночные окна по атрибуту `glow`, лавандовая тень) для зданий/транспорта/пропсов|
|16|Небо/туман|плоский `background 0x9cc7ea`, `Fog(0x9cc7ea)` (стр. 62, 513)|`applyScenePreset(renderer, scene,{time,shadows:true,shadowSize:2048})` — градиентный купол + персиковый туман, `toneMapping=ACESFilmic, exposure 1.05`, `outputColorSpace=SRGB`|
|17|Свет|sun 2.2, hemi своё|из пресета: hemi sky `#bfe3ff`/ground `#e9d9c0`, sun тёплый, `setTime()` по часам игры|
|18|Тени|PCF, bias −0.0008, normalBias 0.02 — **исправлено ✔**|оставить; mapSize 2048|
|19|Палитра зданий|`COL` в Renderer, «синие/бордовые» коробки (видно на audit-now-hud: тёмно‑синие крыши у промзоны)|цвета только из `palette.ts BUILD` (sugar/peach/mint стены, coral/teal/saffron крыши), без `0x3f7a3a` forest — `TREES`|
|20|Перекрёстки/светофоры|octagon pads, коробки‑светофоры в game.ts 113–125|`road-kit.buildJunction`, `traffic-signals.placeSignals` (FIX_VISUALS.md)|
|21|Земля|уже `createGroundMaterial` ✔, но крупные ровные «пятна» полей (тёмно‑зелёные трапеции)|сплат `surfaceWeights` и для полей; цвет полей `GROUND.field*`|

## Порядок внедрения
1. (0,5 дня) index.html: инлайн `icons.svg.html`; удалить из style.css `#tools*,#sub,#top .stat,.note,button.on`, все `79,179,255`.
2. (1 день) Док инструментов + сегмент‑подменю (п.1–2) — главный визуальный выигрыш.
3. (0,5 дня) Верхняя капсула статов + иконки панелей + скорость (п.3–4).
4. (1 день) Панели → `cs-panel` (п.5), тосты, миникарта, hint (п.7–9).
5. (0,5 дня) Меню по `menu-prototype.html` (п.6).
6. (1 день) 3D: `applyScenePreset` + `createStyledMaterial` (п.15–17), палитра (п.19).
Проверка каждого шага: сравнить с `ui-prototype.html` на 1600×900 и 1280×720.
