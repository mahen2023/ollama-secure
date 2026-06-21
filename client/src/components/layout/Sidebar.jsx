import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, MessageSquare, Trash2, Settings, LogOut, ShieldCheck,
  PanelLeftClose, PanelLeft, Pencil, Check, X, UserCircle, Search,
  Tag, AlertTriangle,
} from 'lucide-react';
import AppLogo from '../AppLogo';
import { useStore } from '../../store';
import { deleteChat, patchChat } from '../../api/chats';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAG_PALETTE = ['#10a37f', '#60a5fa', '#f59e0b', '#a78bfa', '#f87171', '#34d399', '#fb923c', '#e879f9'];

function tagColor(tag) {
  let h = 5381;
  for (let i = 0; i < tag.length; i++) h = ((h << 5) + h + tag.charCodeAt(i)) & 0x7fffffff;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

function groupByDate(chats) {
  const now = Date.now();
  const DAY = 86_400_000;
  const groups = [
    { label: 'Today',       items: [] },
    { label: 'Yesterday',   items: [] },
    { label: 'Last 7 days', items: [] },
    { label: 'Older',       items: [] },
  ];
  chats.forEach((c) => {
    const age = now - new Date(c.createdAt).getTime();
    if      (age < DAY)       groups[0].items.push(c);
    else if (age < 2 * DAY)   groups[1].items.push(c);
    else if (age < 7 * DAY)   groups[2].items.push(c);
    else                      groups[3].items.push(c);
  });
  return groups;
}

// ── ChatItem ──────────────────────────────────────────────────────────────────

function ChatItem({ chat, active, unavailableModel, onSelect, onDelete, onRename, onTagsUpdate, onTagClick }) {
  const [mode,     setMode]     = useState('view'); // 'view' | 'rename' | 'tags'
  const [draft,    setDraft]    = useState(chat.title);
  const [tagDraft, setTagDraft] = useState('');
  const [busy,     setBusy]     = useState(false);

  const tags = chat.tags ?? [];

  const commitRename = async () => {
    const title = draft.trim() || 'Untitled';
    setBusy(true);
    await onRename(chat._id, title);
    setMode('view');
    setBusy(false);
  };

  const commitTags = async () => {
    const next = tagDraft.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8);
    setBusy(true);
    await onTagsUpdate(chat._id, next);
    setMode('view');
    setBusy(false);
  };

  const startRename = (e) => { e.stopPropagation(); setDraft(chat.title); setMode('rename'); };
  const startTags   = (e) => { e.stopPropagation(); setTagDraft(tags.join(', ')); setMode('tags'); };
  const cancelEdit  = ()  => setMode('view');

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${chat.title}"?`)) return;
    onDelete(chat._id);
  };

  return (
    <div
      onClick={() => mode === 'view' && onSelect(chat._id)}
      className={`group relative flex flex-col px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors
        ${active ? 'bg-[#2f2f2f] text-white' : 'text-[#adadad] hover:bg-[#252525] hover:text-white'}
        ${unavailableModel && !active ? 'opacity-60' : ''}`}
    >
      {/* Main row */}
      <div className="flex items-center gap-2 min-w-0">
        <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />

        {mode === 'rename' ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelEdit(); }}
            onClick={(e) => e.stopPropagation()}
            disabled={busy}
            className="flex-1 bg-transparent text-white outline-none border-b border-[#10a37f] text-sm min-w-0"
          />
        ) : mode === 'tags' ? (
          <input
            autoFocus
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTags(); if (e.key === 'Escape') cancelEdit(); }}
            onClick={(e) => e.stopPropagation()}
            disabled={busy}
            placeholder="work, code, research…"
            className="flex-1 bg-transparent text-white outline-none border-b border-[#10a37f] text-xs placeholder-[#444] min-w-0"
          />
        ) : (
          <>
            <span className="flex-1 truncate min-w-0">{chat.title}</span>

            {/* Tag dots */}
            {tags.length > 0 && (
              <span
                className="flex items-center gap-0.5 shrink-0"
                title={`Tags: ${tags.join(', ')}`}
              >
                {tags.slice(0, 4).map((t, i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: tagColor(t) }}
                  />
                ))}
              </span>
            )}

            {/* Unavailable model indicator */}
            {unavailableModel && (
              <span
                title={`Model "${chat.model}" is not currently running — you can still view this chat`}
                className="shrink-0 text-amber-500/60 flex items-center"
              >
                <AlertTriangle className="w-3 h-3" />
              </span>
            )}
          </>
        )}

        {/* Hover actions */}
        <div
          className={`flex items-center gap-0.5 shrink-0 transition-opacity
            ${mode === 'view' ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {mode === 'view' ? (
            <>
              <button onClick={startRename} title="Rename" className="p-1 text-[#8e8ea0] hover:text-white">
                <Pencil className="w-3 h-3" />
              </button>
              <button onClick={startTags} title="Edit tags" className="p-1 text-[#8e8ea0] hover:text-white">
                <Tag className="w-3 h-3" />
              </button>
              <button onClick={handleDelete} title="Delete" className="p-1 text-[#8e8ea0] hover:text-red-400">
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={mode === 'rename' ? commitRename : commitTags}
                disabled={busy}
                className="p-1 text-[#10a37f] hover:text-white"
              >
                <Check className="w-3 h-3" />
              </button>
              <button onClick={cancelEdit} className="p-1 text-[#8e8ea0] hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tag chips — shown in view mode when tags exist */}
      {mode === 'view' && tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 ml-[22px]">
          {tags.map((t, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onTagClick(t); }}
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium leading-none
                         transition-opacity hover:opacity-100"
              style={{
                background: tagColor(t) + '25',
                color: tagColor(t),
                border: `1px solid ${tagColor(t)}44`,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mobile breakpoint hook ────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return mobile;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const {
    token, user,
    chats, currentChatId,
    models,
    setCurrentChatId, updateChatMeta, removeChatFromList,
    sidebarOpen, toggleSidebar, setSidebarOpen,
    setSettingsOpen, logout,
  } = useStore();

  const isMobile = useIsMobile();

  const navigate = useNavigate();
  const [query,     setQuery]     = useState('');
  const [tagFilter, setTagFilter] = useState(null); // active tag filter
  const searchRef = useRef(null);

  const handleNewChat = () => {
    useStore.setState({ currentChat: null, currentChatId: null });
    setQuery('');
    if (isMobile) setSidebarOpen(false);
  };

  const handleSelect = (id) => {
    setCurrentChatId(id);
    setQuery('');
    if (isMobile) setSidebarOpen(false);
  };

  const handleDelete = async (id) => {
    removeChatFromList(id);
    deleteChat(token, id).catch(() => {});
  };

  const handleRename = async (id, title) => {
    updateChatMeta(id, { title });
    patchChat(token, id, { title }).catch(() => {});
  };

  const handleTagsUpdate = async (id, tags) => {
    updateChatMeta(id, { tags });
    patchChat(token, id, { tags }).catch(() => {});
  };

  const handleTagClick = (tag) => {
    setTagFilter((prev) => (prev === tag ? null : tag));
  };

  // Model availability — show all chats, but flag unavailable ones
  const availableModels = new Set(models.map((m) => m.name));
  const isUnavailable = (chat) =>
    chat.model && models.length > 0 && !availableModels.has(chat.model);

  // All unique tags across all chats for the filter bar
  const allTags = [...new Set(chats.flatMap((c) => c.tags ?? []))].sort();

  // Filtering pipeline: tag → search
  const afterTag = tagFilter
    ? chats.filter((c) => (c.tags ?? []).includes(tagFilter))
    : chats;

  const trimmed = query.trim().toLowerCase();
  const visibleChats = trimmed
    ? afterTag.filter((c) => c.title.toLowerCase().includes(trimmed))
    : afterTag;

  const groups = groupByDate(visibleChats);
  const isEmpty = groups.every((g) => g.items.length === 0);

  // Count of unavailable-model chats (for optional disclosure)
  const unavailableCount = chats.filter(isUnavailable).length;

  // Mobile: completely hidden when closed (hamburger lives in chat header)
  if (!sidebarOpen && isMobile) return null;

  // Desktop: collapsed icon bar
  if (!sidebarOpen) {
    return (
      <aside className="w-14 h-full bg-[#171717] border-r border-[#2a2a2a] flex flex-col items-center pt-3 gap-2 shrink-0">
        <button onClick={toggleSidebar} title="Expand sidebar (Ctrl+/)"
          className="p-2 text-[#8e8ea0] hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors">
          <PanelLeft className="w-5 h-5" />
        </button>
        <button onClick={handleNewChat} title="New chat (Ctrl+K)"
          className="p-2 text-[#8e8ea0] hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors">
          <Plus className="w-5 h-5" />
        </button>
      </aside>
    );
  }

  // Mobile open: fixed overlay with backdrop
  const mobileOverlay = isMobile;

  return (
    <>
      {mobileOverlay && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    <aside className={`
      ${mobileOverlay
        ? 'fixed inset-y-0 left-0 z-50'
        : 'relative'}
      w-64 h-full bg-[#171717] border-r border-[#2a2a2a] flex flex-col shrink-0
      ${mobileOverlay ? 'shadow-2xl' : ''}
    `}>
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <button onClick={toggleSidebar} title="Collapse sidebar (Ctrl+/)"
          className="p-2 text-[#8e8ea0] hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors">
          <PanelLeftClose className="w-5 h-5" />
        </button>
        <button
          onClick={handleNewChat}
          title="New chat (Ctrl+K)"
          className="flex-1 flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] hover:bg-[#333]
                     text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pb-1">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#2a2a2a] border border-[#3a3a3a]
                        rounded-lg focus-within:border-[#10a37f] transition-colors">
          <Search className="w-3.5 h-3.5 text-[#555] shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search chats…"
            className="flex-1 bg-transparent text-sm text-[#ececec] placeholder-[#555]
                       focus:outline-none min-w-0"
          />
          {query && (
            <button onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              className="text-[#555] hover:text-[#8e8ea0] transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="px-2 pb-2 flex flex-wrap gap-1">
          {allTags.map((t) => {
            const active = tagFilter === t;
            const color = tagColor(t);
            return (
              <button
                key={t}
                onClick={() => handleTagClick(t)}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium
                           transition-all leading-none"
                style={{
                  background: active ? color + '33' : '#2a2a2a',
                  color:      active ? color        : '#555',
                  border:     `1px solid ${active ? color + '66' : '#3a3a3a'}`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: color }}
                />
                {t}
                {active && <X className="w-2.5 h-2.5 ml-0.5" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-3">
        {isEmpty ? (
          <div className="text-center mt-10">
            <AppLogo className="w-8 h-8 rounded-xl mx-auto mb-2 opacity-25" alt="" />
            <p className="text-[#555] text-xs">
              {tagFilter
                ? `No chats tagged "${tagFilter}"`
                : trimmed
                ? `No chats matching "${query}"`
                : 'No chats yet'}
            </p>
            {tagFilter && (
              <button
                onClick={() => setTagFilter(null)}
                className="mt-2 text-[10px] text-[#10a37f] hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <>
            {groups.map(({ label, items }) =>
              items.length > 0 ? (
                <div key={label}>
                  <p className="text-[#555] text-xs font-medium px-3 py-1">{label}</p>
                  {items.map((chat) => (
                    <ChatItem
                      key={chat._id}
                      chat={chat}
                      active={chat._id === currentChatId}
                      unavailableModel={isUnavailable(chat)}
                      onSelect={handleSelect}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onTagsUpdate={handleTagsUpdate}
                      onTagClick={handleTagClick}
                    />
                  ))}
                </div>
              ) : null
            )}

            {/* Offline model disclosure */}
            {unavailableCount > 0 && !tagFilter && !trimmed && (
              <p className="text-[10px] text-[#444] text-center px-3 pb-1">
                <AlertTriangle className="w-3 h-3 inline mr-1 text-amber-500/40" />
                {unavailableCount} chat{unavailableCount > 1 ? 's' : ''} using an offline model
              </p>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[#2a2a2a]">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#10a37f] to-[#1a7f64] flex items-center justify-center shrink-0">
            <UserCircle className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[#adadad] truncate font-medium">{user?.username}</p>
            {user?.role === 'admin' && (
              <p className="text-[10px] text-purple-400">Admin</p>
            )}
          </div>
        </div>

        {user?.role === 'admin' && (
          <button
            onClick={() => { if (isMobile) setSidebarOpen(false); navigate('/admin'); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-[#8e8ea0] hover:text-purple-400
                       hover:bg-[#2a2a2a] rounded-lg transition-colors text-sm"
          >
            <ShieldCheck className="w-4 h-4" /> Admin Panel
          </button>
        )}

        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings (Ctrl+,)"
          className="w-full flex items-center gap-3 px-3 py-2.5 text-[#8e8ea0] hover:text-white
                     hover:bg-[#2a2a2a] rounded-lg transition-colors text-sm"
        >
          <Settings className="w-4 h-4" /> Settings
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-[#8e8ea0] hover:text-red-400
                     hover:bg-[#2a2a2a] rounded-lg transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </aside>
    </>
  );
}
