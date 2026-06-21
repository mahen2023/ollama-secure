import { useState, useEffect } from 'react';
import { RefreshCw, Shield } from 'lucide-react';
import { useStore } from '../../store';
import { getAuditLog } from '../../api/admin';

const ACTION_STYLE = {
  'user.create':      'bg-blue-500/10 text-blue-400',
  'user.active':      'bg-emerald-500/10 text-emerald-400',
  'user.suspended':   'bg-amber-500/10 text-amber-400',
  'user.pending':     'bg-yellow-500/10 text-yellow-400',
  'user.delete':      'bg-red-500/10 text-red-400',
  'user.role_change': 'bg-purple-500/10 text-purple-400',
  'user.update':      'bg-blue-500/10 text-blue-400',
  'model.pull':       'bg-[#10a37f]/10 text-[#10a37f]',
  'model.delete':     'bg-red-500/10 text-red-400',
};

function actionStyle(action) {
  return ACTION_STYLE[action] ?? 'bg-[#2a2a2a] text-[#8e8ea0]';
}

function describeAction(log) {
  const d = log.details ?? {};
  switch (log.action) {
    case 'user.create':      return `Created user @${d.username} as ${d.role}`;
    case 'user.active':      return `Approved @${d.username}`;
    case 'user.suspended':   return `Suspended @${d.username}`;
    case 'user.pending':     return `Set @${d.username} to pending`;
    case 'user.delete':      return `Deleted user @${d.username ?? d.targetId}`;
    case 'user.role_change': return `Changed @${d.username} role → ${d.role}`;
    case 'user.update':      return `Updated @${d.username ?? d.targetId}`;
    case 'model.pull':       return `Pulled ${d.name}`;
    case 'model.delete':     return `Deleted model ${d.name}`;
    default:                 return log.action;
  }
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const PAGE = 100;

export default function AuditLogTab() {
  const { token } = useStore();
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [skip,    setSkip]    = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState('');

  const load = async (offset = 0) => {
    setLoading(true);
    setError('');
    try {
      const data = await getAuditLog(token, { limit: PAGE, skip: offset });
      if (offset === 0) {
        setLogs(data.logs);
      } else {
        setLogs((prev) => [...prev, ...data.logs]);
      }
      setTotal(data.total);
      setSkip(offset + data.logs.length);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(0); }, [token]);

  const filtered = filter
    ? logs.filter((l) =>
        l.action.includes(filter) ||
        l.username?.includes(filter) ||
        describeAction(l).toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by action, user, or detail…"
          className="flex-1 bg-[#1e1e1e] border border-[#2a2a2a] text-[#ececec] rounded-xl
                     px-3 py-2.5 text-sm focus:outline-none focus:border-[#10a37f]
                     placeholder-[#555] transition-colors"
        />
        <button
          onClick={() => load(0)}
          disabled={loading}
          className="p-2.5 bg-[#1e1e1e] border border-[#2a2a2a] text-[#555] hover:text-white
                     hover:border-[#3a3a3a] rounded-xl transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary line */}
      <p className="text-xs text-[#555]">
        {total === 0 ? 'No entries recorded yet.' : `${total.toLocaleString()} total entr${total === 1 ? 'y' : 'ies'}`}
        {filter && filtered.length !== logs.length && ` · ${filtered.length} matching filter`}
      </p>

      {error && (
        <p className="text-red-400 text-xs bg-red-400/5 border border-red-400/20 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Log table */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[#555] text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Shield className="w-10 h-10 text-[#2a2a2a]" />
            <p className="text-[#555] text-sm">
              {filter ? 'No entries match the filter.' : 'No admin actions recorded yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#1a1a1a]">
              {filtered.map((log) => (
                <div
                  key={log._id}
                  className="flex items-start gap-4 px-5 py-3 hover:bg-[#252525] transition-colors"
                >
                  {/* Timestamp */}
                  <span className="text-xs text-[#444] shrink-0 pt-0.5 w-36 tabular-nums">
                    {fmtDate(log.createdAt)}
                  </span>

                  {/* Actor */}
                  <span className="text-xs font-mono text-[#8e8ea0] shrink-0 w-24 truncate pt-0.5">
                    {log.username ?? '—'}
                  </span>

                  {/* Action badge */}
                  <span className={`text-[11px] font-medium rounded-md px-2 py-0.5 shrink-0 ${actionStyle(log.action)}`}>
                    {log.action}
                  </span>

                  {/* Description */}
                  <span className="text-xs text-[#ececec] flex-1 pt-0.5 min-w-0 truncate">
                    {describeAction(log)}
                  </span>

                  {/* IP */}
                  {log.ip && (
                    <span className="text-[11px] text-[#444] shrink-0 font-mono pt-0.5">{log.ip}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Load more */}
            {skip < total && (
              <div className="px-5 py-3 border-t border-[#1a1a1a] flex items-center justify-between">
                <span className="text-xs text-[#555]">Showing {logs.length} of {total}</span>
                <button
                  onClick={() => load(skip)}
                  disabled={loading}
                  className="text-xs text-[#10a37f] hover:underline disabled:opacity-50 flex items-center gap-1"
                >
                  {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
