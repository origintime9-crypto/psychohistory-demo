import { CARDS } from '../engine/cards';
import { counts, type Action, type State, type StepResult, type World } from '../engine/types';

export interface TurnOutcome {
  turn: number;
  command: string;
  target: string | null;
  story: StepResult['story'];
  mule: boolean;
  reformFailed: boolean;
  before: ReturnType<typeof counts>;
  after: ReturnType<typeof counts>;
  resources: { label: string; before: number; direct: number; after: number; unit: string }[];
  direct: { label: string; before: number; after: number; good: boolean }[];
  changes: { name: string; from: number; to: number }[];
}
export function turnOutcome(
  world: World,
  before: State,
  action: Action,
  result: StepResult,
): TurnOutcome {
  const immediate = result.impact!;
  const active =
    before.phase[world.capital] !== 3
      ? world.capital
      : before.phase.findIndex((phase) => phase !== 3);
  const focus = action.target ?? result.story?.target ?? (active >= 0 ? active : world.terminus);
  const direct: TurnOutcome['direct'] = [];
  for (const [field, label, higherGood] of [
    ['governance', '帝国 · 治理能力', true],
    ['reform', '帝国 · 后续改革支撑', true],
    ['tax', '帝国 · 税率', false],
  ] as const) {
    const delta = immediate[field] - before[field];
    if (Math.abs(delta) > 0.001)
      direct.push({
        label,
        before: before[field],
        after: immediate[field],
        good: higherGood ? delta > 0 : delta < 0,
      });
  }
  const fields = [
    ['prosperity', '繁荣', true],
    ['pressure', '人口压力', false],
    ['elites', '精英竞争', false],
    ['faction', '派系化', false],
    ['legitimacy', '合法性', true],
    ['religion', '宗教影响', true],
    ['education', '教育积累', true],
    ['garrison', '驻军', true],
    ['openness', '政体开放度', true],
  ] as const;
  for (const [field, label, higherGood] of fields) {
    const delta = immediate[field][focus] - before[field][focus];
    if (Math.abs(delta) > 0.001)
      direct.push({
        label: `${world.names[focus]} · ${label}`,
        before: before[field][focus],
        after: immediate[field][focus],
        good: higherGood ? delta > 0 : delta < 0,
      });
  }
  return {
    turn: result.state.turn,
    command: CARDS[action.card].name,
    target: action.target === undefined ? null : world.names[action.target],
    story: result.story,
    mule: result.muleEvent,
    reformFailed: result.reformFailed,
    before: counts(before),
    after: counts(result.state),
    resources: [
      {
        label: '国库',
        before: before.treasury,
        direct: immediate.treasury,
        after: result.state.treasury,
        unit: '%',
      },
      {
        label: '基地',
        before: before.foundation,
        direct: immediate.foundation,
        after: result.state.foundation,
        unit: '%',
      },
      {
        label: '影响力',
        before: before.influence,
        direct: immediate.influence,
        after: result.state.influence,
        unit: '点',
      },
    ],
    direct,
    changes: result.events.map((e) => ({ name: world.names[e.sector], from: e.from, to: e.to })),
  };
}
