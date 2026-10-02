import { PHASE_NAMES } from '../engine/flavor';
import type { Reveal } from '../engine/types';
import type { TurnOutcome } from './turnOutcome';
export default function TurnResult({
  outcome,
  reveal,
  onContinue,
}: {
  outcome: TurnOutcome;
  reveal: Reveal;
  onContinue: () => void;
}) {
  const restored = outcome.changes.filter((c) => c.to === 0),
    lost = outcome.changes.filter((c) => c.to === 3),
    worsened = outcome.changes.filter((c) => c.to > c.from && c.to < 3);
  const fmt = (v: number, unit: string) => (unit === '%' ? `${Math.round(v * 100)}%` : `${v} 点`);
  return (
    <section
      className={`turn-result ${outcome.mule ? 'mule-arrival' : ''}`}
      aria-label="十年后的结果"
      tabIndex={-1}
    >
      <div className="result-heading">
        <div>
          <div className="eyebrow">
            银河纪元 {12067 + outcome.turn * 10} / 第 {outcome.turn * 10} 年的回音
          </div>
          <h2>
            {outcome.mule
              ? '一个模型不知道的人，改变了银河。'
              : lost.length
                ? `${lost.length} 个星区脱离帝国。`
                : restored.length
                  ? `${restored.length} 个星区恢复了秩序。`
                  : '命令已经传达。历史继续展开。'}
          </h2>
        </div>
        <span className="result-seal">
          {outcome.mule ? (reveal.covered ? '未知冲击' : '区间被击穿') : '历史已记录'}
        </span>
      </div>
      {outcome.mule && (
        <p className="mule-impact">
          “骡”突然出现。这个共同冲击未进入事前模型：实际 {reveal.actual} 个危机，预测区间{' '}
          {reveal.lo90}–{reveal.hi90}。
          {reveal.covered
            ? '本次仍落在区间内，但模型遗漏了这个机制。'
            : '预测区间被击穿。更多星区也无法抵消模型未知的力量。'}
        </p>
      )}
      <div className="result-columns">
        <div className="command-report">
          <span className="eyebrow">你的命令 · 直接效果</span>
          <h3>
            {outcome.command}
            {outcome.target ? ` → ${outcome.target}` : ''}
          </h3>
          {outcome.story && (
            <p className={outcome.story.success ? '' : 'rose'}>
              <b>
                {outcome.story.label}
                {outcome.story.success ? '' : ' · 未成功'}
              </b>
              ：{outcome.story.text}
            </p>
          )}
          {outcome.reformFailed && (
            <p className="rose">行政改革失败。治理没有得到预期提升，精英竞争增加。</p>
          )}
          <div className="direct-changes">
            {outcome.direct.slice(0, 5).map((change) => (
              <div key={change.label}>
                <span>{change.label}</span>
                <b className={change.good ? 'mint' : 'gold'}>
                  {Math.round(change.before * 100)}% <i>→</i> {Math.round(change.after * 100)}%
                </b>
              </div>
            ))}
          </div>
          <p className="subtle">
            这部分是事件与命令立即改变的条件；星区是否恢复秩序仍由之后十年的演变决定。
          </p>
        </div>
        <div className="history-report">
          <span className="eyebrow">十年演变 · 实际结果</span>
          <div className="result-counts">
            <article className="mint">
              <b>{restored.length}</b>
              <span>恢复秩序</span>
            </article>
            <article className="gold">
              <b>{worsened.length}</b>
              <span>局势恶化</span>
            </article>
            <article className="rose">
              <b>{lost.length}</b>
              <span>脱离帝国</span>
            </article>
          </div>
          <div className="changed-stars">
            {outcome.changes.slice(0, 8).map((change) => (
              <div key={change.name} className={`change-to-${change.to}`}>
                <i>✧</i>
                <span>
                  <b>{change.name}</b>
                  <small>
                    {PHASE_NAMES[change.from]} → {PHASE_NAMES[change.to]}
                  </small>
                </span>
              </div>
            ))}
          </div>
          {outcome.changes.length > 8 && (
            <p className="subtle">
              另有 {outcome.changes.length - 8} 个星区发生变化，完整记录见编年史。
            </p>
          )}
          {!outcome.changes.length && <p>这十年没有星区改变状态，经济与政治条件仍在变化。</p>}
        </div>
      </div>
      <div className="result-resources">
        {outcome.resources.map((r) => (
          <div key={r.label}>
            <span>{r.label}</span>
            <strong>
              {fmt(r.before, r.unit)} <i>→</i> {fmt(r.after, r.unit)}
            </strong>
            <small>命令刚生效：{fmt(r.direct, r.unit)}；随后经过十年演变</small>
            {r.unit === '%' && (
              <div className="resource-change-track">
                <i style={{ width: `${r.before * 100}%` }} />
                <b style={{ width: `${r.after * 100}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="result-footer">
        <span>
          稳定星区 {outcome.before.stable} → {outcome.after.stable} · 活跃危机{' '}
          {outcome.before.crisis} → {outcome.after.crisis}
        </span>
        <button className="primary" onClick={onContinue}>
          查看下一回合局势 →
        </button>
      </div>
    </section>
  );
}
