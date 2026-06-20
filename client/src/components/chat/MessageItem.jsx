import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, User, ThumbsUp, ThumbsDown } from 'lucide-react';
import AppLogo from '../AppLogo';

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
      className={`p-1.5 rounded-lg text-[#8e8ea0] hover:text-white hover:bg-[#3a3a3a] transition-colors ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-[#10a37f]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
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
        <div className="my-3 rounded-xl overflow-hidden border border-[#3a3a3a]">
          <div className="flex items-center justify-between bg-[#1a1a1a] px-4 py-2 border-b border-[#3a3a3a]">
            <span className="text-xs text-[#8e8ea0] font-mono">{match[1]}</span>
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
        <pre className="my-3 bg-[#141414] border border-[#3a3a3a] rounded-xl p-4 overflow-x-auto">
          <code className="text-[#e0e0e0] text-[0.8125rem] font-mono">{code}</code>
        </pre>
      );
    }

    return (
      <code className="bg-[#1a1a1a] text-[#e06c75] px-1.5 py-0.5 rounded text-[0.8125rem] font-mono">
        {children}
      </code>
    );
  },

  pre({ children }) { return <>{children}</>; },

  p({ children }) { return <p className="mb-3 last:mb-0 leading-7">{children}</p>; },

  ul({ children }) { return <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>; },
  ol({ children }) { return <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>; },
  li({ children }) { return <li className="leading-7">{children}</li>; },

  h1({ children }) { return <h1 className="text-xl font-bold mb-3 mt-5 text-white">{children}</h1>; },
  h2({ children }) { return <h2 className="text-lg font-bold mb-2 mt-4 text-white">{children}</h2>; },
  h3({ children }) { return <h3 className="text-base font-semibold mb-2 mt-3 text-white">{children}</h3>; },

  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-[#10a37f] pl-4 my-3 text-[#8e8ea0] italic">
        {children}
      </blockquote>
    );
  },

  table({ children }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border border-[#3a3a3a] rounded-lg text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) { return <thead className="bg-[#1a1a1a]">{children}</thead>; },
  th({ children }) { return <th className="border border-[#3a3a3a] px-4 py-2 text-left font-semibold">{children}</th>; },
  td({ children }) { return <td className="border border-[#3a3a3a] px-4 py-2">{children}</td>; },

  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="text-[#10a37f] hover:underline">
        {children}
      </a>
    );
  },

  hr() { return <hr className="border-[#3a3a3a] my-4" />; },
  strong({ children }) { return <strong className="font-semibold text-white">{children}</strong>; },
  em({ children }) { return <em className="italic">{children}</em>; },
};

export default function MessageItem({ message }) {
  const isUser = message.role === 'user';

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
          <div className="bg-[#2f2f2f] text-[#ececec] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-7 max-w-[85%] whitespace-pre-wrap">
            {message.content}
          </div>
        ) : (
          <>
            <div className="text-[#ececec] text-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {message.content || ''}
              </ReactMarkdown>
            </div>
            {message.content && (
              <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyBtn text={message.content} />
                <button title="Good response" className="p-1.5 rounded-lg text-[#8e8ea0] hover:text-white hover:bg-[#3a3a3a] transition-colors">
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button title="Bad response" className="p-1.5 rounded-lg text-[#8e8ea0] hover:text-white hover:bg-[#3a3a3a] transition-colors">
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
                {message.timestamp && (
                  <span className="text-[#555] text-xs ml-1">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
