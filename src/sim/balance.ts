/**
 * «Метрополис» — стартовые константы баланса.
 * Источник истины для формул из 03-economy.md, 04-growth.md, 05-transport.md, 06-metrics-ui.md.
 * Валюта: ₽ (игровые рубли). Расстояния: м. Скорости: м/с. Время: игровые минуты/дни, если не указано иное.
 * JSON-эквивалент: 07-balance-constants.json (генерируется из этого файла, ключи совпадают).
 * Индексы массивов дорог/линий совпадают с ROAD_TYPES (src/world/RoadNet.ts) и LINE_TYPES (src/sim/Transit.ts).
 */

export interface RoadSystemConsts {
  /** классы дорог: скорость м/с, полос/направление (мин/макс), база ₽/м, содержание ₽/м/мес (до roadUpkeepMult), ёмкость полосы авт/ч, мин. радиус м, макс. уклон доля, просвет м, мин. покрытие тоннеля м, шум L0 дБ, загрязнение отн. */
  classes: Record<'highway' | 'ramp' | 'street' | 'lane', { speed: number; minLanes: number; maxLanes: number; baseCostPerM: number; upkeepPerM: number; laneCapacityPerHour: number; minRadius: number; maxGrade: number; clearance: number; tunnelMinCover: number; noiseL0: number; pollutionPerVehKm: number; frontage: boolean }>;
  /** модули полос: ширина м, цена ₽/м, содержание ₽/м/мес, множитель ёмкости соседних авто-полос */
  modules: Record<string, { width: number; costPerM: number; upkeepPerM: number; capacityMult: number }>;
  /** макс. полос car/bus в одну сторону */ maxLanesPerDir: number;
  /** съезды: мин. длина ramp, мин. шаг между съездами, м */ rampMinLen: number; rampMinSpacing: number;
  /** уровни: множители стройки и содержания */ embankmentPerM: number; bridgeBase: number; bridgePerM: number; tunnelBase: number; tunnelPerM: number; bridgeUpkeepMult: number; tunnelUpkeepMult: number;
  /** шаг опор моста по суше/воде, м */ pierSpacing: number; pierSpacingWater: number;
  /** кривые: длина сегмента мин/макс м, ошибка хорды м, допуск радиуса ниже минимума (доля) */ segMinLen: number; segMaxLen: number; chordError: number; minRadiusSoftShare: number;
  /** апгрейд: доля возврата цены старого профиля; снос — доля цены */ upgradeRefund: number; demolishShare: number;
  /** светофор: цикл с; порог потока для автоматического светофора, авт/ч */ signalCycleSec: number; autoSignalFlow: number;
  /** шум: порог у фасада дБ и штраф к стоимости земли */ noiseThresholdDb: number; noiseLandValuePenalty: number;
}

export interface CongestionConsts {
  /** QA2 п.3: замедление движения от физической плотности агентов на полосе: v = vmax·max(moveMinFrac, 1 − moveLoadK·плотн²) */ /** QA3: у каждого ряда своя голова у стоп-линии */ multiHead: boolean; moveLoadK: number; moveMinFrac: number; /** IDM: ускорение м/с², интервал с, мин. зазор м, 2√(ab) */ /** QA2 п.3: голова очереди, ждущая въезда дольше squeezeSec, протискивается в занятую полосу (разрыв клинча перекрёстка) */ squeezeSec: number; /** доля лимита агентов, на которую считается scale */ agentFill: number; idm: { a: number; T: number; s0: number; ab: number };
  /** пороги уровней V/C: dense, jam, gridlock */ levelVC: { dense: number; jam: number; gridlock: number };
  /** цвета оверлея по уровням (hex) */ levelColors: { free: string; dense: string; jam: string; gridlock: string };
  /** приоритетный узел: критический интервал и интервал следования, с */ gapCriticalSec: number; gapFollowSec: number;
  /** период анализа перегрузочной части HCM, ч */ analysisPeriodH: number;
  /** насыщение светофора, авт/ч на полосу; потерянное время на фазу, с */ saturationFlowPerLane: number; lostTimePerPhaseSec: number;
  /** кольцо: c = a − b·V_circ, мин. ёмкость */ roundaboutA: number; roundaboutB: number; roundaboutMinCap: number;
  /** stopAll: доп. задержка, с */ stopAllExtraSec: number;
  /** слияние: доля потока ramp, съедающая ёмкость шоссе; сужение — коэф. */ mergeFactor: number; taperFactor: number;
  /** штраф левого поворота, с на 1000 авт/ч встречного */ leftTurnPenaltySec: number;
  /** предел задержки узла, с */ maxNodeDelaySec: number;
  /** объезды: доля осведомлённых, относительный и абсолютный порог выигрыша */ awareShare: number; rerouteThreshold: number; rerouteMinGainMin: number;
  /** гистерезис: макс. доля возврата; EMA стоимости */ hysteresisShare: number; costSmoothing: number;
  /** микро: период перестройки агента, тиков; ожидание до перестройки, мин; радиус, м */ agentRerouteTicks: number; agentRerouteWaitMin: number; agentRerouteRadius: number;
  /** этап F, микро-агенты (время микро сжато: застрявший убирается через 120 с): период пересчёта сглаженной стоимости полос, с; ожидание до объезда, с; мин. выигрыш, с; лимит раскрытий A* при объезде */ costUpdateSec: number; agentRerouteWaitSec: number; agentRerouteMinGainSec: number; agentRerouteMaxExp: number;
  /** очереди: шаг авто в очереди, м; мин. остаточная ёмкость при переливе; макс. рёбер перелива */ vehSpacing: number; spillMinCap: number; spillMaxHops: number;
  /** аварии: на млн авт-км; длительность мин (база, разброс); ёмкость при аварии */ accidentRatePerMVehKm: number; accidentDurationMin: number; accidentDurationSpreadMin: number; incidentCapacity: number;
  /** «грязные» рёбра: порог изменения потока; глубина соседей */ dirtyThreshold: number; dirtyHops: number;
  /** мин. x подхода для пересчёта задержки узла */ nodeRecalcMinVC: number;
}

export interface NetGenConsts { /** QA3 №6: порог соединения тупика с дорогой, м */ deadEndCloseM: number;
  deadEndJoin: number; regMinNodeM: number; regAcuteDeg: number; regParM: number; regDeadNearM: number; regAvMinM: number; regStubM: number; regPasses: number; avenueMinLen: number; specW: number[]; villageMaxR: number; culDeSacMinGap?: number; ringMinR: number; tangleDeg: number; feederLen: number; hwCellPenalty: number;
  /** мин. расстояние между параллельными дорогами, м */ parallelMin: { lane: number; street: number; avenue: number; highway: number };
  /** мин. шаг перекрёстков вдоль дороги, м */ junctionSpacing: { lane: number; street: number; avenue: number };
  /** мин. угол в узле, град */ minAngleDeg: { lane: number; street: number; avenue: number; highway: number };
  /** санитарный разрыв жилья от шоссе, м (с экраном) */ highwayResSetback: number; highwayResSetbackWithWall: number;
  /** плотность: квартал мин/макс, м; показатель степени */ blockMin: number; blockMax: number; blockExp: number;
  /** шаг проспектов, м; макс. расстояние до проспекта по сети, м */ arterialSpacing: number; arterialMaxReach: number;
  /** связность: макс. длина починки, м; мин. рёбер острова; макс. проходов; макс. тупик в центре, м */ repairMaxLen: number; minIslandEdges: number; repairMaxPasses: number; deadEndMax: number;
  /** доступ: расстояние до фронтального ребра, м; грузовой — макс. уклон */ accessDist: number; freightMaxGrade: number;
  /** участки: глубина в тайлах, доля maxL, множитель спроса C */ lots: Record<'lane' | 'street' | 'avenue' | 'pedestrian', { depthTiles: number; maxLevelShare: number; comDemandMult: number }>;
  /** потеря уровня зданием без доступа: дней на уровень */ noAccessDecayDays: number;
  /** генерация шоссе (запрос Степана): сглаживание rMin по классу (road-curves), мин. шаг наземных развязок, м; запас рампы у эстакады, м;
   *  лимит пересечений одной пары «шоссе × улица» (проверка в tests/netgen); штраф клетки A* за существующую дорогу */
  highway: { junctionStep: number; rampMargin: number; maxCrossPerPair: number; roadCellPenalty: number; segLen: number; /** A11: простая развязка «полуромб» — шоссе эстакадой над проспектом, 2 съезда-улицы на проспект в diamondOff м от пересечения; false — наземный узел */ diamond: boolean; diamondOff: number };
  /** пояса роста: границы d/r (центр, средний, пригород, окрестности) */ beltBounds: [number, number, number, number];
  /** вероятность «хаотичного» примыкания в иерархии */ hierarchyNoise: number;
  /** мин. длина цепочки одного класса, м */ minChainLen: { highway: number; avenue: number; street: number; lane: number };
  /** шоссе: допустимый крюк, допуск угла пересечения (от 90°), мин. разнос коридоров, шаг развязок в городе, мин. расстояние до повторного слияния ветвей, м */ highwayDetourMax: number; highwayCrossAngleTol: number; highwayCorridorMin: number; interchangeSpacing: number; highwayRejoinMin: number;
  /** мин. зазор между краями проезжих частей параллельных дорог, м */ minEdgeGap: number;
  /** сплетения: макс. пересечений пары дорог на 500 м; мин. периметр петли в кварталах; макс. степень узла */ maxCrossingsPerPair: number; minLoopPerimeterBlocks: number; maxNodeDegree: number;
  /** кольца: мин. население для 1-го, 2-го кольца и обхода-шоссе */ ringMinPop: number; secondRingPop: number; bypassPop: number;
  /** тупики: множитель ширины соседней дороги, минимум м, макс. продление м, угол продления °, допустимый карман м */ deadEndSnapWidthMult: number; deadEndSnapMin: number; deadEndExtendMax: number; deadEndExtendAngle: number; culDeSacMax: number;
  /** стыки: длина перехода на метр разницы ширины, мин. длина, макс. излом без дуги ° */ taperLenPerM: number; taperMinLen: number; maxBendDeg: number;
  /** против заторов: макс. V/C после генерации, раундов исправления */ genMaxVC: number; genFixRounds: number;
  /** зона перекрёстка: ширина зебры и запас, м; шаг разворотных кругов, м; макс. население посёлка без проспектов */ crosswalkWidth: number; junctionZonePad: number; culDeSacSpacing: number; villageMaxPop: number;
}
export interface ZoningBalance {
  /** глубина лота по классу дороги, м */ depth: { lane: number; street: number; avenue: number; pedestrian: number };
  /** ширина лота min/max по классу, м */ lotWidth: { lane: [number, number]; street: [number, number]; avenue: [number, number] };
  /** отступ от красной линии, м */ setback: { lane: number; street: number; avenue: number };
  /** доля maxL по классу дороги */ levelShare: { lane: number; street: number; avenue: number };
  /** мин. площадь блока м², мин. глубина лота м, мин. ширина двора м, разброс ширины лота */ minBlockArea: number; minLotDepth: number; courtyardMin: number; lotWidthJitter: number;
  /** доля площади тайла внутри лота для присвоения зоны */ tileCoverShare: number;
  /** пороги площади двора: green / driveway / mixed, м² */ courtyardAreaBounds: [number, number, number];
  /** мест на 100 м² парковки; занятость днём/ночью; мест на квартиру R */ spotsPer100m2: number; parkingOccupancy: [number, number]; spotsPerFlat: number;
  /** эффект двора-парка на счастье и радиус, м */ courtyardParkEffect: number; courtyardParkRadius: number;
  /** мин. расстояние въезда во двор от перекрёстка, м */ drivewayFromJunction: number;
  /** вероятность наследования темы кварталом */ themeKeepProb: number;
}
export interface TrafficControlBalance {
  /** свои: цикл в симуляции, с; угол Y-развилки, °; зазор приоритета, м */ simCycle: number; adaptive: { on: boolean; minG: number; maxG: number; ratio: number; allRed: number; senseM: number }; yForkDeg: [number, number]; priorityGapM: number; /** QA2 п.3: светофор по вызову — радиус обнаружения на поперечном подходе, м */ actuatedM: number; /** QA2 п.3: через сколько с ожидания второстепенную пропускают, с */ courtesySec: number;
  /** ёмкость подхода на полосу, авт/ч: uncontrolled, allWayStop */ uncontrolledCap: number; allWayStopCap: number;
  /** зазоры для второстепенного подхода (HCM), с */ criticalGap: number; followUpTime: number;
  /** насыщение светофора, авт/ч зелёного; цикл мин/по умолч./макс, с; мин. зелёный с; потерянное время на фазу с */ saturationFlow: number; cycleMin: number; cycleDefault: number; cycleMax: number; minGreen: number; lostTimePerPhase: number;
  /** порог отдельной левой фазы, авт/ч; интервал адаптации, мин; ночной режим часы [с, до] */ leftPhaseThreshold: number; adaptiveIntervalMin: number; nightBlinkHours: [number, number];
  /** снижение задержки зелёной волной */ greenWaveDelayCut: number;
  /** кольцо: [база, коэфф. от потока по кольцу] для 1 и 2 полос */ roundabout1: [number, number]; roundabout2: [number, number];
  /** стоимость, ₽: priority, stop, signal, roundabout1, roundabout2 */ cost: { priority: number; stop: number; signal: number; roundabout1: number; roundabout2: number };
  /** содержание, ₽/мес */ upkeep: { priority: number; stop: number; signal: number; roundabout1: number; roundabout2: number };
  /** ёмкость полосы перегона по классу, авт/ч */ laneCap: { lane: number; street: number; avenue: number; highway: number; ramp: number };
  /** макс. полос/сторону по классу */ maxLanes: { lane: number; street: number; avenue: number; highway: number; ramp: number };
  /** множители: одностороннее, запрет левого, автобусная остановка в полосе */ oneWayCapBonus: number; noLeftCapBonus: number; busStopInLanePenalty: number;
  /** развязки: стоимость ₽, содержание ₽/мес, ёмкость съезда авт/ч */ interchange: {
    diamond: [number, number, number]; parclo: [number, number, number]; cloverleaf: [number, number, number];
    turbine: [number, number, number]; trumpet: [number, number, number]; split: [number, number, number];
  };
  /** порог потока для выбора клевера vs турбины, авт/ч */ cloverMaxFlow: number;
  /** разгон/торможение, м; штраф переплетения; длина зоны переплетения, м */ accelLen: number; decelLen: number; weavingPenalty: number; weavingLen: number;
  /** длина кармана слияния, м; отступ конца полосы ОТ от слияния, м */ mergeTaperLen: number; busLaneEndBeforeMerge: number;
}
export interface ConstructionBalance {
  /** стоимость единицы этажа по уровню здания, ₽/м² */ levelValue: [number, number, number, number, number, number];
  /** множитель компенсации по зоне */ compensationMult: { R: number; C: number; I: number; O: number };
  /** переезд: ₽ на жителя / на рабочее место */ moveOutPerResident: number; moveOutPerJob: number;
  /** счастье за снесённое R-здание и длительность, дней */ happinessPerDemolished: number; demolishMoodDays: number;
  /** доля выселенных, остающихся в городе */ evicteeStayShare: number;
  /** снос дерева ₽, коридор подсветки + м */ treeCost: number; corridorPad: number;
  /** уровни: шаг м, диапазон [min,max] по типу */ levelStep: number;
  /** B3: наибольшая насыпь/выемка при подгонке рельефа под дорогу, м */ gradeMaxDh: number;
  levelRange: { road: [number, number]; rail: [number, number]; metro: [number, number]; tram: [number, number] };
  /** макс. уклон по типу */ maxGrade: { highway: number; avenue: number; street: number; lane: number; rail: number; metro: number; tram: number };
  /** высоты: земля ≤, насыпь ≤, выемка ≥, м */ groundTol: number; embankmentMaxH: number; cutMaxDepth: number;
  /** эстакада: база + за метр высоты; тоннель открытый/глубокий; портал ₽; глубина открытого способа, м */ elevatedMult: [number, number]; tunnelMult: [number, number]; tunnelPortalCost: number; cutCoverMaxDepth: number;
  /** вертикальный зазор дорога / рельс, м */ clearance: { road: number; rail: number };
  /** рельеф: шаг сетки м, откос 1:n, цены ₽/м³ (насыпь, выемка, вывоз), радиус баланса м, множ. скалы, множ. под водой */ heightStep: number; slopeRatio: number; fillCostPerM3: number; cutCostPerM3: number; haulCostPerM3: number; haulRadius: number; rockMult: number; underwaterMult: number;
  /** опоры: шаг м, макс. пролёт балка / вантовый, множ. вантового, зазор, сдвиг доля шага, рама ₽, перенос ₽, макс. глубина воды м */ pierSpacing: { road: number; highway: number; rail: number }; maxSpan: [number, number]; cableStayMult: number; pierClearance: number; pierShiftShare: number; portalPierCost: number; pierMoveCost: number; pierMaxWaterDepth: number;
  /** привязка: к узлу м, к ребру м (+ полуширина) */ snapNode: number; snapEdge: number;
}


export interface RailConsts {
  /** по системам: мин. радиус м, макс. уклон, мин. интервал мин, стоянка мин, содержание пути ₽/км/мес, депо ₽ и вместимость ТС, ёмкость станции пасс/ч, длина платформы м */
  systems: Record<'tram' | 'metro' | 'rail', { minRadius: number; maxGrade: number; minHeadwayMin: number; dwellMin: number; trackUpkeepPerKmMonth: number; depotCost: number; depotCapacity: number; stationCapacityPerHour: number; platformLen: number }>;
  /** разворот на конечной, мин */ turnbackMin: number;
  /** однопутный участок: скидка цены и множитель пропускной способности */ singleTrackCostMult: number; singleTrackCapMult: number;
  /** съезд между путями, ₽ */ crossoverCost: number;
  /** доп. путь ж/д станции, ₽; грузовой терминал ₽ и составов/день */ stationExtraTrackCost: number; freightTerminalCost: number; freightTerminalTrainsDay: number;
  /** переезд: задержка авто на поезд с, потеря ёмкости дороги за поезд/ч */ levelCrossingDelaySec: number; levelCrossingCapLossPerTrain: number;
  /** метро: базовая глубина м, рост цены пути и станции на м глубже базы, мин. глубина под рекой м */ metroBaseDepth: number; metroDepthCostPerM: number; metroStationDepthCostPerM: number; metroRiverMinDepth: number;
  /** метро: вертикальный и плановый разнос тоннелей, м; время доступа = 1 + depth/accessDepthPerMin */ tunnelVerticalSep: number; tunnelPlanSep: number; accessDepthPerMin: number;
  /** эстакадное метро: множитель цены пути; шум L0 */ elevatedMetroCostMult: number; elevatedMetroNoiseL0: number;
  /** подземный вид: прозрачность поверхности, мин. высота камеры м */ undergroundSurfaceOpacity: number; undergroundCameraMinY: number;
  /** штраф перегрузки станции, мин на единицу сверх 1 */ stationOverloadMin: number;
  /** пересадки: макс. пеший переход м, время на совмещённой станции мин, автобус рядом мин, надбавка за объединение (доля) */ transferMaxWalk: number; sharedStationTransferMin: number; busTransferMin: number; mergeStationCostShare: number;
  /** P+R: мест, цена ₽ */ parkRideSpaces: number; parkRideCost: number;
  /** старение: содержание после срока службы ×, шанс поломки в день */ oldVehicleUpkeepMult: number; oldVehicleBreakdownDaily: number;
}

export interface TransitLinesConsts {
  /** шаг остановок мин/макс, м, по LINE_TYPES (Автобус, Трамвай, Метро, Поезд) */ stopSpacingMin: number[]; stopSpacingMax: number[];
  /** периоды суток: часы начала/конца, доля суточных поездок, множитель базового интервала (0 = не ходит) */
  periods: Record<'amPeak' | 'day' | 'pmPeak' | 'evening' | 'night', { from: number; to: number; tripShare: number; headwayMult: number }>;
  /** стоянка на остановке, мин (автобус/трамвай) */ dwellMin: number;
  /** доля содержания ТС в простое */ idleUpkeepShare: number;
  /** автоподбор: целевая загрузка, макс. изменение ТС в день (доля), макс. доля дохода города на ОТ без подтверждения */ targetLoad: number; autoMaxDailyChange: number; maxAutoUpkeepShare: number;
  /** продажа ТС: доля остаточной стоимости */ vehicleResaleShare: number;
  /** оповещения: opRatio убыточной линии, месяцев подряд; дней без пассажиров у остановки */ unprofitableOpRatio: number; unprofitableMonths: number; deadStopDays: number;
}

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
  roads: RoadSystemConsts;
  congestion: CongestionConsts;
  netgen: NetGenConsts;
  rail: RailConsts;
  lines: TransitLinesConsts;
  /** этап H (THEMES_SPEC §5): размер квартала темы, м; режим «Смешанный»: радиус исторического центра, м, и его эпоха (лет игры); годы кольца новостроек; после какого года — base; доля вкраплений; шаг квантования этажей */
  themes: { quarterSize: number; coreRadius: number; coreEpoch: number; ringEpoch: [number, number]; lateEpoch: number; mixShare: number; floorStep: number };
  /** QA2 п.2: подгрузка чанков по бюджету кадра */ render: { /** автобусная остановка: масштаб модели, высота столба, размер таблички, м */ busStopScale: number; signalScale: number; signalLampK: number; lampDotNear: number; grassNightDim: number; farRoadDark: number; terrainBlurFar: number; terrainFarFlatten: number; nightRoadEmissive: number; busStopPoleH: number; busStopSign: number; chunkOpsPerFrame: number; chunkMsPerFrame: number; farLots: boolean; /** E2: дальность LOD 2/1 от камеры, м; гистерезис, м */ lodNear: number; lodMid: number; lodHyst: number };
  zoning: ZoningBalance;
  trafficControl: TrafficControlBalance;
  construction: ConstructionBalance;
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
  roads: {
    classes: {
      highway: { speed: 28, minLanes: 1, maxLanes: 4, baseCostPerM: 260, upkeepPerM: 1.0, laneCapacityPerHour: 2000, minRadius: 450, maxGrade: 0.05, clearance: 5.0, tunnelMinCover: 4, noiseL0: 75, pollutionPerVehKm: 1.0, frontage: false },
      ramp: { speed: 15, minLanes: 1, maxLanes: 1, baseCostPerM: 180, upkeepPerM: 0.7, laneCapacityPerHour: 1800, minRadius: 110, maxGrade: 0.07, clearance: 5.0, tunnelMinCover: 4, noiseL0: 70, pollutionPerVehKm: 1.0, frontage: false },
      street: { speed: 13, minLanes: 1, maxLanes: 3, baseCostPerM: 60, upkeepPerM: 0.25, laneCapacityPerHour: 700, minRadius: 90, maxGrade: 0.08, clearance: 4.5, tunnelMinCover: 3, noiseL0: 68, pollutionPerVehKm: 0.8, frontage: true },
      lane: { speed: 8, minLanes: 1, maxLanes: 1, baseCostPerM: 35, upkeepPerM: 0.15, laneCapacityPerHour: 400, minRadius: 30, maxGrade: 0.12, clearance: 4.0, tunnelMinCover: 3, noiseL0: 60, pollutionPerVehKm: 0.6, frontage: true },
    },
    modules: {
      car: { width: 3.5, costPerM: 0, upkeepPerM: 0, capacityMult: 1 },
      bus: { width: 3.5, costPerM: 20, upkeepPerM: 0.05, capacityMult: 1 },
      tramShared: { width: 3.5, costPerM: 35, upkeepPerM: 0.1, capacityMult: 0.8 },
      tramDedicated: { width: 3.2, costPerM: 45, upkeepPerM: 0.12, capacityMult: 1 },
      bike: { width: 2.0, costPerM: 12, upkeepPerM: 0.03, capacityMult: 1 },
      sidewalk: { width: 2.0, costPerM: 6, upkeepPerM: 0.02, capacityMult: 1 },
      pedestrian: { width: 3.0, costPerM: 25, upkeepPerM: 0.04, capacityMult: 0 },
      trees: { width: 1.5, costPerM: 8, upkeepPerM: 0.03, capacityMult: 1 },
      median: { width: 2.0, costPerM: 5, upkeepPerM: 0.01, capacityMult: 1.05 },
      parking: { width: 2.5, costPerM: 4, upkeepPerM: 0.01, capacityMult: 0.9 },
      noiseWall: { width: 0.5, costPerM: 30, upkeepPerM: 0.02, capacityMult: 1 },
    },
    maxLanesPerDir: 4,
    rampMinLen: 120,
    rampMinSpacing: 400,
    embankmentPerM: 0.08,
    bridgeBase: 3,
    bridgePerM: 0.1,
    tunnelBase: 6,
    tunnelPerM: 0.05,
    bridgeUpkeepMult: 2,
    tunnelUpkeepMult: 3,
    pierSpacing: 40,
    pierSpacingWater: 60,
    segMinLen: 8,
    segMaxLen: 400,
    chordError: 0.5,
    minRadiusSoftShare: 0.5,
    upgradeRefund: 0.7,
    demolishShare: 0.2,
    signalCycleSec: 90,
    autoSignalFlow: 1200,
    noiseThresholdDb: 65,
    noiseLandValuePenalty: 0.1,
  },
  congestion: {
    levelVC: { dense: 0.6, jam: 0.9, gridlock: 1.2 },
    multiHead: true, moveLoadK: 0, moveMinFrac: 0.35, squeezeSec: 6, agentFill: 0.75, idm: { a: 2.5, T: 0.9, s0: 1.5, ab: 3.5 }, // QA2 п.3: было a 1.6, T 1.3, s0 2
    levelColors: { free: '#3cb043', dense: '#f2c230', jam: '#e04848', gridlock: '#7a1020' },
    gapCriticalSec: 6.5,
    gapFollowSec: 3.5,
    analysisPeriodH: 0.25,
    saturationFlowPerLane: 1800,
    lostTimePerPhaseSec: 4,
    roundaboutA: 1400,
    roundaboutB: 0.7,
    roundaboutMinCap: 200,
    stopAllExtraSec: 4,
    mergeFactor: 0.8,
    taperFactor: 0.95,
    leftTurnPenaltySec: 6,
    maxNodeDelaySec: 600,
    awareShare: 0.35,
    rerouteThreshold: 0.1,
    rerouteMinGainMin: 2,
    hysteresisShare: 0.5,
    costSmoothing: 0.5,
    agentRerouteTicks: 30,
    agentRerouteWaitMin: 3,
    agentRerouteRadius: 2000,
    costUpdateSec: 20,
    agentRerouteWaitSec: 30,
    agentRerouteMinGainSec: 15,
    agentRerouteMaxExp: 20000,
    vehSpacing: 7,
    spillMinCap: 0.2,
    spillMaxHops: 4,
    accidentRatePerMVehKm: 0.8,
    accidentDurationMin: 45,
    accidentDurationSpreadMin: 30,
    incidentCapacity: 0.5,
    dirtyThreshold: 0.1,
    dirtyHops: 2,
    nodeRecalcMinVC: 0.5,
  },
  netgen: {
    deadEndCloseM: 20, // QA3 №6: тупик ближе — соединяется с дорогой
    deadEndJoin: 18, /* регуляризация сети (Степан/QA3) */ regMinNodeM: 40, regAcuteDeg: 35, regParM: 12, regDeadNearM: 10, regAvMinM: 400, regStubM: 40, regPasses: 12, avenueMinLen: 120, specW: [7, 12, 14, 4.5], villageMaxR: 600, /* посёлок ≤ villageMaxPop (5000) — по радиусу */ ringMinR: 2500, tangleDeg: 22, feederLen: 300, hwCellPenalty: 40, // A1 ширины полотна; A7 кольцо от радиуса города, порог «сплетения»; A4 длина проспекта-подводки к шоссе; A3/A5 штраф клеток у шоссе // USER_FEEDBACK_2 A2/A6: порог достраивания тупика (м), мин. длина изолированного проспекта (м)
    parallelMin: { lane: 40, street: 56, avenue: 80, highway: 200 },
    junctionSpacing: { lane: 30, street: 50, avenue: 120 },
    minAngleDeg: { lane: 30, street: 35, avenue: 45, highway: 75 },
    highwayResSetback: 30,
    highwayResSetbackWithWall: 15,
    blockMin: 90,
    blockMax: 320,
    blockExp: 1.5,
    arterialSpacing: 800,
    arterialMaxReach: 600,
    repairMaxLen: 1500,
    minIslandEdges: 6,
    repairMaxPasses: 8,
    deadEndMax: 300,
    accessDist: 24,
    freightMaxGrade: 0.06,
    highway: { junctionStep: 600, rampMargin: 30, maxCrossPerPair: 2, roadCellPenalty: 6, segLen: 40, diamond: true, diamondOff: 70 },
    lots: {
      lane: { depthTiles: 2, maxLevelShare: 0.4, comDemandMult: 0.8 },
      street: { depthTiles: 2, maxLevelShare: 1, comDemandMult: 1 },
      avenue: { depthTiles: 3, maxLevelShare: 1, comDemandMult: 1.25 },
      pedestrian: { depthTiles: 2, maxLevelShare: 0.8, comDemandMult: 1.3 },
    },
    noAccessDecayDays: 10,
      beltBounds: [0.25, 0.6, 1.0, 2.0],
    hierarchyNoise: 0.1,
    minChainLen: { highway: 1500, avenue: 400, street: 60, lane: 30 },
    highwayDetourMax: 0.3,
    highwayCrossAngleTol: 15,
    highwayCorridorMin: 1500,
    interchangeSpacing: 1200,
    highwayRejoinMin: 3000,
    minEdgeGap: 24,
    maxCrossingsPerPair: 1,
    minLoopPerimeterBlocks: 4,
    maxNodeDegree: 4,
    ringMinPop: 150000,
    secondRingPop: 700000,
    bypassPop: 3000000,
    deadEndSnapWidthMult: 1.5,
    deadEndSnapMin: 12,
    deadEndExtendMax: 40,
    deadEndExtendAngle: 30,
    culDeSacMax: 120,
    taperLenPerM: 10,
    taperMinLen: 20,
    maxBendDeg: 20,
    genMaxVC: 0.85,
    genFixRounds: 3,
    crosswalkWidth: 4,
    junctionZonePad: 2,
    culDeSacSpacing: 80,
    villageMaxPop: 5000,
  },
  rail: {
    systems: {
      tram: { minRadius: 25, maxGrade: 0.06, minHeadwayMin: 2, dwellMin: 0.5, trackUpkeepPerKmMonth: 350, depotCost: 80000, depotCapacity: 10, stationCapacityPerHour: 3000, platformLen: 30 },
      metro: { minRadius: 200, maxGrade: 0.04, minHeadwayMin: 2, dwellMin: 0.5, trackUpkeepPerKmMonth: 2170, depotCost: 1200000, depotCapacity: 20, stationCapacityPerHour: 25000, platformLen: 120 },
      rail: { minRadius: 600, maxGrade: 0.025, minHeadwayMin: 3, dwellMin: 1.5, trackUpkeepPerKmMonth: 920, depotCost: 900000, depotCapacity: 15, stationCapacityPerHour: 15000, platformLen: 250 },
    },
    turnbackMin: 2,
    singleTrackCostMult: 0.6,
    singleTrackCapMult: 0.33,
    crossoverCost: 5000,
    stationExtraTrackCost: 25000,
    freightTerminalCost: 150000,
    freightTerminalTrainsDay: 40,
    levelCrossingDelaySec: 120,
    levelCrossingCapLossPerTrain: 0.02,
    metroBaseDepth: 10,
    metroDepthCostPerM: 0.02,
    metroStationDepthCostPerM: 0.03,
    metroRiverMinDepth: 20,
    tunnelVerticalSep: 6,
    tunnelPlanSep: 10,
    accessDepthPerMin: 20,
    elevatedMetroCostMult: 0.6,
    elevatedMetroNoiseL0: 72,
    undergroundSurfaceOpacity: 0.15,
    undergroundCameraMinY: -80,
    stationOverloadMin: 5,
    transferMaxWalk: 200,
    sharedStationTransferMin: 3,
    busTransferMin: 4,
    mergeStationCostShare: 0.3,
    parkRideSpaces: 200,
    parkRideCost: 50000,
    oldVehicleUpkeepMult: 1.5,
    oldVehicleBreakdownDaily: 0.01,
  },
  themes: { quarterSize: 120, coreRadius: 1200, coreEpoch: 15, ringEpoch: [10, 40], lateEpoch: 40, mixShare: 0.2, floorStep: 1 },
  render: { busStopScale: 3, signalScale: 2.2, signalLampK: 2.2, lampDotNear: 0.9, grassNightDim: 0.85, farRoadDark: 0.3, terrainBlurFar: 3, terrainFarFlatten: 0.55, nightRoadEmissive: 0x39424f /* QA3 №11: светофоры заметнее */, busStopPoleH: 13, busStopSign: 6, chunkOpsPerFrame: 2, chunkMsPerFrame: 4, farLots: true, lodNear: 1300, lodMid: 2400, lodHyst: 150 },
  lines: {
    stopSpacingMin: [250, 250, 600, 1500],
    stopSpacingMax: [800, 800, 2000, 15000],
    periods: {
      amPeak: { from: 7, to: 10, tripShare: 0.3, headwayMult: 1 },
      day: { from: 10, to: 17, tripShare: 0.3, headwayMult: 1.5 },
      pmPeak: { from: 17, to: 20, tripShare: 0.27, headwayMult: 1 },
      evening: { from: 20, to: 24, tripShare: 0.1, headwayMult: 2 },
      night: { from: 0, to: 7, tripShare: 0.03, headwayMult: 4 },
    },
    dwellMin: 0.5,
    idleUpkeepShare: 0.3,
    targetLoad: 0.8,
    autoMaxDailyChange: 0.2,
    maxAutoUpkeepShare: 0.2,
    vehicleResaleShare: 0.5,
    unprofitableOpRatio: 0.5,
    unprofitableMonths: 3,
    deadStopDays: 30,
  },
  zoning: {
    depth: { lane: 24, street: 32, avenue: 48, pedestrian: 24 },
    lotWidth: { lane: [12, 20], street: [16, 28], avenue: [24, 40] },
    setback: { lane: 3, street: 4, avenue: 6 },
    levelShare: { lane: 0.4, street: 0.7, avenue: 1.0 },
    minBlockArea: 1200,
    minLotDepth: 12,
    courtyardMin: 12,
    lotWidthJitter: 0.15,
    tileCoverShare: 0.5,
    courtyardAreaBounds: [400, 2500, 8000],
    spotsPer100m2: 3.5,
    parkingOccupancy: [0.3, 0.8],
    spotsPerFlat: 0.5,
    courtyardParkEffect: 0.03,
    courtyardParkRadius: 60,
    drivewayFromJunction: 20,
    themeKeepProb: 0.85,
  },
  trafficControl: {
    uncontrolledCap: 500,
    allWayStopCap: 450,
    criticalGap: 6.5,
    followUpTime: 3.5,
    saturationFlow: 1800,
    cycleMin: 40,
    cycleDefault: 90,
    cycleMax: 150,
    minGreen: 7,
    lostTimePerPhase: 4,
    leftPhaseThreshold: 200,
    adaptiveIntervalMin: 15,
    nightBlinkHours: [23, 5],
    greenWaveDelayCut: 0.35,
    roundabout1: [1200, 0.6],
    roundabout2: [2000, 0.8],
    cost: { priority: 2000, stop: 1000, signal: 25000, roundabout1: 40000, roundabout2: 90000 },
    simCycle: 30, adaptive: { on: false, minG: 7, maxG: 35, ratio: 1.5, allRed: 1.5, senseM: 70 }, // цикл светофора в симуляции, с (ускоренное игровое время)
    yForkDeg: [30, 60],
    priorityGapM: 20, actuatedM: 40, courtesySec: 10, // второстепенная ждёт, если машина главной ближе, м (QA2 п.3: было 30)
    upkeep: { priority: 20, stop: 10, signal: 300, roundabout1: 150, roundabout2: 300 },
    laneCap: { lane: 400, street: 700, avenue: 1600, highway: 2000, ramp: 1500 },
    maxLanes: { lane: 1, street: 2, avenue: 4, highway: 5, ramp: 2 },
    oneWayCapBonus: 0.1,
    noLeftCapBonus: 0.15,
    busStopInLanePenalty: 0.25,
    interchange: {
      diamond: [350000, 1500, 1500],
      parclo: [500000, 2000, 1500],
      cloverleaf: [900000, 3500, 1200],
      turbine: [2000000, 6000, 1800],
      trumpet: [450000, 1800, 1500],
      split: [300000, 1200, 2000],
    },
    cloverMaxFlow: 6000,
    accelLen: 200,
    decelLen: 120,
    weavingPenalty: 0.2,
    weavingLen: 600,
    mergeTaperLen: 120,
    busLaneEndBeforeMerge: 30,
  },
  construction: {
    levelValue: [0, 900, 1400, 2000, 2800, 3800],
    compensationMult: { R: 1.2, C: 1.0, I: 0.8, O: 1.5 },
    moveOutPerResident: 1500,
    moveOutPerJob: 3000,
    happinessPerDemolished: 0.002,
    demolishMoodDays: 30,
    evicteeStayShare: 0.5,
    treeCost: 50,
    corridorPad: 2,
    levelStep: 8,
    gradeMaxDh: 6,
    levelRange: { road: [-3, 4], rail: [-4, 4], metro: [-4, -1], tram: [-1, 2] },
    maxGrade: { highway: 0.05, avenue: 0.06, street: 0.08, lane: 0.1, rail: 0.035, metro: 0.04, tram: 0.06 },
    groundTol: 1,
    embankmentMaxH: 6,
    cutMaxDepth: 6,
    elevatedMult: [3, 0.1],
    tunnelMult: [6, 9],
    tunnelPortalCost: 80000,
    cutCoverMaxDepth: 8,
    clearance: { road: 5.5, rail: 6.5 },
    heightStep: 4,
    slopeRatio: 2,
    fillCostPerM3: 12,
    cutCostPerM3: 18,
    haulCostPerM3: 6,
    haulRadius: 500,
    rockMult: 2,
    underwaterMult: 3,
    pierSpacing: { road: 30, highway: 40, rail: 35 },
    maxSpan: [60, 150],
    cableStayMult: 2.5,
    pierClearance: 1.5,
    pierShiftShare: 0.4,
    portalPierCost: 40000,
    pierMoveCost: 15000,
    pierMaxWaterDepth: 8,
    snapNode: 6,
    snapEdge: 4,
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
