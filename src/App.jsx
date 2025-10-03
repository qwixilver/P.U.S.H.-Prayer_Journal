// src/App.jsx
// Adds a Journal tab while preserving your existing layout and behavior.

import React, { useEffect, useState } from 'react';
import BottomNav from './components/BottomNav';
import PrayerList from './components/PrayerList';
import SingleView from './components/SingleView';
import CategoryList from './components/CategoryList';
import ErrorBoundary from './components/ErrorBoundary';
import EmergencyRestore from './components/EmergencyRestore';

// NEW
import JournalList from './components/JournalList';

export default function App() {
  const [activeTab, setActiveTab] = useState('daily');
  const [singleTargetId, setSingleTargetId] = useState(null);
  const [showRestore, setShowRestore] = useState(
    typeof window !== 'undefined' && window.location.hash === '#restore'
  );

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

  useEffect(() => {
    const onHash = () => setShowRestore(window.location.hash === '#restore');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <main className="min-h-screen overflow-hidden">
        <ErrorBoundary>
          {activeTab === 'daily' && (
            <PrayerList viewType="daily" onOpenSingle={openInSingle} />
          )}
          {activeTab === 'security' && (
            <PrayerList viewType="security" onOpenSingle={openInSingle} />
          )}
          {activeTab === 'categories' && <CategoryList />}
          {activeTab === 'journal' && <JournalList />}{/* NEW */}
          {activeTab === 'single' && (
            <SingleView initialPrayerId={singleTargetId} />
          )}
        </ErrorBoundary>
      </main>

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {showRestore && (
        <EmergencyRestore
          onClose={() => {
            history.replaceState(null, '', '#');
            setShowRestore(false);
          }}
        />
      )}
    </>
  );
}
