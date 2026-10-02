import { storyUnavailable, type StoryEvent } from '../engine/story';
import type { State, StoryChoiceId } from '../engine/types';
import { BOOKS, STORY_SOURCES } from '../engine/books';
export default function StoryEventPanel({
  event,
  state,
  selected,
  disabled,
  onSelect,
  onFocus,
}: {
  event: StoryEvent;
  state: State;
  selected?: StoryChoiceId;
  disabled: boolean;
  onSelect: (choice: StoryChoiceId) => void;
  onFocus: (sector: number) => void;
}) {
  return (
    <section className="story-event" aria-label="本回合事件">
      <div className="story-letter">
        <div className="eyebrow">
          <span className="dispatch-dot" />
          收到一封急电 <span>{event.sender}</span>
        </div>
        <h2>{event.title}</h2>
        {event.source && (
          <div className="story-source">
            <span>
              《{BOOKS[event.source.book].title}》· {event.source.chapter}
            </span>
            <small>{event.source.characters.join(' / ')}</small>
            <details>
              <summary>原著线索与改编</summary>
              <p>
                {event.source.note} 本事件的选择和数值为游戏改编。
                <a href={BOOKS[event.source.book].url} target="_blank" rel="noreferrer">
                  书目 ↗
                </a>
                {event.source.book in STORY_SOURCES && (
                  <a
                    href={STORY_SOURCES[event.source.book as keyof typeof STORY_SOURCES]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    情节参考（含剧透）↗
                  </a>
                )}
              </p>
            </details>
          </div>
        )}
        <p>{event.body}</p>
        <div className="story-context">
          <button className="text-button" onClick={() => onFocus(event.target)}>
            定位 {event.location} ↗
          </button>
          <span>{event.why}</span>
        </div>
      </div>
      <div className="story-decisions">
        <span className="eyebrow">先回应事件 · 然后选择本回合命令</span>
        <div>
          {event.choices.map((option, i) => {
            const unavailable = storyUnavailable(state, option);
            return (
              <button
                key={option.id}
                aria-pressed={selected === option.id}
                className={`story-choice ${selected === option.id ? 'selected' : ''}`}
                disabled={disabled || !!unavailable}
                onClick={() => onSelect(option.id)}
              >
                <span className="choice-index">0{i + 1}</span>
                <div>
                  <b>{option.label}</b>
                  <p>{option.description}</p>
                  {option.future && (
                    <span className="story-future">后续影响 · {option.future}</span>
                  )}
                  {option.chance && (
                    <em>{Math.round(option.chance * 100)}% 成功 · 失败也会消耗资源</em>
                  )}
                  {unavailable && <small>{unavailable}</small>}
                </div>
                <span className="choice-check">{selected === option.id ? '✓' : '→'}</span>
              </button>
            );
          })}
        </div>
        <p className="event-choice-status" aria-live="polite">
          {selected
            ? '回应已安排，推进十年时执行。可继续选择一张干预卡；两项行动共享影响力与国库。'
            : '还未选择回应。每个选项都有实际后果，保留资源也会让问题继续积累。'}
        </p>
      </div>
    </section>
  );
}
