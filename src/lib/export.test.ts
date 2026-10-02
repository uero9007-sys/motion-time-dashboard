import { describe, expect, it } from 'vitest';
import type { DefectLog, Step, Study } from '../types';
import { buildStepSummaries, buildStudyRows } from './export';

const study = (id: string, created_at: string, extra: Partial<Study> = {}): Study => ({
  id,
  process_name: 'ประกอบ',
  operator_name: null,
  allowance_percent: null,
  process_group_id: 'g1',
  quantity_produced: null,
  created_at,
  finished_at: null,
  ...extra,
});

const step = (study_id: string, name: string, order_index: number, time_ms: number, performance_rating: number | null = null): Step => ({
  id: `${study_id}-${name}-${order_index}`,
  study_id,
  name,
  order_index,
  time_ms,
  performance_rating,
});

const defect = (study_id: string, step_name: string): DefectLog => ({
  id: `${study_id}-${step_name}`,
  study_id,
  step_name,
  occurred_at: '2026-01-01T00:00:00Z',
});

describe('buildStudyRows', () => {
  const studies = [
    study('late', '2026-01-02T00:00:00Z', { allowance_percent: 10, quantity_produced: 4 }),
    study('early', '2026-01-01T00:00:00Z'),
  ];
  const steps = [
    step('late', 'B', 1, 2000),
    step('late', 'A', 0, 1000, 120),
    step('early', 'A', 0, 3000),
  ];
  const rows = buildStudyRows(studies, steps, [defect('late', 'A')]);

  it('เรียงรอบตามเวลาที่จับ โดยรอบที่ 1 = เก่าสุด', () => {
    expect(rows.map((r) => [r.study.id, r.roundNo])).toEqual([['early', 1], ['late', 2]]);
  });

  it('จัด Step ตาม order_index และแยก Defect ตามรอบ', () => {
    expect(rows[1].steps.map((s) => s.name)).toEqual(['A', 'B']);
    expect(rows[1].defects).toHaveLength(1);
    expect(rows[0].defects).toHaveLength(0);
  });

  it('คำนวณเวลา Normal, Standard และ Man-hour ต่อชิ้น', () => {
    const late = rows[1];
    expect(late.totalMs).toBe(3000);
    expect(late.normalMs).toBeCloseTo(3200);
    expect(late.standardMs).toBeCloseTo(3520);
    expect(late.qty).toBe(4);
    expect(late.manHourPerUnit).toBeCloseTo(3 / 3600 / 4);
  });

  it('ถือว่าจำนวนที่ผลิตว่าง = 1 ชิ้น', () => {
    expect(rows[0].qty).toBe(1);
  });
});

describe('buildStepSummaries', () => {
  const rows = buildStudyRows(
    [study('r1', '2026-01-01T00:00:00Z', { allowance_percent: 10 }), study('r2', '2026-01-02T00:00:00Z', { allowance_percent: 10 })],
    [
      step('r1', 'ขันน็อต', 0, 1000),
      step('r1', 'ขันน็อต', 2, 1000), // ชื่อซ้ำในรอบเดียวกัน ต้องรวมเป็นค่าเดียว
      step('r1', 'ตรวจ', 1, 500),
      step('r2', 'ขันน็อต', 0, 4000),
      step('r2', 'ตรวจ', 1, 0), // เวลา 0 ไม่นับเป็นค่าสังเกต
    ],
    [defect('r1', 'ตรวจ'), defect('r2', 'ตรวจ')]
  );
  const [nut, check] = buildStepSummaries(rows);

  it('เรียง Step ตามลำดับที่พบครั้งแรก', () => {
    expect([nut.name, check.name]).toEqual(['ขันน็อต', 'ตรวจ']);
  });

  it('รวม Step ชื่อซ้ำในรอบเดียวกัน แล้วคิดสถิติข้ามรอบ', () => {
    // รอบ 1 = 2s, รอบ 2 = 4s
    expect(nut.n).toBe(2);
    expect(nut.meanSec).toBe(3);
    expect(nut.sdSec).toBeCloseTo(Math.SQRT2);
    expect(nut.minSec).toBe(2);
    expect(nut.maxSec).toBe(4);
    expect(nut.cvPercent).toBeCloseTo((Math.SQRT2 / 3) * 100);
    expect(nut.standardSec).toBeCloseTo(3.3);
  });

  it('ไม่นับรอบที่เวลาเป็น 0 แต่ยังนับ Defect ทุกรอบ', () => {
    expect(check.n).toBe(1);
    expect(check.meanSec).toBe(0.5);
    expect(check.sdSec).toBe(0);
    expect(check.defectCount).toBe(2);
  });
});
