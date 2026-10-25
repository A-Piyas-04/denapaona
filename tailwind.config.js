/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F4F6F5',
        brand: { DEFAULT: '#0C5E56', hover: '#094A44', fg: '#ffffff', soft: '#E3F1EE', ink: '#073D38' },
        owe: { DEFAULT: '#B42318', soft: '#FDECEA' },      // you owe — red
        owed: { DEFAULT: '#127A42', soft: '#E4F4EA' },     // you're owed — green
        pending: { DEFAULT: '#A14A06', soft: '#FDF1E3' },  // waiting on a decision — amber
      },
      fontFamily: {
        sans: ['"Source Sans 3"', '"Hind Siliguri"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Lexend', '"Hind Siliguri"', 'system-ui', 'sans-serif'],
      },
      maxWidth: { app: '28rem' },
      boxShadow: {
        float: '0 10px 30px -12px rgba(7, 61, 56, 0.28), 0 2px 6px -2px rgba(7, 61, 56, 0.10)',
        nav: '0 -1px 0 rgba(15, 23, 42, 0.06), 0 -8px 24px -16px rgba(7, 61, 56, 0.18)',
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
