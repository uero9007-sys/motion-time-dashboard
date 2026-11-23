// สีและรูปแบบของกราฟทุกตัว (ค่าเดียวกับ :root / [data-theme="dark"] ใน App.css — Recharts รับค่าสีเป็น string จึงต้องระบุซ้ำที่นี่)
// ข้อมูล = สี action, เส้นอ้างอิง = เส้นประสี ink พร้อมข้อความกำกับ, เส้นกริด/แกน = สีจาง
import { useMemo } from 'react';
import type { ResolvedTheme } from './lib/theme';
import { useResolvedTheme } from './themeStore';

export type ChartColors = {
  series: string;
  bar: string;
  line: string;
  reference: string;
  grid: string;
  axis: string;
  tick: string;
  ink: string;
  surface: string;
  cursor: string;
};

export const CHART_COLORS: Record<ResolvedTheme, ChartColors> = {
  light: {
    series: '#0E6B66',
    bar: '#0E6B66',
    line: '#0E6B66',
    reference: '#15252A',
    grid: '#D2DAD9',
    axis: '#A7B5B4',
    tick: '#56676C',
    ink: '#15252A',
    surface: '#FFFFFF',
    cursor: 'rgba(14, 107, 102, 0.08)',
  },
  dark: {
    series: '#3FB3A9',
    bar: '#3FB3A9',
    line: '#3FB3A9',
    reference: '#E6EDEC',
    grid: '#2A3D42',
    axis: '#3F565C',
    tick: '#9AABAE',
    ink: '#E6EDEC',
    surface: '#16252A',
    cursor: 'rgba(63, 179, 169, 0.12)',
  },
};

// รายงานสำหรับพิมพ์ลงกระดาษ ใช้ชุดสว่างเสมอไม่ว่าจอจะเป็นธีมไหน
export const PRINT_CHART = CHART_COLORS.light;

export function chartStyles(theme: ResolvedTheme) {
  const CHART = CHART_COLORS[theme];
  return {
    CHART,
    axisTick: { fontSize: 12, fill: CHART.tick },
    tooltipStyle: {
      borderRadius: 4,
      border: `1px solid ${CHART.axis}`,
      fontFamily: 'inherit',
      backgroundColor: CHART.surface,
      color: CHART.ink,
    },
  };
}

// render ใหม่เมื่อเปลี่ยนธีม
export function useChartTheme() {
  const theme = useResolvedTheme();
  return useMemo(() => chartStyles(theme), [theme]);
}
