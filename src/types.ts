export type Study = {
  id: string;
  process_name: string;
  operator_name: string | null;
  allowance_percent: number | null;
  process_group_id: string | null;
  quantity_produced: number | null;
  created_at: string;
  finished_at: string | null;
};

export type Step = {
  id: string;
  study_id: string;
  name: string;
  order_index: number;
  time_ms: number;
  performance_rating: number | null;
};

export type DefectLog = {
  id: string;
  study_id: string;
  step_name: string;
  occurred_at: string;
};

export type ProcessGroup = {
  id: string;
  name: string;
};

export type StudyMetric = {
  studyId: string;
  processGroupId: string | null;
  chartLabel: string;
  totalTimeSec: number;
  standardTimeSec: number;
  efficiency: number;
  manHourPerUnit: number;
  quantity: number;
};

export type Page = 'home' | 'learn' | 'analysis' | 'calc' | 'settings';
