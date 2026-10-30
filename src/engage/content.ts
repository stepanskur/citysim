// Контент вовлечённости по mechanics/10-engagement.md: онбординг (§1/P3), поручения (02 §5/P5), события (§3/P7),
// контракты (P8), достижения (§2.3/P12), советники (P13), дерево исследований (§5.2/P11). Чистые данные, без DOM.
import { BALANCE } from '../sim/balance';
import { ALERTS } from './consts';
const UT = BALANCE.reputation.unlockThresholds;

/** Метрики региона игрока, снимаются адаптером раз в игровой день (index.ts sample()). */
export interface Metrics {
  day: number; money: number; pop: number; popAll: number; cities: number; roads: number; arterials: number;
  zones: [number, number, number]; bld: number[]; lines: [number, number, number, number]; stopsMax: number; riders: number; trips: number;
  cong: number; unemp: number; short: number; income: number; expense: number; subs: number; loans: number;
  routesActive: number; maxCityPop: number; water: boolean; land: number; poll: number; happy: number;
  exports: number;
  /** население соседних ИИ-регионов (для сезонного рейтинга) */ rivals: { name: string; pop: number }[];
  /** игрок открывал панель экономики (цель 5) */ sawBudget: boolean; scale: number;
}
export type ModKey = 'growth' | 'income' | 'upkeep' | 'research' | 'tripCut' | 'otCap';
export type Effect = { money?: number; rep?: number; rp?: number; mod?: { k: ModKey; v: number; days: number; label: string }; price?: { good: number; mult: number } };
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

// ---------- P3. Онбординг: 5 целей (раздел 1) ----------
export interface Goal { id: string; title: string; hint: string; key?: string; done: (m: Metrics, b: Metrics) => boolean; progress?: (m: Metrics, b: Metrics) => number; rep?: number }
export const ONBOARDING: Goal[] = [
  { id: 'g_road', title: 'Разгрузите улицу', hint: 'Инструмент «🛣 Дорога» (2): проложите параллельную улицу или проспект у загруженной магистрали (красная в слое «Пробки», кнопка слоёв справа сверху).', key: '2', done: (m, b) => m.roads > b.roads },
  { id: 'g_res', title: 'Разметьте жильё', hint: '«🏘 Зонирование» (4) → «Жилая»: 20 участков у новой дороги.', key: '4', done: (m, b) => m.zones[0] - b.zones[0] >= 20, progress: (m, b) => (m.zones[0] - b.zones[0]) / 20 },
  { id: 'g_jobs', title: 'Дайте людям работу', hint: 'Зонируйте коммерцию (К) или промышленность (П): 10 участков.', key: '4', done: (m, b) => m.zones[1] + m.zones[2] - b.zones[1] - b.zones[2] >= 10, progress: (m, b) => (m.zones[1] + m.zones[2] - b.zones[1] - b.zones[2]) / 10 },
  { id: 'g_bus', title: 'Первый автобус', hint: '«🚌 Линии» (8) → «Автобус»: 4+ остановки у дорог, Enter — открыть линию.', key: '8', done: (m, b) => m.lines[0] > b.lines[0] && m.stopsMax >= 4, rep: 1 },
  { id: 'g_budget', title: 'Посмотрите бюджет и налоги', hint: 'Откройте «💰 Экономика» вверху: доходы, расходы, ставки налогов.', done: m => m.sawBudget },
];

// ---------- P5. Поручения (02 §5), генерация раз в месяц из топ-проблем ----------
export interface QuestTpl { id: string; title: string; months: number; reward: Effect; problem: (m: Metrics) => number; /** вернуть true, если условие дня выполнено */ day: (m: Metrics, p: any) => boolean; streak: number; params?: (m: Metrics) => any; text: (p: any) => string }
export const QUEST_TPL: QuestTpl[] = [
  { id: 'unjam', title: 'Разгрузить магистрали', months: 3, reward: { rep: 1, money: 100000 }, problem: m => m.cong - 0.4, day: m => m.cong < 0.4, streak: 7, text: () => 'Средняя загрузка дорог < 40% 7 дней подряд' },
  { id: 'feed', title: 'Накормить город', months: 4, reward: { rep: 2 }, problem: m => m.short - 0.05, day: m => m.short < 0.05, streak: 30, text: () => 'Дефицит товаров < 5% 30 дней подряд' },
  { id: 'jobs', title: 'Доступная работа', months: 6, reward: { rep: 2 }, problem: m => m.unemp - 0.08, day: m => m.unemp < 0.06, streak: 14, text: () => 'Безработица < 6% 14 дней подряд' },
  { id: 'payot', title: 'Окупить ОТ', months: 6, reward: { money: 1000000 }, problem: m => sum(m.lines) ? 0.2 : -1, day: m => m.income >= m.expense, streak: 30, text: () => 'Доходы ≥ расходов 30 дней подряд' },
  { id: 'green', title: 'Зелёный центр', months: 12, reward: { rep: 2 }, problem: m => m.poll - 0.3, day: m => m.poll < 0.3, streak: 14, text: () => 'Загрязнение < 0,3 14 дней подряд' },
  { id: 'grow', title: 'Рост города', months: 3, reward: { money: 200000, rep: 1 }, problem: () => 0.01, params: m => ({ target: Math.round(m.pop * 1.1 + 500) }), day: (m, p) => m.pop >= p.target, streak: 1, text: p => `Население ${p.target.toLocaleString('ru')}` },
];

// ---------- P7. События (раздел 3). Вариант A — по умолчанию по таймауту ----------
export interface EvOption { label: string; desc: string; cost?: number; eff: Effect; fail?: number }
export interface EvDef { id: string; icon: string; title: string; crisis: boolean; weight: (m: Metrics, day: number) => number; text: (m: Metrics, p: any) => string; params?: (m: Metrics, r: () => number) => any; options: (m: Metrics, p: any) => EvOption[] }
const K1 = (v: number) => Math.round(v / 1000) * 1000;
export const EVENTS: EvDef[] = [
  { id: 'jam', icon: '🚗', title: 'Транспортный коллапс', crisis: true, weight: m => m.cong > 0.6 ? 3 : 0, text: () => 'Магистрали стоят в пробках, жители опаздывают на работу.',
    options: m => [
      { label: 'Экстренные автобусы', desc: '+20% ёмкости ОТ на 30 дн', cost: K1(300000 * m.scale), eff: { mod: { k: 'otCap', v: 0.2, days: 30, label: 'Экстренные автобусы' } } },
      { label: '«Удалёнка»', desc: '−10% поездок, −5% доходов на 30 дн', eff: { mod: { k: 'tripCut', v: 0.1, days: 30, label: 'Удалёнка' } } },
      { label: 'Ничего не делать', desc: '−2 репутации, спрос на жильё падает', eff: { rep: -2, mod: { k: 'growth', v: -0.003, days: 30, label: 'Пробки' } } }] },
  { id: 'short', icon: '📉', title: 'Дефицит товаров', crisis: true, weight: m => m.short > ALERTS.goodsShortage ? 3 : 0, text: () => 'Полки магазинов пустеют: поставки не успевают за спросом.',
    options: m => [
      { label: 'Срочный импорт', desc: 'Закупка у соседей', cost: K1(30000 + m.pop * 0.5), eff: { rep: 1 } },
      { label: 'Ценовой потолок', desc: 'Счастье −, бесплатно', eff: { rep: -1, mod: { k: 'growth', v: -0.002, days: 20, label: 'Ценовой потолок' } } },
      { label: 'Субсидия фабрикам', desc: 'Доходы +3% на 30 дн', cost: K1(15000 + m.pop * 0.3), eff: { mod: { k: 'income', v: 0.03, days: 30, label: 'Субсидия фабрикам' } } }] },
  { id: 'price', icon: '📈', title: 'Ценовой кризис: топливо', crisis: true, weight: () => 1, text: () => 'Мировые цены на топливо резко выросли.',
    options: m => [
      { label: 'Выпуск из резервов', desc: 'Цены растут слабо', cost: K1(20000 + m.pop * 0.3), eff: { price: { good: 7, mult: 1.05 } } },
      { label: 'Снизить пошлины', desc: 'Доходы −3% на 30 дн', eff: { price: { good: 7, mult: 1.1 }, mod: { k: 'income', v: -0.03, days: 30, label: 'Нулевые пошлины' } } },
      { label: 'Ничего', desc: 'Цены +30%, −1 репутации', eff: { rep: -1, price: { good: 7, mult: 1.3 } } }] },
  { id: 'fire', icon: '🔥', title: 'Пожар в старом квартале', crisis: true, weight: m => m.bld[1] > 50 ? 2 : 0, text: () => 'В плотном старом квартале крупный пожар.',
    options: m => [
      { label: 'Пожарная служба', desc: 'Расходы на услуги ×1,2 месяц', cost: K1(20000 + m.expense * 6), eff: { rep: 1 } },
      { label: 'Восстановить за счёт бюджета', desc: '50% риск дорогого ущерба', cost: K1(10000 + m.pop * 0.2), eff: { rep: 2 }, fail: 0.5 },
      { label: 'Пусть страховка платит', desc: '−3 репутации', eff: { rep: -3 } }] },
  { id: 'fest', icon: '🎉', title: 'Праздник города', crisis: false, weight: (m, d) => d % 360 === 120 ? 100 : m.pop > 2000 ? 1 : 0, text: m => `День города! Жители (${Math.round(m.pop).toLocaleString('ru')}) ждут праздника.`,
    options: m => [
      { label: 'Фестиваль', desc: 'Рост +, туристы, +3 репутации', cost: K1(200000 * m.scale), eff: { rep: 3, mod: { k: 'growth', v: 0.003, days: 30, label: 'Фестиваль' } } },
      { label: 'Скромно', desc: '+1 репутации', eff: { rep: 1 } }] },
  { id: 'baby', icon: '👶', title: 'Приток мигрантов', crisis: false, weight: m => m.happy > 0.7 ? 1 : 0, text: () => 'Город привлекателен: сюда хотят переехать тысячи семей.',
    options: () => [{ label: 'Принять', desc: '+3% жителей за 10 дн, давление на жильё', eff: { mod: { k: 'growth', v: 0.004, days: 10, label: 'Приток мигрантов' } } }, { label: 'Ограничить', desc: 'Без эффекта', eff: {} }] },
  { id: 'strike', icon: '✊', title: 'Забастовка транспортников', crisis: true, weight: m => sum(m.lines) >= 2 && m.cong > 0.5 ? 1 : 0, text: () => 'Водители требуют повышения зарплат.',
    options: m => [{ label: 'Повысить содержание ОТ', desc: 'Расходы на ОТ +15%', cost: K1(5000 + m.expense * 3), eff: {} }, { label: 'Переждать', desc: '−2 репутации', eff: { rep: -2 } }] },
  { id: 'invest', icon: '🏭', title: 'Инвестор', crisis: false, weight: (_m) => 0, text: () => 'Инвестор хочет построить завод.',
    options: m => [{ label: 'Принять завод', desc: '+доход, загрязнение', eff: { money: K1(150000 * m.scale + 50000), mod: { k: 'income', v: 0.04, days: 60, label: 'Новый завод' } } }, { label: '«Зелёный» завод', desc: 'Меньше денег, +репутация', eff: { money: K1(60000 * m.scale + 20000), rep: 2 } }] },
  { id: 'grant', icon: '🏛', title: 'Федеральный грант', crisis: false, weight: () => 0.6, text: () => 'Министерство предлагает грант. Выберите направление.',
    options: m => [{ label: 'Наука', desc: '+8 ОР', eff: { rp: 8 } }, { label: 'Инфраструктура', desc: 'Деньги', eff: { money: K1(100000 * m.scale + 20000) } }, { label: 'Соцпрограммы', desc: '+3 репутации', eff: { rep: 3 } }] },
];
export const EVENT_REP_INVESTOR = 60; // «Инвестор»: вес 1 при репутации ≥ 60 (выставляется в engine)

// ---------- P8. Контракты соседей ----------
export const CONTRACT_GOODS = [{ g: 4, name: 'Продукты' }, { g: 5, name: 'Мебель' }, { g: 6, name: 'Металл' }, { g: 7, name: 'Топливо' }, { g: 8, name: 'Потребтовары' }];

// ---------- P12. Достижения (02 §6 + 10 §2.3) ----------
export interface AchStats { totalRiders: number; daysNoDebt: number; crisesSolved: number; contracts: number; techs: number; quests: number; plusMonths: number }
export interface Ach { id: string; icon: string; title: string; desc: string; test: (m: Metrics, s: AchStats) => boolean; reward?: number }
export const ACHIEVEMENTS: Ach[] = [
  { id: 'a_first', icon: '🏁', title: 'Первые шаги', desc: 'Выполнить первую цель', test: (_, s) => s.quests >= 1 },
  { id: 'a_onb', icon: '🎓', title: 'Мэр-стажёр', desc: 'Пройти обучение', test: () => false },
  { id: 'a_10k', icon: '🏘', title: 'Городок', desc: 'Население 10 тыс', test: m => m.pop >= 1e4 },
  { id: 'a_100k', icon: '🏙', title: 'Город', desc: 'Население 100 тыс', test: m => m.pop >= 1e5 },
  { id: 'a_1m', icon: '🌃', title: 'Мегаполис', desc: 'Население 1 млн', test: m => m.pop >= 1e6 },
  { id: 'a_lines5', icon: '🚌', title: 'Сеть маршрутов', desc: '5 линий транспорта', test: m => sum(m.lines) >= 5 },
  { id: 'a_metro', icon: 'Ⓜ', title: 'Подземка', desc: 'Открыть линию метро', test: m => m.lines[2] > 0 },
  { id: 'a_riders', icon: '🎫', title: 'Миллион пассажиров', desc: 'Перевезти 1 млн пассажиров суммарно', test: (_, s) => s.totalRiders >= 1e6 },
  { id: 'a_nodebt', icon: '🧾', title: 'Без долгов', desc: '5 лет без кредитов', test: (_, s) => s.daysNoDebt >= 1800 },
  { id: 'a_plus6', icon: '📊', title: 'Финансовая дисциплина', desc: '6 месяцев подряд с плюсом', test: (_, s) => s.plusMonths >= 6 },
  { id: 'a_crisis', icon: '🧯', title: 'Антикризисный менеджер', desc: 'Разрешить 5 кризисов', test: (_, s) => s.crisesSolved >= 5 },
  { id: 'a_contract', icon: '🤝', title: 'Надёжный партнёр', desc: 'Выполнить 3 контракта соседей', test: (_, s) => s.contracts >= 3 },
  { id: 'a_tech', icon: '🔬', title: 'Прогрессор', desc: 'Изучить 6 узлов', test: (_, s) => s.techs >= 6 },
  { id: 'a_land', icon: '🗺', title: 'Землевладелец', desc: 'Владеть 4 подрегионами', test: m => m.subs >= 4 },
  { id: 'a_jam', icon: '🟢', title: 'Первая пробка разобрана', desc: 'Загрузка дорог < 30% при населении 20 тыс+', test: m => m.pop >= 2e4 && m.cong < 0.3 },
  { id: 'a_route', icon: '🛤', title: 'Добрые соседи', desc: 'Активный межрегиональный маршрут', test: m => m.routesActive > 0 },
];

// ---------- P11. Дерево исследований (§5.2, 4 ветви, 18 узлов) ----------
export interface Tech { id: string; br: number; title: string; icon: string; cost: number; req: string[]; desc: string; eff?: Effect; unlock?: { line?: number } }
export const BRANCHES = ['Транспорт', 'Логистика', 'Экономика', 'Город и дипломатия'];
const T = (br: number, id: string, title: string, icon: string, cost: number, req: string[], desc: string, x: Partial<Tech> = {}): Tech => ({ br, id, title, icon, cost, req, desc, ...x });
const PERM = 1e7;
export const TECHS: Tech[] = [
  T(0, 'lanes', 'Выделенные полосы', '🚌', 20, [], 'Автобусы не тормозят в пробках', { eff: { mod: { k: 'otCap', v: 0.1, days: PERM, label: 'Выделенные полосы' } } }),
  T(0, 'lights', 'Умные светофоры', '🚦', 40, ['lanes'], 'Пропускная способность +10%, содержание дорог −10%', { eff: { mod: { k: 'upkeep', v: 0.1, days: PERM, label: 'Умные светофоры' } } }),
  T(0, 'ftram', 'Скоростной трамвай', '🚋', 60, ['lights'], 'Скорость трамвая +20%'),
  T(0, 'ametro', 'Автоматическое метро', 'Ⓜ', 120, ['ftram'], 'Право строить метро (+ репутация 55)', { unlock: { line: 2 } }),
  T(1, 'sort', 'Сортировочный склад', '📦', 20, [], 'Ёмкость склада +50%'),
  T(1, 'cont', 'Контейнеры', '🚢', 40, ['sort'], 'Перегрузка 40 → 20 ₽/т', { eff: { mod: { k: 'income', v: 0.02, days: PERM, label: 'Контейнеры' } } }),
  T(1, 'rterm', 'Ж/д терминалы', '🚆', 60, ['cont'], 'Вагон 60 → 80 т'),
  T(1, 'hub', 'Логистический хаб', '🏗', 100, ['rterm'], 'Доставка −15%', { eff: { mod: { k: 'upkeep', v: 0.05, days: PERM, label: 'Логистический хаб' } } }),
  T(2, 'incub', 'Бизнес-инкубатор', '💡', 20, [], 'Спрос на коммерцию +0,05', { eff: { mod: { k: 'growth', v: 0.001, days: PERM, label: 'Бизнес-инкубатор' } } }),
  T(2, 'clust', 'Кластеры', '🏭', 50, ['incub'], 'Выпуск по рецептам +20%', { eff: { mod: { k: 'income', v: 0.04, days: PERM, label: 'Кластеры' } } }),
  T(2, 'exch', 'Биржа', '📈', 80, ['clust'], 'Цены сглаживаются вдвое'),
  T(2, 'sez', 'Свободная экономическая зона', '🆓', 120, ['exch'], 'Налог на промышленность 0 в одном подрегионе', { eff: { mod: { k: 'growth', v: 0.002, days: PERM, label: 'СЭЗ' } } }),
  T(3, 'hear', 'Публичные слушания', '🗣', 20, [], '+1 репутации/мес при счастье > 0,6'),
  T(3, 'brand', 'Городской бренд', '🌟', 40, ['hear'], 'Привлекательность +0,1', { eff: { mod: { k: 'growth', v: 0.002, days: PERM, label: 'Городской бренд' } } }),
  T(3, 'diplo', 'Дипломатическая служба', '🤝', 60, ['brand'], 'ИИ-соседи охотнее согласуют маршруты (порог −0,05)'),
  T(3, 'agglo', 'Агломерация', '🌐', 100, ['diplo'], 'Миграция ×1,5', { eff: { mod: { k: 'growth', v: 0.003, days: PERM, label: 'Агломерация' } } }),
  T(3, 'joint', 'Совместные проекты', '🌉', 140, ['agglo'], 'Доступ к совместным проектам с соседями'),
  T(3, 'mega', 'Мегапроекты', '🗼', 200, ['joint'], 'Достопримечательности'),
];
/** Разблокировки транспорта/зданий по 02 §4: потребность + репутация (+ узел, где указан) */
export interface Unlock { key: string; title: string; rep: number; tech?: string; need: (m: Metrics) => boolean; needText: string; line?: number; place?: number }
export const UNLOCKS: Unlock[] = [
  { key: 'tram', title: 'Трамвай', rep: UT.tram, need: m => m.maxCityPop >= 30000 || m.cong > 0.8, needText: 'город ≥ 30 тыс или пробки > 80%', line: 1 },
  { key: 'rail', title: 'Ж/Д и поезда', rep: UT.rail, need: m => m.cities >= 2 || m.subs >= 2, needText: '≥ 2 городов в регионе', line: 3, place: 2 },
  { key: 'port', title: 'Порт', rep: UT.port, need: m => m.water, needText: 'город у воды', place: 3 },
  { key: 'metro', title: 'Метро', rep: UT.metro, tech: 'ametro', need: m => m.maxCityPop >= 150000 || m.lines[1] >= 2, needText: 'город ≥ 150 тыс или 2+ трамвайные линии', line: 2 },
];

// ---------- P13. Советники ----------
export interface Advice { id: string; who: string; icon: string; lvl: 'bad' | 'warn' | 'good' | 'info'; text: string; panel?: string; sev: number }
export const ADVISORS = [{ id: 'transport', name: 'Советник по транспорту', icon: '🚦' }, { id: 'finance', name: 'Советник по финансам', icon: '💼' }, { id: 'economy', name: 'Советник по экономике', icon: '🏭' }, { id: 'urban', name: 'Главный архитектор', icon: '🏛' }];
export function advisorSays(id: string, m: Metrics): Advice | null {
  const A = ADVISORS.find(a => a.id === id)!; const mk = (lvl: Advice['lvl'], sev: number, text: string, panel?: string): Advice => ({ id, who: A.name, icon: A.icon, lvl, sev, text, panel });
  if (id === 'transport') { if (m.cong > ALERTS.congestionVC * 0.6) return mk(m.cong > 0.8 ? 'bad' : 'warn', m.cong, `Загрузка дорог ${Math.round(m.cong * 100)}%. Проложите параллельные улицы или запустите линию ОТ по самой красной магистрали.`, 'transport'); if (!sum(m.lines) && m.pop > 3000) return mk('info', 0.3, 'В городе нет общественного транспорта — запустите автобус (клавиша 8).'); }
  if (id === 'finance') { if (m.money < 0) return mk('bad', 1, 'Бюджет в минусе! Поднимите налоги, сократите убыточные линии или возьмите кредит.', 'eco'); const cm = m.expense > 0 ? m.money / (m.expense * 30) : 99; if (cm < 2 && m.expense > m.income) return mk('warn', 0.6, `Денег хватит на ${cm.toFixed(1)} мес. Расходы превышают доходы — проверьте линии и налоги.`, 'eco'); }
  if (id === 'economy') { if (m.short > ALERTS.goodsShortage) return mk('warn', m.short * 2, `Дефицит товаров ${Math.round(m.short * 100)}%: склады, промышленность, торговля с соседями.`, 'eco'); if (m.unemp > ALERTS.unemployment) return mk('warn', m.unemp * 3, `Безработица ${Math.round(m.unemp * 100)}%: зонируйте коммерцию и промышленность.`); }
  if (id === 'urban') { if (m.poll > 0.5) return mk('warn', m.poll, 'Загрязнение высокое: отодвиньте промзоны от жилья и разбейте парки.'); if (m.land < 0.5 && m.pop > 5000) return mk('info', 0.3, 'Земля дешевеет: добавьте парки и транспорт, чтобы районы росли выше.'); }
  return null;
}
/** P4: «почему не растёт» — вклады факторов CityState.paceF (04 §2–3) */
export function whyNotGrowing(f: { demand: number; tax: number; cong: number; short: number; land: number }) {
  const items = [
    { k: 'Спрос', v: Math.min(1, f.demand) - 1, tip: 'Зонируйте недостающие типы (Ж/К/П) — смотрите полосы спроса' },
    { k: 'Налоги', v: f.tax - 1, tip: 'Снизьте ставки налогов в «Экономике»' },
    { k: 'Пробки', v: f.cong - 1, tip: 'Расширьте магистраль или запустите линию ОТ' },
    { k: 'Дефицит товаров', v: f.short - 1, tip: 'Склады, промышленность и торговля с соседями' },
    { k: 'Стоимость земли', v: f.land - 1, tip: 'Парки и остановки рядом с жильём' },
  ];
  return items.sort((a, b) => a.v - b.v);
}
