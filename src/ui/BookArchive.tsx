import { useRef } from 'react';
import { BOOKS, STORY_SOURCES } from '../engine/books';
import type { State } from '../engine/types';
import { chapterTitle } from '../engine/campaign';

export default function BookArchive({ state }: { state?: State }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const completed = Object.entries(state?.chronicle?.resolved ?? {});
  return (
    <>
      <button type="button" className="text-button" onClick={() => dialog.current?.showModal()}>
        原著档案 ↗
      </button>
      <dialog className="book-archive" ref={dialog} aria-labelledby="book-archive-title">
        <div className="book-archive-heading">
          <div>
            <span className="eyebrow">GALACTIC LIBRARY</span>
            <h2 id="book-archive-title">原著档案</h2>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => dialog.current?.close()}
            aria-label="关闭原著档案"
            autoFocus
          >
            关闭 ×
          </button>
        </div>
        <p>
          本局主线改编自《基地》《基地与帝国》《第二基地》。事件和选择重新编写，300
          年时间轴压缩了故事顺序；年代、概率和制度效果是游戏设定。你接续历代执掌者的工作。
        </p>
        <div className="book-reading">
          <b>从哪里读起</b>
          <p>
            初读可从《基地》三部曲开始，再读《基地边缘》《基地与地球》，最后回看两部前传。下列是常见中文
            15
            卷组合；不同版本的译名、收录与编号可能不同。《我，机器人》是短篇集，另四本是机器人长篇。
          </p>
        </div>
        {['基地', '帝国', '机器人'].map((group) => (
          <section key={group} aria-label={`${group}书目`}>
            <h3>
              {group}系列{' '}
              <small>
                {group === '基地' ? '7 卷' : group === '帝国' ? '3 卷' : '短篇集 + 4 部长篇'}
              </small>
            </h3>
            <div className="book-grid">
              {Object.values(BOOKS)
                .filter((b) => b.group === group)
                .map((book, index) => (
                  <article key={book.english}>
                    <span className="book-spine">
                      {group === '基地' ? 'F' : group === '帝国' ? 'E' : 'R'}
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h4>{book.title}</h4>
                      <small lang="en">{book.english}</small>
                      <p>{book.role}</p>
                      <a href={book.url} target="_blank" rel="noreferrer">
                        核对书目 ↗
                      </a>
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
        {completed.length > 0 && (
          <section className="book-your-history">
            <h3>你已写下的章节</h3>
            <ol>
              {completed.map(([id, record]) => (
                <li key={id}>
                  <b>{chapterTitle(id)}</b>
                  <span>
                    第 {record.turn} 回合 · {record.label}
                    {record.success ? '' : ' · 行动失利'}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <details className="book-references">
          <summary>资料来源与改编说明</summary>
          <p>
            书目核对：
            <a
              href="https://www.penguinrandomhouse.com/series/FOU/foundation/"
              target="_blank"
              rel="noreferrer"
            >
              Penguin Random House 基地系列
            </a>
            、
            <a
              href="https://www.penguinrandomhouseretail.com/book/?isbn=9798217093472"
              target="_blank"
              rel="noreferrer"
            >
              机器人书目
            </a>
            、
            <a
              href="https://books.google.com/books/about/Triangle.html?id=iNc2AAAAIAAJ"
              target="_blank"
              rel="noreferrer"
            >
              帝国三部曲馆藏记录
            </a>
            。
          </p>
          <p>
            情节交叉核对：
            {Object.entries(STORY_SOURCES).map(([id, url]) => (
              <a key={id} href={url} target="_blank" rel="noreferrer">
                《{BOOKS[id as keyof typeof STORY_SOURCES].title}》条目 ↗{' '}
              </a>
            ))}
            。这些链接包含完整情节。
          </p>
          <p>
            这里使用阿西莫夫小说的情节线索，不使用影视改编设定。游戏结果可以偏离原著；《基地边缘》与《基地与地球》的更晚故事留在后续阅读中。
          </p>
        </details>
      </dialog>
    </>
  );
}
