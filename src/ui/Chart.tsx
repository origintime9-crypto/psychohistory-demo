import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
echarts.use([LineChart, BarChart, ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, CanvasRenderer]);
export const chartTheme = {
  animationDuration: 250, textStyle: { color: '#94a3b7', fontFamily: 'Microsoft YaHei, system-ui, sans-serif', fontSize: 11 },
  tooltip: { trigger: 'axis', backgroundColor: '#141f2b', borderColor: '#344354', textStyle: { color: '#e5e9ed', fontSize: 12 } },
  grid: { left: 42, right: 18, top: 20, bottom: 35 },
  xAxis: { axisLine: { lineStyle: { color: '#344354' } }, axisTick: { show: false }, axisLabel: { color: '#94a3b7' }, splitLine: { show: false } },
  yAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#94a3b7' }, splitLine: { lineStyle: { color: '#263240', type: 'dashed' } } },
};
export default function Chart({ option, label, height = 220 }: { option: EChartsCoreOption; label: string; height?: number }) {
  const element = useRef<HTMLDivElement>(null); const chart = useRef<echarts.EChartsType | null>(null);
  useEffect(() => {
    const instance = echarts.init(element.current!); chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize()); observer.observe(element.current!);
    return () => { observer.disconnect(); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => { chart.current?.setOption(option, { notMerge: true }); }, [option]);
  return <div className="chart" ref={element} role="img" aria-label={label} style={{ height }} />;
}
