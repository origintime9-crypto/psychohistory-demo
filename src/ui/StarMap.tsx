import { useEffect, useMemo, useRef, useState } from 'react';
import { describeEvent, PHASE_NAMES } from '../engine/flavor';
import { riskBreakdown, transitionProbabilities } from '../engine/hazard';
import { TOTAL_TURNS, type Params } from '../engine/params';
import { storyEvent } from '../engine/story';
import {
  counts,
  type Action,
  type Event,
  type Reveal,
  type State,
  type TargetEffect,
  type World,
} from '../engine/types';
import GalaxyScene, { type GalaxyHandle, type SceneSector } from './GalaxyScene';
import GalaxyEventFeed from './GalaxyEventFeed';
import { galaxyArchive, sectorRecords, storyTone } from './galaxyArchive';
const pct = (v: number) => `${Math.round(v * 100)}%`;
export function riskColor(p: number, phase: number): string {
  return phase === 3
    ? '#8393ac'
    : p < 0.22
      ? '#7daed5'
      : p < 0.45
        ? '#d4bd80'
        : p < 0.7
          ? '#e69f72'
          : '#f0798b';
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
  actions: Action[];
  reveals: Reveal[];
  focusRequest?: number;
}
export default function StarMap(props: Props) {
  const {
    world,
    state: liveState,
    params,
    selected,
    targeting,
    targetEffects,
    onSelect,
    actions,
    reveals,
  } = props;
  const scene = useRef<GalaxyHandle>(null);
  const panel = useRef<HTMLElement>(null);
  const [archiveTurn, setArchiveTurn] = useState<number | null>(null);
  const [inspected, setInspected] = useState<number | undefined>(selected);
  const [network, setNetwork] = useState(true);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [feedOpen, setFeedOpen] = useState(() => window.innerWidth > 1000);
  const [fullscreen, setFullscreen] = useState(false);
  const [viewError, setViewError] = useState('');
  const frames = useMemo(() => galaxyArchive(world, params, actions), [world, params, actions]);
  const turn = archiveTurn ?? liveState.turn;
  const archived = turn < liveState.turn;
  const frame = frames[turn];
  const state = archived ? frame.state : liveState;
  const events = archived ? frame.events : props.events;
  const currentDispatch = useMemo(() => storyEvent(world, state, params), [world, state, params]);
  const focus = inspected ?? world.capital;
  const effects = useMemo(
    () => new Map(targetEffects?.map((e) => [e.target, e.crisisDelta]) ?? []),
    [targetEffects],
  );
  const records = useMemo(
    () => sectorRecords(world, frames, focus, turn),
    [world, frames, focus, turn],
  );
  const breakdown = riskBreakdown(world, state, focus, params);
  const c = counts(state);
  const chances = transitionProbabilities(world, state, focus, 0, params);
  const probability =
    !archived && props.probabilities ? props.probabilities[focus] : chances[1] + chances[2];
  const changed = new Map(events.map((e) => [e.sector, e]));
  const sectors: SceneSector[] = Array.from({ length: world.n }, (_, i) => {
    const chance = transitionProbabilities(world, state, i, 0, params);
    const p = !archived && props.probabilities ? props.probabilities[i] : chance[1] + chance[2];
    const delta = !archived && targeting ? effects.get(i) : undefined;
    const color =
      delta === undefined
        ? riskColor(p, state.phase[i])
        : delta < -0.03
          ? '#81d6bd'
          : delta > 0.01
            ? '#f0798b'
            : '#a3b4c8';
    const event = changed.get(i);
    return {
      color,
      label: world.names[i],
      phase: state.phase[i],
      status: `${PHASE_NAMES[state.phase[i]]} · ${pct(p)}`,
      event:
        currentDispatch?.target === i
          ? storyTone(currentDispatch)
          : event
            ? event.to === 0
              ? 'science'
              : 'crisis'
            : undefined,
    };
  });
  useEffect(() => {
    if (selected !== undefined) setInspected(selected);
  }, [selected, props.focusRequest]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === panel.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    setArchiveTurn(null);
    setPlaying(false);
  }, [liveState.turn]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setArchiveTurn((value) => {
          const next = (value ?? 0) + 1;
          if (next >= liveState.turn) {
            setPlaying(false);
            return null;
          }
          return next;
        }),
      1300,
    );
    return () => clearInterval(timer);
  }, [playing, liveState.turn]);
  const inspect = (i: number) => {
    setInspected(i);
    setFeedOpen(false);
    setSearchOpen(false);
    if (!archived) onSelect(i);
  };
  const reset = () => {
    setInspected(undefined);
    scene.current?.reset();
  };
  const timeline = (value: number) => {
    setPlaying(false);
    setArchiveTurn(value === liveState.turn ? null : value);
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === panel.current) await document.exitFullscreen();
      else await panel.current?.requestFullscreen();
      setViewError('');
    } catch {
      setViewError('浏览器暂不支持全屏，可以继续在当前星图探索。');
    }
  };
  const search = world.names
    .map((name, i) => ({ name, i }))
    .filter(({ name }) => name.includes(query.trim()));
  return (
    <section
      ref={panel}
      className={`panel map-panel galaxy-panel ${inspected !== undefined ? 'has-drawer' : ''}`}
      aria-label="银河探索控制台"
    >
      <div className="panel-heading galaxy-heading">
        <div>
          <div className="eyebrow">GALACTIC ATLAS / 银河全息星图</div>
          <h2>
            {archived
              ? '回望已经发生的历史'
              : targeting
                ? '选择你的干预坐标'
                : '群星之中，寻找文明的下一步'}
          </h2>
        </div>
        <div className="galaxy-view-actions">
          <button type="button" aria-expanded={feedOpen} onClick={() => setFeedOpen(!feedOpen)}>
            {feedOpen ? '收起事件流' : '事件流'}
          </button>
          {document.fullscreenEnabled && (
            <button type="button" onClick={toggleFullscreen}>
              {fullscreen ? '退出沉浸星图' : '沉浸星图 ⤢'}
            </button>
          )}
          <span className="live-label">
            <i />
            {archived
              ? `档案 · ${12067 + turn * 10}`
              : props.revealing
                ? '历史正在展开'
                : '实时推演'}
          </span>
        </div>
      </div>
      {viewError && (
        <p className="galaxy-view-error" role="status">
          {viewError}
        </p>
      )}
      <div className="galaxy-stage">
        <GalaxyScene
          ref={scene}
          world={world}
          sectors={sectors}
          selected={inspected}
          network={network}
          onSelect={inspect}
        />
        <div className="galaxy-tools">
          <button
            type="button"
            onClick={() => scene.current?.zoom(0.8)}
            aria-label="放大星图"
            title="放大星图"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => scene.current?.zoom(1.25)}
            aria-label="缩小星图"
            title="缩小星图"
          >
            −
          </button>
          <button type="button" onClick={reset} aria-label="返回银河全景" title="返回银河全景">
            ⌖
          </button>
          <button
            type="button"
            onClick={() => setNetwork(!network)}
            aria-pressed={network}
            aria-label="切换星区联系线"
            title="星区联系线"
          >
            ⌁
          </button>
        </div>
        <div className="galaxy-search">
          <label htmlFor="sector-search">
            <span>⌕</span>
            <input
              id="sector-search"
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              placeholder="定位星区…"
              aria-label="搜索银河星区"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchOpen(false);
                if (e.key === 'Enter' && search[0]) inspect(search[0].i);
              }}
            />
          </label>
          {searchOpen && (
            <div className="sector-search-results">
              <button className="search-close" onClick={() => setSearchOpen(false)}>
                收起列表 ×
              </button>
              {search.length ? (
                search.map(({ name, i }) => (
                  <button key={i} type="button" onClick={() => inspect(i)}>
                    <b>{name}</b>
                    <span>{PHASE_NAMES[state.phase[i]]}</span>
                  </button>
                ))
              ) : (
                <p>没有找到这个星区</p>
              )}
            </div>
          )}
        </div>
        <div className="galaxy-readout" aria-hidden="true">
          <span>银河纪元</span>
          <strong>
            {12067 + turn * 10}
            <i>GE</i>
          </strong>
          <small>
            {c.stable} 稳定 / {c.crisis} 危机 / {c.independent} 独立
          </small>
        </div>
        {feedOpen && (
          <GalaxyEventFeed
            world={world}
            frames={frames}
            turn={turn}
            dispatch={archived ? null : currentDispatch}
            onClose={() => setFeedOpen(false)}
            onLocate={(sector, recordTurn) => {
              timeline(recordTurn ?? liveState.turn);
              setInspected(sector);
              setSearchOpen(false);
              setFeedOpen(false);
            }}
          />
        )}
        <div className="galaxy-coordinate" aria-hidden="true">
          TRANTOR ORIGIN · {world.n} SECTORS
          <br />
          {network ? 'NEIGHBOR NETWORK / 邻区作用通道' : 'DEEP SPACE / 深空模式'}
        </div>
        {inspected === undefined && (
          <div className="galaxy-hint">
            <span>✧</span>
            <div>
              点击一颗星，打开它的历史<small>拖动旋转 · 滚轮缩放 · 右键平移 · 双指操作</small>
            </div>
          </div>
        )}
        {archived && (
          <div className="archive-badge">
            历史回看 · 第 {turn} 回合{' '}
            <button onClick={() => timeline(liveState.turn)}>返回当前 →</button>
          </div>
        )}
        {inspected !== undefined && (
          <aside
            className="planet-drawer"
            aria-label={`${world.names[focus]}星区档案`}
            onKeyDown={(e) => {
              if (e.key === 'Escape') reset();
            }}
          >
            <header>
              <div>
                <span className="eyebrow">SECTOR ARCHIVE / 星区档案</span>
                <h3>{world.names[focus]}</h3>
              </div>
              <button type="button" onClick={reset} aria-label="关闭星区档案">
                ×
              </button>
            </header>
            <div className="planet-profile">
              <div
                className={`holo-planet phase-${state.phase[focus]}`}
                style={{ '--planet-color': sectors[focus].color } as React.CSSProperties}
              >
                <i />
              </div>
              <div>
                <span className={`state-tag phase-${state.phase[focus]}`}>
                  {PHASE_NAMES[state.phase[focus]]}
                  {focus === world.capital
                    ? ' · 帝国首都'
                    : focus === world.terminus
                      ? ' · 基地'
                      : ' · 边疆星域'}
                </span>
                <small>
                  X {world.x[focus].toFixed(3)} / Z {world.y[focus].toFixed(3)}
                </small>
                <small>
                  人口权重 {pct(world.weights[focus])} · {world.neighbors[focus].length} 个邻区
                </small>
              </div>
            </div>
            <div className="planet-risk">
              <span>{archived || !props.probabilities ? '单步危机估算' : '下回合危机概率'}</span>
              <strong style={{ color: sectors[focus].color }}>{pct(probability)}</strong>
              <i
                style={
                  {
                    '--risk-width': pct(probability),
                    '--star-color': sectors[focus].color,
                  } as React.CSSProperties
                }
              />
              <small>
                {archived || !props.probabilities
                  ? '共同冲击设为零；与完整蒙特卡洛预测不同。'
                  : '动荡或叛乱的概率；并非确定会发生。'}
              </small>
            </div>
            <div className="planet-countdown">
              <span>下一次历史揭晓</span>
              <b>{turn >= TOTAL_TURNS ? '推演结束' : `${12067 + (turn + 1) * 10} GE / 十年后`}</b>
            </div>
            {targeting && !archived && (
              <div className="planet-target">
                {state.phase[focus] === 3
                  ? '已独立星区不能接受定向干预。'
                  : selected !== focus
                    ? '你正在查看这个星区。选择为目标后，干预预览才会更新。'
                    : effects.has(focus)
                      ? `此卡的危机变化估算 ${effects.get(focus)!.toFixed(2)}。目标已选定，请在下方确认命令。`
                      : '目标已选定，干预效果计算中。'}
                {state.phase[focus] !== 3 && selected !== focus && (
                  <button type="button" onClick={() => onSelect(focus)}>
                    选为当前干预目标 →
                  </button>
                )}
              </div>
            )}
            <dl className="planet-metrics">
              {(
                [
                  ['繁荣', state.prosperity[focus]],
                  ['合法性', state.legitimacy[focus]],
                  ['人口压力', state.pressure[focus]],
                  ['精英过剩', state.elites[focus]],
                  ['派系化', state.faction[focus]],
                  ['教育', state.education[focus]],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{pct(value)}</dd>
                </div>
              ))}
            </dl>
            <details className="planet-model">
              <summary>历史分叉 · 单步转移概率</summary>
              <div>
                {chances.map((p, i) => (
                  <div key={i}>
                    <span>{PHASE_NAMES[i]}</span>
                    <i style={{ width: pct(p) }} />
                    <b>{pct(p)}</b>
                  </div>
                ))}
              </div>
              <p>当前条件、共同冲击为零的模型估算，不是谢顿危机倒计时。</p>
            </details>
            <details className="planet-model">
              <summary>{breakdown.title}</summary>
              <div>
                {breakdown.terms.map((term) => (
                  <div key={term.label} title={term.hint}>
                    <span>{term.label}</span>
                    <b className={term.value < 0 ? 'mint' : 'gold'}>
                      {term.value >= 0 ? '+' : ''}
                      {term.value.toFixed(2)}
                    </b>
                  </div>
                ))}
              </div>
              <p>对数风险贡献，不是概率份额。人口与宗教会通过繁荣、精英与合法性逐步生效。</p>
            </details>
            <section className="planet-history">
              <h4>
                历史回声 <span>{records.length.toString().padStart(2, '0')}</span>
              </h4>
              {currentDispatch?.target === focus && !archived && (
                <details className="planet-record tone-politics" open>
                  <summary>
                    <small>当前急电 · {12067 + turn * 10} GE</small>
                    <b>{currentDispatch.title}</b>
                  </summary>
                  <p>{currentDispatch.body}</p>
                  <small>{currentDispatch.why}</small>
                </details>
              )}
              {records.map((record, i) => (
                <details
                  className={`planet-record tone-${record.tone}`}
                  key={`${record.turn}-${i}`}
                  open={i === 0}
                >
                  <summary>
                    <small>{12067 + record.turn * 10} GE</small>
                    <b>{record.title}</b>
                  </summary>
                  <p>{record.text}</p>
                  {record.source && <em className="dispatch-origin">{record.source}</em>}
                  <small>{record.context}</small>
                  <button type="button" onClick={() => timeline(record.turn)}>
                    定位此刻 →
                  </button>
                </details>
              ))}
            </section>
            <div className="planet-neighbors">
              <h4>相邻星域</h4>
              {world.neighbors[focus].map((i) => (
                <button key={i} onClick={() => inspect(i)}>
                  {world.names[i]} <span>{PHASE_NAMES[state.phase[i]]} ↗</span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
      <div className="galaxy-legend">
        <span>
          <i style={{ background: '#7daed5' }} />
          低危机
        </span>
        <span>
          <i style={{ background: '#d4bd80' }} />
          中危机
        </span>
        <span>
          <i style={{ background: '#f0798b' }} />
          高危机
        </span>
        <span>
          <i style={{ background: '#8393ac' }} />
          已独立
        </span>
        <span className="legend-caption">
          {targeting && !archived
            ? '星球颜色表示此卡的危机变化：绿降低、红增加。'
            : '光环：蓝 恢复 / 红 危机 / 金 急电'}
        </span>
      </div>
      <div className="era-timeline">
        <div className="era-top">
          <span>
            银河历史 <small>{archived ? '档案回看' : '当前位置'}</small>
          </span>
          <b>
            {12067 + turn * 10} <small>GE</small>
          </b>
          <div>
            <button
              type="button"
              disabled={!liveState.turn}
              aria-label={playing ? '暂停历史播放' : '播放已有历史'}
              onClick={() => {
                if (playing) setPlaying(false);
                else {
                  setArchiveTurn(0);
                  setPlaying(true);
                }
              }}
            >
              {playing ? 'Ⅱ' : '▷'}
            </button>
            <button type="button" onClick={() => timeline(liveState.turn)} disabled={!archived}>
              回到现在 ↗
            </button>
          </div>
        </div>
        <input
          type="range"
          min="0"
          max={liveState.turn || 1}
          step="1"
          value={turn}
          disabled={!liveState.turn}
          aria-label="银河纪元历史滑块"
          aria-valuetext={`${12067 + turn * 10} 年，第 ${turn} 回合`}
          onChange={(e) => timeline(Number(e.target.value))}
        />
        <div className="era-ticks">
          <span>12067 · 谢顿计划启动</span>
          <span>
            {liveState.turn
              ? `${12067 + liveState.turn * 10} · 已记录 ${liveState.turn * 10} 年`
              : '推进首个回合后解锁历史回看'}
          </span>
        </div>
        {reveals.length > 0 && (
          <svg
            viewBox="0 0 1000 55"
            preserveAspectRatio="none"
            className="era-deviation"
            role="img"
            aria-label="帝国危机数：实际与事前预测的偏离曲线"
          >
            <title>每个已完成回合的实际危机数（实线）与事前期望（虚线）</title>
            <polyline
              fill="none"
              stroke="#689baa"
              strokeWidth="1.5"
              strokeDasharray="5 5"
              points={
                '0,50 ' +
                reveals
                  .map(
                    (r, i) => `${((i + 1) / liveState.turn) * 990},${50 - (r.mean / world.n) * 45}`,
                  )
                  .join(' ')
              }
            />
            <polyline
              fill="none"
              stroke="#d9b785"
              strokeWidth="2"
              points={
                '0,50 ' +
                reveals
                  .map(
                    (r, i) =>
                      `${((i + 1) / liveState.turn) * 990},${50 - (r.actual / world.n) * 45}`,
                  )
                  .join(' ')
              }
            />
            {reveals.map((r, i) => (
              <circle
                key={r.turn}
                cx={((i + 1) / liveState.turn) * 990}
                cy={50 - (r.actual / world.n) * 45}
                r="3"
                fill={r.covered ? '#d9b785' : '#f0798b'}
              />
            ))}
          </svg>
        )}
        {reveals.length > 0 && (
          <small className="era-chart-caption">
            实线：实际危机数 / 虚线：事前期望 / 红点：超出 90% 预测区间
          </small>
        )}
      </div>
      {events.length > 0 && (
        <div className="galaxy-event-feed" aria-live="polite">
          <span>本纪元事件</span>
          {events.slice(0, 4).map((e) => (
            <button
              key={e.sector}
              onClick={() => inspect(e.sector)}
              title={describeEvent(world, e)}
            >
              {world.names[e.sector]} · {PHASE_NAMES[e.to]} ↗
            </button>
          ))}
          {events.length > 4 && <small>另有 {events.length - 4} 个变动</small>}
        </div>
      )}
    </section>
  );
}
