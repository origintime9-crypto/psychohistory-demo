export interface Params {
  beta0: number;
  poverty: number;
  mixed: number;
  mixedFaction: number;
  neighbor: number;
  legitimacy: number;
  deficit: number;
  calm0: number;
  escalation0: number;
  suppression0: number;
  secession0: number;
  shockSD: number;
  shockJump: number;
  shockProbability: number;
  expense: number;
  rebellionExpense: number;
  budgetSpeed: number;
  prestigeLoss: number;
  pressureTarget: number;
  driftNoise: number;
  contagion: boolean;
  commonShock: boolean;
  fiscalFeedback: boolean;
  mule: boolean;
  reformGain: number;
  religionRetention: number;
  religionLegitimacy: number;
  religionFaction: number;
  foundationGain: number;
  influenceRecovery: number;
  taxDuration: number;
  taxLegitimacyGain: number;
  eliteTreasuryCost: number;
  muleShock: number;
  storyEvents: boolean;
  storyChance: number;
}
/** All numerical magnitudes are game parameters, NOT coefficients fitted to real political data. */
export const DEFAULT_PARAMS: Readonly<Params> = Object.freeze({
  beta0: -6.7,
  poverty: 2.3,
  mixed: 0.7,
  mixedFaction: 1.6,
  neighbor: 2.3,
  legitimacy: 1.8,
  deficit: 0.7,
  calm0: -4.2,
  escalation0: -4.1,
  suppression0: -4.0,
  secession0: -1.3,
  shockSD: 0.3,
  shockJump: 0.6,
  shockProbability: 0.1,
  expense: 0.064,
  rebellionExpense: 0.08,
  budgetSpeed: 2,
  prestigeLoss: 0.4,
  pressureTarget: 0.86,
  driftNoise: 0.02,
  contagion: true,
  commonShock: true,
  fiscalFeedback: true,
  mule: false,
  reformGain: 0.25,
  religionRetention: 0.85,
  religionLegitimacy: 0.45,
  religionFaction: 0.45,
  foundationGain: 0.1,
  influenceRecovery: 1,
  taxDuration: 4,
  taxLegitimacyGain: 0.1,
  eliteTreasuryCost: 0.01,
  muleShock: 4.2,
  storyEvents: true,
  storyChance: 0.4,
});
export const PARAMETER_SOURCES = [
  {
    fields: 'poverty, mixed, mixedFaction, neighbor',
    source: 'PITF 定性方向；数值为游戏标定',
    note: '贫困代理、派系化的部分民主与动荡邻国；病例对照 odds ratio 不能直接当年风险率。',
  },
  {
    fields: 'deficit, elites → faction / escalation, pressure feedback',
    source: 'Turchin 定性方向；数值为游戏标定',
    note: '精英竞争、财政压力与动荡后的负反馈。',
  },
  {
    fields: 'beta0, transitions, distance, cards, shock, expenses',
    source: '游戏设计与合成模拟标定',
    note: '虚构帝国中的十年转移率，不是现实国家的预测器。',
  },
];
export const TOTAL_TURNS = 30;
export const MODEL_VERSION = 'synthetic-v3';
