import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Map, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DecadeChapter } from '../engine/decade';

export default function DecadeNarrative({
  chapter: latest,
  chapters,
  complete = false,
  onContinue,
  onMap,
}: {
  chapter: DecadeChapter;
  chapters: DecadeChapter[];
  complete?: boolean;
  onContinue: () => void;
  onMap: (focus: number) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const prose = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(latest.turn - 1);
  const chapter = chapters[index] ?? latest;
  useEffect(() => {
    prose.current?.scrollTo(0, 0);
  }, [index]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="narrative-backdrop">
      <div
        className="decade-narrative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decade-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onContinue();
          }
          if (event.key === 'Tab') {
            const buttons =
              dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
            if (!buttons?.length) return;
            if (
              event.shiftKey &&
              (document.activeElement === buttons[0] || document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              buttons[buttons.length - 1].focus();
            } else if (
              !event.shiftKey &&
              (document.activeElement === buttons[buttons.length - 1] ||
                document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              buttons[0].focus();
            }
          }
        }}
      >
        <header className="narrative-cover">
          <nav className="chapter-navigation" aria-label="手记翻页">
            <button
              title="上一卷"
              aria-label="上一卷手记"
              disabled={index <= 0}
              onClick={() => setIndex(index - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              {index + 1} / {chapters.length}
            </span>
            <button
              title="下一卷"
              aria-label="下一卷手记"
              disabled={index >= chapters.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </nav>
          <div className="narrative-heading">
            <span className="eyebrow">
              <BookOpen size={14} />第 {chapter.turn} 卷 · 十年手记
            </span>
            <h2 id="decade-title">{chapter.title}</h2>
            <p>
              银河纪元 {12067 + (chapter.turn - 1) * 10} 至 {12067 + chapter.turn * 10} ·{' '}
              {chapter.location}
            </p>
          </div>
        </header>
        <article className="narrative-prose" ref={prose}>
          {chapter.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <div className="narrative-end">本卷终</div>
        </article>
        <footer>
          <button onClick={() => onMap(chapter.focus)}>
            <Map size={16} />
            察看星图
          </button>
          <button className="primary" onClick={onContinue}>
            {complete ? '查看结局' : '继续推演'}
            <ArrowRight size={17} />
          </button>
        </footer>
      </div>
    </div>
  );
}
