import { useEffect, useRef, useCallback } from 'react';
import { Bot, Code2, Globe, Zap, Lightbulb } from 'lucide-react';
import { useStore } from '../../store';
import { fetchModels, streamChat, generateTitle } from '../../api/ollama';
import { createChat, getChat, patchChat, appendMessages } from '../../api/chats';
import MessageList from './MessageList';
import ChatInput from './ChatInput';

const SUGGESTIONS = [
  { icon: Code2,     prompt: 'Write a Python function that reads a CSV and returns summary statistics.' },
  { icon: Globe,     prompt: 'Translate "Hello, how are you?" into French, Spanish, and Japanese.' },
  { icon: Zap,       prompt: 'Summarize the key differences between REST and GraphQL APIs.' },
  { icon: Lightbulb, prompt: 'Explain how transformers work in machine learning, simply.' },
];

export default function ChatPage() {
  const {
    token, selectedModel, models, setModels, setSelectedModel,
    chats, currentChatId, currentChat,
    setCurrentChat, prependChat, updateChatMeta,
    appendMessage, updateLastMessage,
    settings, isGenerating, setIsGenerating,
  } = useStore();

  const abortRef  = useRef(null);
  const accumRef  = useRef('');

  // Load full chat (with messages) when currentChatId changes
  useEffect(() => {
    if (!currentChatId || !token) return;
    let cancelled = false;
    getChat(token, currentChatId)
      .then((chat) => { if (!cancelled) setCurrentChat(chat); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentChatId, token]);

  // Reload models after auth (fallback if App.jsx hasn't fired yet)
  useEffect(() => {
    if (!token || models.length > 0) return;
    fetchModels(token).then((m) => {
      setModels(m);
      if (!selectedModel && m.length > 0) setSelectedModel(m[0].name);
    }).catch(() => {});
  }, [token]);

  const handleSend = useCallback(async (content) => {
    const state = useStore.getState();
    const { token, selectedModel, settings, currentChatId, currentChat,
            setCurrentChat, prependChat, updateChatMeta,
            appendMessage, updateLastMessage, setIsGenerating } = state;

    if (!token || !selectedModel) return;

    let chatId = currentChatId;

    // Create a new chat in MongoDB if there's no active one
    if (!chatId) {
      const newChat = await createChat(token, { title: 'New Chat', model: selectedModel })
        .catch(() => null);
      if (!newChat) return;
      prependChat(newChat);
      setCurrentChat({ ...newChat, messages: [] });
      chatId = newChat._id;
    }

    // Snapshot history before adding new messages
    const history = (useStore.getState().currentChat?.messages ?? [])
      .map((m) => ({ role: m.role, content: m.content }));
    const isFirstMessage = history.length === 0;

    // Optimistic UI
    appendMessage({ role: 'user',      content });
    appendMessage({ role: 'assistant', content: '' });
    setIsGenerating(true);
    accumRef.current = '';

    // Persist user message to MongoDB immediately
    appendMessages(token, chatId, [{ role: 'user', content }]).catch(() => {});

    abortRef.current = new AbortController();

    try {
      if (settings.streamEnabled) {
        await streamChat({
          token,
          model: selectedModel,
          messages: [...history, { role: 'user', content }],
          systemPrompt: settings.systemPrompt,
          temperature:  settings.temperature,
          signal: abortRef.current.signal,
          onChunk(chunk) {
            accumRef.current += chunk;
            useStore.getState().updateLastMessage(accumRef.current);
          },
          async onDone() {
            const response = accumRef.current;
            // Persist AI response to MongoDB
            appendMessages(token, chatId, [{ role: 'assistant', content: response }]).catch(() => {});
            setIsGenerating(false);

            // Auto-title after the first exchange
            if (isFirstMessage) {
              generateTitle(token, selectedModel, content)
                .then((title) => {
                  if (!title) return;
                  patchChat(token, chatId, { title }).catch(() => {});
                  updateChatMeta(chatId, { title });
                })
                .catch(() => {});
            }
          },
        });
      } else {
        // Non-streaming fallback
        const payload = settings.systemPrompt
          ? [{ role: 'system', content: settings.systemPrompt }, ...history, { role: 'user', content }]
          : [...history, { role: 'user', content }];

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ model: selectedModel, messages: payload, stream: false, options: { temperature: settings.temperature } }),
          signal: abortRef.current.signal,
        });
        const data = await res.json();
        const response = data.message?.content ?? '';
        updateLastMessage(response);
        appendMessages(token, chatId, [{ role: 'assistant', content: response }]).catch(() => {});
        setIsGenerating(false);

        if (isFirstMessage) {
          generateTitle(token, selectedModel, content)
            .then((title) => { if (title) { patchChat(token, chatId, { title }); updateChatMeta(chatId, { title }); } })
            .catch(() => {});
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') { setIsGenerating(false); return; }
      useStore.getState().updateLastMessage(`⚠️ Error: ${err.message}`);
      setIsGenerating(false);
    }
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    useStore.getState().setIsGenerating(false);
  }, []);

  // ── Welcome screen ──────────────────────────────────────────────────────────
  if (!currentChatId) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-16 h-16 bg-gradient-to-br from-[#10a37f] to-[#1a7f64] rounded-2xl
                          flex items-center justify-center mb-5 shadow-lg">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-1">How can I help you?</h1>
          <p className="text-[#8e8ea0] text-sm mb-8">
            {selectedModel ? `Model: ${selectedModel}` : 'Select a model to start'}
          </p>
          <div className="grid grid-cols-2 gap-3 w-full max-w-md">
            {SUGGESTIONS.map(({ icon: Icon, prompt }, i) => (
              <button
                key={i}
                onClick={() => selectedModel && handleSend(prompt)}
                disabled={!selectedModel}
                className="bg-[#2a2a2a] hover:bg-[#333] border border-[#3a3a3a] hover:border-[#4a4a4a]
                           rounded-xl p-4 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                <Icon className="w-5 h-5 text-[#10a37f] mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-[#adadad] text-xs leading-5">{prompt.slice(0, 55)}…</p>
              </button>
            ))}
          </div>
        </div>
        <ChatInput onSend={handleSend} onStop={handleStop} isGenerating={isGenerating} />
      </div>
    );
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (!currentChat) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-[#8e8ea0]">
          <div className="w-4 h-4 border-2 border-[#10a37f] border-t-transparent rounded-full animate-spin" />
          Loading chat…
        </div>
      </div>
    );
  }

  // ── Active chat ─────────────────────────────────────────────────────────────
  const meta = chats.find((c) => c._id === currentChatId);
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#2a2a2a] bg-[#212121] shrink-0">
        <span className="text-sm text-[#adadad] truncate flex-1">{meta?.title ?? currentChat.title}</span>
        {currentChat.model && (
          <span className="text-xs bg-[#2a2a2a] border border-[#3a3a3a] text-[#8e8ea0] px-2 py-0.5 rounded-full shrink-0">
            {currentChat.model}
          </span>
        )}
        <span className="text-xs text-[#555]">
          {currentChat.messages.filter((m) => m.role === 'user').length} messages
        </span>
      </div>
      <MessageList messages={currentChat.messages} isGenerating={isGenerating} />
      <ChatInput onSend={handleSend} onStop={handleStop} isGenerating={isGenerating} />
    </div>
  );
}
