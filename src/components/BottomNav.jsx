// src/components/BottomNav.jsx
// This component renders the persistent bottom navigation bar with four tabs.
// It uses Tailwind CSS for styling and simple emojis as icons. You can replace the emojis
// with any icon library (e.g., Heroicons or Lucide) later if desired.

import React from 'react';

// Define the navigation items: index must match the order in App.jsx views array
const navItems = [
  { index: 0, label: 'Single', icon: '🔀' },       // Single View: random prayer
  { index: 1, label: 'Daily', icon: '📅' },        // Daily List: prayers by date
  { index: 2, label: 'Categories', icon: '📁' },   // Quick List: grouped by category
  { index: 3, label: 'Security', icon: '🔒' },     // Security View: secure prayers
];

/**
 * BottomNav component
 * @param {Object} props
 * @param {number} props.currentIndex - The currently selected tab index
 * @param {function} props.onChange - Callback invoked with new index when a tab is clicked
 */
function BottomNav({ currentIndex, onChange }) {
  return (
    // `fixed bottom-0 left-0 w-full`: positions nav at bottom spanning full width
    // `bg-gray-800 border-t border-gray-700`: dark background with top border
    // `flex justify-around`: evenly spaces child buttons
    <nav className="fixed bottom-0 left-0 w-full bg-gray-800 border-t border-gray-700 flex">
      {navItems.map((item) => (
        // Each button takes equal space (flex-1) and is centered
        <button
          key={item.index}
          onClick={() => onChange(item.index)}
          className={
            `flex flex-col items-center justify-center flex-1 py-2 ` +
            (currentIndex === item.index ? 'text-yellow-500' : 'text-white')
          }
        >
          {/* Icon for the tab */}
          <span className="text-xl">{item.icon}</span>
          {/* Label text under the icon */}
          <span className="text-xs mt-1">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;
