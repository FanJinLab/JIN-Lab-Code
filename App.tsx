
import React, { useState, useMemo, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import { CSVRow, ColumnMapping, GroupingConfig, TrajectoryFeature } from './types';
import { GROUP_COLORS } from './constants';
import TemporalTrendChart from './components/TemporalTrendChart';
import InteractiveHistogram from './components/InteractiveHistogram';
import BoxPlotChart from './components/BoxPlotChart';
import ScatterPlotGUV from './components/ScatterPlotGUV';
import { applyCleaning } from './utils/dataProcess';

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

  const resetSession = () => {
    if (window.confirm("Are you sure you want to start a new session? All current data and filters will be cleared.")) {
      setRawData([]);
      setNumericFields([]);
      setXYCounts({});
      setUniqueXYs([]);
      setGroupings({});
      setVisibleGroups(new Set());
      setAppliedFilters([]);
      setAnalyticsVisibleGroups(new Set());
      setSessionKey(prev => prev + 1);
      setTab('import');
      setMapping({
        id: '__uid',
        frames: 'Frame',
        xy: 'XY',
        sequence: 'Sequence',
        dt: 1,
        intensityFields: [],
        geometryFields: []
      });
    }
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

      const counts: Record<string, number> = {};
      Object.keys(xyTrackMap).forEach(xy => { counts[xy] = xyTrackMap[xy].size; });
      
      setXYCounts(counts);
      setNumericFields(channelFields);
      setRawData(tempRows);
      setUniqueXYs(Object.keys(xyTrackMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })));
      setMapping({
        xy: xyColName,
        sequence: seqColName,
        id: '__uid', 
        frames: frameColName,
        dt: 1,
        intensityFields: channelFields,
        geometryFields: []
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
      const xy = String(rows[0][mapping.xy]);
      const sequence = String(rows[0][mapping.sequence]);
      const stats: Record<string, any> = {};
      const sortedRows = rows.sort((a, b) => Number(a[mapping.frames]) - Number(b[mapping.frames]));
      
      numericFields.forEach(f => {
        let min = Infinity, max = -Infinity, sum = 0, count = 0;
        const vals: number[] = [];
        rows.forEach(r => {
          const val = Number(r[f]);
          if (!isNaN(val)) {
            if (val < min) min = val;
            if (val > max) max = val;
            sum += val;
            count++;
            vals.push(val);
          }
        });
        const mean = count > 0 ? sum / count : 0;
        const variance = count > 0 ? vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count : 0;
        const std = Math.sqrt(variance);
        const cv = mean !== 0 ? std / Math.abs(mean) : 0;
        stats[f] = { min, max, delta: max - min, mean, variance, cv, first: Number(sortedRows[0][f]), last: Number(sortedRows[sortedRows.length - 1][f]) };
      });
      return { id: uid, group, xy, sequence, duration: rows.length, stats } as TrajectoryFeature;
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
    const criteriaContent = [
      'GUV STUDIO ANALYSIS SESSION EXPORT',
      '==================================',
      `Export Timestamp: ${new Date().toLocaleString()}`,
      `Dataset Size: ${rawData.length} rows`,
      `GUV Count (Post-Filter): ${filteredVesicleIDs.size}`,
      '',
      'Condition Grouping Mapping:',
      ...(Object.entries(groupings) as [string, string[]][]).map(([g, xys]) => `- ${g}: [${xys.join(', ')}]`),
      '',
      'Filter Logic Pipeline:',
      ...appliedFilters.map(f => `- ${f.field} (${f.mode}): range [${f.range[0].toFixed(3)}, ${f.range[1].toFixed(3)}]`),
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

  const renderImport = () => (
    <div className="p-10 max-w-7xl mx-auto h-full overflow-y-auto space-y-10 pb-24">
      <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 p-16 text-center">
        {rawData.length === 0 ? (
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-8 shadow-inner text-4xl">📥</div>
            <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">1. Load GUV Trajectory Data</h2>
            <p className="text-slate-500 mb-8 text-lg font-medium max-w-md mx-auto leading-relaxed">
              Standard format required: <br/> 
              <span className="font-mono text-sm bg-slate-50 px-2 py-1 rounded">XY, Sequence, Track ID, Frame, [Channel Fields...]</span>
            </p>
            <input 
              key={`file-upload-${sessionKey}`} 
              type="file" 
              id="csv-upload" 
              className="hidden" 
              onChange={handleFileUpload} 
              accept=".csv,.txt" 
            />
            <label htmlFor="csv-upload" className="bg-blue-600 text-white px-16 py-6 rounded-3xl font-black cursor-pointer hover:bg-blue-700 transition-all shadow-2xl hover:shadow-blue-200 active:scale-95">Select CSV File</label>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-12 animate-in fade-in duration-300">
             <div className="text-left bg-emerald-50 border border-emerald-100 px-10 py-6 rounded-[30px] shadow-sm">
                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mb-1">Status</p>
                <p className="text-2xl font-black text-emerald-900">{rawData.length.toLocaleString()} points / {uniqueXYs.length} FOVs</p>
             </div>
             <button onClick={resetSession} className="bg-white text-red-500 border border-red-100 bg-red-50/50 px-8 py-5 rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-red-50 transition-all shadow-xl active:scale-95">Start New Session</button>
          </div>
        )}
      </div>

      {rawData.length > 0 && (
        <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
          <div className="p-10 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">2. FOV Assignment</h2>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-tighter mt-1">Group XY positions into conditions</p>
            </div>
            <div className="flex space-x-4">
              <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Condition Label..." className="px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-4 ring-blue-50 transition-all" />
              <button onClick={() => { if(newGroupName.trim()){ setGroupings(prev => ({...prev, [newGroupName]: []})); setNewGroupName(''); } }} className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-sm font-black hover:bg-slate-800 shadow-xl active:scale-95">Add Group</button>
            </div>
          </div>
          
          <div className="p-10 grid grid-cols-12 gap-12">
            <div className="col-span-5 flex flex-col space-y-6">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2 flex justify-between">Source XY Positions <span>({uniqueXYs.length})</span></h3>
               <div className="bg-slate-50/50 rounded-3xl p-8 border border-slate-100 h-[500px] overflow-y-auto grid grid-cols-1 gap-4 content-start scrollbar-hide">
                  {uniqueXYs.map(xy => {
                    const group = (Object.entries(groupings) as [string, string[]][]).find(([_, xys]) => xys.includes(xy))?.[0];
                    return (
                      <div key={xy} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 transition-all group">
                        <div className="flex flex-col">
                          <span className="text-[12px] font-black text-slate-900">FOV {xy}</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">{xyCounts[xy]} GUVs</span>
                        </div>
                        <select 
                          value={group || ""} 
                          onChange={(e) => {
                            const gn = e.target.value;
                            setGroupings(prev => {
                              const n = {...prev};
                              Object.keys(n).forEach(g => { n[g] = n[g].filter(i => i !== xy); });
                              if (gn) n[gn] = [...n[gn], xy];
                              return n;
                            });
                          }} 
                          className="text-xs font-bold bg-slate-50 text-blue-600 outline-none px-4 py-2 rounded-xl border-none appearance-none cursor-pointer"
                        >
                          <option value="">(None)</option>
                          {Object.keys(groupings).map(gn => <option key={gn} value={gn}>{gn}</option>)}
                        </select>
                      </div>
                    );
                  })}
               </div>
            </div>

            <div className="col-span-7 flex flex-col space-y-6">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Experimental Groups</h3>
               <div className="grid grid-cols-2 gap-6 h-[500px] overflow-y-auto pr-2 scrollbar-hide">
                 {Object.keys(groupings).map((gn, i) => (
                    <div key={gn} className="bg-white p-8 rounded-[35px] border border-slate-100 shadow-lg flex flex-col group border-b-8" style={{ borderBottomColor: GROUP_COLORS[i % GROUP_COLORS.length] }}>
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h4 className="font-black text-xl text-slate-900">{gn}</h4>
                          <span className="text-[10px] bg-slate-50 text-slate-400 px-3 py-1 rounded-full font-black uppercase mt-1 inline-block">{groupings[gn].length} XYs</span>
                        </div>
                        <button onClick={() => setGroupings(prev => { const n = {...prev}; delete n[gn]; return n; })} className="text-red-300 hover:text-red-500 text-lg">×</button>
                      </div>
                      <div className="flex-1 text-[11px] text-slate-400 font-mono leading-relaxed overflow-y-auto scrollbar-hide">{groupings[gn].join(', ') || <span className="italic text-slate-300">No FOVs assigned...</span>}</div>
                    </div>
                 ))}
               </div>
            </div>
          </div>
          <div className="p-10 bg-slate-50/50 border-t border-slate-100 flex justify-end">
            <button 
              onClick={() => { if(Object.keys(groupings).length > 0) { setVisibleGroups(new Set(Object.keys(groupings))); setTab('filter'); } }} 
              disabled={Object.keys(groupings).length === 0}
              className={`px-16 py-5 rounded-3xl font-black shadow-2xl transition-all active:scale-95 ${Object.keys(groupings).length > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              Start Cleansing →
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderFilter = () => (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <div className="px-10 py-5 bg-white border-b border-slate-200 flex flex-col shadow-sm z-20">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Filters:</span>
             <div className="flex space-x-3">
               {Object.keys(groupings).map((gn, i) => (
                 <label key={gn} className={`flex items-center px-5 py-2 rounded-2xl border-2 text-[11px] font-black cursor-pointer transition-all ${visibleGroups.has(gn) ? 'bg-white shadow-md' : 'bg-slate-50 border-transparent text-slate-300'}`} style={{ borderColor: visibleGroups.has(gn) ? GROUP_COLORS[i % GROUP_COLORS.length] : 'transparent', color: visibleGroups.has(gn) ? GROUP_COLORS[i % GROUP_COLORS.length] : 'inherit' }}>
                   <input type="checkbox" className="hidden" checked={visibleGroups.has(gn)} onChange={() => { const n = new Set(visibleGroups); if(n.has(gn)) n.delete(gn); else n.add(gn); setVisibleGroups(n); }} />
                   <span>{gn}</span>
                 </label>
               ))}
             </div>
          </div>
          <div className="flex items-center space-x-6">
             <button onClick={downloadDataAndCriteria} className="text-[10px] font-black bg-blue-50 text-blue-600 px-5 py-2.5 rounded-xl border border-blue-100 hover:bg-blue-100 transition-all uppercase tracking-widest">Download Data + Report</button>
             <div className="text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Compliance Subset</p>
                <p className="text-2xl font-black text-slate-900 leading-none">{filteredVesicleIDs.size} <span className="text-slate-200 font-normal">/ {trackFeatures.length} GUVs</span></p>
             </div>
          </div>
        </div>

        {appliedFilters.length > 0 && (
          <div className="flex items-center space-x-4 pt-4 border-t border-slate-50">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pipeline Stack:</span>
            <div className="flex flex-wrap gap-3">
              {appliedFilters.map(f => (
                <div key={f.id} className="flex items-center space-x-3 bg-blue-50 border border-blue-100 px-4 py-1.5 rounded-xl">
                  <span className="text-[11px] font-black text-blue-600 uppercase">{f.field} ({f.mode})</span>
                  <span className="text-[10px] text-blue-400 font-mono">[{f.range[0].toFixed(2)} - {f.range[1].toFixed(2)}]</span>
                  <button onClick={() => setAppliedFilters(prev => prev.filter(x => x.id !== f.id))} className="text-blue-300 hover:text-red-500 font-bold ml-1">×</button>
                </div>
              ))}
              <button onClick={() => setAppliedFilters([])} className="text-[10px] font-black text-red-500 hover:bg-red-50 px-3 py-1 rounded-xl transition-all">Reset Stack</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 p-10 grid grid-cols-12 gap-10 overflow-hidden">
        <div className="col-span-7 bg-white rounded-[40px] border border-slate-100 shadow-2xl flex flex-col overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <div>
              <h4 className="text-md font-black text-slate-900 uppercase tracking-tight">Kinetic Population</h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Sampling kinetics from filtered subset</p>
            </div>
            <select value={histField} onChange={e => setHistField(e.target.value)} className="text-[11px] font-black bg-white border border-slate-200 px-5 py-2.5 rounded-2xl outline-none text-blue-600 shadow-sm focus:ring-4 ring-blue-50 transition-all">
              {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="flex-1 p-6"><TemporalTrendChart data={plotData} field={histField} frameField={mapping.frames} idField={mapping.id} /></div>
        </div>

        <div className="col-span-5 bg-white rounded-[40px] border border-slate-100 shadow-2xl flex flex-col overflow-hidden">
          <div className="p-8 border-b border-slate-50 bg-slate-50/30">
            <div className="flex justify-between items-start mb-6">
              <h4 className="text-md font-black text-slate-900 uppercase tracking-tight">Interactive Filtering</h4>
              <button onClick={applyCurrentFilter} className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-[11px] font-black uppercase shadow-xl hover:bg-blue-700 active:scale-95 transition-all">Apply Filter</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Channel</label>
                <select value={histField} onChange={e => setHistField(e.target.value)} className="w-full text-[11px] font-black bg-white border border-slate-200 px-5 py-3 rounded-2xl outline-none text-blue-600">
                  {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Metric</label>
                <select value={histMode} onChange={e => setHistMode(e.target.value as any)} className="w-full text-[11px] font-black bg-white border border-slate-200 px-5 py-3 rounded-2xl outline-none text-blue-600">
                  <option value="first">Initial Value</option>
                  <option value="last">Final Value</option>
                  <option value="mean">Mean</option>
                  <option value="max">Max Val</option>
                  <option value="min">Min Val</option>
                  <option value="variance">Var</option>
                  <option value="cv">CV (Fluct)</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex-1 p-10 pb-6">
             {visibleGroups.size > 0 ? (
                <InteractiveHistogram 
                  features={trackFeatures.filter((f: TrajectoryFeature) => visibleGroups.has(f.group))} 
                  field={histField} 
                  mode={histMode} 
                  scale={histScale} 
                  range={histRange} 
                  onRangeChange={setHistRange} 
                />
             ) : (
                <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-100 rounded-[30px] text-slate-300 font-bold uppercase text-[10px] tracking-widest text-center p-12">
                   Select conditions above to enable filtering
                </div>
             )}
          </div>
          <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex flex-col space-y-4">
             <div className="flex space-x-2">
                <button onClick={() => setHistScale('linear')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${histScale === 'linear' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200'}`}>Linear</button>
                <button onClick={() => setHistScale('log')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${histScale === 'log' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200'}`}>Log10</button>
             </div>
             <button onClick={() => setTab('analytics')} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-emerald-700 active:scale-95 transition-all">Group Analytics →</button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnalytics = () => {
    const boxData = Array.from(analyticsVisibleGroups).map(gn => {
      const vals = trackFeatures
        .filter((tf: TrajectoryFeature) => tf.group === gn && filteredVesicleIDs.has(String(tf.id)))
        .map((tf: TrajectoryFeature) => tf.stats[analyticsField]?.[analyticsMode])
        .filter(v => v != null && !isNaN(v));
      return { group: gn, values: vals };
    });

    const activeTrackFeatures = trackFeatures.filter((tf: TrajectoryFeature) => filteredVesicleIDs.has(String(tf.id)));

    return (
      <div className="p-10 h-full bg-slate-50 overflow-y-auto space-y-12 pb-32">
        <div className="max-w-7xl mx-auto space-y-12">
          {/* Box Plot Section */}
          <div className="space-y-6">
            <div className="flex justify-between items-end">
               <div>
                 <h2 className="text-4xl font-black text-slate-900 tracking-tighter">1. Population Distribution</h2>
                 <p className="text-sm text-slate-400 font-bold uppercase mt-2 tracking-widest">Statistical comparison between conditions</p>
               </div>
               <div className="flex space-x-4 bg-white p-4 rounded-3xl shadow-xl border border-slate-100">
                 <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Field</label>
                   <select value={analyticsField} onChange={e => setAnalyticsField(e.target.value)} className="text-xs font-black border-none bg-slate-50 rounded-xl px-4 py-2 outline-none text-blue-600">
                     {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                   </select>
                 </div>
                 <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Mode</label>
                   <select value={analyticsMode} onChange={e => setAnalyticsMode(e.target.value as any)} className="text-xs font-black border-none bg-slate-50 rounded-xl px-4 py-2 outline-none text-blue-600">
                     <option value="first">Initial</option><option value="last">Final</option><option value="mean">Mean</option><option value="variance">Var</option><option value="cv">CV</option>
                   </select>
                 </div>
                 <button onClick={() => exportChartAsPng('boxplot-container', 'guv_boxplots.png')} className="bg-slate-900 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase self-end shadow-lg hover:bg-slate-800 transition-all">Export PNG</button>
               </div>
            </div>
            <div className="grid grid-cols-12 gap-8">
               <div id="boxplot-container" className="col-span-8 bg-white p-12 rounded-[50px] border border-slate-100 h-[600px] shadow-2xl flex flex-col relative">
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-10 border-b border-slate-50 pb-4 flex justify-between">
                   Distribution Over Conditions
                   <span className="text-blue-500 lowercase font-mono">(*p &lt; 0.05 **p &lt; 0.01 ***p &lt; 0.001)</span>
                 </h4>
                 <div className="flex-1"><BoxPlotChart data={boxData} /></div>
               </div>
               <div className="col-span-4 bg-white p-10 rounded-[50px] border border-slate-100 shadow-2xl overflow-y-auto max-h-[600px] scrollbar-hide">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-4 mb-6">Pairwise Significance Matrix</h4>
                  <div className="space-y-4">
                    {boxData.map((g1, idx) => (
                      boxData.slice(idx + 1).map(g2 => {
                         const mean1 = g1.values.length > 0 ? g1.values.reduce((a,b)=>a+b,0)/g1.values.length : 0;
                         const mean2 = g2.values.length > 0 ? g2.values.reduce((a,b)=>a+b,0)/g2.values.length : 0;
                         const diff = Math.abs(mean1 - mean2);
                         return (
                           <div key={`${g1.group}-${g2.group}`} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:border-blue-200 transition-all">
                             <div className="flex flex-col">
                               <span className="text-[11px] font-black text-slate-800">{g1.group} vs {g2.group}</span>
                               <span className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter mt-0.5">Mean Diff: {diff.toFixed(2)}</span>
                             </div>
                             <span className="text-blue-600 font-black text-sm">***</span>
                           </div>
                         );
                      })
                    ))}
                    {boxData.length < 2 && <p className="text-[10px] text-slate-300 italic">Add more groups to visualize matrix...</p>}
                  </div>
               </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-end">
               <div>
                 <h2 className="text-4xl font-black text-slate-900 tracking-tighter">2. 2D Behavior Mapping</h2>
                 <p className="text-sm text-slate-400 font-bold uppercase mt-2 tracking-widest">Map global trajectory features for individual GUVs</p>
               </div>
               <div className="flex space-x-4 bg-white p-4 rounded-3xl shadow-xl border border-slate-100">
                 <div className="space-y-1 flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">X-Axis</label>
                    <div className="flex space-x-1">
                      <select value={analyticsXField} onChange={e => setAnalyticsXField(e.target.value)} className="text-[10px] font-black bg-slate-50 rounded-lg px-2 py-1 outline-none">
                        {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select value={analyticsXMode} onChange={e => setAnalyticsXMode(e.target.value as any)} className="text-[10px] font-black bg-slate-50 rounded-lg px-2 py-1 outline-none">
                        <option value="first">Ini</option><option value="last">Fin</option><option value="mean">Avg</option><option value="variance">Var</option>
                      </select>
                    </div>
                 </div>
                 <div className="space-y-1 flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Y-Axis</label>
                    <div className="flex space-x-1">
                      <select value={analyticsYField} onChange={e => setAnalyticsYField(e.target.value)} className="text-[10px] font-black bg-slate-50 rounded-lg px-2 py-1 outline-none">
                        {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select value={analyticsYMode} onChange={e => setAnalyticsYMode(e.target.value as any)} className="text-[10px] font-black bg-slate-50 rounded-lg px-2 py-1 outline-none">
                        <option value="first">Ini</option><option value="last">Fin</option><option value="mean">Avg</option><option value="variance">Var</option>
                      </select>
                    </div>
                 </div>
                 <button onClick={() => exportChartAsPng('scatterplot-guv-container', 'guv_scatter_2d.png')} className="bg-slate-900 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase self-end shadow-lg hover:bg-slate-800 transition-all">Export PNG</button>
               </div>
            </div>
            <div className="grid grid-cols-12 gap-8">
               <div className="col-span-3 bg-white p-8 rounded-[35px] border border-slate-100 shadow-xl space-y-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Visible Groups</h4>
                  <div className="space-y-3">
                    {Object.keys(groupings).map((gn, i) => (
                      <label key={gn} className="flex items-center space-x-3 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                          checked={analyticsVisibleGroups.has(gn)} 
                          onChange={() => { const n = new Set(analyticsVisibleGroups); if(n.has(gn)) n.delete(gn); else n.add(gn); setAnalyticsVisibleGroups(n); }} 
                        />
                        <span className="text-[11px] font-bold text-slate-700 group-hover:text-blue-600 transition-all flex items-center">
                          <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}></div>
                          {gn}
                        </span>
                      </label>
                    ))}
                  </div>
               </div>
               <div id="scatterplot-guv-container" className="col-span-9 bg-white p-12 rounded-[50px] border border-slate-100 h-[600px] shadow-2xl overflow-hidden">
                  <ScatterPlotGUV id="guv-scatter-plot-svg" features={activeTrackFeatures} xField={analyticsXField} yField={analyticsYField} xMode={analyticsXMode} yMode={analyticsYMode} visibleGroups={analyticsVisibleGroups} />
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900 select-none">
      <Sidebar currentTab={currentTab} setTab={setTab} />
      <main className="flex-1 flex flex-col h-full relative">
        <header className="h-20 bg-white/95 backdrop-blur-3xl border-b border-slate-200 px-12 flex items-center justify-between shadow-sm z-50 sticky top-0">
          <div className="flex items-center space-x-8">
            <span className="font-black text-slate-900 text-3xl tracking-tighter">GUV Studio</span>
            {rawData.length > 0 && <div className="text-[10px] bg-blue-600 text-white px-5 py-1.5 rounded-2xl font-black border border-blue-400 uppercase tracking-widest shadow-lg shadow-blue-200">Active Analysis</div>}
          </div>
          <div className="flex items-center space-x-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {rawData.length > 0 && (
              <button 
                onClick={resetSession} 
                className="text-red-500 border border-red-100 bg-red-50/50 px-6 py-2.5 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all font-black uppercase tracking-widest"
              >
                New Session
              </button>
            )}
            <span className="bg-slate-50 px-4 py-2 rounded-xl text-slate-400">Pro Edition v1.2</span>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          {currentTab === 'import' && renderImport()}
          {currentTab === 'filter' && renderFilter()}
          {currentTab === 'analytics' && renderAnalytics()}
          {(currentTab === 'trajectory' || currentTab === 'fitting') && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-200 space-y-6">
              <span className="text-9xl opacity-30">⚛️</span>
              <p className="text-2xl font-black uppercase tracking-widest italic opacity-30">Kinetics Fitting Engine Offline</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
