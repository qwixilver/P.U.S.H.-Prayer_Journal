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

The first-run walkthrough uses the real list, Focus, category, and journal screens
with an isolated in-memory practice database. Practice saves are discarded on
Finish, Skip, reload, or leaving the page. Settings in the tour is a safe preview;
it cannot change permissions, export real data, or join a group. Replay it using
**Settings > Onboarding > Show tutorial**. Existing users are not forced through
the walkthrough again after an update.

Focus shows the current requestor and category, including after a name or
assignment changes. Reminders and the Settings test use the same app icon and
96px monochrome notification badge. On devices with an active service worker,
timer-based reminders also use that worker, and tapping a reminder opens the app.
Browser/OS support controls icon rendering, app attribution, grouping, and delivery.
Installing from the same browser may provide a separate app notification identity
on supported platforms; a home-screen shortcut alone does not guarantee it.
Existing scheduled notifications need their schedule reapplied to pick up new icons.

Use **Settings > Notifications & Reminders > Test now** to check the actual phone's
notification appearance. Local timers still require the app to remain running;
this update does not add server push or guaranteed closed-app scheduling.

`tests/experience-browser.mjs` starts and stops its own local test server on port
4174. With Playwright available through `CP_PLAYWRIGHT_PATH`, run it with Node's
`--experimental-default-type=module` option. It covers the full interactive tour,
sample-data isolation, keyboard access, Focus relationships, and mocked notification
delivery. `CP_TOUR_WIDTH` / `CP_TOUR_HEIGHT` change the tour's initial viewport;
`CP_EXPERIENCE_SCREENSHOTS` optionally captures key steps. These tests never open a
real journal, connect to a church, or deliver a real OS notification.

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
