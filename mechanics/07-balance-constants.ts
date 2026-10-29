/**
 * «Метрополис» — стартовые константы баланса.
 * Источник истины для формул из 03-economy.md, 04-growth.md, 05-transport.md, 06-metrics-ui.md.
 * Валюта: ₽ (игровые рубли). Расстояния: м. Скорости: м/с. Время: игровые минуты/дни, если не указано иное.
 * JSON-эквивалент: 07-balance-constants.json (генерируется из этого файла, ключи совпадают).
 * Индексы массивов дорог/линий совпадают с ROAD_TYPES (src/world/RoadNet.ts) и LINE_TYPES (src/sim/Transit.ts).
 */

export interface BalanceConstants {
  time: {
    /** игровых минут в одном тике симуляции */ tickGameMinutes: number;
    /** реальных мс на тик при скорости x1 */ tickRealMsAtX1: number;
    /** тиков в игровом дне (1440 мин) */ ticksPerDay: number;
    /** дней в игровом месяце */ daysPerMonth: number;
    /** месяцев в игровом годе */ monthsPerYear: number;
    /** множители скорости игры */ speeds: number[];
    /** период пересчёта экономики (тиков) */ economyEveryTicks: number;
    /** период пересчёта транспортного назначения (тиков) */ assignmentEveryTicks: number;
    /** период пересчёта роста (тиков) */ growthEveryTicks: number;
  };
  population: {
    /** жителей на один «уровень» жилого здания (bld level 1) */ residentsPerResLevel: number;
    /** рабочих мест на уровень коммерции */ jobsPerComLevel: number;
    /** рабочих мест на уровень промышленности */ jobsPerIndLevel: number;
    /** рабочих мест на уровень добычи */ jobsPerExtractLevel: number;
    /** рабочих мест на уровень склада */ jobsPerWarehouseLevel: number;
    /** доля трудоспособных */ workforceShare: number;
    /** естественная безработица (доля) */ naturalUnemployment: number;
    /** доли классов дохода [низкий, средний, высокий] */ incomeClassShares: [number, number, number];
    /** доход на работника в месяц, ₽ по классам */ wagePerMonth: [number, number, number];
  };
  needs: {
    /** потребление товаров на жителя в месяц, ед. по классам */ goodsPerResidentMonth: [number, number, number];
    /** структура потребления (доли, сумма 1) */ consumptionMix: Record<string, number>;
    /** доля дохода, расходуемая на жильё */ housingSpendShare: number;
    /** доля дохода на транспорт (бюджет поездок) */ transportSpendShare: number;
    /** стоимость времени, ₽/час по классам (VOT) */ valueOfTimePerHour: [number, number, number];
    /** веса удовлетворённости: жильё, работа, товары, транспорт, услуги, экология, налоги */
    happinessWeights: { housing: number; jobs: number; goods: number; transport: number; services: number; environment: number; taxes: number };
  };
  goods: {
    /** товары: id → базовая цена ₽/ед., вес т/ед., срок хранения дней (0 = бессрочно) */
    types: Record<string, { name: string; basePrice: number; tonsPerUnit: number; shelfDays: number; source: 'extract' | 'ind' }>;
    /** рецепты производства: выход ← входы, ед. на уровень здания в день */
    recipes: Record<string, { out: string; outPerLevelDay: number; inputs: Record<string, number> }>;
    /** добыча: ресурс (RES) → товар, ед. на уровень в день */
    extraction: Record<string, { good: string; perLevelDay: number }>;
    /** вместимость склада, ед. на уровень */ warehouseCapacityPerLevel: number;
    /** запас розницы в днях продаж (цель) */ retailTargetStockDays: number;
    /** вместимость грузовика, т */ truckTons: number;
    /** вместимость грузового вагона, т; вагонов в составе */ railWagonTons: number; railWagonsPerTrain: number;
  };
  prices: {
    /** эластичность цены по дефициту: P = Pbase*(D/S)^k */ elasticity: number;
    /** минимальный и максимальный множитель цены */ minMult: number; maxMult: number;
    /** сглаживание цены за пересчёт экономики (EMA alpha) */ smoothing: number;
    /** наценка розницы */ retailMarkup: number;
    /** экспортная цена = base*exportMult, импорт = base*importMult (внешний рынок) */ exportMult: number; importMult: number;
  };
  budget: {
    /** стартовые деньги по размерам карты (SIZES), ₽ */ startMoney: number[];
    /** налоговые ставки по умолчанию (доли) */ defaultTax: { res: number; com: number; ind: number };
    /** диапазон ставок */ taxMin: number; taxMax: number;
    /** «нейтральная» ставка — выше неё падает привлекательность */ taxNeutral: number;
    /** налог на имущество, доля стоимости земли в год */ propertyTaxYear: number;
    /** доля зарплат, составляющая налоговую базу жилого налога (местная часть) */ resTaxBaseShare: number;
    /** доля прибыли бизнеса, облагаемая ставкой com/ind */ profitShare: number;
    /** услуги: стоимость содержания ₽/мес на 1000 жителей */ servicesUpkeepPer1000: number;
    /** содержание дорог: множитель к ROAD_TYPES[].upkeep (₽/м/мес) */ roadUpkeepMult: number;
  };
  loans: {
    /** варианты кредитов: сумма ₽, годовая ставка, срок мес */
    offers: { amount: number; annualRate: number; months: number }[];
    /** предел долга в месяцах дохода (кредитный рейтинг) */ maxDebtToMonthlyIncome: number;
    /** штраф к ставке за каждый месяц с отриц. балансом (п.п./мес) */ overdraftRatePenalty: number;
    /** месяцев в минусе до банкротства-предупреждения */ bankruptcyWarnMonths: number;
  };
  trade: {
    /** базовая стоимость перевозки ₽/т/км по режимам */ costPerTonKm: { truck: number; rail: number; ship: number };
    /** пошлина межгородской торговли (доля) */ interCityTariff: number;
    /** порог прибыли для заключения сделки (доля от цены) */ minMargin: number;
  };
  growth: {
    /** базовый суточный темп роста спроса (доля) */ baseDailyRate: number;
    /** веса факторов спроса жилья */ resWeights: { jobs: number; housingVacancy: number; goods: number; access: number; congestion: number; tax: number; attractiveness: number };
    /** веса факторов спроса коммерции */ comWeights: { customers: number; goods: number; access: number; tax: number; workers: number };
    /** веса факторов спроса промышленности */ indWeights: { workers: number; freightAccess: number; inputs: number; exportPrice: number; tax: number };
    /** EMA сглаживание спроса (alpha в день) */ demandSmoothing: number;
    /** мёртвая зона: |demand|<deadband — без изменений */ deadband: number;
    /** максимум повышений уровня зданий за день на ячейку агрегации (на 1000 жит.) */ maxUpgradesPer1000: number;
    /** демпфер для больших городов: rate *= (P0/(P0+P))^gamma ... см. 04 */ sizeDampP0: number; sizeDampGamma: number;
    /** доля сноса при сильном отрицательном спросе в день */ decayDailyMax: number;
    /** размер ячейки агрегации роста, м */ cellSize: number;
    /** гистерезис: дней подряд нужного знака до апгрейда/даунгрейда */ hysteresisDays: number;
  };
  transport: {
    /** режимы: скорость м/с (для авто — свободная по дороге), фикс. стоимость поездки ₽, ₽/км, константа полезности (мин) */
    modes: Record<'walk' | 'bike' | 'car' | 'bus' | 'tram' | 'metro' | 'rail', { speed: number; fixedCost: number; costPerKm: number; asc: number; maxKm: number }>;
    /** параметр логита (1/мин обобщённой стоимости) */ logitTheta: number;
    /** вес времени ожидания и пешего доступа относительно времени в пути */ waitWeight: number; walkWeight: number; transferPenaltyMin: number;
    /** BPR: t = t0*(1+alpha*(V/C)^beta) */ bprAlpha: number; bprBeta: number;
    /** пропускная способность полосы, авт/час по ROAD_TYPES */ laneCapacityPerHour: number[];
    /** доля суточных поездок в пиковый час */ peakHourShare: number;
    /** поездок на жителя в день */ tripsPerResidentDay: number;
    /** доли целей поездок: работа, магазины, досуг */ tripPurposeShares: { work: number; shop: number; leisure: number };
    /** заполнение авто, чел/авт */ carOccupancy: number;
    /** итераций MSA назначения за пересчёт */ msaIterations: number;
    /** LOD: макс. видимых агентов-машин; 1 агент = N поездок */ maxVisibleCars: number; tripsPerAgentMin: number;
    /** ОТ: тариф по умолчанию ₽, мин/макс интервал (мин), коэффициент комфорта при загрузке >1 */
    defaultFare: number[]; headwayMinMin: number; headwayMaxMin: number; crowdingPenaltyPerLoad: number;
    /** парковка в центре, ₽ за поездку (по плотности) */ parkingCostMax: number;
  };
  reputation: {
    /** стартовая репутация 0..100 */ start: number;
    /** изменение в месяц = sum(k_i*(x_i-0.5))*scale */ monthlyScale: number;
    /** пороги репутации для разблокировок */ unlockThresholds: Record<string, number>;
  };
  expansion: {
    /** размер подрегиона (квадрат), м */ subregionSize: number;
    /** базовая цена выкупа свободного подрегиона, ₽ */ baseLandPrice: number;
    /** надбавка за ресурс в подрегионе, ₽ за тайл ресурса */ resourceTilePrice: number;
    /** множитель цены за каждый уже открытый подрегион игрока (n-й участок дороже) */ ownedCountMult: number;
    /** минимальное население игрока для открытия следующего участка = base*growth^n */ popGateBase: number; popGateGrowth: number;
    /** длительность тендера, дней; минимальный шаг ставки (доля) */ tenderDays: number; minBidStep: number;
    /** вес в оценке тендера: цена, план развития, репутация, соседство */ tenderWeights: { price: number; plan: number; reputation: number; adjacency: number };
    /** право первого выкупа: дней эксклюзива у соседа с наибольшей длиной общей границы */ firstRefusalDays: number;
    /** общий ресурс на границе: доля добычи по длине общей границы; штраф за перебор квоты */ sharedResourceQuotaPenalty: number;
    /** ИИ-соседи: доля дохода, откладываемая на выкуп; дней между решениями */ aiSaveShare: number; aiDecisionDays: number;
    /** бонус к спросу от свободного соседнего участка у границы (D_R/D_I) */ frontierDemandBonus: number;
    /** доля расходов на общую дорогу/ж/д, платимая каждой стороной */ sharedInfraCostShare: number;
  };
  routes: {
    /** срок действия согласования по умолчанию / мин / макс, игровых месяцев */ defaultTermMonths: number; minTermMonths: number; maxTermMonths: number;
    /** плата за проезд по умолчанию: ₽ за ТС-км на чужой территории (пасс.) и ₽ за т-км (груз) */ defaultTollPerVehKm: number; defaultTollPerTonKm: number;
    /** доля выручки по умолчанию, уходящая транзитным владельцам (сверх пропорции пробега) */ defaultRevenueShare: number;
    /** период уведомления при отзыве согласия, дней; штраф = доля годового дохода маршрута на территории */ withdrawNoticeDays: number; withdrawPenaltyShare: number;
    /** таймаут ответа на заявку: онлайн-игрок / офлайн-игрок / ИИ, игровых дней */ responseTimeoutDays: number; offlineTimeoutDays: number; aiResponseDays: number;
    /** таймаут офлайн в реальных часах, после которого решение принимает ИИ-заместитель по профилю */ offlineProxyRealHours: number;
    /** максимум встречных предложений на заявку */ maxCounterOffers: number;
    /** срок рассмотрения спора, дней; что происходит с маршрутом во время спора */ disputeDays: number;
    /** амортизация ТС и путей, лет (линейно) */ vehicleLifeYears: number; trackLifeYears: number;
    /** скоринг ИИ: веса выгоды, риска, отношений, стратегии и порог согласия; зона встречного предложения */
    aiScoring: { benefit: number; risk: number; relation: number; strategic: number; acceptThreshold: number; counterBand: number };
    /** профили поведения ИИ: сдвиг порога и множитель запрашиваемой платы */
    aiProfiles: Record<'cooperative' | 'mercantile' | 'cautious' | 'protectionist', { thresholdShift: number; tollMult: number }>;
    /** изменение отношений: согласие, отказ, отзыв, спор */ relationOnApprove: number; relationOnWithdraw: number; relationOnDispute: number;
  };
  engagement: {
    /** макс. всплывающих чисел на экране; TTL, с */ floatTextMaxOnScreen: number; floatTextTtlSec: number;
    /** кулдаун одного типа оповещения, дней; макс. несрочных записей ленты в день */ alertCooldownDays: number; feedMaxPerDay: number;
    /** автопауза на критичных событиях */ autoPauseOnCritical: boolean;
    /** награды онбординга, ₽ (для размера city, масштабируются startMoney[size]/startMoney[2], мин. 0.1) */ onboardingGoalRewards: number[]; onboardingRewardMinScale: number;
    /** макс. активных поручений */ maxActiveQuests: number;
    /** события: шанс в день, мин. интервал, дней на решение */ eventDailyChance: number; eventMinGapDays: number; eventDecisionDays: number;
    /** контракты: премия к цене, штраф за срыв (доля), изменение отношений */ contractPremium: number; contractPenaltyShare: number; contractRelationOk: number; contractRelationFail: number;
    /** исследования: rp за 1 млн ₽ дохода в месяц и за 100 тыс жителей */ rpPerMillionIncome: number; rpPer100kPop: number;
    /** кулдаун совета одного советника, дней; откладывание по «Не сейчас» */ advisorCooldownDays: number; advisorSnoozeDays: number;
    /** динамическая сложность: пороги стресса и границы множителя */ stressHigh: number; stressLow: number; dynMinMult: number; dynMaxMult: number;
    /** режимы сложности: множитель денег, частоты событий; банкротство (мес, 0 = выкл) */
    difficulty: Record<'relaxed' | 'normal' | 'hard', { moneyMult: number; eventMult: number; bankruptcyMonths: number; aiThresholdShift: number }>;
    /** длина сезона мультиплеера, реальных дней */ seasonLengthDays: number;
  };
  alerts: {
    /** порог V/C «пробка» */ congestionVC: number;
    /** порог дефицита товаров (доля неудовлетворённого спроса) */ goodsShortage: number;
    /** безработица-тревога */ unemployment: number;
    /** загрузка ОТ-тревога */ transitOverload: number;
    /** месяцев запаса денег для предупреждения */ cashMonthsWarn: number;
  };
}

export const BALANCE: BalanceConstants = {
  time: {
    tickGameMinutes: 1,
    tickRealMsAtX1: 200, // 1 игровой день = 1440*0.2 с = 4.8 мин реального времени при x1
    ticksPerDay: 1440,
    daysPerMonth: 30,
    monthsPerYear: 12,
    speeds: [0, 1, 3, 10],
    economyEveryTicks: 60, // раз в игровой час
    assignmentEveryTicks: 360, // 4 раза в день (утро/день/вечер/ночь)
    growthEveryTicks: 1440, // раз в день
  },
  population: {
    residentsPerResLevel: 40,
    jobsPerComLevel: 25,
    jobsPerIndLevel: 35,
    jobsPerExtractLevel: 15,
    jobsPerWarehouseLevel: 10,
    workforceShare: 0.55,
    naturalUnemployment: 0.04,
    incomeClassShares: [0.4, 0.45, 0.15],
    wagePerMonth: [30000, 60000, 140000],
  },
  needs: {
    goodsPerResidentMonth: [0.15, 0.22, 0.35],
    consumptionMix: { food: 0.45, consumer: 0.25, furniture: 0.1, fuel: 0.2 },
    housingSpendShare: 0.3,
    transportSpendShare: 0.12,
    valueOfTimePerHour: [150, 350, 900],
    happinessWeights: { housing: 0.18, jobs: 0.2, goods: 0.14, transport: 0.18, services: 0.12, environment: 0.08, taxes: 0.1 },
  },
  goods: {
    types: {
      wood: { name: 'Древесина', basePrice: 400, tonsPerUnit: 1, shelfDays: 0, source: 'extract' },
      ore: { name: 'Руда', basePrice: 500, tonsPerUnit: 1, shelfDays: 0, source: 'extract' },
      grain: { name: 'Зерно', basePrice: 300, tonsPerUnit: 1, shelfDays: 120, source: 'extract' },
      oil: { name: 'Нефть', basePrice: 700, tonsPerUnit: 1, shelfDays: 0, source: 'extract' },
      food: { name: 'Продукты', basePrice: 900, tonsPerUnit: 0.5, shelfDays: 20, source: 'ind' },
      metal: { name: 'Металл', basePrice: 1500, tonsPerUnit: 1, shelfDays: 0, source: 'ind' },
      fuel: { name: 'Топливо', basePrice: 1600, tonsPerUnit: 1, shelfDays: 0, source: 'ind' },
      furniture: { name: 'Мебель', basePrice: 1800, tonsPerUnit: 0.6, shelfDays: 0, source: 'ind' },
      consumer: { name: 'Потребтовары', basePrice: 2500, tonsPerUnit: 0.3, shelfDays: 0, source: 'ind' },
    },
    recipes: {
      food: { out: 'food', outPerLevelDay: 2, inputs: { grain: 3 } },
      metal: { out: 'metal', outPerLevelDay: 1, inputs: { ore: 2 } },
      fuel: { out: 'fuel', outPerLevelDay: 1, inputs: { oil: 1.5 } },
      furniture: { out: 'furniture', outPerLevelDay: 1, inputs: { wood: 2 } },
      consumer: { out: 'consumer', outPerLevelDay: 1, inputs: { metal: 0.5, fuel: 0.3 } },
    },
    extraction: {
      FOREST: { good: 'wood', perLevelDay: 3 },
      ORE: { good: 'ore', perLevelDay: 2.5 },
      FERTILE: { good: 'grain', perLevelDay: 4 },
      OIL: { good: 'oil', perLevelDay: 2 },
    },
    warehouseCapacityPerLevel: 400,
    retailTargetStockDays: 5,
    truckTons: 12,
    railWagonTons: 60,
    railWagonsPerTrain: 20,
  },
  prices: {
    elasticity: 0.6,
    minMult: 0.4,
    maxMult: 3.0,
    smoothing: 0.1,
    retailMarkup: 0.35,
    exportMult: 0.85,
    importMult: 1.3,
  },
  budget: {
    startMoney: [300000, 1500000, 8000000, 40000000, 150000000],
    defaultTax: { res: 0.1, com: 0.12, ind: 0.12 },
    taxMin: 0,
    taxMax: 0.3,
    taxNeutral: 0.1,
    propertyTaxYear: 0.01,
    resTaxBaseShare: 0.02,
    profitShare: 0.25,
    servicesUpkeepPer1000: 40000,
    roadUpkeepMult: 10, // РЕШЕНИЕ: ROAD_TYPES[].upkeep в коде = ₽/м/мес, не меняем; множитель 10 живёт здесь
  },
  loans: {
    offers: [
      { amount: 500000, annualRate: 0.06, months: 24 },
      { amount: 5000000, annualRate: 0.08, months: 60 },
      { amount: 50000000, annualRate: 0.1, months: 120 },
    ],
    maxDebtToMonthlyIncome: 24,
    overdraftRatePenalty: 0.005,
    bankruptcyWarnMonths: 3,
  },
  trade: {
    costPerTonKm: { truck: 6, rail: 2, ship: 1 },
    interCityTariff: 0.03,
    minMargin: 0.05,
  },
  growth: {
    baseDailyRate: 0.004,
    resWeights: { jobs: 0.3, housingVacancy: 0.15, goods: 0.1, access: 0.15, congestion: 0.1, tax: 0.1, attractiveness: 0.1 },
    comWeights: { customers: 0.4, goods: 0.2, access: 0.2, tax: 0.1, workers: 0.1 },
    indWeights: { workers: 0.3, freightAccess: 0.25, inputs: 0.2, exportPrice: 0.15, tax: 0.1 },
    demandSmoothing: 0.15,
    deadband: 0.05,
    maxUpgradesPer1000: 2,
    sizeDampP0: 2000000,
    sizeDampGamma: 0.3,
    decayDailyMax: 0.002,
    cellSize: 256,
    hysteresisDays: 3,
  },
  transport: {
    modes: {
      walk: { speed: 1.3, fixedCost: 0, costPerKm: 0, asc: 0, maxKm: 2.5 },
      bike: { speed: 4.5, fixedCost: 0, costPerKm: 0, asc: 6, maxKm: 8 },
      car: { speed: 13, fixedCost: 30, costPerKm: 12, asc: 0, maxKm: 999 },
      bus: { speed: 9, fixedCost: 0, costPerKm: 0, asc: 4, maxKm: 40 },
      tram: { speed: 11, fixedCost: 0, costPerKm: 0, asc: 2, maxKm: 40 },
      metro: { speed: 20, fixedCost: 0, costPerKm: 0, asc: -2, maxKm: 80 },
      rail: { speed: 30, fixedCost: 0, costPerKm: 2, asc: 0, maxKm: 400 },
    },
    logitTheta: 0.12,
    waitWeight: 2,
    walkWeight: 1.8,
    transferPenaltyMin: 5,
    bprAlpha: 0.15,
    bprBeta: 4,
    laneCapacityPerHour: [700, 1600, 2000, 400], // Улица, Проспект, Шоссе, Переулок
    peakHourShare: 0.1,
    tripsPerResidentDay: 2.4,
    tripPurposeShares: { work: 0.45, shop: 0.3, leisure: 0.25 },
    carOccupancy: 1.3,
    msaIterations: 4,
    maxVisibleCars: 4000,
    tripsPerAgentMin: 1,
    defaultFare: [40, 45, 55, 120], // по LINE_TYPES: Автобус, Трамвай, Метро, Поезд
    headwayMinMin: 2,
    headwayMaxMin: 30,
    crowdingPenaltyPerLoad: 0.5,
    parkingCostMax: 200,
  },
  reputation: {
    start: 50,
    monthlyScale: 4,
    unlockThresholds: { tram: 40, metro: 55, rail: 50, port: 45, loanLarge: 60, landmark: 70, cityPartnership: 65 },
  },
  expansion: {
    subregionSize: 4096,
    baseLandPrice: 2000000,
    resourceTilePrice: 150,
    ownedCountMult: 1.35,
    popGateBase: 20000,
    popGateGrowth: 1.5,
    tenderDays: 30,
    minBidStep: 0.05,
    tenderWeights: { price: 0.5, plan: 0.2, reputation: 0.2, adjacency: 0.1 },
    firstRefusalDays: 15,
    sharedResourceQuotaPenalty: 0.5,
    aiSaveShare: 0.15,
    aiDecisionDays: 30,
    frontierDemandBonus: 0.05,
    sharedInfraCostShare: 0.5,
  },
  routes: {
    defaultTermMonths: 24,
    minTermMonths: 6,
    maxTermMonths: 120,
    defaultTollPerVehKm: 15,
    defaultTollPerTonKm: 0.5,
    defaultRevenueShare: 0.05,
    withdrawNoticeDays: 60,
    withdrawPenaltyShare: 0.25,
    responseTimeoutDays: 15,
    offlineTimeoutDays: 30,
    aiResponseDays: 3,
    offlineProxyRealHours: 48,
    maxCounterOffers: 3,
    disputeDays: 30,
    vehicleLifeYears: 15,
    trackLifeYears: 40,
    aiScoring: { benefit: 0.45, risk: 0.2, relation: 0.2, strategic: 0.15, acceptThreshold: 0.55, counterBand: 0.15 },
    aiProfiles: {
      cooperative: { thresholdShift: -0.1, tollMult: 0.8 },
      mercantile: { thresholdShift: 0, tollMult: 1.3 },
      cautious: { thresholdShift: 0.1, tollMult: 1 },
      protectionist: { thresholdShift: 0.2, tollMult: 1.5 },
    },
    relationOnApprove: 3,
    relationOnWithdraw: -15,
    relationOnDispute: -5,
  },
  engagement: {
    floatTextMaxOnScreen: 24,
    floatTextTtlSec: 1.5,
    alertCooldownDays: 3,
    feedMaxPerDay: 8,
    autoPauseOnCritical: true,
    onboardingGoalRewards: [50000, 50000, 100000, 100000, 200000],
    onboardingRewardMinScale: 0.1,
    maxActiveQuests: 3,
    eventDailyChance: 0.08,
    eventMinGapDays: 10,
    eventDecisionDays: 3,
    contractPremium: 1.25,
    contractPenaltyShare: 0.2,
    contractRelationOk: 3,
    contractRelationFail: -5,
    rpPerMillionIncome: 1,
    rpPer100kPop: 2,
    advisorCooldownDays: 5,
    advisorSnoozeDays: 30,
    stressHigh: 0.7,
    stressLow: 0.25,
    dynMinMult: 0.5,
    dynMaxMult: 1.5,
    difficulty: {
      relaxed: { moneyMult: 2, eventMult: 0.5, bankruptcyMonths: 0, aiThresholdShift: -0.15 },
      normal: { moneyMult: 1, eventMult: 1, bankruptcyMonths: 3, aiThresholdShift: 0 },
      hard: { moneyMult: 0.6, eventMult: 1.5, bankruptcyMonths: 2, aiThresholdShift: 0.1 },
    },
    seasonLengthDays: 28,
  },
  alerts: {
    congestionVC: 0.9,
    goodsShortage: 0.15,
    unemployment: 0.1,
    transitOverload: 1.1,
    cashMonthsWarn: 2,
  },
};

export default BALANCE;
