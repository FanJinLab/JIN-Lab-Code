
import React from 'react';

interface SidebarProps {
  currentTab: string;
  setTab: (tab: string) => void;
  onResetSession: (e?: React.MouseEvent) => void;
  dataActive: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, setTab, onResetSession, dataActive
}) => {
  const tabs = [
    { id: 'import', label: '1. Import', icon: '📥' },
    { id: 'filter', label: '2. Clean & Filter', icon: '🔍' },
    { id: 'fitting', label: '3. Permeability Fit', icon: '📈' },
    { id: 'analytics', label: '4. Summary Results', icon: '📊' },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-full border-r border-slate-700 z-[100] shadow-2xl flex-shrink-0">
      <div className="p-8">
        <h1 className="text-2xl font-black tracking-tighter text-blue-400">GUV Studio</h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase font-black tracking-widest opacity-60">Biophysics Analysis Suite</p>
      </div>
      
      <nav className="flex-1 px-4 py-4 space-y-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl transition-all duration-300 group ${
              currentTab === tab.id 
              ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/40 translate-x-1' 
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className={`text-xl transition-transform group-hover:scale-125 ${currentTab === tab.id ? 'scale-110' : ''}`}>{tab.icon}</span>
            <span className="font-black text-xs uppercase tracking-tight">{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-6 space-y-2">
        {dataActive && (
          <div className="pt-4 border-t border-slate-800">
            <button 
              onClick={(e) => onResetSession(e)}
              className="w-full flex items-center space-x-3 px-5 py-4 rounded-2xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all font-black text-[10px] uppercase tracking-widest border border-transparent hover:border-red-900/30"
            >
              <span>🔄</span>
              <span>New Session</span>
            </button>
          </div>
        )}
        <div className="p-4 text-[9px] text-slate-600 text-center font-bold uppercase tracking-widest opacity-40">
          Core Engine v1.2.0
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
