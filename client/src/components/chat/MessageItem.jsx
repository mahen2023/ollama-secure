import { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
// Only the common languages are bundled (the full Prism build is ~600 KB); others render as plain code
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import { Copy, Check, User, X, ChevronLeft, ChevronRight, Pencil, RefreshCw, Play, FileText, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import AppLogo from '../AppLogo';
import { useStore } from '../../store';
import { speak, stopSpeaking, toSpeech, canSpeak } from '../../speech';

Object.entries({
  bash, sh: bash, shell: bash, c, cpp, csharp, cs: csharp, css, diff, go, java,
  javascript, js: javascript, json, jsx, markdown, md: markdown, markup, html: markup, xml: markup,
  php, python, py: python, rust, sql, tsx, typescript, ts: typescript, yaml, yml: yaml,
}).forEach(([name, lang]) => SyntaxHighlighter.registerLanguage(name, lang));

function CopyBtn({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      title="Copy"
      className={`p-1.5 rounded-lg text-fg-muted hover:text-white hover:bg-rule transition-colors ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-brand" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// Only one message reads aloud at a time; starting another stops the current one.
let stopActive = null;

function SpeakBtn({ text }) {
  const [on, setOn] = useState(false);
  const toggle = () => {
    const wasOn = on;
    stopActive?.();
    if (wasOn) return;
    const me   = () => { stopSpeaking(); done(); };
    const done = () => { setOn(false); if (stopActive === me) stopActive = null; };
    stopActive = me;
    setOn(true);
    speak(toSpeech(text), useStore.getState().settings.speechRate || 1).finally(done);
  };
  return (
    <button
      onClick={toggle}
      title={on ? 'Stop reading' : 'Read aloud'}
      className={`p-1.5 rounded-lg hover:bg-rule transition-colors ${on ? 'text-brand' : 'text-fg-muted hover:text-white'}`}
    >
      {on ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
    </button>
  );
}

// Some agent-tuned models emit fake `<tool_call><function=X><parameter=k>v</parameter>…` text.
// We have no tools, so show it as markdown: short params inline, long ones fenced.
// Tolerates missing closing tags (streaming / truncated output).
function fenceToolCalls(text) {
  return text.replace(
    /<tool_call>\s*<function=([\w.-]+)>([\s\S]*?)(?:<\/function>\s*<\/tool_call>|<\/tool_call>|$)/g,
    (_, fn, body) => {
      const params = [...body.matchAll(/<parameter=([\w.-]+)>([\s\S]*?)(?:<\/parameter>|(?=<parameter=)|$)/g)];
      const path = params.find(([, k]) => /path|file/i.test(k))?.[2].trim() ?? '';
      const lang = /\.(\w+)$/.exec(path)?.[1] ?? '';
      const parts = params.map(([, k, v]) => {
        v = v.trim();
        return v.includes('\n') || k === 'content'
          ? `\n\n\`\`\`\`${lang}\n${v}\n\`\`\`\`\n`
          : `\n- **${k}:** \`${v}\``;
      });
      return `\n\n**Tool call: ${fn}**${parts.join('')}\n\n`;
    }
  );
}

const mdComponents = {
  // Code blocks and inline code
  code({ children, className }) {
    const match = /language-(\w+)/.exec(className || '');
    const code = String(children).replace(/\n$/, '');
    const isBlock = code.includes('\n') || !!match;

    if (match) {
      return (
        <div className="my-3 rounded-xl overflow-hidden border border-rule">
          <div className="flex items-center justify-between bg-ink-deep px-4 py-2 border-b border-rule">
            <span className="text-xs text-fg-muted font-mono">{match[1]}</span>
            <CopyBtn text={code} />
          </div>
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            customStyle={{ margin: 0, borderRadius: 0, background: '#141414', fontSize: '0.8125rem' }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      );
    }

    if (isBlock) {
      return (
        <pre className="my-3 bg-ink-abyss border border-rule rounded-xl p-4 overflow-x-auto">
          <code className="text-fg text-[0.8125rem] font-mono">{code}</code>
        </pre>
      );
    }

    return (
      <code className="bg-ink-deep text-[#e06c75] px-1.5 py-0.5 rounded text-[0.8125rem] font-mono">
        {children}
      </code>
    );
  },

  pre({ children }) { return <>{children}</>; },

  // Prose capped at ~68ch for readable lines; code blocks and tables keep the full width
  p({ children }) { return <p className="mb-3 last:mb-0 leading-7 max-w-[68ch]">{children}</p>; },

  ul({ children }) { return <ul className="mb-3 ml-5 list-disc space-y-1 max-w-[66ch]">{children}</ul>; },
  ol({ children }) { return <ol className="mb-3 ml-5 list-decimal space-y-1 max-w-[66ch]">{children}</ol>; },
  li({ children }) { return <li className="leading-7">{children}</li>; },

  h1({ children }) { return <h1 className="text-xl font-bold mb-3 mt-5 text-white">{children}</h1>; },
  h2({ children }) { return <h2 className="text-lg font-bold mb-2 mt-4 text-white">{children}</h2>; },
  h3({ children }) { return <h3 className="text-base font-semibold mb-2 mt-3 text-white">{children}</h3>; },

  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-brand pl-4 my-3 text-fg-muted italic">
        {children}
      </blockquote>
    );
  },

  table({ children }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border border-rule rounded-lg text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) { return <thead className="bg-ink-deep">{children}</thead>; },
  th({ children }) { return <th className="border border-rule px-4 py-2 text-left font-semibold">{children}</th>; },
  td({ children }) { return <td className="border border-rule px-4 py-2">{children}</td>; },

  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="text-brand hover:underline">
        {children}
      </a>
    );
  },

  hr() { return <hr className="border-rule my-4" />; },
  strong({ children }) { return <strong className="font-semibold text-white">{children}</strong>; },
  em({ children }) { return <em className="italic">{children}</em>; },
};

function Lightbox({ images, startIndex, onClose }) {
  const [index, setIndex] = useState(startIndex);

  const prev = useCallback(() => setIndex((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  const img = images[index];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20
                   flex items-center justify-center text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Prev */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20
                     flex items-center justify-center text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Image */}
      <img
        src={img.dataUri}
        alt={img.name}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl"
      />

      {/* Next */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20
                     flex items-center justify-center text-white transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Dots */}
      {images.length > 1 && (
        <div className="absolute bottom-4 flex items-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              className={`rounded-full transition-all ${
                i === index ? 'w-2 h-2 bg-white' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

function MessageItem({ message, index, isGenerating, isStopped, onEdit, onRegenerate, onContinue }) {
  const isUser = message.role === 'user';
  const [lightbox, setLightbox] = useState(null);
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState('');

  const startEdit = () => { setDraft(message.displayContent ?? message.content); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const submitEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onEdit(index, trimmed);
    setEditing(false);
  };

  return (
    <div className={`group flex gap-4 py-5 px-4 md:px-6 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      {isUser ? (
        <div className="w-8 h-8 rounded-full bg-[#5436da] flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-white" />
        </div>
      ) : (
        <AppLogo className="w-8 h-8 rounded-xl shrink-0 mt-0.5" alt="" />
      )}

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        {isUser ? (
          <div className="max-w-[85%] flex flex-col items-end gap-1.5">
            {/* Image attachments */}
            {message.images?.length > 0 && (
              <div className={`grid gap-1.5 w-full ${message.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {message.images.map((img, i) => (
                  <img
                    key={i}
                    src={img.dataUri}
                    alt={img.name}
                    onClick={() => setLightbox(i)}
                    className={`w-full object-cover rounded-2xl rounded-tr-sm cursor-pointer
                      hover:brightness-90 transition-[filter]
                      ${message.images.length === 1 ? 'max-h-72' : 'h-36'}`}
                  />
                ))}
              </div>
            )}
            {lightbox !== null && (
              <Lightbox images={message.images} startIndex={lightbox} onClose={() => setLightbox(null)} />
            )}

            {/* File attachment chips (non-image) */}
            {message.files?.length > 0 && (
              <div className="flex flex-wrap justify-end gap-1.5 w-full">
                {message.files.map((f, i) => (
                  <div key={i}
                    className="flex items-center gap-1.5 bg-ink-deep border border-rule rounded-lg px-2 py-1 max-w-[180px]">
                    <FileText className="w-3.5 h-3.5 text-brand shrink-0" />
                    <span className="text-xs text-fg-soft truncate flex-1">{f.name}</span>
                  </div>
                ))}
              </div>
            )}

            {editing ? (
              <div className="w-full">
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  rows={Math.min((draft.match(/\n/g) ?? []).length + 2, 8)}
                  className="w-full bg-rule text-fg rounded-xl px-3 py-2.5 text-sm
                             leading-6 resize-none focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={cancelEdit}
                    className="px-3 py-1.5 text-xs text-fg-muted hover:text-white rounded-lg
                               hover:bg-panel transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitEdit}
                    className="px-3 py-1.5 text-xs bg-brand hover:bg-brand-dim text-white
                               rounded-lg transition-colors"
                  >
                    Save & Send
                  </button>
                </div>
              </div>
            ) : (
              (message.displayContent ?? message.content) && (
                <div className="group/msg relative bg-panel text-fg rounded-2xl rounded-tr-sm
                                px-4 py-3 text-sm leading-7 w-full">
                  <span className="whitespace-pre-wrap">{message.displayContent ?? message.content}</span>
                  {!isGenerating && onEdit && (
                    <button
                      onClick={startEdit}
                      title="Edit message"
                      className="absolute -bottom-5 right-0 p-1 text-fg-faint hover:text-fg-muted
                                 opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            )}
          </div>
        ) : (
          <>
            <div className="text-fg text-[15px] prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {fenceToolCalls(message.content || '')}
              </ReactMarkdown>
            </div>
            {message.content && (
              <>
                {isStopped && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-amber-400/80">Response stopped</span>
                    {onContinue && (
                      <button
                        onClick={() => onContinue(index)}
                        title="Continue response from here"
                        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg
                                   bg-panel border border-rule text-brand
                                   hover:bg-panel-hi hover:border-fg-faint transition-colors"
                      >
                        <Play className="w-3 h-3 fill-current" /> Continue
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                  <CopyBtn text={message.content} />
                  {canSpeak && <SpeakBtn text={message.content} />}
                  {!isGenerating && onRegenerate && (
                    <button
                      onClick={() => onRegenerate(index)}
                      title="Regenerate response"
                      className="p-1.5 rounded-lg text-fg-muted hover:text-white hover:bg-rule transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span className="text-fg-faint text-xs ml-1 truncate">
                    {[
                      message.model?.replace(/:latest$/, ''),
                      message.tps && `${message.tps} tok/s`,
                      message.timestamp && new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    ].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </>
            )}
            {message.error && (
              <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-1 px-3 py-2.5 rounded-xl
                                           border border-red-400/30 bg-red-400/10 text-sm text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1 min-w-0">{message.error}</span>
                {!isGenerating && onRegenerate && (
                  <button
                    onClick={() => onRegenerate(index)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-panel border border-rule
                               text-fg hover:bg-panel-hi transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Memoized: while a reply streams only the last message changes, so the rest skip re-rendering markdown
export default memo(MessageItem);
