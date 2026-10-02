import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { ForecastResult, HistoryPoint, Reveal } from '../engine/types';
import Chart, { chartTheme } from './Chart';
export default function ForecastPanel({
  forecast,
  history,
  turn,
  reveal,
  mule = false,
}: {
  forecast: ForecastResult | null;
  history: HistoryPoint[];
  turn: number;
  reveal: Reveal | null;
  mule?: boolean;
}) {
  const fan = useMemo<EChartsCoreOption>(() => {
    if (!forecast) return {};
    const points = forecast.points,
      categories = points.map((_, i) => `${(turn + i + 1) * 10}`);
    const series = [
      {
        name: '90% 下界',
        type: 'line',
        stack: '90',
        data: points.map((p) => p.lo90),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
        silent: true,
      },
      {
        name: '90% 区间',
        type: 'line',
        stack: '90',
        data: points.map((p) => p.hi90 - p.lo90),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color: '#75b7ac', opacity: 0.12 },
        silent: true,
      },
      {
        name: '50% 下界',
        type: 'line',
        stack: '50',
        data: points.map((p) => p.lo50),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
        silent: true,
      },
      {
        name: '50% 区间',
        type: 'line',
        stack: '50',
        data: points.map((p) => p.hi50 - p.lo50),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color: '#75b7ac', opacity: 0.23 },
        silent: true,
      },
      {
        name: '期望危机数',
        type: 'line',
        data: points.map((p) => Number(p.mean.toFixed(2))),
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#8cc6b9', width: 2 },
        itemStyle: { color: '#8cc6b9' },
      },
    ];
    return {
      ...chartTheme,
      tooltip: {
        ...chartTheme.tooltip,
        formatter: (items: unknown) => {
          const rows = items as { dataIndex: number }[];
          const i = rows[0]?.dataIndex ?? 0,
            p = points[i];
          return `第 ${categories[i]} 年<br/>期望 ${p.mean.toFixed(1)} 个危机星区<br/>50%：${p.lo50}–${p.hi50}<br/>90%：${p.lo90}–${p.hi90}`;
        },
      },
      xAxis: {
        ...chartTheme.xAxis,
        type: 'category',
        boundaryGap: false,
        data: categories,
        name: '年',
        nameTextStyle: { color: '#6c7e90' },
      },
      yAxis: { ...chartTheme.yAxis, type: 'value', minInterval: 1 },
      series,
    } as EChartsCoreOption;
  }, [forecast, turn]);
  const distribution = useMemo<EChartsCoreOption>(() => {
    if (!forecast) return {};
    const nonzero = forecast.histogram.map((p, k) => ({ k, p })).filter((x) => x.p > 0);
    const low = Math.max(0, Math.min(nonzero[0]?.k ?? 0, reveal?.actual ?? Infinity) - 1),
      high = Math.min(
        forecast.histogram.length - 1,
        Math.max(nonzero.at(-1)?.k ?? 0, reveal?.actual ?? -Infinity) + 1,
      );
    const labels = Array.from({ length: high - low + 1 }, (_, i) => i + low);
    return {
      ...chartTheme,
      grid: { ...chartTheme.grid, top: 12, bottom: 28 },
      tooltip: {
        ...chartTheme.tooltip,
        formatter: (items: unknown) => {
          const row = (items as { name: string; value: number }[])[0];
          return `${row.name} 个危机星区<br/>预测频率 ${(row.value * 100).toFixed(1)}%`;
        },
      },
      xAxis: { ...chartTheme.xAxis, type: 'category', data: labels.map(String) },
      yAxis: {
        ...chartTheme.yAxis,
        type: 'value',
        axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%`, color: '#94a3b7' },
      },
      series: [
        {
          name: '预测频率',
          type: 'bar',
          data: labels.map((k) => ({
            value: forecast.histogram[k],
            itemStyle: { color: reveal && k === reveal.actual ? '#e0be80' : '#527e7c' },
          })),
          barMaxWidth: 18,
          ...(reveal
            ? {
                markLine: {
                  symbol: 'none',
                  lineStyle: { color: '#e0be80', width: 2 },
                  label: { formatter: `实际 ${reveal.actual}`, color: '#e0be80' },
                  data: [{ xAxis: String(reveal.actual) }],
                },
              }
            : {}),
        },
      ],
    };
  }, [forecast, reveal]);
  const point = forecast?.points[0];
  return (
    <section className="panel forecast-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">心理史学预测</div>
          <h2>未来的可能形状</h2>
        </div>
        <span className="subtle">{forecast ? `${forecast.M} 条路径` : '推演中'}</span>
      </div>
      <div className="forecast-summary">
        <div>
          <span>下个十年 · 期望危机</span>
          <strong>
            {point ? point.mean.toFixed(1) : '—'}
            <small> 星区</small>
          </strong>
        </div>
        <div className="interval-number">
          <span>90% 预测区间</span>
          <b>{point ? `${point.lo90} — ${point.hi90}` : '—'}</b>
        </div>
      </div>
      <div className="forecast-plot">
        <div className="chart-subtitle">
          <span>未来 {forecast?.H ?? 5} 个十年</span>
          <div>
            <i className="band90" />
            90%
            <i className="band50" />
            50%
          </div>
        </div>
        {forecast ? (
          <Chart
            option={fan}
            label="未来五回合活跃危机数的期望、50% 与 90% 预测区间"
            height={204}
          />
        ) : (
          <div className="chart-loading">正在抽样可能的历史…</div>
        )}
        <p className="chart-note">
          按当前回应与命令推演，之后按兵不动、暂缓未来事件。阴影是可能结果的区间；随机事件会改变历史，“骡”未计入。
        </p>
        {mule && (
          <p className="mule-explanation">
            “骡”已出现。金色实际值与事前预测比较，展示未知共同冲击如何突破聚合预测的边界；事件没有被事先塞进预测区间。
          </p>
        )}
      </div>
      <div className="forecast-plot">
        <div className="section-line" />
        <div className="chart-subtitle">
          <span>{reveal ? `第 ${reveal.turn * 10} 年 · 预测与现实` : '下回合 · 危机数分布'}</span>
          <span>{reveal ? <b className="gold">实际 {reveal.actual}</b> : '合成模拟'}</span>
        </div>
        {forecast ? (
          <Chart option={distribution} label="一步预测的危机数分布及实际结果" height={158} />
        ) : (
          <div className="chart-loading small">等待预测</div>
        )}
        {reveal && (
          <div className={`reveal-result ${reveal.covered ? 'covered' : 'outside'}`}>
            <b>{reveal.covered ? '落在 90% 预测区间内' : '落在 90% 预测区间外'}</b>
            <span>
              实际 {reveal.actual} · 期望 {reveal.mean.toFixed(1)} · 第{' '}
              {Math.round(reveal.percentile * 100)} 百分位
            </span>
          </div>
        )}
        <p className="chart-note">
          危机 = 动荡或叛乱；已独立星区单独记录。
          {history.length ? `已观察 ${history.length} 个十年。` : '历史还未展开。'}
        </p>
      </div>
    </section>
  );
}
