import { useEffect, useRef, useCallback, useState } from 'react';
import { Download, Copy, Check, Terminal, Menu, X } from 'lucide-react';
import { useStore } from '../../store';
import { fetchModels, streamChat, generateTitle, tokensPerSec, contextUsed, VOICE_KEEP_ALIVE } from '../../api/ollama';
import { createChat, getChat, patchChat, appendMessages, truncateMessages } from '../../api/chats';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ModelSelector from '../ui/ModelSelector';
import VoiceMode from './VoiceMode';
import Welcome from './Welcome';

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

// A history write failed: what is on screen may no longer match what the server saved
const saveFailed = (err) => useStore.getState().setSaveError(err.message || 'Could not save to the server');

// Header buttons: 44px touch targets on phones, compact on desktop
const HEADER_BTN  = 'p-2.5 md:p-1.5 rounded-lg transition-colors shrink-0';
const HEADER_ICON = 'w-5 h-5 md:w-3.5 md:h-3.5';

// Model status: glows while the model generates; afterwards shows the last reply's speed
function ModelLamp() {
  const isGenerating = useStore((s) => s.isGenerating);
  const tps = useStore((s) => s.currentChat?.messages?.at(-1)?.tps);
  return (
    <span className="flex items-center gap-1.5 text-xs text-fg-faint shrink-0" title="Runs on your server. Nothing is sent to a third party.">
      <span className={`w-2 h-2 rounded-full transition-colors ${isGenerating ? 'bg-brand brand-on' : 'bg-rule-hi'}`} />
      <span className="hidden sm:inline" aria-live="polite">
        {isGenerating ? 'Generating on your server' : tps ? `${tps} tok/s` : ''}
      </span>
    </span>
  );
}

const kTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

// How full the model's context window is after the latest reply. Past the limit,
// Ollama silently drops the oldest messages, so warn before that happens.
function ContextMeter() {
  const used  = useStore((s) => s.currentChat?.messages?.findLast((m) => m.ctx)?.ctx);
  const limit = useStore((s) => s.settings.contextLength);
  if (!used || !(limit > 0)) return null;

  const share = used / limit;
  const tone  = share >= 1 ? 'text-red-400' : share >= 0.8 ? 'text-amber-400' : 'text-fg-faint';
  const bar   = share >= 1 ? 'bg-red-400'   : share >= 0.8 ? 'bg-amber-400'   : 'bg-fg-faint';
  const title = share >= 1
    ? 'The model can no longer see the start of this chat. Start a new chat, or raise the context length in Settings.'
    : share >= 0.8
      ? 'Almost full: soon the model will stop seeing the oldest messages. Start a new chat, or raise the context length in Settings.'
      : 'How much of the model\'s context window this chat uses.';

  return (
    <span className={`flex items-center gap-1.5 text-xs shrink-0 tabular-nums ${tone}`} title={title}>
      <span className="w-10 h-1 rounded-full bg-rule overflow-hidden" aria-hidden="true">
        <span className={`block h-full ${bar}`} style={{ width: `${Math.min(share, 1) * 100}%` }} />
      </span>
      <span>
        {kTokens(used)} / {kTokens(limit)}<span className="hidden lg:inline"> context</span>
      </span>
    </span>
  );
}

// Top bar shared by the welcome screen and chats: [menu] [model] … [children]
function TopBar({ children }) {
  return (
    <div className="flex items-center gap-1 md:gap-3 px-2 md:px-5 py-1.5 md:py-2 border-b border-panel bg-ink shrink-0">
      <button
        className={`md:hidden text-fg-muted hover:text-white hover:bg-panel ${HEADER_BTN}`}
        onClick={() => useStore.getState().setSidebarOpen(true)}
        title="Open sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="min-w-0 shrink"><ModelSelector /></div>
      <ModelLamp />
      <ContextMeter />
      {children}
    </div>
  );
}

export default function ChatPage() {
  const {
    token, selectedModel, models, setModels, setSelectedModel,
    chats, currentChatId, currentChat,
    setCurrentChat, prependChat, updateChatMeta,
    appendMessage, updateLastMessage, setMessages,
    settings, isGenerating, setIsGenerating,
    voiceOpen, setVoiceOpen,
    saveError, setSaveError,
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
    const { voiceOpen } = useStore.getState();
    const voicePrompt = voiceOpen && settings.voicePrompt;
    const keepAlive   = voiceOpen ? VOICE_KEEP_ALIVE : undefined;
    const effectiveSystemPrompt = [chatSystemPrompt || settings.systemPrompt, voicePrompt].filter(Boolean).join('\n\n');
    useStore.getState().setIsGenerating(true);
    useStore.getState().patchLastMessage({ model: selectedModel, error: undefined, tps: undefined, ctx: undefined });
    accumRef.current = prefill ?? '';
    abortRef.current = new AbortController();

    const apiMessages = prefill !== undefined
      ? [...history, { role: 'assistant', content: prefill }]
      : [...history, userApiMsg];

    const finish = async (response) => {
      if (prefill !== undefined) {
        // Replace the DB partial with the now-complete response
        truncateMessages(token, chatId, history.length).catch(saveFailed);
      }
      appendMessages(token, chatId, [{ role: 'assistant', content: response, model: selectedModel }]).catch(saveFailed);
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
          keepAlive,
          signal: abortRef.current.signal,
          onChunk(chunk) {
            accumRef.current += chunk;
            useStore.getState().updateLastMessage(accumRef.current);
          },
          async onDone(data) {
            useStore.getState().patchLastMessage({ tps: tokensPerSec(data), ctx: contextUsed(data) });
            await finish(accumRef.current);
          },
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
            keep_alive: keepAlive,
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
        useStore.getState().patchLastMessage({ content: response, tps: tokensPerSec(data), ctx: contextUsed(data) });
        await finish(response);
      }
      return 'done';
    } catch (err) {
      if (err.name === 'AbortError') {
        const partial = accumRef.current;
        if (partial) {
          if (prefill !== undefined) {
            // Replace old DB partial with the further-extended partial
            truncateMessages(token, chatId, history.length).catch(saveFailed);
          }
          appendMessages(token, chatId, [{ role: 'assistant', content: partial, model: selectedModel }]).catch(saveFailed);
        }
        useStore.getState().setIsGenerating(false);
        return 'aborted';
      }
      useStore.getState().patchLastMessage({ error: err.message || 'The model did not respond.' });
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

    // apiContent includes file text so the model has the full context
    let apiContent = content;
    if (textFiles.length > 0) {
      apiContent += textFiles
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

    // Bump activity so the sidebar moves this chat to the top of "Today"
    useStore.getState().updateChatMeta(chatId, { updatedAt: new Date().toISOString() });

    const history = (useStore.getState().currentChat?.messages ?? []).map(toApiMsg);
    const isFirstMessage = history.length === 0;

    useStore.getState().appendMessage({
      role: 'user',
      content: apiContent,          // full content used by toApiMsg for model history
      displayContent: content,      // user-typed text only — shown in the chat bubble
      images: imageFiles.map((f) => ({ name: f.name, dataUri: f.dataUri })),
      files: textFiles.map((f) => ({ name: f.name, kind: f.kind, type: f.type })),
    });
    useStore.getState().appendMessage({ role: 'assistant', content: '' });

    appendMessages(token, chatId, [{
      role: 'user',
      content: apiContent,
      ...(imageFiles.length > 0 && { images: imageFiles.map((f) => ({ name: f.name, dataUri: f.dataUri })) }),
    }]).catch(saveFailed);

    const result = await runGeneration({
      chatId,
      history,
      userApiMsg: {
        role: 'user',
        content: apiContent,
        ...(imageFiles.length > 0 && { images: imageFiles.map((f) => f.base64) }),
      },
      onDone: isFirstMessage ? () => {
        const { token: t, selectedModel: m, voiceOpen } = useStore.getState();
        // In voice mode the model is busy with the next turn — title from the words instead
        if (voiceOpen) {
          const title = content.split(/\s+/).slice(0, 6).join(' ');
          patchChat(t, chatId, { title }).catch(() => {});
          useStore.getState().updateChatMeta(chatId, { title });
          return;
        }
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
    truncateMessages(token, currentChatId, messageIndex).catch(saveFailed);
    appendMessages(token, currentChatId, [{
      role: 'user',
      content: newContent,
      ...(images.length > 0 && { images }),
    }]).catch(saveFailed);

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
    truncateMessages(token, currentChatId, messageIndex).catch(saveFailed);

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
  // One render tree for all three states so the voice overlay isn't remounted
  // when its first message turns the welcome screen into a chat.
  let body;
  if (!currentChatId) {
    body = (
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="welcome-area flex-1 flex flex-col items-center justify-center px-4 py-6 md:p-8 overflow-y-auto">
          <Welcome model={selectedModel} onPick={(p) => selectedModel && handleSend(p)} />
        </div>
        <ChatInput onSend={handleSend} onStop={handleStop} isGenerating={isGenerating} onVoice={() => setVoiceOpen(true)} showHints />
      </div>
    );
  } else if (!currentChat) {
    body = (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-fg-muted">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Loading chat…
        </div>
      </div>
    );
  } else {
    const meta = chats.find((c) => c._id === currentChatId);
    body = (
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar>
          <span className="hidden md:block text-sm text-fg-soft truncate flex-1">{meta?.title ?? currentChat.title}</span>
          <div className="flex-1 md:hidden" />
          <span className="hidden md:inline text-xs text-fg-faint shrink-0">
            {currentChat.messages.filter((m) => m.role === 'user').length} messages
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleOpenSysPrompt}
              title={currentChat.systemPrompt ? 'Edit chat system prompt' : 'Add chat system prompt'}
              className={`relative ${HEADER_BTN}
                ${sysPromptOpen
                  ? 'text-brand bg-panel'
                  : 'text-fg-muted md:text-fg-faint hover:text-fg-soft hover:bg-panel'}`}
            >
              <Terminal className={HEADER_ICON} />
              {currentChat.systemPrompt && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand" />
              )}
            </button>
            <button
              onClick={handleCopyChat}
              title={copied ? 'Copied!' : 'Copy as Markdown'}
              className={`text-fg-muted md:text-fg-faint hover:text-fg-soft hover:bg-panel ${HEADER_BTN}`}
            >
              {copied ? <Check className={`${HEADER_ICON} text-brand`} /> : <Copy className={HEADER_ICON} />}
            </button>
            <button
              onClick={handleDownload}
              title="Download as Markdown"
              className={`text-fg-muted md:text-fg-faint hover:text-fg-soft hover:bg-panel ${HEADER_BTN}`}
            >
              <Download className={HEADER_ICON} />
            </button>
          </div>
        </TopBar>

        {/* Per-chat system prompt editor */}
        {sysPromptOpen && (
          <div className="border-b border-panel bg-ink-deep px-5 py-3 shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-fg-muted">System prompt — this chat only</span>
                {!sysPromptDraft && settings.systemPrompt && (
                  <span className="text-[10px] text-fg-faint truncate max-w-[260px]">
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
                className="w-full bg-panel border border-rule rounded-xl px-3 py-2.5 text-sm
                           text-fg placeholder-fg-faint focus:outline-none focus:border-brand
                           resize-none leading-6 transition-colors"
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-[10px] text-fg-faint">
                  {sysPromptDraft
                    ? 'Overrides the global system prompt for this chat'
                    : 'Empty → falls back to the global system prompt'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSysPromptOpen(false)}
                    className="px-3 py-1.5 text-xs text-fg-muted hover:text-white rounded-lg
                               hover:bg-panel transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveSysPrompt}
                    className="px-3 py-1.5 text-xs bg-brand hover:bg-brand-dim text-white
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
        {saveError && (
          <div role="alert" className="max-w-3xl w-full mx-auto px-2 md:px-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-400/30 bg-red-400/10 text-xs text-red-300">
              <span className="flex-1">
                The last change didn't save ({saveError}). Reload the chat to see what the server has.
              </span>
              <button
                onClick={() => { setSaveError(null); useStore.setState({ currentChat: null }); getChat(token, currentChatId).then(setCurrentChat).catch(saveFailed); }}
                className="px-2 py-1 rounded-lg bg-panel border border-rule text-fg hover:bg-panel-hi shrink-0"
              >
                Reload chat
              </button>
              <button onClick={() => setSaveError(null)} title="Dismiss" className="p-1 text-red-300/70 hover:text-red-300 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        <ChatInput onSend={handleSend} onStop={handleStop} isGenerating={isGenerating} onVoice={() => setVoiceOpen(true)} />
      </div>
    );
  }

  return (
    <>
      {body}
      {voiceOpen && <VoiceMode onSend={handleSend} onStop={handleStop} onClose={() => setVoiceOpen(false)} />}
    </>
  );
}
