
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { GROUP_COLORS } from '../constants';

interface TemporalTrendChartProps {
  data: any[];
  field: string;
  frameField: string;
  idField: string;
}

const TemporalTrendChart: React.FC<TemporalTrendChartProps> = ({ data, field, frameField, idField }) => {
  const chartData = useMemo(() => {
    if (!field || data.length === 0) return [];

    // Group rows by track global UID
    const tracksById: Record<string, any[]> = {};
    data.forEach(row => {
      const id = row[idField];
      if (!tracksById[id]) tracksById[id] = [];
      tracksById[id].push(row);
    });

    const uniqueIds = Object.keys(tracksById);
    
    // Safety limit for Recharts SVG performance
    // Plotting thousands of tracks directly will freeze the browser.
    // We sample up to 200 tracks to give a true population view without the lag.
    const maxTracks = 200;
    const sampledIds = uniqueIds.length <= maxTracks 
      ? uniqueIds 
      : [...uniqueIds].sort(() => 0.5 - Math.random()).slice(0, maxTracks);
    
    return sampledIds.map((id) => ({
      id,
      group: tracksById[id][0].__group || 'Default',
      points: tracksById[id].sort((a, b) => Number(a[frameField]) - Number(b[frameField]))
    }));
  }, [data, field, frameField, idField]);

  // Extract condition names for color mapping
  const groupNames = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => set.add(r.__group || 'Default'));
    return Array.from(set);
  }, [data]);

  const groupToColor: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    groupNames.forEach((g, i) => { 
      map[g] = GROUP_COLORS[i % GROUP_COLORS.length]; 
    });
    return map;
  }, [groupNames]);

  return (
    <div className="h-full w-full relative">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey={frameField} 
            type="number"
            stroke="#94a3b8" 
            fontSize={10} 
            allowDuplicatedCategory={false}
            domain={['auto', 'auto']}
            label={{ value: 'Frame Index', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }}
          />
          <YAxis 
            stroke="#94a3b8" 
            fontSize={10} 
            label={{ value: field, angle: -90, position: 'insideLeft', offset: 0, fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '11px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
            itemStyle={{ padding: '2px 0' }}
          />
          {chartData.map((track) => (
            <Line 
              key={track.id}
              data={track.points}
              type="monotone"
              dataKey={field}
              stroke={groupToColor[track.group]}
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
              isAnimationActive={false} // Disable animation for performance with many lines
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* UI Overlay for status */}
      <div className="absolute top-2 right-4 pointer-events-none">
        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest bg-white/80 px-2 py-1 rounded border border-slate-100 shadow-sm">
          {data.length > 0 ? `Displaying sampled tracks (n=200)` : 'No active tracks'}
        </span>
      </div>
    </div>
  );
};

export default TemporalTrendChart;
