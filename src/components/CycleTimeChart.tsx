import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { StudyMetric } from '../types';

export default function CycleTimeChart({ metrics }: { metrics: StudyMetric[] }) {
  return (
    <div className="card chart-section">
      <h2>แนวโน้มเวลารวมของแต่ละ Study</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={metrics.map((m) => ({ name: m.chartLabel, totalTime: m.totalTimeSec }))}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid stroke="#EEE7DC" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: '#7A6F63' }}
            tickLine={false}
            axisLine={{ stroke: '#E4DCCF' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#7A6F63' }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'วินาที', angle: -90, position: 'insideLeft', fill: '#7A6F63', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #E4DCCF', fontFamily: 'inherit' }}
            formatter={(value) => [`${value} วินาที`, 'เวลารวม']}
          />
          <Line
            type="monotone"
            dataKey="totalTime"
            stroke="#A07C5B"
            strokeWidth={2}
            dot={{ r: 3, fill: '#A07C5B', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
