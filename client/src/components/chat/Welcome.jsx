import { useMemo, useState } from 'react';
import {
  Code2, PenLine, GraduationCap, CalendarCheck, Sparkles, Shuffle,
  Bug, Database, Terminal, Braces, Mail, Feather, MessageSquareQuote, FileText,
  Atom, Landmark, Brain, Calculator, Route, ListChecks, Utensils, Wallet,
  Dices, Drama, Puzzle, Music,
} from 'lucide-react';
import AppLogo from '../AppLogo';

const MONTH = new Date().toLocaleString('en', { month: 'long' });

const CATEGORIES = [
  { id: 'code',  label: 'Code',  icon: Code2 },
  { id: 'write', label: 'Write', icon: PenLine },
  { id: 'learn', label: 'Learn', icon: GraduationCap },
  { id: 'plan',  label: 'Plan',  icon: CalendarCheck },
  { id: 'play',  label: 'Play',  icon: Sparkles },
];

const POOL = [
  { cat: 'code', icon: Bug,      prompt: 'Here\'s a bug pattern I keep hitting: async code in a loop runs out of order. Show me three ways to fix it in JavaScript.' },
  { cat: 'code', icon: Database, prompt: 'Design a Postgres schema for a habit tracker with streaks, then write the query that finds everyone\'s longest streak.' },
  { cat: 'code', icon: Terminal, prompt: 'Write a one-line shell command that finds the 10 largest files in a folder, then explain each part.' },
  { cat: 'code', icon: Braces,   prompt: 'Rewrite a 200-line if/else chain as a lookup table. Show a before and after in Python.' },
  { cat: 'code', icon: Code2,    prompt: 'Explain the difference between a process, a thread, and a coroutine using a restaurant kitchen as the analogy.' },
  { cat: 'code', icon: Bug,      prompt: 'Act as a strict code reviewer. I\'ll paste a function next; list what you\'d block the PR for and what\'s just a nit.' },
  { cat: 'code', icon: Database, prompt: 'When should I pick SQLite over Postgres? Give me a decision checklist, not an essay.' },
  { cat: 'code', icon: Braces,   prompt: 'Build a regex that validates ISO 8601 dates, then list five strings that would fool a naive version.' },

  { cat: 'write', icon: Mail,               prompt: 'Draft a polite email declining a meeting that could have been a message. Keep it under 80 words.' },
  { cat: 'write', icon: Feather,            prompt: 'Write a six-word story about a robot learning to garden, then five more variations in different moods.' },
  { cat: 'write', icon: MessageSquareQuote, prompt: 'Turn this into plain English: "We are leveraging synergies to operationalize our go-forward strategy."' },
  { cat: 'write', icon: FileText,           prompt: 'Give me a template for a one-page project proposal with the questions each section should answer.' },
  { cat: 'write', icon: PenLine,            prompt: 'Write a LinkedIn post announcing a side project launch that doesn\'t sound like a LinkedIn post.' },
  { cat: 'write', icon: Mail,               prompt: 'Help me write a follow-up after a job interview that mentions one specific thing we discussed.' },
  { cat: 'write', icon: Feather,            prompt: `Write a short poem about ${MONTH} where every line starts with the next letter of the alphabet.` },
  { cat: 'write', icon: MessageSquareQuote, prompt: 'Give me five opening lines for a talk about failure that don\'t start with a dictionary definition.' },

  { cat: 'learn', icon: Atom,          prompt: 'Explain how a transformer model works as if I\'m a curious 12-year-old, then again as a CS undergrad.' },
  { cat: 'learn', icon: Landmark,      prompt: 'What were the three biggest consequences of the printing press that people at the time didn\'t predict?' },
  { cat: 'learn', icon: Brain,         prompt: 'Quiz me on basic statistics. Ask one question at a time and adjust the difficulty based on my answers.' },
  { cat: 'learn', icon: Calculator,    prompt: 'Why does compound interest feel unintuitive? Walk me through it with a $100 example over 30 years.' },
  { cat: 'learn', icon: GraduationCap, prompt: 'Teach me the 20% of Spanish grammar that covers 80% of everyday conversation.' },
  { cat: 'learn', icon: Atom,          prompt: 'How do noise-cancelling headphones actually cancel noise? Include what they\'re bad at blocking.' },
  { cat: 'learn', icon: Brain,         prompt: 'Explain the Feynman technique, then use it on a topic I pick: ask me which one.' },
  { cat: 'learn', icon: Landmark,      prompt: 'Compare how Rome and the Han dynasty handled governing huge territories. Use a side-by-side table.' },

  { cat: 'plan', icon: Route,         prompt: `Plan a relaxed 3-day trip for ${MONTH} somewhere within 4 hours of a big city. Ask me which city first.` },
  { cat: 'plan', icon: ListChecks,    prompt: 'Break "learn to build a mobile app" into weekly milestones for someone with 5 hours a week.' },
  { cat: 'plan', icon: Utensils,      prompt: 'Make a 5-day vegetarian meal plan that reuses ingredients so nothing goes to waste, with one shopping list.' },
  { cat: 'plan', icon: Wallet,        prompt: 'Help me build a simple monthly budget. Ask me questions one at a time instead of giving a generic template.' },
  { cat: 'plan', icon: CalendarCheck, prompt: 'Design a morning routine that takes 20 minutes and doesn\'t involve waking up at 5am.' },
  { cat: 'plan', icon: ListChecks,    prompt: 'I have 12 tasks and 3 hours. I\'ll list them; sort them with the Eisenhower matrix and tell me what to drop.' },
  { cat: 'plan', icon: Route,         prompt: 'Plan a birthday surprise for a friend who hates surprises.' },
  { cat: 'plan', icon: Utensils,      prompt: 'What can I cook in 15 minutes with eggs, rice, and whatever vegetables are going soft?' },

  { cat: 'play', icon: Dices,   prompt: 'Run a short text adventure set in a lighthouse during a storm. I\'m the keeper. Start now.' },
  { cat: 'play', icon: Drama,   prompt: 'Argue that pineapple belongs on pizza like a courtroom lawyer, then switch sides and argue against.' },
  { cat: 'play', icon: Puzzle,  prompt: 'Give me a logic puzzle that takes about 5 minutes. Hold the answer until I ask for it.' },
  { cat: 'play', icon: Music,   prompt: 'Invent a music genre that doesn\'t exist yet: name, instruments, three song titles, and its origin story.' },
  { cat: 'play', icon: Sparkles,prompt: 'Let\'s play 20 questions. You think of something and I\'ll guess.' },
  { cat: 'play', icon: Drama,   prompt: 'Describe my day as if it were a nature documentary narrated in a hushed voice. Ask me what I did first.' },
  { cat: 'play', icon: Dices,   prompt: 'Create a board game I can play with a deck of cards, two dice, and coins. Keep the rules under 150 words.' },
  { cat: 'play', icon: Puzzle,  prompt: 'Give me a riddle whose answer is an everyday object. Hint once if I get it wrong twice.' },
];

const PAGE = 4;

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Up late?';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Welcome({ model, onPick }) {
  const [cat,   setCat]   = useState(null);
  const [round, setRound] = useState(0);

  // Reshuffle per category; rounds page through the deck so nothing repeats until it wraps
  const deck = useMemo(() => shuffled(cat ? POOL.filter((p) => p.cat === cat) : POOL), [cat]);
  const start = (round * PAGE) % deck.length;
  const visible = [...deck, ...deck].slice(start, start + PAGE);

  const next = () => setRound((r) => r + 1);
  const pickCat = (id) => { setCat((c) => (c === id ? null : id)); setRound(0); };

  return (
    <div className="w-full max-w-xl">
      <div className="flex items-center gap-4 mb-8">
        <AppLogo className="w-12 h-12 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-white">{greeting()}</h1>
          <p className="text-sm text-fg-muted truncate">
            {model
              ? <>Chatting with <span className="text-fg">{model.replace(/:latest$/, '')}</span></>
              : 'Pick a model at the top to start'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 py-1 flex-1" role="group" aria-label="Filter suggestions">
          {CATEGORIES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => pickCat(id)}
              aria-pressed={cat === id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
                ${cat === id
                  ? 'bg-brand text-white'
                  : 'bg-panel text-fg-soft hover:text-white hover:bg-panel-hi'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={next}
          title="Show other ideas"
          aria-label="Show other ideas"
          className="welcome-shuffle relative shrink-0 w-9 h-9 grid place-items-center rounded-full text-fg-muted
                     hover:text-white hover:bg-panel transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {/* The ring is the auto-rotate timer: its animation ending advances the deck */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
            <circle
              key={`${cat}-${round}`}
              cx="18" cy="18" r="16" fill="none" stroke="#10a37f" strokeWidth="1.5" strokeLinecap="round"
              pathLength="100" strokeDasharray="100"
              className="welcome-timer"
              onAnimationEnd={next}
            />
          </svg>
          <Shuffle className="w-4 h-4" />
        </button>
      </div>

      <ul key={`${cat}-${round}`} className="welcome-deck flex flex-col gap-0.5">
        {visible.map(({ icon: Icon, prompt, cat: c }) => (
          <li key={prompt}>
            <button
              onClick={() => onPick(prompt)}
              disabled={!model}
              className="w-full flex items-start gap-3 px-3 py-3 -mx-3 rounded-xl text-left transition-colors
                         hover:bg-panel disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group"
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0 text-brand" aria-hidden="true" />
              <span className="flex-1 text-sm leading-6 text-fg-soft group-hover:text-white transition-colors">
                {prompt}
              </span>
              {!cat && (
                <span className="hidden sm:block text-[11px] leading-6 text-fg-faint shrink-0">
                  {CATEGORIES.find((x) => x.id === c).label}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
