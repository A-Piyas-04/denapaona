/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0f766e', fg: '#ffffff', soft: '#ccfbf1' },
        owe: { DEFAULT: '#b91c1c', soft: '#fee2e2' },   // you owe — red
        owed: { DEFAULT: '#15803d', soft: '#dcfce7' },  // you're owed — green
      },
      fontFamily: {
        sans: ['"Hind Siliguri"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      maxWidth: { app: '28rem' },
    },
  },
  plugins: [],
};
