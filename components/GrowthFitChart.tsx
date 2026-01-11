
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { GROUP_COLORS } from '../constants';
import { GrowthFitResult } from '../utils/physicsFitting';
import { CSVRow, ColumnMapping } from '../types';

interface GrowthFitChartProps {
  results: GrowthFitResult[];
  rawData: CSVRow[];
  mapping: ColumnMapping;
  radiusField: string;
  frameInterval: number;
  selectedGroups: Set<string>;
  colorMap?: Record<string, string>;
}

interface PlotPoint {
  x: number;
  y: number;
}

interface PlotTrace {
  id: string;
  group: string;
  points: PlotPoint[];
}

const GrowthFitChart: React.FC<GrowthFitChartProps> = React.memo(({ 
  results, rawData, mapping, radiusField, frameInterval, selectedGroups, colorMap 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Data Transformation
  const { traces, fitLines } = useMemo(() => {
    // 1. Process Raw Data
    const grouped: Record<string, CSVRow[]> = {};
    rawData.forEach(r => {
        if (!selectedGroups.has(r.__group || '')) return;
        const id = r.__uid || 'unknown';
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(r);
    });

    const calculatedTraces: PlotTrace[] = [];
    
    Object.entries(grouped).forEach(([id, rows]) => {
        const sorted = rows.sort((a, b) => Number(a[mapping.frames]) - Number(b[mapping.frames]));
        if (sorted.length === 0) return;

        const r0 = Number(sorted[0][radiusField]);
        if (isNaN(r0) || r0 === 0) return;

        const points: PlotPoint[] = [];
        sorted.forEach(row => {
            const r = Number(row[radiusField]);
            const frame = Number(row[mapping.frames]);
            if (!isNaN(r) && r !== 0) {
                // Formula: 1 - (R0 / R)^2
                const val = 1 - Math.pow(r0 / r, 2);
                points.push({
                    x: frame * frameInterval,
                    y: val
                });
            }
        });
        
        if (points.length > 0) {
            calculatedTraces.push({
                id,
                group: sorted[0].__group || 'Default',
                points
            });
        }
    });

    // 2. Process Fit Results
    // Result has fitLine: {time, radius}[]. We need to transform radius to y using the result's r0 to match the plot.
    const calculatedFits = results.map(res => {
        const points = res.fitLine.map(p => ({
            x: p.time,
            y: 1 - Math.pow(res.r0 / p.radius, 2)
        }));
        return { group: res.group, points };
    });

    return { traces: calculatedTraces, fitLines: calculatedFits };
  }, [rawData, results, mapping, radiusField, frameInterval, selectedGroups]);

  // Bounds
  const bounds = useMemo(() => {
     // Y fixed at [0, 0.5] as requested
     // X from 0 to max time found in data
     let maxX = 0;
     traces.forEach(t => {
         if (t.points.length > 0 && t.points[t.points.length-1].x > maxX) {
             maxX = t.points[t.points.length-1].x;
         }
     });
     if (maxX === 0) maxX = 100;
     
     return { minX: 0, maxX, minY: 0, maxY: 0.5 };
  }, [traces]);

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Draw
  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = dimensions.width * dpr;
      canvas.height = dimensions.height * dpr;
      canvas.style.width = `${dimensions.width}px`;
      canvas.style.height = `${dimensions.height}px`;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      if (traces.length === 0) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NO DATA', dimensions.width/2, dimensions.height/2);
        return;
      }

      const { minX, maxX, minY, maxY } = bounds;
      const W = dimensions.width;
      const H = dimensions.height;
      const padding = { left: 40, right: 20, top: 20, bottom: 30 };
      const chartW = W - padding.left - padding.right;
      const chartH = H - padding.top - padding.bottom;

      const toX = (val: number) => padding.left + ((val - minX) / (maxX - minX)) * chartW;
      const toY = (val: number) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;

      // Draw Axes (No grid lines)
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Y Axis
      ctx.moveTo(padding.left, padding.top);
      ctx.lineTo(padding.left, padding.top + chartH);
      // X Axis
      ctx.lineTo(padding.left + chartW, padding.top + chartH);
      ctx.stroke();

      // Clipping Region for Data
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding.left, padding.top, chartW, chartH);
      ctx.clip();

      // Draw Traces (Hollow circles)
      // Group by group name for color consistency
      const tracesByGroup: Record<string, PlotTrace[]> = {};
      traces.forEach(t => {
          if (!tracesByGroup[t.group]) tracesByGroup[t.group] = [];
          tracesByGroup[t.group].push(t);
      });

      const sortedGroups = Object.keys(tracesByGroup).sort();
      
      sortedGroups.forEach((group, i) => {
          const color = (colorMap && colorMap[group]) ? colorMap[group] : GROUP_COLORS[i % GROUP_COLORS.length];
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;

          ctx.beginPath();
          tracesByGroup[group].forEach(t => {
              t.points.forEach(p => {
                  // Strict clipping for Y (since we fixed range [0, 0.5])
                  if (p.y < minY || p.y > maxY) return;
                  
                  const px = toX(p.x);
                  const py = toY(p.y);
                  
                  // Draw hollow circle (Radius 2)
                  ctx.moveTo(px + 2, py);
                  ctx.arc(px, py, 2, 0, 2 * Math.PI);
              });
          });
          ctx.stroke();
      });

      // Draw Fit Lines (if any)
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      fitLines.forEach(l => {
          const color = (colorMap && colorMap[l.group]) ? colorMap[l.group] : '#000';
          ctx.strokeStyle = color;
          ctx.beginPath();
          let first = true;
          l.points.forEach(p => {
              if (p.y < minY || p.y > maxY) return; 
              const px = toX(p.x);
              const py = toY(p.y);
              if (first) { ctx.moveTo(px, py); first = false; }
              else ctx.lineTo(px, py);
          });
          ctx.stroke();
      });
      ctx.globalAlpha = 1.0;

      ctx.restore(); // End clipping

      // Axes Labels
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      
      // X Axis Labels
      for(let i=0; i<=5; i++) {
        const val = minX + (maxX - minX) * (i/5);
        ctx.fillText(val.toFixed(0), padding.left + (chartW * i)/5, H - 10);
      }
      // Y Axis Labels
      ctx.textAlign = 'right';
      for(let i=0; i<=5; i++) {
        const val = maxY - (maxY - minY) * (i/5);
        ctx.fillText(val.toFixed(2), padding.left - 5, padding.top + (chartH * i)/5 + 3);
      }

      // Titles
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('Time (s)', padding.left + chartW/2, H - 2);

      ctx.save();
      ctx.translate(10, H/2);
      ctx.rotate(-Math.PI/2);
      ctx.fillText('1 - (R0/R)^2', 0, 0);
      ctx.restore();

  }, [traces, fitLines, dimensions, bounds, colorMap]);


  return (
    <div className="w-full h-full bg-white rounded-xl overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Growth Curve Transformation</span>
        <span className="text-[9px] font-bold text-slate-300">Y ∈ [0, 0.5]</span>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 relative">
          <canvas ref={canvasRef} className="block" />
      </div>
    </div>
  );
});

export default GrowthFitChart;
