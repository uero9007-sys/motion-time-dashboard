import { CHART } from '../chartTheme';

// ข้อความกำกับเส้นอ้างอิงของกราฟ วางในขอบขวานอกพื้นที่กราฟ ตรงระดับเดียวกับเส้น จึงไม่ทับเส้นข้อมูล
// (กราฟที่ใช้ต้องเว้น margin ขวาไว้ให้พอ) Recharts ส่ง viewBox (ตำแหน่งของเส้น) มาให้เองเมื่อใช้เป็น label ของ ReferenceLine
type Props = { lines: string[]; viewBox?: { x?: number; y?: number; width?: number } };

export default function ChartRefLabel({ lines, viewBox }: Props) {
  const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) + 8;
  const y = (viewBox?.y ?? 0) - (lines.length - 1) * 8 + 4;
  return (
    <text x={x} y={y} textAnchor="start" fill={CHART.reference} fontSize={12.5} fontWeight={600}>
      {lines.map((line, i) => (
        <tspan key={line} x={x} dy={i === 0 ? 0 : 16}>{line}</tspan>
      ))}
    </text>
  );
}
