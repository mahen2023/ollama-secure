import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, AlertCircle, Plus, X, FileText, Loader2 } from 'lucide-react';
import ModelSelector from '../ui/ModelSelector';
import { useStore } from '../../store';

const TEMPLATES = [
  { id: 'explain',   label: 'Explain',      desc: 'Explain code or a concept step by step',       prompt: 'Explain the following step by step:\n\n' },
  { id: 'summarize', label: 'Summarize',    desc: 'Summarize text into bullet points',             prompt: 'Summarize the following in concise bullet points:\n\n' },
  { id: 'review',    label: 'Code review',  desc: 'Review code for bugs and best practices',       prompt: 'Review this code for bugs, performance issues, and best practices:\n\n' },
  { id: 'debug',     label: 'Debug',        desc: 'Help diagnose an error or unexpected behavior', prompt: 'I\'m getting this error. Help me debug it:\n\n' },
  { id: 'tests',     label: 'Write tests',  desc: 'Generate unit tests for code',                  prompt: 'Write unit tests for the following code:\n\n' },
  { id: 'refactor',  label: 'Refactor',     desc: 'Clean up and improve code quality',             prompt: 'Refactor the following code to be cleaner and more maintainable:\n\n' },
  { id: 'docs',      label: 'Write docs',   desc: 'Generate documentation or a docstring',         prompt: 'Write documentation for the following:\n\n' },
  { id: 'translate', label: 'Translate',    desc: 'Translate text into another language',          prompt: 'Translate the following to English:\n\n' },
  { id: 'compare',   label: 'Compare',      desc: 'Compare and contrast two things',               prompt: 'Compare and contrast the following:\n\n1. \n\n2. ' },
  { id: 'proscons',  label: 'Pros & cons',  desc: 'List advantages and disadvantages',             prompt: 'List the pros and cons of:\n\n' },
  { id: 'sql',       label: 'SQL query',    desc: 'Write or fix a SQL query',                      prompt: 'Write a SQL query to ' },
  { id: 'regex',     label: 'Regex',        desc: 'Create a regular expression pattern',           prompt: 'Write a regular expression that matches ' },
];

const ACCEPT = [
  'image/*',
  '.pdf',
  '.docx',
  '.txt', '.md', '.json', '.csv',
  '.py', '.js', '.ts', '.jsx', '.tsx',
  '.html', '.css', '.yaml', '.yml', '.xml',
  '.sh', '.sql',
].join(',');

// MIME types that require server-side text extraction
const EXTRACT_SERVER = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function readAsDataURL(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}

// Max dimension and quality applied before storing.
// Keeps images well below MongoDB's 16 MB document limit and the server's 5 MB-per-image guard.
const IMG_MAX_PX  = 1024;
const IMG_QUALITY = 0.75;
const IMG_MAX_B64 = 4 * 1024 * 1024; // 4 MB base64 ≈ 3 MB decoded

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > IMG_MAX_PX || height > IMG_MAX_PX) {
        if (width >= height) { height = Math.round((height / width) * IMG_MAX_PX); width = IMG_MAX_PX; }
        else                 { width  = Math.round((width / height) * IMG_MAX_PX); height = IMG_MAX_PX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataUri = canvas.toDataURL('image/jpeg', IMG_QUALITY);
      if (dataUri.length > IMG_MAX_B64) {
        reject(new Error(`Image is too large even after resizing (>${IMG_MAX_B64 / 1024 / 1024} MB).`));
      } else {
        resolve(dataUri);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not load image')); };
    img.src = objectUrl;
  });
}

function readAsText(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.readAsText(file);
  });
}

function FileChip({ file, onRemove }) {
  if (file.kind === 'image') {
    return (
      <div className="relative group shrink-0">
        <img
          src={file.dataUri}
          alt={file.name}
          className="w-16 h-16 rounded-xl object-cover border border-[#3a3a3a]"
        />
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#1a1a1a] border border-[#3a3a3a]
                     text-[#8e8ea0] hover:text-red-400 hover:border-red-400 transition-colors
                     flex items-center justify-center opacity-0 group-hover:opacity-100"
        >
          <X className="w-2.5 h-2.5" />
        </button>
        <div className="absolute bottom-0 left-0 right-0 rounded-b-xl bg-black/50 px-1 py-0.5
                        opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-[10px] text-white truncate">{file.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-2 py-1 max-w-[180px]">
      <FileText className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
      <span className="text-xs text-[#adadad] truncate flex-1">{file.name}</span>
      <button
        onClick={onRemove}
        className="text-[#555] hover:text-red-400 transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function ChatInput({ onSend, onStop, isGenerating }) {
  const [input,       setInput]       = useState('');
  const [attachments, setAttachments] = useState([]);
  const [processing,  setProcessing]  = useState(false);
  const [fileError,   setFileError]   = useState('');
  const [menuIndex,   setMenuIndex]   = useState(0);
  const textareaRef  = useRef(null);
  const fileInputRef = useRef(null);
  const menuRef      = useRef(null);
  const { selectedModel, token } = useStore();

  // Slash command menu
  const slashActive   = input.startsWith('/') && !input.includes(' ');
  const slashQuery    = slashActive ? input.slice(1).toLowerCase() : null;
  const menuTemplates = slashQuery === null ? [] : slashQuery === ''
    ? TEMPLATES
    : TEMPLATES.filter((t) =>
        t.id.includes(slashQuery) ||
        t.label.toLowerCase().includes(slashQuery) ||
        t.desc.toLowerCase().includes(slashQuery)
      );
  const showMenu = slashQuery !== null;

  const canSend = (input.trim() || attachments.length > 0) && selectedModel && !isGenerating && !processing;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  // Reset highlighted row when visible template list changes
  useEffect(() => { setMenuIndex(0); }, [slashQuery]);

  // Scroll active menu item into view
  useEffect(() => {
    menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [menuIndex]);

  const insertTemplate = (template) => {
    setInput(template.prompt);
    setMenuIndex(0);
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = template.prompt.length; }
    }, 0);
  };

  const processFiles = async (fileList) => {
    setProcessing(true);
    setFileError('');
    const errors = [];
    const results = [];
    await Promise.all(
      Array.from(fileList).map(async (file) => {
        try {
          // Images — resize client-side then encode as JPEG data URI
          if (file.type.startsWith('image/')) {
            const dataUri = await resizeImage(file);
            results.push({ kind: 'image', name: file.name, size: file.size, type: 'image/jpeg',
                           dataUri, base64: dataUri.split(',')[1] });
            return;
          }

          // PDFs and DOCX — extract text server-side
          if (EXTRACT_SERVER.has(file.type)) {
            const dataUri = await readAsDataURL(file);
            const res = await fetch('/chats/extract-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ base64: dataUri.split(',')[1], mimeType: file.type }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Extraction failed');
            results.push({ kind: 'text', name: file.name, size: file.size, type: file.type, text: data.text });
            return;
          }

          // Plain text / code files — read client-side
          const text = await readAsText(file);
          results.push({ kind: 'text', name: file.name, size: file.size, type: file.type, text });
        } catch (err) {
          errors.push(`${file.name}: ${err.message}`);
        }
      })
    );
    if (results.length > 0) setAttachments((prev) => [...prev, ...results]);
    if (errors.length > 0) setFileError(errors.join(' · '));
    setProcessing(false);
  };

  const removeAttachment = (i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i));

  const send = () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || !selectedModel || isGenerating || processing) return;
    onSend(text, attachments);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const onKeyDown = (e) => {
    if (showMenu && menuTemplates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex((i) => Math.min(i + 1, menuTemplates.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMenuIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); insertTemplate(menuTemplates[menuIndex]); return; }
    }
    if (showMenu && e.key === 'Escape') { setInput(''); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const onDrop = (e) => {
    e.preventDefault();
    processFiles(e.dataTransfer.files);
  };

  return (
    <div className="bg-[#212121] px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        {!selectedModel && (
          <div className="flex items-center gap-2 text-amber-400 text-xs mb-2 px-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Select a model to start chatting
          </div>
        )}
        {fileError && (
          <div className="flex items-start gap-2 text-red-400 text-xs mb-2 px-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{fileError}</span>
            <button onClick={() => setFileError('')} className="ml-auto text-[#555] hover:text-red-400 shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div
          className="relative bg-[#2f2f2f] border border-[#3a3a3a] rounded-2xl
                     focus-within:border-[#4a4a4a] transition-colors shadow-sm"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {/* Slash command menu */}
          {showMenu && (
            <div
              ref={menuRef}
              className="absolute bottom-full left-0 right-0 mb-2 bg-[#1c1c1c] border border-[#3a3a3a]
                         rounded-xl shadow-2xl overflow-hidden z-20"
            >
              <div className="px-3 py-1.5 border-b border-[#2a2a2a] flex items-center justify-between">
                <span className="text-[10px] text-[#555] font-medium uppercase tracking-wider">Prompt Templates</span>
                <span className="text-[10px] text-[#444]">↑↓ navigate · Enter insert · Esc cancel</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {menuTemplates.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-[#555]">No templates matching "/{slashQuery}"</p>
                ) : (
                  menuTemplates.map((t, i) => (
                    <button
                      key={t.id}
                      data-active={i === menuIndex ? 'true' : 'false'}
                      onClick={() => insertTemplate(t)}
                      onMouseEnter={() => setMenuIndex(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                        ${i === menuIndex ? 'bg-[#2a2a2a]' : 'hover:bg-[#242424]'}`}
                    >
                      <span className="text-[#10a37f] font-mono text-xs w-20 shrink-0">/{t.id}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[#ececec] font-medium leading-none mb-0.5">{t.label}</p>
                        <p className="text-xs text-[#555] truncate">{t.desc}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Attached file chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
              {attachments.map((f, i) => (
                <FileChip key={i} file={f} onRemove={() => removeAttachment(i)} />
              ))}
            </div>
          )}

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

          {/* Bottom bar — attach | [flex-1 model selector] | send */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center px-3 pb-3 gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => { processFiles(e.target.files); e.target.value = ''; }}
            />

            {/* Attach */}
            <button
              onClick={() => !processing && fileInputRef.current?.click()}
              title="Attach files, images, or PDFs"
              disabled={processing}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                         bg-[#3a3a3a] hover:bg-[#444] text-[#adadad] hover:text-white
                         transition-colors disabled:cursor-wait"
            >
              {processing
                ? <Loader2 className="w-4 h-4 animate-spin text-[#10a37f]" />
                : <Plus className="w-4 h-4" />}
            </button>

            {/* Model selector grows to fill remaining space */}
            <div className="flex-1 min-w-0">
              <ModelSelector />
            </div>

            {/* Send / Stop */}
            <button
              onClick={isGenerating ? onStop : send}
              disabled={!isGenerating && !canSend}
              title={isGenerating ? 'Stop generating' : 'Send message'}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0
                bg-[#3a3a3a] hover:bg-[#444]
                ${isGenerating || canSend ? 'text-white' : 'text-[#555] cursor-not-allowed'}`}
            >
              {isGenerating
                ? <Square className="w-3.5 h-3.5 fill-current" />
                : <ArrowUp className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <p className="hidden sm:block text-center text-[#444] text-xs mt-2">
          Enter to send · Shift+Enter for new line · / for templates · Drop files to attach
        </p>
      </div>
    </div>
  );
}
