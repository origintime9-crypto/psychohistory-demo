import {
  clamp,
  cloneState,
  counts,
  type Action,
  type CardId,
  type State,
  type World,
} from './types';
import { stream } from './rng';
import { DEFAULT_PARAMS, type Params } from './params';
export interface Card {
  id: CardId;
  name: string;
  short: string;
  cost: number;
  targeted: boolean;
  effect: string;
  downside: string;
  symbol: string;
}
export const CARDS: Record<CardId, Card> = {
  academy: {
    id: 'academy',
    name: '资助学院',
    short: '知识与繁荣',
    cost: 2,
    targeted: true,
    effect: '繁荣 +12%，人口压力 −5%；邻区效果减半。',
    downside: '精英过剩 +4%。',
    symbol: '⌘',
  },
  religion: {
    id: 'religion',
    name: '科学教传播',
    short: '重建共同信念',
    cost: 2,
    targeted: true,
    effect: '宗教影响 +40%，派系化 −5%；邻区效果减半。',
    downside: '影响每回合保留 85%；开放星区效果减半，重复传播收益递减。',
    symbol: '✧',
  },
  elites: {
    id: 'elites',
    name: '安置精英',
    short: '疏解权力竞争',
    cost: 2,
    targeted: true,
    effect: '精英过剩 −25%，派系化 −8%；邻区效果减半。',
    downside: '国库 −1%。',
    symbol: '◇',
  },
  tax: {
    id: 'tax',
    name: '劝谏减税',
    short: '限时减负与和解',
    cost: 2,
    targeted: false,
    effect: '税率降低 5 个百分点，持续 4 回合；立即合法性 +10%、繁荣 +4%。',
    downside: '期间收入降低，结束后恢复税率；生效期间不能叠加。',
    symbol: '↘',
  },
  reform: {
    id: 'reform',
    name: '行政改革',
    short: '挽回帝国治理',
    cost: 3,
    targeted: false,
    effect: `70% 概率治理 +12%，持续治理目标 +${Math.round(DEFAULT_PARAMS.reformGain * 100)}%。`,
    downside: '改革成果每回合衰减 3%；失败则所有精英过剩 +5%。',
    symbol: '⟁',
  },
  foundation: {
    id: 'foundation',
    name: '建立基地',
    short: '为漫长黑夜留火',
    cost: 2,
    targeted: false,
    effect: '基础增量 10% × 稳定占比 × 端点星条件；进度越高，收益越少。',
    downside: '国库 −2%；满进度后转为知识援助和国库 +2%。',
    symbol: '△',
  },
  noop: {
    id: 'noop',
    name: '按兵不动',
    short: '积蓄影响力',
    cost: 0,
    targeted: false,
    effect: '额外获得 2 点影响力。',
    downside: '不干预当前趋势。',
    symbol: '—',
  },
};
export const CARD_IDS = Object.keys(CARDS).filter((k) => k !== 'noop') as CardId[];
export function drawHand(world: World, turn: number): CardId[] {
  const rng = stream(world.seed, `deck:${turn}`);
  const ids = CARD_IDS.map((id) => ({
    id,
    rank: -Math.log(Math.max(1e-12, rng.uniform())) / (id === 'foundation' ? 0.7 : 1),
  }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.id);
  return [...ids.slice(0, 3), 'noop'];
}
export function validateAction(world: World, s: State, action: Action): void {
  const card = CARDS[action.card];
  if (!card) throw new Error('未知干预卡');
  if (s.influence < card.cost) throw new Error('影响力不足');
  if (action.card === 'tax' && s.taxReliefTurns > 0) throw new Error('减税仍在生效，不能叠加');
  if (
    card.targeted &&
    (action.target === undefined ||
      !Number.isInteger(action.target) ||
      action.target < 0 ||
      action.target >= world.n ||
      s.phase[action.target] === 3)
  )
    throw new Error('请指定尚未独立的目标星区');
}
export function applyAction(
  world: World,
  input: State,
  action: Action,
  reformUniform: number,
  params: Params = DEFAULT_PARAMS,
): { state: State; reformFailed: boolean } {
  validateAction(world, input, action);
  const s = cloneState(input);
  const card = CARDS[action.card];
  s.influence -= card.cost;
  let reformFailed = false;
  if (card.targeted) {
    const target = action.target!;
    const targets: [number, number][] = [
      [target, 1],
      ...world.neighbors[target].map((i) => [i, 0.5] as [number, number]),
    ];
    for (const [i, weight] of targets) {
      if (s.phase[i] === 3) continue;
      if (action.card === 'academy') {
        s.prosperity[i] = clamp(s.prosperity[i] + 0.12 * weight);
        s.pressure[i] = clamp(s.pressure[i] - 0.05 * weight);
        s.elites[i] = clamp(s.elites[i] + 0.04 * weight);
        s.education[i] = clamp(s.education[i] + 0.05 * weight);
      }
      if (action.card === 'religion') {
        const w = (weight * (s.openness[i] > 0.7 ? 0.5 : 1)) / (1 + 0.5 * s.sermons[i]);
        s.religion[i] = clamp(s.religion[i] + 0.4 * w);
        s.faction[i] = clamp(s.faction[i] - 0.05 * w);
        s.sermons[i] = Math.min(255, s.sermons[i] + 1);
      }
      if (action.card === 'elites') {
        s.elites[i] = clamp(s.elites[i] - 0.25 * weight);
        s.faction[i] = clamp(s.faction[i] - 0.08 * weight);
      }
    }
    if (action.card === 'elites') s.treasury = clamp(s.treasury - params.eliteTreasuryCost);
  } else if (action.card === 'tax') {
    s.baseTax = s.tax;
    s.tax = Math.max(0.05, s.tax - 0.05);
    s.taxReliefTurns = params.taxDuration;
    for (let i = 0; i < world.n; i++)
      if (s.phase[i] !== 3) {
        s.legitimacy[i] = clamp(s.legitimacy[i] + params.taxLegitimacyGain);
        s.prosperity[i] = clamp(s.prosperity[i] + 0.04);
      }
  } else if (action.card === 'reform') {
    if (reformUniform < 0.7) {
      s.governance = clamp(s.governance + 0.12);
      s.reform = clamp(s.reform + (params.reformGain ?? 0.12), 0, 0.6);
    } else {
      reformFailed = true;
      for (let i = 0; i < world.n; i++) s.elites[i] = clamp(s.elites[i] + 0.05);
    }
  } else if (action.card === 'foundation') {
    if (s.foundation >= 1) {
      s.treasury = clamp(s.treasury + 0.02);
      for (let i = 0; i < world.n; i++)
        if (s.phase[i] !== 3) s.education[i] = clamp(s.education[i] + 0.02);
    } else {
      s.foundation = clamp(
        s.foundation +
          ((params.foundationGain * counts(s).stable) / world.n) *
            terminusFactor(s.phase[world.terminus]) *
            (1 - 0.6 * s.foundation),
      );
      s.treasury = clamp(s.treasury - 0.02);
    }
  } else if (action.card === 'noop') s.influence = Math.min(8, s.influence + 2);
  return { state: s, reformFailed };
}
export function terminusFactor(phase: number): number {
  return [1, 0.65, 0.35, 0.15][phase] ?? 0;
}
export function actionUnavailable(world: World, s: State, card: CardId): string | null {
  if (s.influence < CARDS[card].cost) return '影响力不足';
  if (card === 'tax' && s.taxReliefTurns > 0) return `减负仍生效 ${s.taxReliefTurns} 回合`;
  if (CARDS[card].targeted && s.phase.every((v) => v === 3)) return '没有可选星区';
  return null;
}
