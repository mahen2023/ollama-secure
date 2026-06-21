import { useEffect, useRef, useCallback, useState } from 'react';
import { Code2, Globe, Zap, Lightbulb, Download, Copy, Check, Terminal, Menu } from 'lucide-react';
import AppLogo from '../AppLogo';
import { useStore } from '../../store';
import { fetchModels, streamChat, generateTitle } from '../../api/ollama';
import { createChat, getChat, patchChat, appendMessages, truncateMessages } from '../../api/chats';
import MessageList from './MessageList';
import ChatInput from './ChatInput';

function formatAsMarkdown(chat, title) {
  const lines = [`# ${title ?? chat.title}`, ''];
  if (chat.model) lines.push(`**Model:** ${chat.model}  `, `**Date:** ${new Date().toLocaleDateString()}`, '');
  lines.push('---', '');
  for (const msg of chat.messages) {
    const role = msg.role === 'user' ? '**You**' : msg.role === 'assistant' ? '**Assistant**' : '**System**';
    lines.push(role, '');
    if (msg.images?.length > 0) lines.push(`*[${msg.images.length} image${msg.images.length > 1 ? 's' : ''}]*`, '');
    if (msg.content) lines.push(msg.content, '');
    lines.push('---', '');
  }
  return lines.join('\n');
}

// Convert a stored message to the Ollama API shape.
// Stored images are { name, dataUri } — Ollama wants raw base64 strings.
function toApiMsg(m) {
  const msg = { role: m.role, content: m.content };
  if (m.images?.length > 0) {
    msg.images = m.images.map((img) => {
      const comma = img.dataUri.indexOf(',');
      return comma !== -1 ? img.dataUri.slice(comma + 1) : img.dataUri;
    });
  }
  return msg;
}

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
    appendMessage, updateLastMessage, setMessages,
    settings, isGenerating, setIsGenerating,
  } = useStore();

  const abortRef = useRef(null);
  const accumRef = useRef('');
  const [copied,         setCopied]         = useState(false);
  const [stoppedIndex,   setStoppedIndex]   = useState(null);
  const [sysPromptOpen,  setSysPromptOpen]  = useState(false);
  const [sysPromptDraft, setSysPromptDraft] = useState('');

  useEffect(() => {
    if (!currentChatId || !token) return;
    if (useStore.getState().currentChat?._id === currentChatId) return;
    let cancelled = false;
    getChat(token, currentChatId)
      .then((chat) => { if (!cancelled) setCurrentChat(chat); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentChatId, token]);

  useEffect(() => {
    if (!token || models.length > 0) return;
    fetchModels(token).then((m) => {
      setModels(m);
      if (!selectedModel && m.length > 0) setSelectedModel(m[0].name);
    }).catch(() => {});
  }, [token]);

  // ── Shared generation runner ──────────────────────────────────────────────────
  // prefill: existing assistant text to continue from (assistant-prefill mode).
  //          When set, no userApiMsg is needed; apiMessages ends with the assistant turn.
  const runGeneration = useCallback(async ({ chatId, history, userApiMsg, prefill, onDone }) => {
    const { token, selectedModel, settings } = useStore.getState();
    const chatSystemPrompt = useStore.getState().currentChat?.systemPrompt;
    const effectiveSystemPrompt = chatSystemPrompt || settings.systemPrompt;
    useStore.getState().setIsGenerating(true);
    accumRef.current = prefill ?? '';
    abortRef.current = new AbortController();

    const apiMessages = prefill !== undefined
      ? [...history, { role: 'assistant', content: prefill }]
      : [...history, userApiMsg];

    const finish = async (response) => {
      if (prefill !== undefined) {
        // Replace the DB partial with the now-complete response
        truncateMessages(token, chatId, history.length).catch(() => {});
      }
      appendMessages(token, chatId, [{ role: 'assistant', content: response }]).catch(() => {});
      useStore.getState().setIsGenerating(false);
      onDone?.();
    };

    try {
      if (settings.streamEnabled) {
        await streamChat({
          token,
          model: selectedModel,
          messages: apiMessages,
          systemPrompt:  effectiveSystemPrompt,
          temperature:   settings.temperature,
          contextLength: settings.contextLength,
          signal: abortRef.current.signal,
          onChunk(chunk) {
            accumRef.current += chunk;
            useStore.getState().updateLastMessage(accumRef.current);
          },
          async onDone() { await finish(accumRef.current); },
        });
      } else {
        const sysMsg = effectiveSystemPrompt
          ? [{ role: 'system', content: effectiveSystemPrompt }]
          : [];
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            model: selectedModel,
            messages: [...sysMsg, ...apiMessages],
            stream: false,
            options: {
              ...(Number.isFinite(settings.temperature)                                             && { temperature: settings.temperature }),
              ...(Number.isFinite(settings.contextLength) && settings.contextLength > 0             && { num_ctx:      settings.contextLength }),
            },
          }),
          signal: abortRef.current.signal,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `Request failed (${res.status})`);
        }
        const data = await res.json();
        const response = data.message?.content ?? '';
        useStore.getState().updateLastMessage(response);
        await finish(response);
      }
      return 'done';
    } catch (err) {
      if (err.name === 'AbortError') {
        const partial = accumRef.current;
        if (partial) {
          if (prefill !== undefined) {
            // Replace old DB partial with the further-extended partial
            truncateMessages(token, chatId, history.length).catch(() => {});
          }
          appendMessages(token, chatId, [{ role: 'assistant', content: partial }]).catch(() => {});
        }
        useStore.getState().setIsGenerating(false);
        return 'aborted';
      }
      useStore.getState().updateLastMessage(`⚠️ Error: ${err.message}`);
      useStore.getState().setIsGenerating(false);
      return 'error';
    }
  }, []);

  // ── Send new message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async (content, attachments = []) => {
    const state = useStore.getState();
    const { token, selectedModel, currentChatId } = state;
    if (!token || !selectedModel) return;
    setStoppedIndex(null);

    const imageFiles = attachments.filter((a) => a.kind === 'image');
    const textFiles  = attachments.filter((a) => a.kind === 'text');
    let displayContent = content;
    if (textFiles.length > 0) {
      displayContent += textFiles
        .map((f) => `\n\n**${f.name}:**\n\`\`\`\n${f.text}\n\`\`\``)
        .join('');
    }

    let chatId = currentChatId;
    if (!chatId) {
      const newChat = await createChat(token, { title: 'New Chat', model: selectedModel }).catch(() => null);
      if (!newChat) return;
      useStore.getState().prependChat(newChat);
      useStore.getState().setCurrentChat({ ...newChat, messages: [] });
      chatId = newChat._id;
    }

    const history = (useStore.getState().currentChat?.messages ?? []).map(toApiMsg);
    const isFirstMessage = history.length === 0;

    useStore.getState().appendMessage({
      role: 'user',
      content: displayContent,
      images: imageFiles.map((f) => ({ name: f.name, dataUri: f.dataUri })),
    });
    useStore.getState().appendMessage({ role: 'assistant', content: '' });

    appendMessages(token, chatId, [{
      role: 'user',
      content: displayContent,
      ...(imageFiles.length > 0 && { images: imageFiles.map((f) => ({ name: f.name, dataUri: f.dataUri })) }),
    }]).catch(() => {});

    const result = await runGeneration({
      chatId,
      history,
      userApiMsg: {
        role: 'user',
        content: displayContent,
        ...(imageFiles.length > 0 && { images: imageFiles.map((f) => f.base64) }),
      },
      onDone: isFirstMessage ? () => {
        const { token: t, selectedModel: m } = useStore.getState();
        generateTitle(t, m, content)
          .then((title) => {
            if (!title) return;
            patchChat(t, chatId, { title }).catch(() => {});
            useStore.getState().updateChatMeta(chatId, { title });
          })
          .catch(() => {});
      } : undefined,
    });
    if (result === 'aborted') {
      const msgs = useStore.getState().currentChat?.messages ?? [];
      setStoppedIndex(msgs.length - 1);
    }
  }, [runGeneration]);

  // ── Edit a user message ───────────────────────────────────────────────────────
  const handleEdit = useCallback(async (messageIndex, newContent) => {
    const { token, selectedModel, currentChatId, currentChat } = useStore.getState();
    if (!token || !selectedModel || !currentChatId || !currentChat) return;
    setStoppedIndex(null);

    const messages = currentChat.messages;
    const originalMsg = messages[messageIndex];
    const history = messages.slice(0, messageIndex).map(toApiMsg);
    const images = originalMsg.images ?? [];

    // Optimistic: replace edited message + empty assistant slot
    useStore.getState().setMessages([
      ...messages.slice(0, messageIndex),
      { ...originalMsg, content: newContent },
      { role: 'assistant', content: '', timestamp: new Date() },
    ]);

    // Persist: truncate then re-append the edited user message
    truncateMessages(token, currentChatId, messageIndex).catch(() => {});
    appendMessages(token, currentChatId, [{
      role: 'user',
      content: newContent,
      ...(images.length > 0 && { images }),
    }]).catch(() => {});

    const result = await runGeneration({
      chatId: currentChatId,
      history,
      userApiMsg: {
        role: 'user',
        content: newContent,
        ...(images.length > 0 && { images: images.map((img) => img.dataUri.split(',')[1]) }),
      },
    });
    if (result === 'aborted') {
      const msgs = useStore.getState().currentChat?.messages ?? [];
      setStoppedIndex(msgs.length - 1);
    }
  }, [runGeneration]);

  // ── Regenerate an assistant message ──────────────────────────────────────────
  const handleRegenerate = useCallback(async (messageIndex) => {
    const { token, selectedModel, currentChatId, currentChat } = useStore.getState();
    if (!token || !selectedModel || !currentChatId || !currentChat) return;
    setStoppedIndex(null);

    const messages = currentChat.messages;
    const userMsg = messages[messageIndex - 1];
    if (!userMsg || userMsg.role !== 'user') return;

    const history = messages.slice(0, messageIndex - 1).map(toApiMsg);

    // Optimistic: keep history up to and including the user message, reset assistant slot
    useStore.getState().setMessages([
      ...messages.slice(0, messageIndex),
      { role: 'assistant', content: '', timestamp: new Date() },
    ]);

    // Persist: drop the old assistant message (and anything after it)
    truncateMessages(token, currentChatId, messageIndex).catch(() => {});

    const result = await runGeneration({
      chatId: currentChatId,
      history,
      userApiMsg: {
        role: 'user',
        content: userMsg.content,
        ...(userMsg.images?.length > 0 && {
          images: userMsg.images.map((img) => img.dataUri.split(',')[1]),
        }),
      },
    });
    if (result === 'aborted') {
      const msgs = useStore.getState().currentChat?.messages ?? [];
      setStoppedIndex(msgs.length - 1);
    }
  }, [runGeneration]);

  const handleOpenSysPrompt = useCallback(() => {
    setSysPromptDraft(useStore.getState().currentChat?.systemPrompt ?? '');
    setSysPromptOpen((v) => !v);
  }, []);

  const handleSaveSysPrompt = useCallback(() => {
    const { token } = useStore.getState();
    const prompt = sysPromptDraft.trim();
    patchChat(token, currentChatId, { systemPrompt: prompt }).catch(() => {});
    useStore.setState((s) => ({
      currentChat: s.currentChat ? { ...s.currentChat, systemPrompt: prompt } : s.currentChat,
    }));
    setSysPromptOpen(false);
  }, [currentChatId, sysPromptDraft]);

  const handleDownload = useCallback(() => {
    const meta = useStore.getState().chats.find((c) => c._id === currentChatId);
    const md = formatAsMarkdown(currentChat, meta?.title);
    const safe = (meta?.title ?? currentChat.title).replace(/[^a-z0-9]/gi, '_').slice(0, 60);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safe}.md`; a.click();
    URL.revokeObjectURL(url);
  }, [currentChat, currentChatId]);

  const handleCopyChat = useCallback(async () => {
    const meta = useStore.getState().chats.find((c) => c._id === currentChatId);
    const md = formatAsMarkdown(currentChat, meta?.title);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentChat, currentChatId]);

  // ── Continue a stopped assistant message ─────────────────────────────────────
  const handleContinue = useCallback(async (messageIndex) => {
    const { token, selectedModel, currentChatId, currentChat } = useStore.getState();
    if (!token || !selectedModel || !currentChatId || !currentChat) return;

    const messages = currentChat.messages;
    const partialMsg = messages[messageIndex];
    if (!partialMsg || partialMsg.role !== 'assistant' || !partialMsg.content) return;

    setStoppedIndex(null);

    const history = messages.slice(0, messageIndex).map(toApiMsg);
    const prefill  = partialMsg.content;

    // Ensure the partial message is the last slot — updateLastMessage will extend it in-place
    useStore.getState().setMessages(messages.slice(0, messageIndex + 1));

    const result = await runGeneration({ chatId: currentChatId, history, prefill });
    if (result === 'aborted') {
      const msgs = useStore.getState().currentChat?.messages ?? [];
      setStoppedIndex(msgs.length - 1);
    }
  }, [runGeneration]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    useStore.getState().setIsGenerating(false);
  }, []);

  // ── Welcome screen ────────────────────────────────────────────────────────────
  if (!currentChatId) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile sidebar toggle on welcome screen */}
        <div className="md:hidden flex px-4 pt-3">
          <button
            className="p-1.5 rounded-lg text-[#555] hover:text-[#adadad] hover:bg-[#2a2a2a] transition-colors"
            onClick={() => useStore.getState().setSidebarOpen(true)}
            title="Open sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <AppLogo className="w-16 h-16 rounded-2xl mb-5 shadow-lg" />
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

  const meta = chats.find((c) => c._id === currentChatId);
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#2a2a2a] bg-[#212121] shrink-0">
        {/* Hamburger — mobile only, shown when sidebar is closed */}
        <button
          className="md:hidden p-1.5 -ml-1.5 rounded-lg text-[#555] hover:text-[#adadad]
                     hover:bg-[#2a2a2a] transition-colors shrink-0"
          onClick={() => useStore.getState().setSidebarOpen(true)}
          title="Open sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>
        <span className="text-sm text-[#adadad] truncate flex-1">{meta?.title ?? currentChat.title}</span>
        {currentChat.model && (
          <span className="text-xs bg-[#2a2a2a] border border-[#3a3a3a] text-[#8e8ea0] px-2 py-0.5 rounded-full shrink-0">
            {currentChat.model}
          </span>
        )}
        <span className="text-xs text-[#555] shrink-0">
          {currentChat.messages.filter((m) => m.role === 'user').length} messages
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleOpenSysPrompt}
            title={currentChat.systemPrompt ? 'Edit chat system prompt' : 'Add chat system prompt'}
            className={`relative p-1.5 rounded-lg transition-colors
              ${sysPromptOpen
                ? 'text-[#10a37f] bg-[#2a2a2a]'
                : 'text-[#555] hover:text-[#adadad] hover:bg-[#2a2a2a]'}`}
          >
            <Terminal className="w-3.5 h-3.5" />
            {currentChat.systemPrompt && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#10a37f]" />
            )}
          </button>
          <button
            onClick={handleCopyChat}
            title={copied ? 'Copied!' : 'Copy as Markdown'}
            className="p-1.5 rounded-lg text-[#555] hover:text-[#adadad] hover:bg-[#2a2a2a] transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#10a37f]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownload}
            title="Download as Markdown"
            className="p-1.5 rounded-lg text-[#555] hover:text-[#adadad] hover:bg-[#2a2a2a] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Per-chat system prompt editor */}
      {sysPromptOpen && (
        <div className="border-b border-[#2a2a2a] bg-[#1a1a1a] px-5 py-3 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#8e8ea0]">System prompt — this chat only</span>
              {!sysPromptDraft && settings.systemPrompt && (
                <span className="text-[10px] text-[#444] truncate max-w-[260px]">
                  global: "{settings.systemPrompt.slice(0, 50)}{settings.systemPrompt.length > 50 ? '…' : ''}"
                </span>
              )}
            </div>
            <textarea
              autoFocus
              value={sysPromptDraft}
              onChange={(e) => setSysPromptDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSysPromptOpen(false);
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveSysPrompt();
              }}
              placeholder={
                settings.systemPrompt
                  ? `Leave empty to use global: "${settings.systemPrompt.slice(0, 60)}${settings.systemPrompt.length > 60 ? '…' : ''}"`
                  : 'Add a system prompt for this chat…'
              }
              rows={3}
              className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-xl px-3 py-2.5 text-sm
                         text-[#ececec] placeholder-[#444] focus:outline-none focus:border-[#10a37f]
                         resize-none leading-6 transition-colors"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[10px] text-[#444]">
                {sysPromptDraft
                  ? 'Overrides the global system prompt for this chat'
                  : 'Empty → falls back to the global system prompt'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSysPromptOpen(false)}
                  className="px-3 py-1.5 text-xs text-[#8e8ea0] hover:text-white rounded-lg
                             hover:bg-[#2a2a2a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSysPrompt}
                  className="px-3 py-1.5 text-xs bg-[#10a37f] hover:bg-[#0d9270] text-white
                             rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <MessageList
        messages={currentChat.messages}
        isGenerating={isGenerating}
        stoppedIndex={stoppedIndex}
        onEdit={handleEdit}
        onRegenerate={handleRegenerate}
        onContinue={handleContinue}
      />
      <ChatInput onSend={handleSend} onStop={handleStop} isGenerating={isGenerating} />
    </div>
  );
}
