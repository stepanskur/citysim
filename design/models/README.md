# models — процедурные low-poly модели (v2)
Публичный API (стабилен): `createModel(spec)`, `ModelLibrary`, `createModelMaterial()`, `createStyledMaterial()`, `KINDS`, `VEHICLE_LENGTH`, а также всё из buildings/vehicles/trees/props.

## Геометрия
Неиндексированный `BufferGeometry` с атрибутами:
- `position`, `normal`;
- `color` — цвет вершин с **запечённой AO** (земля, нижние грани, градиент по высоте, тёплый/холодный тинт);
- `glow` (float) — 0 = никогда не светится; (0..1] = порог: окно горит ночью, если `glow < uNight`.
1 единица = 1 м, тайл 16 м, этаж 3.2 м. Модель стоит на y = 0 и центрирована по XZ.

## Материал
Используйте `createStyledMaterial()` (из scene-preset.ts, реэкспорт в index.ts). Это MeshStandardMaterial с `vertexColors` и патчем `onBeforeCompile`: свечение окон по `glow`/`uNight` и лавандовый тинт теней. Обычный `createModelMaterial()` тоже работает, но без ночных окон. Для InstancedMesh с `instanceColor` создавайте модели с `neutral: true` (светлая база, оттенок даёт инстанс).
`uNight` выставляет `applyScenePreset(...).setTime(...)` через общие `styleUniforms`.

## Здания: `createModel({type:'building', kind, opts:{seed, lotW, lotD, floors, neutral, lit}})`
Варианты по seed (BUILDING_VARIANTS): house 8, resMid/resTower/commercialSmall/office 6, industrial/warehouse/civic 4, station/depot 2. `lit` (0..1) — доля окон, которые могут светиться (заселённость/богатство).
Детали: карнизы и цоколь (sugar), трубы, мансарды, солнечные панели, рамы окон, балконы, вывески, козырьки.

## Транспорт, деревья, пропсы
10 видов транспорта (фары с glow, бамперы, решётка, номер, зеркала, колёса с дисками), длины — `VEHICLE_LENGTH`. Деревья: шар, конус, тополь, дуб (многоярусные). Пропсы — без изменений с v1.

## GeoBuilder (builder.ts)
`box, band, gable, hip, dormer, solar, cyl, blob, windowAt, windowGrid, wheel, rotateY, build()`.
**Совместимость v1:** `windows(cx,cz,w,d,y0,floors,floorH,c,winW=1.2,gap=1.6)` — сохранён (обёртка над windowGrid с сахарными рамами, без ночного свечения).

## v4: темы и масштабируемые здания
`createBuilding({ theme, kind, width, depth, floors|height, seed, lit, neutral, detail })` — см. `THEMES_SPEC.md`. Лимиты `dimensionsLimits()`, подгонка `fitDimensions()`, из участка `dimensionsFromLot()`, кэш `themedCacheKey()`. Старая форма `createBuilding(kind, opts)` не изменилась.
