import { useEffect, useMemo, useReducer, useState } from 'react';
import { CARDS } from '../engine/cards';
import { DEFAULT_PARAMS, TOTAL_TURNS } from '../engine/params';
import { score } from '../engine/scoring';
import { counts } from '../engine/types';
import { previewStoryChoice, storyEvent } from '../engine/story';
import CardHand from './CardHand';
import EndScreen from './EndScreen';
import EventLog from './EventLog';
import ForecastPanel from './ForecastPanel';
import { emptyGame, gameReducer, type Game } from './gameReducer';
import LawOfLargeNumbers from './LawOfLargeNumbers';
import { GUIDE_KEY, restoreGame, SAVE_KEY, serializeGame } from './saveGame';
import SetupScreen from './SetupScreen';
import StarMap from './StarMap';
import OpeningGuide from './OpeningGuide';
import MissionPanel from './MissionPanel';
import StoryEventPanel from './StoryEventPanel';
import TurnResult from './TurnResult';
import { useForecast } from './useForecast';
import IntroSequence, { shouldPlayIntro } from './IntroSequence';
import CampaignPanel from './CampaignPanel';
import BookArchive from './BookArchive';
import DecadeNarrative from './DecadeNarrative';
import { BookOpen } from 'lucide-react';

const percent = (value: number) => `${Math.round(value * 100)}%`;
const EMPTY_HISTORY: never[] = [];
function initializeGame(): Game {
  try {
    const stored = localStorage.getItem(SAVE_KEY);
    return stored ? restoreGame(stored) : emptyGame(localStorage.getItem(GUIDE_KEY) === 'done');
  } catch (error) {
    return {
      ...emptyGame(),
      error: `无法恢复存档：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export default function App() {
  const [game, dispatch] = useReducer(gameReducer, undefined, initializeGame);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [intro, setIntro] = useState(shouldPlayIntro);
  const [focusRequest, setFocusRequest] = useState(0);
  const [pendingTurn, setPendingTurn] = useState<number | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const session = game.session;
  const world = session?.world ?? null,
    state = session?.state ?? null;
  const params = session?.params ?? DEFAULT_PARAMS;
  const currentEvent = useMemo(
    () => (world && state ? storyEvent(world, state, params) : null),
    [world, state, params],
  );
  const decisionState = useMemo(
    () =>
      world && state
        ? previewStoryChoice(world, state, currentEvent, game.action.eventChoice)
        : null,
    [world, state, currentEvent, game.action.eventChoice],
  );
  const finished = state?.turn === TOTAL_TURNS;
  const context = finished ? session?.finalContext : null;
  const history = useMemo(
    () => (context ? session!.history.slice(0, -1) : (session?.history ?? EMPTY_HISTORY)),
    [session?.history, context],
  );
  const contrastParams = useMemo(
    () => ({
      ...params,
      contagion: game.contagion,
      commonShock: game.commonShock,
      fiscalFeedback: game.contagion || game.commonShock,
      storyEvents: (game.contagion || game.commonShock) && params.storyEvents,
      ...(params.strategic ? { strategic: game.contagion || game.commonShock } : {}),
    }),
    [params, game.contagion, game.commonShock],
  );
  const prediction = useForecast(
    world,
    context?.state ?? state,
    context?.action ?? game.action,
    params,
    contrastParams,
    history,
  );
  const revealing = game.status === 'revealing';

  useEffect(() => {
    if (!revealing || params.strategic) return;
    const timer = setTimeout(() => dispatch({ type: 'FINISH_REVEAL' }), 1250);
    return () => clearTimeout(timer);
  }, [revealing, params.strategic]);

  useEffect(() => {
    if (pendingTurn === null) return;
    if (!state || state.turn !== pendingTurn || game.error || prediction.error) {
      setPendingTurn(null);
      return;
    }
    if (
      !game.action.eventChoice ||
      !prediction.activeMatches ||
      !prediction.active ||
      prediction.baselineBusy ||
      prediction.previewBusy ||
      revealing
    )
      return;
    dispatch({ type: 'ADVANCE', turn: pendingTurn, forecast: prediction.active });
    setPendingTurn(null);
  }, [
    pendingTurn,
    state,
    game.action.eventChoice,
    game.error,
    prediction.active,
    prediction.activeMatches,
    prediction.baselineBusy,
    prediction.previewBusy,
    prediction.error,
    revealing,
  ]);

  useEffect(() => {
    if (!game.reveal || game.view !== 'empire' || params.strategic) return;
    const timer = setTimeout(
      () =>
        document.querySelector('.turn-result')?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
          block: 'start',
        }),
      70,
    );
    return () => clearTimeout(timer);
  }, [game.reveal?.turn]);

  useEffect(() => {
    try {
      const saved = serializeGame(game);
      if (saved) localStorage.setItem(SAVE_KEY, saved);
      else if (!game.error) localStorage.removeItem(SAVE_KEY);
      if (game.tutorialDone) localStorage.setItem(GUIDE_KEY, 'done');
      setStorageError(null);
    } catch {
      setStorageError('浏览器无法保存进度。本次仍可游玩，但刷新后可能无法续玩。');
    }
  }, [
    session?.actions,
    game.status,
    game.tutorialStep,
    game.tutorialDone,
    game.error,
    game.action.eventChoice,
  ]);

  if (!session || !world || !state)
    return (
      <>
        {game.error && <div className="error-banner">{game.error}</div>}
        <SetupScreen
          onStart={(seed, n, mule) => {
            dispatch({ type: 'START', seed, n, mule });
          }}
          onReplayIntro={() => setIntro(true)}
          intro={intro}
          onFinishIntro={() => setIntro(false)}
        />
      </>
    );

  if (intro) return <IntroSequence onComplete={() => setIntro(false)} />;

  if (game.status === 'ended')
    return (
      <EndScreen
        world={world}
        state={state}
        history={session.history}
        reveals={session.reveals}
        observations={session.observations}
        actions={session.actions}
        params={params}
        onRestart={() => dispatch({ type: 'RESET' })}
        onReview={() => dispatch({ type: 'REVIEW' })}
      />
    );

  if (game.view === 'briefing')
    return (
      <OpeningGuide
        world={world}
        lesson={game.tutorialStep ?? 0}
        onNext={() => dispatch({ type: 'TUTORIAL_NEXT' })}
        onSkip={() => dispatch({ type: 'TUTORIAL_DISMISS' })}
      />
    );

  const c = counts(state);
  const displayForecast = game.reveal
    ? game.revealedForecast
    : (prediction.active ?? prediction.baseline);
  const projection = prediction.active?.projection ?? prediction.baseline?.projection;
  const currentScore = score(
    state.foundation,
    session.history.length ? session.history : [{ stable: c.stable / world.n }],
  );
  const advance = () => {
    if (
      !prediction.active ||
      prediction.previewBusy ||
      prediction.baselineBusy ||
      revealing ||
      finished ||
      prediction.error ||
      (currentEvent && !game.action.eventChoice)
    )
      return;
    dispatch({ type: 'ADVANCE', turn: state.turn, forecast: prediction.active });
  };
  const focusMap = (sector: number) => {
    setFocusRequest((value) => value + 1);
    dispatch({ type: 'VIEW', view: 'empire' });
    dispatch({ type: 'SELECT_SECTOR', sector });
    requestAnimationFrame(() =>
      document.querySelector('.map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  const closeChapter = () => {
    setJournalOpen(false);
    dispatch({ type: 'CLEAR_REVEAL' });
    dispatch({ type: 'FINISH_REVEAL' });
    if (finished) dispatch({ type: 'END' });
  };
  const command = !finished ? (
    <CardHand
      world={world}
      state={params.strategic ? state : decisionState!}
      params={params}
      action={game.action}
      onSelect={(action) => dispatch({ type: 'SELECT_ACTION', action })}
      comparison={prediction.comparison}
      estimates={prediction.hand}
      handBusy={prediction.handBusy}
      handError={prediction.handError}
      busy={prediction.previewBusy || prediction.baselineBusy || revealing}
      ready={!!prediction.active && !revealing && (!currentEvent || !!game.action.eventChoice)}
      eventAwaiting={!!currentEvent && !game.action.eventChoice}
      hasEvent={!!params.strategic && !!currentEvent}
      locked={revealing || pendingTurn !== null}
      elapsed={prediction.elapsed}
      error={prediction.error}
      onAdvance={advance}
      selectedSector={game.sector}
    />
  ) : null;
  const letter =
    currentEvent && !finished ? (
      <StoryEventPanel
        event={currentEvent}
        state={state}
        world={world}
        selected={game.action.eventChoice}
        disabled={revealing || pendingTurn !== null}
        pending={pendingTurn !== null}
        planned={params.strategic ? game.action : undefined}
        onSelect={(choice) => {
          dispatch({ type: 'SELECT_EVENT', choice });
          if (params.strategic) setPendingTurn(state.turn);
        }}
        onFocus={focusMap}
      />
    ) : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span>✧</span>
          <div>
            <b>心理史学</b>
            <small>谢顿计划 / 银河推演</small>
          </div>
        </div>
        <nav aria-label="主视图">
          <button
            className={game.view === 'empire' ? 'active' : ''}
            onClick={() => dispatch({ type: 'VIEW', view: 'empire' })}
          >
            帝国态势
          </button>
          <button
            className={game.view === 'law' ? 'active' : ''}
            onClick={() => dispatch({ type: 'VIEW', view: 'law' })}
          >
            大数定律
          </button>
        </nav>
        <div className="header-right">
          {session.lastOutcome && (
            <button className="text-button journal-button" onClick={() => setJournalOpen(true)}>
              <BookOpen size={15} />
              十年手记
            </button>
          )}
          <BookArchive state={state} />
          <button className="text-button intro-replay" onClick={() => setIntro(true)}>
            重看入场
          </button>
          <button className="text-button" onClick={() => dispatch({ type: 'OPEN_GUIDE' })}>
            玩法说明
          </button>
          <span className="world-seed" title={`世界种子 ${world.seed}`}>
            {world.seed}
          </span>
          <button className="text-button" onClick={() => dispatch({ type: 'RESET' })}>
            新推演 ↗
          </button>
        </div>
      </header>
      <main className="dashboard">
        <div className="turn-heading">
          <div>
            <div className="eyebrow">
              游戏纪元 {12067 + state.turn * 10} · {world.n} 个星区
            </div>
            <h1>
              {finished
                ? `${TOTAL_TURNS * 10} 年，已成为历史。`
                : params.strategic
                  ? '来自群星的来信'
                  : '帝国还在。下一步，由你决定。'}
            </h1>
          </div>
          <div className="turn-counter">
            <span>
              第{' '}
              <b>
                {Math.min(state.turn + 1, TOTAL_TURNS)
                  .toString()
                  .padStart(2, '0')}
              </b>{' '}
              / {TOTAL_TURNS} 回合
            </span>
            <small>{finished ? '推演完成' : `已过去 ${state.turn * 10} 年`}</small>
          </div>
        </div>
        {!params.strategic && game.reveal && session.lastOutcome && (
          <TurnResult
            outcome={session.lastOutcome}
            reveal={game.reveal}
            onContinue={() => dispatch({ type: 'CLEAR_REVEAL' })}
          />
        )}
        {!params.strategic && (
          <div className="stats-strip">
            <div>
              <span>稳定星区</span>
              <b className="mint">
                {c.stable}
                <small> / {world.n}</small>
              </b>
              <em>{percent(c.stable / world.n)}</em>
            </div>
            <div>
              <span>活跃危机</span>
              <b className="rose">
                {c.crisis}
                <small> 星区</small>
              </b>
              <em>
                动荡 {c.unrest} · 叛乱 {c.rebellion}
              </em>
            </div>
            <div>
              <span>已独立</span>
              <b>
                {c.independent}
                <small> 星区</small>
              </b>
              <em>不可逆</em>
            </div>
            <div>
              <span>国库 / 治理</span>
              <b>
                {percent(state.treasury)}
                <small> / {percent(state.governance)}</small>
              </b>
              <em>
                税率 {percent(state.tax)}
                {state.taxReliefTurns ? ` · 减负剩 ${state.taxReliefTurns} 回合` : ''}
              </em>
            </div>
            <div>
              <span>基地进度</span>
              <b className="gold">{percent(state.foundation)}</b>
              <div className="tiny-progress">
                <i style={{ width: percent(state.foundation) }} />
              </div>
            </div>
            <div className="influence-stat">
              <span>你的影响力</span>
              <b>
                {state.influence}
                <small> / 8</small>
              </b>
              <div className="influence-dots">
                {Array.from({ length: 8 }, (_, i) => (
                  <i className={i < state.influence ? 'filled' : ''} key={i} />
                ))}
              </div>
            </div>
          </div>
        )}
        {!params.strategic && (
          <div className="outlook-strip" aria-live="polite">
            <div>
              <span>当前成果得分</span>
              <b>{currentScore.Q.toFixed(3)}</b>
              <small>秩序与知识共同决定成果；维稳也有基础分</small>
            </div>
            <div>
              <span>预估终局黑暗时代</span>
              <b className="gold">
                {projection ? Math.round(projection.darkness).toLocaleString('zh-CN') : '…'}
                <small> 年</small>
              </b>
              <small>按当前选择，此后等待并暂缓未来事件；未知冲击未计入</small>
            </div>
            <span className="save-status">
              {storageError ?? `已自动保存 · ${state.turn} / ${TOTAL_TURNS} 回合`}
            </span>
          </div>
        )}
        {params.strategic && storageError && <p className="error-banner">{storageError}</p>}
        {game.error && <div className="error-banner">{game.error}</div>}
        {prediction.error && <div className="error-banner">预测暂不可用：{prediction.error}</div>}
        {game.view === 'empire' ? (
          <>
            <div className="story-front">
              {command}
              {letter}
            </div>
            <div className="empire-grid">
              <StarMap
                world={world}
                state={state}
                params={params}
                probabilities={prediction.baseline?.probabilities}
                selected={game.sector}
                targeting={CARDS[game.action.card].targeted && !finished}
                targetEffects={prediction.targets[game.action.card]}
                onSelect={(sector) => dispatch({ type: 'SELECT_SECTOR', sector })}
                events={session.events}
                revealing={revealing || !!game.reveal}
                actions={session.actions}
                reveals={session.reveals}
                focusRequest={focusRequest}
                plannedAction={game.action}
                comparison={prediction.comparison}
              />
              {!params.strategic && (
                <ForecastPanel
                  forecast={displayForecast}
                  history={session.history}
                  turn={game.reveal ? game.reveal.turn - 1 : state.turn}
                  reveal={game.reveal}
                  mule={game.muleRevealed}
                />
              )}
            </div>
            {!params.strategic && (
              <>
                <MissionPanel world={world} state={state} />
                <CampaignPanel state={state} />
              </>
            )}
            {game.reveal && !session.lastOutcome && (
              <div
                className={`reveal-banner ${game.muleRevealed ? 'mule-banner' : ''}`}
                aria-live="polite"
              >
                <span className="gold">
                  {game.muleRevealed
                    ? '“骡”出现：模型未知的共同冲击'
                    : `第 ${game.reveal.turn * 10} 年已揭晓`}
                </span>
                <span>
                  实际 {game.reveal.actual} 个危机星区，事前区间 {game.reveal.lo90}–
                  {game.reveal.hi90}。
                  {game.muleRevealed && !game.reveal.covered ? '预测区间被击穿。' : ''}
                </span>
                <button className="text-button" onClick={() => dispatch({ type: 'CLEAR_REVEAL' })}>
                  查看下一回合预测 →
                </button>
              </div>
            )}
            {finished && (
              <div className="finished-bar">
                <span>{TOTAL_TURNS * 10} 年推演完成，历史已自动存档。</span>
                <button className="primary" onClick={() => dispatch({ type: 'END' })}>
                  查看终局报告 →
                </button>
              </div>
            )}
            {!params.strategic && <EventLog entries={session.logs} reveals={session.reveals} />}
          </>
        ) : (
          <LawOfLargeNumbers
            forecast={prediction.baseline ?? game.revealedForecast}
            contrast={prediction.contrast}
            contrastBusy={prediction.contrastBusy}
            contagion={game.contagion}
            shock={game.commonShock}
            onToggle={(channel, value) => dispatch({ type: 'TOGGLE', channel, value })}
            observations={session.observations}
            reveals={session.reveals}
          />
        )}
        <footer className="app-footer">
          <span>合成世界 · 常规机制已建模 · 未知的“骡”不进入事前预测</span>
          <span>一次十年。三十次选择，许多条历史。</span>
        </footer>
      </main>
      {((params.strategic && game.reveal) || journalOpen) && session.lastOutcome && (
        <DecadeNarrative
          chapter={session.lastOutcome.chapter}
          chapters={session.chapters}
          complete={finished}
          onContinue={closeChapter}
          onMap={(focus) => {
            closeChapter();
            if (finished) dispatch({ type: 'REVIEW' });
            focusMap(focus);
          }}
        />
      )}
    </div>
  );
}
