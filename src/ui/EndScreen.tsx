import { score } from '../engine/scoring';
import type { Action, HistoryPoint, Observation, Reveal, State, World } from '../engine/types';
import type { Params } from '../engine/params';
import Chart, { chartTheme } from './Chart';
import { useMemo } from 'react';
export default function EndScreen({ world, state, history, reveals, observations, actions, params, onRestart, onReview }: { world: World; state: State; history: HistoryPoint[]; reveals: Reveal[]; observations: Observation[]; actions: Action[]; params: Params; onRestart: () => void; onReview: () => void }) {
  const result = score(state.foundation, history); const coverage = reveals.filter(r => r.covered).length;
  const brier = observations.length ? observations.reduce((s, o) => s + (o.probability - o.outcome) ** 2, 0) / observations.length : 0;
  const option = useMemo(() => ({ ...chartTheme, grid: { ...chartTheme.grid, top: 30 }, xAxis: { ...chartTheme.xAxis, type: 'category', data: history.map(h => `${h.turn * 10}`) }, yAxis: { ...chartTheme.yAxis, type: 'value', min: 0, max: 1, axisLabel: { color: '#94a3b7', formatter: (v: number) => `${Math.round(v * 100)}%` } }, series: [{ name: '稳定星区', type: 'line', data: history.map(h => h.stable), showSymbol: false, itemStyle: { color: '#87bcae' }, lineStyle: { width: 2 } }, { name: '基地进度', type: 'line', data: history.map(h => h.foundation), showSymbol: false, itemStyle: { color: '#d9b47e' }, lineStyle: { width: 2 } }, { name: '独立星区', type: 'line', data: history.map(h => h.independent), showSymbol: false, itemStyle: { color: '#8292ab' }, lineStyle: { width: 1.5, type: 'dashed' } }] }), [history]);
  const exportReport = () => {
    const data = { seed: world.seed, sectors: world.n, params, actions, result, history, reveals, observations, model: 'synthetic-v1', seedProtocol: 'world.seed → map / initial / deck:turn / reality / calibration / prediction:turn', disclaimer: '预测器与现实使用同一模型，随机流隔离；不是现实政治预测。' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = '谢顿计划-终局报告.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main className="end-screen"><div className="eyebrow">谢顿计划 · 180 年推演结束</div><h1>{result.Q >= .65 ? '黑暗之中，已留下火种。' : result.Q > .25 ? '银河的下一页，仍有希望。' : '帝国消逝，历史仍在继续。'}</h1><p className="end-intro">你无法决定每一颗星的命运，却改变了它们汇成的历史。</p>
    <section className="darkness-result"><span>预计黑暗时代</span><div><strong>{result.darkness.toLocaleString('zh-CN')}</strong><b>年</b></div><p>原著基准 30,000 年 <span>→</span> 缩短 {Math.round((1 - result.darkness / 30000) * 100)}%</p></section>
    <div className="end-stat-grid"><div><span>基地进度 F</span><b>{Math.round(result.F * 100)}%</b></div><div><span>末三回合稳定 S</span><b>{Math.round(result.S * 100)}%</b></div><div><span>计划得分 √(F·S)</span><b>{result.Q.toFixed(3)}</b></div><div><span>90% 整数区间命中</span><b>{coverage}/{reveals.length}</b></div></div>
    <section className="panel end-chart"><div className="panel-heading"><h3>你所改变的历史</h3><span className="subtle">种子 {world.seed} · {world.n} 星区</span></div><Chart option={option} label="18 回合稳定占比、基地进度和独立占比历史" height={235} /><div className="line-legend"><span className="mint">— 稳定星区</span><span className="gold">— 基地进度</span><span>┄ 独立星区</span></div></section>
    <div className="end-calibration"><h3>预测的边界</h3><p>随机化 PIT 中央 90% 命中 {reveals.filter(r => r.pitCovered).length}/{reveals.length}；星区 Brier 分数 {brier.toFixed(3)}（越低越好）。整数区间可保守；这一局的 18 次观察不足以检验长期校准，100% 命中也不是目标。</p><p>得分衡量知识留存与稳定程度。所有数据来自合成世界，预测器使用真实模型。</p></div>
    <div className="end-actions"><button className="primary" onClick={onRestart}>重新开始 <span>↗</span></button><button className="secondary" onClick={onReview}>查看帝国与统计</button><button className="text-button" onClick={exportReport}>导出终局报告 ↓</button></div>
  </main>;
}
