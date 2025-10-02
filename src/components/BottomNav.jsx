// src/components/BottomNav.jsx
// Button-only bottom navigation. No anchors, no forms, no URLs.
// Calls onChange('single' | 'daily' | 'categories' | 'security').

import React from 'react';

export default function BottomNav({ active, onChange }) {
  const Item = ({ id, label }) => (
    <button
      type="button"
      onClick={() => onChange?.(id)}
      className={[
        "flex-1 py-3 text-sm font-medium transition",
        active === id ? "text-yellow-400" : "text-gray-300 hover:text-white"
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <nav
      className="
        sticky bottom-0 left-0 right-0
        bg-gray-800 border-t border-gray-700
        flex z-50
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
