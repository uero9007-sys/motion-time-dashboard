import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { CHART, axisTick, tooltipStyle } from '../chartTheme';
import type { StudyMetric } from '../types';
import ChartRefLabel from './ChartRefLabel';

export default function CycleTimeChart({ metrics }: { metrics: StudyMetric[] }) {
  // เส้นอ้างอิง = Standard Time เฉลี่ยของรอบที่แสดงอยู่ (ค่าเดียวกับ KPI "Standard Time เฉลี่ย")
  const standardAvg =
    metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.standardTimeSec, 0) / metrics.length : 0;
  const hasStandard = Number.isFinite(standardAvg) && standardAvg > 0;

  return (
    <div className="card chart-section">
      <div className="chart-head">
        <h2>แนวโน้มเวลารวมของแต่ละ Study</h2>
        <p className="chart-key">
          <span><i />เวลารวมของแต่ละ Study</span>
          {hasStandard && (
            <span><i className="is-ref" />Standard Time เฉลี่ย <b>{standardAvg.toFixed(2)} วินาที</b></span>
          )}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart
          data={metrics.map((m) => ({ name: m.chartLabel, totalTime: m.totalTimeSec }))}
          margin={{ top: 16, right: hasStandard ? 144 : 24, bottom: 8, left: 8 }}
        >
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="name"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            minTickGap={16}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={56}
            label={{ value: 'เวลารวม (วินาที)', angle: -90, position: 'insideLeft', fill: CHART.tick, fontSize: 12, style: { textAnchor: 'middle' } }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: CHART.axis }}
            formatter={(value) => [`${Number(value).toFixed(2)} วินาที`, 'เวลารวม']}
          />
          <Line
            type="linear"
            dataKey="totalTime"
            stroke={CHART.series}
            strokeWidth={2.5}
            dot={{ r: 4, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: CHART.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {hasStandard && (
            <ReferenceLine
              y={standardAvg}
              stroke={CHART.reference}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              ifOverflow="extendDomain"
              label={<ChartRefLabel lines={['Standard Time เฉลี่ย', `${standardAvg.toFixed(2)} วินาที`]} />}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
