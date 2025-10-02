// src/App.jsx
// Simpler, safe layout: main content scrolls; BottomNav stays fixed by its own styles.
// Tabs: Daily, Security, Categories, Single.
// Preserves: open-in-single flow, ErrorBoundary, BottomNav, all existing props.
// Adds: emergency Backup/Restore overlay (hash '#restore') without touching your hidden/easter-egg UI.

import React, { useEffect, useState } from 'react';
import BottomNav from './components/BottomNav';
import PrayerList from './components/PrayerList';
import SingleView from './components/SingleView';
import CategoryList from './components/CategoryList';
import ErrorBoundary from './components/ErrorBoundary';

// NEW (additive): lightweight, self-contained overlay to restore JSON backups
// Trigger by navigating to .../#restore (does not replace your hidden panel).
import EmergencyRestore from './components/EmergencyRestore';

export default function App() {
  // Which tab is active
  const [activeTab, setActiveTab] = useState('daily');

  // If a prayer is opened from Daily in Single view, we carry its id here
  const [singleTargetId, setSingleTargetId] = useState(null);

  // NEW: whether the emergency restore overlay is visible (toggle via URL hash)
  const [showRestore, setShowRestore] = useState(
    typeof window !== 'undefined' && window.location.hash === '#restore'
  );

  // Open a specific prayer in the Single tab
  const openInSingle = (prayerId) => {
    setSingleTargetId(prayerId);
    setActiveTab('single');
  };

  // When switching tabs away from "single", clear the target id to keep logic clean
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'single' && singleTargetId !== null) {
      setSingleTargetId(null);
    }
  };

  // NEW: watch for URL hash changes so visiting #restore opens (and leaving it closes) the overlay
  useEffect(() => {
    const onHash = () => setShowRestore(window.location.hash === '#restore');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      {/* MAIN AREA: We keep padding/margins in child pages so BottomNav doesn’t overlap content */}
      <main className="min-h-screen overflow-hidden">
        <ErrorBoundary>
          {/* Daily tab: editable list with FAB, grouped by category, supports open-in-single */}
          {activeTab === 'daily' && (
            <PrayerList viewType="daily" onOpenSingle={openInSingle} />
          )}

          {/* Security tab: filtered list honoring "security" flag */}
          {activeTab === 'security' && (
            <PrayerList viewType="security" onOpenSingle={openInSingle} />
          )}

          {/* Categories tab: category management with requestors and inline edits */}
          {activeTab === 'categories' && <CategoryList />}

          {/* Single tab: either random eligible request or targeted by id from Daily */}
          {activeTab === 'single' && (
            <SingleView initialPrayerId={singleTargetId} />
          )}
        </ErrorBoundary>
      </main>

      {/* Bottom navigation is shared across all tabs */}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* NEW: Emergency backup/restore overlay; does not replace your hidden/easter-egg UI.
          Open it by visiting the app with `#restore` in the URL. */}
      {showRestore && (
        <EmergencyRestore
          onClose={() => {
            // Remove the hash and hide the overlay
            history.replaceState(null, '', '#');
            setShowRestore(false);
          }}
        />
      )}
    </>
  );
}
