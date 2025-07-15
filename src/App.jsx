// src/App.jsx
// Main application component: sets up the overall layout and view switching logic.

import React, { useState } from 'react';
// Bottom navigation bar component (will hold the tab buttons).
import BottomNav from './components/BottomNav';
// Individual view components for different screens.
import SingleView from './components/SingleView';
import CategoryList from './components/CategoryList';
import PrayerList from './components/PrayerList';

// IndexedDB instance (we'll use this to load and save data locally).
import { db } from './db';

function App() {
  // currentView holds the index of the active screen (0 = SingleView, 1 = CategoryList, etc.).
  const [currentView, setCurrentView] = useState(0);

  // Define an array mapping indices to components.
  // We pass props (like viewType) to customize behavior.
  const views = [
    <SingleView />,                       // Random single prayer view
    <PrayerList viewType="daily" />,    // Daily list of prayers
    <CategoryList />,                     // Quick list by category
    <PrayerList viewType="security" />, // Security-only prayers
  ];

  return (
    // Container flex column takes full screen height for layout.
    <div className="flex flex-col h-screen">
      {/* Main content area: grows to fill and scrolls if necessary */}
      <main className="flex-grow overflow-auto">
        {views[currentView]}
      </main>

      {/* Persistent bottom navigation bar */}
      <BottomNav
        currentIndex={currentView}
        onChange={(newIndex) => setCurrentView(newIndex)}
      />
    </div>
  );
}

export default App;
