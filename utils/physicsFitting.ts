
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
  val: number; // can be ln_norm or radius
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

export interface GrowthFitResult {
  id: string;
  group: string;
  k: number;      // Exponential rate constant
  r_inf: number;  // Asymptotic Radius (Calculated from A)
  r0: number;     // Initial radius
  r2: number;
  fitLine: { time: number; radius: number }[];
}

/**
 * Permeability Transformation
 */
export const transformTraceData = (
  rows: CSVRow[],
  mapping: ColumnMapping,
  intensityField: string,
  bgConstant: number, 
  radiusField: string,
  pw: number,
  minThreshold: number,
  dt: number 
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
    let cumulativeTau = 0;

    for (let i = 0; i < sorted.length; i++) {
      const I_in = Number(sorted[i][intensityField]);
      const radius_microns = Number(sorted[i][radiusField]);
      
      // Calculate Normalized Ratio: (I(t) - I_end) / (I_start - I_end)
      let ratio = (I_in - I_last) / range;

      if (i > 0) {
        const prevRadius_microns = Number(sorted[i-1][radiusField]);
        const r_cm = radius_microns * 1e-4;
        const prev_r_cm = prevRadius_microns * 1e-4;

        if (r_cm > 0 && prev_r_cm > 0) {
           const avgRate = ((3 * pw / prev_r_cm) + (3 * pw / r_cm)) / 2;
           cumulativeTau += avgRate * dt;
        }
      }

      // Only take points compatible with Log plot
      if (ratio > 0) {
        // Clamp ratio max to 1.0 for physical sense, though noise might push it slightly over
        const validRatio = Math.min(ratio, 1.0 + 1e-6); 
        points.push({
          tau_w: cumulativeTau,
          ln_y: Math.log(validRatio) 
        });
      }
    }
    // Only include traces with enough valid points
    if (points.length >= 3) results.push({ id, group, points });
  });
  return results;
};

/**
 * Leakage Fitting: ln(y) = m * Tau => Pf = -m
 */
export const fitTraceData = (
  traces: TransformedTrace[],
  fitRange: [number, number],
  pw: number,
  minThreshold: number
): TraceFitResult[] => {
  const results: TraceFitResult[] = [];
  // const minLnY = Math.log(Math.max(minThreshold, 1e-9));

  traces.forEach(trace => {
    const pointsForFit = trace.points.filter(p => p.tau_w >= fitRange[0] && p.tau_w <= fitRange[1]);
    if (pointsForFit.length < 2) return;

    let sumXY = 0, sumX2 = 0;
    pointsForFit.forEach(p => {
      sumXY += p.tau_w * p.ln_y;
      sumX2 += p.tau_w * p.tau_w;
    });

    const m = sumX2 !== 0 ? sumXY / sumX2 : 0; 
    const pf_calculated = -m; 

    const ssRes = pointsForFit.reduce((acc, p) => acc + Math.pow(p.ln_y - (m * p.tau_w), 2), 0);
    const ssTot = pointsForFit.reduce((acc, p) => acc + Math.pow(p.ln_y, 2), 0);
    const r2 = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;

    const fitLine = [
        { tau_w: fitRange[0], ln_y: m * fitRange[0] },
        { tau_w: fitRange[1], ln_y: m * fitRange[1] }
    ];

    results.push({ id: trace.id, group: trace.group, pf_val: pf_calculated, r2, fitLine });
  });
  return results;
};

/**
 * Growth Fitting: Exponential Saturation Model
 * Target coordinate: y = 1 - (R0/R)^2
 * Model: y(t) = A * (1 - exp(-k * t))
 * Properties: Passes through (0,0), Monotonically increasing (for k>0), Smooth.
 */
export const fitGrowthData = (
  rows: CSVRow[],
  mapping: ColumnMapping,
  radiusField: string,
  dt: number,
  selectedGroups: Set<string>
): GrowthFitResult[] => {
  const grouped: Record<string, CSVRow[]> = {};
  rows.forEach(r => {
    if (!selectedGroups.has(r.__group || '')) return;
    const id = r.__uid || 'unknown';
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(r);
  });

  const results: GrowthFitResult[] = [];

  Object.entries(grouped).forEach(([id, traceRows]) => {
    const sorted = traceRows.sort((a, b) => Number(a[mapping.frames]) - Number(b[mapping.frames]));
    if (sorted.length < 10) return;

    const group = sorted[0].__group || 'Default';
    
    // Extract basic data
    const data: { time: number, y: number }[] = [];
    const r0 = Number(sorted[0][radiusField]);
    if (isNaN(r0) || r0 === 0) return;

    sorted.forEach(r => {
        const time = Number(r[mapping.frames]) * dt;
        const rad = Number(r[radiusField]);
        if (!isNaN(rad) && rad !== 0) {
            // y goes from 0 upwards as R increases
            const y = 1 - Math.pow(r0 / rad, 2);
            data.push({ time, y });
        }
    });

    if (data.length < 5) return;

    // --- Exponential Saturation Fit: y = A * (1 - exp(-k * t)) ---
    
    // 1. Estimate Asymptote A
    // Since y is theoretically < 1, and usually much lower for small deformations.
    // We estimate A slightly above the max observed value to allow the log transform.
    const maxY = Math.max(...data.map(d => d.y));
    // Heuristic: A is 1.2x max value, but clamped between 0.1 and 0.9999 (singular at 1)
    const A = Math.min(Math.max(maxY * 1.2, 0.1), 0.9999);

    // 2. Linearize: ln(1 - y/A) = -k * t
    // We want to find k. This is a linear regression of Z = k * t where Z = -ln(1 - y/A)
    // forced through origin.
    let sxx = 0;
    let sxy = 0;

    data.forEach(d => {
        // Clamp input to log to avoid NaN
        let val = 1 - (d.y / A);
        if (val <= 1e-9) val = 1e-9; 
        
        const z = -Math.log(val);
        const t = d.time;
        
        sxx += t * t;
        sxy += t * z;
    });

    // 3. Solve for k
    let k = sxx !== 0 ? sxy / sxx : 0;
    // Enforce Monotonic Increase: k must be > 0. 
    // If data trends downwards (physically weird for swelling), we flatline it close to 0.
    if (k < 1e-6) k = 1e-6; 

    // 4. Generate Smooth Monotonic Fit Line (Interpolated)
    const tMax = data[data.length - 1].time;
    const fitLinePoints: { time: number, radius: number }[] = [];
    const steps = 50; 
    
    for(let i=0; i<=steps; i++) {
        const t = (tMax / steps) * i;
        
        // Predict y
        const yPred = A * (1 - Math.exp(-k * t));
        
        // Convert yPred back to Radius for chart compatibility
        // y = 1 - (R0/R)^2  => (R0/R)^2 = 1 - y => R = R0 / sqrt(1 - y)
        const safeY = Math.min(yPred, 0.999); 
        const radius = r0 / Math.sqrt(1 - safeY);
        
        fitLinePoints.push({ time: t, radius });
    }

    // 5. Calculate R2 (in y-space)
    const yPreds = data.map(d => A * (1 - Math.exp(-k * d.time)));
    const ssRes = data.reduce((acc, d, i) => acc + Math.pow(d.y - yPreds[i], 2), 0);
    const meanY = data.reduce((a, b) => a + b.y, 0) / data.length;
    const ssTot = data.reduce((acc, d) => acc + Math.pow(d.y - meanY, 2), 0);
    const r2 = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;

    // Derived r_inf from A
    const r_inf = r0 / Math.sqrt(1 - A);

    results.push({ 
        id, 
        group, 
        k, 
        r_inf, 
        r0, 
        r2, 
        fitLine: fitLinePoints 
    });
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
    const firstVal = Number(sorted[0][intensityField]);
    const lastVal = Number(sorted[sorted.length-1][intensityField]);
    const range = firstVal - lastVal;

    // Filter flat lines or empty data
    if (Math.abs(range) < 1e-6) return;

    // Calculate normalized points: (I - I_end) / (I_start - I_end)
    const points: RealTimePoint[] = [];
    sorted.forEach(r => {
       const val = Number(r[intensityField]);
       const ratio = (val - lastVal) / range;
       
       // STRICT: Only include valid Log points (ratio > 0). 
       // We do NOT arbitrarily cut off low values unless they are <= 0.
       if (ratio > 0) {
           points.push({ 
               time: Number(r[mapping.frames]) * dt, 
               val: Math.log(ratio) 
           });
       }
    });

    if (points.length > 2) results.push({ id, group: sorted[0].__group || 'Default', points });
  });
  return results;
};
