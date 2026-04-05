/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        app: '#f8f4ff',
        surface: '#ffffff',
        'surface-2': '#f5f0ff',
        'surface-3': '#ede9fe',
      },
      boxShadow: {
        card: '0 2px 20px rgba(139,92,246,0.10)',
        'card-lg': '0 8px 32px rgba(139,92,246,0.14)',
        nav: '0 -2px 20px rgba(139,92,246,0.08)',
      },
    },
  },
  plugins: [],
}
