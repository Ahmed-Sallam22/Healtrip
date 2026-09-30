import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Each stack includes the other script's font so mixed AR/EN text never falls back to a system face.
        sans: ['var(--font-inter)', 'var(--font-arabic)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'var(--font-inter)', 'Tahoma', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'dot-bounce': { '0%, 80%, 100%': { opacity: '0.3', transform: 'scale(0.8)' }, '40%': { opacity: '1', transform: 'scale(1)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.25s ease-out both',
        'dot-bounce': 'dot-bounce 1.2s infinite ease-in-out both',
      },
    },
  },
  plugins: [],
};

export default config;
