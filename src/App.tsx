import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { buildStepSummaries, buildStudyRows, exportRawExcel, localDateStamp, type StudyRow } from './lib/export';
import ProcessReport from './components/ProcessReport';
import { AppLayout } from './components/Sidebar';
import CycleTimeChart from './components/CycleTimeChart';
import SampleSizeCard from './components/SampleSizeCard';
import StudyTable from './components/StudyTable';
import ProcessPickerPage, { type ProcessCard } from './pages/ProcessPickerPage';
import {
  UNGROUPED_ID,
  calculateEfficiency,
  calculateStandardTime,
  matchesGroup,
  requiredSampleSize,
} from './lib/ie';
import type { DefectLog, Page, ProcessGroup, Step, Study, StudyMetric } from './types';
import LearnPage from './pages/LearnPage';
import AnalysisPage from './pages/AnalysisPage';
import LineBalancePage from './pages/LineBalancePage';
import SettingsPage from './pages/SettingsPage';
import MembersPage from './pages/MembersPage';
import { canEditData, type Account, type Membership } from './lib/auth';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type DashboardSettings } from './lib/settings';
import './App.css';

type Props = {
  organization: Membership;
  account: Account;
};

function App({ organization, account }: Props) {
  const orgId = organization.id;
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
  const [isExporting, setIsExporting] = useState(false);
  const [report, setReport] = useState<{ rows: StudyRow[]; generatedAt: string } | null>(null);

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
      .eq('organization_id', orgId)
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
      .eq('organization_id', orgId)
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
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });
    if (studiesError || !studiesData) return;

    const { data: allSteps, error: stepsError } = await supabase.from('steps').select('*').eq('organization_id', orgId);
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
    // โหลดครั้งเดียวต่อบริษัท: AuthGate ใส่ key={organization.id} ทำให้ App เริ่มใหม่เมื่อสลับบริษัทอยู่แล้ว
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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

  const filteredStudies =
    selectedGroupId === null ? [] : studies.filter((s) => matchesGroup(s.process_group_id, selectedGroupId));

  const filteredMetrics =
    selectedGroupId === null ? [] : studyMetrics.filter((m) => matchesGroup(m.processGroupId, selectedGroupId));

  const ungroupedStudyCount = studies.filter((s) => !s.process_group_id).length;
  const groupOptions: ProcessGroup[] = [
    ...processGroups,
    ...(ungroupedStudyCount > 0 ? [{ id: UNGROUPED_ID, name: 'ไม่ระบุ Process ใหญ่' }] : []),
  ];

  const processCards: ProcessCard[] = groupOptions.map((group) => {
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

  const sampleStats = requiredSampleSize(filteredMetrics.map((m) => m.totalTimeSec), confidenceLevel, errorPercent);

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

  // โหลด Defect ของทุกรอบใน Process ที่เลือก แล้วรวมเป็นข้อมูลรายรอบสำหรับ Export
  const loadExportRows = async (): Promise<StudyRow[] | null> => {
    if (filteredStudies.length === 0) {
      alert('ไม่มีข้อมูลให้ Export');
      return null;
    }
    const { data: defects, error } = await supabase
      .from('defect_logs')
      .select('*')
      .eq('organization_id', orgId)
      .in('study_id', filteredStudies.map((s) => s.id));
    if (error) {
      console.error('Error fetching defects:', error);
      alert('โหลดข้อมูล Defect ไม่สำเร็จ กรุณาลองใหม่');
      return null;
    }
    return buildStudyRows(filteredStudies, rawSteps, defects || []);
  };

  // ใช้ finally เพื่อให้ปุ่ม Export กลับมากดได้เสมอ แม้ Export จะล้มเหลว
  const runExport = async (action: (rows: StudyRow[]) => void | Promise<void>) => {
    setIsExporting(true);
    try {
      const rows = await loadExportRows();
      if (rows) await action(rows);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsExporting(false);
    }
  };

  const exportExcel = () => runExport((rows) => exportRawExcel(selectedGroupName, rows));

  const exportPdf = () => runExport((rows) => setReport({ rows, generatedAt: new Date().toISOString() }));

  // เมื่อรายงานพร้อมแล้ว รอฟอนต์โหลดเสร็จ แล้วเปิดหน้าต่าง Print (เลือก "Save as PDF")
  useEffect(() => {
    if (!report) return;
    const root = document.documentElement;
    root.classList.add('printing-report');
    const previousTitle = document.title;
    document.title = `รายงาน MTS - ${selectedGroupName} - ${localDateStamp()}`;
    const done = () => {
      root.classList.remove('printing-report');
      document.title = previousTitle;
      setReport(null);
    };
    window.addEventListener('afterprint', done, { once: true });
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) requestAnimationFrame(() => window.print());
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', done);
      root.classList.remove('printing-report');
      document.title = previousTitle;
    };
  }, [report, selectedGroupName]);

  const navigate = (next: Page) => (next === 'home' ? backToPicker() : setPage(next));
  const layout = { page, onNavigate: navigate, organization, account };

  if (page === 'members') {
    return (
      <AppLayout {...layout}>
        <MembersPage organization={organization} account={account} />
      </AppLayout>
    );
  }

  if (page === 'learn') {
    return (
      <AppLayout {...layout}>
        <LearnPage />
      </AppLayout>
    );
  }

  if (page === 'analysis') {
    return (
      <AppLayout {...layout}>
        <AnalysisPage
          studies={studies}
          steps={rawSteps}
          metrics={studyMetrics}
          groups={groupOptions}
          isLoading={isLoading}
          cvStable={settings.cvStable}
          cvWatch={settings.cvWatch}
          organizationId={orgId}
        />
      </AppLayout>
    );
  }

  if (page === 'calc') {
    return (
      <AppLayout {...layout}>
        <LineBalancePage
          studies={studies}
          metrics={studyMetrics}
          groups={groupOptions}
          isLoading={isLoading}
          defaultShiftMinutes={settings.shiftMinutes}
        />
      </AppLayout>
    );
  }

  if (page === 'settings') {
    return (
      <AppLayout {...layout}>
        <SettingsPage
          settings={settings}
          onChange={updateSettings}
          onReset={() => updateSettings(DEFAULT_SETTINGS)}
          onRefresh={refreshAll}
          counts={{ groups: processGroups.length, studies: studies.length, steps: rawSteps.length }}
        />
      </AppLayout>
    );
  }

  if (selectedGroupId === null) {
    return (
      <AppLayout {...layout}>
        <ProcessPickerPage cards={processCards} isLoading={isLoading} onSelect={setSelectedGroupId} onRefresh={refreshAll} />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      {...layout}
      after={
        report && (
          <ProcessReport
            groupName={selectedGroupName}
            rows={report.rows}
            generatedAt={report.generatedAt}
            stepSummaries={buildStepSummaries(report.rows)}
            sampleSize={{ confidence: confidenceLevel, errorPercent, required: sampleStats.required }}
            cvStable={settings.cvStable}
            cvWatch={settings.cvWatch}
          />
        )
      }
    >
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
          <button className="btn" onClick={exportPdf} disabled={isExporting} title="รายงานสรุปของ Process นี้ (เลือก Save as PDF ในหน้าต่าง Print)">
            รายงาน PDF
          </button>
          <button className="btn" onClick={exportExcel} disabled={isExporting} title="ตารางข้อมูลดิบทุกรอบ ทุก Step และ Defect">
            Excel ข้อมูลดิบ
          </button>
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

      {filteredMetrics.length > 0 && <CycleTimeChart metrics={filteredMetrics} />}

      <SampleSizeCard
        stats={sampleStats}
        confidence={confidenceLevel}
        errorPercent={errorPercent}
        onConfidenceChange={setConfidenceLevel}
        onErrorPercentChange={setErrorPercent}
      />

      <h2 className="section-title">รายการ Study</h2>
      {isLoading ? (
        <p className="empty-state">กำลังโหลดข้อมูล...</p>
      ) : filteredStudies.length === 0 ? (
        <p className="empty-state">Process นี้ยังไม่มีข้อมูล Study</p>
      ) : (
        <StudyTable
          studies={filteredStudies}
          expandedId={expandedId}
          stepsCache={stepsCache}
          defectsCache={defectsCache}
          isLoadingDetail={isLoadingDetail}
          onToggle={toggleExpand}
          onStepRename={canEditData(organization.role) ? handleStepNameEdit : undefined}
        />
      )}
    </AppLayout>
  );
}

export default App;
