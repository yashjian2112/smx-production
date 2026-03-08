import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        smx: {
          dark: '#09090b',
          surface: '#111118',
          card: '#18181b',
          border: '#27272a',
          accent: '#0ea5e9',
          success: '#22c55e',
          warn: '#eab308',
          danger: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-sky': '0 0 0 1px rgba(14,165,233,0.15), 0 4px 24px rgba(14,165,233,0.08)',
        'card': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};

export default config;
