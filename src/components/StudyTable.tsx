import { Fragment } from 'react';
import { calculateEfficiency, calculateStandardTime } from '../lib/ie';
import type { DefectLog, Step, Study } from '../types';

type Props = {
  studies: Study[];
  expandedId: string | null;
  stepsCache: Record<string, Step[]>;
  defectsCache: Record<string, DefectLog[]>;
  isLoadingDetail: boolean;
  onToggle: (studyId: string) => void;
  onStepRename: (step: Step, newName: string, studyId: string, inputEl: HTMLInputElement) => void;
};

const formatDate = (dateString: string) => new Date(dateString).toLocaleString('th-TH');
const formatTime = (ms: number) => (ms / 1000).toFixed(2);

export default function StudyTable({ studies, expandedId, stepsCache, defectsCache, isLoadingDetail, onToggle, onStepRename }: Props) {
  return (
    <table>
      <thead>
        <tr>
          <th></th><th>Process</th><th>ผู้ปฏิบัติงาน</th><th>วันที่ทำ</th><th>เสร็จสิ้นเมื่อ</th>
        </tr>
      </thead>
      <tbody>
        {studies.map((study) => {
          const isExpanded = expandedId === study.id;
          const steps = stepsCache[study.id] || [];
          const defects = defectsCache[study.id] || [];
          const totalTime = steps.reduce((sum, s) => sum + s.time_ms, 0);
          const standardTime = calculateStandardTime(steps, study.allowance_percent);
          return (
            <Fragment key={study.id}>
              <tr className="clickable-row" onClick={() => onToggle(study.id)}>
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
                                    onBlur={(e) => onStepRename(step, e.target.value, study.id, e.target)}
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
                            <div><span className="std-label">Standard Time: </span><span className="std-value">{(standardTime / 1000).toFixed(2)}s</span></div>
                            <div><span className="std-label">ประสิทธิภาพ: </span><span className="std-value">{calculateEfficiency(totalTime, standardTime).toFixed(1)}%</span></div>
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
  );
}
