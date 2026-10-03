import { MapPin, Send, LoaderCircle } from 'lucide-react';
import { storyBudget, storyUnavailable, type StoryEvent } from '../engine/story';
import { actionUnavailable } from '../engine/cards';
import type { Action, State, StoryChoiceId, World } from '../engine/types';
import { BOOKS } from '../engine/books';

const VOICES: Record<StoryChoiceId, string> = {
  aid: '“这件事不能再等了。按我的回复去办。”',
  bargain: '“把这份安排送给他们。这是我现在能够作出的决定。”',
  defer: '“先按现有安排处理，继续把消息送来。”',
};

export default function StoryEventPanel({
  event,
  state,
  world,
  selected,
  disabled,
  pending,
  planned,
  onSelect,
  onFocus,
}: {
  event: StoryEvent;
  state: State;
  world: World;
  selected?: StoryChoiceId;
  disabled: boolean;
  pending?: boolean;
  planned?: Action;
  onSelect: (choice: StoryChoiceId) => void;
  onFocus: (sector: number) => void;
}) {
  return (
    <section className="story-event immersive-event" aria-label="本回合事件">
      <div className="story-letter">
        <div className="eyebrow">
          <span className="dispatch-dot" />
          {event.sender} · 来信
        </div>
        <h2>{event.title}</h2>
        {event.source && (
          <div className="story-source">
            <span>
              《{BOOKS[event.source.book].title}》 · {event.source.chapter}
            </span>
            <small>{event.source.characters.join(' / ')}</small>
          </div>
        )}
        <p>{event.body}</p>
        <button className="text-button location-command" onClick={() => onFocus(event.target)}>
          <MapPin size={15} />
          {event.location}
        </button>
      </div>
      <div className="story-decisions">
        <span className="eyebrow">你的回应</span>
        <div>
          {event.choices.map((option, i) => {
            const budget = storyBudget(state, option);
            const unavailable =
              storyUnavailable(state, option) ??
              (planned ? actionUnavailable(world, budget, planned.card) : null);
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
                  <p>{VOICES[option.id]}</p>
                  {unavailable && <small>{unavailable}</small>}
                </div>
                <span className="choice-check">
                  {pending && selected === option.id ? (
                    <LoaderCircle className="spinning" size={17} />
                  ) : (
                    <Send size={17} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {pending && (
          <p className="event-choice-status" role="status">
            急电已发出。十年，正在成为历史。
          </p>
        )}
      </div>
    </section>
  );
}
