import { useState } from 'react';
export default function SetupScreen({ onStart }: { onStart: (seed: string, n: number, mule: boolean) => void }) {
  const [seed, setSeed] = useState('SELDON-12067'); const [n, setN] = useState(50); const [mule, setMule] = useState(false);
  return <main className="setup">
    <div className="setup-art" aria-hidden="true"><div className="orbit orbit-1" /><div className="orbit orbit-2" /><div className="orbit orbit-3" /><div className="setup-star" /><span className="orbital-label">川陀 · 银河纪元 12067</span><span className="terminus-dot" /><span className="terminus-label">端点星</span></div>
    <section className="setup-content">
      <div className="eyebrow"><span className="small-star">✧</span> 基地 · 心理史学实验</div>
      <h1>未来并非注定。<br /><span>但它有迹可循。</span></h1>
      <p className="setup-intro">你是哈里·谢顿。帝国正在衰落，而你有 180 年，<br className="desktop-only" />为银河保留一条走出黑暗的路。</p>
      <div className="setup-steps"><div><b>01</b><span>看见趋势<small>预测未来五个十年</small></span></div><div><b>02</b><span>介入历史<small>选择干预，预览代价</small></span></div><div><b>03</b><span>见证现实<small>让概率与结果相遇</small></span></div></div>
      <form onSubmit={e => { e.preventDefault(); onStart(seed.trim() || 'SELDON-12067', n, mule); }}>
        <label className="input-label" htmlFor="seed">世界种子 <span>相同种子与选择，可复现同一条历史</span></label>
        <div className="seed-row"><input id="seed" name="seed" maxLength={80} value={seed} onChange={e => setSeed(e.target.value)} /><button type="button" className="icon-button" title="生成新种子" aria-label="生成新种子" onClick={() => setSeed(`SELDON-${Math.floor(Math.random() * 1000000)}`)}>↻</button></div>
        <fieldset className="size-choice"><legend>帝国规模</legend>{[30, 50, 80].map(size => <label key={size} className={n === size ? 'chosen' : ''}><input type="radio" name="size" value={size} checked={n === size} onChange={() => setN(size)} /><b>{size}</b> 星区<span>{size === 30 ? '小型推演' : size === 50 ? '标准体验' : '广域观察'}</span></label>)}</fieldset>
        <label className="check-label"><input type="checkbox" checked={mule} onChange={e => setMule(e.target.checked)} /><span>加入“骡”的冲击 <small>第 100 年出现一次强共同冲击；预测会计入此设定</small></span></label>
        <button className="primary start-button" type="submit">开始谢顿计划 <span>↗</span></button>
      </form>
      <p className="setup-foot">18 回合 · 每回合 10 年 · 约 10 分钟<br />合成世界的统计实验。预测器与现实使用同一个模型，随机流相互独立。</p>
    </section>
  </main>;
}
