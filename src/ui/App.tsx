import { useMemo, useRef, useState } from 'react';
import { CARDS } from '../engine/cards';
import { step } from '../engine/dynamics';
import { describeEvent, turnHeadline } from '../engine/flavor';
import { revealForecast } from '../engine/forecast';
import { DEFAULT_PARAMS, TOTAL_TURNS, type Params } from '../engine/params';
import { Rng, stream } from '../engine/rng';
import { counts, type Action, type Event, type ForecastResult, type HistoryPoint, type Observation, type Reveal, type State, type World } from '../engine/types';
import { generateWorld, initialState } from '../engine/worldgen';
import CardHand from './CardHand';
import EndScreen from './EndScreen';
import EventLog, { type LogEntry } from './EventLog';
import ForecastPanel from './ForecastPanel';
import LawOfLargeNumbers from './LawOfLargeNumbers';
import SetupScreen from './SetupScreen';
import StarMap from './StarMap';
import { useForecast } from './useForecast';
const percent = (v: number) => `${Math.round(v * 100)}%`;
export default function App() {
  const [world, setWorld] = useState<World | null>(null), [state, setState] = useState<State | null>(null);
  const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS }), [action, setAction] = useState<Action>({ card: 'noop' });
  const [sector, setSector] = useState<number | undefined>(), [view, setView] = useState<'empire' | 'law'>('empire');
  const [history, setHistory] = useState<HistoryPoint[]>([]), [reveals, setReveals] = useState<Reveal[]>([]), [observations, setObservations] = useState<Observation[]>([]), [logs, setLogs] = useState<LogEntry[]>([]);
  const [events, setEvents] = useState<Event[]>([]), [revealing, setRevealing] = useState(false), [reveal, setReveal] = useState<Reveal | null>(null), [revealedForecast, setRevealedForecast] = useState<ForecastResult | null>(null);
  const [ended, setEnded] = useState(false), [contagion, setContagion] = useState(true), [shock, setShock] = useState(true), [setupError, setSetupError] = useState<string | null>(null);
  const [finalContext, setFinalContext] = useState<{ state: State; action: Action } | null>(null);
  const [actionHistory, setActionHistory] = useState<Action[]>([]);
  const reality = useRef<Rng | null>(null), calibration = useRef<Rng | null>(null); const guard = useRef(false); const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contrastParams = useMemo(() => ({ ...params, contagion, commonShock: shock, fiscalFeedback: contagion || shock }), [params, contagion, shock]);
  const prediction = useForecast(world, state?.turn === TOTAL_TURNS && finalContext ? finalContext.state : state, state?.turn === TOTAL_TURNS && finalContext ? finalContext.action : action, params, contrastParams);
  const start = (seed: string, n: number, mule: boolean) => {
    try {
      const w = generateWorld(seed, { n }); if (animationTimer.current) clearTimeout(animationTimer.current);
      setWorld(w); setState(initialState(w)); setParams({ ...DEFAULT_PARAMS, mule }); reality.current = stream(seed, 'reality'); calibration.current = stream(seed, 'calibration');
      setHistory([]); setReveals([]); setObservations([]); setLogs([]); setEvents([]); setSector(undefined); setAction({ card: 'noop' }); setView('empire'); setReveal(null); setRevealedForecast(null); setRevealing(false); setEnded(false); setFinalContext(null); setActionHistory([]); setContagion(true); setShock(true); setSetupError(null); guard.current = false;
    } catch (e) { setSetupError(e instanceof Error ? e.message : String(e)); }
  };
  if (!world || !state) return <>{setupError && <div className="error-banner">{setupError}</div>}<SetupScreen onStart={start} /></>;
  const c = counts(state), finished = state.turn >= TOTAL_TURNS;
  const selectAction = (next: Action) => { if (guard.current || finished) return; setAction(next); setReveal(null); setRevealedForecast(null); if (CARDS[next.card].targeted && next.target === undefined) document.querySelector('.map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const selectSector = (i: number) => { setSector(i); if (CARDS[action.card].targeted && state.phase[i] !== 3) selectAction({ ...action, target: i }); };
  const advance = () => {
    const f = prediction.active; if (!f || prediction.previewBusy || prediction.baselineBusy || guard.current || finished) return;
    guard.current = true;
    try {
      const result = step(world, state, action, reality.current!, params), next = result.state, c = counts(next);
      setActionHistory(prev => [...prev, { ...action }]);
      if (next.turn === TOTAL_TURNS) setFinalContext({ state, action });
      const r = revealForecast(f, c.crisis, next.turn, calibration.current!);
      setRevealedForecast(f); setReveal(r); setReveals(prev => [...prev, r]);
      setObservations(prev => [...prev, ...f.probabilities.map((probability, i) => ({ probability, outcome: next.phase[i] === 1 || next.phase[i] === 2 ? 1 : 0 }))]);
      setHistory(prev => [...prev, { turn: next.turn, crisis: c.crisis, stable: c.stable / world.n, independent: c.independent / world.n, foundation: next.foundation }]);
      const newLogs: LogEntry[] = [{ turn: next.turn, text: `${CARDS[action.card].name}${action.target !== undefined && CARDS[action.card].targeted ? ` · ${world.names[action.target]}` : ''}。${turnHeadline(next.turn, c.independent, world.n)}` }];
      if (params.mule && state.turn === 9) newLogs.push({ turn: next.turn, text: '“骡”出现了。一次共同冲击同时改变了许多世界的风险。', tone: 'warn' });
      if (result.shock > .65) newLogs.push({ turn: next.turn, text: '继位危机震动川陀，所有星区面临共同压力。', tone: 'warn' });
      if (result.reformFailed) newLogs.push({ turn: next.turn, text: '行政改革失败。被排除的精英形成新的派系。', tone: 'warn' });
      for (const e of result.events) newLogs.push({ turn: next.turn, text: describeEvent(world, e), tone: e.to === 3 || e.to === 2 ? 'warn' : e.to === 0 ? 'good' : 'normal' });
      if (!result.events.length) newLogs.push({ turn: next.turn, text: '这十年没有星区改变状态。暗流仍在积累。' });
      setLogs(prev => [...prev, ...newLogs]); setEvents(result.events); setRevealing(true); setState(next); setAction({ card: 'noop' });
      animationTimer.current = setTimeout(() => { setRevealing(false); guard.current = false; if (next.turn === TOTAL_TURNS) setEnded(true); }, 600);
    } catch (e) { guard.current = false; setLogs(prev => [...prev, { turn: state.turn, text: e instanceof Error ? e.message : String(e), tone: 'warn' }]); }
  };
  if (ended) return <EndScreen world={world} state={state} history={history} reveals={reveals} observations={observations} actions={actionHistory} params={params} onRestart={() => { setWorld(null); setState(null); }} onReview={() => { setEnded(false); setView('law'); }} />;
  const displayForecast = reveal ? revealedForecast : prediction.active ?? prediction.baseline;
  return <div className="app-shell">
    <header className="app-header"><div className="brand"><span>✧</span><div><b>心理史学</b><small>谢顿计划 / 银河推演</small></div></div><nav aria-label="主视图"><button className={view === 'empire' ? 'active' : ''} onClick={() => setView('empire')}>帝国态势</button><button className={view === 'law' ? 'active' : ''} onClick={() => setView('law')}>大数定律</button></nav><div className="header-right"><span className="world-seed" title={`世界种子 ${world.seed}`}>{world.seed}</span><button className="text-button" onClick={() => { if (animationTimer.current) clearTimeout(animationTimer.current); setWorld(null); setState(null); guard.current = false; }}>新推演 ↗</button></div></header>
    <main className="dashboard"><div className="turn-heading"><div><div className="eyebrow">银河纪元 {12067 + state.turn * 10} · {world.n} 个星区</div><h1>{finished ? '一百八十年，已成为历史。' : '个体的命运未知。群星的趋势可见。'}</h1></div><div className="turn-counter"><span>第 <b>{Math.min(state.turn + 1, 18).toString().padStart(2, '0')}</b> / 18 回合</span><small>{finished ? '推演完成' : `已过去 ${state.turn * 10} 年`}</small></div></div>
      <div className="stats-strip"><div><span>稳定星区</span><b className="mint">{c.stable}<small> / {world.n}</small></b><em>{percent(c.stable / world.n)}</em></div><div><span>活跃危机</span><b className="rose">{c.crisis}<small> 星区</small></b><em>动荡 {c.unrest} · 叛乱 {c.rebellion}</em></div><div><span>已独立</span><b>{c.independent}<small> 星区</small></b><em>不可逆</em></div><div><span>国库 / 治理</span><b>{percent(state.treasury)}<small> / {percent(state.governance)}</small></b><em>税率 {percent(state.tax)}</em></div><div><span>基地进度</span><b className="gold">{percent(state.foundation)}</b><div className="tiny-progress"><i style={{ width: percent(state.foundation) }} /></div></div><div className="influence-stat"><span>你的影响力</span><b>{state.influence}<small> / 8</small></b><div className="influence-dots">{Array.from({ length: 8 }, (_, i) => <i className={i < state.influence ? 'filled' : ''} key={i} />)}</div></div></div>
      {prediction.error && <div className="error-banner">预测暂不可用：{prediction.error}</div>}
      {view === 'empire' ? <><div className="empire-grid"><StarMap world={world} state={state} probabilities={(prediction.active ?? prediction.baseline)?.probabilities} selected={sector} targeting={CARDS[action.card].targeted && !finished} onSelect={selectSector} events={events} revealing={revealing} /><ForecastPanel forecast={displayForecast} history={history} turn={reveal ? reveal.turn - 1 : state.turn} reveal={reveal} /></div>
        {reveal && <div className="reveal-banner" aria-live="polite"><span className="gold">第 {reveal.turn * 10} 年已揭晓</span><span>实际 {reveal.actual} 个危机星区，预测区间 {reveal.lo90}–{reveal.hi90}。</span><button className="text-button" onClick={() => { setReveal(null); setRevealedForecast(null); }}>查看下一回合预测 →</button></div>}
        {!finished ? <CardHand world={world} state={state} action={action} onSelect={selectAction} comparison={prediction.comparison} busy={prediction.previewBusy || prediction.baselineBusy || revealing} ready={!!prediction.active && !revealing} elapsed={prediction.elapsed} error={prediction.error} onAdvance={advance} selectedSector={sector} /> : <div className="finished-bar"><span>180 年推演完成，基地与帝国的历史已保存于本次会话。</span><button className="primary" onClick={() => setEnded(true)}>查看终局报告 →</button></div>}
        <EventLog entries={logs} reveals={reveals} /></> : <LawOfLargeNumbers forecast={prediction.baseline ?? revealedForecast} contrast={prediction.contrast} contrastBusy={prediction.contrastBusy} contagion={contagion} shock={shock} onToggle={(channel, value) => channel === 'contagion' ? setContagion(value) : setShock(value)} observations={observations} reveals={reveals} />}
      <footer className="app-footer"><span>心理史学实验 · 合成世界 · 预测模型与生成模型相同</span><span>一次十年。十八次选择。</span></footer>
    </main>
  </div>;
}
