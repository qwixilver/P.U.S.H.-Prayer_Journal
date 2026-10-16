import React, { useState } from 'react';
import BottomNav from './BottomNav';
import CategoryList from './CategoryList';
import PrayerList from './PrayerList';
import SingleView from './SingleView';
import JournalList from './JournalList';
import TutorialModal from './TutorialModal';
import { JournalDatabaseContext } from '../utils/JournalDatabaseContext';
import { createTutorialDatabase } from '../utils/tutorialDatabase';

const STEP_TABS = { welcome: 'daily', categories: 'daily', people: 'categories', requestor: 'categories', daily: 'categories',
  add: 'daily', 'prayer-form': 'daily', details: 'daily', focus: 'daily', context: 'single', 'add-event': 'single',
  'event-form': 'single', next: 'single', journal: 'single', read: 'journal', 'journal-text': 'journal', security: 'journal',
  sharing: 'security', settings: 'security', backup: 'settings', reminders: 'settings', groups: 'settings', finish: 'settings' };

function SettingsPreview() {
  return <div className="p-4 pb-24 space-y-5"><h2 className="text-2xl font-bold">Settings</h2>
    <p className="text-sm text-amber-200">Practice preview. Your settings, backups, and permissions are not changed here.</p>
    <section data-tour="settings-groups" className="rounded-lg bg-gray-800 p-4 space-y-3"><h3 className="text-lg font-semibold">Prayer groups</h3><p>Join a church, submit requests for review, and keep approved prayers available offline.</p><div className="flex flex-wrap gap-2"><button disabled className="rounded bg-blue-600 px-3 py-2">Manage groups</button><button disabled className="rounded bg-emerald-700 px-3 py-2">Refresh all groups</button></div></section>
    <section data-tour="settings-backup" className="rounded-lg bg-gray-800 p-4 space-y-3"><h3 className="text-lg font-semibold">Backup &amp; Restore</h3><p>Keep your own recovery copy before moving devices or clearing browser data. Use Private Vault for encryption.</p><div className="flex flex-wrap gap-2"><button disabled className="rounded bg-blue-600 px-3 py-2">Export JSON</button><button disabled className="rounded bg-gray-600 px-3 py-2">Choose backup</button></div></section>
    <section data-tour="settings-reminders" className="rounded-lg bg-gray-800 p-4 space-y-3"><h3 className="text-lg font-semibold">Notifications &amp; Reminders</h3><p>Choose a gentle reminder, a random prayer, or an ordered cycle. Install the app from your browser for the best device integration.</p><button disabled className="rounded bg-blue-600 px-3 py-2">Test now</button></section>
  </div>;
}

export default function TutorialWorkspace({ onClose }) {
  const [database] = useState(() => createTutorialDatabase(detail => window.dispatchEvent(new CustomEvent('tutorial:write', { detail }))));
  const [tab, setTab] = useState('daily');
  const [focusedPrayerId, setFocusedPrayerId] = useState(null);
  const [revision, setRevision] = useState(0);
  return <JournalDatabaseContext.Provider value={database}>
    <div data-tutorial-workspace className="tutorial-workspace min-h-screen bg-gray-900 text-white">
      <div className="tutorial-practice-label">Practice walkthrough <span>Sample data only</span></div>
      <main key={revision} className="pb-24">
        {tab === 'daily' && <PrayerList key="daily" onFocusPrayer={id => { setFocusedPrayerId(id); setTab('single'); }} />}
        {tab === 'categories' && <CategoryList />}
        {tab === 'single' && <SingleView initialPrayerId={focusedPrayerId} />}
        {tab === 'journal' && <JournalList />}
        {tab === 'security' && <PrayerList key="security" viewType="security" />}
        {tab === 'settings' && <SettingsPreview />}
      </main>
      <BottomNav activeTab={tab} onTabChange={next => { setTab(next); window.scrollTo({ top: 0, behavior: 'auto' }); }} />
    </div>
    <TutorialModal onClose={onClose} onReplayStep={stepId => {
      database.tutorialStage = stepId;
      setTab(STEP_TABS[stepId] || 'daily'); setRevision(value => value + 1);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }} />
  </JournalDatabaseContext.Provider>;
}
