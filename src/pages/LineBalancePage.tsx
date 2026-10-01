import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { UNGROUPED_ID, mean } from '../lib/ie';
import { LINE_BALANCE_STORAGE_KEY } from '../lib/settings';
import type { ProcessGroup, Study, StudyMetric } from '../types';

type Props = {
  studies: Study[];
  metrics: StudyMetric[];
  groups: ProcessGroup[];
  isLoading: boolean;
  defaultShiftMinutes: number;
};

type Segment = {
  key: string;
  label: string;
  cycles: number;
  observedPerUnit: number;
  standardPerUnit: number;
};

type Station = { id: string; segmentKey: string; workers: number };
type TimeBasis = 'standard' | 'observed';

const STORAGE_KEY = LINE_BALANCE_STORAGE_KEY;
const CHART = { bar: '#A07C5B', bottleneck: '#A9573F', grid: '#EEE7DC', axis: '#E4DCCF', tick: '#7A6F63' };

type Saved = { stations: Station[]; timeBasis: TimeBasis; availableMin: number; demand: number };

function loadSaved(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Saved>) : {};
  } catch {
    return {};
  }
}

const fmt = (n: number, digits = 2) => n.toFixed(digits);

export default function LineBalancePage({ studies, metrics, groups, isLoading, defaultShiftMinutes }: Props) {
  const [saved] = useState(loadSaved);
  const [stations, setStations] = useState<Station[]>(saved.stations ?? []);
  const [timeBasis, setTimeBasis] = useState<TimeBasis>(saved.timeBasis ?? 'standard');
  const [availableMin, setAvailableMin] = useState(saved.availableMin ?? defaultShiftMinutes);
  const [demand, setDemand] = useState(saved.demand ?? 0);
  const [pendingKey, setPendingKey] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ stations, timeBasis, availableMin, demand }));
    } catch {
      // เบราว์เซอร์ไม่อนุญาตให้บันทึก — ใช้งานต่อได้ตามปกติ แค่ไม่จำค่า
    }
  }, [stations, timeBasis, availableMin, demand]);

  // ---------- รวมข้อมูลเป็น "Process ย่อย" (Process ใหญ่ + process_name) ----------
  const groupName = (id: string | null) =>
    groups.find((g) => g.id === (id ?? UNGROUPED_ID))?.name ?? 'ไม่ระบุ Process ใหญ่';
  const metricById = new Map(metrics.map((m) => [m.studyId, m]));
  const segmentData: Record<string, { label: string; observed: number[]; standard: number[] }> = {};
  studies.forEach((s) => {
    const m = metricById.get(s.id);
    if (!m || m.totalTimeSec <= 0) return;
    const key = `${s.process_group_id ?? UNGROUPED_ID}::${s.process_name}`;
    const entry = (segmentData[key] ||= { label: `${groupName(s.process_group_id)} ▸ ${s.process_name}`, observed: [], standard: [] });
    entry.observed.push(m.totalTimeSec / m.quantity);
    entry.standard.push(m.standardTimeSec / m.quantity);
  });
  const segments: Segment[] = Object.entries(segmentData)
    .map(([key, d]) => ({
      key,
      label: d.label,
      cycles: d.observed.length,
      observedPerUnit: mean(d.observed),
      standardPerUnit: mean(d.standard),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'th'));
  const segmentByKey = new Map(segments.map((s) => [s.key, s]));

  // ---------- คำนวณ Line Balancing ----------
  const rows = stations
    .filter((st) => segmentByKey.has(st.segmentKey))
    .map((st, i) => {
      const seg = segmentByKey.get(st.segmentKey)!;
      const workTime = timeBasis === 'standard' ? seg.standardPerUnit : seg.observedPerUnit;
      const workers = Math.max(1, st.workers);
      return { ...st, index: i + 1, seg, workTime, workers, stationTime: workTime / workers };
    });

  const cycleTime = rows.length > 0 ? Math.max(...rows.map((r) => r.stationTime)) : 0;
  const workContent = rows.reduce((sum, r) => sum + r.workTime, 0);
  const totalWorkers = rows.reduce((sum, r) => sum + r.workers, 0);
  const efficiency = cycleTime > 0 ? (workContent / (totalWorkers * cycleTime)) * 100 : 0;
  const balanceDelay = rows.length > 0 ? 100 - efficiency : 0;
  const smoothness = Math.sqrt(rows.reduce((sum, r) => sum + (cycleTime - r.stationTime) ** 2, 0));
  const availableSec = availableMin * 60;
  const outputPerHour = cycleTime > 0 ? 3600 / cycleTime : 0;
  const outputPerShift = cycleTime > 0 ? availableSec / cycleTime : 0;
  const taktTime = demand > 0 ? availableSec / demand : 0;
  const minStations = taktTime > 0 ? Math.ceil(workContent / taktTime) : 0;
  const bottleneck = rows.find((r) => r.stationTime === cycleTime);

  const insights: string[] = [];
  if (bottleneck) {
    insights.push(
      `คอขวดอยู่ที่สถานี ${bottleneck.index} (${bottleneck.seg.label}) ใช้ ${fmt(bottleneck.stationTime)} วินาทีต่อชิ้น — เป็นตัวกำหนดกำลังการผลิตของทั้งไลน์`
    );
  }
  if (taktTime > 0 && cycleTime > 0) {
    if (cycleTime > taktTime) {
      const over = rows.filter((r) => r.stationTime > taktTime).map((r) => `สถานี ${r.index}`);
      insights.push(
        `Cycle Time (${fmt(cycleTime)} s) เกิน Takt Time (${fmt(taktTime)} s) — ผลิตได้ ${fmt(outputPerShift, 0)} จากเป้า ${demand} ชิ้น ต้องลดเวลาที่ ${over.join(', ')} เช่น เพิ่มคน แบ่งงาน หรือใช้หลัก ECRS`
      );
    } else {
      insights.push(`Cycle Time ไม่เกิน Takt Time — ไลน์นี้ผลิตได้ตามเป้า ${demand} ชิ้นต่อกะ`);
    }
    if (minStations > 0 && minStations < totalWorkers) {
      insights.push(`ตามทฤษฎีใช้คนเพียง ${minStations} คนก็ทันเป้า (ตอนนี้ใช้ ${totalWorkers} คน) — ลองรวมงานของสถานีที่มีเวลาว่างมาก`);
    }
  }
  const idleMost = [...rows].sort((a, b) => a.stationTime - b.stationTime)[0];
  if (idleMost && rows.length > 1 && cycleTime > 0 && idleMost.stationTime / cycleTime < 0.6) {
    insights.push(
      `สถานี ${idleMost.index} ว่างเกือบ ${fmt((1 - idleMost.stationTime / cycleTime) * 100, 0)}% ของรอบ — ย้ายงานบางส่วนจากคอขวดมาทำได้`
    );
  }

  // ---------- จัดการสถานี ----------
  const addStation = () => {
    const key = pendingKey || segments[0]?.key;
    if (!key) return;
    setStations((prev) => [...prev, { id: crypto.randomUUID(), segmentKey: key, workers: 1 }]);
  };
  const updateStation = (id: string, patch: Partial<Station>) =>
    setStations((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeStation = (id: string) => setStations((prev) => prev.filter((s) => s.id !== id));
  const moveStation = (id: string, dir: -1 | 1) =>
    setStations((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  if (isLoading) return <p className="empty-state">กำลังโหลดข้อมูล...</p>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>การคำนวณ — Line Balancing</h1>
          <p className="page-subtitle">เลือก Process ย่อยมาเรียงต่อกันเป็นสถานีงาน แล้ววิเคราะห์ความสมดุลของไลน์</p>
        </div>
      </div>

      {segments.length === 0 ? (
        <p className="empty-state">ยังไม่มีข้อมูล Process ย่อยที่จับเวลาไว้</p>
      ) : (
        <>
          <section className="card">
            <h2>1. ตั้งค่าไลน์</h2>
            <div className="calc-inputs">
              <label>
                ใช้เวลาแบบ
                <select value={timeBasis} onChange={(e) => setTimeBasis(e.target.value as TimeBasis)}>
                  <option value="standard">Standard Time (แนะนำ)</option>
                  <option value="observed">เวลาที่จับได้จริง</option>
                </select>
              </label>
              <label>
                เวลาทำงานต่อกะ (นาที)
                <input type="number" min={1} value={availableMin} onChange={(e) => setAvailableMin(Number(e.target.value))} />
              </label>
              <label>
                เป้าผลิตต่อกะ (ชิ้น) — ไม่บังคับ
                <input type="number" min={0} value={demand || ''} placeholder="เช่น 400" onChange={(e) => setDemand(Number(e.target.value))} />
              </label>
            </div>
          </section>

          <section className="card">
            <h2>2. เรียงสถานีงาน</h2>
            {rows.length === 0 && (
              <p className="card-intro">เลือก Process ย่อยแล้วกด "เพิ่มสถานี" ตามลำดับการไหลของงานในไลน์</p>
            )}
            <ol className="station-list">
              {rows.map((r, i) => (
                <li key={r.id} className={`station-row ${r === bottleneck ? 'is-bottleneck' : ''}`}>
                  <span className="station-index">{r.index}</span>
                  <select
                    className="station-select"
                    value={r.segmentKey}
                    onChange={(e) => updateStation(r.id, { segmentKey: e.target.value })}
                    aria-label={`Process ย่อยของสถานี ${r.index}`}
                  >
                    {segments.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <label className="station-workers">
                    คน
                    <input
                      type="number"
                      min={1}
                      value={r.workers}
                      onChange={(e) => updateStation(r.id, { workers: Math.max(1, Number(e.target.value)) })}
                    />
                  </label>
                  <span className="station-time">
                    {fmt(r.stationTime)} s
                    {r === bottleneck && <span className="lb-tag">คอขวด</span>}
                  </span>
                  <span className="station-actions">
                    <button className="icon-btn" onClick={() => moveStation(r.id, -1)} disabled={i === 0} aria-label="เลื่อนขึ้น">↑</button>
                    <button className="icon-btn" onClick={() => moveStation(r.id, 1)} disabled={i === rows.length - 1} aria-label="เลื่อนลง">↓</button>
                    <button className="icon-btn" onClick={() => removeStation(r.id)} aria-label="ลบสถานี">✕</button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="station-add">
              <select
                className="group-filter"
                value={pendingKey || segments[0].key}
                onChange={(e) => setPendingKey(e.target.value)}
                aria-label="เลือก Process ย่อยที่จะเพิ่ม"
              >
                {segments.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label} · {fmt(timeBasis === 'standard' ? s.standardPerUnit : s.observedPerUnit)} s/ชิ้น · {s.cycles} รอบ
                  </option>
                ))}
              </select>
              <button className="btn" onClick={addStation}>+ เพิ่มสถานี</button>
              {rows.length > 0 && (
                <button className="btn" onClick={() => setStations([])}>ล้างทั้งหมด</button>
              )}
            </div>
          </section>

          {rows.length > 0 && (
            <>
              <h2 className="section-title">3. ผลการวิเคราะห์</h2>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <span className="kpi-label">Cycle Time (คอขวด)</span>
                  <span className="kpi-value">{fmt(cycleTime)} <small>วินาที/ชิ้น</small></span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">ประสิทธิภาพไลน์</span>
                  <span className="kpi-value">{fmt(efficiency, 1)} <small>%</small></span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Balance Delay</span>
                  <span className="kpi-value">{fmt(balanceDelay, 1)} <small>%</small></span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">กำลังการผลิต</span>
                  <span className="kpi-value">{fmt(outputPerHour, 1)} <small>ชิ้น/ชม.</small></span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">ผลิตได้ต่อกะ</span>
                  <span className="kpi-value">{fmt(outputPerShift, 0)} <small>ชิ้น</small></span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Smoothness Index</span>
                  <span className="kpi-value">{fmt(smoothness)}</span>
                </div>
                {taktTime > 0 && (
                  <>
                    <div className="kpi-card">
                      <span className="kpi-label">Takt Time</span>
                      <span className="kpi-value">{fmt(taktTime)} <small>วินาที/ชิ้น</small></span>
                    </div>
                    <div className="kpi-card">
                      <span className="kpi-label">จำนวนคนขั้นต่ำ (ทฤษฎี)</span>
                      <span className="kpi-value">{minStations} <small>คน</small></span>
                    </div>
                  </>
                )}
              </div>

              {insights.length > 0 && (
                <section className="card insight-card">
                  <h2>ข้อสังเกต</h2>
                  <ul className="plain-list">
                    {insights.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="card">
                <h2>เวลาของแต่ละสถานี</h2>
                <p className="card-intro">
                  วินาทีต่อชิ้น (หารจำนวนคนแล้ว){taktTime > 0 ? ' — เส้นประคือ Takt Time' : ''}
                </p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={rows.map((r) => ({ name: `สถานี ${r.index}`, label: r.seg.label, time: Number(r.stationTime.toFixed(2)) }))}
                    margin={{ top: 16, right: 16, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: CHART.tick }} tickLine={false} axisLine={{ stroke: CHART.axis }} />
                    <YAxis tick={{ fontSize: 12, fill: CHART.tick }} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(160, 124, 91, 0.08)' }}
                      contentStyle={{ borderRadius: 8, border: `1px solid ${CHART.axis}`, fontFamily: 'inherit' }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
                      formatter={(value) => [`${value} วินาที/ชิ้น`, 'เวลาสถานี']}
                    />
                    {taktTime > 0 && (
                      <ReferenceLine
                        y={Number(taktTime.toFixed(2))}
                        ifOverflow="extendDomain"
                        stroke={CHART.tick}
                        strokeDasharray="5 4"
                        label={{ value: `Takt ${fmt(taktTime)} s`, position: 'insideTopRight', fill: CHART.tick, fontSize: 12 }}
                      />
                    )}
                    <Bar dataKey="time" radius={[4, 4, 0, 0]} maxBarSize={56}>
                      {rows.map((r) => (
                        <Cell key={r.id} fill={r === bottleneck ? CHART.bottleneck : CHART.bar} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>สถานี</th>
                        <th>Process ย่อย</th>
                        <th className="num">เวลางาน (s/ชิ้น)</th>
                        <th className="num">คน</th>
                        <th className="num">เวลาสถานี (s)</th>
                        <th className="num">เวลาว่าง (s)</th>
                        <th className="num">Utilization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.index}</td>
                          <td>{r.seg.label}</td>
                          <td className="num">{fmt(r.workTime)}</td>
                          <td className="num">{r.workers}</td>
                          <td className="num">{fmt(r.stationTime)}</td>
                          <td className="num">{fmt(cycleTime - r.stationTime)}</td>
                          <td className="num">{fmt((r.stationTime / cycleTime) * 100, 1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card">
                <h2>สูตรที่ใช้</h2>
                <dl className="var-list formula-defs">
                  <div><dt>Cycle Time</dt><dd>เวลาสถานีที่มากที่สุด = max(เวลางาน ÷ จำนวนคน)</dd></div>
                  <div><dt>ประสิทธิภาพ</dt><dd>Σ เวลางาน ÷ (จำนวนคนรวม × Cycle Time) × 100</dd></div>
                  <div><dt>Balance Delay</dt><dd>100 − ประสิทธิภาพไลน์</dd></div>
                  <div><dt>Takt Time</dt><dd>เวลาทำงานต่อกะ ÷ เป้าผลิตต่อกะ</dd></div>
                  <div><dt>คนขั้นต่ำ</dt><dd>⌈ Σ เวลางาน ÷ Takt Time ⌉</dd></div>
                  <div><dt>Smoothness</dt><dd>√Σ(Cycle Time − เวลาสถานี)² — ยิ่งใกล้ 0 ยิ่งสมดุล</dd></div>
                </dl>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
