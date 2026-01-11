
import { CSVRow, ColumnMapping, DerivedFeature } from '../types';

/** Safe min/max for large arrays to avoid "Maximum call stack size exceeded" */
export const getBounds = (arr: number[]) => {
  if (arr.length === 0) return { min: 0, max: 0 };
  let min = arr[0];
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i];
    if (arr[i] > max) max = arr[i];
  }
  return { min, max };
};

// Re-export specific safe min/max for external use
export const safeMin = (arr: number[]) => {
    if (arr.length === 0) return Infinity;
    let min = arr[0];
    for(let i=1; i<arr.length; i++) if(arr[i] < min) min = arr[i];
    return min;
}

export const safeMax = (arr: number[]) => {
    if (arr.length === 0) return -Infinity;
    let max = arr[0];
    for(let i=1; i<arr.length; i++) if(arr[i] > max) max = arr[i];
    return max;
}

export const computeDerivedFeatures = (
  data: CSVRow[], 
  idField: string, 
  frameField: string, 
  targetField: string
): Record<number, DerivedFeature> => {
  const grouped: Record<number, CSVRow[]> = {};
  data.forEach(row => {
    const id = Number(row[idField]);
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(row);
  });

  const features: Record<number, DerivedFeature> = {};

  Object.entries(grouped).forEach(([idStr, rows]) => {
    const id = Number(idStr);
    const sorted = rows.sort((a, b) => Number(a[frameField]) - Number(b[frameField]));
    const values = sorted.map(r => Number(r[targetField])).filter(v => !isNaN(v));
    
    if (values.length < 2) return;

    const { min: vMin, max: vMax } = getBounds(values);
    const v0 = values[0];
    const vEnd = values[values.length - 1];

    features[id] = {
      id,
      field: targetField,
      pct_change_maxmin: (vMax - vMin) / (Math.abs(vMin) || 1),
      pct_change_baseline: (vEnd - v0) / (Math.abs(v0) || 1),
      slope: (vEnd - v0) / (values.length || 1),
      duration: values.length
    };
  });

  return features;
};

export const applyCleaning = (
  data: CSVRow[], 
  mapping: ColumnMapping,
  config: { dropMissing: boolean; smoothingWindow: number }
): CSVRow[] => {
  // Directly filter without spreading to save memory on huge arrays
  if (config.dropMissing) {
    return data.filter(row => 
      row[mapping.id] != null && 
      row[mapping.frames] != null
    );
  }
  return data;
};

// --- Statistics Helpers ---

export const calculateMeanVar = (values: number[]) => {
    if (values.length === 0) return { mean: 0, variance: 0, n: 0 };
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return { mean, variance, n };
};

export const calculatePearsonCorrelation = (x: number[], y: number[]) => {
    const n = x.length;
    if (n !== y.length || n === 0) return 0;
    
    const { mean: meanX } = calculateMeanVar(x);
    const { mean: meanY } = calculateMeanVar(y);
    
    let num = 0;
    let denX = 0;
    let denY = 0;
    
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    
    if (denX === 0 || denY === 0) return 0;
    return num / Math.sqrt(denX * denY);
};

export const getSignificanceLabel = (p: number) => {
    if (p < 0.001) return '***';
    if (p < 0.01) return '**';
    if (p < 0.05) return '*';
    return 'ns';
};

/**
 * Welch's t-test approximation returning p-value.
 * Using Z-score approximation for p-value derived from T-statistic.
 */
export const calculatePValue = (vals1: number[], vals2: number[]) => {
    const s1 = calculateMeanVar(vals1);
    const s2 = calculateMeanVar(vals2);
    
    if (s1.n < 2 || s2.n < 2) return 1.0;
    if (s1.variance === 0 && s2.variance === 0) return 1.0;

    const se = Math.sqrt((s1.variance / s1.n) + (s2.variance / s2.n));
    if (se === 0) return 1.0;

    const t = Math.abs(s1.mean - s2.mean) / se;
    
    // Approximation for P(Z > t) * 2 (Two-tailed)
    // Simple Gaussian approximation often sufficient for basic UI significance stars
    // Z > 1.96 => p < 0.05
    // Z > 2.58 => p < 0.01
    // Z > 3.29 => p < 0.001
    
    // An approximation of ERF for more granular P-value if needed
    // using constant approximation for normal cumulative distribution
    const z = t;
    const b1 =  0.319381530;
    const b2 = -0.356563782;
    const b3 =  1.781477937;
    const b4 = -1.821255978;
    const b5 =  1.330274429;
    const p  =  0.2316419;
    const c2 =  0.39894228;

    const a = Math.abs(z);
    if (a > 6.0) return 0.0;
    const t_k = 1.0 / (1.0 + p * a);
    const prob = 1.0 - c2 * Math.exp(-a * a / 2.0) * t_k *
    (t_k * (t_k * (t_k * (t_k * b5 + b4) + b3) + b2) + b1);
    
    return 2.0 * (1.0 - prob);
};


// --- Export Helpers ---

export const downloadCSV = (data: CSVRow[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).filter(k => k !== '__group' && k !== '__uid');
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(fieldName => {
            const val = row[fieldName];
            return val === null || val === undefined ? '' : val;
        }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

export const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
