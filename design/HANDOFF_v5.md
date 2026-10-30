# HANDOFF v5 — передача Кодеру по частям
Порядок: 1 → 6 → 2 → 3 → 4 → 5. Каждая часть самодостаточна. src/ дизайнером не правился (только читался).

## Часть 1. Ночной стиль — ✅ ГОТОВО К ПЕРЕДАЧЕ
Спека: `NIGHT_SPEC.md`. Код: `night.ts`, `palette.ts → NIGHT`. Скрины: `shots/v5-night-{street,space,layers,zones,build}.png`.
Суть: фонари по классу дороги (шаг 42/32/28/30 м, высота 12/10/8/6 м), пятна света на асфальте и конусы вблизи, точки-огни и неон магистралей издали + bloom (threshold 0.82); фары/габариты по матрицам машин; ночь читаемая (подъём albedo 0.10, хеми 0.75); слои карты — «ночное видение» (монохром + неон данных).
Кодеру:
- `src/render/Renderer.ts → setTimeOfDay()`: при night > 0.5 вызывать `applyNightPreset` (один раз при переходе) и `setNightDistance(rig, ctl.dist)` каждый кадр/при зуме.
- `Renderer.ts → constructor`: `patchNightReadable()` на terrainMat, roadMat, marksMat, bldMat, styledMat, farMat.
- `Renderer.ts → buildBuildings()` стр. ~424 и ~471: убрать `addM('prop#streetLight')` по участкам; фонари ставить в `buildRoads(ch)` через `placeStreetLamps(edgePolyline, cls, {trimStart: padR(a), trimEnd: padR(b)})`, собирать в один `StreetLampSet` на чанк (4 draw call); `update(night, ctl.dist)` в `render()`.
- `Renderer.ts → render()`: машины — `CarLightSet.sync(vehMeshes[i])` после обновления трафика; при dist ≥ 1800 машины скрыты, огни — нет (до 2600).
- `Renderer.ts → render()`: заменить `renderer.render` на `createNightComposer(...).composer.render()` при night > 0.3 и качестве ≥ «Среднее»; `setDist(ctl.dist)`.
- `buildRoads(ch)`: для type шоссе/проспект — `buildRoadGlowStrip` + `createRoadGlowMaterial` (1 меш на чанк).
- Слои: `Renderer.overlay` (стр. 74, 187–197, 249, 316, 334) — вместо перекраски тайлов/дорог: `nightUniforms.uVision` → 1 (анимация 250 мс), загрузку рисовать отдельной лентой с атрибутом `load` и `createTrafficNeonMaterial()`; зоны — `createZoneNeonMaterial()` по лотам (instanceColor), тепловые — рампа `NIGHT.vision.heat` в `tileColor()`.
- Инструменты стройки (`src/tools.ts`): курсор `createCursorRing`, сетка `createBuildGridMaterial(8)` (uCenter = курсор), призрак — материал из §7.

## Часть 6 · Плавные стыки дорог (B1) — ✅ ГОТОВО К ПЕРЕДАЧЕ
Суть: узлы строятся одним SDF-мешем с галтелями, рёбра обрезаются по trims, без дисков и z-сдвигов. Спека: ROADS_SPEC.md «v5 · Стыки». Код: design/road-joints.ts. Шоты: v5-joints-{cross,trans,ends}.png.
Кодеру (src/render/Renderer.ts, buildRoads):
- заменить `disc(r)` (узлы deg-2 и тупики) и `buildJunction/padRadiusFor` на `buildNodeMesh(node, arms)`;
- начало/конец ленты ребра брать из `trims[edgeId]` (сдвиг вдоль полилинии);
- удалить `E.type*0.005` по Y, использовать Z_LAYERS + polygonOffset для разметки;
- краевые/осевые линии (`strip hw-0.55`) начинать с trim+5.5 (JOINT_MARKS);
- тупик по умолчанию 'bulb' для street/avenue, 'round' для lane, 'flat' — временный конец при строительстве.
Известно: тонкий шов на стыке площадки и ленты ребра (≤1 px, лечится общим skirt).

## Часть 2 · Меню строительства как в C:S (G1) — ✅ ГОТОВО К ПЕРЕДАЧЕ
Суть: службы → подвкладки → карточки с картинкой/ценой/содержанием, тултипы, хоткеи. Спека: UI_SPEC.md «v5 · Меню строительства». Прототип: design/build-menu-prototype.html; CSS .cs-bm/.cs-card/.cs-tip в ui.css; картинки design/cards/*.png (16 шт., скрипт design/render-cards.mjs).
Кодеру:
- src/ui (текущая вкладка строительства, п.9): заменить плоский список на структуру MENU из прототипа (службы[] → sub[] → cards[{model,name,desc,cost,upkeep,lockReason}]), разметку/классы взять из прототипа;
- выбор карточки → вызов существующего инструмента (tools.ts) по id карточки;
- lockReason считать из состояния игры (население, наличие вокзала/станции/депо);
- хоткеи Q/W/E/R/T, Tab, 1–9, Esc — в обработчик клавиатуры UI (не перехватывать при фокусе в input);
- картинки копировать из design/cards в public/ при сборке.

## Часть 3 · Земля, трава, приглушённая палитра (E1, E5) — ✅ ГОТОВО К ПЕРЕДАЧЕ
Суть: трава — инстансы пучков (3 треугольника, 1 draw call, до 60 000 на 90 м вокруг камеры, уход под землю 90→140 м вместо альфы), кусты-икосаэдры без подложки, ветер в шейдере. Палитра домов — формулой mute(). Код: design/ground.ts (GRASS, BUSH, WIND, createTuftGeometry, createGrassMaterial, scatterGrass, createBushGeometry/Material, tickGround), palette.ts (MUTE, mute(), BUILD_MUTED, THEMES_MUTED, GROUND_V5). Шоты: v5-ground.png, v5-palette.png.
Числа: трава плотность луг 1.6 / парк 1.2 / двор 0.8 / обочина 0.4 шт/м², высота 0.35–0.7 м; кусты 0.7–1.6 м, луг 0.012 / парк 0.03 / двор 0.02 / опушка 0.06 шт/м²; ветер 1.3 рад/с, амплитуда трава 0.12, кусты 0.035. Палитра: s' = min(s·0.55, 0.30), l' ∈ [0.30; 0.90], оттенок на 15 % к 35°. Земля grass 8fbd5e → 8ea56a.
Причины в src (Кодеру):
- «Деревья с зелёной подложкой» (s06): у моделей деревьев подложки нет; зелёные полосы/треугольники — (1) src/render/Renderer.ts ~183 `if (kd === K.PARK) out.setHex(GROUND.yardGrass)` — цвет ставится по вершинам тайловой сетки рельефа, и одиночные тайлы парка интерполируются в ромбы, треугольники и полосы; (2) Renderer.ts ~466 плита парка `boxes.push([x, y, z, 16, 0.4, 16, …, 0x7fb352])`. Исправление: плиту удалить, парк красить splat-маской в шейдере земли (или не красить вовсе) и сеять траву и кусты через ground.ts.
- «Дома вросли в землю» (E5): Renderer.ts ~484 `const y = w.hAt(L.x, L.z) - 0.3` берёт высоту в центре участка, и на склоне верхний край уходит под землю на ½·перепад + 0.3 м; Renderer.ts ~416 `min(4 углов) - 0.2` закапывает верхнюю сторону на весь перепад. Исправление: y = max(высот 4 углов пятна дома), добавить цоколь (бокс цвета BUILD_MUTED.plinth) от min(углов) − 0.3 до y, как в превью.
- Цвета: импорт BUILD → BUILD_MUTED, THEMES → THEMES_MUTED (Renderer.ts distCol, models/themes), GROUND.grass/yardGrass → GROUND_V5.
- Трава: в buildChunk при detail ≥ 2 вызвать scatterGrass(чанк, mask), где mask исключает road/bld/воду по w.road/w.bld/hAt<0; в render() вызывать tickGround(t, cam).

## Часть 4 · Вода (E6) — ✅ ГОТОВО К ПЕРЕДАЧЕ
Суть: вода — ShaderMaterial с flow map: процедурные нормали (fbm-градиент) адвектируются вдоль течения в 2 фазах (период 1.6 с, кросс-фейд) → волны идут по реке, а не по сетке, без «тряски». Цвет по глубине (shallow 7cc4c8 → deep 2f6f8e на 6 м), пена у берега 2.2 м с шумом + на быстрине, отражение неба по френелю (pow 4) + блик солнца. Код: design/water-material.ts (WATER, createWaterMaterial, riverFlowAt, shoreDistance). Шот: v5-water.png (зубчатый край — только обрезка меша в превью; в игре край закрыт рельефом).
Как получить поля (Кодеру):
- flow: для рек — касательная к осевой линии реки × скорость, профиль v·(1−(d/hw)²) (riverFlowAt); для озёр — дрейф 0.06 м/с (задано в шейдере). Если в генерации нет осевой линии, взять градиент высоты дна: flow = −∇H, нормировать, сгладить 2 проходами box-blur;
- shore (м до берега): shoreDistance(wet, N, TILE) — chamfer 3/4, два прохода O(N²), где wet = hAt<0 по тайлам; затем билинейно в вершины воды;
- depth = max(0, −hAt(x,z)).
- src/render/Renderer.ts 128–130: вода сейчас — ОДИН квад PlaneGeometry(M·3) на y=0 с Lambert, opacity 0.86. Вершинных атрибутов на нём не хватит: либо PlaneGeometry с сегментами по тайлу (только тайлы с hAt<1, остальное отбросить индексом, как в превью), либо запечь flow/depth/shore в DataTexture N×N (RGBA float) и читать в шейдере по vW.xz/M — второе дешевле;
- «трясёт»: плоскость y=0 почти совпадает с рельефом у берега (hAt≈0) → z-fighting/мерцание кромки. Опустить уровень воды на −0.05, у рельефа ниже 0 делать дно (hAt − 0.3), а кромку рисовать пеной по shore, а не пересечением; plus renderOrder 1 + depthWrite=false.
- в render() писать m.uniforms.uTime.

## Часть 5 · Темы застройки и дворы (F1, F2) — ✅ ГОТОВО К ПЕРЕДАЧЕ
Суть: тема выбирается кистью или зоной и не смешивается; «Смешанный» помечен DEPRECATED (THEMES_SPEC §5, §6). У каждой темы свои правила дворов (THEMES_SPEC §7). Код: design/yards.ts (YARD_RULES, YARD, layoutYard, ZONE_THEME_UI). Шот: v5-yards.png (4 темы и панель темы зоны).
Кодеру:
- настройка новой игры: убрать «Смешанный» из списка стилей; по умолчанию lateSng;
- инструмент зонирования (tools.ts): добавить параметр theme у кисти и панель из 4 тем, Shift+колесо меняет тему; писать `world.zoneTheme[k]`, сохранять в сейв;
- Renderer.ts, ветка двора ~407–413 (сейчас там случайные гаражи, детские площадки и 2 дерева на тайл): заменить на layoutYard(zoneTheme, OBB квартала) для каждого квартала (blockId), один раз на квартал, а не на тайл; kinds сопоставить с моделями: bench → prop#bench, tree → tree#<trees[]>, parking → плита асфальта + машины VEHICLES, playground → плита d9c7a0 + props;
- выбор темы дома: ThemedBuildingOpts.theme = zoneTheme участка (не эпоха).

## Прочие визуальные пункты фидбэка (на заметку, не в объёме v5)
- E2/E3/E4 (LOD без потери качества, предзагрузка, перф) — задача Кодера; со стороны дизайна для дальнего LOD использовать BUILD_MUTED, чтобы цвет не прыгал между LOD.
- B4 (мосты) — Z_LAYERS из road-joints.ts распространяются на мосты (skirt не рисовать над водой).
