// Константы вовлечённости. Источник: mechanics/07-balance-constants.ts → BALANCE.engagement / BALANCE.alerts
// (в src/sim/balance.ts этой секции пока нет; при синхронизации заменить на импорт оттуда).
export const ENG = {
  floatTextMaxOnScreen: 24, floatTextTtlSec: 1.5, alertCooldownDays: 3, feedMaxPerDay: 8, autoPauseOnCritical: true,
  onboardingGoalRewards: [50000, 50000, 100000, 100000, 200000],
  /** 10-engagement: 0.1; поднято до 0.4 после балансировки (на посёлке 5 000 ₽ = 1,7% старта — незаметно; 0.4 → 20–80 тыс ₽ ≈ 7–27% стартовых 300 тыс) */
  onboardingRewardMinScale: 0.4,
  maxActiveQuests: 3, eventDailyChance: 0.08, eventMinGapDays: 10, eventDecisionDays: 3,
  contractPremium: 1.25, contractPenaltyShare: 0.2, contractRelationOk: 3, contractRelationFail: -5,
  rpPerMillionIncome: 1, rpPer100kPop: 2, advisorCooldownDays: 5, advisorSnoozeDays: 30,
  stressHigh: 0.7, stressLow: 0.25, dynMinMult: 0.5, dynMaxMult: 1.5,
  difficulty: {
    relaxed: { moneyMult: 2, eventMult: 0.5, bankruptcyMonths: 0, aiThresholdShift: -0.15 },
    normal: { moneyMult: 1, eventMult: 1, bankruptcyMonths: 3, aiThresholdShift: 0 },
    hard: { moneyMult: 0.6, eventMult: 1.5, bankruptcyMonths: 2, aiThresholdShift: 0.1 },
  },
  seasonLengthDays: 28,
};
export const ALERTS = { congestionVC: 0.9, goodsShortage: 0.15, unemployment: 0.1, transitOverload: 1.1, cashMonthsWarn: 2 };
export type Difficulty = keyof typeof ENG.difficulty;
