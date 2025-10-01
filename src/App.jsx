// src/App.jsx
// Root of the app: holds which tab is active and wires together the main views.
// NEW:
// - Tracks `singleTargetId` so we can open SingleView focused on a specific prayer.
// - Passes `onOpenSingle` down to PrayerList (Daily tab).
// - Passes `initialPrayerId` into SingleView.
// - When switching away from Single, clears the target (so Single returns to random mode next time).

import React, { useState } from 'react';
import BottomNav from './components/BottomNav';
import PrayerList from './components/PrayerList';    // Daily / Security feed
import SingleView from './components/SingleView';     // Single-card view (random or targeted)
import CategoryList from './components/CategoryList'; // Categories management

export default function App() {
  // Tabs: 'single' | 'daily' | 'categories' | 'security'
  const [activeTab, setActiveTab] = useState('daily');

  // When user chooses "open in single" for a specific prayer, we store its id here.
  // We pass this id into <SingleView initialPrayerId={...} />.
  const [singleTargetId, setSingleTargetId] = useState(null);

  // Callback given to Daily tab so it can navigate to Single with a specific prayer id.
  const openInSingle = (prayerId) => {
    setSingleTargetId(prayerId);
    setActiveTab('single');
  };

  // When user manually changes tabs:
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // If leaving the Single tab, clear the target so it returns to "random" next time.
    if (tab !== 'single' && singleTargetId !== null) {
      setSingleTargetId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Main content area */}
      <main className="flex-1 h-[calc(100vh-64px)]"> 
        {/* Pick the active tab's view */}
        {activeTab === 'daily' && (
          <PrayerList viewType="daily" onOpenSingle={openInSingle} />
        )}
        {activeTab === 'security' && (
          <PrayerList viewType="security" onOpenSingle={openInSingle} />
        )}
        {activeTab === 'categories' && <CategoryList />}

        {activeTab === 'single' && (
          <SingleView initialPrayerId={singleTargetId} />
        )}
      </main>

      {/* Bottom navigation at the bottom of the screen */}
      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  );
}
