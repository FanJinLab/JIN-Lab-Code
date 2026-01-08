
import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Legend } from 'recharts';
import { GROUP_COLORS } from '../constants';

interface ScatterPlotGUVProps {
  id: string;
  features: any[]; // TrajectoryFeature[]
  xField: string;
  yField: string;
  xMode: string;
  yMode: string;
  visibleGroups: Set<string>;
}

const ScatterPlotGUV: React.FC<ScatterPlotGUVProps> = ({ id, features, xField, yField, xMode, yMode, visibleGroups }) => {
  const chartData = useMemo(() => {
    const dataByGroup: Record<string, any[]> = {};
    features.forEach(f => {
      if (!visibleGroups.has(f.group)) return;
      const xVal = f.stats[xField]?.[xMode];
      const yVal = f.stats[yField]?.[yMode];
      if (xVal !== undefined && yVal !== undefined) {
        if (!dataByGroup[f.group]) dataByGroup[f.group] = [];
        dataByGroup[f.group].push({ x: xVal, y: yVal, id: f.id });
      }
    });
    return dataByGroup;
  }, [features, xField, yField, xMode, yMode, visibleGroups]);

  const groupNames = Array.from(visibleGroups);

  return (
    <div id={id} className="w-full h-full bg-white">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis 
            type="number" 
            dataKey="x" 
            name={`${xField} (${xMode})`} 
            stroke="#94a3b8" 
            fontSize={11}
            label={{ value: `${xField} (${xMode})`, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#94a3b8' }}
          />
          <YAxis 
            type="number" 
            dataKey="y" 
            name={`${yField} (${yMode})`} 
            stroke="#94a3b8" 
            fontSize={11}
            label={{ value: `${yField} (${yMode})`, angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#94a3b8' }}
          />
          <ZAxis type="number" range={[20, 20]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Legend verticalAlign="top" height={36} />
          {groupNames.map((gn, i) => (
            <Scatter 
              key={gn}
              name={gn} 
              data={chartData[gn] || []} 
              fill={GROUP_COLORS[i % GROUP_COLORS.length]} 
              fillOpacity={0.7} 
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ScatterPlotGUV;
