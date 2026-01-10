
import React, { useState, useMemo, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import { CSVRow, ColumnMapping, GroupingConfig, TrajectoryFeature } from './types';
import { GROUP_COLORS } from './constants';
import TemporalTrendChart from './components/TemporalTrendChart';
import InteractiveHistogram from './components/InteractiveHistogram';
import BoxPlotChart from './components/BoxPlotChart';
import ScatterPlotGUV from './components/ScatterPlotGUV';
import MasterCurveChart from './components/MasterCurveChart';
import RealTimeLogChart from './components/RealTimeLogChart';
import SimpleDistributionChart from './components/SimpleDistributionChart';
import { applyCleaning } from './utils/dataProcess';
import { transformTraceData, transformRealTimeLogData, fitTraceData, TraceFitResult } from './utils/physicsFitting';

interface FilterStep {
  id: string;
  field: string;
  mode: 'first' | 'last' | 'mean' | 'min' | 'max' | 'variance' | 'cv';
  range: [number, number];
}

const App: React.FC = () => {
  const [currentTab, setTab] = useState('import');
  const [sessionKey, setSessionKey] = useState(0); 
  const [rawData, setRawData] = useState<CSVRow[]>([]);
  const [numericFields, setNumericFields] = useState<string[]>([]);
  
  // Physics Parameters (Page 3)
  const [pwValue, setPwValue] = useState(0.0034);
  const [fitBgValue, setFitBgValue] = useState(0.0);
  const [fitThreshold, setFitThreshold] = useState(0.001); 
  const [frameInterval, setFrameInterval] = useState(600.0); // Default dt = 600s as requested
  const [fitMapping, setFitMapping] = useState({
    intensity: '',
    radius: ''
  });
  const [fitSelectedGroups, setFitSelectedGroups] = useState<Set<string>>(new Set());
  
  // Fit Range: Start with a "pristine" state that allows auto-scaling
  const [fitRange, setFitRange] = useState<[number, number]>([0, 0]);
  const [fitResults, setFitResults] = useState<TraceFitResult[]>([]);
  const [isFitting, setIsFitting] = useState(false);

  // Grouping State
  const [xyCounts, setXYCounts] = useState<Record<string, number>>({});
  const [uniqueXYs, setUniqueXYs] = useState<string[]>([]);
  const [groupings, setGroupings] = useState<GroupingConfig>({});
  const [newGroupName, setNewGroupName] = useState('');
  
  // Filtering States
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set());
  const [histField, setHistField] = useState<string>('');
  const [histMode, setHistMode] = useState<'first' | 'last' | 'mean' | 'min' | 'max' | 'variance' | 'cv'>('mean');
  const [histScale, setHistScale] = useState<'linear' | 'log'>('linear');
  const [histRange, setHistRange] = useState<[number, number]>([0, 0]);
  const [appliedFilters, setAppliedFilters] = useState<FilterStep[]>([]);

  // Analytics State
  const [analyticsField, setAnalyticsField] = useState<string>('');
  const [analyticsMode, setAnalyticsMode] = useState<'first' | 'last' | 'mean' | 'variance' | 'cv'>('mean');
  const [analyticsXField, setAnalyticsXField] = useState<string>('');
  const [analyticsYField, setAnalyticsYField] = useState<string>('');
  const [analyticsXMode, setAnalyticsXMode] = useState<'first' | 'last' | 'mean' | 'variance' | 'cv'>('mean');
  const [analyticsYMode, setAnalyticsYMode] = useState<'first' | 'last' | 'mean' | 'variance' | 'cv'>('mean');
  const [analyticsVisibleGroups, setAnalyticsVisibleGroups] = useState<Set<string>>(new Set());

  const [mapping, setMapping] = useState<ColumnMapping>({
    id: '__uid',
    frames: 'Frame',
    xy: 'XY',
    sequence: 'Sequence',
    dt: 1,
    intensityFields: [],
    geometryFields: []
  });

  const resetSession = (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const confirmed = window.confirm("Are you sure you want to end this session? All current data and filters will be cleared.");
    if (!confirmed) return;

    setRawData([]);
    setNumericFields([]);
    setXYCounts({});
    setUniqueXYs([]);
    setGroupings({});
    setVisibleGroups(new Set());
    setAppliedFilters([]);
    setAnalyticsVisibleGroups(new Set());
    setSessionKey(prev => prev + 1);
    setFitResults([]);
    setFitRange([0, 0]);
    setTab('import');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) return;
      
      const headers = lines[0].split(',').map(h => h.trim());
      const xyColName = headers[0];
      const seqColName = headers[1];
      const idColName = headers[2];
      const frameColName = headers[3];
      const channelFields = headers.slice(4);

      const tempRows: CSVRow[] = [];
      const xyTrackMap: Record<string, Set<number>> = {};
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row: CSVRow = {};
        headers.forEach((header, j) => {
          const rawVal = values[j]?.trim();
          const num = Number(rawVal);
          row[header] = (!isNaN(num) && rawVal !== '') ? num : rawVal;
        });
        
        const xyVal = String(row[xyColName]);
        const trackId = Number(row[idColName]);
        const uid = `${xyVal}_${trackId}`;
        row.__uid = uid;
        if (!xyTrackMap[xyVal]) xyTrackMap[xyVal] = new Set();
        xyTrackMap[xyVal].add(trackId);
        tempRows.push(row);
      }

      setXYCounts(Object.fromEntries(Object.entries(xyTrackMap).map(([k, v]) => [k, v.size])));
      setNumericFields(channelFields);
      setRawData(tempRows);
      setUniqueXYs(Object.keys(xyTrackMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
      setMapping({ xy: xyColName, sequence: seqColName, id: '__uid', frames: frameColName, dt: 1, intensityFields: channelFields, geometryFields: [] });
      
      // Auto-set fitting defaults
      setFitMapping({
        intensity: channelFields[0] || '',
        radius: channelFields.find(f => f.toLowerCase().includes('radius')) || channelFields[2] || ''
      });

      setHistField(channelFields[0]);
      setAnalyticsField(channelFields[0]);
      setAnalyticsXField(channelFields[0]);
      setAnalyticsYField(channelFields[1] || channelFields[0]);
      setTab('import');
    };
    reader.readAsText(file);
  };

  const dataWithGroups = useMemo(() => {
    const xyToGroupMap: Record<string, string> = {};
    (Object.entries(groupings) as [string, string[]][]).forEach(([groupName, xys]) => {
      xys.forEach(xy => { xyToGroupMap[xy] = groupName; });
    });
    return rawData
      .map(row => ({ ...row, __group: xyToGroupMap[String(row[mapping.xy])] }))
      .filter(row => row.__group !== undefined);
  }, [rawData, groupings, mapping.xy]);

  const cleanedData = useMemo(() => applyCleaning(dataWithGroups, mapping, { dropMissing: true, smoothingWindow: 1 }), [dataWithGroups, mapping]);

  const trackFeatures = useMemo(() => {
    if (cleanedData.length === 0) return [];
    const groupedRows: Record<string, CSVRow[]> = {};
    cleanedData.forEach(row => {
      const uid = String(row[mapping.id]);
      if (!groupedRows[uid]) groupedRows[uid] = [];
      groupedRows[uid].push(row);
    });

    return Object.entries(groupedRows).map(([uid, rows]) => {
      const group = rows[0].__group || 'Default';
      const stats: Record<string, any> = {};
      const sortedRows = rows.sort((a, b) => Number(a[mapping.frames]) - Number(b[mapping.frames]));
      numericFields.forEach(f => {
        const vals = rows.map(r => Number(r[f])).filter(v => !isNaN(v));
        const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
        const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
        const std = Math.sqrt(variance);
        const cv = mean !== 0 ? std / Math.abs(mean) : 0;
        stats[f] = { 
          mean, 
          variance,
          cv,
          min: Math.min(...vals), 
          max: Math.max(...vals), 
          first: Number(sortedRows[0][f]), 
          last: Number(sortedRows[sortedRows.length - 1][f]) 
        };
      });
      return { id: uid, group, xy: String(rows[0][mapping.xy]), sequence: String(rows[0][mapping.sequence]), duration: rows.length, stats } as TrajectoryFeature;
    });
  }, [cleanedData, mapping, numericFields]);

  useEffect(() => {
    if (trackFeatures.length > 0 && histField) {
      const activeStats = trackFeatures
        .filter((tf: TrajectoryFeature) => visibleGroups.has(tf.group))
        .map((tf: TrajectoryFeature) => tf.stats[histField]?.[histMode])
        .filter(v => v != null && !isNaN(v));
      if (activeStats.length > 0) { setHistRange([Math.min(...activeStats), Math.max(...activeStats)]); }
    }
  }, [histField, histMode, trackFeatures, visibleGroups]);

  const filteredVesicleIDs = useMemo(() => {
    const surviving = trackFeatures.filter((tf: TrajectoryFeature) => {
      if (!visibleGroups.has(tf.group)) return false;
      for (const filter of appliedFilters) {
        const val = tf.stats[filter.field]?.[filter.mode];
        if (val === undefined || isNaN(val) || val < filter.range[0] || val > filter.range[1]) return false;
      }
      const currentVal = tf.stats[histField]?.[histMode];
      if (currentVal === undefined || isNaN(currentVal)) return false;
      return currentVal >= histRange[0] && currentVal <= histRange[1];
    });
    return new Set(surviving.map((tf: TrajectoryFeature) => String(tf.id)));
  }, [trackFeatures, visibleGroups, appliedFilters, histField, histMode, histRange]);

  const plotData = useMemo(() => cleanedData.filter(row => filteredVesicleIDs.has(String(row[mapping.id]))), [cleanedData, filteredVesicleIDs, mapping.id]);

  const applyCurrentFilter = () => {
    setAppliedFilters(prev => [...prev, { id: Date.now().toString(), field: histField, mode: histMode, range: [histRange[0], histRange[1]] }]);
  };

  const downloadDataAndCriteria = () => {
    if (plotData.length === 0) return;
    const csvContent = [
      Object.keys(plotData[0] || {}).join(','),
      ...plotData.map(row => Object.values(row).join(','))
    ].join('\n');
    
    const groupLines = (Object.entries(groupings) as [string, string[]][]).map(([g, xys]) => `- ${g}: [${xys.join(', ')}]`);
    const filterLines = appliedFilters.map(f => `- ${f.field} (${f.mode}): range [${f.range[0].toFixed(3)}, ${f.range[1].toFixed(3)}]`);

    const criteriaContent = [
      'GUV STUDIO ANALYSIS SESSION EXPORT',
      '==================================',
      `Export Timestamp: ${new Date().toLocaleString()}`,
      `Dataset Size: ${rawData.length} rows`,
      `GUV Count (Post-Filter): ${filteredVesicleIDs.size}`,
      '',
      'Condition Grouping Mapping:',
      ...groupLines,
      '',
      'Filter Logic Pipeline:',
      ...filterLines,
      `- Final/Current UI Window: ${histField} (${histMode}): [${histRange[0].toFixed(3)}, ${histRange[1].toFixed(3)}]`
    ].join('\n');

    const download = (content: string, filename: string) => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
    };
    download(csvContent, 'cleaned_guv_trajectories.csv');
    download(criteriaContent, 'analysis_report.txt');
  };

  const exportChartAsPng = (elementId: string, filename: string) => {
    const container = document.getElementById(elementId);
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const svgSize = svg.getBoundingClientRect();
    
    canvas.width = svgSize.width * 2;
    canvas.height = svgSize.height * 2;
    
    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  useEffect(() => {
    if (visibleGroups.size > 0 && analyticsVisibleGroups.size === 0) {
      setAnalyticsVisibleGroups(new Set(visibleGroups));
    }
  }, [visibleGroups, analyticsVisibleGroups]);

  // Default select all groups for fitting when page loads or groups change
  useEffect(() => {
     if (visibleGroups.size > 0 && fitSelectedGroups.size === 0) {
        setFitSelectedGroups(new Set(visibleGroups));
     }
  }, [visibleGroups]);

  // LIVE: Pre-Calculate transformed traces for Visualization (Master Curve)
  const transformedTraces = useMemo(() => {
    if (!fitMapping.intensity || !fitMapping.radius || plotData.length === 0) return [];
    
    const subset = plotData.filter(row => fitSelectedGroups.has(row.__group || ''));
    return transformTraceData(subset, mapping, fitMapping.intensity, fitBgValue, fitMapping.radius, pwValue, fitThreshold, frameInterval);
  }, [plotData, fitSelectedGroups, fitMapping, fitBgValue, pwValue, fitThreshold, mapping, frameInterval]);

  // LIVE: Pre-Calculate Real Time Reduced Data for Visualization
  const realTimeTraces = useMemo(() => {
    if (!fitMapping.intensity || plotData.length === 0) return [];
    const subset = plotData.filter(row => fitSelectedGroups.has(row.__group || ''));
    return transformRealTimeLogData(subset, mapping, fitMapping.intensity, frameInterval);
  }, [plotData, fitSelectedGroups, fitMapping, frameInterval, mapping]);

  // Dynamic Calculation of Max Dimensionless Time for Slider Scaling
  const maxTau = useMemo(() => {
    if (transformedTraces.length === 0) return 1000;
    let m = 0;
    transformedTraces.forEach(t => {
        if (t.points.length > 0) {
            const lastP = t.points[t.points.length - 1];
            if (lastP.tau_w > m) m = lastP.tau_w;
        }
    });
    return Math.max(m, 10); // Return raw max for precise control
  }, [transformedTraces]);

  // Auto-adapt fit range when maxTau changes (loading new data)
  useEffect(() => {
      // If we are resetting or loading new data (where range is [0,0] or smaller than new max), auto-scale.
      // Or if the current range upper bound is roughly equal to the OLD maxTau, update it to the NEW maxTau.
      if (fitRange[1] === 0 || fitRange[1] > maxTau || fitRange[1] < maxTau * 0.1) {
          setFitRange([0, maxTau]);
      }
  }, [maxTau]);

  // Clear fits when data changes to avoid visual mismatch
  useEffect(() => {
     setFitResults([]); 
  }, [transformedTraces]);

  // Page 3 Fit Execution Trigger
  const runBatchFit = () => {
    if (transformedTraces.length === 0) return;
    
    setIsFitting(true);
    setTimeout(() => {
        // Pass fitThreshold to fitting function for clamping
        // Ensure we pass the CURRENT fitRange
        const results = fitTraceData(transformedTraces, fitRange, pwValue, fitThreshold);
        setFitResults(results);
        setIsFitting(false);
    }, 100);
  };

  const renderImport = () => (
    <div className="p-10 max-w-7xl mx-auto h-full overflow-y-auto space-y-10 pb-24">
      <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 p-16 text-center">
        {rawData.length === 0 ? (
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-8 shadow-inner text-4xl">📥</div>
            <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">1. Load GUV Trajectory Data</h2>
            <p className="text-slate-500 mb-8 text-lg font-medium max-w-md mx-auto leading-relaxed">Required: XY, Sequence, ID, Frame, [Channels...]</p>
            <input key={`file-upload-input-${sessionKey}`} type="file" id="csv-upload-main" className="hidden" onChange={handleFileUpload} accept=".csv,.txt" />
            <label htmlFor="csv-upload-main" className="bg-blue-600 text-white px-16 py-6 rounded-3xl font-black cursor-pointer hover:bg-blue-700 transition-all shadow-2xl active:scale-95">Select CSV File</label>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-12 animate-in fade-in duration-300">
             <div className="text-left bg-emerald-50 border border-emerald-100 px-10 py-6 rounded-[30px] shadow-sm">
                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mb-1">Status</p>
                <p className="text-2xl font-black text-emerald-900">{rawData.length.toLocaleString()} points / {uniqueXYs.length} FOVs</p>
             </div>
             <button onClick={(e) => resetSession(e)} className="bg-red-500 text-white px-8 py-5 rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-red-600 transition-all shadow-xl active:scale-95">Restart Session</button>
          </div>
        )}
      </div>

      {rawData.length > 0 && (
        <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="p-10 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">2. FOV Assignment</h2>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-tighter mt-1">Group XY positions into conditions</p>
            </div>
            <div className="flex space-x-4">
              <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Condition Label..." className="px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none" />
              <button onClick={() => { if(newGroupName.trim()){ setGroupings(prev => ({...prev, [newGroupName]: []})); setNewGroupName(''); } }} className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-sm font-black">Add Group</button>
            </div>
          </div>
          <div className="p-10 grid grid-cols-12 gap-12 h-[600px]">
             <div className="col-span-5 flex flex-col space-y-4 overflow-y-auto pr-4 scrollbar-hide">
                {uniqueXYs.map(xy => {
                    const group = (Object.entries(groupings) as [string, string[]][]).find(([_, xys]) => xys.includes(xy))?.[0];
                    return (
                        <div key={xy} className="p-4 bg-white border rounded-2xl flex justify-between items-center shadow-sm">
                            <span className="text-xs font-black">FOV {xy} ({xyCounts[xy]} GUVs)</span>
                            <select value={group || ""} onChange={(e) => setGroupings(prev => {
                                const n = {...prev}; Object.keys(n).forEach(g => n[g] = n[g].filter(i => i !== xy));
                                if (e.target.value) n[e.target.value] = [...n[e.target.value], xy];
                                return n;
                            })} className="text-[10px] font-bold bg-slate-50 px-2 py-1 rounded">
                                <option value="">None</option>
                                {Object.keys(groupings).map(gn => <option key={gn} value={gn}>{gn}</option>)}
                            </select>
                        </div>
                    );
                })}
             </div>
             <div className="col-span-7 grid grid-cols-2 gap-6 overflow-y-auto pr-4 scrollbar-hide">
                {Object.keys(groupings).map((gn, i) => (
                    <div key={gn} className="bg-white p-8 rounded-[35px] border border-slate-100 shadow-lg border-b-8" style={{ borderBottomColor: GROUP_COLORS[i % GROUP_COLORS.length] }}>
                        <h4 className="font-black text-xl mb-4">{gn} ({groupings[gn].length} FOVs)</h4>
                        <div className="text-[10px] text-slate-400 font-mono truncate">{groupings[gn].join(', ')}</div>
                    </div>
                ))}
             </div>
          </div>
          <div className="p-10 bg-slate-50/50 flex justify-end">
            <button 
              onClick={() => { if(Object.keys(groupings).length > 0) { setVisibleGroups(new Set(Object.keys(groupings))); setTab('filter'); } }} 
              disabled={Object.keys(groupings).length === 0}
              className={`px-16 py-5 rounded-3xl font-black shadow-2xl active:scale-95 transition-all ${Object.keys(groupings).length > 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              Start Cleansing →
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderFilter = () => (
    <div className="p-10 h-full bg-slate-50 overflow-y-auto space-y-12 pb-32">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="flex justify-between items-end">
           <div>
             <h2 className="text-4xl font-black text-slate-900 tracking-tighter">2. Clean & Filter Data</h2>
             <p className="text-sm text-slate-400 font-bold uppercase mt-2 tracking-widest">Remove outliers and select specific populations</p>
           </div>
           <div className="flex space-x-4">
              <button onClick={() => { setAppliedFilters([]); setHistRange([0,0]); }} className="text-red-500 font-black text-[10px] uppercase hover:underline">Reset All Filters</button>
              <button onClick={downloadDataAndCriteria} className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase shadow-xl active:scale-95 transition-all">Export Cleaned Data</button>
           </div>
        </div>

        <div className="grid grid-cols-12 gap-8 h-[600px]">
           {/* Left Column: Histogram & Controls */}
           <div className="col-span-4 flex flex-col space-y-8">
              <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl flex-1 flex flex-col">
                 <div className="flex justify-between items-center mb-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Parameter Distribution</h4>
                    <div className="flex space-x-2">
                       <button onClick={() => setHistScale('linear')} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${histScale === 'linear' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>Lin</button>
                       <button onClick={() => setHistScale('log')} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${histScale === 'log' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>Log</button>
                    </div>
                 </div>
                 
                 <div className="space-y-4 mb-6">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-300 uppercase ml-2">Metric</label>
                       <select value={histField} onChange={e => setHistField(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 ring-blue-100">
                          {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                       </select>
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-300 uppercase ml-2">Statistic</label>
                       <select value={histMode} onChange={e => setHistMode(e.target.value as any)} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 ring-blue-100">
                          <option value="mean">Mean Value</option>
                          <option value="first">Initial Value</option>
                          <option value="last">Final Value</option>
                          <option value="min">Minimum</option>
                          <option value="max">Maximum</option>
                          <option value="variance">Variance</option>
                          <option value="cv">Coef. of Variation</option>
                       </select>
                    </div>
                 </div>

                 <div className="flex-1 min-h-[200px]">
                    <InteractiveHistogram 
                       features={trackFeatures.filter((tf: TrajectoryFeature) => visibleGroups.has(tf.group))} 
                       field={histField} 
                       mode={histMode} 
                       scale={histScale} 
                       range={histRange} 
                       onRangeChange={setHistRange} 
                    />
                 </div>

                 <button onClick={applyCurrentFilter} className="w-full mt-6 bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-blue-500 transition-all active:scale-95">
                    Apply Filter Window
                 </button>
              </div>

              {/* Applied Filters List */}
              <div className="bg-slate-900 p-8 rounded-[40px] text-white shadow-2xl min-h-[150px]">
                 <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">Active Filters ({appliedFilters.length})</h4>
                 <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2">
                    {appliedFilters.length === 0 && <p className="text-[10px] text-slate-600 italic">No filters applied yet.</p>}
                    {appliedFilters.map((f, i) => (
                       <div key={i} className="flex justify-between items-center bg-slate-800 px-3 py-2 rounded-xl border border-slate-700">
                          <div className="flex flex-col">
                             <span className="text-[10px] font-bold text-slate-300">{f.field} <span className="text-slate-500">({f.mode})</span></span>
                             <span className="text-[9px] font-mono text-blue-400">{f.range[0].toFixed(2)} - {f.range[1].toFixed(2)}</span>
                          </div>
                          <button onClick={() => setAppliedFilters(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-red-400 transition-colors">×</button>
                       </div>
                    ))}
                 </div>
              </div>
           </div>

           {/* Right Column: Time Series Visualization */}
           <div className="col-span-8 bg-white p-12 rounded-[50px] border border-slate-100 shadow-2xl flex flex-col relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 flex space-x-2 z-10">
                  {Array.from(visibleGroups).map((gn, i) => (
                     <div key={gn} className="flex items-center space-x-2 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}></div>
                        <span className="text-[9px] font-black text-slate-500">{gn}</span>
                     </div>
                  ))}
               </div>
               
               <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 border-b pb-4">
                  Live Trajectory Preview 
                  <span className="text-blue-600 ml-2">({filteredVesicleIDs.size} GUVs)</span>
               </h4>
               
               <div className="flex-1">
                  <TemporalTrendChart 
                     data={plotData} 
                     field={histField} 
                     frameField={mapping.frames} 
                     idField={mapping.id} 
                  />
               </div>
               
               <div className="mt-6 flex justify-between items-center text-[10px] font-bold text-slate-400 bg-slate-50 p-4 rounded-2xl">
                  <span>Filtered Data Points: {plotData.length.toLocaleString()}</span>
                  <span>Avg Duration: {trackFeatures.length > 0 ? Math.round(trackFeatures.reduce((a: number, b: TrajectoryFeature) => a + b.duration, 0) / trackFeatures.length) : 0} frames</span>
               </div>
           </div>
        </div>
      </div>
    </div>
  );

  const renderFitting = () => {
    // Data for histograms
    const pfData = fitResults.map(r => ({ group: r.group, value: r.pf_val }));
    const r2Data = fitResults.map(r => ({ group: r.group, value: r.r2 }));

    return (
      <div className="p-10 h-full bg-slate-50 overflow-y-auto space-y-8 pb-32">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex justify-between items-end">
             <div>
               <h2 className="text-4xl font-black text-slate-900 tracking-tighter">3. Permeability Fitting</h2>
               <div className="flex items-center space-x-6 mt-2">
                  <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Master curve dimensionless transformation</p>
                  <div className="bg-white border border-slate-200 px-4 py-1 rounded-full shadow-sm">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Filtered Tracks:</span>
                      <span className="text-sm font-black text-blue-600">{filteredVesicleIDs.size}</span>
                  </div>
               </div>
             </div>
             <div className="flex space-x-4">
                <button onClick={() => {
                  const csv = "ID,Group,Pf_val,R2\n" + fitResults.map(r => `${r.id},${r.group},${r.pf_val},${r.r2}`).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = 'fitting_results.csv'; a.click();
                }} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl active:scale-95 transition-all">Download Fit CSV</button>
             </div>
          </div>

          <div className="h-[750px] grid grid-cols-12 gap-6">
            {/* LEFT COLUMN: Full Height Master Curve Chart (2:5 ratio) */}
            <div className="col-span-4 h-full bg-white p-6 rounded-[40px] border border-slate-100 shadow-2xl flex flex-col relative overflow-hidden">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-4 mb-4 flex justify-between">
                    <span>Population Master Curve</span>
                    <span>{fitResults.length > 0 ? 'Fit Complete' : 'Ready'}</span>
                </h4>
                <div className="flex-1">
                    <MasterCurveChart 
                        traces={transformedTraces}
                        fitResults={fitResults} 
                        fitRange={fitRange}
                        setFitRange={setFitRange}
                        maxTau={maxTau}
                        threshold={fitThreshold}
                    />
                </div>
            </div>

            {/* MIDDLE COLUMN: New Real Time Log Chart (2:5 ratio) */}
            <div className="col-span-4 h-full bg-white p-6 rounded-[40px] border border-slate-100 shadow-2xl flex flex-col relative overflow-hidden">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-4 mb-4">
                    <span>Real Time Comparison</span>
                </h4>
                <div className="flex-1">
                    <RealTimeLogChart traces={realTimeTraces} />
                </div>
            </div>

            {/* RIGHT COLUMN: Controls & Analysis */}
            <div className="col-span-4 flex flex-col space-y-6 h-full">
                {/* Control Panel */}
                <div className="bg-slate-900 text-white p-6 rounded-[40px] shadow-2xl flex-shrink-0">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Physics Parameters</h4>
                        <button 
                            onClick={runBatchFit}
                            disabled={isFitting || fitSelectedGroups.size === 0}
                            className={`px-4 py-2 rounded-xl font-black uppercase text-[9px] shadow-lg active:scale-95 transition-all ${isFitting ? 'bg-slate-700 text-slate-400' : 'bg-blue-500 hover:bg-blue-400 text-white'}`}
                        >
                            {isFitting ? 'Fit...' : '▶ Run'}
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Pw (cm/s)</label>
                            <input 
                                type="number" value={pwValue} onChange={e => setPwValue(Number(e.target.value))} step="0.0001"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-[10px] font-bold outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Frame dt (s)</label>
                            <input 
                                type="number" value={frameInterval} onChange={e => setFrameInterval(Number(e.target.value))} step="0.01"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-[10px] font-bold outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                         <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Bg Int.</label>
                            <input 
                                type="number" value={fitBgValue} onChange={e => setFitBgValue(Number(e.target.value))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-[10px] font-bold outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Threshold</label>
                            <input 
                                type="number" value={fitThreshold} onChange={e => setFitThreshold(Number(e.target.value))} step="0.0001"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-[10px] font-bold outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="space-y-1 col-span-2">
                            <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Intensity Field</label>
                            <select 
                                value={fitMapping.intensity} onChange={e => setFitMapping(p => ({...p, intensity: e.target.value}))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-[10px] font-bold outline-none focus:border-blue-500 transition-colors"
                            >
                                {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1 col-span-2">
                            <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Radius Field</label>
                            <select 
                                value={fitMapping.radius} onChange={e => setFitMapping(p => ({...p, radius: e.target.value}))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-[10px] font-bold outline-none focus:border-blue-500 transition-colors"
                            >
                                {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Analysis & Distributions */}
                <div className="flex-1 bg-white p-6 rounded-[40px] border border-slate-100 shadow-xl flex flex-col overflow-hidden">
                    <div className="mb-4 flex justify-between items-center border-b pb-2">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fit Results</h4>
                    </div>
                    
                    <div className="flex flex-col space-y-4 h-full overflow-y-auto pr-1">
                         <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shrink-0">
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Groups</h4>
                            <div className="flex flex-wrap gap-2">
                                {Array.from(visibleGroups).map((gn, i) => (
                                <label key={gn} className={`flex items-center space-x-2 px-2 py-1 rounded-lg border text-[8px] font-bold cursor-pointer select-none transition-all ${fitSelectedGroups.has(gn) ? 'bg-slate-900 border-transparent text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}>
                                    <input 
                                        type="checkbox" className="hidden" 
                                        checked={fitSelectedGroups.has(gn)} 
                                        onChange={() => {
                                            const next = new Set(fitSelectedGroups);
                                            if (next.has(gn)) next.delete(gn); else next.add(gn);
                                            setFitSelectedGroups(next);
                                        }} 
                                    />
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}></div>
                                    <span>{gn}</span>
                                </label>
                                ))}
                            </div>
                         </div>
                         
                         <div className="h-[150px] shrink-0">
                             <SimpleDistributionChart data={pfData} title="Permeability (Pf)" />
                         </div>
                         <div className="h-[150px] shrink-0">
                             <SimpleDistributionChart data={r2Data} title="Fit R²" />
                         </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAnalytics = () => {
    // Preparation for Box Plot
    const boxPlotData = useMemo(() => {
        if (!analyticsField) return [];
        const groups: Record<string, number[]> = {};
        (trackFeatures as TrajectoryFeature[]).forEach((tf) => {
            if (analyticsVisibleGroups.has(tf.group)) {
                const val = tf.stats[analyticsField]?.[analyticsMode];
                if (val !== undefined && !isNaN(val)) {
                    if (!groups[tf.group]) groups[tf.group] = [];
                    groups[tf.group].push(val);
                }
            }
        });
        return Object.entries(groups).map(([group, values]) => ({ group, values }));
    }, [trackFeatures, analyticsField, analyticsMode, analyticsVisibleGroups]);

    return (
      <div className="p-10 h-full bg-slate-50 overflow-y-auto space-y-8 pb-32">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="flex justify-between items-end">
             <div>
               <h2 className="text-4xl font-black text-slate-900 tracking-tighter">4. Summary Analytics</h2>
               <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-2">Compare populations and correlations</p>
             </div>
             <div className="flex space-x-4">
                <button onClick={() => exportChartAsPng('analytics-boxplot', 'boxplot_analysis')} className="bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-sm hover:bg-slate-50 transition-all">Export BoxPlot</button>
                <button onClick={() => exportChartAsPng('analytics-scatter', 'scatter_analysis')} className="bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-sm hover:bg-slate-50 transition-all">Export Scatter</button>
             </div>
          </div>

          {/* Controls */}
          <div className="bg-white p-6 rounded-[30px] shadow-xl border border-slate-100 grid grid-cols-12 gap-8 items-end">
              <div className="col-span-12 mb-2">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Groups</h4>
                 <div className="flex flex-wrap gap-2 mt-2">
                    {Array.from(visibleGroups).map((gn, i) => (
                        <label key={gn} className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-[9px] font-bold cursor-pointer select-none transition-all ${analyticsVisibleGroups.has(gn) ? 'bg-slate-900 border-transparent text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                            <input 
                                type="checkbox" className="hidden" 
                                checked={analyticsVisibleGroups.has(gn)} 
                                onChange={() => {
                                    const next = new Set(analyticsVisibleGroups);
                                    if (next.has(gn)) next.delete(gn); else next.add(gn);
                                    setAnalyticsVisibleGroups(next);
                                }} 
                            />
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}></div>
                            <span>{gn}</span>
                        </label>
                    ))}
                 </div>
              </div>
          </div>

          <div className="grid grid-cols-12 gap-8 h-[600px]">
             {/* LEFT: Box Plot */}
             <div className="col-span-6 flex flex-col space-y-6">
                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-2xl flex-1 flex flex-col" id="analytics-boxplot">
                    <div className="flex justify-between items-center mb-6">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Population Distribution</h4>
                         <div className="flex space-x-2">
                             <select value={analyticsField} onChange={e => setAnalyticsField(e.target.value)} className="bg-slate-50 border-none rounded-lg px-2 py-1 text-[9px] font-black uppercase outline-none focus:ring-1 ring-blue-200">
                                {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                             </select>
                             <select value={analyticsMode} onChange={e => setAnalyticsMode(e.target.value as any)} className="bg-slate-50 border-none rounded-lg px-2 py-1 text-[9px] font-black uppercase outline-none focus:ring-1 ring-blue-200">
                                <option value="mean">Mean</option>
                                <option value="max">Max</option>
                                <option value="min">Min</option>
                                <option value="variance">Var</option>
                                <option value="cv">CV</option>
                             </select>
                         </div>
                    </div>
                    <div className="flex-1">
                        <BoxPlotChart data={boxPlotData} />
                    </div>
                </div>
             </div>

             {/* RIGHT: Scatter Plot */}
             <div className="col-span-6 flex flex-col space-y-6">
                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-2xl flex-1 flex flex-col" id="analytics-scatter">
                    <div className="flex justify-between items-center mb-6">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Correlation Analysis</h4>
                         <div className="flex flex-col space-y-1 items-end">
                            <div className="flex space-x-2 items-center">
                                <span className="text-[8px] font-black text-slate-300 uppercase">X-Axis</span>
                                <select value={analyticsXField} onChange={e => setAnalyticsXField(e.target.value)} className="bg-slate-50 border-none rounded-lg px-2 py-1 text-[9px] font-black uppercase outline-none w-24">
                                    {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                                <select value={analyticsXMode} onChange={e => setAnalyticsXMode(e.target.value as any)} className="bg-slate-50 border-none rounded-lg px-2 py-1 text-[9px] font-black uppercase outline-none w-16">
                                    <option value="mean">Mean</option>
                                    <option value="max">Max</option>
                                    <option value="min">Min</option>
                                </select>
                            </div>
                            <div className="flex space-x-2 items-center">
                                <span className="text-[8px] font-black text-slate-300 uppercase">Y-Axis</span>
                                <select value={analyticsYField} onChange={e => setAnalyticsYField(e.target.value)} className="bg-slate-50 border-none rounded-lg px-2 py-1 text-[9px] font-black uppercase outline-none w-24">
                                    {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                                <select value={analyticsYMode} onChange={e => setAnalyticsYMode(e.target.value as any)} className="bg-slate-50 border-none rounded-lg px-2 py-1 text-[9px] font-black uppercase outline-none w-16">
                                    <option value="mean">Mean</option>
                                    <option value="max">Max</option>
                                    <option value="min">Min</option>
                                </select>
                            </div>
                         </div>
                    </div>
                    <div className="flex-1">
                        <ScatterPlotGUV 
                            id="scatter-plot-main"
                            features={trackFeatures as TrajectoryFeature[]}
                            xField={analyticsXField}
                            yField={analyticsYField}
                            xMode={analyticsXMode}
                            yMode={analyticsYMode}
                            visibleGroups={analyticsVisibleGroups}
                        />
                    </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900 select-none">
      <Sidebar 
        currentTab={currentTab} setTab={setTab} onResetSession={resetSession} dataActive={rawData.length > 0} 
      />
      <main className="flex-1 flex flex-col h-full relative">
        <header className="h-20 bg-white/95 backdrop-blur-3xl border-b border-slate-200 px-12 flex items-center justify-between shadow-sm z-50 sticky top-0">
          <div className="flex items-center space-x-8">
            <span className="font-black text-slate-900 text-3xl tracking-tighter">GUV Studio</span>
            {rawData.length > 0 && <div className="text-[10px] bg-blue-600 text-white px-5 py-1.5 rounded-2xl font-black border border-blue-400 uppercase tracking-widest shadow-lg shadow-blue-200">Session Active</div>}
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          {currentTab === 'import' && renderImport()}
          {currentTab === 'filter' && renderFilter()}
          {currentTab === 'fitting' && renderFitting()}
          {currentTab === 'analytics' && renderAnalytics()}
        </div>
      </main>
    </div>
  );
};

export default App;
