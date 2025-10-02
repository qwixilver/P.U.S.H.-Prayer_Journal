// src/components/BottomNav.jsx
// Button-only bottom navigation with emojis to the LEFT of labels.
// - No anchors or forms (prevents reloads on GitHub Pages).
// - Restores emojis for visual affordance.
// - Highlights active tab; keyboard-accessible with focus rings.
// - Uses safe-area padding for modern phones with home indicator.

import React from 'react';

// Simple emoji map (feel free to tweak)
const ICONS = {
  single: '🙏',      // Single view
  daily: '📋',       // Daily list
  categories: '🗂️',  // Categories
  security: '🔒',    // Security list
};

export default function BottomNav({ active, onChange }) {
  const Item = ({ id, label }) => {
    const isActive = active === id;
    return (
      <button
        type="button"
        onClick={() => onChange?.(id)}
        title={label}
        aria-current={isActive ? 'page' : undefined}
        className={[
          'flex-1 px-3 py-3',
          'inline-flex items-center justify-center gap-2',
          'text-sm font-medium transition',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 rounded-md',
          isActive ? 'text-yellow-400' : 'text-gray-300 hover:text-white',
        ].join(' ')}
      >
        <span aria-hidden="true" className="text-base leading-none">{ICONS[id]}</span>
        <span>{label}</span>
      </button>
    );
  };

  return (
    <nav
      className="
        sticky bottom-0 left-0 right-0 z-50
        bg-gray-800 border-t border-gray-700
        flex items-center justify-between
        px-2
        pb-[max(env(safe-area-inset-bottom),0px)]  /* pad for iOS home indicator */
      "
      role="navigation"
      aria-label="Bottom navigation"
    >
      <Item id="single" label="Single" />
      <Item id="daily" label="Daily" />
      <Item id="categories" label="Categories" />
      <Item id="security" label="Security" />
    </nav>
  );
}
