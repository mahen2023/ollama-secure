import { useState, useEffect } from 'react';
import { Users, Zap, BarChart2, Key, RefreshCw, TrendingUp } from 'lucide-react';
import { useStore } from '../../store';
import { getAdminAnalytics } from '../../api/admin';

function StatCard({ icon: Icon, label, value, sub, color = '#10a37f' }) {
  return (
    <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '22' }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <span className="text-xs text-[#555] font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[#555] mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ data, valueKey = 'tokens', labelKey = '_id', color = '#10a37f' }) {
  if (!data?.length) return <p className="text-[#555] text-xs text-center py-8">No data</p>;
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d, i) => {
        const pct = ((d[valueKey] || 0) / max) * 100;
        const label = d[labelKey];
        const shortLabel = typeof label === 'string' && label.includes('-')
          ? label.slice(5)   // strip year from YYYY-MM-DD
          : label;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-t-sm transition-all"
              style={{ height: `${Math.max(pct, 2)}%`, background: color, opacity: 0.8 }}
            />
            <span className="text-[9px] text-[#444] truncate w-full text-center">{shortLabel}</span>
            <div className="absolute bottom-7 left-1/2 -translate-x-1/2 bg-[#111] border border-[#333]
                            rounded px-2 py-1 text-xs text-white whitespace-nowrap opacity-0
                            group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {(d[valueKey] || 0).toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RankedTable({ rows, valueKey = 'tokens', labelKey, label = 'Name', valueLabel = 'Tokens' }) {
  if (!rows?.length) return <p className="text-[#555] text-xs text-center py-6">No data</p>;
  const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-[#444] w-4 text-right tabular-nums shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[#adadad] truncate">{r[labelKey] || '—'}</span>
              <span className="text-xs text-[#555] tabular-nums ml-2 shrink-0">
                {(r[valueKey] || 0).toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-[#2a2a2a] rounded-full h-1">
              <div
                className="h-1 rounded-full bg-[#10a37f]"
                style={{ width: `${((r[valueKey] || 0) / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsTab() {
  const { token } = useStore();
  const [data,    setData]    = useState(null);
  const [days,    setDays]    = useState(30);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = (d = days) => {
    setLoading(true);
    getAdminAnalytics(token, d)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token, days]);

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-20 text-[#555]">
      <RefreshCw className="w-5 h-5 animate-spin" /> Loading analytics…
    </div>
  );

  if (error) return (
    <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
  );

  const s = data?.summary ?? {};

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#555]">Period:</span>
        {[7, 14, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
              ${days === d ? 'bg-[#10a37f] text-white' : 'bg-[#2a2a2a] text-[#8e8ea0] hover:text-white'}`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Users}    label="Total users"       value={s.totalUsers ?? 0}
                  sub={`${s.activeUsers ?? 0} active · ${s.pendingUsers ?? 0} pending`} />
        <StatCard icon={Zap}      label={`Tokens (${s.days}d)`} value={(s.periodTokens ?? 0).toLocaleString()}
                  sub={`${(s.periodRequests ?? 0).toLocaleString()} requests`} />
        <StatCard icon={Key}      label="Active API keys"   value={s.activeKeys ?? 0}
                  color="#a78bfa" />
        <StatCard icon={TrendingUp} label="Avg tokens/req"
                  value={s.periodRequests ? Math.round(s.periodTokens / s.periodRequests).toLocaleString() : '—'}
                  color="#f59e0b" />
        <StatCard icon={BarChart2} label="Pending approval"  value={s.pendingUsers ?? 0}
                  sub="new registrations" color="#f59e0b" />
        <StatCard icon={Users}    label="Avg req/user"
                  value={s.activeUsers ? Math.round(s.periodRequests / s.activeUsers) : '—'}
                  sub={`last ${s.days} days`} color="#60a5fa" />
      </div>

      {/* Daily tokens chart */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-4">Daily token usage</h3>
        <BarChart data={data?.dailyUsage ?? []} valueKey="tokens" labelKey="_id" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Top users */}
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Top users by token usage</h3>
          <RankedTable
            rows={data?.topUsers ?? []}
            labelKey="username"
            valueKey="tokens"
            valueLabel="Tokens"
          />
        </div>

        {/* Model usage */}
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Model usage</h3>
          <RankedTable
            rows={data?.modelUsage ?? []}
            labelKey="_id"
            valueKey="requests"
            valueLabel="Requests"
          />
        </div>
      </div>

      {/* API key activity */}
      {data?.apiKeyActivity?.length > 0 && (
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">API key activity</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  {['Key', 'Requests', 'Tokens'].map((h) => (
                    <th key={h} className="text-left text-xs text-[#555] font-medium pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e1e]">
                {data.apiKeyActivity.map((k, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4">
                      <p className="text-white text-xs">{k.keyName || '—'}</p>
                      <p className="text-[#555] text-xs font-mono">{k.keyPrefix}</p>
                    </td>
                    <td className="py-2 pr-4 text-[#8e8ea0] text-xs tabular-nums">
                      {k.requests.toLocaleString()}
                    </td>
                    <td className="py-2 text-[#8e8ea0] text-xs tabular-nums">
                      {k.tokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
