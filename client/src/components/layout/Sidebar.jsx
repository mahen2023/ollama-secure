import { useState } from 'react';
import {
  Plus, MessageSquare, Trash2, Settings, LogOut,
  PanelLeftClose, PanelLeft, Pencil, Check, X, Bot, UserCircle,
} from 'lucide-react';
import { useStore } from '../../store';
import { deleteChat, patchChat } from '../../api/chats';

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
    if      (age < DAY)           groups[0].items.push(c);
    else if (age < 2 * DAY)       groups[1].items.push(c);
    else if (age < 7 * DAY)       groups[2].items.push(c);
    else                          groups[3].items.push(c);
  });
  return groups;
}

function ChatItem({ chat, active, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(chat.title);
  const [busy,    setBusy]    = useState(false);

  const commit = async () => {
    const title = draft.trim() || 'Untitled';
    setBusy(true);
    await onRename(chat._id, title);
    setEditing(false);
    setBusy(false);
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${chat.title}"?`)) return;
    onDelete(chat._id);
  };

  return (
    <div
      onClick={() => !editing && onSelect(chat._id)}
      className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors
        ${active ? 'bg-[#2f2f2f] text-white' : 'text-[#adadad] hover:bg-[#252525] hover:text-white'}`}
    >
      <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          onClick={(e) => e.stopPropagation()}
          disabled={busy}
          className="flex-1 bg-transparent text-white outline-none border-b border-[#10a37f] text-sm min-w-0"
        />
      ) : (
        <span className="flex-1 truncate">{chat.title}</span>
      )}

      <div
        className={`flex items-center gap-0.5 ${editing ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
        onClick={(e) => e.stopPropagation()}
      >
        {editing ? (
          <>
            <button onClick={commit} disabled={busy} className="p-1 text-[#10a37f] hover:text-white">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => setEditing(false)} className="p-1 text-[#8e8ea0] hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setDraft(chat.title); setEditing(true); }}
              className="p-1 text-[#8e8ea0] hover:text-white"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={handleDelete} className="p-1 text-[#8e8ea0] hover:text-red-400">
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const {
    token, user,
    chats, currentChatId,
    setCurrentChatId, prependChat, updateChatMeta, removeChatFromList,
    sidebarOpen, toggleSidebar,
    setSettingsOpen, logout,
  } = useStore();

  const handleNewChat = () => {
    setCurrentChatId(null);
    useStore.getState().setCurrentChat && useStore.setState({ currentChat: null, currentChatId: null });
  };

  const handleSelect = (id) => setCurrentChatId(id);

  const handleDelete = async (id) => {
    removeChatFromList(id);
    deleteChat(token, id).catch(() => {}); // optimistic
  };

  const handleRename = async (id, title) => {
    updateChatMeta(id, { title });
    patchChat(token, id, { title }).catch(() => {}); // optimistic
  };

  const groups = groupByDate(chats);

  if (!sidebarOpen) {
    return (
      <aside className="w-14 h-full bg-[#171717] border-r border-[#2a2a2a] flex flex-col items-center pt-3 gap-2 shrink-0">
        <button onClick={toggleSidebar} title="Expand"
          className="p-2 text-[#8e8ea0] hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors">
          <PanelLeft className="w-5 h-5" />
        </button>
        <button onClick={handleNewChat} title="New chat"
          className="p-2 text-[#8e8ea0] hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors">
          <Plus className="w-5 h-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-64 h-full bg-[#171717] border-r border-[#2a2a2a] flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <button onClick={toggleSidebar} title="Collapse"
          className="p-2 text-[#8e8ea0] hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors">
          <PanelLeftClose className="w-5 h-5" />
        </button>
        <button
          onClick={handleNewChat}
          className="flex-1 flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] hover:bg-[#333]
                     text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New Chat
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-3">
        {groups.every((g) => g.items.length === 0) && (
          <div className="text-center mt-10">
            <Bot className="w-8 h-8 text-[#333] mx-auto mb-2" />
            <p className="text-[#555] text-xs">No chats yet</p>
          </div>
        )}
        {groups.map(({ label, items }) =>
          items.length > 0 ? (
            <div key={label}>
              <p className="text-[#555] text-xs font-medium px-3 py-1">{label}</p>
              {items.map((chat) => (
                <ChatItem
                  key={chat._id}
                  chat={chat}
                  active={chat._id === currentChatId}
                  onSelect={handleSelect}
                  onDelete={handleDelete}
                  onRename={handleRename}
                />
              ))}
            </div>
          ) : null
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[#2a2a2a]">
        {/* User info */}
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#10a37f] to-[#1a7f64] flex items-center justify-center shrink-0">
            <UserCircle className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm text-[#adadad] truncate font-medium">{user?.username}</span>
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
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
  );
}
