import { useEffect, useRef, useState } from 'react';
import { X, Mic, Loader2, AudioLines } from 'lucide-react';
import { useStore } from '../../store';
import { listen, speak, stopSpeaking, toSpeech } from '../../speech';
import { warmModel } from '../../api/ollama';

const messageCount = () => useStore.getState().currentChat?.messages?.length ?? 0;

// Text of the assistant reply streamed since the chat had `baseLen` messages
// ('' if the send never added one, e.g. no model selected).
function replySince(baseLen) {
  const msgs = useStore.getState().currentChat?.messages ?? [];
  const last = msgs[msgs.length - 1];
  return msgs.length > baseLen && last?.role === 'assistant' ? last.content : '';
}

const HINT = {
  idle:      'Tap to speak',
  listening: 'Listening… tap when done',
  thinking:  'Thinking… tap to cancel',
  speaking:  'Speaking… tap to interrupt',
};

// Next speakable piece of the streamed reply, or undefined if none is ready yet.
// The first piece is cut early (first clause, or 8 words) so speech starts fast;
// later pieces take every complete sentence available.
function nextChunk(rest, isFirst) {
  if (isFirst) return rest.match(/^[\s\S]{12,}?[.!?:;,\n](?=\s)/)?.[0] ?? rest.match(/^(\S+\s+){8}/)?.[0];
  return rest.match(/^[\s\S]*[.!?:;\n](?=\s)/)?.[0];
}

// Hands-free loop: listen → send through the normal chat flow → speak the
// reply sentence by sentence while it streams → listen again.
export default function VoiceMode({ onSend, onStop, onClose }) {
  const [phase,      setPhase]      = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [error,      setError]      = useState('');

  const stopListenRef = useRef(null);
  const turnRef       = useRef(0);      // bumped on interrupt/close; stale callbacks compare against it
  const awaitingRef   = useRef(false);  // reply still streaming
  const spokenRef     = useRef(0);      // chars of the reply already queued for speech
  const pendingRef    = useRef(0);      // queued sentences not yet finished
  const baseLenRef    = useRef(0);      // message count before the current send

  const startListening = () => {
    setPhase('listening'); setTranscript(''); setError('');
    const turn = turnRef.current;
    stopListenRef.current = listen({
      silenceMs: 900,
      onPartial: setTranscript,
      onEnd: (text) => {
        stopListenRef.current = null;
        if (turn !== turnRef.current) return;
        text = text.trim();
        setTranscript(text);
        if (text) send(text); else setPhase('idle');
      },
      onError: (msg) => { setError(msg); setPhase('idle'); },
    });
  };

  const enqueue = (chunk, turn) => {
    const text = toSpeech(chunk);
    if (!text) return;
    pendingRef.current++;
    setPhase('speaking');
    const rate = useStore.getState().settings.speechRate || 1;
    // Handed to the engine right away (queued behind what's playing) so there's no gap between sentences
    speak(text, rate, { queue: true })
      .catch(() => {})
      .then(() => {
        if (turn !== turnRef.current) return;
        if (--pendingRef.current === 0 && !awaitingRef.current) startListening();
      });
  };

  // Queue whatever is speakable so far (all of it once final).
  const flush = (final, turn) => {
    const rest = replySince(baseLenRef.current).slice(spokenRef.current);
    const chunk = final ? rest : nextChunk(rest, spokenRef.current === 0);
    if (!chunk) return;
    spokenRef.current += chunk.length;
    enqueue(chunk, turn);
  };

  const send = async (text) => {
    const turn = turnRef.current;
    spokenRef.current = 0;
    baseLenRef.current = messageCount();
    awaitingRef.current = true;
    setPhase('thinking');
    await onSend(text);
    if (turn !== turnRef.current) return;
    awaitingRef.current = false;
    flush(true, turn);
    if (pendingRef.current === 0) startListening();
  };

  // Drop whatever is in flight: listening, generation, speech.
  const reset = () => {
    turnRef.current++;
    stopListenRef.current?.();
    stopListenRef.current = null;
    if (awaitingRef.current) onStop();
    awaitingRef.current = false;
    pendingRef.current = 0;
    stopSpeaking();
  };

  const onOrb = () => {
    if (phase === 'listening') return stopListenRef.current?.();   // end of turn → onEnd sends it
    reset();
    startListening();
  };

  const close = () => { reset(); onClose(); };

  useEffect(() => {
    // Load the model into memory while the user is still talking
    const { token, selectedModel } = useStore.getState();
    if (selectedModel) warmModel(token, selectedModel);
    const unsub = useStore.subscribe(() => {
      if (awaitingRef.current) flush(false, turnRef.current);
    });
    startListening();
    return () => { unsub(); reset(); };
  }, []);

  const Icon = phase === 'thinking' ? Loader2 : phase === 'speaking' ? AudioLines : Mic;

  return (
    <div className="fixed inset-0 z-50 bg-[#171717] safe-area">
    <div className="h-full flex flex-col items-center justify-between p-6">
      <div className="w-full flex justify-end">
        <button onClick={close} title="End voice mode"
          className="w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#333] flex items-center justify-center text-[#adadad]">
          <X className="w-5 h-5" />
        </button>
      </div>

      <button onClick={onOrb} title={HINT[phase]}
        className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-500
          ${phase === 'listening' ? 'bg-[#10a37f] scale-110 animate-pulse'
          : phase === 'speaking'  ? 'bg-[#10a37f]/80 scale-100'
          : 'bg-[#2f2f2f] scale-90'}`}>
        <Icon className={`w-14 h-14 text-white ${phase === 'thinking' ? 'animate-spin' : ''}`} />
      </button>

      <div className="w-full max-w-md text-center space-y-3 min-h-[6rem]">
        <p className="text-sm text-[#8e8ea0]">{HINT[phase]}</p>
        {transcript && <p className="text-[#ececec] text-base line-clamp-3">{transcript}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </div>
    </div>
  );
}
