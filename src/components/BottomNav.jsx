// src/components/BottomNav.jsx
// Bottom tab bar: Daily, Single, Categories, Journal, Security
// - High z-index so it stays above content
// - Pointer-events enabled
// - Preserves props: activeTab, onTabChange

import React from 'react';

const TABS = [
  { key: 'daily', label: 'Daily', icon: '🗓️' },
  { key: 'single', label: 'Single', icon: '🎯' },
  { key: 'categories', label: 'Categories', icon: '📂' },
  { key: 'journal', label: 'Journal', icon: '📓' },   // NEW
  { key: 'security', label: 'Security', icon: '🔒' },
];

export default function BottomNav({ activeTab, onTabChange }) {
  const change = (key) => {
    if (typeof onTabChange === 'function') onTabChange(key);
  };

  return (
    <nav
      role="navigation"
      aria-label="Bottom Navigation"
      className="
        fixed bottom-0 inset-x-0
        z-[9999]
        pointer-events-auto
        bg-gray-900/95 backdrop-blur
        border-t border-gray-800
      "
    >
      <div className="max-w-3xl mx-auto flex">
        {TABS.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => change(t.key)}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2',
                'text-xs font-medium',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400',
                active ? 'text-yellow-300' : 'text-gray-300 hover:text-white',
              ].join(' ')}
            >
              <span className="text-base leading-none" aria-hidden="true">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
