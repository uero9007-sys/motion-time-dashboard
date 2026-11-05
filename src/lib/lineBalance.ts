// Line Balancing ระดับ Process — ฟังก์ชันบริสุทธิ์ (pure function) ทั้งหมด ไม่มี React / Supabase
// ใช้สูตรพื้นฐานจาก ie.ts ซ้ำ (Standard Time, ค่าเฉลี่ย, SD, Sample Size) ไม่เขียนสูตรใหม่
import { calculateStandardTime, mean, requiredSampleSize, sampleStdDev } from './ie';
import type { Step } from '../types';

// ---------------------------------------------------------------------------
// ข้อมูลดิบ (เฉพาะคอลัมน์ที่ใช้)
// ---------------------------------------------------------------------------
export type LbStudy = {
  id: string;
  process_group_id: string | null;
  process_name: string;
  allowance_percent: number | null;
  quantity_produced: number | null;
  created_at: string;
};
export type LbStep = Pick<Step, 'study_id' | 'name' | 'time_ms' | 'performance_rating'>;
export type LbDefect = { study_id: string; step_name: string };
export type LbGroup = { id: string; name: string };

export type TimeBasis = 'observed' | 'standard';

export type SummaryOptions = {
  basis: TimeBasis;
  // ใช้เฉพาะ N รอบล่าสุดของแต่ละ Process (null = ทุกรอบ)
  lastN: number | null;
  // Rating นอกช่วงนี้ถือว่า "ผิดปกติ" (เกณฑ์หยาบ แก้ได้ ไม่ใช่มาตรฐาน)
  ratingMin: number;
  ratingMax: number;
  // ระดับความเชื่อมั่น / ความคลาดเคลื่อนของ Sample Size (ใช้สูตรเดิม)
  confidence: number;
  errorPercent: number;
};

export const DEFAULT_SUMMARY_OPTIONS: SummaryOptions = {
  basis: 'observed',
  lastN: null,
  ratingMin: 50,
  ratingMax: 150,
  confidence: 95,
  errorPercent: 5,
};

export type ProcessRound = { studyId: string; createdAt: string; timeSec: number };

export type ProcessSummary = {
  key: string;
  name: string;
  rounds: ProcessRound[]; // เรียงจากเก่าไปใหม่
  n: number;
  meanSec: number;
  // null เมื่อมีน้อยกว่า 2 รอบ (SD ไม่มีความหมาย)
  sdSec: number | null;
  requiredRounds: number; // จากสูตร Sample Size เดิม
  enoughData: boolean;
  duplicateStepRounds: number; // จำนวนรอบที่มี Step ชื่อซ้ำ
  abnormalRatingSteps: number; // จำนวนแถว Step ที่ Rating นอกช่วง
};

export type ProcessSummaryResult = {
  processes: ProcessSummary[];
  usedRounds: number;
  excludedRounds: number; // รอบที่ไม่มี Step หรือเวลารวมเป็น 0
  duplicateStepRounds: number;
  abnormalRatingSteps: number;
};

// Process = Process ใหญ่ (process_group) ถ้าไม่มี ใช้ชื่อ process_name
export const processKeyOf = (s: Pick<LbStudy, 'process_group_id' | 'process_name'>) =>
  s.process_group_id ?? `name:${s.process_name}`;

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

// เวลาต่อชิ้นของ 1 รอบ (วินาที): หารด้วยจำนวนที่ผลิตในรอบ (ไม่กรอก = 1)
export function roundTimeSec(study: LbStudy, stepsOfStudy: LbStep[], basis: TimeBasis): number {
  const qty = study.quantity_produced && study.quantity_produced > 0 ? study.quantity_produced : 1;
  const ms =
    basis === 'standard'
      ? calculateStandardTime(stepsOfStudy as Step[], study.allowance_percent)
      : stepsOfStudy.reduce((sum, s) => sum + (s.time_ms || 0), 0);
  return finite(ms / 1000 / qty);
}

export function summarizeProcesses(
  studies: LbStudy[],
  steps: LbStep[],
  groups: LbGroup[],
  options: SummaryOptions = DEFAULT_SUMMARY_OPTIONS
): ProcessSummaryResult {
  const stepsByStudy = new Map<string, LbStep[]>();
  steps.forEach((s) => {
    const list = stepsByStudy.get(s.study_id) ?? [];
    list.push(s);
    stepsByStudy.set(s.study_id, list);
  });
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  type Acc = { name: string; rounds: ProcessRound[]; dup: number; abnormal: number };
  const acc = new Map<string, Acc>();
  let excludedRounds = 0;

  [...studies]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((study) => {
      const list = stepsByStudy.get(study.id) ?? [];
      const totalMs = list.reduce((sum, s) => sum + (s.time_ms || 0), 0);
      if (list.length === 0 || totalMs <= 0) {
        excludedRounds++;
        return;
      }
      const key = processKeyOf(study);
      const entry = acc.get(key) ?? {
        name: (study.process_group_id && groupName.get(study.process_group_id)) || study.process_name || 'ไม่ระบุชื่อ',
        rounds: [],
        dup: 0,
        abnormal: 0,
      };
      const names = list.map((s) => s.name.trim());
      if (new Set(names).size !== names.length) entry.dup++;
      entry.abnormal += list.filter((s) => {
        const r = s.performance_rating ?? 100;
        return r < options.ratingMin || r > options.ratingMax;
      }).length;
      entry.rounds.push({ studyId: study.id, createdAt: study.created_at, timeSec: roundTimeSec(study, list, options.basis) });
      acc.set(key, entry);
    });

  const processes: ProcessSummary[] = [...acc.entries()]
    .map(([key, a]) => {
      const rounds = options.lastN && options.lastN > 0 ? a.rounds.slice(-options.lastN) : a.rounds;
      const times = rounds.map((r) => r.timeSec);
      const sample = requiredSampleSize(times, options.confidence, options.errorPercent);
      return {
        key,
        name: a.name,
        rounds,
        n: rounds.length,
        meanSec: finite(mean(times)),
        sdSec: rounds.length >= 2 ? finite(sampleStdDev(times)) : null,
        requiredRounds: sample.required,
        enoughData: rounds.length >= 2 && rounds.length >= sample.required,
        duplicateStepRounds: a.dup,
        abnormalRatingSteps: a.abnormal,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));

  return {
    processes,
    usedRounds: processes.reduce((sum, p) => sum + p.n, 0),
    excludedRounds,
    duplicateStepRounds: processes.reduce((sum, p) => sum + p.duplicateStepRounds, 0),
    abnormalRatingSteps: processes.reduce((sum, p) => sum + p.abnormalRatingSteps, 0),
  };
}

// ---------------------------------------------------------------------------
// Takt / Line Balancing
// ---------------------------------------------------------------------------

// Takt = เวลาทำงานต่อกะ / ยอดผลิตต่อกะ (null = ยังไม่กรอก หรือค่าไม่ถูกต้อง)
export function taktTime(availableSec: number, demandPerShift: number): number | null {
  if (!(availableSec > 0) || !(demandPerShift > 0)) return null;
  return availableSec / demandPerShift;
}

// จำนวนสถานีขั้นต่ำเชิงทฤษฎี = ceil(ΣT / Takt)
export function minimumStations(totalWorkSec: number, takt: number | null): number | null {
  if (takt === null || !(takt > 0) || !(totalWorkSec > 0)) return null;
  return Math.ceil(totalWorkSec / takt);
}

export type StationInput = { id: string; processKeys: string[] };

export type StationResult = {
  id: string;
  index: number; // 1, 2, 3 ...
  processKeys: string[];
  timeSec: number; // Ts_k
  idleSec: number | null; // CT − Ts_k (null = สถานีว่าง)
  utilizationVsTakt: number | null; // Ts_k / Takt × 100
  isBottleneck: boolean;
  isEmpty: boolean;
};

export type LineResult = {
  stations: StationResult[];
  totalWorkSec: number; // ΣT
  cycleTimeSec: number; // CT = max(Ts_k)
  activeStations: number; // n (ไม่นับสถานีว่าง)
  emptyStations: number;
  efficiency: number; // Line Balance Efficiency (%)
  balanceDelay: number; // %
  smoothnessIndex: number;
  takt: number | null;
  meetsTakt: boolean | null; // CT ≤ Takt
  taktGapSec: number | null; // CT − Takt (บวก = เกิน Takt)
  minStations: number | null;
  capacityPerShift: number | null; // เวลาทำงานต่อกะ / CT
};

export function balanceLine(
  stations: StationInput[],
  processTimeSec: ReadonlyMap<string, number>,
  takt: number | null = null,
  availableSec: number | null = null
): LineResult {
  const withTimes = stations.map((st, i) => {
    const keys = st.processKeys.filter((k) => processTimeSec.has(k));
    return { id: st.id, index: i + 1, processKeys: keys, timeSec: finite(keys.reduce((sum, k) => sum + (processTimeSec.get(k) ?? 0), 0)) };
  });
  const active = withTimes.filter((s) => s.processKeys.length > 0);
  const cycleTimeSec = active.length > 0 ? Math.max(...active.map((s) => s.timeSec)) : 0;
  const totalWorkSec = active.reduce((sum, s) => sum + s.timeSec, 0);
  const n = active.length;
  const efficiency = n > 0 && cycleTimeSec > 0 ? (totalWorkSec / (n * cycleTimeSec)) * 100 : 0;
  const smoothnessIndex = Math.sqrt(active.reduce((sum, s) => sum + (cycleTimeSec - s.timeSec) ** 2, 0));
  const validTakt = takt !== null && takt > 0 ? takt : null;

  return {
    stations: withTimes.map((s) => {
      const isEmpty = s.processKeys.length === 0;
      return {
        ...s,
        idleSec: isEmpty ? null : cycleTimeSec - s.timeSec,
        utilizationVsTakt: validTakt && !isEmpty ? (s.timeSec / validTakt) * 100 : null,
        isBottleneck: !isEmpty && cycleTimeSec > 0 && s.timeSec === cycleTimeSec,
        isEmpty,
      };
    }),
    totalWorkSec,
    cycleTimeSec,
    activeStations: n,
    emptyStations: withTimes.length - n,
    efficiency,
    balanceDelay: n > 0 && cycleTimeSec > 0 ? 100 - efficiency : 0,
    smoothnessIndex: finite(smoothnessIndex),
    takt: validTakt,
    meetsTakt: validTakt && cycleTimeSec > 0 ? cycleTimeSec <= validTakt : null,
    taktGapSec: validTakt && cycleTimeSec > 0 ? cycleTimeSec - validTakt : null,
    minStations: minimumStations(totalWorkSec, validTakt),
    capacityPerShift: availableSec && availableSec > 0 && cycleTimeSec > 0 ? availableSec / cycleTimeSec : null,
  };
}

// ---------------------------------------------------------------------------
// ภายในของ Process (สถิติราย Step)
// ---------------------------------------------------------------------------
export type StepStat = {
  name: string;
  rounds: number; // จำนวนรอบที่มี Step นี้
  meanSec: number;
  sdSec: number | null;
  cv: number | null; // SD / ค่าเฉลี่ย (%)
  minSec: number;
  maxSec: number;
  sharePercent: number; // % ของเวลา Process (เฉลี่ยต่อรอบ)
  defects: number;
};

export type ProcessDetail = {
  steps: StepStat[]; // เรียงจากใช้เวลามากไปน้อย
  roundSeries: { studyId: string; createdAt: string; totalSec: number }[];
  duplicateStepRounds: number;
  unmatchedDefects: number; // Defect ที่ชื่อ Step ไม่ตรงกับ Step ใดเลย
  totalDefects: number;
};

// ใช้เวลาจริง (observed) เสมอ เพราะเป็นการดูว่า Step ไหนกินเวลาบนหน้างาน
// Step ชื่อซ้ำใน 1 รอบ (เคยเกิดจากบั๊ก Merge) รวมเวลาเป็นค่าเดียวของรอบนั้นก่อนคำนวณ
export function processDetail(studyIds: string[], steps: LbStep[], defects: LbDefect[], studyDates: ReadonlyMap<string, string>): ProcessDetail {
  const ids = new Set(studyIds);
  const perRound = new Map<string, Map<string, number>>(); // studyId → (stepName → sec)
  let duplicateStepRounds = 0;
  studyIds.forEach((id) => perRound.set(id, new Map()));
  const seen = new Map<string, Set<string>>();
  steps.forEach((s) => {
    if (!ids.has(s.study_id)) return;
    const name = s.name.trim();
    const round = perRound.get(s.study_id)!;
    const names = seen.get(s.study_id) ?? new Set<string>();
    if (names.has(name)) names.add(`__dup__${name}`);
    names.add(name);
    seen.set(s.study_id, names);
    round.set(name, (round.get(name) ?? 0) + (s.time_ms || 0) / 1000);
  });
  seen.forEach((names) => {
    if ([...names].some((n) => n.startsWith('__dup__'))) duplicateStepRounds++;
  });

  const byStep = new Map<string, number[]>();
  perRound.forEach((round) => round.forEach((sec, name) => byStep.set(name, [...(byStep.get(name) ?? []), sec])));

  const relevantDefects = defects.filter((d) => ids.has(d.study_id));
  const defectCount = new Map<string, number>();
  relevantDefects.forEach((d) => defectCount.set(d.step_name.trim(), (defectCount.get(d.step_name.trim()) ?? 0) + 1));

  const roundSeries = studyIds
    .map((id) => ({ studyId: id, createdAt: studyDates.get(id) ?? '', totalSec: [...(perRound.get(id)?.values() ?? [])].reduce((a, b) => a + b, 0) }))
    .filter((r) => r.totalSec > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const meanProcess = mean(roundSeries.map((r) => r.totalSec));

  const stepStats: StepStat[] = [...byStep.entries()].map(([name, values]) => {
    const m = mean(values);
    const sd = values.length >= 2 ? sampleStdDev(values) : null;
    // เวลาเฉลี่ยต่อรอบของ Step (รอบที่ไม่มี Step นี้นับเป็น 0) เทียบกับเวลาเฉลี่ยของ Process
    const perRoundMean = values.reduce((a, b) => a + b, 0) / Math.max(roundSeries.length, 1);
    return {
      name,
      rounds: values.length,
      meanSec: finite(m),
      sdSec: sd === null ? null : finite(sd),
      cv: sd !== null && m > 0 ? finite((sd / m) * 100) : null,
      minSec: values.length ? Math.min(...values) : 0,
      maxSec: values.length ? Math.max(...values) : 0,
      sharePercent: meanProcess > 0 ? finite((perRoundMean / meanProcess) * 100) : 0,
      defects: defectCount.get(name) ?? 0,
    };
  });

  const stepNames = new Set(stepStats.map((s) => s.name));
  return {
    steps: stepStats.sort((a, b) => b.meanSec - a.meanSec),
    roundSeries,
    duplicateStepRounds,
    unmatchedDefects: relevantDefects.filter((d) => !stepNames.has(d.step_name.trim())).length,
    totalDefects: relevantDefects.length,
  };
}

// ---------------------------------------------------------------------------
// ข้อเสนอการปรับปรุงเบื้องต้น (ECRS) — กฎหยาบ (rule of thumb) แก้เกณฑ์ได้ ไม่ใช่มาตรฐาน
// ---------------------------------------------------------------------------
export const SUGGESTION_DISCLAIMER = 'ข้อเสนอเบื้องต้น ต้องให้วิศวกรยืนยันหน้างาน';

export type SuggestionRules = {
  stepSharePercent: number; // Step เดียวกินเวลาเกิน % นี้ของ Process
  stepCvPercent: number; // CV ของ Step เกิน % นี้
  bestGapPercent: number; // รอบที่เร็วที่สุดเร็วกว่าค่าเฉลี่ยเกิน % นี้
  defectSharePercent: number; // Defect ของ Process เกิน % นี้อยู่ที่ Step เดียว
  minDefects: number; // ต้องมี Defect อย่างน้อยเท่านี้ก่อนจะสรุปว่า "กระจุก"
};

export const DEFAULT_SUGGESTION_RULES: SuggestionRules = {
  stepSharePercent: 40,
  stepCvPercent: 20,
  bestGapPercent: 20,
  defectSharePercent: 50,
  minDefects: 2,
};

export type Suggestion = {
  id: string;
  title: string;
  reason: string; // อ้างตัวเลขจากข้อมูลจริง
  howToVerify: string;
  disclaimer: string;
};

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

export type SuggestionContext = {
  line: LineResult;
  stationLabel: (index: number) => string;
  bottleneck: { stationIndex: number; processName: string; process: ProcessSummary; detail: ProcessDetail } | null;
};

export function suggestImprovements(ctx: SuggestionContext, rules: SuggestionRules = DEFAULT_SUGGESTION_RULES): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (id: string, title: string, reason: string, howToVerify: string) =>
    out.push({ id, title, reason, howToVerify, disclaimer: SUGGESTION_DISCLAIMER });
  const { line } = ctx;

  // 1) สถานีที่เกิน Takt
  if (line.takt !== null) {
    line.stations
      .filter((s) => !s.isEmpty && s.timeSec > line.takt!)
      .forEach((s) => {
        const neighbours = line.stations.filter((o) => !o.isEmpty && Math.abs(o.index - s.index) === 1 && (o.idleSec ?? 0) > 0);
        const best = neighbours.sort((a, b) => (b.idleSec ?? 0) - (a.idleSec ?? 0))[0];
        const neighbourText = best
          ? ` สถานีข้างเคียงที่มีเวลาว่างมากที่สุดคือ ${ctx.stationLabel(best.index)} (ว่าง ${f2(best.idleSec ?? 0)} วินาที)`
          : ' ไม่มีสถานีข้างเคียงที่มีเวลาว่าง';
        add(
          `over-takt-${s.index}`,
          `${ctx.stationLabel(s.index)} ใช้เวลาเกิน Takt`,
          `ใช้ ${f2(s.timeSec)} วินาที เกิน Takt ${f2(line.takt!)} วินาที อยู่ ${f2(s.timeSec - line.takt!)} วินาที (${f1(s.utilizationVsTakt ?? 0)}% ของ Takt)${neighbourText} ทางเลือกตามหลัก ECRS: ย้ายงานย่อยบางส่วนไปสถานีข้างเคียง, เพิ่มคนหรือสถานีขนาน, หรือใช้จิ๊ก/อุปกรณ์ช่วย`,
          'ยืนดูการทำงานที่สถานีนี้ 3–5 รอบ แยกว่างานย่อยใดย้ายไปสถานีอื่นได้โดยไม่ต้องย้ายเครื่องมือ แล้วจับเวลาซ้ำหลังทดลองย้าย'
        );
      });
  }

  const b = ctx.bottleneck;
  if (!b) return out;
  const top = b.detail.steps[0];

  // 2) Step เดียวกินเวลาเกินสัดส่วน
  if (top && top.sharePercent > rules.stepSharePercent) {
    add(
      `step-share-${top.name}`,
      `ศึกษาการเคลื่อนไหวของ Step "${top.name}"`,
      `Step นี้ใช้เฉลี่ย ${f2(top.meanSec)} วินาที คิดเป็น ${f1(top.sharePercent)}% ของเวลา Process "${b.processName}" (เกณฑ์ ${rules.stepSharePercent}%) ลองใช้ ECRS: ตัดงานที่ไม่จำเป็น (Eliminate), รวมกับ Step อื่น (Combine), สลับลำดับ (Rearrange), ทำให้ง่ายขึ้น (Simplify)`,
      'ถ่ายวิดีโอ Step นี้แล้วแตกเป็นการเคลื่อนไหวย่อย ดูการเอื้อม หยิบ เดิน รอ ที่ตัดหรือลดได้'
    );
  }

  // 3) Step ที่เวลาไม่นิ่ง (CV สูง)
  b.detail.steps
    .filter((s) => s.cv !== null && s.cv > rules.stepCvPercent)
    .slice(0, 3)
    .forEach((s) => {
      const notEnough = !b.process.enoughData ? ` และ Process นี้มีข้อมูล ${b.process.n} รอบ จากที่ควรมี ${b.process.requiredRounds} รอบ` : '';
      add(
        `step-cv-${s.name}`,
        `เวลาของ Step "${s.name}" ไม่นิ่ง`,
        `CV ${f1(s.cv!)}% (เกณฑ์ ${rules.stepCvPercent}%) เวลาอยู่ระหว่าง ${f2(s.minSec)}–${f2(s.maxSec)} วินาที จาก ${s.rounds} รอบ${notEnough} อาจเป็นเพราะวิธีทำต่างกันในแต่ละรอบ ควรทำมาตรฐานงานและฝึกอบรม`,
        'เทียบวิธีทำในรอบที่เร็วที่สุดกับช้าที่สุด และจับเวลาเพิ่มให้ครบจำนวนรอบตาม Sample Size'
      );
    });

  // 4) รอบที่ดีที่สุดเร็วกว่าค่าเฉลี่ยมาก
  const series = b.detail.roundSeries;
  if (series.length >= 2) {
    const avg = mean(series.map((r) => r.totalSec));
    const bestRound = series.reduce((m, r) => (r.totalSec < m.totalSec ? r : m), series[0]);
    const gap = avg > 0 ? ((avg - bestRound.totalSec) / avg) * 100 : 0;
    if (gap > rules.bestGapPercent) {
      add(
        'best-gap',
        `บางรอบของ "${b.processName}" ทำได้เร็วกว่าค่าเฉลี่ยมาก`,
        `รอบที่เร็วที่สุดใช้ ${f2(bestRound.totalSec)} วินาที เร็วกว่าค่าเฉลี่ย ${f2(avg)} วินาที อยู่ ${f1(gap)}% (เกณฑ์ ${rules.bestGapPercent}%) แปลว่าทำได้เร็วกว่านี้จริงในบางรอบ`,
        'ดูว่ารอบที่เร็วที่สุดทำต่างอย่างไร (ผู้ปฏิบัติงาน ลำดับงาน วัสดุ) แล้วทดลองใช้วิธีนั้นเป็นมาตรฐาน'
      );
    }
  }

  // 5) Defect กระจุกที่ Step เดียว
  const totalDefects = b.detail.totalDefects;
  const worst = [...b.detail.steps].sort((x, y) => y.defects - x.defects)[0];
  if (worst && totalDefects >= rules.minDefects && worst.defects > 0) {
    const share = (worst.defects / totalDefects) * 100;
    if (share >= rules.defectSharePercent) {
      add(
        `defect-${worst.name}`,
        `Defect กระจุกที่ Step "${worst.name}"`,
        `พบ Defect ${worst.defects} จาก ${totalDefects} ครั้ง (${f1(share)}%, เกณฑ์ ${rules.defectSharePercent}%) ควรแก้ที่ต้นเหตุของ Defect ก่อนเร่งความเร็ว ไม่งั้นงานเสียจะเพิ่ม`,
        'เก็บตัวอย่างชิ้นงานเสียจาก Step นี้ ทำผังก้างปลา (Fishbone) หาสาเหตุ แล้วเทียบจำนวน Defect ก่อน-หลังแก้'
      );
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Kanban เบื้องต้น: N = ceil( D × L × (1 + SF) / C )
// ---------------------------------------------------------------------------
export type KanbanResult = { raw: number; cards: number };

export function kanbanCards(demandPerHour: number, leadTimeHours: number, containerQty: number, safetyFactor: number): KanbanResult | null {
  if (!(demandPerHour > 0) || !(leadTimeHours > 0) || !(containerQty > 0) || !(safetyFactor >= 0)) return null;
  const raw = (demandPerHour * leadTimeHours * (1 + safetyFactor)) / containerQty;
  // ปัดเศษทศนิยมเล็กๆ จากการคูณทศนิยม (เช่น 3.3000000000000003) ก่อนปัดขึ้น
  const rounded = Math.round(raw * 1e9) / 1e9;
  return { raw: rounded, cards: Math.ceil(rounded) };
}

// ---------------------------------------------------------------------------
// เปรียบเทียบสองผัง
// ---------------------------------------------------------------------------
export type MetricDiff = { label: string; before: number; after: number; diff: number; diffPercent: number | null };

export function compareLines(before: LineResult, after: LineResult): MetricDiff[] {
  const row = (label: string, a: number, b: number): MetricDiff => ({
    label,
    before: a,
    after: b,
    diff: b - a,
    diffPercent: a !== 0 ? ((b - a) / a) * 100 : null,
  });
  return [
    row('Cycle Time ของสาย (วินาที)', before.cycleTimeSec, after.cycleTimeSec),
    row('Line Balance Efficiency (%)', before.efficiency, after.efficiency),
    row('Balance Delay (%)', before.balanceDelay, after.balanceDelay),
    row('จำนวนสถานีที่ใช้', before.activeStations, after.activeStations),
  ];
}
