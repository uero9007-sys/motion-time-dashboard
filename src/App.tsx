import { Fragment, useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from './lib/supabase';
import {
  UNGROUPED_ID,
  calculateEfficiency,
  calculateStandardTime,
  getKValue,
  matchesGroup,
} from './lib/ie';
import type { DefectLog, Page, ProcessGroup, Step, Study, StudyMetric } from './types';
import LearnPage from './pages/LearnPage';
import AnalysisPage from './pages/AnalysisPage';
import LineBalancePage from './pages/LineBalancePage';
import SettingsPage from './pages/SettingsPage';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type DashboardSettings } from './lib/settings';
import './App.css';

function App() {
  const [settings, setSettings] = useState<DashboardSettings>(loadSettings);
  const [page, setPage] = useState<Page>(settings.startPage);
  const [studies, setStudies] = useState<Study[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stepsCache, setStepsCache] = useState<Record<string, Step[]>>({});
  const [defectsCache, setDefectsCache] = useState<Record<string, DefectLog[]>>({});
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [processGroups, setProcessGroups] = useState<ProcessGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [studyMetrics, setStudyMetrics] = useState<StudyMetric[]>([]);
  const [confidenceLevel, setConfidenceLevel] = useState<number>(settings.confidence);
  const [errorPercent, setErrorPercent] = useState<number>(settings.errorPercent);

  const updateSettings = (patch: Partial<DashboardSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    // ค่าเริ่มต้นของการ์ด Sample Size ให้มีผลทันที
    if (patch.confidence !== undefined) setConfidenceLevel(patch.confidence);
    if (patch.errorPercent !== undefined) setErrorPercent(patch.errorPercent);
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(settings.fontScale));
  }, [settings.fontScale]);
  const [rawSteps, setRawSteps] = useState<Step[]>([]);

  const fetchStudies = async () => {
    const { data, error } = await supabase
      .from('studies')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching studies:', error);
    } else {
      setStudies(data);
    }
    setIsLoading(false);
  };

  const fetchProcessGroups = async () => {
    const { data, error } = await supabase
      .from('process_groups')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching process groups:', error);
    } else {
      setProcessGroups(data);
    }
  };

  const fetchChartData = async () => {
    const { data: studiesData, error: studiesError } = await supabase
      .from('studies')
      .select('*')
      .order('created_at', { ascending: true });
    if (studiesError || !studiesData) return;

    const { data: allSteps, error: stepsError } = await supabase.from('steps').select('*');
    if (stepsError || !allSteps) return;

    setRawSteps(allSteps);

    const metrics: StudyMetric[] = [];
    studiesData.forEach((study) => {
      const stepsOfThisStudy = allSteps.filter((s) => s.study_id === study.id);
      const totalMs = stepsOfThisStudy.reduce((sum, s) => sum + s.time_ms, 0);
      const dateLabel = new Date(study.created_at).toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
      });
      const chartLabel = `${study.process_name} (${dateLabel})`;

      let standardTimeMs = 0;
      let efficiency = 0;
      if (stepsOfThisStudy.length > 0) {
        standardTimeMs = calculateStandardTime(stepsOfThisStudy, study.allowance_percent);
        efficiency = calculateEfficiency(totalMs, standardTimeMs);
      }

      const qty = study.quantity_produced || 1;
      const manHourPerUnit = (totalMs / 1000 / 3600) / qty;

      metrics.push({
        studyId: study.id,
        processGroupId: study.process_group_id,
        chartLabel,
        totalTimeSec: Number((totalMs / 1000).toFixed(2)),
        standardTimeSec: Number((standardTimeMs / 1000).toFixed(2)),
        efficiency: Number(efficiency.toFixed(1)),
        manHourPerUnit,
        quantity: qty,
      });
    });

    setStudyMetrics(metrics);
  };

  useEffect(() => {
    // setState ใน fetch* เกิดหลัง await เท่านั้น จึงไม่ใช่ synchronous setState
    // oxlint-disable-next-line react/set-state-in-effect
    fetchStudies();
    fetchChartData();
    fetchProcessGroups();
  }, []);

  const loadStepsForStudy = async (studyId: string) => {
    const { data } = await supabase
      .from('steps')
      .select('*')
      .eq('study_id', studyId)
      .order('order_index', { ascending: true });
    if (data) setStepsCache((prev) => ({ ...prev, [studyId]: data }));
  };

  const toggleExpand = async (studyId: string) => {
    if (expandedId === studyId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(studyId);
    if (stepsCache[studyId]) return;

    setIsLoadingDetail(true);
    const [stepsResult, defectsResult] = await Promise.all([
      supabase.from('steps').select('*').eq('study_id', studyId).order('order_index', { ascending: true }),
      supabase.from('defect_logs').select('*').eq('study_id', studyId).order('occurred_at', { ascending: true }),
    ]);
    if (stepsResult.data) setStepsCache((prev) => ({ ...prev, [studyId]: stepsResult.data }));
    if (defectsResult.data) setDefectsCache((prev) => ({ ...prev, [studyId]: defectsResult.data }));
    setIsLoadingDetail(false);
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString('th-TH');
  const formatTime = (ms: number) => (ms / 1000).toFixed(2);

  const filteredStudies =
    selectedGroupId === null ? [] : studies.filter((s) => matchesGroup(s.process_group_id, selectedGroupId));

  const filteredMetrics =
    selectedGroupId === null ? [] : studyMetrics.filter((m) => matchesGroup(m.processGroupId, selectedGroupId));

  const ungroupedStudyCount = studies.filter((s) => !s.process_group_id).length;
  const groupOptions: ProcessGroup[] = [
    ...processGroups,
    ...(ungroupedStudyCount > 0 ? [{ id: UNGROUPED_ID, name: 'ไม่ระบุ Process ใหญ่' }] : []),
  ];

  const processCards = groupOptions.map((group) => {
    const groupStudies = studies.filter((s) => matchesGroup(s.process_group_id, group.id));
    const lastCreatedAt = groupStudies.reduce<string | null>(
      (latest, s) => (!latest || s.created_at > latest ? s.created_at : latest),
      null
    );
    return {
      ...group,
      cycleCount: groupStudies.length,
      processCount: new Set(groupStudies.map((s) => s.process_name)).size,
      lastCreatedAt,
    };
  });

  const totalCycles = filteredMetrics.length;
  const totalStudyTypes = new Set(filteredStudies.map((s) => s.process_name)).size;
  const avgCycleTime =
    filteredMetrics.length > 0
      ? filteredMetrics.reduce((sum, m) => sum + m.totalTimeSec, 0) / filteredMetrics.length
      : 0;
  const totalOperators = new Set(filteredStudies.map((s) => s.operator_name).filter((name) => name)).size;
  const filteredAvgStandardTime =
    filteredMetrics.length > 0
      ? filteredMetrics.reduce((sum, m) => sum + m.standardTimeSec, 0) / filteredMetrics.length
      : 0;
  const filteredAvgEfficiency =
    filteredMetrics.length > 0
      ? filteredMetrics.reduce((sum, m) => sum + m.efficiency, 0) / filteredMetrics.length
      : 0;
  const filteredAvgManHour =
    filteredMetrics.length > 0
      ? filteredMetrics.reduce((sum, m) => sum + m.manHourPerUnit, 0) / filteredMetrics.length
      : 0;

  const sampleTimes = filteredMetrics.map((m) => m.totalTimeSec);
  const sampleN = sampleTimes.length;
  const sampleMean = sampleN > 0 ? sampleTimes.reduce((a, b) => a + b, 0) / sampleN : 0;
  const sampleVariance =
    sampleN > 1 ? sampleTimes.reduce((sum, t) => sum + Math.pow(t - sampleMean, 2), 0) / (sampleN - 1) : 0;
  const sampleStdDev = Math.sqrt(sampleVariance);
  const kValue = getKValue(confidenceLevel);
  const hValue = errorPercent / 100;
  const requiredN =
    sampleN > 1 && sampleMean > 0 ? Math.pow((kValue * sampleStdDev) / (hValue * sampleMean), 2) : 0;
  const requiredNRounded = Math.ceil(requiredN);
  const remainingRounds = Math.max(requiredNRounded - sampleN, 0);

  // แก้ชื่อ Step รายแถว พร้อมยืนยัน 2 ชั้น (ยังคงมีไว้ให้แก้เองได้ในกรณีจำเป็น)
  const handleStepNameEdit = async (
    step: Step,
    newNameRaw: string,
    studyId: string,
    inputEl: HTMLInputElement
  ) => {
    const trimmed = newNameRaw.trim();

    if (!trimmed || trimmed === step.name) {
      inputEl.value = step.name;
      return;
    }

    const confirmChange = window.confirm(
      `ยืนยันเปลี่ยนชื่อ Step จาก "${step.name}" เป็น "${trimmed}" ใช่หรือไม่?`
    );
    if (!confirmChange) {
      inputEl.value = step.name;
      return;
    }

    try {
      const { error } = await supabase.from('steps').update({ name: trimmed }).eq('id', step.id);
      if (error) throw error;

      await fetchChartData();
      await loadStepsForStudy(studyId);
    } catch (err) {
      console.error('Error renaming step:', err);
      alert('เปลี่ยนชื่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      inputEl.value = step.name;
    }
  };

  const selectedGroupName = groupOptions.find((g) => g.id === selectedGroupId)?.name || '';

  const refreshAll = () => {
    setIsLoading(true);
    fetchStudies();
    fetchChartData();
    fetchProcessGroups();
  };

  const backToPicker = () => {
    setPage('home');
    setSelectedGroupId(null);
    setExpandedId(null);
  };

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const byProcess: Record<string, Study[]> = {};

    filteredStudies.forEach((s) => {
      const key = s.process_name || 'ไม่ระบุ';
      if (!byProcess[key]) byProcess[key] = [];
      byProcess[key].push(s);
    });

    Object.entries(byProcess).forEach(([processName, processStudies]) => {
      const sorted = [...processStudies].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const stepOrderMap = new Map<string, number>();
      sorted.forEach((study) => {
        rawSteps
          .filter((s) => s.study_id === study.id)
          .forEach((step) => {
            if (!stepOrderMap.has(step.name)) stepOrderMap.set(step.name, step.order_index);
          });
      });
      const stepNames = Array.from(stepOrderMap.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name);

      const rows: Record<string, string | number>[] = [];
      sorted.forEach((study, idx) => {
        const studySteps = rawSteps.filter((s) => s.study_id === study.id);
        const row: Record<string, string | number> = { 'รอบที่': `รอบที่ ${idx + 1}` };
        let totalSec = 0;

        stepNames.forEach((name) => {
          const matches = studySteps.filter((s) => s.name === name && s.time_ms > 0);
          if (matches.length === 0) {
            row[name] = '';
          } else {
            const sumMs = matches.reduce((sum, s) => sum + s.time_ms, 0);
            const sec = Number((sumMs / 1000).toFixed(2));
            row[name] = sec;
            totalSec += sec;
          }
        });

        row['จำนวนที่ผลิต'] = study.quantity_produced || 1;
        row['เวลารวม'] = Number(totalSec.toFixed(2));
        rows.push(row);
      });

      const avgRow: Record<string, string | number> = { 'รอบที่': `เฉลี่ย ${processName}` };
      stepNames.forEach((name) => {
        const vals = rows.map((r) => r[name]).filter((v) => typeof v === 'number') as number[];
        avgRow[name] = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : '';
      });
      const qtyVals = rows.map((r) => r['จำนวนที่ผลิต'] as number);
      avgRow['จำนวนที่ผลิต'] = Number((qtyVals.reduce((a, b) => a + b, 0) / qtyVals.length).toFixed(2));
      const totalVals = rows.map((r) => r['เวลารวม'] as number);
      avgRow['เวลารวม'] = Number((totalVals.reduce((a, b) => a + b, 0) / totalVals.length).toFixed(2));

      const finalRows = [avgRow, ...rows];
      const sheet = XLSX.utils.json_to_sheet(finalRows);
      const safeName = processName.substring(0, 31).replace(/[\\/?*[\]]/g, '');
      XLSX.utils.book_append_sheet(workbook, sheet, safeName || 'Process');
    });

    if (Object.keys(byProcess).length === 0) {
      alert('ไม่มีข้อมูลให้ Export');
      return;
    }

    XLSX.writeFile(workbook, `motion-time-study-${Date.now()}.xlsx`);
  };

  const sidebar = (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">MTS</span>
        <span className="sidebar-title">Motion &amp; Time Study</span>
      </div>
      <nav className="sidebar-nav">
        <a
          className={`nav-item ${page === 'home' ? 'active' : ''}`}
          href="#"
          onClick={(e) => { e.preventDefault(); backToPicker(); }}
        >
          หน้าหลัก
        </a>
        <a
          className={`nav-item ${page === 'learn' ? 'active' : ''}`}
          href="#"
          onClick={(e) => { e.preventDefault(); setPage('learn'); }}
        >
          การศึกษา
        </a>
        <a
          className={`nav-item ${page === 'analysis' ? 'active' : ''}`}
          href="#"
          onClick={(e) => { e.preventDefault(); setPage('analysis'); }}
        >
          การวิเคราะห์
        </a>
        <a
          className={`nav-item ${page === 'calc' ? 'active' : ''}`}
          href="#"
          onClick={(e) => { e.preventDefault(); setPage('calc'); }}
        >
          การคำนวณ
        </a>
        <a
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          href="#"
          onClick={(e) => { e.preventDefault(); setPage('settings'); }}
        >
          ตั้งค่า
        </a>
      </nav>
    </aside>
  );

  if (page === 'learn') {
    return (
      <div className="app-layout">
        {sidebar}
        <main className="main-content">
          <LearnPage />
        </main>
      </div>
    );
  }

  if (page === 'analysis') {
    return (
      <div className="app-layout">
        {sidebar}
        <main className="main-content">
          <AnalysisPage
            studies={studies}
            steps={rawSteps}
            metrics={studyMetrics}
            groups={groupOptions}
            isLoading={isLoading}
            cvStable={settings.cvStable}
            cvWatch={settings.cvWatch}
          />
        </main>
      </div>
    );
  }

  if (page === 'calc') {
    return (
      <div className="app-layout">
        {sidebar}
        <main className="main-content">
          <LineBalancePage
            studies={studies}
            metrics={studyMetrics}
            groups={groupOptions}
            isLoading={isLoading}
            defaultShiftMinutes={settings.shiftMinutes}
          />
        </main>
      </div>
    );
  }

  if (page === 'settings') {
    return (
      <div className="app-layout">
        {sidebar}
        <main className="main-content">
          <SettingsPage
            settings={settings}
            onChange={updateSettings}
            onReset={() => updateSettings(DEFAULT_SETTINGS)}
            onRefresh={refreshAll}
            counts={{ groups: processGroups.length, studies: studies.length, steps: rawSteps.length }}
          />
        </main>
      </div>
    );
  }

  if (selectedGroupId === null) {
    return (
      <div className="app-layout">
        {sidebar}
        <main className="main-content">
          <div className="page-header">
            <div>
              <h1>เลือก Process</h1>
              <p className="page-subtitle">เลือก Process ใหญ่ที่ต้องการดูข้อมูล</p>
            </div>
            <div className="header-actions">
              <button className="btn" onClick={refreshAll}>รีเฟรชข้อมูล</button>
            </div>
          </div>

          {isLoading ? (
            <p className="empty-state">กำลังโหลดข้อมูล...</p>
          ) : processCards.length === 0 ? (
            <p className="empty-state">ยังไม่มี Process ในระบบ</p>
          ) : (
            <div className="process-grid">
              {processCards.map((card) => (
                <button key={card.id} className="process-card" onClick={() => setSelectedGroupId(card.id)}>
                  <span className="process-card-name">{card.name}</span>
                  {card.cycleCount === 0 ? (
                    <span className="process-card-meta">ยังไม่มีข้อมูล</span>
                  ) : (
                    <>
                      <span className="process-card-meta">
                        {card.processCount} Process · {card.cycleCount} รอบ
                      </span>
                      {card.lastCreatedAt && (
                        <span className="process-card-date">
                          ล่าสุด {new Date(card.lastCreatedAt).toLocaleDateString('th-TH')}
                        </span>
                      )}
                    </>
                  )}
                  <span className="process-card-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {sidebar}

      <main className="main-content">
        <div className="page-header">
          <div>
            <button className="back-link" onClick={backToPicker}>← เลือก Process อื่น</button>
            <h1>{selectedGroupName}</h1>
          </div>
          <div className="header-actions">
            <select
              className="group-filter"
              value={selectedGroupId}
              onChange={(e) => { setSelectedGroupId(e.target.value); setExpandedId(null); }}
              aria-label="เปลี่ยน Process"
            >
              {groupOptions.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <button className="btn" onClick={exportExcel}>Export Excel</button>
            <button className="btn" onClick={refreshAll}>รีเฟรชข้อมูล</button>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card">
            <span className="kpi-label">การศึกษาทั้งหมด</span>
            <span className="kpi-value">{totalStudyTypes} <small>Process</small></span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">รอบทั้งหมด</span>
            <span className="kpi-value">{totalCycles} <small>รอบ</small></span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">เวลาเฉลี่ยต่อรอบ</span>
            <span className="kpi-value">{avgCycleTime.toFixed(2)} <small>วินาที</small></span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">ผู้ปฏิบัติงาน</span>
            <span className="kpi-value">{totalOperators} <small>คน</small></span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Standard Time เฉลี่ย</span>
            <span className="kpi-value">{filteredAvgStandardTime.toFixed(2)} <small>วินาที</small></span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">ประสิทธิภาพเฉลี่ย</span>
            <span className="kpi-value">{filteredAvgEfficiency.toFixed(1)} <small>%</small></span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Man-hour ต่อหน่วย</span>
            <span className="kpi-value">{filteredAvgManHour.toFixed(4)} <small>ชม./ชิ้น</small></span>
          </div>
        </div>

        {filteredMetrics.length > 0 && (
          <div className="card chart-section">
            <h2>แนวโน้มเวลารวมของแต่ละ Study</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={filteredMetrics.map((m) => ({ name: m.chartLabel, totalTime: m.totalTimeSec }))}
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid stroke="#EEE7DC" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#7A6F63' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E4DCCF' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#7A6F63' }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'วินาที', angle: -90, position: 'insideLeft', fill: '#7A6F63', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #E4DCCF', fontFamily: 'inherit' }}
                  formatter={(value) => [`${value} วินาที`, 'เวลารวม']}
                />
                <Line
                  type="monotone"
                  dataKey="totalTime"
                  stroke="#A07C5B"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#A07C5B', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="card sample-size-card">
          <div className="sample-size-header">
            <h2>จำนวนรอบที่ต้องจับเพิ่ม</h2>
            <div className="sample-size-controls">
              <label>
                ความเชื่อมั่น
                <select value={confidenceLevel} onChange={(e) => setConfidenceLevel(Number(e.target.value))}>
                  <option value={90}>90%</option>
                  <option value={95}>95%</option>
                  <option value={99}>99%</option>
                </select>
              </label>
              <label>
                ค่าคลาดเคลื่อนที่ยอมรับ
                <select value={errorPercent} onChange={(e) => setErrorPercent(Number(e.target.value))}>
                  <option value={5}>5%</option>
                  <option value={10}>10%</option>
                  <option value={15}>15%</option>
                </select>
              </label>
            </div>
          </div>
          {sampleN < 2 ? (
            <p className="sample-size-warning">ต้องมีข้อมูลอย่างน้อย 2 รอบ (ตอนนี้มี {sampleN} รอบ)</p>
          ) : (
            <div className="sample-size-stats">
              <div className="stat-item">
                <span className="stat-label">รอบที่จับแล้ว</span>
                <span className="stat-value">{sampleN}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">ค่าเฉลี่ย</span>
                <span className="stat-value">{sampleMean.toFixed(2)}s</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">ส่วนเบี่ยงเบนมาตรฐาน</span>
                <span className="stat-value">{sampleStdDev.toFixed(2)}s</span>
              </div>
              <div className="stat-item highlight">
                <span className="stat-label">รอบที่ควรมีทั้งหมด</span>
                <span className="stat-value">{requiredNRounded}</span>
              </div>
              <div className={`stat-item ${remainingRounds === 0 ? 'success' : 'highlight'}`}>
                <span className="stat-label">{remainingRounds === 0 ? 'สถานะ' : 'ต้องจับเพิ่มอีก'}</span>
                <span className="stat-value">{remainingRounds === 0 ? '✓ เพียงพอแล้ว' : `${remainingRounds} รอบ`}</span>
              </div>
            </div>
          )}
        </div>

        <h2 className="section-title">รายการ Study</h2>
        {isLoading ? (
          <p className="empty-state">กำลังโหลดข้อมูล...</p>
        ) : filteredStudies.length === 0 ? (
          <p className="empty-state">Process นี้ยังไม่มีข้อมูล Study</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th><th>Process</th><th>ผู้ปฏิบัติงาน</th><th>วันที่ทำ</th><th>เสร็จสิ้นเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudies.map((study) => {
                const isExpanded = expandedId === study.id;
                const steps = stepsCache[study.id] || [];
                const defects = defectsCache[study.id] || [];
                const totalTime = steps.reduce((sum, s) => sum + s.time_ms, 0);
                return (
                  <Fragment key={study.id}>
                    <tr className="clickable-row" onClick={() => toggleExpand(study.id)}>
                      <td>{isExpanded ? '▼' : '▶'}</td>
                      <td>{study.process_name}</td>
                      <td>{study.operator_name || '-'}</td>
                      <td>{formatDate(study.created_at)}</td>
                      <td>{study.finished_at ? formatDate(study.finished_at) : '-'}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="detail-cell">
                          {isLoadingDetail && steps.length === 0 ? (
                            <p>กำลังโหลดรายละเอียด...</p>
                          ) : (
                            <div className="detail-content">
                              <h3>รายการ Step (แก้ชื่อได้ พิมพ์แล้วกด Enter)</h3>
                              <table className="inner-table">
                                <thead><tr><th>ชื่อ Step</th><th>เวลา (วินาที)</th></tr></thead>
                                <tbody>
                                  {steps.map((step) => (
                                    <tr key={`${step.id}-${step.name}`}>
                                      <td>
                                        <input
                                          className="step-name-edit"
                                          defaultValue={step.name}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              (e.target as HTMLInputElement).blur();
                                            }
                                          }}
                                          onBlur={(e) =>
                                            handleStepNameEdit(step, e.target.value, study.id, e.target)
                                          }
                                        />
                                      </td>
                                      <td>{formatTime(step.time_ms)}s</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr><td><strong>รวม (เวลาจริง)</strong></td><td><strong>{formatTime(totalTime)}s</strong></td></tr>
                                </tfoot>
                              </table>
                              {steps.length > 0 && (
                                <div className="standard-time-box">
                                  <div><span className="std-label">Standard Time: </span><span className="std-value">{(calculateStandardTime(steps, study.allowance_percent) / 1000).toFixed(2)}s</span></div>
                                  <div><span className="std-label">ประสิทธิภาพ: </span><span className="std-value">{calculateEfficiency(totalTime, calculateStandardTime(steps, study.allowance_percent)).toFixed(1)}%</span></div>
                                  <div><span className="std-label">ผลิตได้: </span><span className="std-value">{study.quantity_produced || 1} ชิ้น</span></div>
                                </div>
                              )}
                              <h3>Defect Log ({defects.length})</h3>
                              {defects.length === 0 ? (
                                <p className="no-defect">ไม่มี Defect เกิดขึ้น</p>
                              ) : (
                                <ul className="defect-list">
                                  {defects.map((log) => (<li key={log.id}>{log.step_name} — {formatDate(log.occurred_at)}</li>))}
                                </ul>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

export default App;