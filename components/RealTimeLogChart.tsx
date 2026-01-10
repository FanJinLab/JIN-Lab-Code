
import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { GROUP_COLORS } from '../constants';
import { RealTimeTrace } from '../utils/physicsFitting';

interface RealTimeLogChartProps {
  traces: RealTimeTrace[];
}

const RealTimeLogChart: React.FC<RealTimeLogChartProps> = React.memo(({ traces }) => {
  
  const { pointData, groupMap } = useMemo(() => {
    // Aggressive Sampling for Performance (Max 500 points)
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
             pData.push({ x: p.time, y: p.ln_norm, group: trace.group, id: trace.id });
         }
         globalIdx++;
      }
    });

    return { pointData: pData, groupMap: gMap };
  }, [traces]);

  const groups = groupMap.sort();
  
  // Calculate domains
  const xValues = pointData.map(p => p.x);
  const xMax = xValues.length > 0 ? Math.max(...xValues) : 100;

  return (
    <div className="w-full h-full bg-white rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex flex-col space-y-3 z-10">
            <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Real Time Decay</span>
            </div>
        </div>

        <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 10, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                    type="number" 
                    dataKey="x" 
                    name="Time" 
                    stroke="#94a3b8" 
                    fontSize={10}
                    domain={[0, 'auto']}
                    allowDataOverflow={false} 
                    label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                />
                <YAxis 
                    type="number" 
                    dataKey="y" 
                    domain={[-5, 0]} 
                    ticks={[-5, -4, -3, -2, -1, 0]}
                    allowDataOverflow={true}
                    name="ln(Norm)" 
                    stroke="#94a3b8" 
                    fontSize={10}
                    label={{ value: 'ln((I-Iend)/(I0-Iend))', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} isAnimationActive={false} />
                <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{fontSize: '9px'}} />

                {groups.map((gn, i) => {
                    const groupColor = GROUP_COLORS[i % GROUP_COLORS.length];
                    const groupPoints = pointData.filter(p => p.group === gn);
                    return (
                        <Scatter 
                            key={`rt-points-${gn}`}
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
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    </div>
  );
});

export default RealTimeLogChart;
