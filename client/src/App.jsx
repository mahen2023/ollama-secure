import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { useStore } from './store';
import { verifyToken } from './api/auth';
import { listChats } from './api/chats';
import { fetchModels } from './api/ollama';
import LoginPage   from './components/auth/LoginPage';
import Sidebar     from './components/layout/Sidebar';
import ChatPage    from './components/chat/ChatPage';
import SettingsModal from './components/settings/SettingsModal';
// Admin-only, so it loads on first visit instead of in every user's bundle
const AdminPage = lazy(() => import('./components/admin/AdminPage'));

// Android back button: close the top-most overlay first, then navigate back,
// and only leave the app (to the background, like Home) when there's nothing else.
function useAndroidBack() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = NativeApp.addListener('backButton', ({ canGoBack }) => {
      const s = useStore.getState();
      if (s.voiceOpen)    return s.setVoiceOpen(false);
      if (s.settingsOpen) return s.setSettingsOpen(false);
      if (s.sidebarOpen && window.innerWidth < 768) return s.setSidebarOpen(false);
      if (canGoBack)      return window.history.back();
      NativeApp.minimizeApp();
    });
    return () => { handle.then((h) => h.remove()); };
  }, []);
}

function RequireAuth({ children }) {
  const token = useStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }) {
  const user = useStore((s) => s.user);
  return user?.role === 'admin' ? children : <Navigate to="/" replace />;
}

const SHORTCUTS = [
  ['Ctrl K', 'New chat'],
  ['Ctrl /', 'Show or hide the sidebar'],
  ['Ctrl ,', 'Open settings'],
  ['Enter', 'Send message'],
  ['Shift Enter', 'New line'],
  ['/', 'Prompt templates (at the start of a message)'],
  ['?', 'Show these shortcuts'],
];

function ShortcutSheet({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-ink-deep border border-rule p-5 shadow-2xl"
      >
        <h2 id="shortcuts-title" className="text-base font-semibold text-fg mb-4">Keyboard shortcuts</h2>
        <dl className="space-y-2.5 text-sm">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="flex items-center justify-between gap-4">
              <dt className="text-fg-muted">{what}</dt>
              <dd className="flex gap-1 shrink-0">
                {keys.split(' ').map((k) => (
                  <kbd key={k} className="min-w-[1.75rem] px-1.5 py-0.5 rounded-md bg-panel border border-rule text-xs text-fg font-mono text-center">{k}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <button autoFocus onClick={onClose} className="mt-5 w-full py-2 rounded-xl bg-panel hover:bg-panel-hi text-sm text-fg transition-colors">
          Close
        </button>
      </div>
    </div>
  );
}

function AppLayout() {
  const { settingsOpen } = useStore();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Close sidebar by default on mobile; re-close if window shrinks past breakpoint
  useEffect(() => {
    const MOBILE = 768;
    if (window.innerWidth < MOBILE) useStore.getState().setSidebarOpen(false);
    const onResize = () => {
      if (window.innerWidth < MOBILE) useStore.getState().setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const inField =
        ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) ||
        document.activeElement?.contentEditable === 'true';

      if (e.key === 'Escape') { setShortcutsOpen(false); return; }
      if (e.key === '?' && !inField) { e.preventDefault(); setShortcutsOpen((v) => !v); return; }

      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      // Ctrl+K — new chat (fire even inside text fields, matches ChatGPT / Claude convention)
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        useStore.setState({ currentChat: null, currentChatId: null });
        return;
      }

      if (inField) return; // remaining shortcuts don't apply while typing

      // Ctrl+/ — toggle sidebar
      if (e.key === '/') {
        e.preventDefault();
        useStore.getState().toggleSidebar();
        return;
      }

      // Ctrl+, — open settings
      if (e.key === ',') {
        e.preventDefault();
        useStore.getState().setSettingsOpen(true);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex h-[100dvh] bg-ink overflow-hidden safe-area">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <ChatPage />
      </main>
      {settingsOpen && <SettingsModal />}
      {shortcutsOpen && <ShortcutSheet onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

export default function App() {
  const { token, logout, setChats, setModels, setSelectedModel, setAuth } = useStore();
  useAndroidBack();

  useEffect(() => {
    if (!token) return;
    verifyToken(token)
      .then(({ user }) => setAuth({ token, user }))
      .catch(() => logout());
  }, []);

  useEffect(() => {
    if (!token) return;
    listChats(token).then((chats) => setChats(chats)).catch(() => {});
    fetchModels(token).then((models) => {
      setModels(models);
      const current = useStore.getState().selectedModel;
      if (!current && models.length > 0) setSelectedModel(models[0].name);
    }).catch(() => {});
  }, [token]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin/*"
        element={
          <RequireAuth>
            <RequireAdmin>
              <Suspense fallback={null}><AdminPage /></Suspense>
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
