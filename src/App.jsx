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

// Tutorial
import TutorialModal from './components/TutorialModal';

const TAB_STORAGE_KEY = 'cp:activeTab';
const ONBOARDED_KEY = 'cp:onboarded';

function getInitialTab() {
  const hash = (window.location.hash || '').replace(/^#/, '').trim();
  const candidates = new Set(['daily','single','categories','journal','security','settings','restore']);
  if (hash && candidates.has(hash)) {
    return hash === 'restore' ? 'daily' : hash;
  }
  return localStorage.getItem(TAB_STORAGE_KEY) || 'daily';
}

export default function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [showRestore, setShowRestore] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDED_KEY)) setShowTutorial(true);
    const openTutorial = () => setShowTutorial(true);
    window.addEventListener('ui:showTutorial', openTutorial);
    return () => window.removeEventListener('ui:showTutorial', openTutorial);
  }, []);

  // NEW: listen for programmatic navigation (e.g., tutorial "Open Settings")
  useEffect(() => {
    const onNav = (e) => {
      const tab = e?.detail;
      if (typeof tab === 'string') handleTabChange(tab);
    };
    window.addEventListener('ui:nav', onNav);
    return () => window.removeEventListener('ui:nav', onNav);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hash change for emergency restore
  useEffect(() => {
    const applyHash = () => {
      const h = (window.location.hash || '').toLowerCase();
      if (h === '#restore') setShowRestore(true);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

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

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {showTutorial && (
        <TutorialModal
          onClose={() => {
            localStorage.setItem(ONBOARDED_KEY, '1');
            setShowTutorial(false);
          }}
        />
      )}

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
