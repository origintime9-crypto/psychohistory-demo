import { CHAPTERS, LEGACIES, chapterTitle } from '../engine/campaign';
import type { State } from '../engine/types';

export default function CampaignPanel({ state }: { state: State }) {
  const c = state.chronicle;
  if (!c) return null;
  const era = [...CHAPTERS].reverse().find((ch) => ch.due <= state.turn)?.era ?? '计划的种子';
  const entries = Object.entries(c.resolved);
  return (
    <section className="campaign-panel panel" aria-label="谢顿计划传承">
      <div className="campaign-heading">
        <div>
          <span className="eyebrow">FOUNDATION CHRONICLE</span>
          <h3>{state.muleOccurred && !c.resolved.channis ? '计划之外的人' : era}</h3>
        </div>
        <span className="subtle">{entries.length} 个章节已写入历史</span>
      </div>
      <div className="legacy-grid">
        {LEGACIES.map((item) => (
          <div key={item.key} title={item.use}>
            <div>
              <b>{item.label}</b>
              <span>{Math.round(c[item.key] * 100)}%</span>
            </div>
            <meter min={0} max={1} value={c[item.key]} aria-label={item.label} />
            <p>{item.use}</p>
          </div>
        ))}
      </div>
      <p className="campaign-note">
        你接续历代执掌者的工作。前期留下的承诺、客户与秘密，会改变后续行动；终局也会记录文明走向哪条路线。
      </p>
      {entries.length > 0 && (
        <details className="campaign-history">
          <summary>回看已完成的原著章节</summary>
          <ol>
            {entries.map(([id, record]) => (
              <li key={id}>
                <span>第 {record.turn} 回合</span>
                <b>{chapterTitle(id)}</b>
                <small>
                  {record.label}
                  {record.success ? '' : ' · 行动失利'}
                </small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
