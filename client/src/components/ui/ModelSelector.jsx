import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Cpu, RefreshCw } from 'lucide-react';
import { useStore } from '../../store';
import { fetchModels } from '../../api/ollama';

export default function ModelSelector() {
  const { models, selectedModel, setSelectedModel, setModels, apiKey } = useStore();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const refresh = async (e) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      const m = await fetchModels(apiKey);
      setModels(m);
    } catch { /* silent */ } finally {
      setRefreshing(false);
    }
  };
 // Filter out embedding models
  const chatModels = models.filter((m) => {
    const name   = m.name?.toLowerCase() ?? '';
    const family = m.details?.family?.toLowerCase() ?? '';
    return !name.includes('embed') && !family.includes('embed') && !family.includes('bert');
  });

  // Group by details.family; fall back to 'other'
  const grouped = chatModels.reduce((acc, m) => {
    const key = m.details?.family ?? 'other';
    (acc[key] ??= []).push(m);
    return acc;
  }, {});
  const families   = Object.keys(grouped).sort();
  const showGroups = families.length > 1;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#212121] hover:bg-[#1a1a1a] border border-[#3a3a3a]
                   text-sm text-white rounded-lg transition-colors w-full max-w-[220px] min-w-0 overflow-hidden"
      >
        <Cpu className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
        <span className="truncate flex-1 text-left">{selectedModel || 'Select model'}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#8e8ea0] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 sm:left-auto sm:right-0 w-72 max-w-[calc(100vw-2rem)] bg-[#2a2a2a] border border-[#3a3a3a] rounded-xl shadow-2xl z-50">
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="text-xs font-semibold text-[#8e8ea0] uppercase tracking-wide">Available Models</span>
            <button onClick={refresh} className="text-[#8e8ea0] hover:text-white transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto pb-2">
            {(() => {
              const chatModels = models.filter((m) => {
                const name = m.name?.toLowerCase() ?? '';
                const family = m.details?.family?.toLowerCase() ?? '';
                return !name.includes('embed') && !family.includes('embed') && !family.includes('bert');
              });
              return chatModels.length === 0 ? (
                <p className="text-[#555] text-sm text-center py-4">No models — pull one first</p>
              ) : (
                chatModels.map((m) => (
                <button
                  key={m.name}
                  onClick={() => { setSelectedModel(m.name); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 mx-1 rounded-lg text-sm transition-colors flex items-start gap-3
                    ${m.name === selectedModel
                      ? 'bg-[#10a37f]/20 text-[#10a37f]'
                      : 'text-[#ececec] hover:bg-[#333]'}`}
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  <Cpu className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{m.name}</div>
                    <div className="text-xs opacity-60 flex gap-2 mt-0.5">
                      {m.details?.parameter_size && <span>{m.details.parameter_size}</span>}
                      {m.details?.quantization_level && <span>{m.details.quantization_level}</span>}
                    </div>
                  </div>
                  {m.name === selectedModel && (
                    <span className="ml-auto text-xs bg-[#10a37f]/20 text-[#10a37f] px-1.5 py-0.5 rounded">active</span>
                  )}
                </button>
                ))
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
