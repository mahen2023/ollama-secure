import { create } from 'zustand';

const TOKEN_KEY = 'ollama-token';
const USER_KEY  = 'ollama-user';

const DEFAULT_SETTINGS = {
  systemPrompt:  '',
  temperature:   0.7,
  contextLength: 4096,
  streamEnabled: true,
  selectedModel: '',
};

function loadUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); }
  catch { return null; }
}

const storedUser = loadUser();

export const useStore = create((set, get) => ({

  // ── Auth ────────────────────────────────────────────────────────────────────
  token: localStorage.getItem(TOKEN_KEY) || null,
  user:  storedUser,

  setAuth({ token, user }) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({
      token,
      user,
      settings:      { ...DEFAULT_SETTINGS, ...(user.settings ?? {}) },
      selectedModel: user.settings?.selectedModel || '',
    });
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({
      token: null, user: null,
      chats: [], currentChatId: null, currentChat: null,
      models: [], selectedModel: '',
      settings: { ...DEFAULT_SETTINGS },
    });
  },

  // ── Models ──────────────────────────────────────────────────────────────────
  models: [],
  selectedModel: storedUser?.settings?.selectedModel || '',

  setModels(models) { set({ models }); },

  setSelectedModel(model) {
    set({ selectedModel: model });
    get()._patchSettings({ selectedModel: model });
  },

  // ── Chat list (no messages — for sidebar) ───────────────────────────────────
  chats: [],
  setChats(chats) { set({ chats }); },

  prependChat(chat) {
    set((s) => ({ chats: [chat, ...s.chats] }));
  },

  updateChatMeta(id, meta) {
    set((s) => ({ chats: s.chats.map((c) => (c._id === id ? { ...c, ...meta } : c)) }));
  },

  removeChatFromList(id) {
    set((s) => ({
      chats: s.chats.filter((c) => c._id !== id),
      currentChatId: s.currentChatId === id ? null : s.currentChatId,
      currentChat:   s.currentChat?._id === id ? null : s.currentChat,
    }));
  },

  // ── Active chat (full with messages) ────────────────────────────────────────
  currentChatId: null,
  currentChat:   null,

  setCurrentChatId(id) {
    // Clears currentChat so ChatPage knows to fetch it
    set({ currentChatId: id, currentChat: id ? null : null });
  },

  setCurrentChat(chat) {
    set({ currentChat: chat, currentChatId: chat._id });
  },

  // Optimistic message operations during streaming
  appendMessage(msg) {
    set((s) => {
      if (!s.currentChat) return {};
      return {
        currentChat: {
          ...s.currentChat,
          messages: [
            ...(s.currentChat.messages ?? []),
            { _id: crypto.randomUUID(), timestamp: new Date(), ...msg },
          ],
        },
      };
    });
  },

  updateLastMessage(content) {
    set((s) => {
      if (!s.currentChat?.messages?.length) return {};
      const messages = [...s.currentChat.messages];
      messages[messages.length - 1] = { ...messages[messages.length - 1], content };
      return { currentChat: { ...s.currentChat, messages } };
    });
  },

  // ── Settings (synced to MongoDB) ────────────────────────────────────────────
  settings: { ...DEFAULT_SETTINGS, ...(storedUser?.settings ?? {}) },

  setSettings(settings) {
    set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  },

  updateSettings(updates) {
    set((s) => ({ settings: { ...s.settings, ...updates } }));
    get()._patchSettings(updates);
  },

  _patchSettings(updates) {
    const { token } = get();
    if (!token) return;
    fetch('/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(updates),
    }).catch(() => {});
  },

  // ── UI state ─────────────────────────────────────────────────────────────────
  sidebarOpen: true,
  toggleSidebar() { set((s) => ({ sidebarOpen: !s.sidebarOpen })); },

  settingsOpen: false,
  setSettingsOpen(v) { set({ settingsOpen: v }); },

  isGenerating: false,
  setIsGenerating(v) { set({ isGenerating: v }); },
}));
