// src/App.jsx
// Root app with bottom navigation, first-run tutorial, emergency restore,
// and launch-action routing for PWA shortcuts / Android widget deep links.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BottomNav from './components/BottomNav';
import PrayerList from './components/PrayerList';
import SingleView from './components/SingleView';
import CategoryList from './components/CategoryList';
import JournalList from './components/JournalList';
import ErrorBoundary from './components/ErrorBoundary';
import EmergencyRestore from './components/EmergencyRestore';
import Settings from './components/Settings';
import TutorialModal from './components/TutorialModal';

const TAB_STORAGE_KEY = 'cp:activeTab';
const ONBOARDED_KEY = 'cp:onboarded';
const VALID_TABS = new Set([
  'daily',
  'single',
  'categories',
  'journal',
  'security',
  'settings',
  'restore',
]);

const LAUNCH_ACTIONS = {
  'pray-now': { tab: 'single' },
  'add-prayer': { tab: 'daily', eventName: 'ui:addPrayer' },
  'add-journal': { tab: 'journal', eventName: 'ui:addJournal' },
};

function readLocationIntent() {
  const url = new URL(window.location.href);
  const action = url.searchParams.get('action');
  const actionRoute = action ? LAUNCH_ACTIONS[action] : null;
  const hash = url.hash.replace(/^#/, '').trim().toLowerCase();

  if (actionRoute) {
    return {
      tab: actionRoute.tab,
      action,
    };
  }

  if (hash && VALID_TABS.has(hash)) {
    return {
      tab: hash === 'restore' ? 'daily' : hash,
      action: null,
    };
  }

  const savedTab = localStorage.getItem(TAB_STORAGE_KEY);
  return {
    tab: savedTab && VALID_TABS.has(savedTab) ? savedTab : 'daily',
    action: null,
  };
}

function removeLaunchActionFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('action')) return;

  url.searchParams.delete('action');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export default function App() {
  const initialIntent = useMemo(readLocationIntent, []);
  const [activeTab, setActiveTab] = useState(initialIntent.tab);
  const [pendingLaunchAction, setPendingLaunchAction] = useState(initialIntent.action);
  const [showRestore, setShowRestore] = useState(
    () => window.location.hash.toLowerCase() === '#restore'
  );
  const [showTutorial, setShowTutorial] = useState(false);

  const handleTabChange = useCallback((tab) => {
    if (!VALID_TABS.has(tab) || tab === 'restore') return;

    setActiveTab(tab);
    localStorage.setItem(TAB_STORAGE_KEY, tab);

    const url = new URL(window.location.href);
    url.hash = tab;
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDED_KEY)) setShowTutorial(true);

    const openTutorial = () => setShowTutorial(true);
    window.addEventListener('ui:showTutorial', openTutorial);
    return () => window.removeEventListener('ui:showTutorial', openTutorial);
  }, []);

  useEffect(() => {
    const onNav = (event) => {
      const tab = typeof event?.detail === 'string'
        ? event.detail
        : event?.detail?.tab;

      if (typeof tab === 'string') handleTabChange(tab);
    };

    window.addEventListener('ui:nav', onNav);
    return () => window.removeEventListener('ui:nav', onNav);
  }, [handleTabChange]);

  useEffect(() => {
    const applyLocation = () => {
      const hash = window.location.hash.toLowerCase();

      if (hash === '#restore') {
        setShowRestore(true);
        return;
      }

      setShowRestore(false);
      const intent = readLocationIntent();
      setActiveTab(intent.tab);
      localStorage.setItem(TAB_STORAGE_KEY, intent.tab);

      if (intent.action) setPendingLaunchAction(intent.action);
    };

    window.addEventListener('hashchange', applyLocation);
    window.addEventListener('popstate', applyLocation);
    return () => {
      window.removeEventListener('hashchange', applyLocation);
      window.removeEventListener('popstate', applyLocation);
    };
  }, []);

  useEffect(() => {
    if (!pendingLaunchAction) return undefined;

    const route = LAUNCH_ACTIONS[pendingLaunchAction];
    if (!route || route.tab !== activeTab) return undefined;

    const timer = window.setTimeout(() => {
      if (route.eventName) {
        window.dispatchEvent(new CustomEvent(route.eventName, {
          detail: { source: 'launch-action' },
        }));
      }

      removeLaunchActionFromUrl();
      setPendingLaunchAction(null);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeTab, pendingLaunchAction]);

  return (
    <>
      <main className="min-h-screen bg-gray-900 text-white pb-24">
        <ErrorBoundary>
          {activeTab === 'daily' && <PrayerList viewType="daily" />}
          {activeTab === 'single' && <SingleView />}
          {activeTab === 'categories' && <CategoryList />}
          {activeTab === 'journal' && <JournalList />}
          {activeTab === 'security' && <PrayerList viewType="security" />}
          {activeTab === 'settings' && <Settings />}
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
            const url = new URL(window.location.href);
            url.hash = 'daily';
            history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
            setShowRestore(false);
            setActiveTab('daily');
          }}
        />
      )}
    </>
  );
}
