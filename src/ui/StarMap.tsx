import { useState } from 'react';
import { PHASE_NAMES } from '../engine/flavor';
import { riskBreakdown } from '../engine/hazard';
import type { Params } from '../engine/params';
import type { Event, State, TargetEffect, World } from '../engine/types';
const pct = (v: number) => `${Math.round(v * 100)}%`;
export function riskColor(p: number, phase: number): string {
  return phase === 3
    ? '#627184'
    : p < 0.22
      ? '#7cbaad'
      : p < 0.45
        ? '#d4bd80'
        : p < 0.7
          ? '#d88e63'
          : '#df626b';
}
interface Props {
  world: World;
  state: State;
  params: Params;
  probabilities: number[] | undefined;
  selected: number | undefined;
  targeting: boolean;
  targetEffects: TargetEffect[] | undefined;
  onSelect: (i: number) => void;
  events: Event[];
  revealing: boolean;
}
export default function StarMap({
  world,
  state,
  params,
  probabilities,
  selected,
  targeting,
  targetEffects,
  onSelect,
  events,
  revealing,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? selected ?? world.capital;
  const changed = new Set(events.map((e) => e.sector));
  const changedEvents = new Map(events.map((e) => [e.sector, e]));
  const pos = (i: number) => [370 + world.x[i] * 282, 312 + world.y[i] * 252];
  const effects = new Map(targetEffects?.map((e) => [e.target, e.crisisDelta]) ?? []);
  const breakdown = riskBreakdown(world, state, focus, params);
  return (
    <section className="panel map-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">银河态势</div>
          <h2>{targeting ? '选择干预星区' : '帝国，仍有群星'}</h2>
        </div>
        <span className="live-label">
          <i />
          {revealing ? '历史正在展开' : '预测已同步'}
        </span>
      </div>
      <div className="map-wrap">
        <svg
          viewBox="0 0 740 630"
          className={`star-map ${targeting ? 'targeting' : ''}`}
          role="group"
          aria-label="银河星区图，点击星区查看详情或选为卡牌目标"
        >
          <defs>
            <radialGradient id="galaxy-glow">
              <stop stopColor="#315c60" stopOpacity=".24" />
              <stop offset=".58" stopColor="#172d3b" stopOpacity=".12" />
              <stop offset="1" stopColor="#0c141d" stopOpacity="0" />
            </radialGradient>
            <filter id="star-glow">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <ellipse cx="370" cy="312" rx="305" ry="275" fill="url(#galaxy-glow)" />
          {[90, 180, 270].map((r) => (
            <ellipse
              key={r}
              cx="370"
              cy="312"
              rx={r}
              ry={r * 0.89}
              fill="none"
              stroke="#273443"
              strokeDasharray="3 9"
              opacity=".6"
            />
          ))}
          <path d="M55 312H685 M370 35V589" stroke="#22313e" strokeDasharray="2 8" />
          <text x="65" y="603" className="map-caption">
            银河标准坐标 / 川陀中心
          </text>
          <text x="675" y="45" textAnchor="end" className="map-caption">
            {world.n} 个星区
          </text>
          {world.edges.map(([a, b]) => {
            const p = pos(a),
              q = pos(b);
            const lit = selected === a || selected === b;
            return (
              <line
                key={`${a}-${b}`}
                x1={p[0]}
                y1={p[1]}
                x2={q[0]}
                y2={q[1]}
                stroke={lit ? '#bda571' : '#385264'}
                strokeWidth={lit ? 1.3 : 0.8}
                opacity={lit ? 0.75 : 0.35}
              />
            );
          })}
          {Array.from({ length: world.n }, (_, i) => {
            const [x, y] = pos(i),
              p = probabilities?.[i] ?? 0,
              delta = targeting ? effects.get(i) : undefined,
              color =
                state.phase[i] === 3
                  ? '#627184'
                  : delta !== undefined
                    ? delta < -0.03
                      ? '#7cbaad'
                      : delta > 0.01
                        ? '#df626b'
                        : '#9ba9b7'
                    : riskColor(p, state.phase[i]);
            const special = i === world.capital || i === world.terminus;
            const isSelected = selected === i;
            const changedEvent = changedEvents.get(i);
            return (
              <g
                key={i}
                transform={`translate(${x} ${y})`}
                role="button"
                tabIndex={0}
                aria-label={`${world.names[i]}，${PHASE_NAMES[state.phase[i]]}${probabilities ? `，危机概率 ${pct(p)}` : ''}${delta !== undefined ? `，干预危机变化 ${delta.toFixed(2)}` : ''}`}
                aria-pressed={isSelected}
                className={`sector ${revealing && changed.has(i) ? 'event-pulse' : ''} ${state.phase[i] === 3 ? 'independent' : ''}`}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(i);
                  }
                }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <title>
                  {world.names[i]} · {PHASE_NAMES[state.phase[i]]} · 下回合危机概率{' '}
                  {probabilities ? pct(p) : '计算中'}
                </title>
                <circle r="16" fill="transparent" />
                {revealing && changedEvent && (
                  <circle
                    className={`history-wave phase-${changedEvent.to}`}
                    r="12"
                    fill="none"
                    stroke={
                      changedEvent.to === 0
                        ? '#9ce8c9'
                        : changedEvent.to === 3
                          ? '#ee6576'
                          : '#e9bb72'
                    }
                    strokeWidth="1.6"
                  />
                )}
                {(special || isSelected) && (
                  <circle
                    r={isSelected ? 15 : 10}
                    fill="none"
                    stroke={isSelected ? '#e1c48d' : color}
                    opacity={isSelected ? 1 : 0.55}
                    strokeDasharray={isSelected ? undefined : '2 3'}
                  />
                )}
                <circle r={special ? 7 : 5} fill={color} opacity=".24" filter="url(#star-glow)" />
                {state.phase[i] === 3 ? (
                  <path d="M-4-4L4 4M4-4L-4 4" stroke={color} strokeWidth="1.7" />
                ) : (
                  <circle r={special ? 4.5 : 3.1} fill={color} />
                )}
                {(special || isSelected || hover === i) && (
                  <text
                    x="13"
                    y="5"
                    fill={isSelected ? '#e1c48d' : '#bac6d1'}
                    className="sector-label"
                  >
                    {world.names[i]}
                    {i === world.capital ? ' / 首都' : i === world.terminus ? ' / 基地' : ''}
                  </text>
                )}
                {revealing && changedEvent && (special || events.indexOf(changedEvent) < 5) && (
                  <text
                    className="map-change-label"
                    x="10"
                    y="-14"
                    fill={
                      changedEvent.to === 0
                        ? '#9ce8c9'
                        : changedEvent.to === 3
                          ? '#ee6576'
                          : '#e9bb72'
                    }
                  >
                    {changedEvent.to === 0
                      ? '恢复秩序'
                      : changedEvent.to === 3
                        ? '脱离帝国'
                        : PHASE_NAMES[changedEvent.to]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="map-legend">
        {targeting && targetEffects ? (
          <>
            <span>此卡在各目标的下一步危机变化估算</span>
            <span className="mint">降低</span>
            <span>近似不变</span>
            <span className="rose">增加</span>
          </>
        ) : (
          <>
            <span>下回合活跃危机概率</span>
            <span>
              <i style={{ background: '#7cbaad' }} />低
            </span>
            <span>
              <i style={{ background: '#d4bd80' }} />中
            </span>
            <span>
              <i style={{ background: '#df626b' }} />高
            </span>
          </>
        )}
        <span>
          <i className="cross">×</i>已独立
        </span>
      </div>
      {targeting && (
        <p className="heatmap-note">
          共同冲击固定为 0 的单步模型估算。终局得分、稳定和财政代价请看卡面与选定行动；
          {effects.has(focus)
            ? `此处危机变化 ${effects.get(focus)!.toFixed(2)}。`
            : '热力图计算中。'}
        </p>
      )}
      <div className="sector-details">
        <div>
          <b>{world.names[focus]}</b>
          <span className={`state-tag phase-${state.phase[focus]}`}>
            {PHASE_NAMES[state.phase[focus]]}
          </span>
        </div>
        <p className="sector-explainer">
          当前星区条件：繁荣低会让生活困难；精英过剩与派系化高会加剧权力争夺；合法性低意味着居民不再信任帝国。
        </p>
        <dl>
          <div>
            <dt>危机概率</dt>
            <dd>{probabilities ? pct(probabilities[focus]) : '—'}</dd>
          </div>
          <div>
            <dt>繁荣</dt>
            <dd>{pct(state.prosperity[focus])}</dd>
          </div>
          <div>
            <dt>精英过剩</dt>
            <dd>{pct(state.elites[focus])}</dd>
          </div>
          <div>
            <dt>合法性</dt>
            <dd>{pct(state.legitimacy[focus])}</dd>
          </div>
          <div>
            <dt>派系化</dt>
            <dd>{pct(state.faction[focus])}</dd>
          </div>
          <div>
            <dt>政体开放度</dt>
            <dd>{pct(state.openness[focus])}</dd>
          </div>
          <div>
            <dt>人口压力</dt>
            <dd>{pct(state.pressure[focus])}</dd>
          </div>
          <div>
            <dt>宗教影响</dt>
            <dd>{pct(state.religion[focus])}</dd>
          </div>
        </dl>
      </div>
      <details className="risk-breakdown" open>
        <summary>为什么这里有风险？</summary>
        <h3>{breakdown.title}</h3>
        <ul>
          {breakdown.terms.map((term) => (
            <li key={term.label} title={term.hint}>
              <span>{term.label}</span>
              <div
                className="risk-track"
                role="img"
                aria-label={`${term.label}对数风险贡献 ${term.value.toFixed(2)}`}
              >
                <i
                  className={term.value < 0 ? 'risk-negative' : 'risk-positive'}
                  style={{ width: `${Math.min(50, (Math.abs(term.value) / 3) * 50)}%` }}
                />
              </div>
              <b className={term.value < 0 ? 'mint' : 'gold'}>
                {term.value >= 0 ? '+' : ''}
                {term.value.toFixed(2)}
              </b>
            </li>
          ))}
        </ul>
        <p>
          条形是对数风险的增减贡献，不是概率份额；绿色降低、金色增加。未包含基线常数和未来冲击。人口压力、宗教通过繁荣、精英和合法性逐步生效。
        </p>
      </details>
    </section>
  );
}
