// src/App.jsx
// Root app with bottom navigation, first-run tutorial, and emergency restore.
// Tabs: Daily (grouped), Single, Categories, Journal, Security, Settings.

import React, { useEffect, useState } from 'react';
import BottomNav from './components/BottomNav';
import PrayerList from './components/PrayerList';
import SingleView from './components/SingleView';
import CategoryList from './components/CategoryList';
import JournalList from './components/JournalList';
import ErrorBoundary from './components/ErrorBoundary';
import EmergencyRestore from './components/EmergencyRestore';
import Settings from './components/Settings';

// Tutorial (you've already added TutorialModal.jsx per instructions)
import TutorialModal from './components/TutorialModal';

const TAB_STORAGE_KEY = 'cp:activeTab';
const ONBOARDED_KEY = 'cp:onboarded';

function getInitialTab() {
  // Prefer a valid hash like "#single" → "single"
  const hash = (window.location.hash || '').replace(/^#/, '').trim();
  const candidates = new Set(['daily','single','categories','journal','security','settings','restore']);
  if (hash && candidates.has(hash)) {
    return hash === 'restore' ? 'daily' : hash; // 'restore' only toggles modal
  }
  // Fallback to last tab or default to 'daily'
  return localStorage.getItem(TAB_STORAGE_KEY) || 'daily';
}

export default function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [showRestore, setShowRestore] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // Handle first run tutorial + manual reopen hook
  useEffect(() => {
    if (!localStorage.getItem(ONBOARDED_KEY)) setShowTutorial(true);
    const openTutorial = () => setShowTutorial(true);
    window.addEventListener('ui:showTutorial', openTutorial);
    return () => window.removeEventListener('ui:showTutorial', openTutorial);
  }, []);

  // React to hash changes for emergency restore pane
  useEffect(() => {
    const applyHash = () => {
      const h = (window.location.hash || '').toLowerCase();
      if (h === '#restore') {
        setShowRestore(true);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  // Persist tab and mirror hash (without breaking restore)
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem(TAB_STORAGE_KEY, tab);
    if (tab) {
      const newHash = `#${tab}`;
      if (window.location.hash !== newHash) {
        history.replaceState(null, '', newHash);
      }
    }
  };

  return (
    <>
      {/* Main content area */}
      <main className="min-h-screen bg-gray-900 text-white pb-24">
        <ErrorBoundary>
          {activeTab === 'daily'      && <PrayerList isSecurity={false} />}
          {activeTab === 'single'     && <SingleView />}
          {activeTab === 'categories' && <CategoryList />}
          {activeTab === 'journal'    && <JournalList />}
          {activeTab === 'security'   && <PrayerList isSecurity />}
          {activeTab === 'settings'   && <Settings />}
        </ErrorBoundary>
      </main>

      {/* Bottom navigation fixed to viewport bottom */}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* One-time tutorial modal */}
      {showTutorial && (
        <TutorialModal
          onClose={() => {
            localStorage.setItem(ONBOARDED_KEY, '1');
            setShowTutorial(false);
          }}
        />
      )}

      {/* Emergency restore panel (from #restore) */}
      {showRestore && (
        <EmergencyRestore
          onClose={() => {
            // Clean up the hash so it won't re-open on refresh
            history.replaceState(null, '', '#');
            setShowRestore(false);
          }}
        />
      )}
    </>
  );
}
