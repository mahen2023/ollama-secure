import { useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import MessageItem from './MessageItem';
import AppLogo from '../AppLogo';

// How close to the bottom (px) still counts as "following" the stream
const STICK_PX = 80;

function TypingIndicator() {
  return (
    <div className="flex gap-4 py-5 px-4 md:px-6">
      <AppLogo className="w-8 h-8 rounded-xl shrink-0" alt="" />
      <div className="flex items-center gap-1.5 mt-2">
        <span className="typing-dot w-2 h-2 bg-fg-muted rounded-full" />
        <span className="typing-dot w-2 h-2 bg-fg-muted rounded-full" />
        <span className="typing-dot w-2 h-2 bg-fg-muted rounded-full" />
      </div>
    </div>
  );
}

export default function MessageList({ messages, isGenerating, stoppedIndex, onEdit, onRegenerate, onContinue }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const stickRef = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  const onScroll = () => {
    const el = containerRef.current;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    stickRef.current = near;
    setAwayFromBottom(!near);
  };

  const jumpToLatest = () => {
    stickRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Follow the stream only while the reader is at the bottom; scrolling up to read stops it.
  // A new message (sending, or opening another chat) always snaps back down.
  const countRef = useRef(0);
  useEffect(() => {
    if (messages.length !== countRef.current) stickRef.current = true;
    countRef.current = messages.length;
    if (stickRef.current) bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages, isGenerating]);

  const lastMsg = messages[messages.length - 1];
  const showTyping = isGenerating && (!lastMsg || lastMsg.role !== 'assistant' || (!lastMsg.content && !lastMsg.error));

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {messages.map((msg, i) => {
            if (isGenerating && msg.role === 'assistant' && !msg.content) return null;
            return (
              <MessageItem
                key={msg._id ?? msg.id ?? i}
                message={msg}
                index={i}
                isGenerating={isGenerating}
                isStopped={i === stoppedIndex}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
                onContinue={onContinue}
              />
            );
          })}
          {showTyping && <TypingIndicator />}
          <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {awayFromBottom && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5
                     rounded-full bg-panel-hi border border-rule text-xs text-fg shadow-lg
                     hover:bg-rule transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          {isGenerating ? 'Follow reply' : 'Jump to latest'}
        </button>
      )}
    </div>
  );
}
