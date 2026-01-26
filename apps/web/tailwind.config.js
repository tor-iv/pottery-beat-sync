/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef7ed',
          100: '#fcecd5',
          200: '#f8d5aa',
          300: '#f3b874',
          400: '#ed913c',
          500: '#e97316',
          600: '#da5a0c',
          700: '#b5420c',
          800: '#903512',
          900: '#742e12',
        },
      },
    },
  },
  plugins: [],
};
