import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUMMARY_OPTIONS,
  SUGGESTION_DISCLAIMER,
  balanceLine,
  compareLines,
  kanbanCards,
  minimumStations,
  processDetail,
  suggestImprovements,
  summarizeProcesses,
  taktTime,
  type LbStep,
  type LbStudy,
} from './lineBalance';

// สถานีละ 1 Process เวลาตามที่กำหนด
const lineOf = (times: number[]) => {
  const map = new Map(times.map((t, i) => [`p${i}`, t]));
  const stations = times.map((_, i) => ({ id: `s${i}`, processKeys: [`p${i}`] }));
  return { map, stations };
};

const finiteNumbers = (obj: Record<string, unknown>) =>
  Object.values(obj).every((v) => typeof v !== 'number' || Number.isFinite(v));

describe('balanceLine — ตัวอย่างทดสอบ 1: สถานี [30, 40, 20]', () => {
  const { map, stations } = lineOf([30, 40, 20]);
  const r = balanceLine(stations, map);

  it('ΣT = 90, CT = 40', () => {
    expect(r.totalWorkSec).toBe(90);
    expect(r.cycleTimeSec).toBe(40);
  });
  it('Efficiency = 75%, Balance Delay = 25%', () => {
    expect(r.efficiency).toBeCloseTo(75, 10);
    expect(r.balanceDelay).toBeCloseTo(25, 10);
  });
  it('Idle = [10, 0, 20] และสถานีที่ 2 เป็นคอขวด', () => {
    expect(r.stations.map((s) => s.idleSec)).toEqual([10, 0, 20]);
    expect(r.stations.map((s) => s.isBottleneck)).toEqual([false, true, false]);
  });
  it('Smoothness Index = sqrt(500) ≈ 22.36', () => {
    expect(r.smoothnessIndex).toBeCloseTo(Math.sqrt(500), 10);
    expect(r.smoothnessIndex).toBeCloseTo(22.36, 2);
  });
});

describe('Takt — ตัวอย่างทดสอบ 2: 28,800 วินาที / 600 ชิ้น', () => {
  const takt = taktTime(28800, 600);
  const { map, stations } = lineOf([30, 40, 20]);
  const r = balanceLine(stations, map, takt, 28800);

  it('Takt = 48 วินาที', () => expect(takt).toBe(48));
  it('สถานีขั้นต่ำ = ceil(90/48) = 2', () => {
    expect(minimumStations(90, takt)).toBe(2);
    expect(r.minStations).toBe(2);
  });
  it('CT = 40 ผ่าน Takt ต่ำกว่า 8 วินาที', () => {
    expect(r.meetsTakt).toBe(true);
    expect(r.taktGapSec).toBe(-8);
  });
  it('กำลังผลิตต่อกะ = 28800 / 40 = 720', () => expect(r.capacityPerShift).toBe(720));
  it('% ใช้งานเทียบ Takt ของแต่ละสถานี', () => {
    expect(r.stations.map((s) => s.utilizationVsTakt)).toEqual([62.5, (40 / 48) * 100, (20 / 48) * 100]);
  });
  it('CT เกิน Takt → ไม่ผ่าน และบอกส่วนต่าง', () => {
    const over = balanceLine(lineOf([30, 60]).stations, lineOf([30, 60]).map, 48);
    expect(over.meetsTakt).toBe(false);
    expect(over.taktGapSec).toBe(12);
  });
});

describe('balanceLine — หลาย Process ในสถานีเดียว และสถานีว่าง', () => {
  const map = new Map([
    ['a', 30],
    ['b', 40],
    ['c', 20],
  ]);
  it('Ts = ผลรวมของ Process ในสถานี', () => {
    const r = balanceLine([{ id: 's1', processKeys: ['a', 'c'] }, { id: 's2', processKeys: ['b'] }], map);
    expect(r.stations[0].timeSec).toBe(50);
    expect(r.cycleTimeSec).toBe(50);
    expect(r.efficiency).toBeCloseTo((90 / (2 * 50)) * 100, 10);
  });
  it('สถานีว่างไม่นับใน n และ Idle เป็น null', () => {
    const r = balanceLine([{ id: 's1', processKeys: ['a'] }, { id: 's2', processKeys: [] }, { id: 's3', processKeys: ['b'] }], map);
    expect(r.activeStations).toBe(2);
    expect(r.emptyStations).toBe(1);
    expect(r.stations[1].idleSec).toBeNull();
    expect(r.stations[1].isEmpty).toBe(true);
    expect(r.efficiency).toBeCloseTo((70 / (2 * 40)) * 100, 10);
  });
  it('Process ที่ไม่มีเวลา (ถูกลบไปแล้ว) ไม่ถูกนับ', () => {
    const r = balanceLine([{ id: 's1', processKeys: ['a', 'gone'] }], map);
    expect(r.stations[0].processKeys).toEqual(['a']);
    expect(r.totalWorkSec).toBe(30);
  });
});

describe('กรณีขอบ: ไม่ crash และไม่มี NaN / Infinity', () => {
  it('ไม่มีสถานีเลย', () => {
    const r = balanceLine([], new Map());
    expect(r.cycleTimeSec).toBe(0);
    expect(r.efficiency).toBe(0);
    expect(r.balanceDelay).toBe(0);
    expect(r.minStations).toBeNull();
    expect(finiteNumbers(r)).toBe(true);
  });
  it('สถานีเดียว → Efficiency 100%, Idle 0, SI 0', () => {
    const { map, stations } = lineOf([25]);
    const r = balanceLine(stations, map);
    expect(r.efficiency).toBe(100);
    expect(r.stations[0].idleSec).toBe(0);
    expect(r.smoothnessIndex).toBe(0);
  });
  it('CT = 0 (ทุก Process เวลา 0)', () => {
    const r = balanceLine([{ id: 's', processKeys: ['z'] }], new Map([['z', 0]]));
    expect(r.cycleTimeSec).toBe(0);
    expect(r.efficiency).toBe(0);
    expect(r.stations[0].isBottleneck).toBe(false);
    expect(r.capacityPerShift).toBeNull();
    expect(finiteNumbers(r)).toBe(true);
  });
  it('Takt = 0 / ไม่กรอก / ติดลบ → null', () => {
    expect(taktTime(28800, 0)).toBeNull();
    expect(taktTime(0, 600)).toBeNull();
    expect(taktTime(-1, 600)).toBeNull();
    expect(taktTime(Number.NaN, 600)).toBeNull();
    const r = balanceLine(lineOf([30]).stations, lineOf([30]).map, 0);
    expect(r.takt).toBeNull();
    expect(r.meetsTakt).toBeNull();
    expect(r.stations[0].utilizationVsTakt).toBeNull();
  });
  it('สถานีทั้งหมดว่าง', () => {
    const r = balanceLine([{ id: 'a', processKeys: [] }, { id: 'b', processKeys: [] }], new Map(), 48);
    expect(r.activeStations).toBe(0);
    expect(r.emptyStations).toBe(2);
    expect(finiteNumbers(r)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
const study = (id: string, group: string | null, created: string, qty = 1, allowance = 0): LbStudy => ({
  id,
  process_group_id: group,
  process_name: group ? `ชื่อ ${group}` : 'ไม่มีกลุ่ม',
  allowance_percent: allowance,
  quantity_produced: qty,
  created_at: created,
});
const st = (study_id: string, name: string, sec: number, rating: number | null = 100): LbStep => ({
  study_id,
  name,
  time_ms: sec * 1000,
  performance_rating: rating,
});

describe('summarizeProcesses — สรุปเวลาต่อ Process จากข้อมูลดิบ', () => {
  const studies = [
    study('r1', 'g1', '2026-01-01T00:00:00Z'),
    study('r2', 'g1', '2026-01-02T00:00:00Z'),
    study('r3', 'g1', '2026-01-03T00:00:00Z'),
    study('r4', 'g2', '2026-01-01T00:00:00Z'),
    study('empty', 'g1', '2026-01-04T00:00:00Z'), // ไม่มี Step → ตัดทิ้ง
    study('zero', 'g2', '2026-01-05T00:00:00Z'), // เวลารวม 0 → ตัดทิ้ง
  ];
  const steps = [
    st('r1', 'A', 10),
    st('r1', 'B', 20),
    st('r2', 'A', 12),
    st('r2', 'B', 18),
    st('r3', 'A', 8),
    st('r3', 'A', 4), // ชื่อซ้ำในรอบเดียว (บั๊ก Merge เดิม) ต้องรวมเป็นเวลาของรอบ
    st('r3', 'B', 20),
    st('r4', 'X', 15, 400), // Rating ผิดปกติ
    st('zero', 'X', 0),
  ];
  const groups = [
    { id: 'g1', name: 'ประกอบ' },
    { id: 'g2', name: 'บรรจุ' },
  ];
  const r = summarizeProcesses(studies, steps, groups);

  it('เวลาต่อรอบ = ผลรวม Step ของรอบ แล้วหาค่าเฉลี่ยและ SD', () => {
    const g1 = r.processes.find((p) => p.key === 'g1')!;
    expect(g1.name).toBe('ประกอบ');
    expect(g1.rounds.map((x) => x.timeSec)).toEqual([30, 30, 32]);
    expect(g1.meanSec).toBeCloseTo(92 / 3, 10);
    expect(g1.sdSec).toBeCloseTo(Math.sqrt(((30 - 92 / 3) ** 2 * 2 + (32 - 92 / 3) ** 2) / 2), 10);
    expect(g1.n).toBe(3);
  });
  it('ตัดรอบที่ไม่มี Step / เวลารวม 0 และนับจำนวนที่ตัด', () => {
    expect(r.excludedRounds).toBe(2);
    expect(r.usedRounds).toBe(4);
  });
  it('แจ้ง Step ชื่อซ้ำในรอบ', () => {
    expect(r.processes.find((p) => p.key === 'g1')!.duplicateStepRounds).toBe(1);
    expect(r.duplicateStepRounds).toBe(1);
  });
  it('แจ้ง Rating ผิดปกติตามเกณฑ์ที่ตั้ง (แก้เกณฑ์ได้)', () => {
    expect(r.abnormalRatingSteps).toBe(1);
    const loose = summarizeProcesses(studies, steps, groups, { ...DEFAULT_SUMMARY_OPTIONS, ratingMax: 500 });
    expect(loose.abnormalRatingSteps).toBe(0);
  });
  it('รอบน้อยกว่า 2 → SD เป็น null และข้อมูลยังไม่พอ', () => {
    const g2 = r.processes.find((p) => p.key === 'g2')!;
    expect(g2.n).toBe(1);
    expect(g2.sdSec).toBeNull();
    expect(g2.enoughData).toBe(false);
  });
  it('เลือก N รอบล่าสุด', () => {
    const last2 = summarizeProcesses(studies, steps, groups, { ...DEFAULT_SUMMARY_OPTIONS, lastN: 2 });
    expect(last2.processes.find((p) => p.key === 'g1')!.rounds.map((x) => x.studyId)).toEqual(['r2', 'r3']);
  });
  it('Standard Time ใช้สูตรเดิม (Rating × Allowance) และหารด้วยจำนวนที่ผลิต', () => {
    const s = [study('q', 'g3', '2026-01-01T00:00:00Z', 2, 10)];
    const res = summarizeProcesses(s, [st('q', 'A', 10, 120)], [], { ...DEFAULT_SUMMARY_OPTIONS, basis: 'standard' });
    // 10 วินาที × 1.2 × 1.1 / 2 ชิ้น = 6.6
    expect(res.processes[0].meanSec).toBeCloseTo(6.6, 10);
  });
  it('ไม่มีข้อมูลเลย', () => {
    const empty = summarizeProcesses([], [], []);
    expect(empty.processes).toEqual([]);
    expect(empty.usedRounds).toBe(0);
  });
});

describe('processDetail — สถิติราย Step ของ Process', () => {
  const dates = new Map([
    ['r1', '2026-01-01'],
    ['r2', '2026-01-02'],
  ]);
  const steps = [st('r1', 'A', 10), st('r1', 'B', 30), st('r2', 'A', 14), st('r2', 'B', 26), st('r2', 'B', 4)];
  const d = processDetail(['r1', 'r2'], steps, [
    { study_id: 'r1', step_name: 'B' },
    { study_id: 'r2', step_name: 'B' },
    { study_id: 'r2', step_name: 'ไม่มีชื่อนี้' },
  ], dates);

  it('เรียงจาก Step ที่ใช้เวลามากสุด และรวม Step ชื่อซ้ำในรอบ', () => {
    expect(d.steps.map((s) => s.name)).toEqual(['B', 'A']);
    expect(d.steps[0].meanSec).toBe(30); // (30 + 30) / 2
    expect(d.duplicateStepRounds).toBe(1);
  });
  it('% ของเวลา Process, CV, ต่ำสุด/สูงสุด', () => {
    const a = d.steps.find((s) => s.name === 'A')!;
    expect(a.sharePercent).toBeCloseTo((12 / 42) * 100, 10);
    expect(a.minSec).toBe(10);
    expect(a.maxSec).toBe(14);
    expect(a.cv).toBeCloseTo((Math.sqrt(8) / 12) * 100, 10);
  });
  it('นับ Defect ตามชื่อ Step และแจ้งชื่อที่ไม่ตรง', () => {
    expect(d.steps[0].defects).toBe(2);
    expect(d.unmatchedDefects).toBe(1);
    expect(d.totalDefects).toBe(3);
  });
  it('เวลารวมรายรอบเรียงตามเวลา', () => {
    expect(d.roundSeries.map((r) => r.totalSec)).toEqual([40, 44]);
  });
});

describe('suggestImprovements — ทุกข้อมีเหตุผล วิธีตรวจ และข้อความยืนยันโดยวิศวกร', () => {
  const { map, stations } = lineOf([30, 60, 10]);
  const line = balanceLine(stations, map, 48);
  const detail = processDetail(
    ['r1', 'r2', 'r3'],
    [st('r1', 'A', 50), st('r1', 'B', 10), st('r2', 'A', 30), st('r2', 'B', 2), st('r3', 'A', 52), st('r3', 'B', 10)],
    [
      { study_id: 'r1', step_name: 'A' },
      { study_id: 'r2', step_name: 'A' },
    ],
    new Map([
      ['r1', '1'],
      ['r2', '2'],
      ['r3', '3'],
    ])
  );
  const process = { key: 'p1', name: 'งานคอขวด', rounds: [], n: 3, meanSec: 51.3, sdSec: 10, requiredRounds: 40, enoughData: false, duplicateStepRounds: 0, abnormalRatingSteps: 0 };
  const list = suggestImprovements({
    line,
    stationLabel: (i) => `สถานี ${i}`,
    bottleneck: { stationIndex: 2, processName: 'งานคอขวด', process, detail },
  });

  it('สถานีเกิน Takt → บอกสถานีข้างเคียงที่ว่างมากที่สุดและ Idle', () => {
    // ข้างเคียงของสถานี 2: สถานี 1 ว่าง 30 วินาที, สถานี 3 ว่าง 50 วินาที → เลือกสถานี 3
    const s = list.find((x) => x.id === 'over-takt-2')!;
    expect(s.reason).toContain('60.00');
    expect(s.reason).toContain('สถานี 3');
    expect(s.reason).toContain('50.00');
  });
  it('มีครบทุกกฎ: สัดส่วน Step, CV สูง, รอบที่ดีที่สุด, Defect กระจุก', () => {
    const ids = list.map((x) => x.id);
    expect(ids).toContain('step-share-A');
    expect(ids.some((i) => i.startsWith('step-cv-'))).toBe(true);
    expect(ids).toContain('best-gap');
    expect(ids).toContain('defect-A');
  });
  it('ทุกข้อมีหัวข้อ เหตุผล วิธีตรวจหน้างาน และข้อความว่าเป็นข้อเสนอเบื้องต้น', () => {
    list.forEach((x) => {
      expect(x.title.length).toBeGreaterThan(0);
      expect(x.reason).toMatch(/\d/);
      expect(x.howToVerify.length).toBeGreaterThan(0);
      expect(x.disclaimer).toBe(SUGGESTION_DISCLAIMER);
      expect(x.reason).not.toMatch(/สาเหตุที่แน่ชัด/);
    });
  });
  it('ไม่มีคอขวด → มีแค่ข้อเสนอจาก Takt', () => {
    expect(suggestImprovements({ line: balanceLine([], new Map()), stationLabel: String, bottleneck: null })).toEqual([]);
  });
});

describe('kanbanCards — N = ceil(D × L × (1 + SF) / C)', () => {
  it('D=60/ชม., L=0.5 ชม., SF=0.1, C=10 → 3.3 → 4 ใบ', () => {
    expect(kanbanCards(60, 0.5, 10, 0.1)).toEqual({ raw: 3.3, cards: 4 });
  });
  it('เปลี่ยนค่าแล้วจำนวนใบเปลี่ยนตาม', () => {
    expect(kanbanCards(60, 0.5, 10, 0)!.cards).toBe(3);
    expect(kanbanCards(120, 0.5, 10, 0.1)!.cards).toBe(7);
    expect(kanbanCards(60, 0.5, 30, 0.1)!.cards).toBe(2);
  });
  it('ค่าไม่ถูกต้อง → null (ไม่ crash)', () => {
    expect(kanbanCards(0, 0.5, 10, 0.1)).toBeNull();
    expect(kanbanCards(60, 0.5, 0, 0.1)).toBeNull();
    expect(kanbanCards(60, 0.5, 10, -1)).toBeNull();
  });
});

describe('compareLines — เปรียบเทียบผังก่อน-หลัง', () => {
  it('บอกส่วนต่างเป็นตัวเลขและ %', () => {
    const before = balanceLine(lineOf([30, 40, 20]).stations, lineOf([30, 40, 20]).map);
    const after = balanceLine(lineOf([45, 45]).stations, lineOf([45, 45]).map);
    const [ct, eff, , stations] = compareLines(before, after);
    expect(ct.diff).toBe(5);
    expect(ct.diffPercent).toBeCloseTo(12.5, 10);
    expect(eff.after).toBe(100);
    expect(stations.diff).toBe(-1);
  });
});

describe('buildLineBalanceSheets — Export Excel มีเงื่อนไขกำกับเสมอ', async () => {
  const { buildLineBalanceSheets } = await import('./lineBalanceExport');
  const { map, stations } = lineOf([30, 40, 20]);
  const line = balanceLine(stations, map, 48, 28800);
  const procs = new Map(
    [...map.keys()].map((k) => [k, { key: k, name: `งาน ${k}`, rounds: [], n: 5, meanSec: map.get(k)!, sdSec: 1, requiredRounds: 8, enoughData: false, duplicateStepRounds: 0, abnormalRatingSteps: 0 }])
  );
  const sheets = buildLineBalanceSheets(line, procs, [], {
    layoutName: 'ก่อนปรับปรุง',
    basis: 'observed',
    lastN: 10,
    takt: 48,
    taktSource: '480 นาที/กะ ÷ 600 ชิ้น/กะ',
    usedRounds: 15,
    excludedRounds: 2,
    exportedAt: 'x',
  });
  it('มีครบ 4 ชีต', () => expect(Object.keys(sheets)).toEqual(['ตัวชี้วัด', 'สถานี', 'ข้อเสนอแนะ', 'เงื่อนไข']));
  it('ตัวชี้วัดตรงกับผลคำนวณ', () => {
    const row = (label: string) => sheets['ตัวชี้วัด'].find((r) => r[0] === label)!;
    expect(row('Cycle Time ของสาย (CT)')[1]).toBe(40);
    expect(row('Line Balance Efficiency')[1]).toBe(75);
    expect(row('ผ่าน Takt')[1]).toBe('ผ่าน');
  });
  it('สถานีมีชื่อ Process และจำนวนรอบ / ที่ควรมี', () => {
    expect(sheets['สถานี'][2]).toEqual(['สถานี 2', 'งาน p1', 40, 0, 83.33, 'ใช่', '5/8']);
  });
  it('เงื่อนไขบอกที่มาของตัวเลข', () => {
    const cond = Object.fromEntries(sheets['เงื่อนไข'].slice(1));
    expect(cond['เวลาที่ใช้']).toContain('observed');
    expect(cond['จำนวนรอบ']).toContain('10 รอบล่าสุด');
    expect(cond['รอบที่ตัดทิ้ง (ไม่มี Step / เวลา 0)']).toBe(2);
  });
});
