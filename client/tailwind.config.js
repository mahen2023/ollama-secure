/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Dark neutral surfaces + green brand accent.
      // fg-faint is the dimmest text allowed: still ≥4.5:1 on ink.
      colors: {
        ink:   { DEFAULT: '#212121', deep: '#171717', abyss: '#141414' },
        panel: { DEFAULT: '#2a2a2a', hi: '#333333' },
        rule:  { DEFAULT: '#3a3a3a', hi: '#404040' },
        fg:    { DEFAULT: '#ececec', soft: '#adadad', muted: '#8e8ea0', faint: '#888888' },
        brand: { DEFAULT: '#10a37f', dim: '#0d9270', deep: '#0a6b54' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      animation: {
        'bounce-dot': 'bounce 1s infinite',
      },
    },
  },
  plugins: [],
};
