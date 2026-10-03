import type { Params } from './params';
import type { State, World } from './types';
import { strategicProtection } from './strategy';
export const ambiguity = (openness: number) => 4 * openness * (1 - openness);
export interface RiskContribution {
  label: string;
  value: number;
  hint: string;
}
export function onsetBreakdown(
  s: State,
  i: number,
  neighbors: number,
  p: Params,
): RiskContribution[] {
  const a = ambiguity(s.openness[i]);
  return [
    {
      label: '繁荣不足',
      value: p.poverty * (1 - s.prosperity[i]),
      hint: '学院与限时减税可以提升繁荣',
    },
    { label: '政体过渡', value: p.mixed * a, hint: '开放度处在中间地带时过渡风险较高' },
    {
      label: '派系竞争',
      value: p.mixedFaction * a * s.faction[i],
      hint: '安置精英、科学教可以缓解派系竞争',
    },
    { label: '邻区传染', value: p.neighbor * neighbors, hint: '救助邻区也会影响本地风险' },
    {
      label: '合法性',
      value: -p.legitimacy * (s.legitimacy[i] - 0.5),
      hint: '合法性高于 50% 时降低风险；减税立即提升合法性',
    },
    { label: '财政压力', value: p.deficit * (1 - s.treasury), hint: '国库不足会增加全帝国风险' },
    ...(p.strategic && s.strategic
      ? [
          {
            label: '补给、贸易与情报',
            value: -strategicProtection(s, i),
            hint: '补给不足增加风险；贸易与情报抑制风险',
          },
        ]
      : []),
  ];
}
export function riskBreakdown(
  world: World,
  s: State,
  i: number,
  p: Params,
): { title: string; terms: RiskContribution[] } {
  const [c, lost] = neighborhood(world, s, i, p),
    geff = s.governance * Math.exp(-world.distance[i] / 0.8);
  if (s.phase[i] === 0) return { title: '新动荡风险构成', terms: onsetBreakdown(s, i, c, p) };
  if (s.phase[i] === 1)
    return {
      title: '升级为叛乱的风险构成',
      terms: [
        { label: '精英过剩', value: 2 * s.elites[i], hint: '安置精英能立即削弱这一通道' },
        { label: '邻区传染', value: c, hint: '动荡或叛乱邻区提高升级风险' },
        { label: '有效治理', value: -geff, hint: '行政改革提高治理，远离首都会削弱治理' },
        {
          label: '合法性',
          value: -1.5 * s.legitimacy[i],
          hint: '减税立即提升，科学教提供持续支撑',
        },
        ...(p.strategic && s.strategic
          ? [
              {
                label: '战略支撑',
                value: -strategicProtection(s, i),
                hint: '补给、贸易与情报抑制升级',
              },
            ]
          : []),
      ],
    };
  if (s.phase[i] === 2)
    return {
      title: '脱离帝国的风险构成',
      terms: [
        { label: '独立邻区', value: lost, hint: '已独立邻区提高分离压力' },
        { label: '有效治理', value: -1.2 * geff, hint: '行政改革有助于遏制分离' },
        { label: '合法性', value: -s.legitimacy[i], hint: '合法性越高，分离风险越低' },
        ...(p.strategic && s.strategic
          ? [
              {
                label: '自治协定',
                value: -1.4 * s.strategic.autonomy[i],
                hint: '边疆调停以税收让步降低分离风险',
              },
            ]
          : []),
      ],
    };
  return { title: '已独立：不可逆状态', terms: [] };
}
export function neighborhood(world: World, s: State, i: number, p: Params): [number, number] {
  if (!p.contagion) return [0, 0];
  let crisis = 0,
    independent = 0;
  for (const j of world.neighbors[i]) {
    if (s.phase[j] === 1 || s.phase[j] === 2) crisis++;
    if (s.phase[j] === 3) independent++;
  }
  const len = world.neighbors[i].length;
  return [crisis / len, independent / len];
}
export function onsetProbability(
  s: State,
  i: number,
  neighborFraction: number,
  shock: number,
  p: Params,
): number {
  const a = ambiguity(s.openness[i]);
  const eta =
    p.beta0 +
    p.poverty * (1 - s.prosperity[i]) +
    p.mixed * a +
    p.mixedFaction * a * s.faction[i] +
    p.neighbor * neighborFraction -
    p.legitimacy * (s.legitimacy[i] - 0.5) +
    p.deficit * (1 - s.treasury) +
    shock * (p.strategic && s.strategic ? 1 - 0.45 * s.strategic.intelligence[i] : 1) -
    (p.strategic ? strategicProtection(s, i) : 0);
  return -Math.expm1(-10 * Math.exp(eta));
}
export function competingProbabilities(rates: number[]): number[] {
  const total = rates.reduce((a, b) => a + b, 0);
  if (total <= 0) return [...rates.map(() => 0), 1];
  const exit = -Math.expm1(-10 * total);
  return [...rates.map((v) => (exit * v) / total), Math.exp(-10 * total)];
}
/** Vector of probabilities for destinations [stable, unrest, rebellion, independent]. */
export function transitionProbabilities(
  world: World,
  s: State,
  i: number,
  shock: number,
  p: Params,
): [number, number, number, number] {
  const phase = s.phase[i];
  if (phase === 3) return [0, 0, 0, 1];
  const [c, cIN] = neighborhood(world, s, i, p);
  if (phase === 0) {
    const onset = onsetProbability(s, i, c, shock, p);
    return [1 - onset, onset, 0, 0];
  }
  const geff = s.governance * Math.exp(-world.distance[i] / 0.8);
  const protection = p.strategic ? strategicProtection(s, i) : 0;
  const exposure = p.strategic && s.strategic ? 1 - 0.45 * s.strategic.intelligence[i] : 1;
  if (phase === 1) {
    const calm = Math.exp(
      p.calm0 + 1.5 * s.legitimacy[i] + geff + 0.8 * s.prosperity[i] - s.faction[i] + protection,
    );
    const escalate = Math.exp(
      p.escalation0 +
        2 * s.elites[i] +
        c -
        geff -
        1.5 * s.legitimacy[i] +
        shock * exposure -
        protection,
    );
    const [a, b, remain] = competingProbabilities([calm, escalate]);
    return [a, remain, b, 0];
  }
  const suppress = Math.exp(p.suppression0 + 1.5 * geff + s.treasury + s.garrison[i]);
  const secede = Math.exp(
    p.secession0 +
      cIN -
      1.2 * geff -
      s.legitimacy[i] +
      shock * exposure -
      (p.strategic && s.strategic ? 1.4 * s.strategic.autonomy[i] : 0),
  );
  const [a, b, remain] = competingProbabilities([suppress, secede]);
  return [0, a, remain, b];
}
