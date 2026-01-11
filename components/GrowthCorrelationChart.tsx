
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { GROUP_COLORS } from '../constants';

interface Point {
  x: number;
  y: number;
  group: string;
}

interface GrowthCorrelationChartProps {
  data: Point[];
  xLabel: string;
  yLabel: string;
  colorMap?: Record<string, string>;
}

const GrowthCorrelationChart: React.FC<GrowthCorrelationChartProps> = React.memo(({ data, xLabel, yLabel, colorMap }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const bounds = useMemo(() => {
    if (data.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    let minX = data[0].x, maxX = data[0].x;
    let minY = data[0].y, maxY = data[0].y;
    
    data.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });
    
    const xPad = (maxX - minX) * 0.1 || (minX === 0 ? 1 : Math.abs(minX) * 0.1);
    const yPad = (maxY - minY) * 0.1 || 0.1;
    
    return { minX: minX - xPad, maxX: maxX + xPad, minY: Math.max(0, minY - yPad), maxY: maxY + yPad };
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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

    if (data.length === 0) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NO DATA', dimensions.width/2, dimensions.height/2);
        return;
    }

    const { minX, maxX, minY, maxY } = bounds;
    const W = dimensions.width;
    const H = dimensions.height;
    const padding = { left: 50, right: 20, top: 20, bottom: 40 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    const toX = (val: number) => padding.left + ((val - minX) / (maxX - minX)) * chartW;
    const toY = (val: number) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;

    // Axes
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Y
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    // X
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.stroke();

    // Data Points
    const byGroup: Record<string, Point[]> = {};
    data.forEach(p => {
        if (!byGroup[p.group]) byGroup[p.group] = [];
        byGroup[p.group].push(p);
    });

    Object.keys(byGroup).sort().forEach((g, i) => {
        const color = colorMap ? colorMap[g] : GROUP_COLORS[i % GROUP_COLORS.length];
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        
        // Draw points
        byGroup[g].forEach(p => {
             const px = toX(p.x);
             const py = toY(p.y);
             
             ctx.beginPath();
             ctx.arc(px, py, 3, 0, 2 * Math.PI);
             ctx.fill();
        });
        ctx.globalAlpha = 1.0;
    });

    // Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    
    // X
    for(let i=0; i<=5; i++) {
        const val = minX + (maxX - minX) * (i/5);
        ctx.fillText(val.toExponential(1), padding.left + (chartW * i)/5, H - 10);
    }
    // Y
    ctx.textAlign = 'right';
    for(let i=0; i<=5; i++) {
        const val = maxY - (maxY - minY) * (i/5);
        ctx.fillText(val.toFixed(2), padding.left - 5, padding.top + (chartH * i)/5 + 3);
    }
    
    // Axis Titles
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(`${xLabel} (Last Frame)`, padding.left + chartW/2, H + 5 - padding.bottom/2);

    ctx.save();
    ctx.translate(15, H/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

  }, [data, dimensions, bounds, colorMap, xLabel, yLabel]);

  return (
    <div className="w-full h-full bg-white rounded-xl overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center shrink-0">
         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End-State Correlation</span>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 relative bg-white">
          <canvas ref={canvasRef} className="block" />
      </div>
    </div>
  );
});

export default GrowthCorrelationChart;
