import { useEffect } from 'react';
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
import AdminPage   from './components/admin/AdminPage';

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

function AppLayout() {
  const { settingsOpen } = useStore();

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
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const inField =
        ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) ||
        document.activeElement?.contentEditable === 'true';

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
    <div className="flex h-[100dvh] bg-[#212121] overflow-hidden safe-area">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <ChatPage />
      </main>
      {settingsOpen && <SettingsModal />}
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
              <AdminPage />
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
