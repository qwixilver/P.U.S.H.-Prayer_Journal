// src/index.jsx
// Entry point of the React application.

// Import React (needed for JSX syntax) and ReactDOM to render our app into the DOM.
import React from 'react';
import ReactDOM from 'react-dom/client'; // React 18+ API

// Import the global CSS file where Tailwind directives are compiled.
import './index.css';

// Import the root App component.
import App from './App';

// src/index.jsx (or src/App.jsx inside a useEffect(() => {...}, []))
import { dbReady } from './db';

dbReady().then(() => {
  // Optional but nice: log counts quickly on boot
  window.DEBUG_DB?.();
});

// Find the <div id="root"> in public/index.html.
const rootElement = document.getElementById('root');

// Create a root for concurrent rendering (React 18+).
const root = ReactDOM.createRoot(rootElement);

// Render the App component wrapped in React.StrictMode to help identify potential problems.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
