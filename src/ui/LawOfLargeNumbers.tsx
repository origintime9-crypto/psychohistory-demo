import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { ForecastResult, Observation, Reveal } from '../engine/types';
import Chart, { chartTheme } from './Chart';
interface Props { forecast: ForecastResult | null; contrast: ForecastResult | null; contrastBusy: boolean; contagion: boolean; shock: boolean; onToggle: (channel: 'contagion' | 'shock', value: boolean) => void; observations: Observation[]; reveals: Reveal[] }
export default function LawOfLargeNumbers({ forecast, contrast, contrastBusy, contagion, shock, onToggle, observations, reveals }: Props) {
  const actual = contrast ?? forecast; const design = actual?.design;
  const independentContrast = !contagion && !shock && contrast !== null;
  const scale = useMemo<EChartsCoreOption>(() => {
    if (!actual) return {};
    return { ...chartTheme, grid: { left: 50, right: 25, top: 20, bottom: 40 }, tooltip: { ...chartTheme.tooltip, formatter: (items: unknown) => { const rows = items as { seriesName: string; value: number[] }[]; return `${rows[0]?.value[0]} 星区<br/>${rows.map(r => `${r.seriesName}：${(r.value[1] * 100).toFixed(1)}%`).join('<br/>')}`; } }, xAxis: { ...chartTheme.xAxis, type: 'log', logBase: 10, min: 1, max: actual.probabilities.length, name: '星区数', nameLocation: 'middle', nameGap: 27 }, yAxis: { ...chartTheme.yAxis, type: 'value', min: 0, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%`, color: '#94a3b7' } }, series: [
      { name: '实测 90% 区间宽度', type: 'line', data: actual.scale.map(p => [p.n, p.width]), symbolSize: 5, lineStyle: { color: '#9ccfc1', width: 2.5 }, itemStyle: { color: '#9ccfc1' } },
      { name: '独立 1/√N 参考', type: 'line', data: actual.scale.map(p => [p.n, p.reference]), showSymbol: false, lineStyle: { color: '#7c8da6', type: 'dashed', width: 1.5 } },
      { name: '相关平台（正态近似）', type: 'line', data: actual.scale.map(p => [p.n, independentContrast ? 0 : p.plateau]), showSymbol: false, lineStyle: { color: '#d5ae6d', type: 'dotted', width: 1.5 } },
    ] };
  }, [actual, independentContrast]);
  const bins = useMemo(() => Array.from({ length: 10 }, (_, b) => { const group = observations.filter(o => Math.min(9, Math.floor(o.probability * 10)) === b); return { count: group.length, p: group.length ? group.reduce((s, o) => s + o.probability, 0) / group.length : (b + .5) / 10, rate: group.length ? group.reduce((s, o) => s + o.outcome, 0) / group.length : 0 }; }), [observations]);
  const reliability = useMemo<EChartsCoreOption>(() => ({ ...chartTheme, tooltip: { ...chartTheme.tooltip, trigger: 'item', formatter: (item: unknown) => { const v = (item as { value: number[] }).value; return `预测 ${(v[0] * 100).toFixed(0)}%<br/>实际 ${(v[1] * 100).toFixed(0)}%<br/>${v[2]} 次观察`; } }, xAxis: { ...chartTheme.xAxis, type: 'value', min: 0, max: 1, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%`, color: '#94a3b7' }, name: '预测', nameTextStyle: { color: '#94a3b7' } }, yAxis: { ...chartTheme.yAxis, type: 'value', min: 0, max: 1, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%`, color: '#94a3b7' } }, series: [{ name: '理想校准', type: 'line', data: [[0, 0], [1, 1]], showSymbol: false, lineStyle: { color: '#536376', type: 'dashed' }, silent: true }, { name: '局部实际频率', type: 'scatter', data: bins.filter(b => b.count).map(b => [b.p, b.rate, b.count]), symbolSize: (value: number[]) => Math.min(18, 5 + Math.sqrt(value[2]) / 2), itemStyle: { color: '#d7b47c' } }] }), [bins]);
  const covered = reveals.filter(r => r.covered).length, pitCovered = reveals.filter(r => r.pitCovered).length;
  const assumedRho = independentContrast ? 0 : Math.max(0, design?.rho ?? 0);
  const extrapolated = Math.sqrt(assumedRho + (1 - assumedRho) / 25000000);
  return <div className="law-panel"><div className="law-intro"><div><div className="eyebrow">谢顿为何能预测未来</div><h2>更多星区，会让未来更清晰吗？</h2><p>局部事件是偶然的。汇总可以抵消噪声，但共同冲击会让群星一起摇摆。</p></div><span className="experiment-badge">五回合预测实验</span></div>
    <p className="law-assumption">基线假设为按兵不动；终局回看使用最后一回合开始时的世界。当前时域 {actual?.H ?? 5} 回合。{independentContrast ? '独立对照的理论相关为零，有限采样的微小相关估计不会用于平台或外推。' : ''}</p>
    <div className="law-grid"><section className="panel"><div className="panel-heading"><h3>精度与规模</h3><span className="subtle">危机占比的区间宽度</span></div>
      <div className="contrast-controls"><label><input type="checkbox" checked={contagion} onChange={e => onToggle('contagion', e.target.checked)} />邻区传染</label><label><input type="checkbox" checked={shock} onChange={e => onToggle('shock', e.target.checked)} />共同冲击</label><span>{contrastBusy ? '对照推演中…' : !contagion && !shock ? '独立对照 · 固定财政/治理' : '统计对照'}</span></div>
      {actual ? <Chart option={scale} label="危机占比区间宽度随星区数量增加的变化，与独立参考和相关平台比较" height={245} /> : <div className="chart-loading">等待模拟样本</div>}
      <div className="line-legend"><span className="mint">— 实测区间</span><span>┄ 独立参考</span><span className="gold">··· 相关平台</span></div><p className="chart-note">随机子集的 90% 区间，8 次抽样平均。参考与平台是异质星区的近似；短程曲线不保证单调。开关只改变此面板的对照，当前游戏不变。</p>
      <div className="design-stats"><div><span>设计效应</span><b>{design?.deff.toFixed(2) ?? '—'}<small>Var(总和) / ΣVar(局部)</small></b></div><div><span>有效独立星区</span><b>{design?.effectiveN.toFixed(1) ?? '—'}<small>名义规模 / 设计效应</small></b></div><div><span>加权相关</span><b>{design?.rho.toFixed(3) ?? '—'}<small>异质方差加权</small></b></div></div>
    </section><section className="panel"><div className="panel-heading"><h3>局部事件，也需要校准</h3><span className="subtle">{observations.length} 次星区观察</span></div><Chart option={reliability} label="星区概率可靠性图，预测概率与实际频率比较" height={245} />
      <p className="chart-note">每个点对应一个概率分箱；横轴预测，纵轴实际。样本少时偏离对角线很正常。星区与回合存在相关，这些观察并非独立试验。</p>
      <div className="cv-comparison"><div><span>单星区 · 平均变异系数</span><b>{design?.localCV.toFixed(2) ?? '—'}</b></div><span>→</span><div><span>帝国总体 · 变异系数</span><b className="mint">{design?.totalCV.toFixed(2) ?? '—'}</b></div></div>
      <div className="calibration-row"><div><span>整数 90% 区间命中</span><b>{reveals.length ? `${covered}/${reveals.length}` : '—'}</b></div><div><span>随机化 PIT 中央 90%</span><b>{reveals.length ? `${pitCovered}/${reveals.length}` : '—'}</b></div></div><p className="chart-note">只记选卡后的一步预测。整数区间可保守；PIT 在同值概率质量内随机取位，长期校准才应接近 90%。18 回合不足以验证命中率。</p>
    </section></div>
    <section className="extrapolation"><span className="extrapolation-number">25,000,000<small>原著中的世界</small></span><div><h3>大数定律有一个前提：命运不能完全相连。</h3><p>若保持当前相关结构，外推的标准差约是单星区的 <b>{(extrapolated * 100).toFixed(1)}%</b>；独立时约为 <b>0.02%</b>。“骡”式冲击让独立性失效，也解释了第二基地为何必须存在。</p><small>这是合成模型的假设外推，2500 万世界并未被模拟。负相关估计在此外推中按零处理。</small></div></section>
    <p className="model-note">模型来源：<a href="https://scip.gmu.edu/a-global-model-for-forecasting-political-instability/" target="_blank" rel="noreferrer">PITF 政治动荡研究</a>、<a href="https://peterturchin.com/research/structural-demographic-theory" target="_blank" rel="noreferrer">结构人口理论</a>提供定性启发；数值由游戏设计和合成模拟决定。预测器知道真实生成模型，因此这不是对现实社会预测能力的证明。</p>
  </div>;
}
