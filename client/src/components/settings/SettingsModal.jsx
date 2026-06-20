import { useState } from 'react';
import { X, MessageSquare, Sliders, Layers, Zap, Trash2, AlertTriangle, Info, UserCircle, KeyRound } from 'lucide-react';
import { useStore } from '../../store';
import { clearMessages } from '../../api/chats';
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

  const [local,        setLocal]        = useState({ ...settings });
  const [tab,          setTab]          = useState('General');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing,     setClearing]     = useState(false);

  const currentChat = chats.find((c) => c._id === currentChatId);
  const patch = (key, value) => setLocal((p) => ({ ...p, [key]: value }));

  const save = () => {
    updateSettings(local);
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
                <div className="flex justify-between mb-1">
                  <p className="text-sm text-[#ececec]">Max tokens</p>
                  <span className="text-sm text-[#10a37f] font-mono font-semibold">{local.contextLength.toLocaleString()}</span>
                </div>
                <input type="range" min="512" max="32768" step="512"
                  value={local.contextLength}
                  onChange={(e) => patch('contextLength', parseInt(e.target.value))}
                  className="w-full accent-[#10a37f] cursor-pointer" />
                <div className="flex justify-between text-xs text-[#555] mt-1">
                  <span>512</span><span>32 768</span>
                </div>
              </Section>

              <div className="flex items-start gap-2 bg-[#1a1a1a] border border-[#3a3a3a] rounded-xl px-3 py-2.5">
                <Info className="w-4 h-4 text-[#555] mt-0.5 shrink-0" />
                <p className="text-xs text-[#555]">Context length is clamped by the model's native limit in Ollama.</p>
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
            <Section icon={UserCircle} title="Account">
              <div className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10a37f] to-[#1a7f64] flex items-center justify-center">
                    <UserCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{user?.username}</p>
                    <p className="text-[#555] text-xs">Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-[#555]">
                All chat history and settings are saved to MongoDB under your account.
              </p>
            </Section>
          )}

          {tab === 'Danger' && (
            <Section icon={Trash2} title="Data">
              {currentChat ? (
                <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4">
                  <p className="text-sm text-white font-medium mb-1">Clear current chat</p>
                  <p className="text-xs text-[#8e8ea0] mb-3">
                    Permanently removes all messages from <span className="text-white">"{currentChat.title}"</span> in MongoDB.
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
                <p className="text-[#555] text-sm">Open a chat to manage its messages.</p>
              )}
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
