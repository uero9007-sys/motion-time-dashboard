// เตรียมข้อมูลผังสายผลิตสำหรับ Export Excel (ฟังก์ชันบริสุทธิ์ ทดสอบได้ ไม่เรียก xlsx เอง)
// ผู้อ่านรายงานต้องรู้ว่าตัวเลขได้มาอย่างไร จึงมีชีต "เงื่อนไข" กำกับเสมอ
import type { LineResult, ProcessSummary, Suggestion, TimeBasis } from './lineBalance';

export type ExportConditions = {
  layoutName: string;
  basis: TimeBasis;
  lastN: number | null;
  takt: number | null;
  taktSource: string;
  usedRounds: number;
  excludedRounds: number;
  exportedAt: string;
};

const r2 = (n: number | null) => (n === null ? '' : Math.round(n * 100) / 100);

export function buildLineBalanceSheets(
  line: LineResult,
  processes: ReadonlyMap<string, ProcessSummary>,
  suggestions: Suggestion[],
  cond: ExportConditions
): Record<string, (string | number)[][]> {
  const stationRows: (string | number)[][] = [
    ['สถานี', 'Process ในสถานี', 'เวลาสถานี (วินาที)', 'Idle (วินาที)', '% ใช้งานเทียบ Takt', 'คอขวด', 'จำนวนรอบที่ใช้ / ที่ควรมี'],
    ...line.stations.map((s) => [
      `สถานี ${s.index}`,
      s.processKeys.map((k) => processes.get(k)?.name ?? k).join(', ') || '(ว่าง)',
      r2(s.timeSec),
      r2(s.idleSec),
      r2(s.utilizationVsTakt),
      s.isBottleneck ? 'ใช่' : '',
      s.processKeys.map((k) => `${processes.get(k)?.n ?? 0}/${processes.get(k)?.requiredRounds ?? 0}`).join(', '),
    ]),
  ];

  const metricRows: (string | number)[][] = [
    ['ตัวชี้วัด', 'ค่า', 'หน่วย / สูตร'],
    ['Cycle Time ของสาย (CT)', r2(line.cycleTimeSec), 'วินาที = max(เวลาสถานี)'],
    ['Takt Time', r2(line.takt), 'วินาที = เวลาทำงานต่อกะ / ยอดผลิตต่อกะ'],
    ['ผ่าน Takt', line.meetsTakt === null ? '' : line.meetsTakt ? 'ผ่าน' : 'ไม่ผ่าน', 'CT ≤ Takt'],
    ['ส่วนต่าง CT − Takt', r2(line.taktGapSec), 'วินาที (บวก = เกิน Takt)'],
    ['กำลังผลิตต่อกะ', r2(line.capacityPerShift), 'ชิ้น = เวลาทำงานต่อกะ / CT'],
    ['Line Balance Efficiency', r2(line.efficiency), '% = ΣT / (n × CT) × 100'],
    ['Balance Delay', r2(line.balanceDelay), '% = 100 − Efficiency'],
    ['Smoothness Index', r2(line.smoothnessIndex), 'sqrt(Σ(CT − เวลาสถานี)²)'],
    ['เวลางานรวม (ΣT)', r2(line.totalWorkSec), 'วินาที'],
    ['จำนวนสถานีที่ใช้ (n)', line.activeStations, 'ไม่นับสถานีว่าง'],
    ['จำนวนสถานีขั้นต่ำเชิงทฤษฎี', line.minStations ?? '', 'ceil(ΣT / Takt)'],
  ];

  const suggestionRows: (string | number)[][] = [
    ['หัวข้อ', 'เหตุผล (จากข้อมูลจริง)', 'วิธีตรวจสอบหน้างาน', 'หมายเหตุ'],
    ...suggestions.map((s) => [s.title, s.reason, s.howToVerify, s.disclaimer]),
  ];

  const conditionRows: (string | number)[][] = [
    ['เงื่อนไข', 'ค่า'],
    ['ชื่อผัง', cond.layoutName],
    ['เวลาที่ใช้', cond.basis === 'observed' ? 'เวลาจริงเฉลี่ย (observed)' : 'Standard Time (Rating × Allowance)'],
    ['จำนวนรอบ', cond.lastN ? `${cond.lastN} รอบล่าสุดของแต่ละ Process` : 'ทุกรอบ'],
    ['รอบที่ใช้คำนวณ', cond.usedRounds],
    ['รอบที่ตัดทิ้ง (ไม่มี Step / เวลา 0)', cond.excludedRounds],
    ['Takt (วินาที)', r2(cond.takt)],
    ['ที่มาของ Takt', cond.taktSource],
    ['เวลาต่อชิ้น', 'เวลาของรอบ ÷ จำนวนที่ผลิตในรอบ'],
    ['Export เมื่อ', cond.exportedAt],
  ];

  return { ตัวชี้วัด: metricRows, สถานี: stationRows, ข้อเสนอแนะ: suggestionRows, เงื่อนไข: conditionRows };
}
