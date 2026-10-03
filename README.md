# Prayer Journal Web

## Project Setup

This is a mobile-first, offline-capable prayer journal Progressive Web App (PWA) built with React, Tailwind CSS, and IndexedDB (via Dexie). It works entirely in the browser, storing all data locally.

### Prerequisites
- [Node.js](https://nodejs.org/) (>=18.x)
- npm (comes with Node.js)

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start development server**
   ```bash
   npm run dev
   ```
   This launches Vite’s fast dev server at `http://localhost:3000`.

3. **Build for production**
   ```bash
   npm run build
   ```
   Output is in the `dist/` folder.

4. **Preview production build**
   ```bash
   npm run serve
   ```
   Serves the production bundle locally for testing offline capabilities.

## Project Structure

See `package.json` and the Canvas for `src/`, `public/`, and config files.

## Testing

The public [Google Sheets setup guide](https://closetprayer.com/guides/groups/)
is generated from `docs/groups.md` during development and production builds.
Its setup downloads come from the maintained `group-service/google-apps-script/`
templates, so the website and repository instructions stay in sync.

- Run `npm test` with Node 22+ for group protocol, local storage, and service tests.
- See [Church-owned prayer groups](docs/groups.md) for the direct invitation pilot,
  Google Sheets setup, privacy behavior, and required live deployment checks.

- Open the dev server in your browser to verify the bottom nav and placeholder screens.
- Use browser DevTools (Application tab) to inspect IndexedDB and Service Worker.

## Next Steps
- Add data through the UI (Categories, Requestors, Prayers).
- Verify offline functionality and PWA installability.
