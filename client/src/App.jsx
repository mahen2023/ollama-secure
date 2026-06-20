import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { verifyToken } from './api/auth';
import { listChats } from './api/chats';
import { fetchModels } from './api/ollama';
import LoginPage from './components/auth/LoginPage';
import Sidebar from './components/layout/Sidebar';
import ChatPage from './components/chat/ChatPage';
import SettingsModal from './components/settings/SettingsModal';

function RequireAuth({ children }) {
  const token = useStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function AppLayout() {
  const { settingsOpen } = useStore();
  return (
    <div className="flex h-screen bg-[#212121] overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <ChatPage />
      </main>
      {settingsOpen && <SettingsModal />}
    </div>
  );
}

export default function App() {
  const { token, logout, setChats, setModels, setSelectedModel, selectedModel, setAuth } = useStore();

  // On mount: verify stored token and load initial data
  useEffect(() => {
    if (!token) return;

    verifyToken(token)
      .then(({ user }) => {
        // Refresh user data (settings might have changed)
        setAuth({ token, user });
      })
      .catch(() => logout());
  }, []);

  // Load chats + models whenever token is valid
  useEffect(() => {
    if (!token) return;

    listChats(token)
      .then((chats) => setChats(chats))
      .catch(() => {});

    fetchModels(token)
      .then((models) => {
        setModels(models);
        const current = useStore.getState().selectedModel;
        if (!current && models.length > 0) setSelectedModel(models[0].name);
      })
      .catch(() => {});
  }, [token]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
