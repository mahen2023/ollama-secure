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

// Listens for one utterance. onPartial gets live text (browser only, Android
// reports the result at the end). onEnd(text) fires once; text is '' when
// nothing was heard. Returns a function that ends listening early.
// ponytail: native runs without partial results — the plugin's partial mode
// swallows no-speech errors, so end-of-turn can't be detected reliably there.
export function listen({ onPartial, onEnd, onError }) {
  let ended = false;
  const end = (text) => { if (!ended) { ended = true; onEnd(text); } };

  if (native) {
    (async () => {
      const { speechRecognition } = await SpeechRecognition.requestPermissions();
      if (speechRecognition !== 'granted') return onError('Microphone permission denied');
      try {
        const { matches } = await SpeechRecognition.start({ language: lang, maxResults: 1, partialResults: false, popup: false });
        end(matches?.[0] ?? '');
      } catch {
        end('');   // no match / speech timeout
      }
    })();
    return () => SpeechRecognition.stop().catch(() => {});
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
export function speak(text, rate = 1) {
  if (native) return TextToSpeech.speak({ text, lang, rate });
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    u.onend = u.onerror = resolve;
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
