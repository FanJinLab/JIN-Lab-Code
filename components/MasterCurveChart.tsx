
import React, { useMemo, useState, useEffect } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { GROUP_COLORS } from '../constants';
import { TraceFitResult, TransformedTrace } from '../utils/physicsFitting';

interface MasterCurveChartProps {
  traces: TransformedTrace[];
  fitResults: TraceFitResult[];
  fitRange: [number, number];
  setFitRange: (range: [number, number]) => void;
  maxTau: number;
  threshold: number;
}

const MasterCurveChart: React.FC<MasterCurveChartProps> = React.memo(({ 
  traces, fitResults, fitRange, maxTau, threshold, setFitRange 
}) => {
  
  const [localRange, setLocalRange] = useState<[number, number]>(fitRange);

  useEffect(() => {
    setLocalRange(fitRange);
  }, [fitRange]);

  const { pointData, lineData, groupMap } = useMemo(() => {
    // 1. Aggressive Sampling for Performance (Max 500 points visible)
    const pData: any[] = [];
    const gMap: string[] = [];
    const processedGroups = new Set<string>();

    let totalPoints = 0;
    traces.forEach(t => totalPoints += t.points.length);

    const MAX_VISUAL_POINTS = 500; 
    const step = totalPoints > MAX_VISUAL_POINTS ? Math.ceil(totalPoints / MAX_VISUAL_POINTS) : 1;
    let globalIdx = 0;

    traces.forEach((trace) => {
      if (!processedGroups.has(trace.group)) {
        processedGroups.add(trace.group);
        gMap.push(trace.group);
      }

      for (let i = 0; i < trace.points.length; i++) {
         if (globalIdx % step === 0) {
             const p = trace.points[i];
             pData.push({ x: p.tau_w, y: p.ln_y, group: trace.group, id: trace.id });
         }
         globalIdx++;
      }
    });

    const lData: any[] = [];
    fitResults.forEach(res => {
        lData.push({
            group: res.group,
            data: res.fitLine.map(p => ({ x: p.tau_w, y: p.ln_y }))
        });
    });

    return { pointData: pData, lineData: lData, groupMap: gMap };
  }, [traces, fitResults]);

  const groups = groupMap.sort();
  
  const yMin = -5;
  const yMax = 0;
  
  // X Domain STRICTLY follows fitRange (Auto-adapted in parent or set by user)
  const xMin = fitRange[0];
  const xMax = fitRange[1];

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
        <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex flex-col space-y-3 z-10">
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

        <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 10, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                    type="number" 
                    dataKey="x" 
                    name="Dimensionless Time" 
                    stroke="#94a3b8" 
                    fontSize={10}
                    domain={[xMin, xMax]}
                    allowDataOverflow={true} 
                    label={{ value: 'τw', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                />
                <YAxis 
                    type="number" 
                    dataKey="y" 
                    domain={[yMin, yMax]} 
                    ticks={[-5, -4, -3, -2, -1, 0]}
                    allowDataOverflow={true}
                    name="ln(y)" 
                    stroke="#94a3b8" 
                    fontSize={10}
                    label={{ value: 'ln(y)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} isAnimationActive={false} />
                <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{fontSize: '9px'}} />

                {groups.map((gn, i) => {
                    const groupColor = GROUP_COLORS[i % GROUP_COLORS.length];
                    const groupPoints = pointData.filter(p => p.group === gn);
                    return (
                        <Scatter 
                            key={`points-${gn}`}
                            name={`${gn}`} 
                            data={groupPoints} 
                            fill={groupColor} 
                            fillOpacity={0.3}
                            line={false}
                            isAnimationActive={false}
                            shape="circle" 
                            legendType="circle"
                        />
                    );
                })}

                {lineData.map((line, i) => {
                    const gIndex = groups.indexOf(line.group);
                    const groupColor = GROUP_COLORS[gIndex % GROUP_COLORS.length];
                    return (
                        <Scatter
                            key={`line-${i}`}
                            data={line.data}
                            line={{ stroke: groupColor, strokeWidth: 1, strokeOpacity: 0.5 }} 
                            shape={() => null} 
                            legendType="none"
                            isAnimationActive={false}
                            name={`${line.group} (Fit)`}
                        />
                    );
                })}
                
                <ReferenceLine x={fitRange[0]} stroke="black" strokeDasharray="3 3" />
                <ReferenceLine x={fitRange[1]} stroke="black" strokeDasharray="3 3" />
                
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    </div>
  );
});

export default MasterCurveChart;
