
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { GROUP_COLORS } from '../constants';
import { safeMin, safeMax } from '../utils/dataProcess';

interface TemporalTrendChartProps {
  data: any[];
  field: string;
  frameField: string;
  idField: string;
  colorMap?: Record<string, string>;
}

const TemporalTrendChart: React.FC<TemporalTrendChartProps> = React.memo(({ data, field, frameField, idField, colorMap }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Group and sort data once
  const processedTracks = useMemo(() => {
    if (!field || data.length === 0) return [];
    
    // Safety check: Limit max tracks if really excessive, but Canvas can handle 10k+ easily.
    // Let's set a high limit just in case of millions.
    const maxTracks = 10000; 

    const tracksById: Record<string, any[]> = {};
    data.forEach(row => {
      const id = row[idField];
      if (!tracksById[id]) tracksById[id] = [];
      tracksById[id].push(row);
    });

    const uniqueIds = Object.keys(tracksById).slice(0, maxTracks);
    
    return uniqueIds.map(id => ({
        id,
        group: tracksById[id][0].__group || 'Default',
        points: tracksById[id]
           .map(r => ({ x: Number(r[frameField]), y: Number(r[field]) }))
           .filter(p => !isNaN(p.x) && !isNaN(p.y))
           .sort((a, b) => a.x - b.x)
    }));

  }, [data, field, frameField, idField]);

  // Calculate Bounds
  const bounds = useMemo(() => {
      if(processedTracks.length === 0) return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
      
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      
      processedTracks.forEach(t => {
          if (t.points.length === 0) return;
          const xs = t.points.map(p => p.x);
          const ys = t.points.map(p => p.y);
          minX = Math.min(minX, safeMin(xs));
          maxX = Math.max(maxX, safeMax(xs));
          minY = Math.min(minY, safeMin(ys));
          maxY = Math.max(maxY, safeMax(ys));
      });
      
      if(minX === Infinity) minX = 0;
      if(maxX === -Infinity) maxX = 100;
      if(minY === Infinity) minY = 0;
      if(maxY === -Infinity) maxY = 100;
      
      // Add padding
      const xPad = (maxX - minX) * 0.05;
      const yPad = (maxY - minY) * 0.05;

      return { minX: minX - xPad, maxX: maxX + xPad, minY: minY - yPad, maxY: maxY + yPad };
  }, [processedTracks]);

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

  // Draw Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle Retina Display
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    if (processedTracks.length === 0) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NO DATA TO DISPLAY', dimensions.width/2, dimensions.height/2);
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

    // Draw Grid & Axes
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Vertical Grid
    for(let i=0; i<=5; i++) {
        const x = padding.left + (chartW * i) / 5;
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + chartH);
    }
    // Horizontal Grid
    for(let i=0; i<=5; i++) {
        const y = padding.top + (chartH * i) / 5;
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
    }
    ctx.stroke();

    // Draw Tracks
    ctx.lineWidth = 1;
    processedTracks.forEach(track => {
        if(track.points.length < 2) return;
        ctx.strokeStyle = (colorMap && colorMap[track.group]) ? colorMap[track.group] : GROUP_COLORS[0];
        // Reduce opacity slightly for density
        ctx.globalAlpha = 0.6; 
        
        ctx.beginPath();
        ctx.moveTo(toX(track.points[0].x), toY(track.points[0].y));
        for(let i=1; i<track.points.length; i++) {
            ctx.lineTo(toX(track.points[i].x), toY(track.points[i].y));
        }
        ctx.stroke();
    });
    ctx.globalAlpha = 1.0;

    // Draw Axis Labels (Simple)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    
    // X Axis Labels
    for(let i=0; i<=5; i++) {
        const val = minX + (maxX - minX) * (i/5);
        const x = padding.left + (chartW * i) / 5;
        ctx.fillText(val.toFixed(0), x, H - 10);
    }
    
    // Y Axis Labels
    ctx.textAlign = 'right';
    for(let i=0; i<=5; i++) {
        const val = maxY - (maxY - minY) * (i/5);
        const y = padding.top + (chartH * i) / 5;
        ctx.fillText(val.toPrecision(3), padding.left - 5, y + 3);
    }

    // Axis Titles
    ctx.save();
    ctx.translate(10, H/2);
    ctx.rotate(-Math.PI/2);
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(field, 0, 0);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('Frame Index', padding.left + chartW/2, H - 2);

  }, [processedTracks, dimensions, bounds, colorMap, field]);

  return (
    <div ref={containerRef} className="h-full w-full relative bg-white">
      <canvas ref={canvasRef} className="block" />
      <div className="absolute top-2 right-4 pointer-events-none z-10">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white/90 px-3 py-1 rounded-full border border-slate-200 shadow-sm backdrop-blur-sm">
          {processedTracks.length} Tracks (Canvas)
        </span>
      </div>
    </div>
  );
});

export default TemporalTrendChart;
