import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, Check, AlertTriangle, Terminal, RefreshCw } from 'lucide-react';
import { useStore } from '../../store';
import { listApiKeys, createApiKey, revokeApiKey } from '../../api/apikeys';
import API from '../../apiBase';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="shrink-0 text-fg-muted hover:text-white transition-colors p-1">
      {copied ? <Check className="w-4 h-4 text-brand" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function NewKeyBanner({ rawKey, onDismiss }) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-sm text-amber-400 font-medium">
          Copy this key now — it will never be shown again
        </p>
      </div>
      <div className="flex items-center gap-2 bg-ink-abyss border border-rule rounded-lg px-3 py-2">
        <code className="flex-1 text-xs text-fg font-mono break-all select-all">{rawKey}</code>
        <CopyButton text={rawKey} />
      </div>
      <button
        onClick={onDismiss}
        className="text-xs text-fg-faint hover:text-fg-muted transition-colors"
      >
        I've stored it — dismiss
      </button>
    </div>
  );
}

const CURL_EXAMPLE = (origin) => `# List models
curl ${origin}/v1/tags \\
  -H "x-api-key: ok_..."

# Chat (streaming)
curl ${origin}/v1/chat \\
  -H "x-api-key: ok_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hello!"}],"stream":true}'

# Generate
curl ${origin}/v1/generate \\
  -H "x-api-key: ok_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"llama3.2","prompt":"Hello!","stream":false}'

# Embeddings
curl ${origin}/v1/embed \\
  -H "x-api-key: ok_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"nomic-embed-text","input":"Your text here"}'

# OpenAI-compatible: point any OpenAI SDK or tool at this base URL
#   base_url = "${origin}/v1"   api_key = "ok_..."
curl ${origin}/v1/chat/completions \
  -H "Authorization: Bearer ok_..." \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"Hello!"}]}'`;

export default function ApiKeysManager() {
  const { token } = useStore();

  const [keys,       setKeys]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [newName,    setNewName]    = useState('');
  const [creating,   setCreating]   = useState(false);
  const [error,      setError]      = useState('');
  const [revealedKey, setRevealedKey] = useState(null); // plaintext key shown once

  const load = () => {
    setLoading(true);
    listApiKeys(token)
      .then(setKeys)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const data = await createApiKey(token, newName.trim());
      setRevealedKey(data.key);
      setKeys((prev) => [{
        _id: data.id, name: data.name,
        keyPrefix: data.keyPrefix, createdAt: data.createdAt, lastUsed: null,
      }, ...prev]);
      setNewName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id, name) => {
    if (!confirm(`Revoke "${name}"? Any app using it will lose access immediately.`)) return;
    setKeys((prev) => prev.filter((k) => k._id !== id));
    revokeApiKey(token, id).catch(() => {});
  };

  const serverOrigin = API || (window.location.port === '5173'
    ? 'http://localhost:3001'   // dev mode — Vite is not the server
    : window.location.origin);

  return (
    <div className="space-y-5">
      {/* Revealed key banner */}
      {revealedKey && (
        <NewKeyBanner rawKey={revealedKey} onDismiss={() => setRevealedKey(null)} />
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Key name — e.g. My App"
          maxLength={60}
          className="flex-1 bg-panel border border-rule text-white rounded-xl px-3 py-2 text-sm
                     focus:outline-none focus:border-brand placeholder-fg-faint"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand hover:bg-brand-dim
                     disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl
                     text-sm font-medium transition-colors shrink-0"
        >
          {creating
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Plus className="w-4 h-4" />}
          Generate
        </button>
      </form>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Keys list */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-fg-faint text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-panel rounded-xl">
          <Key className="w-8 h-8 text-panel mx-auto mb-2" />
          <p className="text-fg-faint text-sm">No API keys yet</p>
          <p className="text-fg-faint text-xs mt-1">Generate one above to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k._id}
              className="flex items-center gap-3 bg-ink-deep border border-panel rounded-xl px-4 py-3">
              <Key className="w-4 h-4 text-brand shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{k.name}</p>
                <p className="text-fg-faint text-xs font-mono mt-0.5">
                  {k.keyPrefix}<span className="opacity-40">{'•'.repeat(20)}</span>
                </p>
              </div>
              <div className="text-right shrink-0 mr-2">
                <p className="text-fg-faint text-xs">
                  {k.lastUsed
                    ? `Last used ${new Date(k.lastUsed).toLocaleDateString()}`
                    : 'Never used'}
                </p>
                <p className="text-fg-faint text-xs mt-0.5">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(k._id, k.name)}
                title="Revoke key"
                className="text-fg-faint hover:text-red-400 transition-colors p-1 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Usage reference */}
      <div className="border-t border-panel pt-5 space-y-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-brand" />
          <span className="text-sm font-semibold text-white">Usage</span>
          <span className="text-xs text-fg-faint ml-1">Send the key as x-api-key, or as a Bearer token for OpenAI SDKs</span>
        </div>
        <div className="relative group">
          <pre className="bg-ink-abyss border border-panel rounded-xl p-4 text-xs text-fg-muted
                         font-mono overflow-x-auto leading-5 whitespace-pre">
            {CURL_EXAMPLE(serverOrigin)}
          </pre>
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={CURL_EXAMPLE(serverOrigin)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { method: 'GET',  path: '/v1/tags',       desc: 'List available models' },
            { method: 'POST', path: '/v1/chat',       desc: 'Chat (streaming ok)' },
            { method: 'POST', path: '/v1/generate',   desc: 'Text generation' },
            { method: 'POST', path: '/v1/embed',      desc: 'Generate embeddings' },
            { method: 'POST', path: '/v1/show',       desc: 'Model details' },
            { method: 'POST', path: '/v1/chat/completions', desc: 'Chat (OpenAI format)' },
            { method: 'POST', path: '/v1/completions',      desc: 'Text completion (OpenAI format)' },
            { method: 'POST', path: '/v1/embeddings',       desc: 'Embeddings (OpenAI format)' },
            { method: 'GET',  path: '/v1/models',           desc: 'List models (OpenAI format)' },
          ].map(({ method, path, desc }) => (
            <div key={path} className="bg-ink-deep border border-panel rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`font-mono font-bold text-[10px]
                  ${method === 'GET' ? 'text-green-400' : 'text-blue-400'}`}>
                  {method}
                </span>
                <code className="text-fg-soft font-mono">{path}</code>
              </div>
              <p className="text-fg-faint mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
