// src/App.jsx
// Simpler, safer layout: no calc() heights, just flex grow and safe scrolling.
// Wires: tabs + open-in-single id.

import React, { useState } from 'react';
import BottomNav from './components/BottomNav';
import PrayerList from './components/PrayerList';
import SingleView from './components/SingleView';
import CategoryList from './components/CategoryList';

export default function App() {
  const [activeTab, setActiveTab] = useState('daily');
  const [singleTargetId, setSingleTargetId] = useState(null);

  const openInSingle = (prayerId) => {
    setSingleTargetId(prayerId);
    setActiveTab('single');
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'single' && singleTargetId !== null) {
      setSingleTargetId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Main grows and scrolls; we leave bottom padding in children to avoid nav overlap */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'daily' && <PrayerList viewType="daily" onOpenSingle={openInSingle} />}
        {activeTab === 'security' && <PrayerList viewType="security" onOpenSingle={openInSingle} />}
        {activeTab === 'categories' && <CategoryList />}
        {activeTab === 'single' && <SingleView initialPrayerId={singleTargetId} />}
      </main>

      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  );
}
