import { useEffect, useRef, useState } from 'react';
import { X, Mic, Loader2, AudioLines } from 'lucide-react';
import { useStore } from '../../store';
import { listen, speak, stopSpeaking, toSpeech } from '../../speech';

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
  const queueRef      = useRef(Promise.resolve());

  const startListening = () => {
    setPhase('listening'); setTranscript(''); setError('');
    const turn = turnRef.current;
    stopListenRef.current = listen({
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
    queueRef.current = queueRef.current
      .then(() => turn === turnRef.current && speak(text, rate))
      .catch(() => {})
      .then(() => {
        if (turn !== turnRef.current) return;
        if (--pendingRef.current === 0 && !awaitingRef.current) startListening();
      });
  };

  // Queue every complete sentence that has streamed in so far (all of it once final).
  const flush = (final, turn) => {
    const rest = replySince(baseLenRef.current).slice(spokenRef.current);
    const chunk = final ? rest : rest.match(/^[\s\S]*[.!?:;\n](?=\s)/)?.[0];
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
    queueRef.current = Promise.resolve();
    stopSpeaking();
  };

  const onOrb = () => {
    if (phase === 'listening') return stopListenRef.current?.();   // end of turn → onEnd sends it
    reset();
    startListening();
  };

  const close = () => { reset(); onClose(); };

  useEffect(() => {
    useStore.getState().setVoiceActive(true);
    const unsub = useStore.subscribe(() => {
      if (awaitingRef.current) flush(false, turnRef.current);
    });
    startListening();
    return () => { unsub(); reset(); useStore.getState().setVoiceActive(false); };
  }, []);

  const Icon = phase === 'thinking' ? Loader2 : phase === 'speaking' ? AudioLines : Mic;

  return (
    <div className="fixed inset-0 z-50 bg-[#171717] flex flex-col items-center justify-between
                    pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] px-6">
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
  );
}
