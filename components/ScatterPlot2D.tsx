
import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Legend } from 'recharts';
import { GROUP_COLORS } from '../constants';

interface ScatterPlot2DProps {
  data: any[];
  xField: string;
  yField: string;
}

const ScatterPlot2D: React.FC<ScatterPlot2DProps> = ({ data, xField, yField }) => {
  const groupedData = useMemo(() => {
    if (!xField || !yField || data.length === 0) return {};
    
    // Sampling for performance
    const sampleSize = 5000;
    const step = Math.max(1, Math.floor(data.length / sampleSize));
    
    const groups: Record<string, {x: number, y: number}[]> = {};
    for (let i = 0; i < data.length; i += step) {
      const row = data[i];
      const g = row.__group || 'Default';
      const x = Number(row[xField]);
      const y = Number(row[yField]);
      if (!isNaN(x) && !isNaN(y)) {
        if (!groups[g]) groups[g] = [];
        groups[g].push({ x, y });
      }
    }
    return groups;
  }, [data, xField, yField]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis 
          type="number" 
          dataKey="x" 
          name={xField} 
          stroke="#64748b" 
          fontSize={12}
          label={{ value: xField, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#94a3b8' }}
        />
        <YAxis 
          type="number" 
          dataKey="y" 
          name={yField} 
          stroke="#64748b" 
          fontSize={12}
          label={{ value: yField, angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
        />
        <ZAxis type="number" range={[16, 16]} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
        <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
        {Object.keys(groupedData).map((gn, i) => (
          <Scatter 
            key={gn}
            name={gn} 
            data={groupedData[gn]} 
            fill={GROUP_COLORS[i % GROUP_COLORS.length]} 
            fillOpacity={0.6} 
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
};

export default ScatterPlot2D;
