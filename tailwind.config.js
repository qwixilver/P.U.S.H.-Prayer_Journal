// tailwind.config.js
// This file tells Tailwind CSS where to look for class names in your project
// and allows you to customize the default design system (colors, spacing, etc.).

/** @type {import('tailwindcss').Config} */
module.exports = {
  // `content` specifies all paths where Tailwind should scan for utility class names.
  // We include the root HTML plus all JS/JSX/TS/TSX files under src/.
  content: [
    './public/index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],

  // `theme` allows you to extend or override Tailwind's default design tokens.
  // Here it's empty, so we use the defaults (e.g., colors, spacing, font sizes).
  theme: {
    extend: {},
  },

  // `plugins` is where you can add official or community plugins
  // (e.g., forms, typography, custom utilities).
  plugins: [],
};
