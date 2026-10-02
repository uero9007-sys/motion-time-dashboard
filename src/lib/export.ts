// สร้างข้อมูลสำหรับ Export (Excel ข้อมูลดิบ + ข้อมูลรายงาน PDF) ของ Process ใหญ่ที่เลือก
import type { DefectLog, Step, Study } from '../types';
import { calculateEfficiency, calculateStandardTime, mean, sampleStdDev } from './ie';

const round = (n: number, digits = 2) => Number(n.toFixed(digits));
const sec = (ms: number) => round(ms / 1000, 3);

// วันที่ตามเวลาเครื่อง (YYYY-MM-DD) สำหรับตั้งชื่อไฟล์ — toISOString() เป็น UTC จะช้ากว่าเวลาไทย 7 ชม.
export const localDateStamp = () => new Date().toLocaleDateString('sv-SE');

export type StudyRow = {
  study: Study;
  roundNo: number;
  steps: Step[];
  defects: DefectLog[];
  totalMs: number;
  normalMs: number;
  standardMs: number;
  efficiency: number;
  manHourPerUnit: number;
  qty: number;
};

export type StepSummary = {
  name: string;
  n: number;
  meanSec: number;
  sdSec: number;
  minSec: number;
  maxSec: number;
  cvPercent: number;
  avgRating: number;
  normalSec: number;
  standardSec: number;
  defectCount: number;
};

// จัดรอบเรียงตามเวลาที่จับ (รอบที่ 1 = เก่าสุด) พร้อมคำนวณค่า IE ของแต่ละรอบ
export function buildStudyRows(studies: Study[], steps: Step[], defects: DefectLog[]): StudyRow[] {
  return [...studies]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((study, idx) => {
      const studySteps = steps
        .filter((s) => s.study_id === study.id)
        .sort((a, b) => a.order_index - b.order_index);
      const totalMs = studySteps.reduce((sum, s) => sum + s.time_ms, 0);
      const normalMs = calculateStandardTime(studySteps, 0);
      const standardMs = calculateStandardTime(studySteps, study.allowance_percent);
      const qty = study.quantity_produced || 1;
      return {
        study,
        roundNo: idx + 1,
        steps: studySteps,
        defects: defects.filter((d) => d.study_id === study.id),
        totalMs,
        normalMs,
        standardMs,
        efficiency: calculateEfficiency(totalMs, standardMs),
        manHourPerUnit: totalMs / 1000 / 3600 / qty,
        qty,
      };
    });
}

// สถิติราย Step (รวมทุกรอบ) เรียงตามลำดับ Step ที่พบครั้งแรก
export function buildStepSummaries(rows: StudyRow[]): StepSummary[] {
  const order = new Map<string, number>();
  rows.forEach((r) => r.steps.forEach((s) => { if (!order.has(s.name)) order.set(s.name, s.order_index); }));

  const avgAllowance = mean(rows.map((r) => r.study.allowance_percent || 0));

  return Array.from(order.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => {
      // รอบเดียวกันอาจมี Step ชื่อซ้ำ ให้รวมเป็นค่าเดียวต่อรอบ (เหมือน Export เดิม)
      const perRound = rows
        .map((r) => r.steps.filter((s) => s.name === name && s.time_ms > 0))
        .filter((matches) => matches.length > 0);
      const times = perRound.map((m) => m.reduce((sum, s) => sum + s.time_ms, 0) / 1000);
      const ratings = perRound.flat().map((s) => s.performance_rating || 100);
      const meanSec = mean(times);
      const sdSec = sampleStdDev(times);
      const avgRating = mean(ratings) || 100;
      const normalSec = meanSec * (avgRating / 100);
      return {
        name,
        n: times.length,
        meanSec,
        sdSec,
        minSec: times.length ? Math.min(...times) : 0,
        maxSec: times.length ? Math.max(...times) : 0,
        cvPercent: meanSec > 0 ? (sdSec / meanSec) * 100 : 0,
        avgRating,
        normalSec,
        standardSec: normalSec * (1 + avgAllowance / 100),
        defectCount: rows.reduce((sum, r) => sum + r.defects.filter((d) => d.step_name === name).length, 0),
      };
    });
}

const safeSheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, '').substring(0, 31) || 'Process';

// ตารางแบบเดิม: 1 แถวต่อรอบ, Step เป็นคอลัมน์ พร้อมแถวเฉลี่ย
function buildPivotRows(processName: string, rows: StudyRow[]) {
  const stepNames = buildStepSummaries(rows).map((s) => s.name);
  const pivot: Record<string, string | number>[] = rows.map((r, idx) => {
    const row: Record<string, string | number> = { 'รอบที่': `รอบที่ ${idx + 1}` };
    let totalSec = 0;
    stepNames.forEach((name) => {
      const matches = r.steps.filter((s) => s.name === name && s.time_ms > 0);
      if (matches.length === 0) {
        row[name] = '';
      } else {
        const v = round(matches.reduce((sum, s) => sum + s.time_ms, 0) / 1000);
        row[name] = v;
        totalSec += v;
      }
    });
    row['จำนวนที่ผลิต'] = r.qty;
    row['เวลารวม'] = round(totalSec);
    return row;
  });

  const avgOf = (key: string) => {
    const vals = pivot.map((r) => r[key]).filter((v) => typeof v === 'number') as number[];
    return vals.length ? round(mean(vals)) : '';
  };
  const avgRow: Record<string, string | number> = { 'รอบที่': `เฉลี่ย ${processName}` };
  [...stepNames, 'จำนวนที่ผลิต', 'เวลารวม'].forEach((k) => { avgRow[k] = avgOf(k); });
  return [avgRow, ...pivot];
}

// Excel ข้อมูลดิบ: ตารางแบบ "1 แถว = 1 ค่าสังเกต" เหมาะกับ Pivot Table / Minitab / Python
// โหลดไลบรารี xlsx (~330 kB) เฉพาะตอนกด Export เพื่อให้หน้าแรกเปิดเร็วขึ้น
export async function exportRawExcel(groupName: string, rows: StudyRow[]) {
  const { utils, writeFile } = await import('xlsx');
  const workbook = utils.book_new();

  const studySheet = rows.map((r) => ({
    'Study ID': r.study.id,
    'Process ใหญ่': groupName,
    'Process': r.study.process_name,
    'รอบที่': r.roundNo,
    'เริ่มจับ': new Date(r.study.created_at),
    'เสร็จสิ้น': r.study.finished_at ? new Date(r.study.finished_at) : '',
    'ผู้ปฏิบัติงาน': r.study.operator_name || '',
    'จำนวน Step': r.steps.length,
    'จำนวนที่ผลิต (ชิ้น)': r.qty,
    'Allowance (%)': r.study.allowance_percent ?? 0,
    'เวลาจริงรวม (s)': sec(r.totalMs),
    'Normal Time (s)': sec(r.normalMs),
    'Standard Time (s)': sec(r.standardMs),
    'ประสิทธิภาพ (%)': round(r.efficiency, 1),
    'Man-hour ต่อชิ้น': round(r.manHourPerUnit, 6),
    'จำนวน Defect': r.defects.length,
  }));

  const stepSheet = rows.flatMap((r) =>
    r.steps.map((s) => {
      const rating = s.performance_rating || 100;
      const normalMs = s.time_ms * (rating / 100);
      return {
        'Study ID': r.study.id,
        'Process ใหญ่': groupName,
        'Process': r.study.process_name,
        'รอบที่': r.roundNo,
        'วันที่': new Date(r.study.created_at),
        'ผู้ปฏิบัติงาน': r.study.operator_name || '',
        'ลำดับ Step': s.order_index + 1,
        'ชื่อ Step': s.name,
        'เวลาที่จับได้ (s)': sec(s.time_ms),
        'Rating (%)': rating,
        'Normal Time (s)': sec(normalMs),
        'Allowance (%)': r.study.allowance_percent ?? 0,
        'Standard Time (s)': sec(normalMs * (1 + (r.study.allowance_percent || 0) / 100)),
        'จำนวน Defect ใน Step': r.defects.filter((d) => d.step_name === s.name).length,
      };
    })
  );

  const defectSheet = rows.flatMap((r) =>
    r.defects.map((d) => ({
      'Study ID': r.study.id,
      'Process': r.study.process_name,
      'รอบที่': r.roundNo,
      'ผู้ปฏิบัติงาน': r.study.operator_name || '',
      'Step ที่เกิด Defect': d.step_name,
      'เวลาที่เกิด': d.occurred_at ? new Date(d.occurred_at) : '',
    }))
  );

  const stepStats = buildStepSummaries(rows).map((s) => ({
    'ชื่อ Step': s.name,
    'จำนวนรอบ (n)': s.n,
    'ค่าเฉลี่ย (s)': round(s.meanSec, 3),
    'SD (s)': round(s.sdSec, 3),
    'Min (s)': round(s.minSec, 3),
    'Max (s)': round(s.maxSec, 3),
    'CV (%)': round(s.cvPercent, 1),
    'Rating เฉลี่ย (%)': round(s.avgRating, 1),
    'Normal Time (s)': round(s.normalSec, 3),
    'Standard Time (s)': round(s.standardSec, 3),
    'จำนวน Defect': s.defectCount,
  }));

  const addSheet = (data: object[], name: string, emptyHeader: string[]) => {
    const sheet = data.length
      ? utils.json_to_sheet(data, { cellDates: true, dateNF: 'yyyy-mm-dd hh:mm:ss' })
      : utils.aoa_to_sheet([emptyHeader]);
    sheet['!autofilter'] = { ref: sheet['!ref'] || 'A1' };
    utils.book_append_sheet(workbook, sheet, name);
  };

  addSheet(stepSheet, 'Raw_Steps', ['Study ID', 'ชื่อ Step', 'เวลาที่จับได้ (s)']);
  addSheet(studySheet, 'Raw_Rounds', ['Study ID', 'รอบที่']);
  addSheet(defectSheet, 'Raw_Defects', ['Study ID', 'รอบที่', 'Step ที่เกิด Defect', 'เวลาที่เกิด']);
  addSheet(stepStats, 'Step_Stats', ['ชื่อ Step']);

  // ตารางสรุปแบบเดิม แยกชีตตามชื่อ Process ย่อย
  const byProcess: Record<string, StudyRow[]> = {};
  rows.forEach((r) => {
    const key = r.study.process_name || 'ไม่ระบุ';
    (byProcess[key] ||= []).push(r);
  });
  const usedNames = new Set(workbook.SheetNames);
  Object.entries(byProcess).forEach(([processName, processRows]) => {
    let name = safeSheetName(`สรุป ${processName}`);
    for (let i = 2; usedNames.has(name); i++) name = safeSheetName(`สรุป ${processName}`).substring(0, 28) + ` ${i}`;
    usedNames.add(name);
    utils.book_append_sheet(workbook, utils.json_to_sheet(buildPivotRows(processName, processRows)), name);
  });

  const stamp = localDateStamp();
  writeFile(workbook, `MTS-RawData-${groupName.replace(/[\\/:*?"<>|]/g, '')}-${stamp}.xlsx`);
}
