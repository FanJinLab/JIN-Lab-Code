
import React from 'react';

interface SidebarProps {
  currentTab: string;
  setTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentTab, setTab }) => {
  const tabs = [
    { id: 'import', label: '1. Import', icon: '📥' },
    { id: 'filter', label: '2. Clean & Filter', icon: '🔍' },
    { id: 'trajectory', label: '3. Trajectory & Fit', icon: '📈' },
    { id: 'analytics', label: '4. Fit Analytics', icon: '📊' },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-full border-r border-slate-700">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight text-blue-400">GUV Analytics</h1>
        <p className="text-xs text-slate-400 mt-1">v1.0.0 Experimental</p>
      </div>
      
      <nav className="flex-1 px-4 py-4 space-y-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
              currentTab === tab.id 
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-6 border-t border-slate-800 text-xs text-slate-500 text-center">
        Scientific Data Processing
      </div>
    </div>
  );
};

export default Sidebar;
