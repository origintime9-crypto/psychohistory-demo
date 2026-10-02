import { actionUnavailable, CARDS, drawHand } from '../engine/cards';
import type { Action, CardEstimate, CardId, Comparison, State, World } from '../engine/types';
import CommandPreview, { CARD_GUIDANCE } from './CommandPreview';
const signed = (value: number, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
const years = (value: number) =>
  `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value)).toLocaleString('zh-CN')} 年`;
interface Props {
  world: World;
  state: State;
  action: Action;
  onSelect: (action: Action) => void;
  comparison: Comparison | null;
  estimates: Partial<Record<CardId, CardEstimate>>;
  handBusy: boolean;
  handError: string | null;
  busy: boolean;
  ready: boolean;
  elapsed: number | null;
  error: string | null;
  onAdvance: () => void;
  selectedSector: number | undefined;
  eventAwaiting: boolean;
}
export default function CardHand({
  world,
  state,
  action,
  onSelect,
  comparison,
  estimates,
  handBusy,
  handError,
  busy,
  ready,
  elapsed,
  error,
  onAdvance,
  selectedSector,
  eventAwaiting,
}: Props) {
  const targeted = CARDS[action.card].targeted,
    needTarget = targeted && action.target === undefined;
  return (
    <section className="intervention">
      <div className="hand-title">
        <div>
          <span className="eyebrow">你的干预</span>
          <h2>下达本回合的命令</h2>
        </div>
        <span className="subtle">每回合选择 1 张 · 下回合影响力 +1</span>
      </div>
      <p className="hand-assumption">
        {eventAwaiting
          ? '先回应上方事件，再安排一条命令。'
          : '事件与命令共用资源。选择后看直接效果，再决定是否推进十年。'}
        {handBusy ? ' 整手牌推演中…' : ''}
        {handError ? ` 摘要暂不可用：${handError}` : ''}
      </p>
      <div className="card-grid">
        {drawHand(world, state.turn).map((id) => {
          const card = CARDS[id],
            unavailable = actionUnavailable(world, state, id),
            estimate = estimates[id];
          const suggested =
            selectedSector !== undefined && state.phase[selectedSector] !== 3
              ? selectedSector
              : estimate?.target;
          return (
            <button
              key={id}
              type="button"
              className={`card ${action.card === id ? 'selected' : ''} ${id === 'noop' ? 'noop-card' : ''}`}
              disabled={!!unavailable || eventAwaiting}
              aria-pressed={action.card === id}
              onClick={() =>
                onSelect({
                  card: id,
                  ...(card.targeted && suggested !== undefined ? { target: suggested } : {}),
                })
              }
            >
              <div className="card-top">
                <span className="card-symbol">{card.symbol}</span>
                <span className="card-cost">
                  {card.cost === 0 ? '+2' : card.cost}
                  <small>{card.cost === 0 ? ' 额外影响力' : ' 影响力'}</small>
                </span>
              </div>
              <h3>{card.name}</h3>
              <div className="card-scope">
                {card.targeted ? '指定一个星区' : id === 'noop' ? '观察与等待' : '影响全帝国'}
              </div>
              <p className="card-story">{CARD_GUIDANCE[id].why}</p>
              <small className="card-situation">{CARD_GUIDANCE[id].when}</small>
              <p className="card-mechanics">{card.effect}</p>
              <div className="card-estimate" aria-live="polite">
                {estimate ? (
                  <>
                    <b
                      className={
                        estimate.comparison.scoreDelta > 0
                          ? 'mint'
                          : estimate.comparison.scoreDelta < 0
                            ? 'rose'
                            : ''
                      }
                    >
                      终局 ΔQ {signed(estimate.comparison.scoreDelta, 3)}
                    </b>
                    <span
                      className={
                        estimate.comparison.darknessDelta < 0
                          ? 'mint'
                          : estimate.comparison.darknessDelta > 0
                            ? 'rose'
                            : ''
                      }
                    >
                      黑暗时代 {years(estimate.comparison.darknessDelta)}
                    </span>
                    <small>
                      {estimate.target !== undefined
                        ? `建议 ${world.names[estimate.target]} · 可在星图改选`
                        : `${estimate.samples} 条配对路径的估计`}
                    </small>
                  </>
                ) : (
                  <span>{unavailable ?? '终局效果估算中…'}</span>
                )}
              </div>
              <div className="card-downside">{card.downside}</div>
              {unavailable && <span className="card-disabled">{unavailable}</span>}
            </button>
          );
        })}
      </div>
      <CommandPreview world={world} state={state} action={action} />
      <div className="action-bar">
        <div className="action-preview" aria-live="polite">
          <div className="preview-title">
            {CARDS[action.card].name}
            {action.target !== undefined && targeted ? (
              <span> → {world.names[action.target]}</span>
            ) : null}
          </div>
          {eventAwaiting ? (
            <p className="gold">先回应本回合急电。你的回应会影响剩余资源和这次命令的效果。</p>
          ) : error ? (
            <p className="error-text">预测失败：{error}，请重新选择行动。</p>
          ) : needTarget ? (
            <p className="gold">点击星图中尚未独立的星区，预览干预效果。</p>
          ) : busy ? (
            <p>正在配对推演干预与基线…</p>
          ) : comparison ? (
            <>
              <p>
                终局 ΔQ{' '}
                <b
                  className={
                    comparison.scoreDelta > 0 ? 'mint' : comparison.scoreDelta < 0 ? 'rose' : ''
                  }
                >
                  {signed(comparison.scoreDelta, 3)}
                </b>
              </p>
              <p className="terminal-metrics">
                <span>
                  黑暗时代{' '}
                  <strong
                    className={
                      comparison.darknessDelta < 0
                        ? 'mint'
                        : comparison.darknessDelta > 0
                          ? 'rose'
                          : ''
                    }
                  >
                    {years(comparison.darknessDelta)}
                  </strong>
                </span>
                <span>
                  末三回合稳定{' '}
                  <strong>{signed(comparison.stabilityDelta * 100, 1)} 个百分点</strong>
                </span>
                <span>
                  终局国库{' '}
                  <strong className={comparison.treasuryDelta < 0 ? 'rose' : ''}>
                    {signed(comparison.treasuryDelta * 100, 1)} 个百分点
                  </strong>
                </span>
              </p>
              <details className="preview-detail">
                <summary>推演假设与统计详情</summary>
                <p>
                  本回合执行当前事件回应与命令，之后按兵不动、暂缓未来事件。“骡”未计入。卡面使用 32
                  条配对路径粗估，选中后用 96 条精算；定向卡只筛选部分候选。
                </p>
                <p>ΔQ 标准误 {comparison.scoreStandardError.toFixed(3)}。</p>
                <p className="secondary-metrics">
                  下回合危机 {signed(comparison.meanDelta)} ± {comparison.standardError.toFixed(2)}
                  ；五步危机 {signed(comparison.finalDelta)}；基地{' '}
                  {signed(comparison.foundationDelta * 100, 1)} 个百分点。
                </p>
              </details>
            </>
          ) : (
            <p>观察当前趋势，积蓄影响力。</p>
          )}
          {elapsed !== null && !busy && (
            <small className="preview-time">
              配对预览 {Math.round(elapsed)} ms · 此后按兵不动，不计未知冲击
            </small>
          )}
        </div>
        <button
          className="primary advance-button"
          disabled={!ready || busy || needTarget || !!error}
          onClick={onAdvance}
        >
          执行并推进十年 <span>→</span>
        </button>
      </div>
    </section>
  );
}
