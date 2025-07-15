// postcss.config.js
// PostCSS is a tool for transforming CSS with JavaScript plugins. Here we configure it to run Tailwind and autoprefixer.

module.exports = {
  plugins: {
    // `tailwindcss` plugin processes Tailwind directives in your CSS
    tailwindcss: {},
    // `autoprefixer` adds vendor prefixes (e.g., -webkit-) for broader browser support
    autoprefixer: {},
  },
};
