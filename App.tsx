
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
import GrowthFitChart from './components/GrowthFitChart';
import GrowthCorrelationChart from './components/GrowthCorrelationChart';
import { applyCleaning, safeMin, safeMax, downloadCSV, downloadText, calculateMeanVar } from './utils/dataProcess';
import { transformTraceData, transformRealTimeLogData, fitTraceData, fitGrowthData, TraceFitResult, GrowthFitResult } from './utils/physicsFitting';

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
  
  // Page 3 Fit Mode
  const [fitMode, setFitMode] = useState<'leakage' | 'growth'>('leakage');
  
  // Physics Parameters
  const [pwValue, setPwValue] = useState(0.0034);
  const [fitBgValue, setFitBgValue] = useState(0.0);
  const [fitThreshold, setFitThreshold] = useState(0.001); 
  const [frameInterval, setFrameInterval] = useState(600.0);
  const [fitMapping, setFitMapping] = useState({ intensity: '', radius: '' });
  const [fitSelectedGroups, setFitSelectedGroups] = useState<Set<string>>(new Set());
  
  // New State for Growth Correlation Plot X-Axis
  const [growthCorrelX, setGrowthCorrelX] = useState<string>('');
  
  const [fitRange, setFitRange] = useState<[number, number]>([0, 0]);
  const [fitResults, setFitResults] = useState<TraceFitResult[]>([]);
  const [growthResults, setGrowthResults] = useState<GrowthFitResult[]>([]);
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
  
  // Manual Plotting State (Page 2 Performance)
  const [manualPlotData, setManualPlotData] = useState<CSVRow[]>([]);
  const [isPlotting, setIsPlotting] = useState(false);

  // Manual Plotting State (Page 3 Performance)
  const [fittingPreviewData, setFittingPreviewData] = useState<{
    traces: any[],
    realTime: any[],
    growthData: any[] // Just the subset of raw data for growth
  }>({ traces: [], realTime: [], growthData: [] });
  const [isFittingRefresh, setIsFittingRefresh] = useState(false);

  // Analytics State
  const [analyticsTab, setAnalyticsTab] = useState<'comparison' | 'scatter'>('comparison');
  // Comparison State
  const [analyticsField, setAnalyticsField] = useState<string>('');
  const [analyticsMode, setAnalyticsMode] = useState<string>('mean');
  const [analyticsVisibleGroups, setAnalyticsVisibleGroups] = useState<Set<string>>(new Set());
  
  // -- NEW: Normalization & Outlier State --
  const [normalizationField, setNormalizationField] = useState<string>(''); // Empty means "None"
  const [normalizationMode, setNormalizationMode] = useState<string>('mean');
  const [sigmaMultiplier, setSigmaMultiplier] = useState<number>(0); // 0 means Off
  
  // -- NEW: Axis Ranges --
  const [boxPlotYRange, setBoxPlotYRange] = useState({ min: 0, max: 100, auto: true });
  const [boxPlotScale, setBoxPlotScale] = useState<'linear' | 'log'>('linear');
  
  const [scatterXRange, setScatterXRange] = useState({ min: 0, max: 100, auto: true });
  const [scatterYRange, setScatterYRange] = useState({ min: 0, max: 100, auto: true });
  
  // Scatter State
  const [scatterXField, setScatterXField] = useState<string>('');
  const [scatterXMode, setScatterXMode] = useState<string>('mean');
  const [scatterYField, setScatterYField] = useState<string>('');
  const [scatterYMode, setScatterYMode] = useState<string>('mean');


  const [mapping, setMapping] = useState<ColumnMapping>({
    id: '__uid', frames: 'Frame', xy: 'XY', sequence: 'Sequence', dt: 1, intensityFields: [], geometryFields: []
  });

  const resetSession = (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!window.confirm("Are you sure you want to restart? This will clear all data.")) return;
    setRawData([]); setNumericFields([]); setXYCounts({}); setUniqueXYs([]); setGroupings({});
    setVisibleGroups(new Set()); setAppliedFilters([]); setAnalyticsVisibleGroups(new Set());
    setSessionKey(prev => prev + 1); setFitResults([]); setGrowthResults([]); setFitRange([0, 0]); setTab('import');
    setManualPlotData([]);
    setFittingPreviewData({ traces: [], realTime: [], growthData: [] });
    setNormalizationField('');
    setSigmaMultiplier(0);
    setBoxPlotYRange({ min: 0, max: 100, auto: true });
    setBoxPlotScale('linear');
    setScatterXRange({ min: 0, max: 100, auto: true });
    setScatterYRange({ min: 0, max: 100, auto: true });
  };

  // --- 1. Global Color Mapping (Stable Colors) ---
  const groupColorMap = useMemo(() => {
    const allGroups = Object.keys(groupings).sort();
    const map: Record<string, string> = {};
    allGroups.forEach((g, i) => {
      map[g] = GROUP_COLORS[i % GROUP_COLORS.length];
    });
    map['Default'] = '#94a3b8';
    return map;
  }, [groupings]);


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) return;
      
      const headers = lines[0].split(',').map(h => h.trim());
      const tempRows: CSVRow[] = [];
      const xyTrackMap: Record<string, Set<number>> = {};
      
      // Robust Parsing
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row: CSVRow = {};
        headers.forEach((header, j) => {
          const rawVal = values[j]?.trim();
          const num = Number(rawVal);
          row[header] = (!isNaN(num) && rawVal !== '') ? num : rawVal;
        });
        
        // Ensure ID uniqueness: XY_TrackID
        const xyVal = String(row[headers[0]]);
        const trackId = Number(row[headers[2]]);
        const uid = `${xyVal}_${trackId}`;
        row.__uid = uid;
        
        if (!xyTrackMap[xyVal]) xyTrackMap[xyVal] = new Set();
        xyTrackMap[xyVal].add(trackId);
        tempRows.push(row);
      }
      
      setXYCounts(Object.fromEntries(Object.entries(xyTrackMap).map(([k, v]) => [k, v.size])));
      setNumericFields(headers.slice(4));
      setRawData(tempRows);
      setUniqueXYs(Object.keys(xyTrackMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
      
      // Initialize Mapping
      const initialMapping = { 
        xy: headers[0], 
        sequence: headers[1], 
        id: '__uid', 
        frames: headers[3], 
        dt: 1, 
        intensityFields: headers.slice(4), 
        geometryFields: [] 
      };
      setMapping(initialMapping);
      
      // Initialize Fit Mapping Defaults
      setFitMapping({ 
        intensity: headers[4], 
        radius: headers.find(h => h.toLowerCase().includes('radius')) || headers[6] || headers[4] 
      });
      setGrowthCorrelX(headers[4]);

      // Initialize Histogram/Analytics Defaults
      setHistField(headers[4]); 
      setAnalyticsField(headers[4]);
      setScatterXField(headers[4]);
      setScatterYField(headers.length > 5 ? headers[5] : headers[4]);
      
      setTab('import');
    };
    reader.readAsText(file);
  };

  const dataWithGroups = useMemo(() => {
    const xyToGroupMap: Record<string, string> = {};
    Object.keys(groupings).forEach(groupName => {
      const xys = groupings[groupName];
      xys.forEach(xy => { xyToGroupMap[xy] = groupName; });
    });
    return rawData.map(row => ({ 
      ...row, 
      __group: xyToGroupMap[String(row[mapping.xy])] 
    })).filter(row => row.__group !== undefined);
  }, [rawData, groupings, mapping.xy]);

  const cleanedData = useMemo(() => applyCleaning(dataWithGroups, mapping, { dropMissing: true, smoothingWindow: 1 }), [dataWithGroups, mapping]);

  const allTrackFeatures = useMemo(() => {
    if (cleanedData.length === 0) return [];
    const groupedRows: Record<string, CSVRow[]> = {};
    cleanedData.forEach(row => {
      const uid = String(row[mapping.id]);
      if (!groupedRows[uid]) groupedRows[uid] = [];
      groupedRows[uid].push(row);
    });
    return Object.entries(groupedRows).map(([uid, rows]) => {
      const stats: Record<string, any> = {};
      const sortedRows = rows.sort((a, b) => Number(a[mapping.frames]) - Number(b[mapping.frames]));
      numericFields.forEach(f => {
        const vals = rows.map(r => Number(r[f])).filter(v => !isNaN(v));
        // Use SAFE MIN/MAX to prevent stack overflow on large datasets
        const mean = vals.length > 0 ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
        const variance = vals.length > 0 ? vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length : 0;
        const std = Math.sqrt(variance);
        const cv = mean !== 0 ? std / Math.abs(mean) : 0;
        stats[f] = { 
            mean, 
            variance, 
            cv, 
            min: safeMin(vals), 
            max: safeMax(vals), 
            first: vals.length > 0 ? Number(sortedRows[0][f]) : 0, 
            last: vals.length > 0 ? Number(sortedRows[sortedRows.length - 1][f]) : 0 
        };
      });
      return { id: uid, group: rows[0].__group, xy: String(rows[0][mapping.xy]), sequence: String(rows[0][mapping.sequence]), duration: rows.length, stats } as TrajectoryFeature;
    });
  }, [cleanedData, mapping, numericFields]);

  // VITAL: Survived tracks based ONLY on applied filters
  const survivedTrackFeatures = useMemo(() => {
    return allTrackFeatures.filter(tf => {
      if (!visibleGroups.has(tf.group)) return false; 
      
      for (const filter of appliedFilters) {
        const val = tf.stats[filter.field]?.[filter.mode];
        if (val === undefined || isNaN(val) || val < filter.range[0] || val > filter.range[1]) return false;
      }
      return true;
    });
  }, [allTrackFeatures, visibleGroups, appliedFilters]);

  // VITAL: IDs that survive the CURRENT SLIDER selection (Temporary for Page 2 Preview)
  const previewVesicleIDs = useMemo(() => {
    const surviving = survivedTrackFeatures.filter(tf => {
      const val = tf.stats[histField]?.[histMode];
      return val !== undefined && !isNaN(val) && val >= histRange[0] && val <= histRange[1];
    });
    return new Set(surviving.map(tf => String(tf.id)));
  }, [survivedTrackFeatures, histField, histMode, histRange]);

  // VITAL: IDs that survive ONLY the applied filters (Finalized for Page 3)
  const appliedVesicleIDs = useMemo(() => {
    return new Set(survivedTrackFeatures.map(tf => String(tf.id)));
  }, [survivedTrackFeatures]);

  // Dataset for Page 2 Chart - Calculated on demand via refreshPlot
  const currentFilteredData = useMemo(() => cleanedData.filter(row => previewVesicleIDs.has(String(row[mapping.id]))), [cleanedData, previewVesicleIDs, mapping.id]);
  
  // Dataset for Page 3 & Analytics (Responds ONLY to applied filters)
  const finalizedData = useMemo(() => cleanedData.filter(row => appliedVesicleIDs.has(String(row[mapping.id]))), [cleanedData, appliedVesicleIDs, mapping.id]);

  // --- Merged Analytics Data (Stats + Fits) ---
  const analyticsData = useMemo(() => {
      // Use separate maps to prevent overwriting when multiple fit types exist for the same track
      const leakageMap = new Map<string, TraceFitResult>();
      fitResults.forEach(r => leakageMap.set(String(r.id), r));

      const growthMap = new Map<string, GrowthFitResult>();
      growthResults.forEach(r => growthMap.set(String(r.id), r));

      return survivedTrackFeatures.map(tf => {
          const lFit = leakageMap.get(String(tf.id));
          const gFit = growthMap.get(String(tf.id));
          
          return {
              ...tf,
              fitParams: {
                  'Pf (Leakage)': lFit?.pf_val,
                  'R2 (Leakage)': lFit?.r2,
                  'Growth Rate (k)': gFit?.k,
                  'R_inf (Growth)': gFit?.r_inf,
                  'R0 (Growth)': gFit?.r0
              }
          };
      });
  }, [survivedTrackFeatures, fitResults, growthResults]);

  // Available options for Analytics Dropdowns
  const analyticsOptions = useMemo(() => {
      const stats = numericFields.map(f => ({ label: f, isFit: false }));
      const fits = fitResults.length > 0 ? ['Pf (Leakage)', 'R2 (Leakage)'] : [];
      const growth = growthResults.length > 0 ? ['Growth Rate (k)', 'R_inf (Growth)', 'R0 (Growth)'] : [];
      
      return [
          ...stats,
          ...fits.map(f => ({ label: f, isFit: true })),
          ...growth.map(f => ({ label: f, isFit: true }))
      ];
  }, [numericFields, fitResults, growthResults]);


  // --- 2. Calculation Logic (Memoized) ---
  const calculatedTransformedTraces = useMemo(() => {
    if (fitMode !== 'leakage' || finalizedData.length === 0) return [];
    const subset = finalizedData.filter(row => fitSelectedGroups.has(row.__group || ''));
    return transformTraceData(subset, mapping, fitMapping.intensity, fitBgValue, fitMapping.radius, pwValue, fitThreshold, frameInterval);
  }, [finalizedData, fitSelectedGroups, fitMode, mapping, fitMapping, fitBgValue, pwValue, fitThreshold, frameInterval]);

  const calculatedRealTimeTraces = useMemo(() => {
    if (fitMode !== 'leakage' || finalizedData.length === 0) return [];
    const subset = finalizedData.filter(row => fitSelectedGroups.has(row.__group || ''));
    return transformRealTimeLogData(subset, mapping, fitMapping.intensity, frameInterval);
  }, [finalizedData, fitSelectedGroups, fitMode, mapping, fitMapping, frameInterval]);

  const calculatedGrowthData = useMemo(() => {
     if (fitMode !== 'growth' || finalizedData.length === 0) return [];
     return finalizedData.filter(row => fitSelectedGroups.has(row.__group || ''));
  }, [finalizedData, fitSelectedGroups, fitMode]);

  // --- 3. Growth Correlation Data ---
  const growthCorrelationData = useMemo(() => {
    if (fitMode !== 'growth' || !growthCorrelX || calculatedGrowthData.length === 0) return [];
    
    const grouped: Record<string, CSVRow[]> = {};
    calculatedGrowthData.forEach(r => {
        const id = r.__uid || 'unknown';
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(r);
    });

    const points: { x: number, y: number, group: string }[] = [];

    Object.entries(grouped).forEach(([id, rows]) => {
        const sorted = rows.sort((a, b) => Number(a[mapping.frames]) - Number(b[mapping.frames]));
        if (sorted.length < 2) return;
        
        const firstRow = sorted[0];
        const lastRow = sorted[sorted.length - 1];

        const r0 = Number(firstRow[fitMapping.radius]);
        const rLast = Number(lastRow[fitMapping.radius]);
        const xVal = Number(lastRow[growthCorrelX]);

        if (!isNaN(r0) && !isNaN(rLast) && rLast !== 0 && !isNaN(xVal)) {
            const y = 1 - Math.pow(r0 / rLast, 2);
            points.push({ x: xVal, y, group: lastRow.__group || 'Default' });
        }
    });

    return points;
  }, [calculatedGrowthData, fitMode, growthCorrelX, fitMapping.radius, mapping.frames]);

  const maxTau = useMemo(() => {
    if (calculatedTransformedTraces.length === 0) return 1000;
    let m = 0;
    calculatedTransformedTraces.forEach(t => {
      if (t.points.length > 0 && t.points[t.points.length-1].tau_w > m) m = t.points[t.points.length-1].tau_w;
    });
    return Math.max(m, 10);
  }, [calculatedTransformedTraces]);

  useEffect(() => {
    if (fitRange[1] === 0 || fitRange[1] > maxTau || fitRange[1] < maxTau * 0.1) {
        setFitRange([0, maxTau]);
    }
  }, [maxTau]);

  // Auto-Reset histogram range on field change or new data
  useEffect(() => {
    if (survivedTrackFeatures.length > 0 && histField) {
      const vals = survivedTrackFeatures.map(tf => tf.stats[histField]?.[histMode]).filter(v => v != null && !isNaN(v));
      if (vals.length > 0) {
          const min = safeMin(vals);
          const max = safeMax(vals);
          setHistRange([min, max]);
      }
    }
  }, [survivedTrackFeatures, histField, histMode]);

  useEffect(() => {
     if (visibleGroups.size > 0 && fitSelectedGroups.size === 0) {
        setFitSelectedGroups(new Set(visibleGroups));
     }
  }, [visibleGroups]);

  // Initial plot on tab switch if empty
  useEffect(() => {
    if (currentTab === 'filter' && manualPlotData.length === 0 && currentFilteredData.length > 0) {
       setManualPlotData(currentFilteredData);
    }
    // Initialize Fitting Page Plot on first load of that tab
    if (currentTab === 'fitting' && fittingPreviewData.traces.length === 0 && calculatedTransformedTraces.length > 0) {
       setFittingPreviewData({
           traces: calculatedTransformedTraces,
           realTime: calculatedRealTimeTraces,
           growthData: calculatedGrowthData
       });
    }
    // Sync Analytics Visibility with Filter Visibility initially
    if (currentTab === 'analytics' && analyticsVisibleGroups.size === 0) {
        setAnalyticsVisibleGroups(new Set(visibleGroups));
    }
  }, [currentTab]);

  const addFilter = () => {
      setAppliedFilters([...appliedFilters, { id: Date.now().toString(), field: histField, mode: histMode, range: [histRange[0], histRange[1]] }]);
  };

  const refreshPlot = () => {
      setIsPlotting(true);
      requestAnimationFrame(() => {
          setTimeout(() => {
              setManualPlotData(currentFilteredData);
              setIsPlotting(false);
          }, 50);
      });
  };

  const refreshFittingPlots = () => {
      setIsFittingRefresh(true);
      requestAnimationFrame(() => {
          setTimeout(() => {
              setFittingPreviewData({
                  traces: calculatedTransformedTraces,
                  realTime: calculatedRealTimeTraces,
                  growthData: calculatedGrowthData
              });
              setIsFittingRefresh(false);
          }, 50);
      });
  };

  const runBatchFit = () => {
    setIsFitting(true);
    setTimeout(() => {
      if (fitMode === 'leakage') {
        const results = fitTraceData(calculatedTransformedTraces, fitRange, pwValue, fitThreshold);
        setFitResults(results);
      } else {
        const results = fitGrowthData(finalizedData, mapping, fitMapping.radius, frameInterval, fitSelectedGroups);
        setGrowthResults(results);
      }
      setIsFitting(false);
    }, 100);
  };

  const handleExportData = () => {
      downloadCSV(finalizedData, `guv_data_cleaned_${new Date().toISOString().slice(0,10)}.csv`);
      const criteria = {
          appliedFilters,
          currentHistogramFilter: { field: histField, mode: histMode, range: histRange },
          groups: Object.keys(groupings)
      };
      downloadText(JSON.stringify(criteria, null, 2), `cleaning_criteria_${new Date().toISOString().slice(0,10)}.txt`);
  };

  // --- RENDER FUNCTIONS ---

  const renderImport = () => (
    <div className="flex-1 overflow-y-auto p-10 pb-32">
       <div className="max-w-7xl mx-auto space-y-10">
        <div className="bg-white rounded-[40px] shadow-2xl p-16 text-center border border-slate-100">
            {rawData.length === 0 ? (
            <div className="flex flex-col items-center">
                <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-8 text-4xl shadow-inner">📥</div>
                <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">1. Load Trajectory Data</h2>
                <input type="file" id="csv-upload" className="hidden" onChange={handleFileUpload} accept=".csv,.txt" />
                <label htmlFor="csv-upload" className="bg-blue-600 text-white px-16 py-6 rounded-3xl font-black cursor-pointer hover:bg-blue-700 transition-all shadow-xl active:scale-95">Select CSV File</label>
            </div>
            ) : (
            <div className="flex items-center justify-center space-x-12 animate-in fade-in duration-300">
                <div className="text-left bg-emerald-50 px-10 py-6 rounded-[30px] border border-emerald-100">
                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mb-1">Dataset Status</p>
                <p className="text-2xl font-black text-emerald-900">{rawData.length.toLocaleString()} pts / {uniqueXYs.length} FOVs</p>
                </div>
                <button onClick={resetSession} className="bg-red-500 text-white px-8 py-5 rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-red-600 transition-all shadow-xl active:scale-95">Reset</button>
            </div>
            )}
        </div>

        {rawData.length > 0 && (
            <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50/30">
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">2. FOV Grouping</h2>
                <div className="flex space-x-4">
                <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="New Group Name..." className="px-6 py-4 bg-white border rounded-2xl text-sm outline-none focus:ring-2 ring-blue-100" />
                <button onClick={() => { if(newGroupName.trim()){ setGroupings({...groupings, [newGroupName]: []}); setNewGroupName(''); } }} className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-sm font-black active:scale-95 transition-all">Add Group</button>
                </div>
            </div>
            <div className="p-10 grid grid-cols-12 gap-8 h-[500px]">
                <div className="col-span-5 overflow-y-auto space-y-3 pr-4">
                {uniqueXYs.map(xy => {
                    const group = Object.entries(groupings).find(([_, xys]) => (xys as string[]).includes(xy))?.[0];
                    return (
                    <div key={xy} className="p-4 bg-white border rounded-2xl flex justify-between items-center shadow-sm">
                        <span className="text-xs font-black">FOV {xy} ({xyCounts[xy]} GUVs)</span>
                        <select value={group || ""} onChange={(e) => setGroupings(prev => {
                        const n = {...prev}; Object.keys(n).forEach(g => n[g] = n[g].filter(i => i !== xy));
                        if (e.target.value) n[e.target.value] = [...n[e.target.value], xy];
                        return n;
                        })} className="text-[10px] font-bold bg-slate-50 px-2 py-1 rounded cursor-pointer">
                        <option value="">Assign...</option>
                        {Object.keys(groupings).map(gn => <option key={gn} value={gn}>{gn}</option>)}
                        </select>
                    </div>
                    );
                })}
                </div>
                <div className="col-span-7 grid grid-cols-2 gap-4 overflow-y-auto content-start">
                {Object.keys(groupings).map((gn, i) => (
                    <div key={gn} className="bg-white p-6 rounded-[30px] border-l-8 shadow-md" style={{ borderLeftColor: groupColorMap[gn] }}>
                    <h4 className="font-black text-lg mb-2">{gn}</h4>
                    <p className="text-[10px] text-slate-400 font-mono">{groupings[gn].length} FOVs assigned</p>
                    </div>
                ))}
                </div>
            </div>
            <div className="p-10 bg-slate-50 flex justify-end">
                <button 
                  onClick={() => { setVisibleGroups(new Set(Object.keys(groupings))); setTab('filter'); }} 
                  disabled={Object.keys(groupings).length === 0}
                  className={`px-16 py-5 rounded-3xl font-black shadow-xl active:scale-95 transition-all ${Object.keys(groupings).length > 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                    Proceed to Cleaning →
                </button>
            </div>
            </div>
        )}
      </div>
    </div>
  );

  const renderFilter = () => (
    <div className="flex-1 overflow-y-auto p-10 pb-32 bg-slate-50">
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-8 h-[800px]">
        <div className="col-span-4 flex flex-col space-y-6 h-full">
          <div className="bg-white p-8 rounded-[40px] shadow-xl flex-1 flex flex-col border border-slate-100 min-h-0 overflow-y-auto">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b pb-2">Population Filter</h4>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-1">
                 <label className="text-[9px] font-black text-slate-300 uppercase ml-2">Metric</label>
                 <select value={histField} onChange={e => setHistField(e.target.value)} className="w-full bg-slate-50 border rounded-xl px-2 py-3 text-xs font-bold outline-none ring-blue-50 focus:ring-2">
                    {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                 </select>
              </div>
              <div className="space-y-1">
                 <label className="text-[9px] font-black text-slate-300 uppercase ml-2">Statistic</label>
                 <select value={histMode} onChange={e => setHistMode(e.target.value as any)} className="w-full bg-slate-50 border rounded-xl px-2 py-3 text-xs font-bold outline-none ring-blue-50 focus:ring-2">
                    <option value="mean">Mean</option><option value="first">First</option><option value="last">Last</option><option value="min">Min</option><option value="max">Max</option><option value="cv">CV</option><option value="variance">Variance</option>
                 </select>
              </div>
            </div>
            
            <div className="flex items-center justify-between mb-4 px-2">
                <label className="text-[9px] font-black text-slate-300 uppercase">Histogram Scale</label>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setHistScale('linear')} className={`px-3 py-1 rounded-md text-[9px] font-bold transition-all ${histScale === 'linear' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>LIN</button>
                    <button onClick={() => setHistScale('log')} className={`px-3 py-1 rounded-md text-[9px] font-bold transition-all ${histScale === 'log' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>LOG</button>
                </div>
            </div>

            <div className="h-[200px] shrink-0 mb-6">
              <InteractiveHistogram features={survivedTrackFeatures} field={histField} mode={histMode} scale={histScale} range={histRange} onRangeChange={setHistRange} colorMap={groupColorMap} />
            </div>
            
            <div className="border-t pt-4 mb-4">
                <h4 className="text-[9px] font-black text-slate-300 uppercase mb-3 ml-2">Group Visibility</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(groupings).map(gn => (
                    <button 
                      key={gn}
                      onClick={() => {
                        const next = new Set(visibleGroups);
                        if (next.has(gn)) next.delete(gn); else next.add(gn);
                        setVisibleGroups(next);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-bold border transition-all ${
                        visibleGroups.has(gn) ? 'text-white border-transparent' : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}
                      style={{ backgroundColor: visibleGroups.has(gn) ? groupColorMap[gn] : undefined }}
                    >
                      {gn}
                    </button>
                  ))}
                </div>
            </div>

            <button onClick={addFilter} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg active:scale-95 transition-all">Add to Filter Pipeline</button>
          </div>
          <div className="bg-slate-900 p-8 rounded-[40px] text-white shadow-2xl h-[200px] shrink-0 overflow-y-auto border border-slate-700">
            <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">Pipeline History ({appliedFilters.length})</h4>
            <div className="space-y-2">
              {appliedFilters.length === 0 && <p className="text-[10px] text-slate-600 italic">No filters applied.</p>}
              {appliedFilters.map((f, i) => (
                <div key={i} className="flex justify-between items-center bg-slate-800 px-4 py-3 rounded-2xl border border-slate-700 text-[10px]">
                  <div className="flex flex-col">
                     <span className="font-bold text-slate-200">{f.field} ({f.mode})</span>
                     <span className="font-mono text-blue-400">{f.range[0].toFixed(2)} - {f.range[1].toFixed(2)}</span>
                  </div>
                  <button onClick={() => setAppliedFilters(appliedFilters.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-red-400 px-2">×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* CHART SECTION */}
        <div className="col-span-8 bg-white p-12 rounded-[50px] shadow-2xl flex flex-col border border-slate-100 h-full relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 flex space-x-2 z-10">
             <button 
               onClick={handleExportData} 
               disabled={finalizedData.length === 0}
               className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase hover:bg-indigo-700 transition-colors shadow-lg active:scale-95 disabled:opacity-50"
             >
                💾 Export Data & Criteria
             </button>
             <button 
               onClick={refreshPlot} 
               disabled={isPlotting}
               className="bg-emerald-500 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase hover:bg-emerald-600 transition-colors shadow-lg active:scale-95 disabled:opacity-50"
             >
                {isPlotting ? 'Refreshing...' : '🔄 Refresh Plot'}
             </button>
             <button onClick={() => { setAppliedFilters([]); setHistRange([0,0]); }} className="bg-red-50 text-red-500 px-4 py-2 rounded-xl font-black text-[10px] uppercase hover:bg-red-100 transition-colors">Reset Filters</button>
          </div>
          
          <div className="flex flex-col mb-4">
             <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Visual Inspection</h4>
             <p className="text-[9px] text-slate-300 font-bold mt-1">Tracks satisfying current histogram & groups</p>
          </div>
          
          <div className="flex-1 min-h-0 relative">
             {isPlotting && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-slate-400">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <span className="text-xs font-black uppercase tracking-widest">Rendering {currentFilteredData.length} Points...</span>
                </div>
             )}
            <TemporalTrendChart data={manualPlotData} field={histField} frameField={mapping.frames} idField={mapping.id} colorMap={groupColorMap} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderFitting = () => (
    <div className="flex-1 overflow-y-auto p-10 pb-32 bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200">
            <button onClick={() => setFitMode('leakage')} className={`px-8 py-3 rounded-xl text-xs font-black uppercase transition-all ${fitMode === 'leakage' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Leakage (Pf)</button>
            <button onClick={() => setFitMode('growth')} className={`px-8 py-3 rounded-xl text-xs font-black uppercase transition-all ${fitMode === 'growth' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Growth Curve</button>
          </div>
          <button onClick={runBatchFit} disabled={isFitting} className="bg-slate-900 text-white px-12 py-4 rounded-2xl text-xs font-black uppercase shadow-xl active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {isFitting ? 'Fitting...' : '▶ Run Batch Fit'}
          </button>
        </div>

        <div className="grid grid-cols-12 gap-8 h-[750px]">
          <div className="col-span-8 bg-white p-8 rounded-[40px] shadow-2xl border border-slate-100 flex flex-col overflow-hidden relative">
            <div className="absolute top-6 right-6 z-20">
                 <button 
                   onClick={refreshFittingPlots} 
                   disabled={isFittingRefresh}
                   className="bg-emerald-500 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase hover:bg-emerald-600 transition-colors shadow-lg active:scale-95 disabled:opacity-50"
                 >
                    {isFittingRefresh ? 'Updating...' : '🔄 Refresh Plots'}
                 </button>
            </div>
            
            {(isFittingRefresh) && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-slate-400">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <span className="text-xs font-black uppercase tracking-widest">Processing Data...</span>
                </div>
             )}

            {fitMode === 'leakage' ? (
              <div className="flex-1 flex flex-col min-h-0">
                  <div className="h-[60%] border-b border-slate-50 pb-4 mb-4">
                     <MasterCurveChart traces={fittingPreviewData.traces} fitResults={fitResults} fitRange={fitRange} setFitRange={setFitRange} maxTau={maxTau} threshold={fitThreshold} colorMap={groupColorMap} />
                  </div>
                  <div className="h-[40%]">
                     <RealTimeLogChart traces={fittingPreviewData.realTime} colorMap={groupColorMap} />
                  </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                  <div className="h-[60%] border-b border-slate-50 pb-4 mb-4">
                    <GrowthFitChart results={growthResults} rawData={fittingPreviewData.growthData} mapping={mapping} radiusField={fitMapping.radius} frameInterval={frameInterval} selectedGroups={fitSelectedGroups} colorMap={groupColorMap} />
                  </div>
                  <div className="h-[40%] relative bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                     <div className="absolute top-2 right-2 z-10 flex items-center space-x-2 bg-slate-50/80 backdrop-blur px-2 py-1 rounded-lg border border-slate-100">
                         <span className="text-[9px] font-black text-slate-400 uppercase">X-Axis</span>
                         <select value={growthCorrelX} onChange={e => setGrowthCorrelX(e.target.value)} className="text-[9px] font-bold bg-transparent outline-none text-slate-700 cursor-pointer">
                            {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                         </select>
                    </div>
                    <GrowthCorrelationChart data={growthCorrelationData} xLabel={growthCorrelX} yLabel="1 - (R0/R_end)²" colorMap={groupColorMap} />
                  </div>
              </div>
            )}
          </div>

          <div className="col-span-4 flex flex-col space-y-6 h-full">
            <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl flex-shrink-0 border border-slate-800">
              <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">Physics Settings</h4>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase">Intensity Field</span>
                  <select value={fitMapping.intensity} onChange={e => setFitMapping({...fitMapping, intensity: e.target.value})} className="bg-slate-800 text-[10px] px-2 py-1 rounded border border-slate-700 outline-none w-32 truncate">
                    {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase">Radius Field</span>
                  <select value={fitMapping.radius} onChange={e => setFitMapping({...fitMapping, radius: e.target.value})} className="bg-slate-800 text-[10px] px-2 py-1 rounded border border-slate-700 outline-none w-32 truncate">
                    {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                {fitMode === 'leakage' && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase">Pw (cm/s)</span>
                      <input type="number" value={pwValue} onChange={e => setPwValue(Number(e.target.value))} step="0.0001" className="bg-slate-800 text-[10px] px-2 py-1 rounded border border-slate-700 outline-none w-20 text-right" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase">Threshold</span>
                      <input type="number" value={fitThreshold} onChange={e => setFitThreshold(Number(e.target.value))} step="0.0001" className="bg-slate-800 text-[10px] px-2 py-1 rounded border border-slate-700 outline-none w-20 text-right" />
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-[9px] font-black text-slate-500 uppercase">Bg Correction</span>
                       <input type="number" value={fitBgValue} onChange={e => setFitBgValue(Number(e.target.value))} className="bg-slate-800 text-[10px] px-2 py-1 rounded border border-slate-700 outline-none w-20 text-right" />
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase">Frame dt (s)</span>
                  <input type="number" value={frameInterval} onChange={e => setFrameInterval(Number(e.target.value))} step="0.1" className="bg-slate-800 text-[10px] px-2 py-1 rounded border border-slate-700 outline-none w-20 text-right" />
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800">
                  <h4 className="text-[9px] font-black text-slate-500 uppercase mb-2">Active Groups</h4>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(visibleGroups).map((gn, i) => (
                        <label key={gn} className={`px-2 py-1 rounded border text-[8px] font-bold cursor-pointer transition-all ${fitSelectedGroups.has(gn) ? 'text-white border-transparent' : 'bg-slate-800 border-slate-700 text-slate-500'}`} style={{ backgroundColor: fitSelectedGroups.has(gn) ? groupColorMap[gn] : undefined }}>
                            <input type="checkbox" className="hidden" checked={fitSelectedGroups.has(gn)} onChange={() => {
                                const next = new Set(fitSelectedGroups);
                                if (next.has(gn)) next.delete(gn); else next.add(gn);
                                setFitSelectedGroups(next);
                            }} />
                            {gn}
                        </label>
                    ))}
                  </div>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[40px] shadow-xl flex-1 border border-slate-100 overflow-y-auto min-h-0">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Results</h4>
              <div className="space-y-4 h-[250px]">
                {fitMode === 'leakage' ? (
                  <>
                    <SimpleDistributionChart data={fitResults.map(r => ({ group: r.group, value: r.pf_val }))} title="Permeability (Pf)" colorMap={groupColorMap} />
                    <SimpleDistributionChart data={fitResults.map(r => ({ group: r.group, value: r.r2 }))} title="Fit R²" colorMap={groupColorMap} />
                  </>
                ) : (
                  <>
                    <SimpleDistributionChart data={growthResults.map(r => ({ group: r.group, value: r.k }))} title="Growth Rate (k)" colorMap={groupColorMap} />
                    <SimpleDistributionChart data={growthResults.map(r => ({ group: r.group, value: r.r_inf }))} title="Final Radius (R∞)" colorMap={groupColorMap} />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const getMetricValue = (row: any, field: string, mode: string, isFit: boolean) => {
      if (isFit) return row.fitParams?.[field];
      return row.stats?.[field]?.[mode];
  };

  const calculateDerivedValue = (
    row: any, 
    mainField: string, mainMode: string, mainIsFit: boolean,
    normField: string, normMode: string, normIsFit: boolean
  ) => {
      const val = getMetricValue(row, mainField, mainMode, mainIsFit);
      if (val == null || isNaN(val)) return null;

      if (!normField) return val;

      const norm = getMetricValue(row, normField, normMode, normIsFit);
      if (norm == null || isNaN(norm) || norm === 0) return null;

      return val / norm;
  };

  const renderAnalytics = () => {
    // --- 1. Prepare Data with Normalization ---
    const isMainFit = !!analyticsOptions.find(o => o.label === analyticsField)?.isFit;
    const isNormFit = !!analyticsOptions.find(o => o.label === normalizationField)?.isFit;

    // Group Comparison Data Preparation
    const rawComparisonData: Record<string, number[]> = {};
    analyticsData.forEach(tf => {
        if (!analyticsVisibleGroups.has(tf.group)) return;
        const val = calculateDerivedValue(
            tf, 
            analyticsField, analyticsMode, isMainFit,
            normalizationField, normalizationMode, isNormFit
        );
        if (val != null) {
            if (!rawComparisonData[tf.group]) rawComparisonData[tf.group] = [];
            rawComparisonData[tf.group].push(val);
        }
    });

    // --- 2. Apply Sigma Clipping (Comparison) ---
    const comparisonData = Object.entries(rawComparisonData).map(([group, values]) => {
        if (sigmaMultiplier <= 0) return { group, values };
        
        // Calculate Mean/Std for this group
        const { mean, variance } = calculateMeanVar(values);
        const std = Math.sqrt(variance);
        
        // Filter
        const filtered = values.filter(v => Math.abs(v - mean) <= sigmaMultiplier * std);
        return { group, values: filtered };
    });

    // --- 3. Scatter Data Preparation & Sigma Clipping ---
    const isXFit = !!analyticsOptions.find(o => o.label === scatterXField)?.isFit;
    const isYFit = !!analyticsOptions.find(o => o.label === scatterYField)?.isFit;
    
    // First, gather all valid points
    const rawScatterData: Record<string, { x: number, y: number, id: string }[]> = {};
    
    analyticsData.forEach(tf => {
         if (!analyticsVisibleGroups.has(tf.group)) return;
         
         const x = getMetricValue(tf, scatterXField, scatterXMode, isXFit);
         const y = getMetricValue(tf, scatterYField, scatterYMode, isYFit);
         
         if (x != null && !isNaN(x) && y != null && !isNaN(y)) {
             if (!rawScatterData[tf.group]) rawScatterData[tf.group] = [];
             rawScatterData[tf.group].push({ x, y, id: String(tf.id) });
         }
    });

    let scatterData: { x: number, y: number, group: string, id: string }[] = [];

    // Filter Scatter Data by Sigma
    Object.entries(rawScatterData).forEach(([group, points]) => {
        if (sigmaMultiplier <= 0) {
            scatterData.push(...points.map(p => ({ ...p, group })));
            return;
        }

        const xVals = points.map(p => p.x);
        const yVals = points.map(p => p.y);
        
        const xStats = calculateMeanVar(xVals);
        const yStats = calculateMeanVar(yVals);
        const xStd = Math.sqrt(xStats.variance);
        const yStd = Math.sqrt(yStats.variance);

        const filtered = points.filter(p => {
            const xValid = Math.abs(p.x - xStats.mean) <= sigmaMultiplier * xStd;
            const yValid = Math.abs(p.y - yStats.mean) <= sigmaMultiplier * yStd;
            return xValid && yValid;
        });

        scatterData.push(...filtered.map(p => ({ ...p, group })));
    });


    return (
     <div className="flex-1 overflow-y-auto p-10 pb-32 bg-slate-50">
        <div className="max-w-7xl mx-auto space-y-8">
           <div className="flex justify-between items-center">
              <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Analytics Dashboard</h2>
              <div className="flex space-x-2 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
                  <button onClick={() => setAnalyticsTab('comparison')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${analyticsTab === 'comparison' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-600'}`}>Group Comparison</button>
                  <button onClick={() => setAnalyticsTab('scatter')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${analyticsTab === 'scatter' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-600'}`}>2D Correlation</button>
              </div>
           </div>

           <div className="grid grid-cols-12 gap-8 h-[700px]">
               <div className="col-span-3 bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl h-full flex flex-col border border-slate-800 overflow-y-auto">
                  <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">Plot Configuration</h4>
                  
                  {analyticsTab === 'comparison' ? (
                      <div className="space-y-6">
                        <div>
                            <label className="block text-[9px] font-black text-slate-500 uppercase mb-2">Y-Axis Metric</label>
                            <select value={analyticsField} onChange={e => setAnalyticsField(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-xs font-bold outline-none focus:border-blue-500">
                                {analyticsOptions.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                            </select>
                        </div>
                        {!analyticsOptions.find(o => o.label === analyticsField)?.isFit && (
                            <div>
                                <label className="block text-[9px] font-black text-slate-500 uppercase mb-2">Aggregation Mode</label>
                                <select value={analyticsMode} onChange={e => setAnalyticsMode(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-xs font-bold outline-none focus:border-blue-500">
                                    <option value="mean">Mean</option><option value="first">First</option><option value="last">Last</option><option value="min">Min</option><option value="max">Max</option><option value="cv">CV</option><option value="variance">Variance</option>
                                </select>
                            </div>
                        )}
                        
                        {/* Normalization Control */}
                        <div className="pt-4 border-t border-slate-800">
                            <label className="block text-[9px] font-black text-emerald-500 uppercase mb-2">Normalization (Optional)</label>
                            <select value={normalizationField} onChange={e => setNormalizationField(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-xs font-bold outline-none focus:border-emerald-500 mb-2">
                                <option value="">None (Raw Data)</option>
                                {analyticsOptions.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                            </select>
                            {normalizationField && !analyticsOptions.find(o => o.label === normalizationField)?.isFit && (
                                <select value={normalizationMode} onChange={e => setNormalizationMode(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-[10px] font-bold outline-none focus:border-emerald-500">
                                    <option value="mean">Mean</option><option value="first">First</option><option value="last">Last</option><option value="min">Min</option><option value="max">Max</option>
                                </select>
                            )}
                        </div>

                        {/* Y-Axis Scale & Range */}
                        <div className="pt-4 border-t border-slate-800">
                           <div className="flex justify-between items-center mb-2">
                              <label className="text-[9px] font-black text-slate-500 uppercase">Scale</label>
                              <div className="flex space-x-2">
                                  <button onClick={() => setBoxPlotScale('linear')} className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${boxPlotScale === 'linear' ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-700 text-slate-500'}`}>LIN</button>
                                  <button onClick={() => setBoxPlotScale('log')} className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${boxPlotScale === 'log' ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-700 text-slate-500'}`}>LOG</button>
                              </div>
                           </div>
                           <label className="block text-[9px] font-black text-slate-500 uppercase mb-2">Y-Axis Range</label>
                           <div className="flex items-center space-x-2 mb-2">
                              <input type="checkbox" checked={boxPlotYRange.auto} onChange={e => setBoxPlotYRange({...boxPlotYRange, auto: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700" />
                              <span className="text-[10px] text-slate-300">Auto</span>
                           </div>
                           {!boxPlotYRange.auto && (
                              <div className="flex space-x-2">
                                  <input type="number" placeholder="Min" value={boxPlotYRange.min} onChange={e => setBoxPlotYRange({...boxPlotYRange, min: Number(e.target.value)})} className="w-1/2 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-white" />
                                  <input type="number" placeholder="Max" value={boxPlotYRange.max} onChange={e => setBoxPlotYRange({...boxPlotYRange, max: Number(e.target.value)})} className="w-1/2 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-white" />
                              </div>
                           )}
                        </div>
                      </div>
                  ) : (
                      <div className="space-y-6">
                         {/* X Axis */}
                         <div className="border-b border-slate-800 pb-4">
                            <label className="block text-[9px] font-black text-blue-400 uppercase mb-2">X-Axis</label>
                            <select value={scatterXField} onChange={e => setScatterXField(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none mb-2">
                                {analyticsOptions.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                            </select>
                            {!analyticsOptions.find(o => o.label === scatterXField)?.isFit && (
                                <select value={scatterXMode} onChange={e => setScatterXMode(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[10px] font-bold outline-none mb-2">
                                    <option value="mean">Mean</option><option value="first">First</option><option value="last">Last</option><option value="max">Max</option>
                                </select>
                            )}
                            {/* X-Range */}
                            <div className="mt-2">
                                <div className="flex items-center space-x-2 mb-1">
                                    <input type="checkbox" checked={scatterXRange.auto} onChange={e => setScatterXRange({...scatterXRange, auto: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700" />
                                    <span className="text-[9px] text-slate-300">Auto Range</span>
                                </div>
                                {!scatterXRange.auto && (
                                    <div className="flex space-x-2">
                                        <input type="number" placeholder="Min" value={scatterXRange.min} onChange={e => setScatterXRange({...scatterXRange, min: Number(e.target.value)})} className="w-1/2 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-white" />
                                        <input type="number" placeholder="Max" value={scatterXRange.max} onChange={e => setScatterXRange({...scatterXRange, max: Number(e.target.value)})} className="w-1/2 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-white" />
                                    </div>
                                )}
                            </div>
                         </div>
                         {/* Y Axis */}
                         <div>
                            <label className="block text-[9px] font-black text-blue-400 uppercase mb-2">Y-Axis</label>
                            <select value={scatterYField} onChange={e => setScatterYField(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none mb-2">
                                {analyticsOptions.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                            </select>
                            {!analyticsOptions.find(o => o.label === scatterYField)?.isFit && (
                                <select value={scatterYMode} onChange={e => setScatterYMode(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[10px] font-bold outline-none mb-2">
                                    <option value="mean">Mean</option><option value="first">First</option><option value="last">Last</option><option value="max">Max</option>
                                </select>
                            )}
                            {/* Y-Range */}
                            <div className="mt-2">
                                <div className="flex items-center space-x-2 mb-1">
                                    <input type="checkbox" checked={scatterYRange.auto} onChange={e => setScatterYRange({...scatterYRange, auto: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700" />
                                    <span className="text-[9px] text-slate-300">Auto Range</span>
                                </div>
                                {!scatterYRange.auto && (
                                    <div className="flex space-x-2">
                                        <input type="number" placeholder="Min" value={scatterYRange.min} onChange={e => setScatterYRange({...scatterYRange, min: Number(e.target.value)})} className="w-1/2 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-white" />
                                        <input type="number" placeholder="Max" value={scatterYRange.max} onChange={e => setScatterYRange({...scatterYRange, max: Number(e.target.value)})} className="w-1/2 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-white" />
                                    </div>
                                )}
                            </div>
                         </div>
                      </div>
                  )}

                  {/* Outlier Filter - Common to both tabs */}
                  <div className="pt-6 border-t border-slate-800">
                     <label className="block text-[9px] font-black text-red-400 uppercase mb-3">Outlier Filter (Sigma Clipping)</label>
                     <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setSigmaMultiplier(0)} className={`px-2 py-2 rounded-lg text-[10px] font-bold transition-all ${sigmaMultiplier === 0 ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>None</button>
                        <button onClick={() => setSigmaMultiplier(1)} className={`px-2 py-2 rounded-lg text-[10px] font-bold transition-all ${sigmaMultiplier === 1 ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>1σ</button>
                        <button onClick={() => setSigmaMultiplier(2)} className={`px-2 py-2 rounded-lg text-[10px] font-bold transition-all ${sigmaMultiplier === 2 ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>2σ</button>
                        <button onClick={() => setSigmaMultiplier(3)} className={`px-2 py-2 rounded-lg text-[10px] font-bold transition-all ${sigmaMultiplier === 3 ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>3σ</button>
                     </div>
                  </div>

                  <div className="mt-auto border-t border-slate-800 pt-6">
                     <h4 className="text-[9px] font-black text-slate-500 uppercase mb-3">Visible Groups</h4>
                     <div className="flex flex-wrap gap-2">
                        {Array.from(visibleGroups).map((gn, i) => (
                            <button 
                                key={gn} 
                                onClick={() => {
                                    const next = new Set(analyticsVisibleGroups);
                                    if(next.has(gn)) next.delete(gn); else next.add(gn);
                                    setAnalyticsVisibleGroups(next);
                                }}
                                className={`px-2 py-1 rounded border text-[9px] font-bold transition-all ${analyticsVisibleGroups.has(gn) ? 'text-white border-transparent' : 'bg-slate-800 border-slate-700 text-slate-500'}`} 
                                style={{ backgroundColor: analyticsVisibleGroups.has(gn) ? groupColorMap[gn] : undefined }}
                            >
                                {gn}
                            </button>
                        ))}
                     </div>
                  </div>
               </div>

               <div className="col-span-9 bg-white rounded-[40px] shadow-2xl border border-slate-100 p-8 flex flex-col">
                   {analyticsTab === 'comparison' ? (
                       <BoxPlotChart 
                          data={comparisonData} 
                          colorMap={groupColorMap} 
                          showPoints={true} 
                          yRange={boxPlotYRange}
                          scale={boxPlotScale}
                       />
                   ) : (
                       <ScatterPlotGUV 
                          data={scatterData} 
                          xLabel={`${scatterXField} ${!analyticsOptions.find(o => o.label === scatterXField)?.isFit ? `(${scatterXMode})` : ''}`}
                          yLabel={`${scatterYField} ${!analyticsOptions.find(o => o.label === scatterYField)?.isFit ? `(${scatterYMode})` : ''}`}
                          visibleGroups={analyticsVisibleGroups}
                          xRange={scatterXRange}
                          yRange={scatterYRange}
                        />
                   )}
               </div>
           </div>
        </div>
     </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans select-none text-slate-900">
      <Sidebar currentTab={currentTab} setTab={setTab} onResetSession={resetSession} dataActive={rawData.length > 0} />
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-20 bg-white/90 backdrop-blur-xl border-b border-slate-200 px-12 flex items-center justify-between shadow-sm z-50 shrink-0">
          <div className="flex items-center space-x-4">
             <span className="font-black text-slate-900 text-3xl tracking-tighter">GUV Studio</span>
             {rawData.length > 0 && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-200 uppercase tracking-widest">Session Active</span>}
          </div>
          <div className="flex space-x-4 items-center">
             <div className="bg-slate-100 px-6 py-2 rounded-full border border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">Interactive Biophysics Analysis</div>
          </div>
        </header>
        {/* Content Area - Flex 1 with hidden overflow to allow children to scroll */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
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
