
export interface CSVRow {
  [key: string]: any;
  __group?: string; // Internal field for grouping
  __uid?: string;   // Internal globally unique ID
}

export interface ColumnMapping {
  id: string;
  frames: string;
  xy: string; 
  sequence: string; 
  dt: number;
  intensityFields: string[];
  geometryFields: string[];
}

export interface GroupingConfig {
  [groupName: string]: string[]; // GroupName -> Array of XY IDs
}

/** Metrics calculated per GUV track for filtering */
export interface TrajectoryFeature {
  id: string | number;
  group: string;
  xy: string;
  sequence: string;
  duration: number;
  stats: Record<string, {
    min: number;
    max: number;
    delta: number;
    mean: number;
    variance: number;
    cv: number; // Coefficient of Variation: std / mean
    first: number;
    last: number;
  }>;
}

export interface DerivedFeature {
  id: string | number;
  field: string;
  pct_change_maxmin: number;
  pct_change_baseline: number;
  slope: number;
  duration: number;
}

export interface FitResult {
  id: string | number;
  params: Record<string, number>;
  r2: number;
  rmse: number;
  status: 'success' | 'failed';
  error?: string;
}

export interface CleaningConfig {
  dropMissing: boolean;
  interpolate: boolean;
  outlierMethod: 'none' | 'iqr' | 'zscore';
  smoothingWindow: number;
  bgCorrection: boolean;
}
