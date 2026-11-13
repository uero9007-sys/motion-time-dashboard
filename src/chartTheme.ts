// สีและรูปแบบของกราฟทุกตัว (ค่าเดียวกับ :root ใน App.css — Recharts รับค่าสีเป็น string จึงต้องระบุซ้ำที่นี่)
// ข้อมูล = สี action, เส้นอ้างอิง = เส้นประสี ink พร้อมข้อความกำกับ, เส้นกริด/แกน = สีจาง
export const CHART = {
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
};

export const axisTick = { fontSize: 12, fill: CHART.tick };

export const tooltipStyle = { borderRadius: 4, border: `1px solid ${CHART.axis}`, fontFamily: 'inherit' };
