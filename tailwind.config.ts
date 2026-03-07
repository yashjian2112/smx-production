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
          dark: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          accent: '#0ea5e9',
          success: '#22c55e',
          warn: '#eab308',
          danger: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      safeArea: {
        bottom: 'env(safe-area-inset-bottom, 0px)',
      },
    },
  },
  plugins: [],
};

export default config;
