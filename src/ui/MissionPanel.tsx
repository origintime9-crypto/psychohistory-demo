import { TOTAL_TURNS } from '../engine/params';
import { counts, type State, type World } from '../engine/types';
export default function MissionPanel({ world, state }: { world: World; state: State }) {
  const c = counts(state),
    chapter = Math.min(2, Math.floor(state.turn / 10));
  const advice =
    state.phase[world.terminus] === 3
      ? '端点星已失守，知识建设仍可继续，但效率降低。守住其余星区，尽量缩短黑暗时代。'
      : state.phase[world.terminus] > 0
        ? '端点星正在危机中。先帮助基地所在星区恢复秩序，建设才能更有效。'
        : state.treasury < 0.25
          ? '国库正在见底。减负和援助需要谨慎，优先留住生产与纳税仍正常的星区。'
          : c.rebellion > 0
            ? `${c.rebellion} 个星区陷入叛乱。它们可能独立；关注派系竞争、合法性与邻区传染。`
            : state.foundation < 0.1
              ? '知识还没有足够的落脚点。找机会建设基地，同时照看边疆的粮价与派系竞争。'
              : '秩序与知识都要留住。根据事件和星区的具体问题选卡，为下一轮保留影响力。';
  return (
    <section className="mission-panel" aria-label="当前目标">
      <div className="chapter-title">
        <span>第 {['一', '二', '三'][chapter]} 幕</span>
        <h2>{['衰落的征兆', '裂变的银河', '黑夜里的火种'][chapter]}</h2>
        <p>目标：守住秩序 · 把知识送往基地</p>
      </div>
      <div className="mission-progress">
        <div className="chapter-timeline" aria-label={`已完成 ${state.turn} / ${TOTAL_TURNS} 回合`}>
          {Array.from({ length: TOTAL_TURNS }, (_, i) => (
            <i
              key={i}
              className={i < state.turn ? 'complete' : i === state.turn ? 'current' : ''}
            />
          ))}
        </div>
        <p>{advice}</p>
      </div>
      <details className="rules-help">
        <summary>怎么玩？</summary>
        <p>
          每回合回应事件，再选择一张命令。繁荣与合法性低、派系竞争高的星区更容易出问题。事件与命令共享影响力和国库。
        </p>
        <p>
          最终成绩看基地与末三回合的稳定占比。黑暗时代预估越短越好；预测不保证结果，未知冲击可以打破区间。
        </p>
      </details>
    </section>
  );
}
