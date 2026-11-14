/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Soft mint paper — calm ledger feel, not cream/terracotta or purple SaaS.
        canvas: '#EEF4F2',
        ink: '#0F1F1C',
        brand: { DEFAULT: '#0A6B61', hover: '#08554D', fg: '#ffffff', soft: '#D8EDE9', ink: '#043F39' },
        // You need to give (warm coral-red) / you're supposed to get (deep leaf green)
        owe: { DEFAULT: '#C2412D', soft: '#FCEEEA' },
        owed: { DEFAULT: '#0F7A4A', soft: '#E3F5EC' },
        pending: { DEFAULT: '#9A5B12', soft: '#FBF0E0' },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', '"Hind Siliguri"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Lexend', '"Hind Siliguri"', 'system-ui', 'sans-serif'],
      },
      maxWidth: { app: '28rem' },
      boxShadow: {
        float: '0 12px 32px -14px rgba(4, 63, 57, 0.22), 0 2px 8px -2px rgba(4, 63, 57, 0.08)',
        nav: '0 -1px 0 rgba(15, 31, 28, 0.06), 0 -10px 28px -18px rgba(4, 63, 57, 0.2)',
        soft: '0 1px 2px rgba(15, 31, 28, 0.04), 0 4px 16px -6px rgba(4, 63, 57, 0.1)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'sheet-in': 'sheet-in 240ms cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 180ms ease-out',
        'toast-in': 'toast-in 200ms cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [],
};
