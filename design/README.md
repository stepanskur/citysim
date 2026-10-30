# design/ — дизайн CitySim (стиль «Пастила», v0.2)
| Файл | Что |
|---|---|
| CONCEPT.md | Полная концепция игры: идентичность, арт, звук, цикл, прогрессия, экономика, сценарии, онбординг, UX, **реалистичная генерация** |
| FIX_VISUALS.md (+ ground-material.ts, road-kit.ts, traffic-signals.ts, fix-preview.html) | Исправления по QA: светофоры, земля, перекрёстки — числа и задачи для src/ |
| UI_AUDIT.md (+ shots/audit-*.png) | Аудит: текущий UI/3D против дизайна, селекторы и порядок правок |
| ROADS_SPEC.md (+ road-kit-v2.ts, road-curves.ts, metro-view.ts, models/stations.ts, v3-preview.html) | Профили, рельсы, мосты, тоннели, станции, метро-рентген, кривые |
| THEMES_SPEC.md (+ models/themes/*.ts, themes-preview.html, shots/v4-*) | Масштабируемые здания и темы base / позднее СНГ / рус. классика / Париж |
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
