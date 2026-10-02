import { useState } from 'react';
import { applyAction, CARDS } from '../engine/cards';
import { step } from '../engine/dynamics';
import { transitionProbabilities } from '../engine/hazard';
import { DEFAULT_PARAMS, TOTAL_TURNS } from '../engine/params';
import { stream } from '../engine/rng';
import { counts, type CardId, type World } from '../engine/types';
import { initialState } from '../engine/worldgen';

const lessons = ['你的任务', '亲自试一次', '进入银河'];
const colors = ['#7cbaad', '#d4bd80', '#df626b', '#627184'];
export default function OpeningGuide({
  world,
  lesson,
  onNext,
  onSkip,
}: {
  world: World;
  lesson: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [practice, setPractice] = useState<{
    card: CardId;
    attempt: number;
    result: ReturnType<typeof step> | null;
  }>({ card: 'academy', attempt: 0, result: null });
  const before = initialState(world),
    target = world.terminus;
  const action = { card: practice.card, ...(CARDS[practice.card].targeted ? { target } : {}) };
  const after = applyAction(world, before, action, 0).state;
  const risk = (s: typeof before) => {
    const p = transitionProbabilities(world, s, target, 0, DEFAULT_PARAMS);
    return Math.round((p[1] + p[2]) * 100);
  };
  const resultCounts = practice.result ? counts(practice.result.state) : null;
  const simulate = () =>
    setPractice((current) => ({
      ...current,
      attempt: current.attempt + 1,
      result: step(world, before, action, stream(world.seed, `practice:${current.attempt}`), {
        ...DEFAULT_PARAMS,
        mule: false,
        storyEvents: false,
      }),
    }));
  return (
    <main className="opening-guide">
      <header>
        <div className="brand">
          <span>✧</span>
          <div>
            <b>心理史学</b>
            <small>进入谢顿计划之前</small>
          </div>
        </div>
        <button className="text-button" onClick={onSkip}>
          跳过，直接进入 →
        </button>
      </header>
      <nav aria-label="入门进度">
        {lessons.map((name, i) => (
          <span key={name} className={lesson === i ? 'active' : lesson > i ? 'done' : ''}>
            <b>0{i + 1}</b>
            {name}
          </span>
        ))}
      </nav>
      <section className="briefing-layout">
        <div className="briefing-copy">
          <div className="eyebrow">川陀机密档案 / 入门 {lesson + 1} · 3</div>
          <h1>
            {lesson === 0 ? (
              <>
                帝国会衰落。
                <br />
                <em>文明能留下多少？</em>
              </>
            ) : lesson === 1 ? (
              <>
                一条命令，
                <br />
                <em>改变条件，迎接未知。</em>
              </>
            ) : (
              <>
                准备好了。
                <br />
                <em>现在轮到你选择。</em>
              </>
            )}
          </h1>
          {lesson === 0 ? (
            <>
              <p>你是哈里·谢顿。边疆的粮价、地方贵族的争斗和衰弱的国库，正在把帝国推向分裂。</p>
              <p>
                你掌握有限的<strong>影响力</strong>。在 {TOTAL_TURNS} 回合、{TOTAL_TURNS * 10}{' '}
                年里，救助还能维持秩序的星区，把知识转移到端点星的基地。
              </p>
              <div className="briefing-objectives">
                <article>
                  <span>◈</span>
                  <b>守住秩序</b>
                  <p>稳定星区越多，文明恢复越快。只做维稳也有成果。</p>
                </article>
                <article>
                  <span>△</span>
                  <b>留下知识</b>
                  <p>基地越完整，走出黑暗时代越快。失去稳定与端点星，建设会变慢。</p>
                </article>
              </div>
              <p className="briefing-note">
                结算看基地进度与末三回合的稳定占比。目标是缩短黑暗时代，途中可以随时看到预估年数。
              </p>
            </>
          ) : lesson === 1 ? (
            <>
              <p>
                给学院经费会提高繁荣，安置精英能缓解职位争夺，减税能换来支持。每条命令都要付出影响力或财政代价。
              </p>
              <p>
                选择一张卡，观察端点星的条件变化，再试推演一个十年。同样的命令，也可能迎来不同的历史结果。
              </p>
              <div className="practice-cards">
                {(['academy', 'elites', 'tax'] as CardId[]).map((card) => (
                  <button
                    key={card}
                    aria-pressed={practice.card === card}
                    className={practice.card === card ? 'selected' : ''}
                    onClick={() => setPractice((current) => ({ ...current, card, result: null }))}
                  >
                    {CARDS[card].symbol}
                    <b>{CARDS[card].name}</b>
                    <small>{CARDS[card].cost} 点影响力</small>
                  </button>
                ))}
              </div>
              <p className="briefing-note">
                这是练习，不消耗本局资源。风险示范固定共同冲击为零；真正推演还有随机变化。
              </p>
            </>
          ) : (
            <>
              <p>
                每回合先读急电，决定怎样回应；再从手牌中选择一条命令。定向命令可以在星图改选目标。
              </p>
              <ol className="briefing-loop">
                <li>
                  <b>读事件</b>
                  <span>地点、原因与三个取舍。部分谈判有成功和失败。</span>
                </li>
                <li>
                  <b>选命令</b>
                  <span>先看当地效果与代价，再看预估黑暗时代的变化。</span>
                </li>
                <li>
                  <b>推进十年</b>
                  <span>看命令生效、星区恢复或失守，继续回应新局势。</span>
                </li>
              </ol>
              <p>
                影响力每回合恢复 1 点，按兵不动额外积蓄 2
                点。事件与行动共享资源，要给下一次危机留出余地。
              </p>
              <p className="briefing-note">
                进度自动保存，刷新可继续。预测是参考；若启用“骡”，模型不知道它何时到来。
              </p>
            </>
          )}
          <div className="briefing-actions">
            <button className="primary" onClick={onNext}>
              {lesson === 0
                ? '看一次命令如何生效 →'
                : lesson === 1
                  ? '我明白了，继续 →'
                  : '进入第 1 回合 →'}
            </button>
            <span>随时可在游戏内重看玩法说明</span>
          </div>
        </div>
        <div className={`briefing-visual lesson-${lesson}`}>
          {lesson === 1 ? (
            <>
              <div className="eyebrow">模拟训练 / 端点星</div>
              <h2>命令先改变条件</h2>
              <div className="practice-comparison">
                {(
                  [
                    ['繁荣', 'prosperity'],
                    ['精英竞争', 'elites'],
                    ['合法性', 'legitimacy'],
                  ] as const
                ).map(([label, field]) => (
                  <div key={field}>
                    <span>{label}</span>
                    <div className="comparison-track">
                      <i style={{ width: `${before[field][target] * 100}%` }} />
                      <b style={{ width: `${after[field][target] * 100}%` }} />
                    </div>
                    <strong>
                      {Math.round(before[field][target] * 100)}% →{' '}
                      {Math.round(after[field][target] * 100)}%
                    </strong>
                  </div>
                ))}
              </div>
              <div className="practice-risk">
                <span>端点星下一步危机风险示范</span>
                <b>
                  {risk(before)}% <i>→</i> {risk(after)}%
                </b>
              </div>
              <button className="secondary" onClick={simulate}>
                {practice.result ? '从相同条件再试一次 ↻' : '试推演一个十年 →'}
              </button>
              <div className="practice-stars" aria-label="练习推演的星区状态">
                {Array.from({ length: world.n }, (_, i) => (
                  <i key={i} style={{ background: colors[practice.result?.state.phase[i] ?? 0] }} />
                ))}
              </div>
              <p className="practice-result" aria-live="polite">
                {resultCounts
                  ? `第 ${practice.attempt} 次练习：${resultCounts.stable} 个稳定、${resultCounts.unrest} 个动荡、${resultCounts.rebellion} 个叛乱。条件改善了，结果仍有偶然。`
                  : '点一次推演，看哪些星区进入动荡。再试一次，可以看到不同的随机结果。'}
              </p>
            </>
          ) : (
            <>
              <div className="briefing-galaxy" aria-hidden="true">
                <i className="galaxy-orbit" />
                <i className="galaxy-orbit second" />
                <span className="briefing-capital">
                  ✧<small>川陀 / 帝国</small>
                </span>
                <span className="briefing-terminus">
                  △<small>端点星 / 基地</small>
                </span>
                <svg viewBox="0 0 400 230">
                  <path
                    d="M100 95 Q225 10 330 145"
                    fill="none"
                    stroke="#d9b47e"
                    strokeDasharray="5 7"
                  />
                  <circle cx="100" cy="95" r="25" fill="#7cbaad22" />
                  <circle cx="330" cy="145" r="20" fill="#d9b47e22" />
                </svg>
                <p>转移知识 · 保留秩序</p>
              </div>
              <h2>星区为什么会失守</h2>
              <div className="phase-story">
                {['稳定', '动荡', '叛乱', '独立'].map((name, i) => (
                  <div key={name}>
                    <i style={{ background: colors[i] }} />
                    <b>{name}</b>
                    <span>
                      {
                        [
                          '正常生产与纳税',
                          '抗议、停工，仍能平息',
                          '公开武装对抗，财政受损',
                          '退出帝国，无法收回',
                        ][i]
                      }
                    </span>
                  </div>
                ))}
              </div>
              <p className="briefing-note">
                动荡和叛乱都可能恢复稳定；叛乱也可能演变为独立。独立不是“危机消失”，而是帝国失去一个星区。
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
