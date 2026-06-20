import { useState, useEffect } from 'react';
import { Key, Trash2, RefreshCw } from 'lucide-react';
import { useStore } from '../../store';
import { getAdminApiKeys, revokeAdminApiKey } from '../../api/admin';

export default function ApiKeysTab() {
  const { token } = useStore();
  const [keys,    setKeys]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = () => {
    setLoading(true);
    getAdminApiKeys(token)
      .then(setKeys)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const revoke = async (id, name) => {
    if (!confirm(`Revoke key "${name}"? Any app using it will immediately lose access.`)) return;
    try {
      await revokeAdminApiKey(token, id);
      setKeys((prev) => prev.filter((k) => k._id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-20 text-[#555]">
      <RefreshCw className="w-5 h-5 animate-spin" /> Loading keys…
    </div>
  );

  if (keys.length === 0) return (
    <div className="text-center py-16 border border-dashed border-[#2a2a2a] rounded-xl">
      <Key className="w-10 h-10 text-[#2a2a2a] mx-auto mb-3" />
      <p className="text-[#555] text-sm">No active API keys</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a2a]">
              {['Key', 'Owner', 'Requests', 'Tokens', 'Last Used', 'Created', ''].map((h) => (
                <th key={h} className="text-left text-xs text-[#555] font-medium pb-3 pr-4 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e1e]">
            {keys.map((k) => (
              <tr key={k._id} className="group">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
                    <div>
                      <p className="text-white font-medium text-sm">{k.name}</p>
                      <p className="text-[#555] text-xs font-mono">
                        {k.keyPrefix}<span className="opacity-40">{'•'.repeat(16)}</span>
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4 text-[#8e8ea0] text-sm">{k.username}</td>
                <td className="py-3 pr-4 text-[#8e8ea0] text-xs tabular-nums">
                  {(k.usage?.requests ?? 0).toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-[#8e8ea0] text-xs tabular-nums">
                  {(k.usage?.tokens ?? 0).toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-[#555] text-xs whitespace-nowrap">
                  {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : 'Never'}
                </td>
                <td className="py-3 pr-4 text-[#555] text-xs whitespace-nowrap">
                  {new Date(k.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => revoke(k._id, k.name)}
                    title="Revoke key"
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-[#555] hover:text-red-400
                               hover:bg-red-400/10 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#555]">
        Admins can create API keys in Settings → API Keys. Keys grant access to <code className="font-mono">/v1/*</code>.
      </p>
    </div>
  );
}
