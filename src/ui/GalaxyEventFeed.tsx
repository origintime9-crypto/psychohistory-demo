import { useMemo, useState } from 'react';
import type { World } from '../engine/types';
import type { storyEvent } from '../engine/story';
import { sectorRecords, storyReference, storyTone, type ArchiveFrame } from './galaxyArchive';

const TONES = { crisis: '危机', science: '恢复 / 知识', politics: '政治' } as const;
export default function GalaxyEventFeed({
  world,
  frames,
  turn,
  dispatch,
  onLocate,
  onClose,
}: {
  world: World;
  frames: ArchiveFrame[];
  turn: number;
  dispatch: ReturnType<typeof storyEvent>;
  onLocate: (sector: number, turn: number | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | keyof typeof TONES>('all');
  const records = useMemo(
    () =>
      Array.from({ length: world.n }, (_, sector) =>
        sectorRecords(world, frames, sector, turn)
          .filter((record) => record.turn > 0)
          .map((record) => ({ ...record, sector })),
      )
        .flat()
        .sort((a, b) => b.turn - a.turn),
    [world, frames, turn],
  );
  const matches = (name: string, title: string, text: string) =>
    `${name} ${title} ${text}`.includes(query.trim());
  const visible = records.filter(
    (record) =>
      (filter === 'all' || record.tone === filter) &&
      matches(world.names[record.sector], record.title, `${record.text} ${record.source ?? ''}`),
  );
  const showDispatch =
    dispatch &&
    (filter === 'all' || filter === storyTone(dispatch)) &&
    matches(
      world.names[dispatch.target],
      dispatch.title,
      `${dispatch.body} ${storyReference(dispatch) ?? ''}`,
    );
  return (
    <aside className="galaxy-dispatch-feed" aria-label="银河事件流">
      <header>
        <div>
          <span className="eyebrow">TRANSMISSIONS</span>
          <h3>银河事件流</h3>
        </div>
        <button type="button" aria-label="收起事件流" onClick={onClose}>
          ×
        </button>
      </header>
      <input
        type="search"
        aria-label="搜索银河事件"
        placeholder="搜索星区 / 事件 / 人物…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="dispatch-filters" aria-label="事件分类">
        {(['all', 'crisis', 'science', 'politics'] as const).map((tone) => (
          <button
            type="button"
            key={tone}
            aria-pressed={filter === tone}
            onClick={() => setFilter(tone)}
          >
            {tone === 'all' ? '全部' : TONES[tone]}
          </button>
        ))}
      </div>
      <div className="dispatch-list">
        {showDispatch && (
          <button
            type="button"
            className={`dispatch-item tone-${storyTone(dispatch)} current-dispatch`}
            onClick={() => onLocate(dispatch.target, null)}
          >
            <small>
              <i />
              当前急电 · {12067 + turn * 10} GE
            </small>
            <b>{dispatch.title}</b>
            {storyReference(dispatch) && (
              <em className="dispatch-origin">{storyReference(dispatch)}</em>
            )}
            <span>{world.names[dispatch.target]} · 待回应 ↗</span>
          </button>
        )}
        {visible.slice(0, 80).map((record, i) => (
          <button
            type="button"
            className={`dispatch-item tone-${record.tone}`}
            key={`${record.turn}-${record.sector}-${i}`}
            onClick={() => onLocate(record.sector, record.turn)}
          >
            <small>
              <i />
              {12067 + record.turn * 10} GE · {TONES[record.tone]}
            </small>
            <b>{record.title}</b>
            {record.source && <em className="dispatch-origin">{record.source}</em>}
            <span>{world.names[record.sector]} · 查看档案 ↗</span>
          </button>
        ))}
        {!showDispatch && !visible.length && <p>这个纪元尚无匹配的事件。</p>}
      </div>
      <footer>
        已记录 {records.length} 条 · 匹配 {visible.length + (showDispatch ? 1 : 0)} 条
        {visible.length > 80 && ' · 展示最近 80 条'}
      </footer>
    </aside>
  );
}
