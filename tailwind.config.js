/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        // Warm night ledger + mustard gold (দেনা পাওনা)
        canvas: '#12100E',
        night: { DEFAULT: '#1C1814', elev: '#26211C', line: '#3A342C' },
        paper: { DEFAULT: '#FFF8EE', muted: '#F3EBD9' },
        ink: { DEFAULT: '#1A1510', soft: '#5C5348' },
        cream: '#F3E6C8',
        brand: {
          DEFAULT: '#F0B429',
          hover: '#DFA010',
          fg: '#1A1510',
          soft: '#F8E9C0',
          ink: '#8A6410',
          muted: '#3A3018',
        },
        // Give / get — readable on paper cards
        owe: { DEFAULT: '#D94B32', soft: '#FCE8E2' },
        owed: { DEFAULT: '#2F8F5B', soft: '#E2F4EA' },
        pending: { DEFAULT: '#C4891A', soft: '#F8ECD0' },
      },
      fontFamily: {
        sans: ['Figtree', '"Hind Siliguri"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Hind Siliguri"', 'Figtree', 'system-ui', 'sans-serif'],
        latin: ['Figtree', 'system-ui', 'sans-serif'],
      },
      maxWidth: { app: '28rem' },
      boxShadow: {
        float: '0 14px 36px -12px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(240, 180, 41, 0.12)',
        nav: '0 -1px 0 rgba(255, 248, 238, 0.06), 0 -12px 32px -16px rgba(0, 0, 0, 0.55)',
        soft: '0 1px 2px rgba(26, 21, 16, 0.06), 0 8px 24px -10px rgba(26, 21, 16, 0.14)',
        header: '0 1px 0 rgba(255, 248, 238, 0.06)',
        gold: '0 8px 24px -8px rgba(240, 180, 41, 0.45)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'page-enter': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        indeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        'sheet-in': 'sheet-in 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 180ms ease-out',
        'toast-in': 'toast-in 200ms cubic-bezier(0.23, 1, 0.32, 1)',
        'page-enter': 'page-enter 280ms cubic-bezier(0.23, 1, 0.32, 1)',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        indeterminate: 'indeterminate 1.1s cubic-bezier(0.45, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
