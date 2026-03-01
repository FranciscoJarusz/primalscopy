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
        'primacult': '#1322D3',
        'primacult-dark': '#090746',
      },
      backgroundImage: {
        'primacult-gradient': 'linear-gradient(135deg, #000000 0%, #090746 100%)',
      }
    },
  },
  plugins: [],
}
