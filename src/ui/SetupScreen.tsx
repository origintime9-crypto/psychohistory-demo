import { useState } from 'react';
import { TOTAL_TURNS } from '../engine/params';
export default function SetupScreen({
  onStart,
}: {
  onStart: (seed: string, n: number, mule: boolean) => void;
}) {
  const [seed, setSeed] = useState('SELDON-12067');
  const [n, setN] = useState(50);
  const [mule, setMule] = useState(false);
  return (
    <main className="setup">
      <div className="setup-art" aria-hidden="true">
        <div className="orbit orbit-1" />
        <div className="orbit orbit-2" />
        <div className="orbit orbit-3" />
        <div className="setup-star" />
        <span className="orbital-label">川陀 · 银河纪元 12067</span>
        <span className="terminus-dot" />
        <span className="terminus-label">端点星</span>
      </div>
      <section className="setup-content">
        <div className="eyebrow">
          <span className="small-star">✧</span> 基地 · 心理史学实验
        </div>
        <h1>
          帝国正在崩塌。
          <br />
          <span>为文明留下一条活路。</span>
        </h1>
        <p className="setup-intro">
          你是哈里·谢顿。在 {TOTAL_TURNS} 回合、{TOTAL_TURNS * 10} 年里，
          <br className="desktop-only" />
          回应边疆急电、守住星区、把知识送往基地。
        </p>
        <div className="setup-steps">
          <div>
            <b>01</b>
            <span>
              收到急电<small>读懂地点、原因与取舍</small>
            </span>
          </div>
          <div>
            <b>02</b>
            <span>
              下达命令<small>选择回应与一张干预卡</small>
            </span>
          </div>
          <div>
            <b>03</b>
            <span>
              见证后果<small>看星区恢复、失守或独立</small>
            </span>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onStart(seed.trim() || 'SELDON-12067', n, mule);
          }}
        >
          <label className="input-label" htmlFor="seed">
            世界种子 <span>相同种子与选择，可复现同一条历史</span>
          </label>
          <div className="seed-row">
            <input
              id="seed"
              name="seed"
              maxLength={80}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              title="生成新种子"
              aria-label="生成新种子"
              onClick={() => setSeed(`SELDON-${Math.floor(Math.random() * 1000000)}`)}
            >
              ↻
            </button>
          </div>
          <fieldset className="size-choice">
            <legend>帝国规模</legend>
            {[30, 50, 80].map((size) => (
              <label key={size} className={n === size ? 'chosen' : ''}>
                <input
                  type="radio"
                  name="size"
                  value={size}
                  checked={n === size}
                  onChange={() => setN(size)}
                />
                <b>{size}</b> 星区
                <span>{size === 30 ? '小型推演' : size === 50 ? '标准体验' : '广域观察'}</span>
              </label>
            ))}
          </fieldset>
          <label className="check-label">
            <input type="checkbox" checked={mule} onChange={(e) => setMule(e.target.checked)} />
            <span>
              加入“骡”的冲击 <small>在随机回合出现；预测器不知其存在，用于观察模型的边界</small>
            </span>
          </label>
          <button className="primary start-button" type="submit">
            开始谢顿计划 <span>↗</span>
          </button>
        </form>
        <p className="setup-foot">
          {TOTAL_TURNS} 回合 · 每回合 10 年 · 入门引导与自动续玩
          <br />
          事件随种子与局势变化。同样的命令，也可能迎来不同的历史。
        </p>
      </section>
    </main>
  );
}
