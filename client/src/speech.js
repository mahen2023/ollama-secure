// Speech-to-text and text-to-speech: native Android plugins in the app,
// Web Speech API in the browser.
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

const native = Capacitor.isNativePlatform();
const WebRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const lang = navigator.language || 'en-US';

export const canListen = native || !!WebRecognition;
export const canSpeak  = native || 'speechSynthesis' in window;

// Listens for one utterance. onPartial gets live text; onEnd(text) fires once,
// with '' when nothing was heard. Returns a function that ends listening early.
// silenceMs: how long a pause (no new words) ends the turn on Android — shorter
// than Android's own end-of-speech wait, and we skip its final re-recognition.
// ponytail: fixed silence timeout, a real VAD on mic levels if it cuts people off
export function listen({ onPartial, onEnd, onError, silenceMs = 1000 }) {
  let ended = false;
  const end = (text) => { if (!ended) { ended = true; onEnd(text); } };

  if (native) {
    let text = '', handles = [], timer, speechEnded = false;
    const finish = () => {
      clearTimeout(timer);
      handles.forEach((h) => h.remove());
      SpeechRecognition.stop().catch(() => {});
      end(text);
    };
    const arm = (ms) => { clearTimeout(timer); timer = setTimeout(finish, ms); };
    (async () => {
      const { speechRecognition } = await SpeechRecognition.requestPermissions();
      if (speechRecognition !== 'granted') { ended = true; return onError('Microphone permission denied'); }
      handles = await Promise.all([
        SpeechRecognition.addListener('partialResults', ({ matches }) => {
          if (!matches?.[0]) return;
          text = matches[0];
          onPartial?.(text);
          arm(speechEnded ? 300 : silenceMs);
        }),
        // Android detected end of speech — give its final result a moment, then stop
        SpeechRecognition.addListener('listeningState', ({ status }) => {
          if (status === 'stopped') { speechEnded = true; arm(300); }
        }),
      ]);
      if (ended) return handles.forEach((h) => h.remove());
      arm(8000);   // nothing said at all
      // Partial mode never reports errors (e.g. no speech) — the timers above cover that
      await SpeechRecognition.start({ language: lang, maxResults: 1, partialResults: true, popup: false }).catch(finish);
    })();
    return finish;
  }

  if (!WebRecognition) { onError('Speech recognition is not supported in this browser'); return () => {}; }
  const rec = new WebRecognition();
  rec.lang = lang;
  rec.interimResults = true;
  let text = '';
  rec.onresult = (e) => {
    text = Array.from(e.results, (r) => r[0].transcript).join('');
    onPartial?.(text);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed') onError('Microphone permission denied');
  };
  rec.onend = () => end(text);
  rec.start();
  return () => rec.stop();
}

// Resolves when the utterance finishes. After stopSpeaking() the native promise
// may never settle, so callers must not wait on it after an interrupt.
// queue: add after whatever is already playing instead of cutting it off, so
// sentences can be handed to the engine ahead of time and play back to back.
export function speak(text, rate = 1, { queue = false } = {}) {
  if (native) return TextToSpeech.speak({ text, lang, rate, queueStrategy: queue ? 1 : 0 });
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    u.onend = u.onerror = resolve;
    if (!queue) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (native) return TextToSpeech.stop().catch(() => {});
  speechSynthesis.cancel();
}

// Markdown → plain speakable text: drop code blocks, links' URLs, and symbols.
export function toSpeech(md) {
  return md
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_#>|~]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
