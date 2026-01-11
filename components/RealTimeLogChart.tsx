
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { GROUP_COLORS } from '../constants';
import { RealTimeTrace } from '../utils/physicsFitting';
import { safeMin, safeMax } from '../utils/dataProcess';

interface RealTimeLogChartProps {
  traces: RealTimeTrace[];
  colorMap?: Record<string, string>;
}

const RealTimeLogChart: React.FC<RealTimeLogChartProps> = React.memo(({ traces, colorMap }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Compute bounds: Fixed Y [-5, 0], Fixed X [0, MaxTime]
  const bounds = useMemo(() => {
    if (traces.length === 0) return { minX: 0, maxX: 100, minY: -5, maxY: 0 };
    
    let maxX = 0;
    
    // Find absolute max time
    traces.forEach(t => {
        // Assuming points are sorted by time, check last point
        if (t.points.length > 0) {
            const tMax = t.points[t.points.length - 1].time;
            if (tMax > maxX) maxX = tMax;
        }
    });

    if (maxX === 0) maxX = 100;

    return { minX: 0, maxX: maxX, minY: -5, maxY: 0 };
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

    // Retina support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);

    // Clear
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

    // Grid - REMOVED as requested for cleaner view
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Only draw Axes
    ctx.moveTo(padding.left, padding.top); 
    ctx.lineTo(padding.left, padding.top + chartH); // Y Axis
    ctx.lineTo(padding.left + chartW, padding.top + chartH); // X Axis
    ctx.stroke();

    // Data Points
    // Group traces first
    const tracesByGroup: Record<string, RealTimeTrace[]> = {};
    traces.forEach(t => {
        if(!tracesByGroup[t.group]) tracesByGroup[t.group] = [];
        tracesByGroup[t.group].push(t);
    });
    
    const sortedGroups = Object.keys(tracesByGroup).sort();
    
    sortedGroups.forEach((group, gIdx) => {
        const color = (colorMap && colorMap[group]) ? colorMap[group] : GROUP_COLORS[gIdx % GROUP_COLORS.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1; // Thin stroke for hollow circles
        
        const groupTraces = tracesByGroup[group];
        
        ctx.beginPath();
        for (const t of groupTraces) {
            for (const p of t.points) {
                // Skip if strictly out of Y bounds (X bounds are fixed 0-Max)
                if (p.val < minY || p.val > maxY) continue;

                const px = toX(p.time);
                const py = toY(p.val);
                
                // Draw hollow circle (Radius 2)
                ctx.moveTo(px + 2, py);
                ctx.arc(px, py, 2, 0, 2 * Math.PI);
            }
        }
        ctx.stroke();
    });

    // Axes Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    
    // X
    for(let i=0; i<=5; i++) {
        const val = minX + (maxX - minX) * (i/5);
        ctx.fillText(val.toFixed(0), padding.left + (chartW * i)/5, H - 10);
    }
    // Y
    ctx.textAlign = 'right';
    for(let i=0; i<=5; i++) {
        const val = maxY - (maxY - minY) * (i/5);
        ctx.fillText(val.toFixed(1), padding.left - 5, padding.top + (chartH * i)/5 + 3);
    }
    
    // Titles
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('Time (s)', padding.left + chartW/2, H - 2);

    ctx.save();
    ctx.translate(10, H/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText('ln(Norm)', 0, 0);
    ctx.restore();

  }, [traces, dimensions, bounds, colorMap]);

  return (
    <div className="w-full h-full bg-white rounded-xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex flex-col space-y-3 z-10 shrink-0">
            <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Real Time Decay</span>
                <span className="text-[9px] font-bold text-slate-300">{traces.length} Tracks</span>
            </div>
        </div>
        <div ref={containerRef} className="flex-1 min-h-0 relative">
            <canvas ref={canvasRef} className="block" />
        </div>
    </div>
  );
});

export default RealTimeLogChart;
