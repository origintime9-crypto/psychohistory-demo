import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, X, Crosshair, ChevronDown, Image } from 'lucide-react';
import { actionUnavailable, CARDS, drawHand } from '../engine/cards';
import type { Params } from '../engine/params';
import type { Action, CardEstimate, CardId, Comparison, State, World } from '../engine/types';
import { CARD_GUIDANCE } from './CommandPreview';
import { CARD_CATEGORY, cardArt } from './cardArt';

interface Props {
  world: World;
  state: State;
  params: Params;
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
  hasEvent?: boolean;
  locked?: boolean;
}

export default function CardHand({
  world,
  state,
  params,
  action,
  onSelect,
  estimates,
  ready,
  busy,
  error,
  onAdvance,
  selectedSector,
  hasEvent,
  locked,
}: Props) {
  const [library, setLibrary] = useState(false);
  const [category, setCategory] = useState('全部');
  const [expanded, setExpanded] = useState(false);
  const [illustration, setIllustration] = useState<CardId | null>(null);
  const catalogue = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const hand = drawHand(world, state.turn, params);
  useEffect(() => {
    setExpanded(false);
    setLibrary(false);
    setIllustration(null);
  }, [state.turn]);
  useEffect(() => {
    if (!library) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    catalogue.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener.current?.focus();
    };
  }, [library]);
  const select = (id: CardId) => {
    const target =
      selectedSector !== undefined && state.phase[selectedSector] !== 3
        ? selectedSector
        : (estimates[id]?.target ?? state.phase.findIndex((phase) => phase !== 3));
    onSelect({ card: id, ...(CARDS[id].targeted && target >= 0 ? { target } : {}) });
  };
  return (
    <section className="intervention narrative-hand" aria-label="本回合命令">
      <div className="preparation-bar">
        <button
          className="prepared-command"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          disabled={locked}
        >
          <span>
            <small>本回合命令</small>
            <b>{CARDS[action.card].name}</b>
          </span>
          <span className="command-target">
            {action.target !== undefined && CARDS[action.card].targeted
              ? world.names[action.target]
              : action.card === 'noop'
                ? '等待'
                : '帝国全域'}
          </span>
          <ChevronDown
            size={16}
            className={expanded ? 'command-chevron expanded' : 'command-chevron'}
          />
        </button>
        <div className="preparation-actions">
          <span>{state.influence} 影响力</span>
          <button
            ref={opener}
            title="卡牌图鉴"
            aria-label="打开卡牌图鉴"
            onClick={() => setLibrary(true)}
          >
            <BookOpen size={19} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="prepared-options">
          <div className="card-grid text-commands">
            {hand.map((id) => {
              const unavailable = actionUnavailable(world, state, id);
              return (
                <button
                  key={id}
                  className={`card ${action.card === id ? 'selected' : ''}`}
                  aria-pressed={action.card === id}
                  disabled={!!unavailable || locked}
                  onClick={() => select(id)}
                >
                  <div className="command-category">
                    <span>{CARD_CATEGORY[id]}</span>
                    {action.card === id && <Check className="card-check" size={20} />}
                  </div>
                  <div className="card-copy">
                    <div className="card-label">
                      <h3>{CARDS[id].name}</h3>
                      <span title="所需影响力">{CARDS[id].cost}</span>
                    </div>
                    <p>{CARDS[id].short}</p>
                    {unavailable && <small className="rose">{unavailable}</small>}
                  </div>
                </button>
              );
            })}
          </div>
          {CARDS[action.card].targeted && (
            <label className="target-picker">
              <Crosshair size={17} />
              <span>目的星区</span>
              <select
                aria-label="当前干预目标"
                value={action.target ?? ''}
                disabled={locked}
                onChange={(e) => onSelect({ card: action.card, target: Number(e.target.value) })}
              >
                {Array.from(state.phase, (phase, i) =>
                  phase !== 3 ? (
                    <option key={i} value={i}>
                      {world.names[i]}
                    </option>
                  ) : null,
                )}
              </select>
            </label>
          )}
        </div>
      )}
      {!hasEvent && (
        <div className="quiet-decade">
          <p>{params.strategic ? '这一年，没有新的急电。' : '下一段历史，等待你的决定。'}</p>
          <button
            className="primary"
            onClick={onAdvance}
            disabled={!ready || busy || locked || !!error}
          >
            渡过十年
            <ArrowRight size={17} />
          </button>
        </div>
      )}
      {library && (
        <div
          className="catalogue-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLibrary(false);
          }}
        >
          <div
            className="card-catalogue"
            ref={catalogue}
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalogue-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setLibrary(false);
              if (e.key === 'Tab') {
                const buttons =
                  catalogue.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
                if (!buttons?.length) return;
                if (
                  e.shiftKey &&
                  (document.activeElement === buttons[0] ||
                    document.activeElement === catalogue.current)
                ) {
                  e.preventDefault();
                  buttons[buttons.length - 1].focus();
                } else if (
                  !e.shiftKey &&
                  (document.activeElement === buttons[buttons.length - 1] ||
                    document.activeElement === catalogue.current)
                ) {
                  e.preventDefault();
                  buttons[0].focus();
                }
              }
            }}
          >
            <header>
              <div>
                <span className="eyebrow">帝国干预档案</span>
                <h2 id="catalogue-title">
                  卡牌图鉴 <small>{Object.keys(CARDS).length}</small>
                </h2>
              </div>
              <button aria-label="关闭卡牌图鉴" onClick={() => setLibrary(false)}>
                <X size={20} />
              </button>
            </header>
            <nav aria-label="卡牌类别">
              {['全部', '知识', '政治', '物流', '贸易', '情报', '信念', '等待'].map((c) => (
                <button
                  key={c}
                  aria-pressed={category === c}
                  className={category === c ? 'active' : ''}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </nav>
            <div className="catalogue-grid">
              {(Object.keys(CARDS) as CardId[])
                .filter((id) => category === '全部' || CARD_CATEGORY[id] === category)
                .map((id) => (
                  <article className="catalogue-card" key={id}>
                    <div>
                      <div className="catalogue-meta">
                        <span className="eyebrow">
                          {CARD_CATEGORY[id]} · {CARDS[id].cost} 影响力
                        </span>
                        <button
                          className="illustration-toggle"
                          title={illustration === id ? '收起插画' : `查看${CARDS[id].name}插画`}
                          aria-label={
                            illustration === id ? '收起插画' : `查看${CARDS[id].name}插画`
                          }
                          aria-pressed={illustration === id}
                          onClick={() => setIllustration(illustration === id ? null : id)}
                        >
                          <Image size={16} />
                        </button>
                      </div>
                      <h3>{CARDS[id].name}</h3>
                      <p>{CARD_GUIDANCE[id].why}</p>
                      {illustration === id && (
                        <img
                          className="optional-card-art"
                          src={cardArt(id)}
                          alt={`${CARDS[id].name}插画`}
                        />
                      )}
                      <button
                        disabled={
                          !hand.includes(id) || !!actionUnavailable(world, state, id) || locked
                        }
                        onClick={() => {
                          select(id);
                          setLibrary(false);
                          setExpanded(true);
                        }}
                      >
                        {hand.includes(id)
                          ? (actionUnavailable(world, state, id) ?? '安排此命令')
                          : '不在本回合手牌中'}
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
