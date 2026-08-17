/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Named micro steps so badges/labels stop using ad-hoc pixel values
      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }],  // 10px - badges, table meta
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],     // 11px - dense secondary text
      },
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0284c7',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c4a6e',
        },
        // Light-theme surface tokens
        surface: {
          page: '#f5f7fa',
          card: '#ffffff',
          muted: '#f8fafc',
          border: '#e2e8f0',
          hover: '#f1f5f9'
        }
      }
    },
  },
  plugins: [],
}
