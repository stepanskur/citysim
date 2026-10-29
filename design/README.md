# design/ — дизайн CitySim (стиль «Пастила», v0.2)
| Файл | Что |
|---|---|
| CONCEPT.md | Полная концепция игры: идентичность, арт, звук, цикл, прогрессия, экономика, сценарии, онбординг, UX, **реалистичная генерация** |
| GENERATION_PROPOSALS.md | Приоритизированные изменения src/gen и src/world с псевдокодом и параметрами |
| gen-prototypes/ | Автономный прототип плана города → out/cityplan.png (`npx tsx design/gen-prototypes/cityplan.ts <seed>`) |
| STYLE_GUIDE.md | Стиль, «что делает его уникальным», палитра v2, свет |
| UI_SPEC.md | Спецификация интерфейса v2 |
| palette.ts / palette.json | Палитра: BRAND, WORLD (day/dawn/dusk/night), TERRAIN, SEASONS, ROADS, BUILD, VEHICLES, TREES, HEATMAPS, UI |
| scene-preset.ts | `applyScenePreset(renderer, scene, {time})` → небо, свет, тени, туман, `setTime()`; `createStyledMaterial()` |
| models/ | Процедурные модели (здания, транспорт, деревья, пропсы) — см. models/README.md |
| ui.css, icons.svg.html, fonts/ | UI-кит v2 |
| ui-prototype.html, menu-prototype.html | Прототипы HUD и меню новой игры |
| models-preview.html + preview/ | Превью моделей: `npx vite` → /design/models-preview.html#hero\|grid\|veh\|street\|trees,day\|dusk\|night\|dawn |
| shots/ | Скриншоты (v2-* — актуальные) |

Проверка: `npx tsc -p design/tsconfig.json`.
