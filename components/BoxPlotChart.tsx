
import React, { useMemo } from 'react';
import { GROUP_COLORS } from '../constants';

interface BoxPlotChartProps {
  data: { group: string; values: number[] }[];
}

const BoxPlotChart: React.FC<BoxPlotChartProps> = ({ data }) => {
  const stats = useMemo(() => {
    return data.map(d => {
      const sorted = [...d.values].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
      const q2 = sorted[Math.floor(sorted.length * 0.5)] || 0;
      const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
      const min = sorted[0] || 0;
      const max = sorted[sorted.length - 1] || 0;
      const mean = d.values.length > 0 ? d.values.reduce((a, b) => a + b, 0) / d.values.length : 0;
      return { group: d.group, min, q1, q2, q3, max, mean, count: d.values.length };
    });
  }, [data]);

  const globalMax = stats.length > 0 ? Math.max(...stats.map(s => s.max), 1) : 100;
  const globalMin = stats.length > 0 ? Math.min(...stats.map(s => s.min), 0) : 0;
  const range = (globalMax - globalMin) || 1;

  const getY = (val: number) => 100 - (((val - globalMin) / range) * 80 + 10);

  const getPValueStars = (s1: any, s2: any) => {
    if (!s1 || !s2 || s1.count < 3 || s2.count < 3) return "";
    const diff = Math.abs(s1.mean - s2.mean);
    const spread = (s1.q3 - s1.q1) + (s2.q3 - s2.q1);
    if (diff > spread * 1.5) return "***";
    if (diff > spread) return "**";
    if (diff > spread * 0.5) return "*";
    return "ns";
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 relative border-l border-b border-slate-200 ml-12 mb-12">
        <div className="absolute -left-12 top-0 bottom-0 flex flex-col justify-between text-[10px] text-slate-400 font-mono py-1">
          <span>{globalMax.toFixed(1)}</span>
          <span>{((globalMax + globalMin) / 2).toFixed(1)}</span>
          <span>{globalMin.toFixed(1)}</span>
        </div>

        <div className="absolute inset-0 flex justify-around items-end px-4">
          {stats.map((s, i) => {
            const boxTop = getY(s.q3);
            const boxBottom = getY(s.q1);
            const boxHeight = Math.max(2, Math.abs(boxBottom - boxTop));
            const medianPos = ((getY(s.q2) - boxTop) / (boxHeight || 1)) * 100;

            return (
              <div key={s.group} className="relative flex flex-col items-center h-full" style={{ width: `${100 / (stats.length || 1)}%` }}>
                <div className="absolute w-0.5 bg-slate-200" style={{ top: `${getY(s.max)}%`, height: `${Math.abs(getY(s.min) - getY(s.max))}%` }}></div>
                <div className="absolute w-4 h-0.5 bg-slate-200" style={{ top: `${getY(s.max)}%` }}></div>
                <div className="absolute w-4 h-0.5 bg-slate-200" style={{ top: `${getY(s.min)}%` }}></div>
                
                <div className="absolute w-12 border-2 rounded shadow-sm transition-all z-10" style={{ top: `${boxTop}%`, height: `${boxHeight}%`, backgroundColor: `${GROUP_COLORS[i % GROUP_COLORS.length]}33`, borderColor: GROUP_COLORS[i % GROUP_COLORS.length] }}>
                  <div className="absolute w-full h-0.5 bg-slate-900 opacity-60" style={{ top: `${medianPos}%` }}></div>
                </div>

                <div className="absolute w-2 h-2 rounded-full bg-white border-2 border-slate-900 z-20" style={{ top: `${getY(s.mean)}%`, transform: 'translateY(-50%)' }}></div>

                <div className="absolute -bottom-10 text-[10px] font-black text-slate-600 truncate w-full text-center">
                  {s.group}
                  <div className="text-[8px] text-slate-400 font-normal">n={s.count}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BoxPlotChart;
