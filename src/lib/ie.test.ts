import { describe, expect, it } from 'vitest';
import type { Step } from '../types';
import {
  UNGROUPED_ID,
  calculateEfficiency,
  calculateStandardTime,
  getKValue,
  matchesGroup,
  mean,
  requiredSampleSize,
  sampleStdDev,
} from './ie';

const step = (time_ms: number, performance_rating: number | null = null): Step => ({
  id: `s-${time_ms}`,
  study_id: 'study-1',
  name: 'step',
  order_index: 0,
  time_ms,
  performance_rating,
});

describe('getKValue', () => {
  it('คืนค่า k ตามระดับความเชื่อมั่น และใช้ 95% เป็นค่าเริ่มต้น', () => {
    expect(getKValue(90)).toBe(1.645);
    expect(getKValue(95)).toBe(1.96);
    expect(getKValue(99)).toBe(2.576);
    expect(getKValue(80)).toBe(1.96);
  });
});

describe('matchesGroup', () => {
  it('จับคู่ด้วย id และให้ UNGROUPED_ID จับเฉพาะ Study ที่ไม่มีกลุ่ม', () => {
    expect(matchesGroup('g1', 'g1')).toBe(true);
    expect(matchesGroup('g1', 'g2')).toBe(false);
    expect(matchesGroup(null, UNGROUPED_ID)).toBe(true);
    expect(matchesGroup('g1', UNGROUPED_ID)).toBe(false);
  });
});

describe('calculateStandardTime', () => {
  it('ปรับด้วย Rating แต่ละ Step แล้วบวก Allowance', () => {
    // Normal = 1000×1.2 + 2000×1.0 = 3200, Standard = 3200 × 1.1
    expect(calculateStandardTime([step(1000, 120), step(2000)], 10)).toBeCloseTo(3520);
  });

  it('ถือว่า Rating ว่าง = 100% และ Allowance ว่าง = 0%', () => {
    expect(calculateStandardTime([step(1500)], null)).toBe(1500);
  });
});

describe('calculateEfficiency', () => {
  it('คำนวณ Standard / Actual × 100', () => {
    expect(calculateEfficiency(3000, 3520)).toBeCloseTo(117.333, 3);
  });

  it('คืน 0 เมื่อเวลาจริงเป็น 0 แทนการหารด้วยศูนย์', () => {
    expect(calculateEfficiency(0, 1000)).toBe(0);
  });
});

describe('mean / sampleStdDev', () => {
  it('ใช้ตัวหาร n − 1', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(values)).toBe(5);
    expect(sampleStdDev(values)).toBeCloseTo(Math.sqrt(32 / 7));
  });

  it('คืน 0 เมื่อข้อมูลไม่พอ', () => {
    expect(mean([])).toBe(0);
    expect(sampleStdDev([5])).toBe(0);
  });
});

describe('requiredSampleSize', () => {
  it('คำนวณ N = (k·s / (h·x̄))² แล้วปัดขึ้น', () => {
    // x̄ = 11, s = √2 → (1.96·√2 / (0.05·11))² ≈ 25.4 → 26
    const result = requiredSampleSize([10, 12], 95, 5);
    expect(result.n).toBe(2);
    expect(result.mean).toBe(11);
    expect(result.sd).toBeCloseTo(Math.SQRT2);
    expect(result.required).toBe(26);
    expect(result.remaining).toBe(24);
  });

  it('ยอมให้คลาดเคลื่อนมากขึ้นแล้วต้องจับน้อยลง', () => {
    expect(requiredSampleSize([10, 12], 95, 10).required).toBe(7);
  });

  it('ไม่คำนวณเมื่อมีข้อมูลน้อยกว่า 2 รอบ', () => {
    expect(requiredSampleSize([10], 95, 5)).toMatchObject({ required: 0, remaining: 0 });
  });

  it('remaining ไม่ติดลบเมื่อจับครบแล้ว', () => {
    expect(requiredSampleSize([10, 10, 10], 95, 5)).toMatchObject({ required: 0, remaining: 0 });
  });
});
