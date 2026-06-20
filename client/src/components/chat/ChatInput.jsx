import { useState, useRef, useEffect } from 'react';
import { Send, Square, AlertCircle } from 'lucide-react';
import ModelSelector from '../ui/ModelSelector';
import { useStore } from '../../store';

export default function ChatInput({ onSend, onStop, isGenerating }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);
  const { selectedModel } = useStore();
  const canSend = input.trim() && selectedModel && !isGenerating;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  const send = () => {
    const text = input.trim();
    if (!text || !selectedModel || isGenerating) return;
    onSend(text);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="bg-[#212121] px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        {!selectedModel && (
          <div className="flex items-center gap-2 text-amber-400 text-xs mb-2 px-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Select a model above to start chatting
          </div>
        )}
        <div className="relative bg-[#2f2f2f] border border-[#3a3a3a] rounded-2xl
                        focus-within:border-[#4a4a4a] transition-colors shadow-sm">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={selectedModel ? `Message ${selectedModel.split(':')[0]}…` : 'Select a model first'}
            disabled={!selectedModel}
            rows={1}
            className="w-full bg-transparent text-[#ececec] placeholder-[#555] resize-none
                       px-4 pt-3.5 pb-12 focus:outline-none text-sm leading-6 max-h-52
                       disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3">
            <ModelSelector />
            <button
              onClick={isGenerating ? onStop : send}
              disabled={!isGenerating && !canSend}
              title={isGenerating ? 'Stop generating' : 'Send message'}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0
                ${isGenerating
                  ? 'bg-white/10 hover:bg-white/20 text-white'
                  : canSend
                    ? 'bg-[#10a37f] hover:bg-[#0d9270] text-white'
                    : 'bg-[#3a3a3a] text-[#555] cursor-not-allowed'}`}
            >
              {isGenerating
                ? <Square className="w-3.5 h-3.5 fill-current" />
                : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <p className="text-center text-[#444] text-xs mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
