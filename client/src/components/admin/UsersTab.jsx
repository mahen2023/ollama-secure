import { useState, useEffect } from 'react';
import { Check, X, Trash2, ShieldCheck, ShieldOff, UserCheck, RefreshCw, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../../store';
import { getAdminUsers, updateAdminUser, deleteAdminUser, createAdminUser } from '../../api/admin';

const STATUS_COLORS = {
  active:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  pending:   'bg-amber-500/15   text-amber-400   border-amber-500/30',
  suspended: 'bg-red-500/15     text-red-400     border-red-500/30',
};

const ROLE_COLORS = {
  admin: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  user:  'bg-[#2a2a2a]     text-[#8e8ea0]  border-[#3a3a3a]',
};

function LimitsCell({ user, onSave }) {
  const [editing, setEditing] = useState(false);
  const [daily,   setDaily]   = useState(user.limits?.dailyTokens ?? 0);
  const [total,   setTotal]   = useState(user.limits?.totalTokens ?? 0);
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(user._id, { limits: { dailyTokens: Number(daily), totalTokens: Number(total) } });
    setSaving(false);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-left text-xs text-[#8e8ea0] hover:text-white transition-colors"
      >
        <span className="block">{daily ? `${(daily/1000).toFixed(0)}k/day` : '∞/day'}</span>
        <span className="block">{total ? `${(total/1000).toFixed(0)}k total` : '∞ total'}</span>
      </button>
    );
  }

  return (
    <div className="space-y-1 min-w-[110px]">
      <input type="number" value={daily} onChange={(e) => setDaily(e.target.value)} min="0"
        placeholder="daily (0=∞)"
        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] text-white text-xs rounded px-2 py-1
                   focus:outline-none focus:border-[#10a37f]" />
      <input type="number" value={total} onChange={(e) => setTotal(e.target.value)} min="0"
        placeholder="total (0=∞)"
        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] text-white text-xs rounded px-2 py-1
                   focus:outline-none focus:border-[#10a37f]" />
      <div className="flex gap-1">
        <button onClick={save} disabled={saving}
          className="flex-1 flex items-center justify-center gap-1 text-xs bg-[#10a37f] hover:bg-[#0d9270]
                     text-white rounded px-2 py-1 disabled:opacity-50">
          {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </button>
        <button onClick={() => setEditing(false)}
          className="flex-1 flex items-center justify-center text-xs bg-[#2a2a2a] hover:bg-[#333]
                     text-[#8e8ea0] rounded px-2 py-1">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function CreateUserForm({ onCreated, onCancel }) {
  const { token } = useStore();
  const [username,  setUsername]  = useState('');
  const [password,  setPassword]  = useState('');
  const [role,      setRole]      = useState('user');
  const [showPw,    setShowPw]    = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [err,       setErr]       = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setErr('');
    try {
      const user = await createAdminUser(token, { username: username.trim(), password, role });
      onCreated(user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 space-y-3 mb-4"
    >
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-[#10a37f]" /> Create user
      </h3>

      <div className="flex flex-wrap gap-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoFocus
          className="bg-[#2a2a2a] border border-[#3a3a3a] text-[#ececec] rounded-lg
                     px-3 py-2 text-sm focus:outline-none focus:border-[#10a37f]
                     placeholder-[#555] w-44 transition-colors"
        />

        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 chars)"
            className="bg-[#2a2a2a] border border-[#3a3a3a] text-[#ececec] rounded-lg
                       px-3 py-2 pr-8 text-sm focus:outline-none focus:border-[#10a37f]
                       placeholder-[#555] w-52 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#8e8ea0]"
          >
            {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-[#2a2a2a] border border-[#3a3a3a] text-[#ececec] rounded-lg
                     px-3 py-2 text-sm focus:outline-none focus:border-[#10a37f] transition-colors"
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>

        <div className="flex gap-2 items-center">
          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="px-3 py-2 bg-[#10a37f] hover:bg-[#0d9270] disabled:opacity-50
                       text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
          >
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Create
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 bg-[#2a2a2a] hover:bg-[#333] text-[#8e8ea0] text-sm rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {err && <p className="text-red-400 text-xs">{err}</p>}
    </form>
  );
}

export default function UsersTab() {
  const { token, user: me } = useStore();
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [showCreate,  setShowCreate]  = useState(false);

  const load = () => {
    setLoading(true);
    getAdminUsers(token)
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const patch = async (id, body) => {
    try {
      const updated = await updateAdminUser(token, id, body);
      setUsers((prev) => prev.map((u) => (u._id === id ? { ...u, ...updated } : u)));
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id, username) => {
    if (!confirm(`Permanently delete user "${username}" and all their data?`)) return;
    try {
      await deleteAdminUser(token, id);
      setUsers((prev) => prev.filter((u) => u._id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-20 text-[#555]">
      <RefreshCw className="w-5 h-5 animate-spin" /> Loading users…
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Create user */}
      {showCreate ? (
        <CreateUserForm
          onCreated={(user) => { setUsers((prev) => [{ ...user, usage: { totalTokens: 0, totalRequests: 0 } }, ...prev]); setShowCreate(false); }}
          onCancel={() => setShowCreate(false)}
        />
      ) : (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-2 bg-[#1e1e1e] border border-[#2a2a2a]
                       hover:border-[#10a37f] text-[#8e8ea0] hover:text-white text-sm rounded-xl
                       transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Create user
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a2a]">
              {['User', 'Role', 'Status', 'Tokens Used', 'Requests', 'Token Limits', 'Joined', 'Actions'].map((h) => (
                <th key={h} className="text-left text-xs text-[#555] font-medium pb-3 pr-4 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e1e]">
            {users.map((u) => {
              const isSelf = u._id === me?.id;
              return (
                <tr key={u._id} className="group">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#10a37f] to-[#1a7f64]
                                      flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {u.username[0].toUpperCase()}
                      </div>
                      <span className="text-white font-medium">{u.username}</span>
                      {isSelf && <span className="text-[10px] text-[#555] italic">you</span>}
                    </div>
                  </td>

                  <td className="py-3 pr-4">
                    <span className={`text-xs border rounded-full px-2 py-0.5 font-medium ${ROLE_COLORS[u.role]}`}>
                      {u.role}
                    </span>
                  </td>

                  <td className="py-3 pr-4">
                    <span className={`text-xs border rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[u.status]}`}>
                      {u.status}
                    </span>
                  </td>

                  <td className="py-3 pr-4 text-[#8e8ea0] text-xs tabular-nums">
                    {(u.usage?.totalTokens ?? 0).toLocaleString()}
                  </td>

                  <td className="py-3 pr-4 text-[#8e8ea0] text-xs tabular-nums">
                    {(u.usage?.totalRequests ?? 0).toLocaleString()}
                  </td>

                  <td className="py-3 pr-4">
                    <LimitsCell user={u} onSave={patch} />
                  </td>

                  <td className="py-3 pr-4 text-[#555] text-xs whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>

                  <td className="py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {u.status === 'pending' && (
                        <button onClick={() => patch(u._id, { status: 'active' })} title="Approve"
                          className="p-1.5 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors">
                          <UserCheck className="w-4 h-4" />
                        </button>
                      )}
                      {u.status === 'active' && !isSelf && (
                        <button onClick={() => patch(u._id, { status: 'suspended' })} title="Suspend"
                          className="p-1.5 text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors">
                          <ShieldOff className="w-4 h-4" />
                        </button>
                      )}
                      {u.status === 'suspended' && (
                        <button onClick={() => patch(u._id, { status: 'active' })} title="Unsuspend"
                          className="p-1.5 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors">
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                      )}
                      {u.role === 'user' && (
                        <button onClick={() => patch(u._id, { role: 'admin' })} title="Make admin"
                          className="p-1.5 text-purple-400 hover:bg-purple-400/10 rounded-lg transition-colors">
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                      )}
                      {u.role === 'admin' && !isSelf && (
                        <button onClick={() => patch(u._id, { role: 'user' })} title="Revoke admin"
                          className="p-1.5 text-[#555] hover:text-[#8e8ea0] hover:bg-[#2a2a2a] rounded-lg transition-colors">
                          <ShieldOff className="w-4 h-4" />
                        </button>
                      )}
                      {!isSelf && (
                        <button onClick={() => remove(u._id, u.username)} title="Delete user"
                          className="p-1.5 text-[#555] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {users.filter((u) => u.status === 'pending').length > 0 && (
        <p className="text-xs text-amber-400/70">
          {users.filter((u) => u.status === 'pending').length} user(s) awaiting approval — hover a row to approve.
        </p>
      )}
    </div>
  );
}
