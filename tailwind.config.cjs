const forms = require('@tailwindcss/forms');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        moss: {
          50: '#f4f8f3',
          100: '#e5efe2',
          200: '#c9ddc3',
          500: '#5b7f5d',
          700: '#37513b',
          900: '#1c2b1f'
        },
        sand: '#efe9dd'
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif']
      }
    }
  },
  plugins: [forms]
};
