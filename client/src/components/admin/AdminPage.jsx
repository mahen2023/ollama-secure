import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Users, Key, BarChart2, ArrowLeft } from 'lucide-react';
import UsersTab      from './UsersTab';
import ApiKeysTab    from './ApiKeysTab';
import AnalyticsTab  from './AnalyticsTab';

const TABS = [
  { id: 'users',     label: 'Users',     icon: Users     },
  { id: 'apikeys',   label: 'API Keys',  icon: Key       },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
];

export default function AdminPage() {
  const [tab, setTab] = useState('users');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#212121] flex flex-col">
      {/* Header */}
      <div className="border-b border-[#2a2a2a] bg-[#171717] px-6 py-4 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-[#8e8ea0] hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to chat
        </button>

        <div className="h-5 w-px bg-[#2a2a2a]" />

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <h1 className="text-white font-semibold">Admin Panel</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-[#2a2a2a] bg-[#171717] px-6 flex gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
              ${tab === id
                ? 'border-[#10a37f] text-white'
                : 'border-transparent text-[#8e8ea0] hover:text-white'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {tab === 'users'     && <UsersTab />}
          {tab === 'apikeys'   && <ApiKeysTab />}
          {tab === 'analytics' && <AnalyticsTab />}
        </div>
      </div>
    </div>
  );
}
