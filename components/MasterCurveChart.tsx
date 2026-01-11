
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { GROUP_COLORS } from '../constants';
import { TraceFitResult, TransformedTrace } from '../utils/physicsFitting';

interface MasterCurveChartProps {
  traces: TransformedTrace[];
  fitResults: TraceFitResult[];
  fitRange: [number, number];
  setFitRange: (range: [number, number]) => void;
  maxTau: number;
  threshold: number;
  colorMap?: Record<string, string>;
}

const MasterCurveChart: React.FC<MasterCurveChartProps> = React.memo(({ 
  traces, fitResults, fitRange, maxTau, threshold, setFitRange, colorMap 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [localRange, setLocalRange] = useState<[number, number]>(fitRange);

  useEffect(() => {
    setLocalRange(fitRange);
  }, [fitRange]);

  // Bounds
  const bounds = useMemo(() => {
    return { minX: fitRange[0], maxX: fitRange[1], minY: -5, maxY: 0 };
  }, [fitRange]);

  // Resize
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
    const padding = { left: 40, right: 20, top: 10, bottom: 30 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    const toX = (val: number) => {
        if (maxX === minX) return padding.left;
        return padding.left + ((val - minX) / (maxX - minX)) * chartW;
    }
    const toY = (val: number) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;

    // Clipping region for data
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, padding.top, chartW, chartH);
    ctx.clip();

    // 1. Draw Points (Hollow Circles)
    const tracesByGroup: Record<string, TransformedTrace[]> = {};
    traces.forEach(t => {
        if(!tracesByGroup[t.group]) tracesByGroup[t.group] = [];
        tracesByGroup[t.group].push(t);
    });
    
    Object.keys(tracesByGroup).sort().forEach((group, gIdx) => {
        const color = (colorMap && colorMap[group]) ? colorMap[group] : GROUP_COLORS[gIdx % GROUP_COLORS.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1; // Thin lines for circle outline
        
        ctx.beginPath();
        for (const t of tracesByGroup[group]) {
            for (const p of t.points) {
                // Optimization: Don't draw if way out of bounds
                if (p.tau_w < minX - (maxX-minX) || p.tau_w > maxX + (maxX-minX)) continue;
                
                const px = toX(p.tau_w);
                const py = toY(p.ln_y);
                
                // Draw hollow circle radius 2
                ctx.moveTo(px + 2, py);
                ctx.arc(px, py, 2, 0, 2 * Math.PI);
            }
        }
        ctx.stroke();
    });

    // 2. Draw Fit Lines (Thinner, Transparent)
    ctx.globalAlpha = 0.7; // Transparency
    ctx.lineWidth = 1.5; // Thinner
    fitResults.forEach(res => {
       const c = (colorMap && colorMap[res.group]) ? colorMap[res.group] : '#000';
       ctx.strokeStyle = c;
       ctx.beginPath();
       const start = res.fitLine[0];
       const end = res.fitLine[1];
       ctx.moveTo(toX(start.tau_w), toY(start.ln_y));
       ctx.lineTo(toX(end.tau_w), toY(end.ln_y));
       ctx.stroke();
    });
    ctx.globalAlpha = 1.0;

    ctx.restore(); // remove clip

    // 3. Grid & Border (Only Axes, No Grid)
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH); // Y Axis
    ctx.lineTo(padding.left + chartW, padding.top + chartH); // X Axis
    ctx.stroke();

    // 4. Vertical Reference Lines (Fit Window)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    const x1 = toX(fitRange[0]);
    const x2 = toX(fitRange[1]);
    
    if (x1 >= padding.left && x1 <= padding.left + chartW) {
        ctx.moveTo(x1, padding.top);
        ctx.lineTo(x1, padding.top + chartH);
    }
    if (x2 >= padding.left && x2 <= padding.left + chartW) {
        ctx.moveTo(x2, padding.top);
        ctx.lineTo(x2, padding.top + chartH);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Axes Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    
    // X Labels
    for(let i=0; i<=5; i++) {
        const val = minX + (maxX - minX) * (i/5);
        ctx.fillText(val.toFixed(0), padding.left + (chartW * i)/5, H - 10);
    }
    // Y Labels
    ctx.textAlign = 'right';
    for(let i=0; i<=5; i++) {
        const val = maxY - (maxY - minY) * (i/5);
        ctx.fillText(val.toFixed(1), padding.left - 5, padding.top + (chartH * i)/5 + 3);
    }

    // Titles
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('τw (Dimensionless)', padding.left + chartW/2, H - 2);

    ctx.save();
    ctx.translate(10, H/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText('ln(y)', 0, 0);
    ctx.restore();

  }, [traces, fitResults, dimensions, bounds, colorMap, fitRange]);

  const handleSliderChange = (index: 0 | 1, value: number) => {
      const newRange = [...localRange] as [number, number];
      newRange[index] = value;
      if (index === 0 && newRange[0] >= newRange[1]) newRange[0] = newRange[1] - 1;
      if (index === 1 && newRange[1] <= newRange[0]) newRange[1] = newRange[0] + 1;
      setLocalRange(newRange);
  };

  const commitSliderChange = () => {
      if (localRange[0] !== fitRange[0] || localRange[1] !== fitRange[1]) {
          setFitRange(localRange);
      }
  };

  return (
    <div className="w-full h-full bg-white rounded-xl overflow-hidden flex flex-col">
        <style>{`
          .range-slider-thumb::-webkit-slider-thumb {
            pointer-events: auto;
            -webkit-appearance: none;
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: #2563eb;
            cursor: pointer;
            margin-top: -6px;
            position: relative;
            z-index: 50;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          }
          .range-slider-thumb::-moz-range-thumb {
            pointer-events: auto;
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: #2563eb;
            cursor: pointer;
            border: none;
            position: relative;
            z-index: 50;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          }
        `}</style>

        {/* Header with Range Sliders */}
        <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex flex-col space-y-3 z-10 shrink-0">
            <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fit Window (τ)</span>
                <div className="flex flex-col items-end">
                    <div className="flex space-x-2 text-[9px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-sm">
                       <span className="text-blue-600">S:{localRange[0].toFixed(0)}</span>
                       <span className="text-slate-300">|</span>
                       <span className="text-blue-600">E:{localRange[1].toFixed(0)}</span>
                    </div>
                </div>
            </div>
            
            <div className="relative h-6 w-full select-none">
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-200 rounded-lg -translate-y-1/2 pointer-events-none"></div>
                <div 
                  className="absolute top-1/2 h-1 bg-blue-500/30 -translate-y-1/2 pointer-events-none z-10"
                  style={{
                    left: `${(localRange[0] / maxTau) * 100}%`,
                    right: `${100 - (localRange[1] / maxTau) * 100}%`
                  }}
                ></div>

                <input 
                  type="range" 
                  min={0} 
                  max={maxTau} 
                  step={1}
                  value={localRange[0]} 
                  onChange={(e) => handleSliderChange(0, Number(e.target.value))}
                  onMouseUp={commitSliderChange}
                  onTouchEnd={commitSliderChange}
                  className="range-slider-thumb absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none z-30"
                />
                <input 
                  type="range" 
                  min={0} 
                  max={maxTau} 
                  step={1}
                  value={localRange[1]} 
                  onChange={(e) => handleSliderChange(1, Number(e.target.value))}
                  onMouseUp={commitSliderChange}
                  onTouchEnd={commitSliderChange}
                  className="range-slider-thumb absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none z-20"
                />
            </div>
        </div>

        <div ref={containerRef} className="flex-1 min-h-0 relative">
            <canvas ref={canvasRef} className="block" />
        </div>
    </div>
  );
});

export default MasterCurveChart;
