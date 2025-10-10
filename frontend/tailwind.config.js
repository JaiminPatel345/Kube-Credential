/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          light: '#60a5fa',
        },
      },
      boxShadow: {
        card: '0 20px 45px -15px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
}
