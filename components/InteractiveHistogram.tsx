
import React, { useMemo, useRef, useState } from 'react';
import { GROUP_COLORS } from '../constants';
import { TrajectoryFeature } from '../types';

interface InteractiveHistogramProps {
  features: TrajectoryFeature[]; 
  field: string;
  mode: 'first' | 'last' | 'mean' | 'min' | 'max' | 'variance' | 'cv';
  scale: 'linear' | 'log';
  range: [number, number];
  onRangeChange: (range: [number, number]) => void;
  colorMap?: Record<string, string>;
}

const InteractiveHistogram: React.FC<InteractiveHistogramProps> = ({ 
  features, field, mode, scale, range, onRangeChange, colorMap 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);

  const dataPoints = useMemo(() => {
    return features.map(f => {
      const val = f.stats[field]?.[mode];
      return { val, group: f.group };
    }).filter(p => p.val !== undefined && !isNaN(p.val) && p.val !== null);
  }, [features, field, mode]);

  const bounds = useMemo(() => {
    if (dataPoints.length === 0) return { min: 0, max: 1 };
    let min = dataPoints[0].val;
    let max = dataPoints[0].val;
    dataPoints.forEach(p => {
      if (p.val < min) min = p.val;
      if (p.val > max) max = p.val;
    });
    const buffer = (max - min) * 0.05 || 1;
    return { min, max: max + buffer };
  }, [dataPoints]);

  const bins = useMemo(() => {
    const binCount = 40;
    const groups = Array.from(new Set(dataPoints.map(p => p.group))) as string[];
    let minVal = bounds.min;
    let maxVal = bounds.max;

    if (scale === 'log') {
      minVal = Math.max(minVal, 0.0001);
      const logMin = Math.log10(minVal);
      const logMax = Math.log10(maxVal);
      const logStep = (logMax - logMin) / binCount;
      
      const b = Array.from({ length: binCount }, (_, i) => {
        const binStart = Math.pow(10, logMin + i * logStep);
        const binEnd = Math.pow(10, logMin + (i + 1) * logStep);
        const res: any = { start: binStart, end: binEnd };
        groups.forEach(g => { res[g] = 0; });
        return res;
      });

      dataPoints.forEach(p => {
        const pVal = Math.max(p.val, 0.0001);
        const idx = Math.min(Math.floor((Math.log10(pVal) - logMin) / logStep), binCount - 1);
        if (b[idx]) b[idx][p.group]++;
      });
      return b;
    } else {
      const step = (maxVal - minVal) / binCount || 1;
      const b = Array.from({ length: binCount }, (_, i) => {
        const res: any = { start: minVal + i * step, end: minVal + (i + 1) * step };
        groups.forEach(g => { res[g] = 0; });
        return res;
      });

      dataPoints.forEach(p => {
        const idx = Math.min(Math.floor((p.val - minVal) / step), binCount - 1);
        if (b[idx] && b[idx][p.group] !== undefined) b[idx][p.group]++;
      });
      return b;
    }
  }, [dataPoints, bounds, scale]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;

    let newValue: number;
    if (scale === 'log') {
      const minVal = Math.max(bounds.min, 0.0001);
      const logMin = Math.log10(minVal);
      const logMax = Math.log10(bounds.max);
      newValue = Math.pow(10, logMin + pct * (logMax - logMin));
    } else {
      newValue = bounds.min + pct * (bounds.max - bounds.min);
    }

    if (dragging === 'min') onRangeChange([Math.min(newValue, range[1]), range[1]]);
    else onRangeChange([range[0], Math.max(newValue, range[0])]);
  };

  const getXPos = (val: number) => {
    if (!containerRef.current) return 0;
    const w = containerRef.current.clientWidth;
    if (scale === 'log') {
      const minVal = Math.max(bounds.min, 0.0001);
      const logMin = Math.log10(minVal);
      const logMax = Math.log10(bounds.max);
      const logVal = Math.log10(Math.max(val, 0.0001));
      return ((logVal - logMin) / (logMax - logMin)) * w;
    }
    const rangeVal = bounds.max - bounds.min;
    return rangeVal === 0 ? 0 : ((val - bounds.min) / rangeVal) * w;
  };

  const maxFreq = Math.max(...bins.map(b => {
    return Object.keys(b).filter(k => k !== 'start' && k !== 'end').reduce((sum, k) => sum + b[k], 0);
  }), 1);

  const groupNames = Array.from(new Set(dataPoints.map(p => p.group))) as string[];

  return (
    <div className="flex flex-col h-full w-full">
      <div 
        ref={containerRef}
        className="relative flex-1 bg-slate-50 border border-slate-200 rounded-xl cursor-crosshair select-none"
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
      >
        <div className="absolute inset-0 overflow-hidden rounded-xl">
             <svg className="absolute inset-0 w-full h-full">
            {bins.map((b, i) => {
                let currentY = 100;
                const x = (i / bins.length) * 100;
                const width = (1 / bins.length) * 100;
                return groupNames.map((gn, gi) => {
                const freq = b[gn] || 0;
                const h = (freq / maxFreq) * 90;
                const barColor = colorMap ? colorMap[gn] : GROUP_COLORS[gi % GROUP_COLORS.length];
                const bar = (
                    <rect 
                    key={`${i}-${gn}`}
                    x={`${x}%`} 
                    y={`${currentY - h}%`} 
                    width={`${width}%`} 
                    height={`${h}%`} 
                    fill={barColor} 
                    opacity={0.7}
                    />
                );
                currentY -= h;
                return bar;
                });
            })}
            </svg>
        </div>

        {/* Handles rendered OUTSIDE the overflow-hidden container to prevent clipping */}
        <div 
          className="absolute top-0 bottom-0 w-1 bg-blue-600 cursor-ew-resize group z-20 hover:w-1.5 transition-all"
          style={{ left: getXPos(range[0]) }}
          onMouseDown={() => setDragging('min')}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap shadow-md -translate-y-full">
            Min: {range[0].toFixed(2)}
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-600 rounded-full shadow border border-white"></div>
        </div>
        <div 
          className="absolute top-0 bottom-0 w-1 bg-blue-600 cursor-ew-resize group z-20 hover:w-1.5 transition-all"
          style={{ left: getXPos(range[1]) }}
          onMouseDown={() => setDragging('max')}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap shadow-md -translate-y-full">
            Max: {range[1].toFixed(2)}
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-600 rounded-full shadow border border-white"></div>
        </div>
        
        {/* Shading for excluded regions */}
        <div className="absolute top-0 bottom-0 left-0 bg-slate-900/10 pointer-events-none" style={{ width: getXPos(range[0]) }}></div>
        <div className="absolute top-0 bottom-0 right-0 bg-slate-900/10 pointer-events-none" style={{ left: getXPos(range[1]) }}></div>
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-mono">
        <span>{bounds.min.toFixed(1)}</span>
        <span className="text-blue-600 font-bold">Window: [{range[0].toFixed(2)} - {range[1].toFixed(2)}]</span>
        <span>{bounds.max.toFixed(1)}</span>
      </div>
    </div>
  );
};

export default InteractiveHistogram;
