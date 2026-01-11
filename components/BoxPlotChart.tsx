
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { GROUP_COLORS } from '../constants';
import { calculatePValue, getSignificanceLabel } from '../utils/dataProcess';

interface BoxPlotChartProps {
  data: { group: string; values: number[] }[];
  colorMap?: Record<string, string>;
  showPoints?: boolean;
  yRange: { min: number; max: number; auto: boolean };
  scale: 'linear' | 'log';
}

const BoxPlotChart: React.FC<BoxPlotChartProps> = ({ data, colorMap, showPoints = true, yRange, scale }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Statistics Calculation
  const stats = useMemo(() => {
    return data.map(d => {
      const sorted = [...d.values].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
      const q2 = sorted[Math.floor(sorted.length * 0.5)] || 0;
      const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
      const min = sorted[0] || 0;
      const max = sorted[sorted.length - 1] || 0;
      const mean = d.values.length > 0 ? d.values.reduce((a, b) => a + b, 0) / d.values.length : 0;
      
      const points = d.values.map(v => ({
          val: v,
          jitterX: (Math.random() - 0.5) * 0.6 // -0.3 to 0.3 relative width
      }));
      return { group: d.group, min, q1, q2, q3, max, mean, count: d.values.length, points, rawValues: d.values };
    });
  }, [data]);

  // Significance Matrix
  const significanceMatrix = useMemo(() => {
     const matrix: { g1: string, g2: string, p: number, label: string }[] = [];
     for(let i=0; i<stats.length; i++) {
         for(let j=i+1; j<stats.length; j++) {
             const g1 = stats[i];
             const g2 = stats[j];
             const p = calculatePValue(g1.rawValues, g2.rawValues);
             matrix.push({ g1: g1.group, g2: g2.group, p, label: getSignificanceLabel(p) });
         }
     }
     return matrix;
  }, [stats]);

  // Range Logic
  const autoMin = stats.length > 0 ? Math.min(...stats.map(s => s.min), Infinity) : 0;
  const autoMax = stats.length > 0 ? Math.max(...stats.map(s => s.max), -Infinity) : 100;
  
  let plotMin = yRange.auto ? autoMin : yRange.min;
  let plotMax = yRange.auto ? autoMax : yRange.max;

  // Log scale safeguards
  if (scale === 'log') {
      if (plotMin <= 0) plotMin = 0.0001; 
      if (plotMax <= 0) plotMax = 1; 
      if (plotMax <= plotMin) plotMax = plotMin * 10;
  }

  // Auto Padding
  if (yRange.auto) {
      if (scale === 'linear') {
          const r = plotMax - plotMin;
          const pad = r === 0 ? 1 : r * 0.1;
          plotMin -= pad;
          plotMax += pad;
      } else {
          plotMin /= 1.5;
          plotMax *= 1.5;
      }
  }

  // Canvas Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Drawing Logic
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

    if (stats.length === 0) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NO DATA', dimensions.width/2, dimensions.height/2);
        return;
    }

    // Layout
    const padding = { top: 40, bottom: 50, left: 60, right: 20 };
    const chartW = dimensions.width - padding.left - padding.right;
    const chartH = dimensions.height - padding.top - padding.bottom;

    // Helper: Y Coordinate
    const toY = (val: number) => {
        let pct = 0;
        if (scale === 'linear') {
            pct = (val - plotMin) / (plotMax - plotMin);
        } else {
            const logMin = Math.log10(plotMin);
            const logMax = Math.log10(plotMax);
            pct = (Math.log10(Math.max(val, 0.00001)) - logMin) / (logMax - logMin);
        }
        // Clamp
        pct = Math.max(0, Math.min(1, pct));
        return padding.top + chartH - pct * chartH;
    };

    // Helper: X Coordinate for Group Center
    const groupWidth = chartW / stats.length;
    const getGroupX = (idx: number) => padding.left + (idx * groupWidth) + (groupWidth / 2);

    // 1. Draw Axes & Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    
    // Y Grid & Ticks
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    const ticks = 6;
    for (let i = 0; i <= ticks; i++) {
        const pct = i / ticks;
        const y = padding.top + chartH - pct * chartH;
        
        // Grid line
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();

        // Label
        let val = 0;
        if (scale === 'linear') {
            val = plotMin + pct * (plotMax - plotMin);
        } else {
            const logMin = Math.log10(plotMin);
            const logMax = Math.log10(plotMax);
            val = Math.pow(10, logMin + pct * (logMax - logMin));
        }
        
        let label = val.toExponential(1);
        if (Math.abs(val) < 1000 && Math.abs(val) > 0.01) label = val.toFixed(2);
        if (val === 0) label = "0";

        ctx.fillText(label, padding.left - 8, y + 3);
    }

    // Y Axis Line
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.stroke();

    // 2. Draw Box Plots
    const boxWidth = Math.min(groupWidth * 0.5, 60);

    stats.forEach((s, i) => {
        const cx = getGroupX(i);
        const yMin = toY(s.min);
        const yMax = toY(s.max);
        const yQ1 = toY(s.q1);
        const yQ3 = toY(s.q3);
        const yMed = toY(s.q2);
        const yMean = toY(s.mean);
        
        const color = colorMap ? colorMap[s.group] : GROUP_COLORS[i % GROUP_COLORS.length];

        // Whiskers
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, yQ1); ctx.lineTo(cx, yMin); // Bottom stem
        ctx.moveTo(cx, yQ3); ctx.lineTo(cx, yMax); // Top stem
        ctx.moveTo(cx - boxWidth/4, yMin); ctx.lineTo(cx + boxWidth/4, yMin); // Bottom cap
        ctx.moveTo(cx - boxWidth/4, yMax); ctx.lineTo(cx + boxWidth/4, yMax); // Top cap
        ctx.stroke();

        // Box
        ctx.fillStyle = color + '33'; // Low opacity hex
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.fillRect(cx - boxWidth/2, yQ3, boxWidth, yQ1 - yQ3);
        ctx.strokeRect(cx - boxWidth/2, yQ3, boxWidth, yQ1 - yQ3);

        // Median
        ctx.strokeStyle = '#0f172a'; // Dark slate
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - boxWidth/2, yMed);
        ctx.lineTo(cx + boxWidth/2, yMed);
        ctx.stroke();

        // Points (Jitter)
        if (showPoints) {
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.5;
            s.points.forEach(p => {
                if (p.val < plotMin || p.val > plotMax) return;
                const px = cx + p.jitterX * boxWidth;
                const py = toY(p.val);
                ctx.beginPath();
                ctx.arc(px, py, 2, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1.0;
        }

        // Mean Dot
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, yMean, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Mean Label (Background + Text)
        const meanLabel = s.mean.toExponential(2);
        ctx.font = 'bold 10px sans-serif';
        const textMetrics = ctx.measureText(meanLabel);
        const tw = textMetrics.width + 6;
        const th = 14;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(cx - tw/2, yMean - 20, tw, th);
        ctx.strokeRect(cx - tw/2, yMean - 20, tw, th);
        
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.fillText(meanLabel, cx, yMean - 9);

        // X Axis Labels (Group + n)
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(s.group, cx, padding.top + chartH + 15);
        
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.fillText(`n=${s.count}`, cx, padding.top + chartH + 28);
    });

  }, [stats, dimensions, plotMin, plotMax, scale, colorMap, showPoints]);

  const handleDownload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `boxplot_comparison_${new Date().getTime()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="w-full h-full flex flex-col relative">
      <div className="absolute top-2 right-2 z-10">
          <button 
             onClick={handleDownload}
             className="bg-white/90 hover:bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-bold shadow-sm transition-all flex items-center space-x-1"
          >
             <span>📷</span><span>Export PNG</span>
          </button>
      </div>
      
      <div ref={containerRef} className="flex-1 min-h-0 bg-white rounded-t-xl overflow-hidden">
        <canvas ref={canvasRef} className="block" />
      </div>

      {/* Pairwise Significance Table */}
      <div className="h-32 overflow-y-auto border-t border-slate-100 pt-4 px-2 bg-white rounded-b-xl">
         <h4 className="text-[9px] font-black text-slate-400 uppercase mb-2">Pairwise Significance Analysis (Welch's t-test)</h4>
         <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
             {significanceMatrix.map((sig, idx) => (
                 <div key={idx} className="flex justify-between items-center bg-slate-50 px-3 py-1.5 rounded text-[9px] border border-slate-100">
                     <span className="font-bold text-slate-600 truncate max-w-[100px]">{sig.g1} vs {sig.g2}</span>
                     <div className="flex items-center space-x-2">
                        <span className="font-mono text-slate-400">p={sig.p.toExponential(1)}</span>
                        <span className={`font-black w-6 text-right ${sig.label !== 'ns' ? 'text-red-500' : 'text-slate-300'}`}>{sig.label}</span>
                     </div>
                 </div>
             ))}
             {significanceMatrix.length === 0 && <span className="text-[9px] text-slate-400 italic">Not enough groups for comparison.</span>}
         </div>
      </div>
    </div>
  );
};

export default BoxPlotChart;
