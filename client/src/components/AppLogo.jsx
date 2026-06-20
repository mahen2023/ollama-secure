export default function AppLogo({ className = '', alt = 'Ollama Chat' }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-label={alt}
      role="img"
    >
      <defs>
        <linearGradient id="ollama-logo-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10a37f" />
          <stop offset="100%" stopColor="#0a6b54" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#ollama-logo-bg)" />
      <polygon points="40,6 22,34 32,34 18,58 46,28 36,28" fill="white" />
    </svg>
  );
}
