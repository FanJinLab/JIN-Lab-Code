
import { CSVRow, ColumnMapping } from '../types';

export interface TransformedPoint {
  tau_w: number;
  ln_y: number;
}

export interface TransformedTrace {
  id: string;
  group: string;
  points: TransformedPoint[];
}

export interface RealTimePoint {
  time: number;
  ln_norm: number;
}

export interface RealTimeTrace {
  id: string;
  group: string;
  points: RealTimePoint[];
}

export interface TraceFitResult {
  id: string;
  group: string;
  pf_val: number;
  r2: number;
  fitLine: TransformedPoint[];
}

/**
 * Step 1: Transform Raw Data to Master Curve Coordinates (Tau_w, ln(y))
 * 
 * Physics based on user formula:
 * Tau = Frame * dt / ( R(um) / (3 * Pw) )
 *     = Frame * dt * 3 * Pw / R(um)
 * NOTE: R must be in cm for physics, but user formula says R(um).
 * To make it physically dimensionless, R(um) must be converted to R(cm).
 * 1 um = 1e-4 cm.
 * 
 * Correct Dimensionless Tau = (3 * Pw * Time_sec) / R_cm
 * 
 * Y-Normalization: (I - I_last) / (I_first - I_last)
 * 
 * Units:
 * Pw: cm/s
 * R: microns (will convert to cm)
 * dt: seconds
 */
export const transformTraceData = (
  rows: CSVRow[],
  mapping: ColumnMapping,
  intensityField: string,
  bgConstant: number, 
  radiusField: string,
  pw: number,
  minThreshold: number,
  dt: number // Frame Interval in seconds
): TransformedTrace[] => {
  const grouped: Record<string, CSVRow[]> = {};
  rows.forEach(r => {
    const id = r.__uid || 'unknown';
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(r);
  });

  const results: TransformedTrace[] = [];

  Object.entries(grouped).forEach(([id, traceRows]) => {
    const sorted = traceRows.sort((a, b) => Number(a[mapping.frames]) - Number(b[mapping.frames]));
    if (sorted.length < 5) return;

    const group = sorted[0].__group || 'Default';

    const I_first = Number(sorted[0][intensityField]);
    const I_last = Number(sorted[sorted.length - 1][intensityField]);
    const range = I_first - I_last;

    if (Math.abs(range) < 1e-6) return;

    const points: TransformedPoint[] = [];
    
    // Using Cumulative Integration method for variable Radius
    // d(Tau) = (3 * Pw / R(t)) * dt
    
    let cumulativeTau = 0;

    for (let i = 0; i < sorted.length; i++) {
      const I_in = Number(sorted[i][intensityField]);
      const radius_microns = Number(sorted[i][radiusField]);
      
      const numerator = I_in - I_last;
      let ratio = numerator / range;

      if (i > 0) {
        const prevRadius_microns = Number(sorted[i-1][radiusField]);
        
        // Strict conversion: 1 um = 1e-4 cm
        const r_cm = radius_microns * 1e-4;
        const prev_r_cm = prevRadius_microns * 1e-4;

        if (r_cm > 0 && prev_r_cm > 0) {
           // Rate = 3 * Pw / R_cm
           const rate1 = (3 * pw) / prev_r_cm;
           const rate2 = (3 * pw) / r_cm;
           const avgRate = (rate1 + rate2) / 2;
           
           cumulativeTau += avgRate * dt;
        }
      }

      if (ratio > minThreshold) {
        const finalY = Math.min(ratio, 1.0);
        points.push({
          tau_w: cumulativeTau,
          ln_y: Math.log(finalY) 
        });
      }
    }

    if (points.length >= 3) {
      results.push({ id, group, points });
    }
  });

  return results;
};

export const transformRealTimeLogData = (
  rows: CSVRow[],
  mapping: ColumnMapping,
  intensityField: string,
  dt: number
): RealTimeTrace[] => {
  const grouped: Record<string, CSVRow[]> = {};
  rows.forEach(r => {
    const id = r.__uid || 'unknown';
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(r);
  });

  const results: RealTimeTrace[] = [];

  Object.entries(grouped).forEach(([id, traceRows]) => {
    const sorted = traceRows.sort((a, b) => Number(a[mapping.frames]) - Number(b[mapping.frames]));
    if (sorted.length < 5) return;

    const group = sorted[0].__group || 'Default';
    
    const I_first = Number(sorted[0][intensityField]);
    const I_last = Number(sorted[sorted.length - 1][intensityField]);
    const range = I_first - I_last;

    if (Math.abs(range) < 1e-6) return;

    const points: RealTimePoint[] = [];
    
    for (let i = 0; i < sorted.length; i++) {
      const I_i = Number(sorted[i][intensityField]);
      const numerator = I_i - I_last;
      
      let ratio = numerator / range;

      if (ratio > 0) {
        if (ratio > 1.0) ratio = 1.0;
        
        const frame = Number(sorted[i][mapping.frames]);
        const time = frame * dt; 

        points.push({
          time: time,
          ln_norm: Math.log(ratio)
        });
      }
    }

    if (points.length > 2) {
      results.push({ id, group, points });
    }
  });

  return results;
};

/**
 * Step 2: Linear Regression through Origin (0,0)
 * Model: ln(y) = m * Tau
 * 
 * Physics Correction:
 * User specifies: "The negative of the slope is Pf"
 * Therefore: Pf = -m
 */
export const fitTraceData = (
  traces: TransformedTrace[],
  fitRange: [number, number],
  pw: number,
  minThreshold: number
): TraceFitResult[] => {
  const results: TraceFitResult[] = [];
  const safeThreshold = Math.max(minThreshold, 1e-9);
  const minLnY = Math.log(safeThreshold);

  traces.forEach(trace => {
    const pointsForFit = trace.points.filter(p => p.tau_w >= fitRange[0] && p.tau_w <= fitRange[1]);

    if (pointsForFit.length < 2) return;

    // Linear Regression FORCED through origin (Intercept = 0)
    // Formula for slope m through origin: Sum(x*y) / Sum(x^2)
    let sumXY = 0;
    let sumX2 = 0;

    pointsForFit.forEach(p => {
      sumXY += p.tau_w * p.ln_y;
      sumX2 += p.tau_w * p.tau_w;
    });

    const m = sumX2 !== 0 ? sumXY / sumX2 : 0; 
    
    // DIRECT CORRECTION: Pf = -slope
    const pf_calculated = -m; 

    // R-squared for regression through origin
    const ssRes = pointsForFit.reduce((acc, p) => acc + Math.pow(p.ln_y - (m * p.tau_w), 2), 0);
    const ssTot = pointsForFit.reduce((acc, p) => acc + Math.pow(p.ln_y, 2), 0);
    const r2 = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;

    // Construct Visual Fit Line strictly bounded by fitRange
    let x1 = fitRange[0];
    let x2 = fitRange[1];
    
    let y1 = m * x1;
    let y2 = m * x2;

    // Clamp for visual sanity
    if (y1 > 0) { y1 = 0; x1 = 0; }
    if (y2 < minLnY) { y2 = minLnY; if (m !== 0) x2 = minLnY / m; }
    if (y1 < minLnY) { y1 = minLnY; if (m !== 0) x1 = minLnY / m; }

    const fitLine = [
        { tau_w: x1, ln_y: y1 },
        { tau_w: x2, ln_y: y2 }
    ];

    results.push({
      id: trace.id,
      group: trace.group,
      pf_val: pf_calculated,
      r2,
      fitLine
    });
  });

  return results;
};
