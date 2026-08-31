/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#163797',
          50: '#e8ecf8',
          100: '#c5ceef',
          200: '#9fb0e4',
          300: '#7892da',
          400: '#5d7cd2',
          500: '#4366ca',
          600: '#3a5cbf',
          700: '#2e4fb1',
          800: '#2243a3',
          900: '#163797',
          950: '#0f2870',
        },
        accent: {
          DEFAULT: '#f8b30e',
          50: '#fffde7',
          100: '#fff9c4',
          200: '#fff59d',
          300: '#fff176',
          400: '#ffee58',
          500: '#ffeb3b',
          600: '#fdd835',
          700: '#f9c226',
          800: '#f8b30e',
          900: '#f59500',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
