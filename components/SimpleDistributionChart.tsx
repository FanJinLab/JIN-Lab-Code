import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { GROUP_COLORS } from '../constants';

interface SimpleDistributionChartProps {
  data: { group: string; value: number }[];
  title: string;
  unit?: string;
}

const SimpleDistributionChart: React.FC<SimpleDistributionChartProps> = ({ data, title, unit }) => {
  
  const histogramData = useMemo(() => {
    if (data.length === 0) return { bins: [], groups: [] };

    const values = data.map(d => d.value).filter(v => !isNaN(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Create 10 bins
    const binCount = 10;
    const step = (max - min) / binCount || 1;
    
    // Initialize bins
    const bins = Array.from({ length: binCount }, (_, i) => {
       const start = min + i * step;
       const end = min + (i + 1) * step;
       const binLabel = `${start.toExponential(1)}`;
       return { name: binLabel, rangeStart: start, rangeEnd: end };
    });

    // Populate bins per group
    const groups = Array.from(new Set(data.map(d => d.group)));
    
    data.forEach(d => {
       const val = d.value;
       const binIndex = Math.min(Math.floor((val - min) / step), binCount - 1);
       if (bins[binIndex]) {
          // @ts-ignore
          bins[binIndex][d.group] = (bins[binIndex][d.group] || 0) + 1;
       }
    });

    return { bins, groups };
  }, [data]);

  if (data.length === 0) return <div className="flex items-center justify-center h-full text-xs text-slate-300">No data available</div>;

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{title}</h4>
       <div className="flex-1 min-h-[150px]">
         <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData.bins} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
               <CartesianGrid strokeDasharray="3 3" vertical={false} />
               <XAxis dataKey="name" fontSize={9} tickFormatter={(val) => val} interval={1} />
               <YAxis fontSize={9} allowDecimals={false} />
               <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{fontSize: '10px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
               />
               <Legend iconSize={8} wrapperStyle={{fontSize: '9px'}} />
               {histogramData.groups.map((grp, i) => (
                  <Bar 
                    key={grp} 
                    dataKey={grp} 
                    stackId="a" 
                    fill={GROUP_COLORS[i % GROUP_COLORS.length]} 
                  />
               ))}
            </BarChart>
         </ResponsiveContainer>
       </div>
    </div>
  );
};

export default SimpleDistributionChart;