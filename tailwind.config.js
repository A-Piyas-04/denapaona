/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        // Semantic tokens → CSS variables (swap with .light / .dark)
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        night: {
          DEFAULT: 'rgb(var(--night) / <alpha-value>)',
          elev: 'rgb(var(--night-elev) / <alpha-value>)',
          line: 'rgb(var(--night-line) / <alpha-value>)',
        },
        paper: {
          DEFAULT: 'rgb(var(--paper) / <alpha-value>)',
          muted: 'rgb(var(--paper-muted) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
        },
        cream: 'rgb(var(--cream) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
          fg: 'rgb(var(--brand-fg) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink) / <alpha-value>)',
          muted: 'rgb(var(--brand-muted) / <alpha-value>)',
        },
        owe: {
          DEFAULT: 'rgb(var(--owe) / <alpha-value>)',
          soft: 'rgb(var(--owe-soft) / <alpha-value>)',
        },
        owed: {
          DEFAULT: 'rgb(var(--owed) / <alpha-value>)',
          soft: 'rgb(var(--owed-soft) / <alpha-value>)',
        },
        pending: {
          DEFAULT: 'rgb(var(--pending) / <alpha-value>)',
          soft: 'rgb(var(--pending-soft) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Figtree', '"Hind Siliguri"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Hind Siliguri"', 'Figtree', 'system-ui', 'sans-serif'],
        latin: ['Figtree', 'system-ui', 'sans-serif'],
      },
      maxWidth: { app: '28rem' },
      boxShadow: {
        float: 'var(--shadow-float)',
        nav: 'var(--shadow-nav)',
        soft: 'var(--shadow-soft)',
        header: 'var(--shadow-header)',
        gold: 'var(--shadow-gold)',
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
