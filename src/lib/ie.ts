// สูตร Industrial Engineering ที่ใช้ร่วมกันทุกหน้า
import type { Step } from '../types';

export const UNGROUPED_ID = '__ungrouped__';

// Study ที่ไม่มี process_group_id จะถูกรวมไว้ใต้ UNGROUPED_ID
export const matchesGroup = (groupId: string | null, target: string) =>
  target === UNGROUPED_ID ? !groupId : groupId === target;

// ค่า k ของการแจกแจงปกติ ตามระดับความเชื่อมั่น
export function getKValue(confidence: number): number {
  if (confidence === 90) return 1.645;
  if (confidence === 99) return 2.576;
  return 1.96;
}

// Standard Time = Σ(เวลาที่จับได้ × Rating/100) × (1 + Allowance/100)
export function calculateStandardTime(studySteps: Step[], allowancePercent: number | null) {
  const normalTimeMs = studySteps.reduce((sum, step) => {
    const rating = step.performance_rating || 100;
    return sum + step.time_ms * (rating / 100);
  }, 0);
  const allowance = allowancePercent || 0;
  return normalTimeMs * (1 + allowance / 100);
}

// Efficiency = Standard Time / Actual Time × 100
export function calculateEfficiency(actualTimeMs: number, standardTimeMs: number) {
  if (actualTimeMs === 0) return 0;
  return (standardTimeMs / actualTimeMs) * 100;
}

export function mean(values: number[]) {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

// ส่วนเบี่ยงเบนมาตรฐานของกลุ่มตัวอย่าง (หารด้วย n − 1)
export function sampleStdDev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

// จำนวนรอบที่ควรจับ N = (k·s / (h·x̄))² ปัดขึ้น — ต้องมีข้อมูลอย่างน้อย 2 รอบ
export function requiredSampleSize(times: number[], confidence: number, errorPercent: number) {
  const n = times.length;
  const m = mean(times);
  const sd = sampleStdDev(times);
  const required = n > 1 && m > 0 ? Math.ceil(((getKValue(confidence) * sd) / ((errorPercent / 100) * m)) ** 2) : 0;
  return { n, mean: m, sd, required, remaining: Math.max(required - n, 0) };
}
