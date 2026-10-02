import { CARDS, drawHand } from '../engine/cards';
import type { Action, Comparison, State, World } from '../engine/types';
interface Props { world: World; state: State; action: Action; onSelect: (action: Action) => void; comparison: Comparison | null; busy: boolean; ready: boolean; elapsed: number | null; error: string | null; onAdvance: () => void; selectedSector: number | undefined }
export default function CardHand({ world, state, action, onSelect, comparison, busy, ready, elapsed, error, onAdvance, selectedSector }: Props) {
  const targeted = CARDS[action.card].targeted, needTarget = targeted && action.target === undefined;
  return <section className="intervention"><div className="hand-title"><div><span className="eyebrow">你的干预</span><h2>历史需要一次选择</h2></div><span className="subtle">每回合选择 1 张 · 下回合影响力 +2</span></div>
    <div className="card-grid">{drawHand(world, state.turn).map(id => { const card = CARDS[id], disabled = state.influence < card.cost || (card.targeted && state.phase.every(v => v === 3)); return <button key={id} type="button" className={`card ${action.card === id ? 'selected' : ''} ${id === 'noop' ? 'noop-card' : ''}`} disabled={disabled} aria-pressed={action.card === id} onClick={() => onSelect({ card: id, ...(card.targeted && selectedSector !== undefined && state.phase[selectedSector] !== 3 ? { target: selectedSector } : {}) })}>
      <div className="card-top"><span className="card-symbol">{card.symbol}</span><span className="card-cost">{card.cost === 0 ? '+2' : card.cost}<small>{card.cost === 0 ? ' 额外影响力' : ' 影响力'}</small></span></div>
      <h3>{card.name}</h3><div className="card-scope">{card.targeted ? '指定一个星区' : id === 'noop' ? '观察与等待' : '影响全帝国'}</div><p>{card.effect}</p><div className="card-downside">{card.downside}</div>
      {disabled && <span className="card-disabled">{state.influence < card.cost ? '影响力不足' : '没有可选星区'}</span>}
    </button>; })}</div>
    <div className="action-bar"><div className="action-preview" aria-live="polite">
      <div className="preview-title">{CARDS[action.card].name}{action.target !== undefined && targeted ? <span> → {world.names[action.target]}</span> : null}</div>
      {error ? <p className="error-text">预测失败：{error}，请重新选择行动。</p> : needTarget ? <p className="gold">点击星图中尚未独立的星区，预览干预效果。</p> : busy ? <p>正在配对推演干预与基线…</p> : comparison ? <p>下回合期望危机 <b className={comparison.meanDelta < 0 ? 'mint' : comparison.meanDelta > 0 ? 'rose' : ''}>{comparison.meanDelta >= 0 ? '+' : ''}{comparison.meanDelta.toFixed(2)}</b> <span>± {comparison.standardError.toFixed(2)} 标准误</span><span className="preview-extra"> · 五步 {comparison.finalDelta >= 0 ? '+' : ''}{comparison.finalDelta.toFixed(2)}{comparison.foundationDelta > 0 ? ` · 基地 +${Math.round(comparison.foundationDelta * 100)}%` : ''}</span></p> : <p>观察当前趋势，积蓄影响力。</p>}
      {elapsed !== null && !busy && <small className="preview-time">配对预览 {Math.round(elapsed)} ms · 公共随机数比较</small>}
    </div><button className="primary advance-button" disabled={!ready || busy || needTarget || !!error} onClick={onAdvance}>执行并推进十年 <span>→</span></button></div>
  </section>;
}
