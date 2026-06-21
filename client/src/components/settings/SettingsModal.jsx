import { useState } from 'react';
import { X, MessageSquare, Sliders, Layers, Zap, Trash2, AlertTriangle, Info, UserCircle, KeyRound, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store';
import { clearMessages } from '../../api/chats';
import { changePassword, deleteAccount } from '../../api/auth';
import ApiKeysManager from './ApiKeysManager';

function Toggle({ value, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-[#10a37f]' : 'bg-[#3a3a3a]'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[#10a37f]" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function SettingsModal() {
  const {
    token, user, settings, updateSettings,
    setSettingsOpen, currentChatId, chats,
    setCurrentChat,
  } = useStore();

  // API Keys tab is admin-only
  const TABS = ['General', 'Advanced', ...(user?.role === 'admin' ? ['API Keys'] : []), 'Account', 'Danger'];

  const [local, setLocal] = useState(() => ({
    ...settings,
    // Guard: if a pre-existing user doc lacks these fields, fall back to safe defaults
    contextLength: Number.isFinite(settings.contextLength) && settings.contextLength > 0
      ? settings.contextLength : 4096,
    temperature: Number.isFinite(settings.temperature) ? settings.temperature : 0.7,
  }));
  const [tab,          setTab]          = useState('General');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing,     setClearing]     = useState(false);

  // Delete account form
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletePw,      setDeletePw]      = useState('');
  const [showDeletePw,  setShowDeletePw]  = useState(false);
  const [deleteBusy,    setDeleteBusy]    = useState(false);
  const [deleteError,   setDeleteError]   = useState('');

  // Password change form
  const [pwForm,    setPwForm]    = useState({ current: '', next: '', confirm: '' });
  const [pwShow,    setPwShow]    = useState({ current: false, next: false, confirm: false });
  const [pwBusy,    setPwBusy]    = useState(false);
  const [pwError,   setPwError]   = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const patchPw = (key, val) => { setPwForm((p) => ({ ...p, [key]: val })); setPwError(''); setPwSuccess(false); };
  const togglePwShow = (key) => setPwShow((p) => ({ ...p, [key]: !p[key] }));

  const submitPasswordChange = async () => {
    if (!pwForm.current)  return setPwError('Enter your current password');
    if (!pwForm.next)     return setPwError('Enter a new password');
    if (pwForm.next.length < 6) return setPwError('New password must be at least 6 characters');
    if (pwForm.next !== pwForm.confirm) return setPwError('New passwords do not match');
    setPwBusy(true);
    setPwError('');
    try {
      const data = await changePassword(token, { current: pwForm.current, newPassword: pwForm.next });
      // Swap to the fresh token returned by the server — the old one is now invalidated
      if (data?.token) useStore.getState().refreshToken(data.token);
      setPwSuccess(true);
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePw) return setDeleteError('Password is required');
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deleteAccount(token, deletePw);
      useStore.getState().logout();
    } catch (err) {
      setDeleteError(err.message);
      setDeleteBusy(false);
    }
  };

  const currentChat = chats.find((c) => c._id === currentChatId);
  const patch = (key, value) => setLocal((p) => ({ ...p, [key]: value }));

  const save = () => {
    updateSettings({
      ...local,
      // Normalise numerics before persisting so we never write null/NaN to the DB
      contextLength: Math.max(512, Math.round(local.contextLength || 4096)),
      temperature:   Math.round(Math.max(0, Math.min(2, local.temperature ?? 0.7)) * 10) / 10,
    });
    setSettingsOpen(false);
  };

  const handleClearMessages = async () => {
    if (!currentChatId || !token) return;
    setClearing(true);
    try {
      await clearMessages(token, currentChatId);
      // Update local currentChat
      useStore.setState((s) => ({
        currentChat: s.currentChat ? { ...s.currentChat, messages: [] } : null,
      }));
      setConfirmClear(false);
    } catch { /* silent */ } finally {
      setClearing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}
    >
      <div className="bg-[#212121] border border-[#3a3a3a] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a] shrink-0">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button onClick={() => setSettingsOpen(false)}
            className="text-[#8e8ea0] hover:text-white transition-colors p-1 rounded-lg hover:bg-[#2a2a2a]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 shrink-0 flex-wrap">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${tab === t ? 'bg-[#2f2f2f] text-white' : 'text-[#8e8ea0] hover:text-white hover:bg-[#252525]'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">

          {tab === 'General' && (
            <>
              <Section icon={MessageSquare} title="System Prompt">
                <textarea
                  value={local.systemPrompt}
                  onChange={(e) => patch('systemPrompt', e.target.value)}
                  placeholder="You are a helpful assistant…"
                  rows={4}
                  className="w-full bg-[#2a2a2a] border border-[#3a3a3a] text-[#ececec] rounded-xl px-3 py-2.5
                             focus:outline-none focus:border-[#10a37f] placeholder-[#555] text-sm resize-none"
                />
                <p className="text-xs text-[#555]">Applied at the start of every conversation.</p>
              </Section>

              <Section icon={Zap} title="Streaming">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#ececec]">Stream responses</p>
                    <p className="text-xs text-[#555] mt-0.5">Show tokens as they arrive</p>
                  </div>
                  <Toggle value={local.streamEnabled} onChange={(v) => patch('streamEnabled', v)} />
                </div>
              </Section>
            </>
          )}

          {tab === 'Advanced' && (
            <>
              <Section icon={Sliders} title="Temperature">
                <div className="flex justify-between mb-1">
                  <p className="text-sm text-[#ececec]">Randomness</p>
                  <span className="text-sm text-[#10a37f] font-mono font-semibold">{local.temperature.toFixed(1)}</span>
                </div>
                <input type="range" min="0" max="2" step="0.1"
                  value={local.temperature}
                  onChange={(e) => patch('temperature', parseFloat(e.target.value))}
                  className="w-full accent-[#10a37f] cursor-pointer" />
                <div className="flex justify-between text-xs text-[#555] mt-1">
                  <span>0 — Deterministic</span><span>2 — Very creative</span>
                </div>
              </Section>

              <Section icon={Layers} title="Context Length">
                <div className="flex items-center justify-between mb-1 gap-3">
                  <p className="text-sm text-[#ececec]">Max context tokens (num_ctx)</p>
                  <input
                    type="number"
                    value={local.contextLength}
                    min="512"
                    max="131072"
                    step="512"
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (Number.isFinite(v) && v >= 512) patch('contextLength', v);
                    }}
                    className="w-24 bg-[#2a2a2a] border border-[#3a3a3a] text-[#10a37f] font-mono
                               font-semibold text-sm text-right rounded-lg px-2 py-1
                               focus:outline-none focus:border-[#10a37f]
                               [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                               [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
                <input type="range" min="512" max="32768" step="512"
                  value={Math.min(local.contextLength, 32768)}
                  onChange={(e) => patch('contextLength', parseInt(e.target.value, 10))}
                  className="w-full accent-[#10a37f] cursor-pointer" />
                <div className="flex justify-between text-xs text-[#555] mt-1">
                  <span>512</span>
                  <span>32 768</span>
                </div>
              </Section>

              <div className="flex items-start gap-2 bg-[#1a1a1a] border border-[#3a3a3a] rounded-xl px-3 py-2.5">
                <Info className="w-4 h-4 text-[#555] mt-0.5 shrink-0" />
                <p className="text-xs text-[#555]">
                  Sets Ollama's context window size. Capped by the model's native limit.
                  Type a value above 32 768 directly — the slider covers the common range.
                </p>
              </div>
            </>
          )}

          {tab === 'API Keys' && (
            <Section icon={KeyRound} title="API Keys">
              <p className="text-xs text-[#555] -mt-1 mb-1">
                Keys grant access to <code className="font-mono text-[#8e8ea0]">/v1/*</code> — Ollama API without a user login.
                Use them to integrate with other applications or scripts.
              </p>
              <ApiKeysManager />
            </Section>
          )}

          {tab === 'Account' && (
            <>
              <Section icon={UserCircle} title="Profile">
                <div className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10a37f] to-[#1a7f64] flex items-center justify-center shrink-0">
                      <UserCircle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{user?.username}</p>
                      <p className="text-[#555] text-xs">Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</p>
                    </div>
                  </div>
                </div>
              </Section>

              <Section icon={Lock} title="Change Password">
                <div className="space-y-2.5">
                  {(['current', 'next', 'confirm']).map((key) => {
                    const labels = { current: 'Current password', next: 'New password', confirm: 'Confirm new password' };
                    return (
                      <div key={key} className="relative">
                        <input
                          type={pwShow[key] ? 'text' : 'password'}
                          value={pwForm[key]}
                          onChange={(e) => patchPw(key, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && submitPasswordChange()}
                          placeholder={labels[key]}
                          className="w-full bg-[#2a2a2a] border border-[#3a3a3a] text-[#ececec] rounded-xl
                                     px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#10a37f]
                                     placeholder-[#555] transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => togglePwShow(key)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#8e8ea0] transition-colors"
                        >
                          {pwShow[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    );
                  })}

                  {pwError && (
                    <p className="flex items-center gap-1.5 text-xs text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {pwError}
                    </p>
                  )}
                  {pwSuccess && (
                    <p className="flex items-center gap-1.5 text-xs text-[#10a37f]">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Password changed successfully
                    </p>
                  )}

                  <button
                    onClick={submitPasswordChange}
                    disabled={pwBusy}
                    className="w-full py-2.5 bg-[#10a37f] hover:bg-[#0d9270] disabled:opacity-50
                               text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {pwBusy ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </Section>
            </>
          )}

          {tab === 'Danger' && (
            <Section icon={Trash2} title="Danger zone">
              {/* Clear current chat */}
              {currentChat ? (
                <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4">
                  <p className="text-sm text-white font-medium mb-1">Clear current chat</p>
                  <p className="text-xs text-[#8e8ea0] mb-3">
                    Permanently removes all messages from <span className="text-white">"{currentChat.title}"</span>.
                  </p>
                  {confirmClear ? (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-sm text-[#8e8ea0] flex-1">This cannot be undone.</span>
                      <button
                        onClick={handleClearMessages}
                        disabled={clearing}
                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
                      >
                        {clearing ? 'Clearing…' : 'Yes, clear'}
                      </button>
                      <button onClick={() => setConfirmClear(false)}
                        className="px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] text-white text-xs rounded-lg">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmClear(true)}
                      className="flex items-center gap-2 px-3 py-2 border border-red-500/30 text-red-400
                                 hover:border-red-400 rounded-lg text-sm transition-colors">
                      <Trash2 className="w-4 h-4" /> Clear messages
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-[#555] text-xs">Open a chat to clear its messages.</p>
              )}

              {/* Delete account */}
              <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4">
                <p className="text-sm text-white font-medium mb-1">Delete account</p>
                <p className="text-xs text-[#8e8ea0] mb-3">
                  Permanently deletes your account and all chat history. This cannot be undone.
                </p>

                {deleteConfirm ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-[#8e8ea0]">
                        All your chats and data will be permanently erased.
                        Enter your password to confirm.
                      </p>
                    </div>
                    <div className="relative">
                      <input
                        type={showDeletePw ? 'text' : 'password'}
                        value={deletePw}
                        onChange={(e) => { setDeletePw(e.target.value); setDeleteError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleDeleteAccount()}
                        placeholder="Your current password"
                        autoFocus
                        className="w-full bg-[#1a1a1a] border border-red-500/30 text-[#ececec] rounded-xl
                                   px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-red-500/60
                                   placeholder-[#555] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowDeletePw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#8e8ea0]"
                      >
                        {showDeletePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {deleteError && (
                      <p className="flex items-center gap-1.5 text-xs text-red-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {deleteError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteBusy || !deletePw}
                        className="flex-1 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50
                                   text-white text-sm font-medium rounded-xl transition-colors"
                      >
                        {deleteBusy ? 'Deleting…' : 'Yes, delete my account'}
                      </button>
                      <button
                        onClick={() => { setDeleteConfirm(false); setDeletePw(''); setDeleteError(''); }}
                        className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 border border-red-500/30 text-red-400
                               hover:border-red-400 rounded-lg text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete account…
                  </button>
                )}
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#2a2a2a] shrink-0">
          <button onClick={() => setSettingsOpen(false)}
            className="px-4 py-2 text-[#8e8ea0] hover:text-white text-sm transition-colors rounded-lg hover:bg-[#2a2a2a]">
            Cancel
          </button>
          <button onClick={save}
            className="px-4 py-2 bg-[#10a37f] hover:bg-[#0d9270] text-white text-sm font-medium rounded-xl transition-colors">
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
