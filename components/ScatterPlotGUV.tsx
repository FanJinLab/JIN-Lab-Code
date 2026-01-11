
import React, { useMemo, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Legend } from 'recharts';
import { GROUP_COLORS } from '../constants';
import { calculatePearsonCorrelation } from '../utils/dataProcess';

interface ScatterPlotGUVProps {
  data: { x: number; y: number; group: string; id: string }[];
  xLabel: string;
  yLabel: string;
  visibleGroups: Set<string>;
  xRange: { min: number; max: number; auto: boolean };
  yRange: { min: number; max: number; auto: boolean };
}

const ScatterPlotGUV: React.FC<ScatterPlotGUVProps> = ({ data, xLabel, yLabel, visibleGroups, xRange, yRange }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    const dataByGroup: Record<string, { x: number; y: number; group: string; id: string }[]> = {};
    data.forEach(d => {
      if (!visibleGroups.has(d.group)) return;
      if (!dataByGroup[d.group]) dataByGroup[d.group] = [];
      dataByGroup[d.group].push(d);
    });
    return dataByGroup;
  }, [data, visibleGroups]);

  // Calculate Overall Pearson Correlation for displayed data
  const correlation = useMemo(() => {
      const allX: number[] = [];
      const allY: number[] = [];
      Object.values(chartData).forEach((groupPoints: any) => {
          groupPoints.forEach((p: any) => {
              allX.push(p.x);
              allY.push(p.y);
          });
      });
      return calculatePearsonCorrelation(allX, allY);
  }, [chartData]);

  const groupNames = Array.from(visibleGroups).filter(g => chartData[g]?.length > 0);

  const handleExport = () => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;

    // Serialize SVG
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        // Scale up for better resolution
        const scale = 2; 
        canvas.width = svg.clientWidth * scale;
        canvas.height = svg.clientHeight * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.scale(scale, scale);
            // Fill white background (transparent SVGs turn black in PNG otherwise)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, svg.clientWidth, svg.clientHeight);
            ctx.drawImage(img, 0, 0);
            
            const pngUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = `scatter_correlation_${new Date().getTime()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="w-full h-full bg-white relative" ref={containerRef}>
      {/* Controls Overlay */}
      <div className="absolute top-2 right-12 z-10 flex space-x-2">
          {/* Correlation Badge */}
          <div className="bg-white/90 px-3 py-1 rounded-lg border border-slate-200 shadow-sm text-xs flex items-center">
             <span className="text-slate-500 font-bold mr-2">Pearson r:</span>
             <span className={`font-mono font-black ${Math.abs(correlation) > 0.7 ? 'text-blue-600' : 'text-slate-900'}`}>
               {correlation.toFixed(4)}
             </span>
          </div>

          {/* Export Button */}
          <button 
             onClick={handleExport}
             className="bg-white/90 hover:bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-bold shadow-sm transition-all flex items-center space-x-1"
          >
             <span>📷</span><span>Export</span>
          </button>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis 
            type="number" 
            dataKey="x" 
            name={xLabel}
            stroke="#94a3b8" 
            fontSize={11}
            tickFormatter={(val) => val > 1000 ? val.toExponential(1) : val.toFixed(2)}
            label={{ value: xLabel, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#94a3b8' }}
            domain={xRange.auto ? ['auto', 'auto'] : [xRange.min, xRange.max]}
            allowDataOverflow={!xRange.auto}
          />
          <YAxis 
            type="number" 
            dataKey="y" 
            name={yLabel}
            stroke="#94a3b8" 
            fontSize={11}
             tickFormatter={(val) => val > 1000 ? val.toExponential(1) : val.toFixed(2)}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#94a3b8' }}
            domain={yRange.auto ? ['auto', 'auto'] : [yRange.min, yRange.max]}
            allowDataOverflow={!yRange.auto}
          />
          <ZAxis type="number" range={[30, 30]} />
          <Tooltip 
            cursor={{ strokeDasharray: '3 3' }} 
            contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
          />
          <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize: '10px', fontWeight: 'bold'}} />
          {groupNames.map((gn, i) => (
            <Scatter 
              key={gn}
              name={gn} 
              data={chartData[gn] || []} 
              fill={GROUP_COLORS[i % GROUP_COLORS.length]} 
              fillOpacity={0.6} 
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ScatterPlotGUV;
