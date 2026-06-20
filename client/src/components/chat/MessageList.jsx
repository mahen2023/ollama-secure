import { useEffect, useRef } from 'react';
import MessageItem from './MessageItem';
import AppLogo from '../AppLogo';

function TypingIndicator() {
  return (
    <div className="flex gap-4 py-5 px-4 md:px-6">
      <AppLogo className="w-8 h-8 rounded-xl shrink-0" alt="" />
      <div className="flex items-center gap-1.5 mt-2">
        <span className="typing-dot w-2 h-2 bg-[#8e8ea0] rounded-full" />
        <span className="typing-dot w-2 h-2 bg-[#8e8ea0] rounded-full" />
        <span className="typing-dot w-2 h-2 bg-[#8e8ea0] rounded-full" />
      </div>
    </div>
  );
}

export default function MessageList({ messages, isGenerating }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom smoothly while generating, instantly on load
    bottomRef.current?.scrollIntoView({ behavior: isGenerating ? 'smooth' : 'instant' });
  }, [messages, isGenerating]);

  const lastMsg = messages[messages.length - 1];
  const showTyping = isGenerating && (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.content);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        {messages.map((msg, i) => {
          // While generating, skip the empty assistant placeholder —
          // TypingIndicator owns that slot until the first chunk arrives.
          if (isGenerating && msg.role === 'assistant' && !msg.content) return null;
          return <MessageItem key={msg._id ?? msg.id ?? i} message={msg} />;
        })}
        {showTyping && <TypingIndicator />}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}
