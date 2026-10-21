import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '../lib/supabase';
import { matchesGroup, mean, sampleStdDev } from '../lib/ie';
import type { DefectLog, ProcessGroup, Step, Study, StudyMetric } from '../types';

type Props = {
  studies: Study[];
  steps: Step[];
  metrics: StudyMetric[];
  groups: ProcessGroup[];
  isLoading: boolean;
  cvStable: number;
  cvWatch: number;
  organizationId: string;
};

type Stability = { label: string; className: string };

const CHART = {
  bar: '#A07C5B',
  grid: '#EEE7DC',
  axis: '#E4DCCF',
  tick: '#7A6F63',
};

// เกณฑ์ CV ตั้งได้ในหน้าตั้งค่า (ค่าเริ่มต้น ≤10% เสถียร, 10–20% ควรติดตาม, >20% ไม่เสถียร)
function getStability(cv: number, stable: number, watch: number): Stability {
  if (cv <= stable) return { label: 'เสถียร', className: 'badge-good' };
  if (cv <= watch) return { label: 'ควรติดตาม', className: 'badge-warn' };
  return { label: 'ไม่เสถียร', className: 'badge-bad' };
}

const fmt = (n: number, digits = 2) => n.toFixed(digits);
export default function AnalysisPage({ studies, steps, metrics, groups, isLoading, cvStable, cvWatch, organizationId }: Props) {
  const [defects, setDefects] = useState<DefectLog[]>([]);
  const [pickedGroupId, setPickedGroupId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('defect_logs')
      .select('*')
      .match(organizationId ? { organization_id: organizationId } : {})
      .then(({ data, error }) => {
        if (error) console.error('Error fetching defect logs:', error);
        else if (!cancelled && data) setDefects(data);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // ---------- เปรียบเทียบทุก Process ใหญ่ ----------
  const groupRows = groups
    .map((group) => {
      const groupMetrics = metrics.filter((m) => matchesGroup(m.processGroupId, group.id));
      const times = groupMetrics.map((m) => m.totalTimeSec);
      const avgTime = mean(times);
      return {
        id: group.id,
        name: group.name,
        cycles: groupMetrics.length,
        avgTime,
        avgStandard: mean(groupMetrics.map((m) => m.standardTimeSec)),
        avgEfficiency: mean(groupMetrics.map((m) => m.efficiency)),
        cv: avgTime > 0 ? (sampleStdDev(times) / avgTime) * 100 : 0,
      };
    })
    .filter((row) => row.cycles > 0);

  const selectedGroupId = pickedGroupId ?? groupRows[0]?.id ?? null;
  const selectedGroupName = groups.find((g) => g.id === selectedGroupId)?.name ?? '';

  // ---------- ข้อมูลของ Process ที่เลือก ----------
  const groupStudies = selectedGroupId
    ? studies.filter((s) => matchesGroup(s.process_group_id, selectedGroupId))
    : [];
  const groupStudyIds = new Set(groupStudies.map((s) => s.id));
  const groupSteps = steps.filter((s) => groupStudyIds.has(s.study_id));
  const cycleCount = groupStudies.length;

  // Pareto: เวลารวมของแต่ละ Step เรียงจากมากไปน้อย
  const stepTimes: Record<string, number[]> = {};
  groupSteps.forEach((s) => {
    // Step ที่ไม่ได้จับเวลาในรอบนั้น (time_ms = 0) ไม่นับเป็นข้อมูล
    if (s.time_ms > 0) (stepTimes[s.name] ||= []).push(s.time_ms / 1000);
  });
  const grandTotal = groupSteps.reduce((sum, s) => sum + s.time_ms / 1000, 0);
  const sortedStepRows = Object.entries(stepTimes)
    .map(([name, values]) => {
      const avg = mean(values);
      const cv = avg > 0 ? (sampleStdDev(values) / avg) * 100 : 0;
      return {
        name,
        count: values.length,
        total: values.reduce((a, b) => a + b, 0),
        avg,
        sd: sampleStdDev(values),
        cv,
      };
    })
    .sort((a, b) => b.total - a.total);
  const shareOf = (total: number) => (grandTotal > 0 ? (total / grandTotal) * 100 : 0);
  const paretoRows = sortedStepRows.map((row, i) => {
    const share = shareOf(row.total);
    const before = sortedStepRows.slice(0, i).reduce((sum, r) => sum + shareOf(r.total), 0);
    // "กลุ่มหลัก" = ขั้นตอนที่เริ่มก่อนสัดส่วนสะสมถึง 80%
    return { ...row, share, cumulative: before + share, isVitalFew: before < 80 };
  });

  // เปรียบเทียบผู้ปฏิบัติงาน
  const metricById = new Map(metrics.map((m) => [m.studyId, m]));
  const operatorStats: Record<string, StudyMetric[]> = {};
  groupStudies.forEach((s) => {
    const metric = metricById.get(s.id);
    if (metric) (operatorStats[s.operator_name || 'ไม่ระบุชื่อ'] ||= []).push(metric);
  });
  const operatorRows = Object.entries(operatorStats)
    .map(([name, list]) => ({
      name,
      cycles: list.length,
      avgTime: mean(list.map((m) => m.totalTimeSec)),
      avgEfficiency: mean(list.map((m) => m.efficiency)),
    }))
    .sort((a, b) => a.avgTime - b.avgTime);

  // Defect ต่อ Step
  const groupDefects = defects.filter((d) => groupStudyIds.has(d.study_id));
  const defectCounts: Record<string, number> = {};
  groupDefects.forEach((d) => {
    defectCounts[d.step_name] = (defectCounts[d.step_name] || 0) + 1;
  });
  const defectRows = Object.entries(defectCounts)
    .map(([name, count]) => ({ name, count, perCycle: cycleCount > 0 ? count / cycleCount : 0 }))
    .sort((a, b) => b.count - a.count);
  const maxDefect = defectRows[0]?.count ?? 0;

  // ข้อสังเกตอัตโนมัติ
  const insights: string[] = [];
  const top = paretoRows[0];
  if (top) {
    insights.push(
      `"${top.name}" ใช้เวลามากที่สุด ${fmt(top.share, 1)}% ของเวลาทั้งหมด — เริ่มปรับปรุงจากขั้นตอนนี้ด้วยหลัก ECRS`
    );
  }
  const vitalFew = paretoRows.filter((r) => r.isVitalFew);
  if (vitalFew.length > 1 && paretoRows.length > vitalFew.length) {
    insights.push(
      `${vitalFew.length} จาก ${paretoRows.length} ขั้นตอน ใช้เวลารวมราว 80% (หลัก Pareto) — ควรโฟกัสกลุ่มนี้ก่อน`
    );
  }
  const unstable = paretoRows.filter((r) => r.count > 1 && r.cv > cvWatch);
  if (unstable.length > 0) {
    insights.push(
      `ขั้นตอนที่เวลาแกว่งมาก (CV > ${cvWatch}%): ${unstable.map((r) => r.name).join(', ')} — ควรกำหนดวิธีทำงานมาตรฐาน หรือตรวจว่าแบ่ง Element ชัดเจนหรือไม่`
    );
  }
  if (defectRows[0]) {
    insights.push(`Defect เกิดที่ "${defectRows[0].name}" บ่อยที่สุด (${defectRows[0].count} ครั้ง)`);
  }
  if (operatorRows.length > 1) {
    const fastest = operatorRows[0];
    const slowest = operatorRows[operatorRows.length - 1];
    const gap = fastest.avgTime > 0 ? ((slowest.avgTime - fastest.avgTime) / fastest.avgTime) * 100 : 0;
    if (gap > 10) {
      insights.push(
        `${slowest.name} ใช้เวลาเฉลี่ยมากกว่า ${fastest.name} ${fmt(gap, 0)}% — อาจถ่ายทอดวิธีทำงานระหว่างกัน`
      );
    }
  }

  if (isLoading) {
    return <p className="empty-state">กำลังโหลดข้อมูล...</p>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>การวิเคราะห์</h1>
          <p className="page-subtitle">เปรียบเทียบ Process และหาจุดที่ควรปรับปรุง</p>
        </div>
      </div>

      {groupRows.length === 0 ? (
        <p className="empty-state">ยังไม่มีข้อมูลให้วิเคราะห์</p>
      ) : (
        <>
          <section className="card">
            <h2>เปรียบเทียบ Process ใหญ่</h2>
            <p className="card-intro">เวลาเฉลี่ยต่อรอบ (วินาที)</p>
            <ResponsiveContainer width="100%" height={Math.max(140, groupRows.length * 48)}>
              <BarChart data={groupRows} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: CHART.tick }} tickLine={false} axisLine={{ stroke: CHART.axis }} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 13, fill: CHART.tick }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(160, 124, 91, 0.08)' }}
                  contentStyle={{ borderRadius: 8, border: `1px solid ${CHART.axis}`, fontFamily: 'inherit' }}
                  formatter={(value) => [`${Number(value).toFixed(2)} วินาที`, 'เวลาเฉลี่ยต่อรอบ']}
                />
                <Bar dataKey="avgTime" fill={CHART.bar} radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Process ใหญ่</th>
                    <th className="num">รอบ</th>
                    <th className="num">เวลาเฉลี่ย (s)</th>
                    <th className="num">Standard Time (s)</th>
                    <th className="num">ประสิทธิภาพ</th>
                    <th className="num">CV ของเวลารอบ</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td className="num">{row.cycles}</td>
                      <td className="num">{fmt(row.avgTime)}</td>
                      <td className="num">{fmt(row.avgStandard)}</td>
                      <td className="num">{fmt(row.avgEfficiency, 1)}%</td>
                      <td className="num">{row.cycles > 1 ? `${fmt(row.cv, 1)}%` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="analysis-picker">
            <h2 className="section-title">วิเคราะห์เชิงลึก</h2>
            <select
              className="group-filter"
              value={selectedGroupId ?? ''}
              onChange={(e) => setPickedGroupId(e.target.value)}
              aria-label="เลือก Process ที่จะวิเคราะห์"
            >
              {groupRows.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </div>

          {insights.length > 0 && (
            <section className="card insight-card">
              <h2>ข้อสังเกต — {selectedGroupName}</h2>
              <ul className="plain-list">
                {insights.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          )}

          {paretoRows.length > 0 && (
            <section className="card">
              <h2>Pareto — สัดส่วนเวลาของแต่ละ Step</h2>
              <p className="card-intro">
                % ของเวลารวมทั้งหมด เรียงจากมากไปน้อย ขั้นตอนที่ติดป้าย "กลุ่มหลัก" รวมกันใช้เวลาประมาณ 80%
              </p>
              {/* ชื่อ Step ภาษาไทยยาวและตัดบรรทัดไม่ได้ บนจอเล็กจึงซ่อนกราฟ ใช้ตารางด้านล่างแทน */}
              <div className="hide-on-mobile">
                <ResponsiveContainer width="100%" height={Math.max(160, paretoRows.length * 48)}>
                  <BarChart data={paretoRows} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke={CHART.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      unit="%"
                      tick={{ fontSize: 12, fill: CHART.tick }}
                      tickLine={false}
                      axisLine={{ stroke: CHART.axis }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={240}
                      tick={{ fontSize: 13, fill: CHART.tick }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(160, 124, 91, 0.08)' }}
                      contentStyle={{ borderRadius: 8, border: `1px solid ${CHART.axis}`, fontFamily: 'inherit' }}
                      formatter={(value) => [`${Number(value).toFixed(1)}%`, 'สัดส่วนเวลา']}
                    />
                    <Bar dataKey="share" fill={CHART.bar} radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th className="num">เวลาเฉลี่ย (s)</th>
                      <th className="num">สัดส่วน</th>
                      <th className="num">สะสม</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paretoRows.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td className="num">{fmt(row.avg)}</td>
                        <td className="num">{fmt(row.share, 1)}%</td>
                        <td className="num">{fmt(row.cumulative, 1)}%</td>
                        <td>{row.isVitalFew && <span className="badge badge-accent">กลุ่มหลัก</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {paretoRows.length > 0 && (
            <section className="card">
              <h2>ความเสถียรของเวลาแต่ละ Step</h2>
              <p className="card-intro">
                CV (Coefficient of Variation) = SD ÷ ค่าเฉลี่ย × 100 ยิ่งสูงแปลว่าเวลาแต่ละรอบต่างกันมาก
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th className="num">จำนวนครั้ง</th>
                      <th className="num">ค่าเฉลี่ย (s)</th>
                      <th className="num">SD (s)</th>
                      <th className="num">CV</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paretoRows.map((row) => {
                      const stability = getStability(row.cv, cvStable, cvWatch);
                      return (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td className="num">{row.count}</td>
                          <td className="num">{fmt(row.avg)}</td>
                          <td className="num">{row.count > 1 ? fmt(row.sd) : '-'}</td>
                          <td className="num">{row.count > 1 ? `${fmt(row.cv, 1)}%` : '-'}</td>
                          <td>
                            {row.count > 1 ? (
                              <span className={`badge ${stability.className}`}>{stability.label}</span>
                            ) : (
                              <span className="muted">ข้อมูลไม่พอ</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="two-col">
            <section className="card">
              <h2>เปรียบเทียบผู้ปฏิบัติงาน</h2>
              {operatorRows.length === 0 ? (
                <p className="empty-state">ไม่มีข้อมูล</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ผู้ปฏิบัติงาน</th>
                        <th className="num">รอบ</th>
                        <th className="num">เวลาเฉลี่ย (s)</th>
                        <th className="num">ประสิทธิภาพ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operatorRows.map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td className="num">{row.cycles}</td>
                          <td className="num">{fmt(row.avgTime)}</td>
                          <td className="num">{fmt(row.avgEfficiency, 1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h2>Defect ตาม Step</h2>
              {defectRows.length === 0 ? (
                <p className="empty-state">ไม่พบ Defect ใน Process นี้</p>
              ) : (
                <div className="lb-list">
                  {defectRows.map((row) => (
                    <div key={row.name} className="lb-row">
                      <span className="lb-name">{row.name}</span>
                      <div className="lb-bar-track">
                        <div
                          className="lb-bar-fill bottleneck"
                          style={{ width: `${maxDefect > 0 ? (row.count / maxDefect) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="lb-time" title={`${fmt(row.perCycle)} ครั้งต่อรอบ`}>
                        {row.count} ครั้ง
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
