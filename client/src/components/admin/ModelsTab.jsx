import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Download, Trash2, HardDrive, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useStore } from '../../store';
import { getAdminModels, deleteAdminModel, pullAdminModel } from '../../api/admin';

function fmtBytes(bytes) {
  if (!bytes) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// Aggregate total and completed bytes across all in-flight layers
function aggregateProgress(layers) {
  let total = 0, completed = 0;
  for (const l of Object.values(layers)) {
    total     += l.total     || 0;
    completed += l.completed || 0;
  }
  return { total, completed, pct: total ? Math.round((completed / total) * 100) : 0 };
}

export default function ModelsTab() {
  const { token } = useStore();
  const [models,   setModels]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // Pull state
  const [pullName,   setPullName]   = useState('');
  const [pulling,    setPulling]    = useState(false);
  const [pullLayers, setPullLayers] = useState({});   // { digest: { total, completed } }
  const [pullStatus, setPullStatus] = useState('');
  const [pullDone,   setPullDone]   = useState(false);
  const [pullError,  setPullError]  = useState('');
  const progressRef = useRef(null);

  // Delete state
  const [deleting, setDeleting] = useState(null); // model name being deleted

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminModels(token);
      setModels(data.models ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  // Scroll progress area to bottom on new lines
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [pullStatus, pullLayers]);

  const handlePull = async () => {
    const name = pullName.trim();
    if (!name || pulling) return;
    setPulling(true);
    setPullLayers({});
    setPullStatus('');
    setPullDone(false);
    setPullError('');
    try {
      await pullAdminModel(token, name, (data) => {
        if (data.digest) {
          setPullLayers((prev) => ({
            ...prev,
            [data.digest]: { total: data.total || 0, completed: data.completed || 0 },
          }));
        }
        if (data.status) {
          setPullStatus(data.status);
          if (data.status === 'success') {
            setPullDone(true);
            setPullName('');
            load();
          }
        }
      });
    } catch (e) {
      setPullError(e.message);
    } finally {
      setPulling(false);
    }
  };

  const handleDelete = async (name) => {
    if (!confirm(`Delete model "${name}"? This cannot be undone.`)) return;
    setDeleting(name);
    try {
      await deleteAdminModel(token, name);
      setModels((prev) => prev.filter((m) => m.name !== name));
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const prog = aggregateProgress(pullLayers);
  const hasDownloadProgress = prog.total > 0;

  return (
    <div className="space-y-6">

      {/* Pull model */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Download className="w-4 h-4 text-[#10a37f]" /> Pull model
        </h3>

        <div className="flex gap-2">
          <input
            value={pullName}
            onChange={(e) => setPullName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePull()}
            placeholder="e.g. llama3:8b, mistral:latest, phi3"
            disabled={pulling}
            className="flex-1 bg-[#2a2a2a] border border-[#3a3a3a] text-[#ececec] rounded-xl
                       px-3 py-2.5 text-sm focus:outline-none focus:border-[#10a37f]
                       placeholder-[#555] disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handlePull}
            disabled={pulling || !pullName.trim()}
            className="px-4 py-2.5 bg-[#10a37f] hover:bg-[#0d9270] disabled:opacity-50
                       text-white text-sm font-medium rounded-xl transition-colors shrink-0"
          >
            {pulling ? 'Pulling…' : 'Pull'}
          </button>
        </div>

        {/* Progress area */}
        {(pulling || pullDone || pullError) && (
          <div className="mt-4 space-y-3">
            {/* Status text */}
            <div className="flex items-center gap-2">
              {pulling && <RefreshCw className="w-3.5 h-3.5 text-[#10a37f] animate-spin shrink-0" />}
              {pullDone && <CheckCircle2 className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />}
              {pullError && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              <span className={`text-xs ${pullError ? 'text-red-400' : pullDone ? 'text-[#10a37f]' : 'text-[#8e8ea0]'}`}>
                {pullError || pullStatus || 'Connecting…'}
              </span>
            </div>

            {/* Download progress bar */}
            {hasDownloadProgress && (
              <div>
                <div className="flex justify-between text-xs text-[#555] mb-1">
                  <span>{fmtBytes(prog.completed)} / {fmtBytes(prog.total)}</span>
                  <span>{prog.pct}%</span>
                </div>
                <div className="w-full bg-[#2a2a2a] rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-[#10a37f] transition-all"
                    style={{ width: `${prog.pct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Installed models */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a2a]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[#10a37f]" />
            Installed models
            {!loading && <span className="text-[#555] font-normal">({models.length})</span>}
          </h3>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 text-[#555] hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-xs px-5 py-3 bg-red-400/5 border-b border-red-400/20">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[#555]">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : models.length === 0 ? (
          <p className="text-[#555] text-sm text-center py-12">No models installed. Pull one above.</p>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {models.map((m) => (
              <div key={m.name} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#252525] transition-colors group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium font-mono truncate">{m.name}</p>
                  <p className="text-xs text-[#555] mt-0.5">
                    {fmtBytes(m.size)}
                    {m.modified_at && (
                      <span className="ml-2 text-[#444]">· modified {timeAgo(m.modified_at)}</span>
                    )}
                    {m.details?.parameter_size && (
                      <span className="ml-2 text-[#444]">· {m.details.parameter_size}</span>
                    )}
                    {m.details?.quantization_level && (
                      <span className="ml-2 text-[#444]">· {m.details.quantization_level}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(m.name)}
                  disabled={deleting === m.name}
                  title="Delete model"
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-[#555] hover:text-red-400
                             hover:bg-red-400/10 rounded-lg transition-all disabled:opacity-50 shrink-0"
                >
                  {deleting === m.name
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
