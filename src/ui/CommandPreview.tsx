import { applyAction, CARDS } from '../engine/cards';
import type { Action, State, World } from '../engine/types';
export const CARD_GUIDANCE = {
  academy: {
    why: '给学院经费，改善生产与技术；新增学者也会争夺职位。',
    when: '适合繁荣偏低、人口压力大的星区',
  },
  religion: {
    why: '用技术与共同信念凝聚居民，效果逐步传到合法性与派系竞争。',
    when: '适合派系对立，留意开放度与重复传播',
  },
  elites: {
    why: '为失意学者和地方官安排出路，减少他们争夺权力的动机。',
    when: '适合精英竞争与派系化偏高的星区',
  },
  tax: {
    why: '暂时少收税，换取居民支持；四回合后恢复，期间收入减少。',
    when: '适合需要全帝国和解、国库尚有余地时',
  },
  reform: {
    why: '改造行政体系，增强治理；改革有可能失败并激化精英竞争。',
    when: '适合准备长期挽回全帝国治理时',
  },
  foundation: {
    why: '把知识、设备与人才送往基地。稳定的银河和端点星能让建设更快。',
    when: '适合当前有余力保存长期知识时',
  },
  noop: {
    why: '保留资源，积蓄影响力，为下一次更重要的介入做准备。',
    when: '适合需要恢复影响力、等待时机时',
  },
};
export default function CommandPreview({
  world,
  state,
  action,
}: {
  world: World;
  state: State;
  action: Action;
}) {
  if (CARDS[action.card].targeted && action.target === undefined) return null;
  let after: State;
  try {
    after = applyAction(world, state, action, 0).state;
  } catch {
    return null;
  }
  if (action.card === 'reform') {
    const failed = applyAction(world, state, action, 0.99).state;
    after.governance = 0.7 * after.governance + 0.3 * failed.governance;
    for (let i = 0; i < world.n; i++)
      after.elites[i] = 0.7 * after.elites[i] + 0.3 * failed.elites[i];
  }
  const target = action.target;
  const metrics: { name: string; before: number; after: number; percent: boolean }[] = [
    { name: '剩余影响力', before: state.influence, after: after.influence, percent: false },
    { name: '国库', before: state.treasury, after: after.treasury, percent: true },
    { name: '基地进度', before: state.foundation, after: after.foundation, percent: true },
  ];
  if (target !== undefined) {
    for (const [field, name] of [
      ['prosperity', '繁荣'],
      ['elites', '精英竞争'],
      ['faction', '派系化'],
      ['religion', '宗教影响'],
    ] as const)
      if (Math.abs(after[field][target] - state[field][target]) > 0.001)
        metrics.push({
          name: `${world.names[target]} · ${name}`,
          before: state[field][target],
          after: after[field][target],
          percent: true,
        });
  } else if (action.card === 'tax')
    metrics.push({
      name: '川陀 · 合法性',
      before: state.legitimacy[world.capital],
      after: after.legitimacy[world.capital],
      percent: true,
    });
  else if (action.card === 'reform')
    metrics.push({
      name: '治理 · 成功率加权示范',
      before: state.governance,
      after: after.governance,
      percent: true,
    });
  const fmt = (v: number, percent: boolean) => (percent ? `${Math.round(v * 100)}%` : `${v} 点`);
  return (
    <div className="command-impact" aria-label="命令直接效果预览">
      <div className="impact-caption">
        命令生效时会改变什么{' '}
        <small>
          {action.card === 'reform'
            ? '改革可能失败，图中是加权示范'
            : '若有事件，先按该选择的预期条件计算'}
        </small>
      </div>
      <div>
        {metrics
          .filter((m, i) => i === 0 || Math.abs(m.before - m.after) > 0.001)
          .map((metric) => (
            <article key={metric.name}>
              <span>{metric.name}</span>
              <strong>
                {fmt(metric.before, metric.percent)} <i>→</i> {fmt(metric.after, metric.percent)}
              </strong>
              {metric.percent && (
                <div className="comparison-track">
                  <i style={{ width: `${metric.before * 100}%` }} />
                  <b style={{ width: `${metric.after * 100}%` }} />
                </div>
              )}
            </article>
          ))}
      </div>
    </div>
  );
}
