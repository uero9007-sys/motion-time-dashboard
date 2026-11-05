// หน้า "การทำ Line Balancing สำหรับ Process": ลาก Process ใส่สถานี แล้วคำนวณ Line Balancing ทันที
// สูตรทั้งหมดอยู่ใน lib/lineBalance.ts (ฟังก์ชันบริสุทธิ์ มี unit test) หน้านี้แค่เก็บ state และแสดงผล
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchAllRows } from '../lib/fetchAll';
import {
  DEFAULT_SUGGESTION_RULES,
  DEFAULT_SUMMARY_OPTIONS,
  SUGGESTION_DISCLAIMER,
  balanceLine,
  compareLines,
  kanbanCards,
  processDetail,
  suggestImprovements,
  summarizeProcesses,
  taktTime,
  type LbDefect,
  type LbGroup,
  type LbStep,
  type LbStudy,
  type ProcessSummary,
  type StationInput,
  type SuggestionRules,
  type TimeBasis,
} from '../lib/lineBalance';
import { buildLineBalanceSheets } from '../lib/lineBalanceExport';
import { LINE_BALANCE_STORAGE_KEY } from '../lib/settings';

type Props = {
  organizationId: string;
  defaultShiftMinutes: number;
};

const LIBRARY_ID = 'library';
const CHART = { bar: '#A07C5B', grid: '#EEE7DC', axis: '#E4DCCF', tick: '#7A6F63', line: '#5E7552' };
const fmt = (n: number | null | undefined, digits = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toFixed(digits));
const newId = () => crypto.randomUUID();
// เวลาปัจจุบัน ใช้ในปุ่มบันทึก/Export เท่านั้น (ไม่ใช่ตอน render)
const now = () => new Date();

// ---------- ค่าที่จำไว้ในเบราว์เซอร์ (แยกตามทีม) ----------
type TaktMode = 'shift' | 'direct';
type Working = {
  version: 1;
  basis: TimeBasis;
  lastN: number | null;
  ratingMin: number;
  ratingMax: number;
  taktMode: TaktMode;
  shiftMinutes: number;
  demand: number;
  directTakt: number;
  stations: StationInput[];
  rules: SuggestionRules;
  kanban: { d: number; l: number; c: number; sf: number };
};
type SavedLayout = {
  id: string;
  name: string;
  savedAt: string;
  basis: TimeBasis;
  lastN: number | null;
  takt: number | null;
  availableSec: number | null;
  stations: StationInput[];
};
type LayoutStore = { version: 1; layouts: SavedLayout[] };

const workingKey = (org: string) => `${LINE_BALANCE_STORAGE_KEY}:${org || 'test'}`;
const layoutsKey = (org: string) => `mts-line-layouts-v1:${org || 'test'}`;

function defaultWorking(shiftMinutes: number): Working {
  return {
    version: 1,
    basis: DEFAULT_SUMMARY_OPTIONS.basis,
    lastN: null,
    ratingMin: DEFAULT_SUMMARY_OPTIONS.ratingMin,
    ratingMax: DEFAULT_SUMMARY_OPTIONS.ratingMax,
    taktMode: 'shift',
    shiftMinutes,
    demand: 0,
    directTakt: 0,
    stations: [
      { id: newId(), processKeys: [] },
      { id: newId(), processKeys: [] },
      { id: newId(), processKeys: [] },
    ],
    rules: DEFAULT_SUGGESTION_RULES,
    kanban: { d: 60, l: 0.5, c: 10, sf: 0.1 },
  };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // เบราว์เซอร์ไม่อนุญาตให้บันทึก — ใช้งานต่อได้ แค่ไม่จำค่า
  }
}

// ---------- ข้อมูลดิบ ----------
type Raw = { studies: LbStudy[]; steps: LbStep[]; defects: LbDefect[]; groups: LbGroup[] };
type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; raw: Raw };

// ---------------------------------------------------------------------------
export default function LineBalancingPage({ organizationId, defaultShiftMinutes }: Props) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [w, setW] = useState<Working>(() => {
    const saved = readJson<Working>(workingKey(organizationId));
    return saved?.version === 1 ? { ...defaultWorking(defaultShiftMinutes), ...saved } : defaultWorking(defaultShiftMinutes);
  });
  const [layouts, setLayouts] = useState<SavedLayout[]>(() => readJson<LayoutStore>(layoutsKey(organizationId))?.layouts ?? []);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState<Record<string, number>>({});
  const [layoutName, setLayoutName] = useState('');
  const [compareIds, setCompareIds] = useState<[string, string]>(['', '']);
  const [notice, setNotice] = useState('');

  useEffect(() => writeJson(workingKey(organizationId), w), [w, organizationId]);
  useEffect(() => writeJson(layoutsKey(organizationId), { version: 1, layouts } satisfies LayoutStore), [layouts, organizationId]);

  // โหลดครั้งเดียว (ลากวางไม่ยิง query ซ้ำ) เลือกเฉพาะคอลัมน์ที่ใช้ และดึงทีละหน้ากันข้อมูลถูกตัดที่ 1,000 แถว
  useEffect(() => {
    let cancelled = false;
    const filter: Record<string, string> = organizationId ? { organization_id: organizationId } : {};
    (async () => {
      setLoad({ kind: 'loading' });
      const [studies, steps, defects, groups] = await Promise.all([
        fetchAllRows<LbStudy>('studies', 'id, process_group_id, process_name, allowance_percent, quantity_produced, created_at', filter),
        fetchAllRows<LbStep>('steps', 'study_id, name, time_ms, performance_rating', filter),
        fetchAllRows<LbDefect>('defect_logs', 'study_id, step_name', filter),
        fetchAllRows<LbGroup>('process_groups', 'id, name', filter),
      ]);
      if (cancelled) return;
      const error = studies.error ?? steps.error ?? defects.error ?? groups.error;
      if (error) {
        setLoad({
          kind: 'error',
          message: /fetch|network/i.test(error) ? 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบเน็ตแล้วลองใหม่' : `โหลดข้อมูลไม่สำเร็จ: ${error}`,
        });
        return;
      }
      setLoad({ kind: 'ready', raw: { studies: studies.data, steps: steps.data, defects: defects.data, groups: groups.data } });
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, reloadKey]);

  const raw = load.kind === 'ready' ? load.raw : null;

  // ---------- คำนวณ (ทุกครั้งที่ลาก/เปลี่ยนค่า ใช้ข้อมูลที่โหลดแล้ว) ----------
  const summaryOptions = useMemo(
    () => ({ ...DEFAULT_SUMMARY_OPTIONS, basis: w.basis, lastN: w.lastN, ratingMin: w.ratingMin, ratingMax: w.ratingMax }),
    [w.basis, w.lastN, w.ratingMin, w.ratingMax]
  );
  const summary = useMemo(
    () => (raw ? summarizeProcesses(raw.studies, raw.steps, raw.groups, summaryOptions) : null),
    [raw, summaryOptions]
  );
  const processes = useMemo(() => new Map((summary?.processes ?? []).map((p) => [p.key, p])), [summary]);
  const timeMap = useMemo(() => new Map([...processes.values()].map((p) => [p.key, p.meanSec])), [processes]);

  const availableSec = w.taktMode === 'shift' ? w.shiftMinutes * 60 : null;
  const takt = w.taktMode === 'shift' ? taktTime(w.shiftMinutes * 60, w.demand) : w.directTakt > 0 ? w.directTakt : null;
  const line = balanceLine(w.stations, timeMap, takt, availableSec);

  // Process ที่อยู่บนสายแล้ว (1 Process อยู่ได้ที่เดียว)
  const placed = new Map<string, string>();
  w.stations.forEach((s) => s.processKeys.forEach((k) => placed.set(k, s.id)));
  const library = [...processes.values()].filter((p) => !placed.has(p.key));

  // ---------- คอขวด / Process ที่เลือก ----------
  const bottleneckStation = line.stations.find((s) => s.isBottleneck) ?? null;
  const bottleneckProcessKey = bottleneckStation
    ? [...bottleneckStation.processKeys].sort((a, b) => (timeMap.get(b) ?? 0) - (timeMap.get(a) ?? 0))[0]
    : null;
  const focusKey = selectedKey && processes.has(selectedKey) ? selectedKey : bottleneckProcessKey;
  const focus = focusKey ? processes.get(focusKey) ?? null : null;
  const studyDates = useMemo(() => new Map((raw?.studies ?? []).map((s) => [s.id, s.created_at])), [raw]);
  const detail = useMemo(
    () => (focus && raw ? processDetail(focus.rounds.map((r) => r.studyId), raw.steps, raw.defects, studyDates) : null),
    [focus, raw, studyDates]
  );
  const focusStation = focusKey ? line.stations.find((s) => s.processKeys.includes(focusKey)) ?? null : null;
  const suggestions =
    focus && detail && focusStation
      ? suggestImprovements(
          { line, stationLabel: (i) => `สถานี ${i}`, bottleneck: { stationIndex: focusStation.index, processName: focus.name, process: focus, detail } },
          w.rules
        )
      : suggestImprovements({ line, stationLabel: (i) => `สถานี ${i}`, bottleneck: null }, w.rules);

  // What-if: ลองเปลี่ยนเวลาของ Process แล้วเทียบผลก่อน-หลัง (ไม่บันทึกลงฐานข้อมูล)
  const whatIfActive = Object.keys(whatIf).length > 0;
  const whatIfLine = whatIfActive
    ? balanceLine(w.stations, new Map([...timeMap].map(([k, v]) => [k, whatIf[k] ?? v])), takt, availableSec)
    : null;

  // ---------- จัดการสถานี ----------
  const update = (patch: Partial<Working> | ((prev: Working) => Partial<Working>)) =>
    setW((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));

  const moveProcess = (key: string, target: string) =>
    update((prev) => ({
      stations: prev.stations.map((s) => {
        const without = s.processKeys.filter((k) => k !== key);
        return s.id === target ? { ...s, processKeys: [...without, key] } : { ...s, processKeys: without };
      }),
    }));

  const addStation = () => update((prev) => ({ stations: [...prev.stations, { id: newId(), processKeys: [] }] }));
  const removeStation = (id: string) => {
    const station = w.stations.find((s) => s.id === id);
    if (station && station.processKeys.length > 0) {
      const names = station.processKeys.map((k) => processes.get(k)?.name ?? k).join(', ');
      if (!window.confirm(`ลบสถานีนี้? Process ในสถานี (${names}) จะกลับไปที่คลัง`)) return;
    }
    update((prev) => ({ stations: prev.stations.filter((s) => s.id !== id) }));
  };
  const clearLine = () => {
    if (!window.confirm('ล้างสายผลิต? Process ทั้งหมดจะกลับไปที่คลัง')) return;
    update((prev) => ({ stations: prev.stations.map((s) => ({ ...s, processKeys: [] })) }));
  };

  // ลากด้วยเมาส์ (เริ่มเมื่อขยับ 5px), ทัช (กดค้าง 200ms กันชนกับการเลื่อนจอ), คีย์บอร์ด (Space เพื่อหยิบ/วาง ลูกศรเพื่อย้าย)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const stationName = (id: string | number | undefined) => {
    if (id === LIBRARY_ID) return 'คลัง Process';
    const i = w.stations.findIndex((s) => s.id === id);
    return i >= 0 ? `สถานี ${i + 1}` : 'ที่ว่าง';
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    moveProcess(String(active.id), String(over.id));
  };

  // ---------- ผังที่บันทึกไว้ ----------
  const saveLayout = () => {
    const name = layoutName.trim() || `ผัง ${now().toLocaleString('th-TH')}`;
    setLayouts((prev) => [
      ...prev.filter((l) => l.name !== name),
      { id: newId(), name, savedAt: now().toISOString(), basis: w.basis, lastN: w.lastN, takt, availableSec, stations: w.stations },
    ]);
    setLayoutName('');
    setNotice(`บันทึกผัง "${name}" แล้ว`);
  };
  const loadLayout = (l: SavedLayout) => {
    update({ stations: l.stations, basis: l.basis, lastN: l.lastN });
    setNotice(`โหลดผัง "${l.name}" แล้ว (Takt ใช้ค่าที่ตั้งอยู่ตอนนี้)`);
  };
  const deleteLayout = (l: SavedLayout) => {
    if (!window.confirm(`ลบผัง "${l.name}"?`)) return;
    setLayouts((prev) => prev.filter((x) => x.id !== l.id));
  };
  const lineOfLayout = (l: SavedLayout) => {
    const s = raw ? summarizeProcesses(raw.studies, raw.steps, raw.groups, { ...summaryOptions, basis: l.basis, lastN: l.lastN }) : null;
    return balanceLine(l.stations, new Map((s?.processes ?? []).map((p) => [p.key, p.meanSec])), l.takt, l.availableSec);
  };
  const compareA = layouts.find((l) => l.id === compareIds[0]);
  const compareB = layouts.find((l) => l.id === compareIds[1]);
  const comparison = compareA && compareB ? compareLines(lineOfLayout(compareA), lineOfLayout(compareB)) : null;

  const exportExcel = async () => {
    if (!summary) return;
    try {
      const { utils, writeFile } = await import('xlsx');
      const sheets = buildLineBalanceSheets(line, processes, suggestions, {
        layoutName: layoutName.trim() || 'ผังปัจจุบัน',
        basis: w.basis,
        lastN: w.lastN,
        takt,
        taktSource: w.taktMode === 'shift' ? `${w.shiftMinutes} นาที/กะ ÷ ${w.demand} ชิ้น/กะ` : 'กรอก Takt โดยตรง',
        usedRounds: summary.usedRounds,
        excludedRounds: summary.excludedRounds,
        exportedAt: now().toLocaleString('th-TH'),
      });
      const book = utils.book_new();
      Object.entries(sheets).forEach(([name, rows]) => utils.book_append_sheet(book, utils.aoa_to_sheet(rows), name));
      writeFile(book, `MTS-LineBalancing-${now().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      setNotice(`Export ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ---------- แสดงผล ----------
  if (load.kind === 'loading') return <p className="empty-state">กำลังโหลดข้อมูลการจับเวลา...</p>;
  if (load.kind === 'error')
    return (
      <div className="card">
        <p className="auth-message auth-error">{load.message}</p>
        <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>ลองใหม่</button>
      </div>
    );

  const s = summary!;
  const notEnough = [...processes.values()].filter((p) => !p.enoughData);
  const scaleMax = Math.max(line.cycleTimeSec, takt ?? 0, 1) * 1.15;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>การทำ Line Balancing สำหรับ Process</h1>
          <p className="page-subtitle">
            ใช้ {processes.size} Process จาก {s.usedRounds} รอบ
            {s.excludedRounds > 0 && ` · ตัดรอบที่ไม่สมบูรณ์ (ไม่มี Step หรือเวลา 0) ${s.excludedRounds} รอบ`}
            {' · '}ลาก Process ใส่สถานี หรือใช้เมนู &quot;ย้ายไปสถานี&quot; บนการ์ด
          </p>
        </div>
      </div>

      {processes.size === 0 ? (
        <p className="empty-state">ยังไม่มีข้อมูลการจับเวลาที่สมบูรณ์ในทีมนี้ จับเวลาจากแอปมือถือก่อน แล้วกลับมาที่หน้านี้</p>
      ) : (
        <>
          {/* ---------- ตั้งค่า ---------- */}
          <section className="card lb-settings">
            <h2>เงื่อนไขการคำนวณ</h2>
            <div className="lb-settings-grid">
              <label>
                เวลาของ Process
                <select value={w.basis} onChange={(e) => update({ basis: e.target.value as TimeBasis })}>
                  <option value="observed">เวลาจริงเฉลี่ย (observed)</option>
                  <option value="standard">Standard Time (Rating × Allowance)</option>
                </select>
              </label>
              <label>
                จำนวนรอบที่ใช้
                <select value={w.lastN ?? 0} onChange={(e) => update({ lastN: Number(e.target.value) || null })}>
                  <option value={0}>ทุกรอบ</option>
                  {[3, 5, 10, 20].map((n) => (
                    <option key={n} value={n}>{n} รอบล่าสุด</option>
                  ))}
                </select>
              </label>
              <label>
                วิธีกำหนด Takt
                <select value={w.taktMode} onChange={(e) => update({ taktMode: e.target.value as TaktMode })}>
                  <option value="shift">เวลาทำงานต่อกะ ÷ ยอดผลิต</option>
                  <option value="direct">กรอก Takt โดยตรง</option>
                </select>
              </label>
              {w.taktMode === 'shift' ? (
                <>
                  <label>
                    เวลาทำงานต่อกะ (นาที)
                    <input type="number" min={0} value={w.shiftMinutes} onChange={(e) => update({ shiftMinutes: Number(e.target.value) })} />
                  </label>
                  <label>
                    ยอดผลิตต่อกะ (ชิ้น)
                    <input type="number" min={0} value={w.demand || ''} placeholder="เช่น 600" onChange={(e) => update({ demand: Number(e.target.value) })} />
                  </label>
                </>
              ) : (
                <label>
                  Takt (วินาที/ชิ้น)
                  <input type="number" min={0} step="0.1" value={w.directTakt || ''} onChange={(e) => update({ directTakt: Number(e.target.value) })} />
                </label>
              )}
              <label>
                เตือนเมื่อ Rating นอกช่วง (%)
                <span className="lb-range">
                  <input type="number" value={w.ratingMin} onChange={(e) => update({ ratingMin: Number(e.target.value) })} aria-label="Rating ต่ำสุด" />
                  –
                  <input type="number" value={w.ratingMax} onChange={(e) => update({ ratingMax: Number(e.target.value) })} aria-label="Rating สูงสุด" />
                </span>
              </label>
            </div>
            <p className="lb-hint">
              Takt = {takt ? `${fmt(takt)} วินาที/ชิ้น` : 'ยังไม่กำหนด (กรอกยอดผลิตหรือ Takt เพื่อเทียบกับ Cycle Time)'} · เวลาต่อชิ้น = เวลารอบ ÷ จำนวนที่ผลิตในรอบ
              · ช่วง Rating เป็นเกณฑ์หยาบ (rule of thumb) ไม่ใช่มาตรฐาน
            </p>
          </section>

          {/* ---------- คำเตือนข้อมูล ---------- */}
          <DataWarnings
            items={[
              notEnough.length > 0 && `ข้อมูลยังไม่พอ ${notEnough.length} Process (${notEnough.map((p) => `${p.name} ${p.n}/${p.requiredRounds} รอบ`).join(', ')}) ตัวเลขที่ Balance จะยังไม่น่าเชื่อถือ`,
              s.excludedRounds > 0 && `ตัดรอบที่ไม่มี Step หรือเวลารวมเป็น 0 ออก ${s.excludedRounds} รอบ`,
              s.abnormalRatingSteps > 0 &&
                `พบ Step ที่ Rating นอกช่วง ${w.ratingMin}–${w.ratingMax}% จำนวน ${s.abnormalRatingSteps} แถว${w.basis === 'standard' ? ' ทำให้ Standard Time เพี้ยนได้ ลองสลับเป็นเวลาจริง' : ''}`,
              s.duplicateStepRounds > 0 && `พบรอบที่มี Step ชื่อซ้ำ ${s.duplicateStepRounds} รอบ (รวมเวลาเป็นค่าเดียวของรอบแล้ว)`,
              line.emptyStations > 0 && `มีสถานีว่าง ${line.emptyStations} สถานี (ไม่นับในการคำนวณ)`,
              library.length > 0 && line.activeStations > 0 && `ยังมี ${library.length} Process ที่ไม่ได้อยู่บนสาย`,
            ]}
          />

          {/* ---------- ลากวาง ---------- */}
          <DndContext
            sensors={sensors}
            onDragEnd={onDragEnd}
            accessibility={{
              screenReaderInstructions: { draggable: 'กด Space เพื่อหยิบ ใช้ลูกศรเลื่อนไปยังสถานี แล้วกด Space อีกครั้งเพื่อวาง กด Esc เพื่อยกเลิก' },
              announcements: {
                onDragStart: ({ active }) => `หยิบ ${processes.get(String(active.id))?.name ?? ''}`,
                onDragOver: ({ over }) => (over ? `อยู่เหนือ ${stationName(over.id)}` : undefined),
                onDragEnd: ({ active, over }) => (over ? `วาง ${processes.get(String(active.id))?.name ?? ''} ที่ ${stationName(over.id)}` : 'ยกเลิกการวาง'),
                onDragCancel: () => 'ยกเลิกการลาก',
              },
            }}
          >
            <section className="card">
              <div className="lb-section-head">
                <h2>คลัง Process ({library.length})</h2>
                <span className="lb-hint">จำนวนรอบ / รอบที่ควรมี ใช้สูตร Sample Size เดิม (ความเชื่อมั่น 95%, ±5%)</span>
              </div>
              <DropZone id={LIBRARY_ID} className="lb-library">
                {library.length === 0 && <p className="lb-empty">ทุก Process อยู่บนสายแล้ว</p>}
                {library.map((p) => (
                  <ProcessCard key={p.key} p={p} stations={w.stations} onMove={moveProcess} onSelect={setSelectedKey} selected={focusKey === p.key} />
                ))}
              </DropZone>
            </section>

            <section className="card">
              <div className="lb-section-head">
                <h2>สายผลิต (ซ้าย → ขวา)</h2>
                <div className="lb-actions">
                  <button className="btn" onClick={addStation}>+ เพิ่มสถานี</button>
                  <button className="btn" onClick={clearLine}>ล้างสาย</button>
                </div>
              </div>
              <div className="lb-line">
                {line.stations.map((st) => {
                  const pct = (v: number) => `${Math.min((v / scaleMax) * 100, 100)}%`;
                  return (
                    <DropZone
                      key={st.id}
                      id={st.id}
                      className={`lb-station${st.isBottleneck ? ' is-bottleneck' : ''}${st.isEmpty ? ' is-empty' : ''}`}
                    >
                      <div className="lb-station-head">
                        <strong>สถานี {st.index}</strong>
                        {st.isBottleneck && <span className="badge badge-bad">คอขวด</span>}
                        <button className="link-button link-danger" onClick={() => removeStation(st.id)} aria-label={`ลบสถานี ${st.index}`}>
                          ลบ
                        </button>
                      </div>
                      <div className="lb-bar" aria-hidden="true">
                        <div className="lb-bar-fill" style={{ height: pct(st.timeSec) }} />
                        {takt && <div className="lb-bar-takt" style={{ bottom: pct(takt) }} title={`Takt ${fmt(takt)} s`} />}
                        {line.cycleTimeSec > 0 && <div className="lb-bar-ct" style={{ bottom: pct(line.cycleTimeSec) }} title={`CT ${fmt(line.cycleTimeSec)} s`} />}
                      </div>
                      <div className="lb-station-time">
                        {st.isEmpty ? 'ว่าง' : `${fmt(st.timeSec)} s`}
                        {!st.isEmpty && <small> · Idle {fmt(st.idleSec)} s</small>}
                      </div>
                      <div className="lb-station-items">
                        {st.processKeys.map((k) => {
                          const p = processes.get(k);
                          return p ? (
                            <ProcessCard key={k} p={p} stations={w.stations} onMove={moveProcess} onSelect={setSelectedKey} selected={focusKey === k} compact />
                          ) : null;
                        })}
                        {st.isEmpty && <p className="lb-empty">ลาก Process มาวางที่นี่</p>}
                      </div>
                    </DropZone>
                  );
                })}
              </div>
              <p className="lb-hint">
                <span className="lb-legend lb-legend-takt" /> เส้น Takt <span className="lb-legend lb-legend-ct" /> เส้น Cycle Time ของสาย · ลากด้วยเมาส์, กดค้างบนจอสัมผัส หรือใช้แป้น Space + ลูกศร
              </p>
            </section>
          </DndContext>

          {/* ---------- ผลวิเคราะห์ ---------- */}
          {line.activeStations > 0 && (
            <>
              <section className="kpi-grid" aria-label="ผล Line Balancing">
                <Kpi label="Cycle Time ของสาย (CT)" value={`${fmt(line.cycleTimeSec)}`} unit="วินาที" />
                <Kpi label="Takt Time" value={fmt(takt)} unit={takt ? 'วินาที' : 'ยังไม่กำหนด'} />
                <Kpi
                  label="ผ่าน Takt หรือไม่"
                  value={line.meetsTakt === null ? '—' : line.meetsTakt ? 'ผ่าน' : 'ไม่ผ่าน'}
                  unit={line.taktGapSec === null ? '' : line.taktGapSec > 0 ? `เกิน ${fmt(line.taktGapSec)} s` : `เหลือ ${fmt(-line.taktGapSec)} s`}
                  tone={line.meetsTakt === null ? undefined : line.meetsTakt ? 'good' : 'bad'}
                />
                <Kpi label="กำลังผลิตต่อกะ" value={fmt(line.capacityPerShift, 0)} unit={w.taktMode === 'shift' ? `ชิ้น (เป้า ${w.demand || '—'})` : 'กำหนดเวลาต่อกะเพื่อดูค่านี้'} />
                <Kpi label="Line Balance Efficiency" value={fmt(line.efficiency, 1)} unit="%" />
                <Kpi label="Balance Delay" value={fmt(line.balanceDelay, 1)} unit="%" />
                <Kpi label="Smoothness Index" value={fmt(line.smoothnessIndex)} unit="ยิ่งน้อยยิ่งสมดุล" />
                <Kpi label="สถานีที่ใช้ / ขั้นต่ำเชิงทฤษฎี" value={`${line.activeStations} / ${line.minStations ?? '—'}`} unit={line.minStations ? 'ceil(ΣT ÷ Takt)' : 'ต้องมี Takt'} />
              </section>
              <p className="lb-hint lb-note">
                &quot;Line Balance Efficiency&quot; = ΣT ÷ (n × CT) วัดความสมดุลของสาย ไม่ใช่ &quot;ประสิทธิภาพเฉลี่ย (Standard/จริง)&quot; ในหน้าภาพรวม ซึ่งวัดความเร็วของคนเทียบเวลามาตรฐาน
              </p>

              <section className="card">
                <h2>รายละเอียดสถานี</h2>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>สถานี</th>
                        <th>Process</th>
                        <th className="num">เวลา (s)</th>
                        <th className="num">Idle (s)</th>
                        <th className="num">% ใช้งานเทียบ Takt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {line.stations.map((st) => (
                        <tr key={st.id} className={st.isBottleneck ? 'lb-row-bottleneck' : undefined}>
                          <td>สถานี {st.index}{st.isBottleneck ? ' (คอขวด)' : ''}</td>
                          <td>{st.processKeys.map((k) => processes.get(k)?.name).join(', ') || <span className="lb-muted">ว่าง</span>}</td>
                          <td className="num">{st.isEmpty ? '—' : fmt(st.timeSec)}</td>
                          <td className="num">{fmt(st.idleSec)}</td>
                          <td className="num">{st.utilizationVsTakt === null ? '—' : `${fmt(st.utilizationVsTakt, 1)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ---------- เจาะดูคอขวด ---------- */}
          {focus && detail && (
            <section className="card">
              <div className="lb-section-head">
                <h2>ภายในของ Process — {focus.name}</h2>
                <span className="lb-hint">
                  {focusKey === bottleneckProcessKey ? 'Process ที่ใช้เวลามากที่สุดในสถานีคอขวด' : 'Process ที่คุณเลือก'} · กดการ์ด Process เพื่อดูตัวอื่น
                </span>
              </div>
              {(detail.duplicateStepRounds > 0 || detail.unmatchedDefects > 0) && (
                <ul className="lb-warnings">
                  {detail.duplicateStepRounds > 0 && <li>มี {detail.duplicateStepRounds} รอบที่ชื่อ Step ซ้ำกัน รวมเวลาเป็นค่าเดียวของรอบแล้ว</li>}
                  {detail.unmatchedDefects > 0 && <li>Defect {detail.unmatchedDefects} รายการชื่อ Step ไม่ตรงกับ Step ใดเลย จึงไม่ถูกนับในตาราง</li>}
                </ul>
              )}
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th className="num">เฉลี่ย (s)</th>
                      <th className="num">SD</th>
                      <th className="num">CV</th>
                      <th className="num">ต่ำสุด–สูงสุด</th>
                      <th className="num">% ของ Process</th>
                      <th className="num">Defect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.steps.map((st) => (
                      <tr key={st.name}>
                        <td>{st.name}</td>
                        <td className="num">{fmt(st.meanSec)}</td>
                        <td className="num">{fmt(st.sdSec)}</td>
                        <td className="num">{st.cv === null ? '—' : `${fmt(st.cv, 1)}%`}</td>
                        <td className="num">{fmt(st.minSec)}–{fmt(st.maxSec)}</td>
                        <td className="num">{fmt(st.sharePercent, 1)}%</td>
                        <td className="num">{st.defects || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="lb-charts">
                <div>
                  <h3>เวลาเฉลี่ยต่อ Step (วินาที)</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={detail.steps.map((st) => ({ name: st.name, sec: Number(st.meanSec.toFixed(2)) }))}>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: CHART.tick }} tickLine={false} axisLine={{ stroke: CHART.axis }} />
                      <YAxis tick={{ fontSize: 12, fill: CHART.tick }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => [`${v} s`, 'เฉลี่ย']} />
                      <Bar dataKey="sec" fill={CHART.bar} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h3>เวลารวมของ Process รายรอบ (วินาที)</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={detail.roundSeries.map((r, i) => ({ round: i + 1, sec: Number(r.totalSec.toFixed(2)) }))}>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="round" tick={{ fontSize: 12, fill: CHART.tick }} tickLine={false} axisLine={{ stroke: CHART.axis }} />
                      <YAxis tick={{ fontSize: 12, fill: CHART.tick }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => [`${v} s`, 'เวลารวม']} labelFormatter={(l) => `รอบที่ ${l}`} />
                      <Line dataKey="sec" stroke={CHART.line} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <h3>What-if: ลองเปลี่ยนเวลาของ Process นี้ (ไม่บันทึกลงฐานข้อมูล)</h3>
              <div className="lb-whatif">
                <label>
                  เวลาใหม่ของ {focus.name} (วินาที)
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={whatIf[focus.key] ?? ''}
                    placeholder={fmt(focus.meanSec)}
                    onChange={(e) =>
                      setWhatIf((prev) => {
                        const next = { ...prev };
                        if (e.target.value === '') delete next[focus.key];
                        else next[focus.key] = Number(e.target.value);
                        return next;
                      })
                    }
                  />
                </label>
                {whatIfActive && <button className="btn" onClick={() => setWhatIf({})}>ล้าง What-if</button>}
              </div>
              {whatIfLine && <CompareTable rows={compareLines(line, whatIfLine)} beforeLabel="ตอนนี้" afterLabel="What-if" />}
            </section>
          )}

          {/* ---------- ข้อเสนอการปรับปรุง ---------- */}
          {line.activeStations > 0 && (
            <section className="card">
              <h2>ข้อเสนอการปรับปรุงเบื้องต้น (ECRS)</h2>
              <p className="lb-hint">
                สร้างจากกฎหยาบ (rule of thumb) ด้านล่าง ไม่ใช่มาตรฐาน และไม่ได้บอกสาเหตุที่แน่ชัด ปรับเกณฑ์ได้ตามหน้างาน
              </p>
              <div className="lb-rules">
                <RuleInput label="Step กินเวลาเกิน (% ของ Process)" value={w.rules.stepSharePercent} onChange={(v) => update((p) => ({ rules: { ...p.rules, stepSharePercent: v } }))} />
                <RuleInput label="CV ของ Step เกิน (%)" value={w.rules.stepCvPercent} onChange={(v) => update((p) => ({ rules: { ...p.rules, stepCvPercent: v } }))} />
                <RuleInput label="รอบที่ดีที่สุดเร็วกว่าเฉลี่ยเกิน (%)" value={w.rules.bestGapPercent} onChange={(v) => update((p) => ({ rules: { ...p.rules, bestGapPercent: v } }))} />
                <RuleInput label="Defect กระจุกที่ Step เดียวเกิน (%)" value={w.rules.defectSharePercent} onChange={(v) => update((p) => ({ rules: { ...p.rules, defectSharePercent: v } }))} />
              </div>
              {suggestions.length === 0 ? (
                <p className="lb-empty">ยังไม่มีข้อใดเข้าเกณฑ์ (ลองกำหนด Takt หรือปรับเกณฑ์)</p>
              ) : (
                <ol className="lb-suggestions">
                  {suggestions.map((sg) => (
                    <li key={sg.id}>
                      <strong>{sg.title}</strong>
                      <p><span className="lb-label">เหตุผล:</span> {sg.reason}</p>
                      <p><span className="lb-label">วิธีตรวจสอบหน้างาน:</span> {sg.howToVerify}</p>
                      <p className="lb-disclaimer">{sg.disclaimer}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {/* ---------- Kanban ---------- */}
          {line.activeStations > 0 && <KanbanCard w={w} update={update} bottleneckIndex={bottleneckStation?.index ?? null} lineHasIdle={line.stations.filter((st) => (st.idleSec ?? 0) > 0)} />}

          {/* ---------- บันทึก / เปรียบเทียบ / Export ---------- */}
          <section className="card">
            <h2>บันทึกและส่งออกผังสายผลิต</h2>
            <p className="lb-hint">บันทึกไว้ในเบราว์เซอร์นี้เท่านั้น (คนอื่นหรือเครื่องอื่นไม่เห็น)</p>
            <div className="lb-whatif">
              <label>
                ชื่อผัง
                <input value={layoutName} placeholder="เช่น ก่อนปรับปรุง" onChange={(e) => setLayoutName(e.target.value)} />
              </label>
              <button className="btn btn-primary" onClick={saveLayout} disabled={line.activeStations === 0}>บันทึกผัง</button>
              <button className="btn" onClick={exportExcel} disabled={line.activeStations === 0}>Export Excel</button>
            </div>
            {notice && <p className="auth-message auth-success" role="status">{notice}</p>}
            {layouts.length > 0 && (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ผัง</th>
                        <th>บันทึกเมื่อ</th>
                        <th className="num">CT (s)</th>
                        <th className="num">Efficiency</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {layouts.map((l) => {
                        const r = lineOfLayout(l);
                        return (
                          <tr key={l.id}>
                            <td>{l.name}</td>
                            <td>{new Date(l.savedAt).toLocaleString('th-TH')}</td>
                            <td className="num">{fmt(r.cycleTimeSec)}</td>
                            <td className="num">{fmt(r.efficiency, 1)}%</td>
                            <td className="lb-row-actions">
                              <button className="link-button" onClick={() => loadLayout(l)}>โหลด</button>
                              <button className="link-button link-danger" onClick={() => deleteLayout(l)}>ลบ</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {layouts.length >= 2 && (
                  <>
                    <h3>เปรียบเทียบสองผัง</h3>
                    <div className="lb-whatif">
                      {[0, 1].map((i) => (
                        <label key={i}>
                          {i === 0 ? 'ผังก่อน' : 'ผังหลัง'}
                          <select
                            value={compareIds[i]}
                            onChange={(e) => setCompareIds((prev) => (i === 0 ? [e.target.value, prev[1]] : [prev[0], e.target.value]))}
                          >
                            <option value="">เลือกผัง</option>
                            {layouts.map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    {comparison && <CompareTable rows={comparison} beforeLabel={compareA!.name} afterLabel={compareB!.name} />}
                  </>
                )}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function DropZone({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className}${isOver ? ' is-over' : ''}`}>
      {children}
    </div>
  );
}

function ProcessCard({
  p,
  stations,
  onMove,
  onSelect,
  selected,
  compact,
}: {
  p: ProcessSummary;
  stations: StationInput[];
  onMove: (key: string, target: string) => void;
  onSelect: (key: string) => void;
  selected: boolean;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: p.key });
  const current = stations.find((s) => s.processKeys.includes(p.key))?.id ?? LIBRARY_ID;
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={`lb-card${isDragging ? ' is-dragging' : ''}${selected ? ' is-selected' : ''}${compact ? ' is-compact' : ''}`}>
      <button className="lb-card-handle" {...listeners} {...attributes} aria-label={`ลาก ${p.name}`}>
        ⠿
      </button>
      <button className="lb-card-body" onClick={() => onSelect(p.key)} title="ดูภายในของ Process นี้">
        <span className="lb-card-name">{p.name}</span>
        <span className="lb-card-meta">
          {p.meanSec.toFixed(2)} s · {p.n}/{p.requiredRounds || '—'} รอบ
          {!p.enoughData && <span className="badge badge-warn">ข้อมูลยังไม่พอ</span>}
        </span>
      </button>
      <select className="lb-card-move" value={current} onChange={(e) => onMove(p.key, e.target.value)} aria-label={`ย้าย ${p.name} ไปสถานี`}>
        <option value={LIBRARY_ID}>คลัง</option>
        {stations.map((s, i) => (
          <option key={s.id} value={s.id}>ย้ายไปสถานี {i + 1}</option>
        ))}
      </select>
    </div>
  );
}

function Kpi({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`kpi-card${tone ? ` lb-kpi-${tone}` : ''}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        {value} <small>{unit}</small>
      </span>
    </div>
  );
}

function DataWarnings({ items }: { items: (string | false)[] }) {
  const list = items.filter((x): x is string => !!x);
  if (list.length === 0) return null;
  return (
    <section className="card lb-warning-card" aria-label="คำเตือนข้อมูล">
      <h2>คำเตือนข้อมูล</h2>
      <ul className="lb-warnings">
        {list.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

function RuleInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label>
      {label}
      <input type="number" min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function CompareTable({ rows, beforeLabel, afterLabel }: { rows: ReturnType<typeof compareLines>; beforeLabel: string; afterLabel: string }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>ตัวชี้วัด</th>
            <th className="num">{beforeLabel}</th>
            <th className="num">{afterLabel}</th>
            <th className="num">ส่วนต่าง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{fmt(r.before)}</td>
              <td className="num">{fmt(r.after)}</td>
              <td className="num">
                {r.diff > 0 ? '+' : ''}
                {fmt(r.diff)}
                {r.diffPercent !== null && ` (${r.diffPercent > 0 ? '+' : ''}${fmt(r.diffPercent, 1)}%)`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KanbanCard({
  w,
  update,
  bottleneckIndex,
  lineHasIdle,
}: {
  w: Working;
  update: (patch: (prev: Working) => Partial<Working>) => void;
  bottleneckIndex: number | null;
  lineHasIdle: { index: number }[];
}) {
  const k = w.kanban;
  const result = kanbanCards(k.d, k.l, k.c, k.sf);
  const set = (key: keyof Working['kanban'], v: number) => update((p) => ({ kanban: { ...p.kanban, [key]: v } }));
  const upstream = lineHasIdle.filter((s) => bottleneckIndex !== null && s.index < bottleneckIndex).map((s) => `สถานี ${s.index}`);
  return (
    <section className="card">
      <h2>ข้อเสนอ Kanban เบื้องต้น</h2>
      <div className="lb-rules">
        <RuleInput label="ความต้องการต่อชั่วโมง D (ชิ้น)" value={k.d} onChange={(v) => set('d', v)} />
        <label>
          เวลาเติมของเข้าสถานี L (ชั่วโมง)
          <input type="number" min={0} step="0.1" value={k.l} onChange={(e) => set('l', Number(e.target.value))} />
        </label>
        <RuleInput label="จำนวนชิ้นต่อภาชนะ C" value={k.c} onChange={(v) => set('c', v)} />
        <label>
          ตัวคูณความปลอดภัย SF (เช่น 0.1 = 10%)
          <input type="number" min={0} step="0.05" value={k.sf} onChange={(e) => set('sf', Number(e.target.value))} />
        </label>
      </div>
      {result ? (
        <p className="lb-kanban-result">
          N = ceil( {k.d} × {k.l} × (1 + {k.sf}) ÷ {k.c} ) = ceil({result.raw}) = <strong>{result.cards} ใบ</strong>
        </p>
      ) : (
        <p className="auth-message auth-error">กรอกค่าให้ครบและมากกว่า 0 (SF เป็น 0 ได้)</p>
      )}
      {result && (
        <ol className="lb-suggestions">
          <li>
            วางบัฟเฟอร์หน้า{bottleneckIndex ? `สถานี ${bottleneckIndex} (คอขวด)` : 'สถานีคอขวด'} เพื่อไม่ให้คอขวดว่างงาน เพราะเวลาที่เสียไปที่คอขวดคือกำลังผลิตที่เสียไปของทั้งสาย
          </li>
          <li>ตั้งเพดาน WIP ระหว่างสถานีไม่เกิน {result.cards} ภาชนะ ({result.cards * k.c} ชิ้น) เท่ากับจำนวนใบ Kanban</li>
          <li>
            {upstream.length > 0 ? `${upstream.join(', ')} ซึ่งมีเวลาว่าง` : 'สถานีต้นน้ำที่มีเวลาว่าง'} ให้หยุดผลิตเมื่อบัฟเฟอร์เต็ม (ดึงงานแทนการผลักงาน)
          </li>
          <li>ใช้บอร์ด Kanban แบบง่าย 3 ช่อง: รอ / กำลังทำ / เสร็จ และทบทวนทุกสัปดาห์ แล้วค่อยๆ ลดจำนวนใบเมื่อการไหลนิ่งขึ้น</li>
        </ol>
      )}
      <div className="lb-limitations">
        <strong>ข้อจำกัด</strong>
        <ul>
          <li>Kanban ช่วยจำกัด WIP และทำให้มองเห็นคอขวด แต่ไม่ได้ทำให้คอขวดเร็วขึ้นเอง</li>
          <li>เหมาะกับงานซ้ำๆ และความต้องการค่อนข้างนิ่ง</li>
          <li>ต้องมีภาชนะและพื้นที่วางจริงหน้างาน</li>
          <li>ตัวเลขนี้มาจากเวลาที่จับศึกษา ไม่ใช่ข้อมูลการไหลของงานที่วัดจากสายจริง</li>
        </ul>
        <p className="lb-disclaimer">{SUGGESTION_DISCLAIMER}</p>
      </div>
    </section>
  );
}
