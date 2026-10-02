import type { Reveal } from '../engine/types';
export interface LogEntry { turn: number; text: string; tone?: 'normal' | 'warn' | 'good' }
export default function EventLog({ entries, reveals }: { entries: LogEntry[]; reveals: Reveal[] }) {
  const covered = reveals.filter(r => r.covered).length;
  return <section className="panel event-log"><div className="panel-heading"><div><div className="eyebrow">帝国编年史</div><h2>已发生的历史</h2></div><span className="subtle">90% 区间命中 <b>{reveals.length ? `${covered}/${reveals.length}` : '—'}</b></span></div><div className="log-list" aria-live="polite">{entries.length ? [...entries].reverse().slice(0, 40).map((e, i) => <div className={`log-entry ${e.tone ?? 'normal'}`} key={`${entries.length}-${i}`}><time>+{e.turn * 10} 年</time><p>{e.text}</p></div>) : <div className="empty-log"><span>✧</span><p>群星尚且平静。<br />推进第一个十年，开始记录历史。</p></div>}</div></section>;
}
