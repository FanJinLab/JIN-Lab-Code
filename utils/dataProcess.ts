
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
